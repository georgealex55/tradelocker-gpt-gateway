// Preserve the frozen kernel and ABI, adding a separate diagnostic entrypoint.
#include "xmi-session-execution.cpp"

extern "C" void replay_diagnostic(
    const double* open, const double* high, const double* low, const double* close,
    const int64_t* minutes, const int32_t* entries, const int32_t* window_ends,
    const int8_t* side, const double* distances, const int32_t* exit_limits,
    const int8_t* entry_allowed, const int32_t* invalidation_exits,
    int32_t count, const FillModel* model, int32_t stop_cooldown_minutes,
    Result* result, Trade* log, int64_t* counters) {
    Result out{};
    out.equity = 1000.0;
    double peak = out.equity;
    int32_t next_allowed = 0;
    int32_t active_window_end = -1;
    int64_t stopped_until = -1;
    int window_trades = 0;
    const double quote_friction = model->spread + 2 * model->slippage;
    const double unit_fee = 2 * model->commission_per_unit_side;
    for (int32_t i = 0; i < count; ++i) {
        const int32_t first = entries[i], window_end = window_ends[i];
        if (first < next_allowed || first > window_end || first > exit_limits[i]) continue;
        if (!entry_allowed[i]) { ++counters[0]; continue; }
        if (minutes[first] < stopped_until) { ++counters[1]; continue; }
        if (window_end != active_window_end) {
            active_window_end = window_end;
            window_trades = 0;
        }
        if (window_trades >= model->trades_per_window) continue;
        const double direction = side[i], entry = open[first], distance = distances[i];
        if (!std::isfinite(distance) || distance <= 0) continue;
        const double stop = entry - direction * distance;
        const double target = entry + direction * distance * model->reward;
        const bool has_target = model->reward > 0;
        if (std::min(stop, target) <= 0) continue;
        const double loss_per_unit = (distance + quote_friction) /
            (model->usd_base ? std::min(entry, stop) : 1.0) + unit_fee;
        const double margin_cap = 0.9 * out.equity * model->leverage /
            (model->usd_base ? 1.0 : entry + model->spread);
        const double raw_units = std::min({out.equity * model->risk / loss_per_unit,
                                           margin_cap, model->unit_cap});
        const double units = std::floor(raw_units / model->unit_step + 1e-10) * model->unit_step;
        if (units < model->unit_step) { ++out.size_skips; continue; }
        const auto net_at = [&](double exit) {
            const double conversion = model->usd_base ? 1.0 / exit : 1.0;
            return units * ((direction * (exit - entry) - quote_friction) * conversion - unit_fee);
        };
        const int32_t last = std::min({window_end, first + model->max_minutes - 1, exit_limits[i]});
        int32_t closed_at = last;
        double exit = close[last];
        int reason = 3;
        int32_t next_signal = i + 1;
        for (int32_t j = first; j <= last; ++j) {
            const bool stop_gap = direction * (open[j] - stop) <= 0;
            const bool target_gap = has_target && direction * (open[j] - target) >= 0;
            // The pending signal was known before this minute opened. Never
            // inspect this minute's later range when filling that market exit.
            if (j > first && j == invalidation_exits[i] && !stop_gap && !target_gap) {
                exit = open[j]; reason = 6; closed_at = j;
                out.drawdown = std::max(out.drawdown, (peak - out.equity - net_at(exit)) / peak);
                ++counters[2];
                break;
            }
            const double adverse = direction > 0 ? low[j] : high[j];
            const double favorable = direction > 0 ? high[j] : low[j];
            const bool touched_stop = direction * (adverse - stop) <= 0;
            const bool touched_target = has_target && direction * (favorable - target) >= 0;
            const double worst = stop_gap ? open[j] : target_gap ? target : touched_stop ? stop : adverse;
            out.drawdown = std::max(out.drawdown, (peak - out.equity - net_at(worst)) / peak);
            if (stop_gap || target_gap || touched_stop || touched_target) {
                const bool stopped = stop_gap || (!target_gap && touched_stop);
                exit = stopped ? (stop_gap ? open[j] : stop) : target;
                reason = stopped ? 1 : 2; closed_at = j;
                if (!stop_gap && !target_gap && touched_stop && touched_target) ++out.ambiguous_count;
                break;
            }
            if (out.drawdown >= model->max_drawdown) {
                exit = adverse; reason = 4; closed_at = j; break;
            }
            peak = std::max(peak, out.equity + net_at(close[j]));
            // All original signal rows remain visible even if a new entry
            // distance filter rejects filling that opposite signal.
            if (model->exit_on_flip) {
                while (next_signal < count && entries[next_signal] < j + 1) ++next_signal;
                if (next_signal < count && entries[next_signal] == j + 1 &&
                    window_ends[next_signal] == window_end && side[next_signal] != direction) {
                    exit = close[j]; reason = 5; closed_at = j; break;
                }
            }
        }
        const double net = net_at(exit);
        const double cost = units * (quote_friction / (model->usd_base ? exit : 1.0) + unit_fee);
        const double r = net / (loss_per_unit * units);
        if (log) log[static_cast<int32_t>(out.trade_count)] = {net, r, units, cost, first, closed_at, side[i], reason};
        out.equity += net;
        out.gross_profit += std::max(0.0, net);
        out.gross_loss += std::max(0.0, -net);
        out.r_total += r; out.cost += cost; out.win_count += net > 0;
        ++out.trade_count; ++window_trades;
        out.stop_count += reason == 1; out.target_count += reason == 2;
        out.time_count += reason == 3; out.risk_exits += reason == 4; out.flip_exits += reason == 5;
        peak = std::max(peak, out.equity);
        out.drawdown = std::max(out.drawdown, (peak - out.equity) / peak);
        next_allowed = closed_at + 1 + model->cooldown_minutes;
        if (reason == 1 && stop_cooldown_minutes > 0)
            stopped_until = minutes[closed_at] + 1 + stop_cooldown_minutes;
        if (out.drawdown >= model->max_drawdown) { out.halted = 1; break; }
    }
    *result = out;
}

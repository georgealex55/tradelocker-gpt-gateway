#!/usr/bin/env python3
"""Fixed gold entry/exit experiments with conservative trade-excursion audits."""
import argparse
from collections import Counter, defaultdict
import ctypes as ct
from importlib import import_module
import json
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile

import numpy as np

screen = import_module("xmi-session-calendar-screen")
refinement = import_module("xmi-session-news-refinement")
research = screen.research
COSTS = (1., 1.5, 2.)
REASONS = {1: "stop", 2: "target", 3: "time_or_lane_or_news", 4: "risk_halt", 5: "opposite_signal", 6: "early_ema_open"}


def build_kernel(directory):
    source = Path(__file__).with_suffix(".cpp")
    key = research.digest({"diagnostic": research.file_hash(source), "original": research.file_hash(research.SOURCE_FILES[1])})
    target = directory / f"entry-exit-{key[:16]}.so"
    if not target.exists():
        with NamedTemporaryFile(dir=directory, suffix=".so", delete=False) as file:
            temp = Path(file.name)
        try:
            subprocess.run(["g++", "-std=c++17", "-O3", "-Wall", "-Wextra", "-Werror", "-shared", "-fPIC",
                            str(source), "-o", str(temp)], check=True)
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)
    return target.resolve()


def configure_kernel(library):
    library.replay_diagnostic.argtypes = [ct.c_void_p] * 12 + [ct.c_int32, ct.POINTER(research.FillModel), ct.c_int32,
        ct.POINTER(research.Result), ct.POINTER(research.Trade), ct.c_void_p]
    library.replay_diagnostic.restype = None


def next_invalidations(times, frame, first, side):
    exits = np.full(len(first), -1, dtype=np.int32)
    for direction, signals in ((1, research.cross(frame.ema(10), frame.c)), (-1, research.cross(frame.c, frame.ema(10)))):
        valid = signals & (frame.next < len(times))
        rows = np.flatnonzero(valid)
        rows = rows[times[frame.next[rows]] == frame.decision[rows]]
        if not len(rows):
            continue
        locations = np.flatnonzero(side == direction)
        future = np.searchsorted(frame.decision[rows], times[first[locations]], side="right")
        ready = future < len(rows)
        exits[locations[ready]] = frame.next[rows[future[ready]]]
    return exits


def audit_case(study, variant, case, trades):
    frame = study.frames[variant.minutes]
    ema = frame.ema(10)
    crossings = {1: set(map(int, frame.decision[research.cross(ema, frame.c)])),
                 -1: set(map(int, frame.decision[research.cross(frame.c, ema)]))}
    stopped_until = -1
    for trade in trades:
        at = trade['entry_minute']
        if at < stopped_until:
            raise ValueError('A fill violated the clock-based stop cooldown')
        if case['entry_max_ema_distance_atr'] is not None:
            row = int(np.searchsorted(frame.decision, at))
            if frame.decision[row] != at or abs(frame.c[row] - ema[row]) > case['entry_max_ema_distance_atr'] * frame.core()['atr'][row]:
                raise ValueError('A fill violated the closed-signal entry distance cap')
        if trade['exit_reason'] == 6:
            if (not case['exit_on_fast_ema_cross'] or trade['exit_minute'] <= at
                    or trade['exit_minute'] not in crossings[trade['side']]):
                raise ValueError('An invalidation exit lacks a later closed-candle signal')
        if case['stop_cooldown_minutes'] and trade['exit_reason'] == 1:
            stopped_until = trade['exit_minute'] + 1 + case['stop_cooldown_minutes']


class DiagnosticStudy(screen.CalendarStudy):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        configure_kernel(self.library)

    def run_case(self, variant, fold, case, stress=1., step=1.):
        if self.symbol != "XAUUSD" or variant.rule != "trend-momentum" or variant.minutes != 15:
            raise ValueError("This diagnostic is restricted to the preregistered gold momentum benchmark")
        start, end = np.searchsorted(self.t, [research.utc_minute(fold[1]), research.utc_minute(fold[2])])
        first, last, side, atr, structure, limit = self.plan(variant)
        if structure is not None:
            raise ValueError("Unexpected structural stop override")
        a, b = np.searchsorted(first, [start, end])
        first, last, side, atr, limit = (np.ascontiguousarray(x[a:b]) for x in (first, last, side, atr, limit))
        last = np.minimum(last, end - 1).astype(np.int32)
        stop = np.ascontiguousarray(variant.stop_atr * atr)
        model, result = research.money_model(self.symbol, variant, stress, step), research.Result()
        cost_in_price = model.spread + 2 * model.slippage + 2 * model.commission_per_unit_side
        stop = np.ascontiguousarray(np.where(stop >= variant.min_stop_to_cost * cost_in_price, stop, np.nan))
        allowed = np.ones(len(first), dtype=np.int8)
        frame = self.frames[variant.minutes]
        if case["entry_max_ema_distance_atr"] is not None:
            row = np.searchsorted(frame.decision, self.t[first])
            if np.any(row >= len(frame.t)) or np.any(frame.decision[row] != self.t[first]):
                raise ValueError("Entry does not follow an exact closed decision candle")
            allowed = np.ascontiguousarray((np.abs(frame.c[row] - frame.ema(10)[row]) <=
                                           case["entry_max_ema_distance_atr"] * atr).astype(np.int8))
        invalidations = next_invalidations(self.t, frame, first, side) if case["exit_on_fast_ema_cross"] else np.full(len(first), -1, dtype=np.int32)
        counters = np.zeros(3, dtype=np.int64)
        log = (research.Trade * len(first))()
        self.library.replay_diagnostic(*self.price_ptrs, research.pointer(self.t), research.pointer(first), research.pointer(last),
            research.pointer(side), research.pointer(stop), research.pointer(limit), research.pointer(allowed),
            research.pointer(invalidations), len(first), ct.byref(model), case["stop_cooldown_minutes"], ct.byref(result), log,
            research.pointer(counters))
        metrics = research.metrics(result)
        metrics["eligible_window_signals"] = len(first)
        trades = [{"entry_minute": int(self.t[t.entry]), "exit_minute": int(self.t[t.exit]), "pnl_usd": t.net,
                   "r": t.r, "units": t.units, "cost_usd": t.cost, "side": t.side, "exit_reason": t.reason}
                  for t in log[:int(result.trade_count)]]
        self.audit_trades(trades)
        audit_case(self, variant, case, trades)
        diagnostics = {"entry_filter_candidate_skips": int(counters[0]), "stop_cooldown_candidate_skips": int(counters[1]),
                       "early_ema_exits": int(counters[2]), "entry_filter_rejected_signal_rows": int((allowed == 0).sum())}
        return {"metrics": metrics, "diagnostics": diagnostics, "trade_ledger_sha256": research.digest(trades)}, trades


def excursion_summary(records):
    def quantiles(key):
        return {name: round(float(np.quantile([r[key] for r in records], q)), 6)
                for name, q in (("p25", .25), ("median", .5), ("p75", .75), ("p90", .9))} if records else None
    losses = [r for r in records if r["pnl_usd"] < 0]
    reasons = {}
    for reason in sorted({r["exit_reason"] for r in records}):
        group = [r for r in records if r["exit_reason"] == reason]
        reasons[REASONS[reason]] = {"n": len(group), "net_usd": round(sum(r["pnl_usd"] for r in group), 6),
                                   "cost_usd": round(sum(r["cost_usd"] for r in group), 6)}
    return {"n": len(records), "losses": len(losses), "mfe_price_r": quantiles("mfe_price_r"),
            "mae_price_r": quantiles("mae_price_r"), "cost_price_r": quantiles("cost_price_r"),
            "entry_ema_distance_atr": quantiles("entry_ema_distance_atr"),
            "losers_with_observed_mfe_at_least_half_r": sum(r["mfe_price_r"] >= .5 for r in losses),
            "losers_with_observed_mfe_at_least_one_r": sum(r["mfe_price_r"] >= 1 for r in losses),
            "losers_with_positive_modeled_net_excursion": sum(r["best_modeled_net_usd"] > 0 for r in losses),
            "exit_reason_groups": reasons,
            "long": {"n": sum(r['side'] == 1 for r in records), "net_usd": round(sum(r['pnl_usd'] for r in records if r['side'] == 1), 6)},
            "short": {"n": sum(r['side'] == -1 for r in records), "net_usd": round(sum(r['pnl_usd'] for r in records if r['side'] == -1), 6)}}


def excursions(study, variant, trades):
    frame = study.frames[15]
    records = []
    for trade in trades:
        left, exit_index = np.searchsorted(study.t, [trade['entry_minute'], trade['exit_minute']])
        row = int(np.searchsorted(frame.decision, trade['entry_minute']))
        distance = float(variant.stop_atr * frame.core()['atr'][row])
        entry, side = float(study.prices[0, left]), trade['side']
        # A stop/target minute has unknown intraminute ordering. Use only prior
        # fully held minutes plus the known fill endpoint, never its later range.
        right = exit_index + 1 if trade['exit_reason'] in (3, 5) else exit_index
        good_prices = study.prices[1 if side > 0 else 2, left:right]
        bad_prices = study.prices[2 if side > 0 else 1, left:right]
        endpoint_move = (trade['pnl_usd'] + trade['cost_usd']) / trade['units']
        favorable = max(0., endpoint_move, float(np.max(side * (good_prices - entry))) if right > left else 0.)
        adverse = max(0., -endpoint_move, float(np.max(side * (entry - bad_prices))) if right > left else 0.)
        hit_times = {}
        for label, multiple in (("half_r", .5), ("one_r", 1.)):
            hits = np.flatnonzero(side * (good_prices - entry) >= multiple * distance)
            stamp = int(study.t[left + hits[0]] + 1 - trade['entry_minute']) if len(hits) else None
            if stamp is None and endpoint_move >= multiple * distance:
                stamp = int(trade['exit_minute'] + 1 - trade['entry_minute'])
            hit_times[label] = stamp
        records.append({**trade, "mfe_price_r": favorable / distance, "mae_price_r": adverse / distance,
                        "cost_price_r": trade['cost_usd'] / (trade['units'] * distance),
                        "best_modeled_net_usd": trade['units'] * favorable - trade['cost_usd'],
                        "entry_ema_distance_atr": float(abs(frame.c[row] - frame.ema(10)[row]) / frame.core()['atr'][row]),
                        "time_to_progress_upper_bound_minutes": hit_times,
                        "exit_bar_range_included": trade['exit_reason'] in (3, 5)})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cache', 'calendar', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output exists; preserve the previous batch')
    root = Path(__file__).resolve().parents[1]
    source_path = root/'docs/xmi-session-news-refinement-20261107.json'
    source = json.loads(source_path.read_text())
    benchmark = source['symbols']['XAUUSD']['benchmarks']['intraday']
    catalog_path = root/'docs/xmi-session-entry-exit-candidates-20261107.json'
    catalog = json.loads(catalog_path.read_text())
    calendar = screen.controls.load_calendar(args.calendar)
    if source['source'] != research.source_identity() or source['calendar_sha256'] != research.file_hash(args.calendar):
        raise ValueError('Frozen price engine or calendar changed')
    for archive in source['symbols']['XAUUSD']['archives']:
        if research.file_hash(args.cache/f"xauusd-{archive['year']}.zip") != archive['archive_sha256']:
            raise ValueError('Gold source archive changed')
    args.output.mkdir(parents=True)
    provenance = {'catalog': catalog, 'catalog_sha256': research.file_hash(catalog_path), 'source': research.source_identity(),
                  'source_summary_sha256': research.file_hash(source_path), 'calendar_sha256': research.file_hash(args.calendar),
                  'kernel_sha256': research.file_hash(Path(__file__).with_suffix('.cpp')),
                  'wrapper_sha256': research.file_hash(Path(__file__)), 'benchmark_config_id': benchmark['config_id'],
                  'validation_evaluated_in_this_batch': False, 'holdout_archives_read': False}
    research.write_json(args.output/'preregistration.json', provenance)
    restrictions = screen.controls.build_profiles('XAUUSD', calendar,
        json.loads((root/'docs/xmi-session-calendar-rerun-2022-2024.json').read_text())['event_settings'],
        False, period=screen.PERIOD)['news+rollover']
    study = DiagnosticStudy(args.cache, 'XAUUSD', research.DEVELOPMENT, build_kernel(args.output),
                            [benchmark['variant']['window']], restrictions=restrictions)
    if study.manifest != source['symbols']['XAUUSD']['archives']:
        raise ValueError('Normalized gold audit changed')
    variant = research.Variant(**benchmark['variant']); step = benchmark['step_oz'] or 1.
    cases = catalog['variants']; training = {}; validation = {}; ledgers = []; diagnostic_records = []
    parity = 0

    def evaluate(case, fold, cost, index):
        nonlocal parity
        result, trades = study.run_case(variant, fold, case, cost, step)
        if case['id'] == 'baseline':
            original = research.Study.run(study, variant, fold, stress=cost, gold_step=step, retain=True)
            original_trades = original.pop('trades')
            expected = (benchmark['training_cases']['strict_60_30'][str(cost)][index] if index < 2 else
                        benchmark['reused_validation_cases']['strict_60_30'][str(cost)]['folds'][index - 2])
            if result['metrics'] != original or original != expected or trades != original_trades:
                raise ValueError('Diagnostic kernel baseline differs from the frozen original')
            parity += 1
        ledgers.append({'case': case['id'], 'fold': fold[0], 'cost_multiplier': cost, 'trades': trades})
        return result, trades

    # Diagnose the original training trades before executing any alternative.
    baseline = cases[0]
    training['baseline'] = {}
    for cost in COSTS:
        values = []
        for index, fold in enumerate(research.FOLDS[:2]):
            result, trades = evaluate(baseline, fold, cost, index); values.append(result)
            if cost == 1.:
                diagnostic_records.extend({**r, 'fold': fold[0]} for r in excursions(study, variant, trades))
        training['baseline'][str(cost)] = values
    diagnostics = {'policy': 'Strict original calendar', 'scope': 'Baseline 2022-2023 at modeled base costs',
                   'excursion_definition': 'Conservative price-R bounds from fully held minutes and known fill endpoints; exclude unknown exit-minute ranges.',
                   'time_definition': 'Time-to-progress observations are minute-close upper bounds, not invented tick timestamps.',
                   'summary': excursion_summary(diagnostic_records),
                   'by_year': {f[0]: excursion_summary([r for r in diagnostic_records if r['fold'] == f[0]]) for f in research.FOLDS[:2]}}
    research.write_json(args.output/'training-excursions.json', diagnostics)
    for case in cases[1:]:
        training[case['id']] = {str(cost): [evaluate(case, fold, cost, index)[0]
            for index, fold in enumerate(research.FOLDS[:2])] for cost in COSTS}
    selection_cases = {identifier: {cost: [r['metrics'] for r in folds] for cost, folds in costs.items()}
                       for identifier, costs in training.items()}
    requirements = json.loads((root/'docs/xmi-session-news-policy-candidates-20261107.json').read_text())['selection']['requirements_every_training_year_and_cost']
    selected = refinement.select_training(selection_cases, cases, requirements)
    freeze = {'training_cases': training, 'selection': selected,
              'preregistration_sha256': research.file_hash(args.output/'preregistration.json'),
              'training_excursions_sha256': research.file_hash(args.output/'training-excursions.json'),
              'validation_evaluated_in_this_batch': False, 'holdout_archives_read': False}
    research.write_json(args.output/'training-selection-freeze.json', freeze)
    for case in cases:
        costs = {}
        for cost in COSTS:
            rows, logs = [], []
            for index, fold in enumerate(research.FOLDS[2:], 2):
                result, trades = evaluate(case, fold, cost, index); rows.append(result); logs.extend(trades)
            digest = research.digest(logs)
            if case['id'] == 'baseline' and digest != benchmark['trade_log_sha256'][f'strict_60_30/{cost}']:
                raise ValueError('Saved validation trade ledger changed')
            costs[str(cost)] = {'folds': rows, 'aggregate': refinement.aggregate([r['metrics'] for r in rows]),
                               'trade_ledger_sha256': digest}
        validation[case['id']] = costs
    result = {'purpose': 'Fixed gold entry/exit diagnostic batch', **provenance, 'starting_equity_usd': 1000,
              'benchmark': {'symbol': 'XAUUSD', 'variant': benchmark['variant'], 'step_oz': step},
              'training_cases': training, 'training_excursions': diagnostics, 'training_selection': selected,
              'training_selection_freeze_sha256': research.file_hash(args.output/'training-selection-freeze.json'),
              'reused_validation_cases': validation, 'account_cases': 48, 'additional_original_kernel_parity_replays': parity,
              'baseline_validation_ledger_digests_matched': 3, '2024_status': 'Previously used development evidence; not untouched out-of-sample',
              'qualified_strategies': 0, 'production_changed': False, 'holdout_archives_read': False,
              'validation_evaluated_in_this_batch': True, 'variant_selector_used_validation': False,
              'filled_entry_caps_early_exit_signals_and_clock_cooldowns_audited': True,
              'audited_candidate_trades': sum(len(l['trades']) for l in ledgers), 'gold_archives': study.manifest,
              'session_coverage': study.sessions[variant.window].coverage}
    research.write_json(args.output/'results.json', result)
    research.write_json(args.output/'private-ledgers.json', {'simulated_ledgers': ledgers, 'training_excursion_records': diagnostic_records})
    print(json.dumps({'selection': selected, 'baseline_parity_accounts': parity, 'trade_audits': result['audited_candidate_trades'],
                      'training_excursions': diagnostics['summary'],
                      'validation': {k: {cost: c['aggregate'] for cost, c in v.items()} for k, v in validation.items()},
                      'results_sha256': research.file_hash(args.output/'results.json')}), flush=True)


if __name__ == '__main__':
    main()

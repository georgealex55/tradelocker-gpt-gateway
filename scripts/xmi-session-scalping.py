#!/usr/bin/env python3
"""Bounded, registered scalp research and causal entry-condition diagnostics."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import ctypes as ct
from dataclasses import asdict
import gzip
from importlib import import_module
import io
from itertools import product
import json
from pathlib import Path

import numpy as np
import pandas as pd

screen = import_module('xmi-session-calendar-screen')
refinement = import_module('xmi-session-news-refinement')
r = screen.research
ROOT = Path(__file__).resolve().parents[1]
COSTS = (1., 1.5, 2.)


def variants(catalog):
    """No market-condition attribution result enters this fixed inventory."""
    for window in catalog['windows']:
        rules = [(rule, 0) for rule in catalog['common_rules']]
        rules += [(v['rule'], v['parameter']) for v in catalog['lane_rules'][r.lane_for(window)]]
        for (rule, parameter), minutes, hold, risk in product(rules, catalog['decision_bar_minutes'],
                catalog['maximum_holding_minutes'], catalog['risk_fractions']):
            yield r.Variant(rule, minutes, window, risk, catalog['stop_atr14_multiple'],
                            catalog['target_stop_multiple'], hold, parameter)


def normalized_history(cache, normalized, symbol, expected):
    """Private immutable cache; validate both source ZIPs and normalized arrays."""
    for archive in expected:
        if r.file_hash(cache / f"{symbol.lower()}-{archive['year']}.zip") != archive['archive_sha256']:
            raise ValueError(f'Original {symbol} archive changed')
    identity = r.digest({'archives': expected, 'loader_sha256': r.source_identity()['xmi-session-research.py']})
    directory = normalized / f'{symbol}-{identity[:16]}'
    manifest = directory / 'manifest.json'
    if not directory.exists():
        directory.mkdir(parents=True)
        times, prices, audit = r.read_history(cache, symbol, r.DEVELOPMENT)
        if audit != expected:
            raise ValueError('Normalized source audit differs from committed evidence')
        np.save(directory / 'times.npy', times, allow_pickle=False)
        np.save(directory / 'bid-ohlc.npy', prices, allow_pickle=False)
        r.write_json(manifest, {'input_id': identity, 'archives': audit,
            'normalized_sha256': {n: r.file_hash(directory / n) for n in ('times.npy', 'bid-ohlc.npy')}})
    if not manifest.exists():
        raise ValueError('Incomplete normalized cache; do not overwrite it')
    record = json.loads(manifest.read_text())
    if record['input_id'] != identity or record['archives'] != expected:
        raise ValueError('Normalized cache identity changed')
    for name, digest in record['normalized_sha256'].items():
        if r.file_hash(directory / name) != digest:
            raise ValueError('Normalized cache content changed')
    times, prices = [np.load(directory / n, mmap_mode='r', allow_pickle=False) for n in ('times.npy', 'bid-ohlc.npy')]
    return times, prices, record


def clock_limits(times, first, last, limits, hold, fold_end):
    if hold not in (5, 10, 15):
        raise ValueError('A scalp must have a registered holding cap <= 15 minutes')
    clock_end = np.searchsorted(times, times[first] + hold, side='left') - 1
    return np.ascontiguousarray(np.minimum.reduce((limits, last, clock_end,
                                np.full(len(first), fold_end - 1)))).astype(np.int32)


def scalar_group(value, thresholds, names):
    if not np.isfinite(value):
        return 'unavailable'
    return names[int(np.searchsorted(thresholds, value, side='right'))]


def entry_features(study, variant, trades, volatility_edges):
    frame = study.frames[variant.minutes]
    features = []
    for trade in trades:
        at = trade['entry_minute']
        row = int(np.searchsorted(frame.decision, at, side='right') - 1)
        if row < 0 or frame.decision[row] != at:
            raise ValueError('Entry lacks an exact fully closed decision candle')
        core = frame.core()
        atr, adx = float(core['atr'][row]), float(core['adx'][row])
        volatility = atr / float(frame.c[row]) * 10000
        price_risk = variant.stop_atr * atr * trade['units']
        cost_r = trade['cost_usd'] / price_risk
        local = pd.Timestamp(at, unit='m', tz='UTC').tz_convert('America/New_York')
        features.append({**trade, 'signal_closed_minute': int(frame.decision[row]),
            'adx14': adx, 'atr14_basis_points': volatility, 'cost_to_initial_price_stop': cost_r,
            'adx_group': scalar_group(adx, (20, 25), ('below_20', '20_to_25', '25_and_above')),
            'volatility_group': scalar_group(volatility, volatility_edges, ('low', 'middle', 'high')),
            'cost_group': scalar_group(cost_r, (.1, .2), ('below_0.1R', '0.1_to_0.2R', '0.2R_and_above')),
            'new_york_hour': str(local.hour), 'direction': 'long' if trade['side'] > 0 else 'short'})
    return features


def group_summary(records):
    def summary(rows):
        net = sum(x['pnl_usd'] for x in rows)
        cost = sum(x['cost_usd'] for x in rows)
        gain = sum(max(0., x['pnl_usd']) for x in rows)
        loss = sum(max(0., -x['pnl_usd']) for x in rows)
        return {'n': len(rows), 'losses': sum(x['pnl_usd'] < 0 for x in rows),
                'net_usd': round(net, 6), 'gross_before_cost_usd': round(net + cost, 6),
                'cost_usd': round(cost, 6), 'expectancy_usd': round(net / len(rows), 6) if rows else None,
                'profit_factor': round(gain / loss, 6) if loss else None}
    groups = {}
    for key in ('adx_group', 'volatility_group', 'cost_group', 'new_york_hour', 'direction', 'fold'):
        groups[key] = {value: summary([x for x in records if x[key] == value])
                       for value in sorted({x[key] for x in records})}
    return {'all': summary(records), 'groups': groups}


class ScalpStudy(screen.CalendarStudy):
    def __init__(self, cache, normalized, symbol, executable, windows, restrictions, expected):
        self.symbol = symbol
        self.t, self.prices, self.normalized_record = normalized_history(cache, normalized, symbol, expected)
        self.manifest = self.normalized_record['archives']
        self.frames = {m: r.Frame(self.t, self.prices, m) for m in (1, 5, 15, 60)}
        self.sessions = {window: r.Session(self.t, window) for window in windows}
        self.signal_cache, self.control_cache = {}, {}
        self.controlled, self.restrictions = True, restrictions
        self.legacy_signals = None
        self.library = ct.CDLL(str(executable))
        self.library.replay.argtypes = [ct.c_void_p] * 9 + [ct.c_int32, ct.POINTER(r.FillModel),
            ct.POINTER(r.Result), ct.POINTER(r.Trade)]
        self.library.replay.restype = None
        self.price_ptrs = tuple(r.pointer(x) for x in self.prices)

    def run_scalp(self, variant, fold, stress):
        if variant.minutes not in (1, 5) or variant.hold_minutes not in (5, 10, 15):
            raise ValueError('Only registered strict scalp timeframes and holding caps are allowed')
        begin, end = np.searchsorted(self.t, [r.utc_minute(fold[1]), r.utc_minute(fold[2])])
        first, last, side, atr, structure, limits = self.plan(variant)
        if structure is not None:
            raise ValueError('Unregistered structural stop override')
        a, b = np.searchsorted(first, [begin, end])
        first, last, side, atr, limits = (np.ascontiguousarray(x[a:b]) for x in (first, last, side, atr, limits))
        limits = clock_limits(self.t, first, last, limits, variant.hold_minutes, end)
        stop = np.ascontiguousarray(variant.stop_atr * atr)
        model = r.money_model(self.symbol, variant, stress, 1.)
        # Uniform bracket/time exits avoid any same-close opposite-signal fill.
        model.exit_on_flip = 0
        result, log = r.Result(), (r.Trade * len(first))()
        self.library.replay(*self.price_ptrs, r.pointer(first), r.pointer(last), r.pointer(side),
            r.pointer(stop), r.pointer(limits), len(first), ct.byref(model), ct.byref(result), log)
        trades = [{'entry_minute': int(self.t[x.entry]), 'exit_minute': int(self.t[x.exit]),
                   'pnl_usd': x.net, 'r': x.r, 'units': x.units, 'cost_usd': x.cost,
                   'side': x.side, 'exit_reason': x.reason} for x in log[:int(result.trade_count)]]
        metrics = r.metrics(result)
        audits = self.audit_scalps(variant, model, first, stop, trades)
        return {'metrics': metrics, 'audits': audits, 'trade_ledger_sha256': r.digest(trades)}, trades

    def audit_scalps(self, variant, model, entries, stops, trades):
        self.audit_trades(trades)
        frame, session = self.frames[variant.minutes], self.sessions[variant.window]
        equity, previous_exit, breaches, max_hold = 1000., -1, 0, 0
        for trade in trades:
            entry, exit = np.searchsorted(self.t, [trade['entry_minute'], trade['exit_minute']])
            position = int(np.searchsorted(entries, entry))
            if position >= len(entries) or entries[position] != entry:
                raise ValueError('Fill is not in the controlled signal plan')
            row = int(np.searchsorted(frame.decision, self.t[entry]))
            if row >= len(frame.t) or frame.decision[row] != self.t[entry]:
                raise ValueError('Fill uses an unclosed signal')
            duration_bound = int(self.t[exit] + 1 - self.t[entry])
            if duration_bound > variant.hold_minutes or duration_bound < 1:
                raise ValueError('Scalp exceeded its hard clock holding cap')
            if trade['entry_minute'] <= previous_exit or exit > session.end[entry]:
                raise ValueError('Overlapping trades or a lane cutoff violation')
            max_hold = max(max_hold, duration_bound)
            previous_exit = trade['exit_minute']
            units, direction, initial = trade['units'], trade['side'], float(self.prices[0, entry])
            margin = units * (1. if model.usd_base else initial + model.spread) / model.leverage
            if units < model.unit_step or abs(units / model.unit_step - round(units / model.unit_step)) > 1e-8:
                raise ValueError('Fill violates unit minimum or step')
            if margin > .9 * equity + 1e-7:
                raise ValueError('Fill exceeds reserved margin limit')
            distance = stops[position]
            stop, target = initial - direction * distance, initial + direction * distance * model.reward
            quotes = self.prices[0, entry:exit + 1]
            adverse = self.prices[2 if direction > 0 else 1, entry:exit + 1]
            stop_gap = direction * (quotes - stop) <= 0
            target_gap = direction * (quotes - target) >= 0
            stop_touch = direction * (adverse - stop) <= 0
            # Exactly mirror the kernel's gap-before-range and stop-first bounds.
            worst = np.where(stop_gap, quotes, np.where(target_gap, target, np.where(stop_touch, stop, adverse)))
            pnl = units * ((direction * (worst - initial) - model.spread - 2 * model.slippage) /
                          (worst if model.usd_base else 1.) - 2 * model.commission_per_unit_side)
            breaches += int(np.min(equity + pnl) <= .5 * margin)
            equity += trade['pnl_usd']
        if abs(equity - 1000. - sum(x['pnl_usd'] for x in trades)) > 1e-7:
            raise ValueError('Account equity reconciliation failed')
        return {'audited_trades': len(trades), 'maximum_elapsed_holding_upper_bound_minutes': max_hold,
                'liquidation_audit_breaches': breaches, 'bankrupt': equity <= 0}


def make_study(symbol, args, source, executable, catalog):
    calendar = screen.controls.load_calendar(Path(args['calendar']))
    controls = screen.controls.build_profiles(symbol, calendar, source['event_settings'], False,
                                              period=screen.PERIOD)['news+rollover']
    if controls.coverage_missing:
        raise ValueError(f'Incomplete calendar for {symbol}')
    return ScalpStudy(Path(args['cache']), Path(args['normalized']), symbol, executable,
        catalog['windows'], controls, source['symbols'][symbol]['archives'])


def attribution(study, output):
    old = json.loads((ROOT / 'docs/xmi-session-entry-exit-20261107.json').read_text())
    variant = r.Variant(**old['benchmark']['variant'])
    frame = study.frames[15]
    nexts = np.minimum(frame.next, len(study.t) - 1)
    fit = ((frame.decision >= r.utc_minute('2022-01-01')) &
           (frame.decision < r.utc_minute('2023-01-01')) &
           (study.sessions[variant.window].begin[nexts] >= 0) &
           (study.t[nexts] == frame.decision) & np.isfinite(frame.core()['atr']))
    edges = np.quantile(frame.core()['atr'][fit] / frame.c[fit] * 10000, (.25, .75))
    records = []
    for fold in r.FOLDS[:2]:
        original = r.Study.run(study, variant, fold, retain=True)
        trades = original.pop('trades')
        expected = old['training_cases']['baseline']['1.0'][0 if fold[0] == 'train_2022' else 1]
        if original != expected['metrics'] or r.digest(trades) != expected['trade_ledger_sha256']:
            raise ValueError('Prior gold training ledger did not reproduce')
        study.audit_trades(trades)
        records.extend({**x, 'fold': fold[0]} for x in entry_features(study, variant, trades, edges))
    result = {'scope': 'Prior intraday benchmark training, not strict scalp results',
              'benchmark': old['benchmark'], 'entry_features_only': True,
              'volatility_fit': {'year': 2022, 'complete_decision_bars': int(fit.sum()),
                  'basis': 'ATR14 / closed signal price * 10000', 'q25_q75': edges.tolist()},
              **group_summary(records), 'ledger_and_entry_features_sha256': r.digest(records),
              'interpretation': 'Descriptive overlapping stratifications, not causal proof or optimized filters'}
    r.write_json(output / 'training-loss-conditions.json', result)
    r.write_json(output / 'private-training-entry-features.json', records)
    return result


def candidate_score(row, requirements):
    cases = [v for folds in row['training'].values() for v in folds]
    passed = all(x['metrics']['n'] >= requirements['minimum_completed_trades']
                 and x['metrics']['net_usd'] > requirements['net_pnl_strictly_above_usd']
                 and x['metrics']['profit_factor'] is not None
                 and x['metrics']['profit_factor'] > requirements['profit_factor_strictly_above']
                 and x['metrics']['max_drawdown'] < requirements['max_equity_drawdown_strictly_below']
                 and not x['metrics']['halted'] and not x['audits']['bankrupt']
                 and x['audits']['liquidation_audit_breaches'] == 0 for x in cases)
    base = row['training']['1.0']
    sampled = all(x['metrics']['n'] >= requirements['minimum_completed_trades'] for x in base)
    return (passed, sampled, min(x['metrics']['net_usd'] for x in cases), sum(x['metrics']['n'] for x in base))


def train_symbol(symbol, args, source, executable, catalog):
    output = Path(args['output'])
    study = make_study(symbol, args, source, executable, catalog)
    if symbol == 'XAUUSD':
        attribution(study, output)
    leaders, counts = {}, {'configurations': 0, 'account_cases': 0, 'audited_trades': 0,
                           'eligible_training': 0, 'liquidation_audit_breaches': 0}
    path = output / f'training-{symbol}.ndjson.gz'
    requirements = catalog['training_selection']['requirements_every_training_year_and_cost']
    with path.open('xb') as raw, gzip.GzipFile(fileobj=raw, filename='', mode='wb', mtime=0) as compressed, \
            io.TextIOWrapper(compressed, encoding='utf-8') as stream:
        for variant in variants(catalog):
            v = asdict(variant)
            row = {'symbol': symbol, 'variant': v, 'config_id': r.digest({'symbol': symbol, 'variant': v}), 'training': {}}
            for stress in COSTS:
                results = []
                for fold in r.FOLDS[:2]:
                    result, _ = study.run_scalp(variant, fold, stress)
                    results.append(result)
                    counts['account_cases'] += 1
                    counts['audited_trades'] += result['audits']['audited_trades']
                    counts['liquidation_audit_breaches'] += result['audits']['liquidation_audit_breaches']
                row['training'][str(stress)] = results
            score = candidate_score(row, requirements)
            row['training_eligible'], row['training_rank'] = score[0], score
            counts['eligible_training'] += int(score[0])
            counts['configurations'] += 1
            lane = r.lane_for(variant.window)
            if lane not in leaders or score > tuple(leaders[lane]['training_rank']):
                leaders[lane] = row
            stream.write(json.dumps(row, separators=(',', ':'), allow_nan=False) + '\n')
    result = {'symbol': symbol, 'leaders': leaders, 'counts': counts, 'archives': study.manifest,
              'normalized_cache': study.normalized_record,
              'coverage': {w: s.coverage for w, s in study.sessions.items()},
              'training_results_file': path.name, 'training_results_sha256': r.file_hash(path)}
    r.write_json(output / f'training-summary-{symbol}.json', result)
    print(f"{symbol}: {counts['configurations']} scalp configs; {counts['eligible_training']} training-eligible", flush=True)
    return result


def numeric_gates(validation):
    base = validation['1.0']['aggregate']
    stress = [validation[str(cost)]['aggregate'] for cost in (1.5, 2.)]
    return {'positive_expectancy': base['expectancy_usd'] is not None and base['expectancy_usd'] > 0,
        'profit_factor_above_1_5': base['profit_factor'] is not None and base['profit_factor'] > 1.5,
        'drawdown_below_10_percent': base['max_fold_drawdown'] < .1 and not base['halted'],
        'at_least_200_distinct_completed_trades': base['n'] >= 200,
        'stressed_costs': all(x['net_usd'] > 0 and x['max_fold_drawdown'] < .1 and not x['halted'] for x in stress)}


def validate_symbol(symbol, args, source, executable, catalog, frozen):
    study = make_study(symbol, args, source, executable, catalog)
    ledgers, results, audits, replays = [], {}, 0, 0
    for lane, choice in frozen['leaders'].items():
        variant = r.Variant(**choice['variant'])
        # Independently re-run all selected training accounts after the freeze.
        for stress in COSTS:
            for i, fold in enumerate(r.FOLDS[:2]):
                result, trades = study.run_scalp(variant, fold, stress)
                if result != choice['training'][str(stress)][i]:
                    raise ValueError('Selected training replay failed deterministic parity')
                replays += 1
                ledgers.append({'lane': lane, 'config_id': choice['config_id'], 'fold': fold[0], 'cost': stress, 'trades': trades})
        costs = {}
        for stress in COSTS:
            folds, combined = [], []
            for fold in r.FOLDS[2:]:
                result, trades = study.run_scalp(variant, fold, stress)
                folds.append(result)
                combined.extend(trades)
                audits += len(trades)
                ledgers.append({'lane': lane, 'config_id': choice['config_id'], 'fold': fold[0], 'cost': stress, 'trades': trades})
            ids = {(x['entry_minute'], x['exit_minute'], x['side']) for x in combined}
            if len(ids) != len(combined):
                raise ValueError('Repeated validation trade counted twice')
            costs[str(stress)] = {'folds': folds, 'aggregate': refinement.aggregate([x['metrics'] for x in folds]),
                                 'trade_ledger_sha256': r.digest(combined)}
        gates = numeric_gates(costs)
        gates['training_stability'] = bool(choice['training_eligible'])
        gates['no_margin_maintenance_breach'] = not any(x['audits']['liquidation_audit_breaches']
            for value in costs.values() for x in value['folds'])
        gates['untouched_out_of_sample_evidence'] = False
        results[lane] = {'config_id': choice['config_id'], 'variant': choice['variant'],
                         'training_eligible': choice['training_eligible'], 'validation': costs,
                         'gates': gates, 'qualifies': all(gates.values())}
    r.write_json(Path(args['output']) / f'private-selected-ledgers-{symbol}.json', ledgers)
    result = {'symbol': symbol, 'lanes': results, 'validation_account_cases': len(results) * 6,
              'selected_training_parity_replays': replays, 'validation_audited_trades': audits,
              'selected_ledgers_sha256': r.digest(ledgers)}
    r.write_json(Path(args['output']) / f'validation-summary-{symbol}.json', result)
    print(f'{symbol}: three frozen scalp benchmarks evaluated on reused 2024', flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cache', 'calendar', 'normalized', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--workers', type=int, default=6)
    options = parser.parse_args()
    if options.output.exists():
        parser.error('Output already exists; preserve previous evidence')
    if not 1 <= options.workers <= 8:
        parser.error('Use 1-8 bounded worker processes')
    catalog_path = ROOT / 'docs/xmi-scalping-catalog-20261107.json'
    catalog = json.loads(catalog_path.read_text())
    source_path = ROOT / 'docs/xmi-session-calendar-rerun-2022-2024.json'
    source = json.loads(source_path.read_text())
    if source['source'] != r.source_identity() or source['calendar_sha256'] != r.file_hash(options.calendar):
        raise ValueError('Frozen execution source or audited calendar changed')
    options.output.mkdir(parents=True)
    options.normalized.mkdir(parents=True, exist_ok=True)
    executable = r.build_executable(options.output)
    provenance = {'catalog': catalog, 'catalog_sha256': r.file_hash(catalog_path), 'source': r.source_identity(),
                  'wrapper_sha256': r.file_hash(Path(__file__)), 'calendar_sha256': r.file_hash(options.calendar),
                  'source_summary_sha256': r.file_hash(source_path), 'as_of_date': '2026-11-07',
                  'training_configurations': len(list(variants(catalog))) * len(catalog['symbols']),
                  'holdout_archives_read': False, 'validation_evaluated': False}
    r.write_json(options.output / 'preregistration.json', provenance)
    args = {key: str(getattr(options, key).resolve()) for key in ('cache', 'calendar', 'normalized', 'output')}
    with ProcessPoolExecutor(max_workers=options.workers) as pool:
        futures = [pool.submit(train_symbol, symbol, args, source, executable, catalog) for symbol in catalog['symbols']]
        training = {item['symbol']: item for item in (f.result() for f in futures)}
    freeze = {'preregistration_sha256': r.file_hash(options.output / 'preregistration.json'),
              'symbols': training, 'validation_evaluated': False, 'holdout_archives_read': False}
    r.write_json(options.output / 'training-selection-freeze.json', freeze)
    with ProcessPoolExecutor(max_workers=options.workers) as pool:
        futures = [pool.submit(validate_symbol, symbol, args, source, executable, catalog, training[symbol])
                   for symbol in catalog['symbols']]
        validation = {item['symbol']: item for item in (f.result() for f in futures)}
    result = {**provenance, 'validation_evaluated': True,
              '2024_status': 'Previously used development evidence, never untouched out-of-sample',
              'training_selection_freeze_sha256': r.file_hash(options.output / 'training-selection-freeze.json'),
              'loss_conditions': json.loads((options.output / 'training-loss-conditions.json').read_text()),
              'symbols': {s: {'training': training[s], 'reused_validation': validation[s]} for s in catalog['symbols']},
              'counts': {key: sum(x['counts'][key] for x in training.values()) for key in next(iter(training.values()))['counts']},
              'new_validation_accounts': sum(x['validation_account_cases'] for x in validation.values()),
              'selected_training_parity_replays': sum(x['selected_training_parity_replays'] for x in validation.values()),
              'validation_audited_trades': sum(x['validation_audited_trades'] for x in validation.values()),
              'qualified_strategies': sum(v['qualifies'] for x in validation.values() for v in x['lanes'].values()),
              'production_or_staging_changed': False, 'orders_submitted': 0, 'vendor_downloads': 0,
              'limitations': ['Known 2023 incomplete session windows are excluded', 'Retrospectively retrieved calendars are not point-in-time archives',
                  'Fixed conservative modeled costs; no full-period tick execution proof', 'No volume or manipulation intent inferred from OHLC',
                  'Independent account totals are not a shared-capital portfolio', 'A margin-maintenance breach invalidates a path; no invented broker fill']}
    r.write_json(options.output / 'results.json', result)
    print(json.dumps({'counts': result['counts'], 'new_validation_accounts': result['new_validation_accounts'],
        'selected_training_parity_replays': result['selected_training_parity_replays'],
        'validation_audited_trades': result['validation_audited_trades'], 'qualified_strategies': result['qualified_strategies'],
        'results_sha256': r.file_hash(options.output / 'results.json')}), flush=True)


if __name__ == '__main__':
    main()

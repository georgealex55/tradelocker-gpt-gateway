#!/usr/bin/env python3
"""Entry-only cost filters on frozen scalps, with matched baseline parity."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from importlib import import_module
import json
from pathlib import Path

import numpy as np

scalp = import_module('xmi-session-scalping')
r = scalp.r
ROOT = Path(__file__).resolve().parents[1]


def target_cost_ratio(entry, distance, direction, model):
    """Entry-known intended target divided by its full modeled round-trip cost."""
    entry, distance, direction = np.broadcast_arrays(entry, distance, direction)
    target_move = distance * model.reward
    target = entry + direction * target_move
    cost = model.spread + 2 * model.slippage + 2 * model.commission_per_unit_side * (target if model.usd_base else 1.)
    valid = (np.isfinite(entry) & np.isfinite(distance) & (entry > 0) & (distance > 0) &
             np.isin(direction, (-1, 1)) & (target > 0) & np.isfinite(cost) & (cost >= 0) & (model.reward > 0))
    ratio = np.divide(target_move, cost, out=np.full(entry.shape, np.inf), where=cost > 0)
    return np.where(valid, ratio, np.nan)


def cost_allowed(ratio, threshold):
    if threshold not in (0, 2, 3, 5):
        raise ValueError('Only preregistered target-to-cost thresholds are allowed')
    return ~np.isnan(ratio) & (ratio + 1e-12 >= threshold)


class CostStudy(scalp.ScalpStudy):
    active_filter = None

    def plan(self, variant):
        original = super().plan(variant)
        if self.active_filter is None or self.active_filter[0] == 0:
            return original
        threshold, stress = self.active_filter
        first, last, side, atr, structure, limits = original
        model = r.money_model(self.symbol, variant, stress, 1.)
        ratio = target_cost_ratio(self.prices[0, first], variant.stop_atr * atr, side, model)
        allowed = cost_allowed(ratio, threshold)
        # Keep all rows and original lane ends. Filtering must never reset caps.
        return first, last, side, np.ascontiguousarray(np.where(allowed, atr, np.nan)), structure, limits

    def run_filtered(self, variant, fold, threshold, stress):
        if self.active_filter is not None:
            raise ValueError('Nested filtered replay is not supported')
        first, _, side, atr, _, _ = super().plan(variant)
        model = r.money_model(self.symbol, variant, stress, 1.)
        ratio = target_cost_ratio(self.prices[0, first], variant.stop_atr * atr, side, model)
        allowed = np.ones(len(first), dtype=bool) if threshold == 0 else cost_allowed(ratio, threshold)
        self.active_filter = (threshold, stress)
        try:
            result, trades = super().run_scalp(variant, fold, stress)
        finally:
            self.active_filter = None
        indexes = np.searchsorted(self.t, [r.utc_minute(fold[1]), r.utc_minute(fold[2])])
        a, b = np.searchsorted(first, indexes)
        actual = []
        for trade in trades:
            i = int(np.searchsorted(first, np.searchsorted(self.t, trade['entry_minute'])))
            if i >= len(first) or self.t[first[i]] != trade['entry_minute'] or not allowed[i]:
                raise ValueError('A fill violated the registered entry-only cost filter')
            if not np.isfinite(ratio[i]):
                raise ValueError('A fill has invalid entry cost information')
            actual.append(float(ratio[i]))
        result['entry_filter'] = {'minimum_target_to_cost': threshold, 'closed_signals_in_fold': int(b - a),
            'rejected_signal_rows': int((~allowed[a:b]).sum()),
            'filled_target_to_cost_min': min(actual) if actual else None,
            'filled_target_to_cost_median': float(np.median(actual)) if actual else None}
        return result, trades


def make_study(symbol, args, previous, executable):
    source = json.loads((ROOT / 'docs/xmi-session-calendar-rerun-2022-2024.json').read_text())
    calendar = scalp.screen.controls.load_calendar(Path(args['calendar']))
    profile = scalp.screen.controls.build_profiles(symbol, calendar, source['event_settings'], False,
                                                   period=scalp.screen.PERIOD)['news+rollover']
    if profile.coverage_missing:
        raise ValueError('Incomplete development calendar')
    return CostStudy(Path(args['cache']), Path(args['normalized']), symbol, executable,
        previous['catalog']['windows'], profile, previous['symbols'][symbol]['training']['archives'])


def matched_original(result, expected):
    return all(result[key] == expected[key] for key in ('metrics', 'audits', 'trade_ledger_sha256'))


def train_symbol(symbol, args, previous, executable, catalog):
    study = make_study(symbol, args, previous, executable)
    lanes, ledgers, parity, fills = {}, [], 0, 0
    for lane, benchmark in previous['symbols'][symbol]['training']['leaders'].items():
        variant = r.Variant(**benchmark['variant'])
        cases = {}
        for threshold in catalog['thresholds']:
            training = {}
            for stress in scalp.COSTS:
                rows = []
                for i, fold in enumerate(r.FOLDS[:2]):
                    result, trades = study.run_filtered(variant, fold, threshold, stress)
                    if threshold == 0:
                        if not matched_original(result, benchmark['training'][str(stress)][i]):
                            raise ValueError('Unfiltered training baseline failed frozen parity')
                        parity += 1
                    rows.append(result)
                    fills += len(trades)
                    ledgers.append({'lane': lane, 'threshold': threshold, 'cost': stress,
                                    'fold': fold[0], 'trades': trades})
                training[str(stress)] = rows
            score = scalp.candidate_score({'training': training},
                catalog['selection']['requirements_every_training_year_and_cost'])
            cases[str(threshold)] = {'training': training, 'training_eligible': score[0], 'training_rank': score,
                'config_id': r.digest({'benchmark_config_id': benchmark['config_id'], 'minimum_target_to_cost': threshold})}
        chosen = max(catalog['thresholds'], key=lambda value: tuple(cases[str(value)]['training_rank']))
        lanes[lane] = {'benchmark_config_id': benchmark['config_id'], 'variant': benchmark['variant'],
                      'thresholds': cases, 'selected_threshold': chosen,
                      'training_eligible': cases[str(chosen)]['training_eligible']}
    output = Path(args['output'])
    r.write_json(output / f'private-training-ledgers-{symbol}.json', ledgers)
    result = {'symbol': symbol, 'lanes': lanes, 'training_baseline_parity_accounts': parity,
              'training_audited_fills': fills, 'training_ledgers_sha256': r.digest(ledgers),
              'archives': study.manifest, 'normalized_cache': study.normalized_record,
              'coverage': {w: s.coverage for w, s in study.sessions.items()}}
    r.write_json(output / f'training-summary-{symbol}.json', result)
    print(f'{symbol}: four cost floors trained; choices ' + str({k:v['selected_threshold'] for k,v in lanes.items()}), flush=True)
    return result


def validate_symbol(symbol, args, previous, executable, catalog, training):
    study = make_study(symbol, args, previous, executable)
    ledgers, lanes, parity, fills = [], {}, 0, 0
    for lane, benchmark in training['lanes'].items():
        variant = r.Variant(**benchmark['variant'])
        cases = {}
        for threshold in catalog['thresholds']:
            costs = {}
            for stress in scalp.COSTS:
                folds, combined = [], []
                for i, fold in enumerate(r.FOLDS[2:]):
                    result, trades = study.run_filtered(variant, fold, threshold, stress)
                    if threshold == 0:
                        old = previous['symbols'][symbol]['reused_validation']['lanes'][lane]['validation'][str(stress)]['folds'][i]
                        if not matched_original(result, old):
                            raise ValueError('Unfiltered reused-2024 baseline failed frozen parity')
                        parity += 1
                    folds.append(result)
                    combined.extend(trades)
                    fills += len(trades)
                    ledgers.append({'lane': lane, 'threshold': threshold, 'cost': stress,
                                    'fold': fold[0], 'trades': trades})
                if len({(t['entry_minute'], t['exit_minute'], t['side']) for t in combined}) != len(combined):
                    raise ValueError('Duplicate trade inflated the development sample')
                costs[str(stress)] = {'folds': folds,
                    'aggregate': scalp.refinement.aggregate([x['metrics'] for x in folds]),
                    'trade_ledger_sha256': r.digest(combined)}
            gates = scalp.numeric_gates(costs)
            gates['training_stability'] = benchmark['thresholds'][str(threshold)]['training_eligible']
            gates['no_margin_maintenance_breach'] = not any(x['audits']['liquidation_audit_breaches']
                                                          for v in costs.values() for x in v['folds'])
            gates['untouched_out_of_sample_evidence'] = False
            cases[str(threshold)] = {'config_id': benchmark['thresholds'][str(threshold)]['config_id'],
                'costs': costs, 'gates': gates, 'qualifies': all(gates.values())}
        lanes[lane] = {'variant': benchmark['variant'], 'benchmark_config_id': benchmark['benchmark_config_id'],
            'selected_threshold': benchmark['selected_threshold'], 'training_eligible': benchmark['training_eligible'],
            'thresholds': cases}
    output = Path(args['output'])
    r.write_json(output / f'private-validation-ledgers-{symbol}.json', ledgers)
    result = {'symbol': symbol, 'lanes': lanes, 'validation_baseline_parity_accounts': parity,
              'validation_audited_fills': fills, 'validation_ledgers_sha256': r.digest(ledgers)}
    r.write_json(output / f'validation-summary-{symbol}.json', result)
    print(f'{symbol}: frozen choices and all four descriptive 2024 comparisons complete', flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cache', 'calendar', 'normalized', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--workers', type=int, default=6)
    options = parser.parse_args()
    if options.output.exists():
        parser.error('Preserve previous evidence: output already exists')
    if not 1 <= options.workers <= 8:
        parser.error('Use a bounded 1-8 worker count')
    previous_path = ROOT / 'docs/xmi-session-scalping-20261107.json'
    catalog_path = ROOT / 'docs/xmi-scalp-cost-catalog-20261107.json'
    previous, catalog = [json.loads(p.read_text()) for p in (previous_path, catalog_path)]
    if previous['source'] != r.source_identity() or previous['wrapper_sha256'] != r.file_hash(Path(scalp.__file__)):
        raise ValueError('Frozen scalp engine source changed')
    if previous['calendar_sha256'] != r.file_hash(options.calendar):
        raise ValueError('Audited calendar changed')
    options.output.mkdir(parents=True)
    executable = r.build_executable(options.output)
    provenance = {'catalog': catalog, 'catalog_sha256': r.file_hash(catalog_path),
                  'wrapper_sha256': r.file_hash(Path(__file__)), 'scalp_wrapper_sha256': r.file_hash(Path(scalp.__file__)),
                  'source': r.source_identity(), 'source_summary_sha256': r.file_hash(previous_path),
                  'calendar_sha256': r.file_hash(options.calendar), 'starting_equity_usd': 1000,
                  'as_of_date': '2026-11-07', 'holdout_archives_read': False, 'validation_evaluated': False,
                  'benchmarks': {s:{k:v['config_id'] for k,v in previous['symbols'][s]['training']['leaders'].items()}
                                 for s in previous['catalog']['symbols']}}
    r.write_json(options.output / 'preregistration.json', provenance)
    args = {k: str(getattr(options, k).resolve()) for k in ('cache', 'calendar', 'normalized', 'output')}
    symbols = previous['catalog']['symbols']
    with ProcessPoolExecutor(max_workers=options.workers) as pool:
        futures = [pool.submit(train_symbol, s, args, previous, executable, catalog) for s in symbols]
        training = {x['symbol']:x for x in (f.result() for f in futures)}
    freeze = {'symbols': training, 'preregistration_sha256': r.file_hash(options.output / 'preregistration.json'),
              'validation_evaluated': False, 'holdout_archives_read': False}
    r.write_json(options.output / 'training-selection-freeze.json', freeze)
    with ProcessPoolExecutor(max_workers=options.workers) as pool:
        futures = [pool.submit(validate_symbol, s, args, previous, executable, catalog, training[s]) for s in symbols]
        validation = {x['symbol']:x for x in (f.result() for f in futures)}
    threshold_count = len(symbols) * 3 * len(catalog['thresholds'])
    result = {**provenance, 'symbols': {s:{'training':training[s], 'reused_validation':validation[s]} for s in symbols},
        'configurations': threshold_count, 'training_account_cases': threshold_count * 6,
        'reused_validation_account_cases': threshold_count * 6,
        'baseline_parity_accounts': sum(training[s]['training_baseline_parity_accounts'] + validation[s]['validation_baseline_parity_accounts'] for s in symbols),
        'training_audited_fills': sum(training[s]['training_audited_fills'] for s in symbols),
        'validation_audited_fills': sum(validation[s]['validation_audited_fills'] for s in symbols),
        'training_eligible_threshold_cases': sum(x['training_eligible'] for s in training.values() for lane in s['lanes'].values() for x in lane['thresholds'].values()),
        'qualified_strategies': sum(x['qualifies'] for s in validation.values() for lane in s['lanes'].values() for x in lane['thresholds'].values()),
        'training_selection_freeze_sha256': r.file_hash(options.output / 'training-selection-freeze.json'),
        'validation_evaluated': True, '2024_status': 'Reused development, not untouched out-of-sample',
        'vendor_downloads': 0, 'orders_submitted': 0, 'production_or_staging_changed': False,
        'limitations': previous['limitations'] + ['Limited to 24 previously frozen scalp benchmarks; not a new full-grid search',
            'Intended target-to-cost does not predict hitting that target within 15 minutes', 'Skipped signals and position paths differ under filters and stressed sizing']}
    r.write_json(options.output / 'results.json', result)
    print(json.dumps({k:result[k] for k in ('configurations','training_account_cases','reused_validation_account_cases',
        'baseline_parity_accounts','training_eligible_threshold_cases','qualified_strategies','training_audited_fills','validation_audited_fills')}), flush=True)
    print('results_sha256=' + r.file_hash(options.output / 'results.json'), flush=True)


if __name__ == '__main__':
    main()

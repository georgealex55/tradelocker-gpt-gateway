#!/usr/bin/env python3
"""Audit the complete fixed-lot new-entry inventory and selected price ledgers."""
import argparse
from collections import Counter, defaultdict
import gzip
from importlib import import_module
from itertools import product
import json
from pathlib import Path

entry = import_module('xmi-session-new-entries')
r = entry.r


def independently_rank(row, requirements):
    cases = [v for folds in row['training'].values() for v in folds]
    passed = all(
        v['metrics']['n'] >= requirements['minimum_completed_trades']
        and v['metrics']['net_usd'] > requirements['net_pnl_strictly_above_usd']
        and v['metrics']['profit_factor'] is not None
        and v['metrics']['profit_factor'] > requirements['profit_factor_strictly_above']
        and v['metrics']['max_drawdown'] < requirements['max_equity_drawdown_strictly_below']
        and not v['metrics']['halted'] and not v['audits']['bankrupt']
        and v['audits']['liquidation_audit_breaches'] == 0 for v in cases)
    sampled = all(v['metrics']['n'] >= requirements['minimum_completed_trades']
                  for v in row['training']['1.0'])
    return (passed, sampled, min(v['metrics']['net_usd'] for v in cases),
            sum(v['metrics']['n'] for v in row['training']['1.0']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cache', 'calendar', 'normalized', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = json.loads((args.output / 'results.json').read_text())
    previous = json.loads((entry.ROOT / 'docs/xmi-session-lot-rerun-20261107.json').read_text())
    catalog = result['catalog']
    freeze = json.loads((args.output / 'training-selection-freeze.json').read_text())
    assert not freeze['new_entry_validation_evaluated'] and not freeze['holdout_archives_read']
    assert not result['holdout_archives_read'] and result['starting_equity_usd'] == 1000
    assert r.file_hash(args.output / 'training-selection-freeze.json') == result['training_selection_freeze_sha256']
    assert r.file_hash(args.output / 'preregistration.json') == freeze['preregistration_sha256']
    assert r.source_identity() == result['source']
    assert r.file_hash(Path(entry.__file__)) == result['wrapper_sha256']
    assert r.file_hash(args.calendar) == result['calendar_sha256']
    profiles = {p['id']: p for p in result['execution_profiles']}
    counts = Counter()
    family = defaultdict(Counter)
    gate_counts = Counter()
    summaries = []
    executable = r.build_executable(args.output)
    paths = {k: str(getattr(args, k).resolve()) for k in ('cache', 'calendar', 'normalized', 'output')}
    for symbol, data in result['symbols'].items():
        assert data['training'] == freeze['symbols'][symbol]
        for profile, summary in data['training']['profiles'].items():
            path = args.output / summary['results_file']
            assert r.file_hash(path) == summary['results_sha256']
            expected = set()
            for rule in catalog['rules']:
                for window, param, minutes, hold, risk, floor in product(
                        catalog['windows'], rule['parameters'], catalog['signal_minutes'],
                        catalog['holding_caps_minutes'], catalog['risk_ceiling_fractions'], catalog['cost_floors']):
                    expected.add((rule['id'], window, param, minutes, hold, risk, floor))
            ids, inventory, best, eligible = set(), set(), {}, 0
            with gzip.open(path, 'rt') as stream:
                for line in stream:
                    row = json.loads(line)
                    assert row['symbol'] == symbol and row['profile'] == profile and row['sizing'] == 'fixed_0.01'
                    spec = {k: row[k] for k in ('symbol', 'profile', 'variant', 'cost_floor', 'sizing')}
                    assert r.digest(spec) == row['config_id'] and row['config_id'] not in ids
                    ids.add(row['config_id'])
                    v = row['variant']
                    inventory.add((v['rule'], v['window'], v['rule_parameter'], v['minutes'],
                                   v['hold_minutes'], v['risk'], row['cost_floor']))
                    assert v['stop_atr'] == 1.5 and v['reward'] == 1 and v['max_trades'] == v['cooldown'] == v['min_stop_to_cost'] == 0
                    score = independently_rank(row, previous['catalog']['training_requirements_every_year_and_cost'])
                    assert score == tuple(row['training_rank']) and score[0] == row['training_eligible']
                    lane = r.lane_for(v['window'])
                    if lane not in best or score > best[lane][0]:
                        best[lane] = (score, row['config_id'])
                    eligible += int(score[0])
                    counts['configurations'] += 1
                    f = family[(symbol, profile, v['rule'])]
                    f['configurations'] += 1
                    f['eligible_training'] += int(score[0])
                    f['base_both_years_at_least_25_trades'] += int(score[1])
                    f['positive_base_net_both_years'] += int(all(x['metrics']['net_usd'] > 0 for x in row['training']['1.0']))
                    assert set(row['training']) == {'1.0', '1.5', '2.0'}
                    for folds in row['training'].values():
                        assert len(folds) == 2
                        for account in folds:
                            m, a, lots = account['metrics'], account['audits'], account['lot_statistics']['lots']
                            assert m['n'] == a['audited_trades']
                            assert a['maximum_elapsed_holding_upper_bound_minutes'] <= v['hold_minutes'] <= 15
                            assert not a['bankrupt'] and a['liquidation_audit_breaches'] == 0
                            assert abs(m['ending_usd'] - 1000 - m['net_usd']) < 1e-5
                            assert abs(m['gross_profit'] - m['gross_loss'] - m['net_usd']) < 1e-5
                            if m['n']:
                                assert lots == {'min': .01, 'median': .01, 'max': .01}
                            else:
                                assert lots is None
                            counts['training_accounts'] += 1
                            counts['training_fills'] += m['n']
            assert inventory == expected and len(ids) == len(expected) == 3456
            assert eligible == summary['training_eligible']
            counts['eligible_training'] += eligible
            for lane, selected in summary['leaders'].items():
                assert best[lane][1] == selected['config_id']
        ledgers = json.loads((args.output / f'private-selected-ledgers-{symbol}.json').read_text())
        assert r.digest(ledgers) == data['reused_validation']['selected_ledgers_sha256']
        study = entry.study_for(symbol, paths, executable)
        identities = set()
        for ledger in ledgers:
            identity = (ledger['profile'], ledger['lane'], ledger['cost'], ledger['fold'])
            assert identity not in identities
            identities.add(identity)
            choice = data['training']['profiles'][ledger['profile']]['leaders'][ledger['lane']]
            selected = data['reused_validation']['profiles'][ledger['profile']][ledger['lane']]
            cost = str(float(ledger['cost']))
            training = ledger['fold'].startswith('train')
            index = 0 if ledger['fold'] in ('train_2022', 'validation_h1_2024') else 1
            assert ledger['fold'] in {f[0] for f in r.FOLDS}
            expected = choice['training'][cost][index] if training else selected['costs'][cost]['folds'][index]
            trades = ledger['trades']
            assert choice['config_id'] == selected['config_id'] == ledger['config_id']
            assert r.digest(trades) == expected['trade_ledger_sha256'] and len(trades) == expected['metrics']['n']
            assert len({(t['entry_minute'], t['exit_minute'], t['side']) for t in trades}) == len(trades)
            equity = 1000.
            for trade in trades:
                equity = entry.cash_audit.audit_fill(study, r.Variant(**selected['variant']),
                    profiles[ledger['profile']], selected['cost_floor'], ledger['cost'], 'fixed_0.01',
                    trade, equity, result['contracts'])
                counts['selected_price_audited_fills'] += 1
            assert abs(equity - 1000 - expected['metrics']['net_usd']) < 1e-5
            counts['selected_price_audited_accounts'] += 1
        for profile, lanes in data['reused_validation']['profiles'].items():
            for lane, selected in lanes.items():
                counts['selected_choices'] += 1
                gate_counts.update({k: int(v) for k, v in selected['gates'].items()})
                assert selected['qualifies'] == all(selected['gates'].values())
                for stress, value in selected['costs'].items():
                    matching = [t for l in ledgers if l['profile'] == profile and l['lane'] == lane
                                and str(float(l['cost'])) == stress and l['fold'].startswith('validation') for t in l['trades']]
                    assert r.digest(matching) == value['trade_ledger_sha256']
                    assert value['aggregate'] == entry.scalp.refinement.aggregate([f['metrics'] for f in value['folds']])
                summaries.append({'symbol': symbol, 'profile': profile, 'lane': lane,
                    'config_id': selected['config_id'], 'variant': selected['variant'], 'cost_floor': selected['cost_floor'],
                    'base': selected['costs']['1.0']['aggregate'],
                    'stress': {k: selected['costs'][k]['aggregate'] for k in ('1.5', '2.0')}})
        print(f'{symbol}: registered inventory, training selection and price/cash audit passed', flush=True)
    for key in ('configurations', 'training_accounts', 'training_fills', 'eligible_training'):
        assert counts[key] == result['training_counts'][key]
    assert counts['selected_price_audited_accounts'] == result['evaluation_counts']['price_audited_accounts'] == 324
    assert counts['selected_price_audited_fills'] == result['evaluation_counts']['price_audited_fills'] == 3868
    audit = {'all_checks_passed': True, 'counts': dict(counts), 'gate_pass_counts': dict(gate_counts),
        'family_training_summary': [{'symbol': k[0], 'profile': k[1], 'family': k[2], **dict(v)} for k, v in sorted(family.items())],
        'selected_development_summary': summaries, 'results_sha256': r.file_hash(args.output / 'results.json'),
        'auditor_sha256': r.file_hash(Path(__file__)),
        'method': 'Independently reconstruct full registered inventory and training ranks; verify immutable files and selected ledgers; independently reprice selected brackets, currency conversion, cash risk, margin and news/rollover boundaries without C++ fill P/L',
        'limitations': 'Conditional modeled contract/cost inputs; reused 2024 is not fresh OOS; no 2025 reads'}
    r.write_json(args.output / 'independent-audit.json', audit)
    print(json.dumps({'counts': dict(counts), 'gate_pass_counts': dict(gate_counts), 'all_checks_passed': True}), flush=True)


if __name__ == '__main__':
    main()

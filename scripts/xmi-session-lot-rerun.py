#!/usr/bin/env python3
"""Registered zero-commission scalp rerun, with lots, cash margin and risk."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import ctypes as ct
from dataclasses import asdict
import gzip
from importlib import import_module
import io
import json
from pathlib import Path

import numpy as np

cost = import_module('xmi-session-scalp-cost')
scalp, r = cost.scalp, cost.r
ROOT = Path(__file__).resolve().parents[1]


def lot_contract(symbol):
    return 100. if symbol == 'XAUUSD' else 100000.


def execution_model(symbol, variant, profile, stress, fixed=False):
    model = r.money_model(symbol, variant, stress, 1.)
    model.exit_on_flip = 0
    if profile['id'] != 'legacy':
        model.commission_per_unit_side = profile['commission_usd_per_unit_side']
        model.leverage = profile['gold_leverage' if symbol == 'XAUUSD' else 'fx_leverage']
        if symbol == 'XAUUSD':
            model.spread = profile['gold_spread_price'] * stress
        model.unit_step = lot_contract(symbol) * .01
    if fixed:
        model.unit_cap = lot_contract(symbol) * .01
    return model


def lot_ledger(study, variant, model, first, stop, trades):
    if not trades:
        return [], {'lots': None, 'margin_usd': None, 'initial_stop_risk_usd': None}
    entry_min = np.array([x['entry_minute'] for x in trades], dtype=np.int64)
    indices = np.searchsorted(study.t, entry_min)
    signal_rows = np.searchsorted(first, indices)
    units = np.array([x['units'] for x in trades])
    sides = np.array([x['side'] for x in trades])
    opens = study.prices[0, indices]
    distance = stop[signal_rows]
    protective = opens - sides * distance
    friction = model.spread + 2 * model.slippage
    losses = units * ((distance + friction) / (np.minimum(opens, protective) if model.usd_base else 1.)
                      + 2 * model.commission_per_unit_side)
    margins = units * (1. if model.usd_base else opens + model.spread) / model.leverage
    before = np.r_[1000., 1000. + np.cumsum([x['pnl_usd'] for x in trades[:-1]])]
    lots = units / lot_contract(study.symbol)
    if np.any(losses > before * model.risk + 1e-7) or np.any(margins > before * .9 + 1e-7):
        raise ValueError('Cash risk or entry margin exceeded the account budget')
    logs = [{k:v for k,v in trade.items() if k != 'units'} | {
            'size_lots': round(float(lots[i]), 8), 'margin_usd': float(margins[i]),
            'initial_stop_risk_usd': float(losses[i]), 'risk_budget_usd': float(before[i] * model.risk),
            'cash_equity_before_usd': float(before[i]), 'gross_pnl_usd': trade['pnl_usd'] + trade['cost_usd']}
            for i,trade in enumerate(trades)]
    def stats(values):
        return {'min':round(float(np.min(values)), 6),'median':round(float(np.median(values)), 6),
                'max':round(float(np.max(values)), 6)}
    return logs, {'lots':stats(lots), 'margin_usd':stats(margins), 'initial_stop_risk_usd':stats(losses)}


class LotStudy(scalp.ScalpStudy):
    def run_lot(self, variant, fold, profile, threshold, stress=1., fixed=False):
        if variant.minutes not in (1,5) or variant.hold_minutes not in (5,10,15):
            raise ValueError('Only registered strict scalp granularities and holding limits')
        begin,end = np.searchsorted(self.t,[r.utc_minute(fold[1]),r.utc_minute(fold[2])])
        first,last,side,atr,structure,limits = self.plan(variant)
        if structure is not None:
            raise ValueError('Unregistered structural stop')
        a,b = np.searchsorted(first,[begin,end])
        first,last,side,atr,limits = (np.ascontiguousarray(x[a:b]) for x in (first,last,side,atr,limits))
        limits = scalp.clock_limits(self.t,first,last,limits,variant.hold_minutes,end)
        model = execution_model(self.symbol,variant,profile,stress,fixed)
        stop = np.ascontiguousarray(variant.stop_atr * atr)
        ratios = cost.target_cost_ratio(self.prices[0,first],stop,side,model)
        allowed = np.ones(len(first),dtype=bool) if threshold == 0 else cost.cost_allowed(ratios,threshold)
        stop = np.ascontiguousarray(np.where(allowed,stop,np.nan))
        result,log = r.Result(),(r.Trade * len(first))()
        self.library.replay(*self.price_ptrs,r.pointer(first),r.pointer(last),r.pointer(side),r.pointer(stop),
            r.pointer(limits),len(first),ct.byref(model),ct.byref(result),log)
        raw = [{'entry_minute':int(self.t[x.entry]),'exit_minute':int(self.t[x.exit]),'pnl_usd':x.net,
                'r':x.r,'units':x.units,'cost_usd':x.cost,'side':x.side,'exit_reason':x.reason}
               for x in log[:int(result.trade_count)]]
        audits = self.audit_scalps(variant,model,first,stop,raw)
        logs,statistics = lot_ledger(self,variant,model,first,stop,raw)
        filled = np.searchsorted(first,np.searchsorted(self.t,[x['entry_minute'] for x in raw]))
        if len(filled) and (np.any(~allowed[filled]) or np.any(ratios[filled] + 1e-12 < threshold)):
            raise ValueError('A fill violated its cost floor')
        return {'metrics':r.metrics(result),'audits':audits,'lot_statistics':statistics,
                'rejected_cost_signal_rows':int((~allowed).sum()),'trade_ledger_sha256':r.digest(logs),
                'raw_trade_ledger_sha256':r.digest(raw)},logs


def study_for(symbol,args,previous,executable):
    source = json.loads((ROOT/'docs/xmi-session-calendar-rerun-2022-2024.json').read_text())
    calendar = scalp.screen.controls.load_calendar(Path(args['calendar']))
    profile = scalp.screen.controls.build_profiles(symbol,calendar,source['event_settings'],False,
                                                   period=scalp.screen.PERIOD)['news+rollover']
    if profile.coverage_missing:
        raise ValueError('Incomplete calendar')
    return LotStudy(Path(args['cache']),Path(args['normalized']),symbol,executable,
        previous['catalog']['windows'],profile,previous['symbols'][symbol]['training']['archives'])


def train_symbol(symbol,args,previous,executable,catalog):
    study = study_for(symbol,args,previous,executable)
    output = Path(args['output'])
    counts = {'configurations':0,'account_cases':0,'audited_fills':0,'training_eligible':0,'legacy_parity_accounts':0}
    # Validate the complete saved benchmark history with the old execution model.
    for lane,benchmark in previous['symbols'][symbol]['training']['leaders'].items():
        variant = r.Variant(**benchmark['variant'])
        for stress in scalp.COSTS:
            for i,fold in enumerate(r.FOLDS):
                value,_ = study.run_lot(variant,fold,{'id':'legacy'},0,stress)
                old = (benchmark['training'][str(stress)][i] if i < 2 else
                       previous['symbols'][symbol]['reused_validation']['lanes'][lane]['validation'][str(stress)]['folds'][i-2])
                if (value['metrics'] != old['metrics'] or value['audits'] != old['audits']
                        or value['raw_trade_ledger_sha256'] != old['trade_ledger_sha256']):
                    raise ValueError('New lot wrapper changed the frozen legacy baseline')
                counts['legacy_parity_accounts'] += 1
    profiles = {}
    for profile in catalog['profiles']:
        if profile['symbols'] != 'all' and symbol not in profile['symbols']:
            continue
        leaders,eligible = {},0
        filename = f"training-{symbol}-{profile['id']}.ndjson.gz"
        with (output/filename).open('xb') as raw,gzip.GzipFile(fileobj=raw,filename='',mode='wb',mtime=0) as compressed, \
                io.TextIOWrapper(compressed,encoding='utf-8') as stream:
            for variant in scalp.variants(previous['catalog']):
                for threshold in catalog['target_to_cost_floors']:
                    spec = {'symbol':symbol,'profile':profile['id'],'variant':asdict(variant),'cost_floor':threshold,'sizing':'risk_budget'}
                    row = {**spec,'config_id':r.digest(spec),'training':{}}
                    for stress in scalp.COSTS:
                        values = []
                        for fold in r.FOLDS[:2]:
                            value,_ = study.run_lot(variant,fold,profile,threshold,stress)
                            values.append(value);counts['account_cases'] += 1
                            counts['audited_fills'] += value['audits']['audited_trades']
                        row['training'][str(stress)] = values
                    score = scalp.candidate_score(row,catalog['training_requirements_every_year_and_cost'])
                    row['training_eligible'],row['training_rank'] = score[0],score
                    counts['configurations'] += 1;counts['training_eligible'] += int(score[0]);eligible += int(score[0])
                    lane = r.lane_for(variant.window)
                    if lane not in leaders or score > tuple(leaders[lane]['training_rank']):
                        leaders[lane] = row
                    stream.write(json.dumps(row,separators=(',',':'),allow_nan=False)+'\n')
        profiles[profile['id']] = {'leaders':leaders,'training_eligible':eligible,'results_file':filename,
                                   'results_sha256':r.file_hash(output/filename)}
        print(f"{symbol}/{profile['id']}: 2016 configurations complete; {eligible} training-eligible",flush=True)
    result = {'symbol':symbol,'profiles':profiles,'counts':counts,'archives':study.manifest,
              'normalized_cache':study.normalized_record,'coverage':{k:v.coverage for k,v in study.sessions.items()}}
    r.write_json(output/f'training-summary-{symbol}.json',result)
    return result


def score_validation(costs,training_eligible):
    gates = scalp.numeric_gates(costs)
    gates['training_stability'] = bool(training_eligible)
    gates['no_margin_maintenance_breach'] = not any(x['audits']['liquidation_audit_breaches'] for c in costs.values() for x in c['folds'])
    gates['untouched_out_of_sample_evidence'] = False
    gates['verified_historical_contract_and_costs'] = False
    return gates


def validate_symbol(symbol,args,previous,executable,catalog,training):
    study = study_for(symbol,args,previous,executable)
    ledgers,profiles = [],{}
    counts = {'dynamic_validation_accounts':0,'fixed_accounts':0,'selected_training_parity_replays':0,
              'validation_audited_fills':0,'fixed_audited_fills':0}
    for profile in catalog['profiles']:
        if profile['id'] not in training['profiles']:
            continue
        lanes = {}
        for lane,choice in training['profiles'][profile['id']]['leaders'].items():
            variant,threshold = r.Variant(**choice['variant']),choice['cost_floor']
            modes = {}
            for fixed in (False,True):
                arm_id = r.digest({'dynamic_config_id':choice['config_id'],'sizing':'fixed_0.01'}) if fixed else choice['config_id']
                costs = {}
                for stress in scalp.COSTS:
                    values,combined = [],[]
                    for i,fold in enumerate(r.FOLDS):
                        if not fixed and i < 2:
                            value,logs = study.run_lot(variant,fold,profile,threshold,stress)
                            if value != choice['training'][str(stress)][i]:
                                raise ValueError('Frozen selected training metrics or ledgers changed')
                            counts['selected_training_parity_replays'] += 1
                        else:
                            value,logs = study.run_lot(variant,fold,profile,threshold,stress,fixed)
                            if fixed:
                                counts['fixed_accounts'] += 1;counts['fixed_audited_fills'] += len(logs)
                            else:
                                counts['dynamic_validation_accounts'] += 1;counts['validation_audited_fills'] += len(logs)
                        ledgers.append({'profile':profile['id'],'lane':lane,'sizing':'fixed_0.01' if fixed else 'risk_budget',
                                        'cost':stress,'fold':fold[0],'config_id':arm_id,'trades':logs})
                        values.append(value)
                        if i >= 2:combined.extend(logs)
                    if len({(t['entry_minute'],t['exit_minute'],t['side']) for t in combined}) != len(combined):
                        raise ValueError('Repeated development trades inflated sample')
                    costs[str(stress)] = {'folds':values[2:],'training_folds':values[:2],
                        'aggregate':scalp.refinement.aggregate([v['metrics'] for v in values[2:]]),
                        'trade_ledger_sha256':r.digest(combined)}
                train_rows = {'training':{c:v['training_folds'] for c,v in costs.items()}}
                eligible = scalp.candidate_score(train_rows,catalog['training_requirements_every_year_and_cost'])[0]
                gates = score_validation(costs,eligible)
                modes['fixed_0.01' if fixed else 'risk_budget'] = {'config_id':arm_id,'costs':costs,'training_eligible':eligible,
                    'gates':gates,'qualifies':all(gates.values())}
            lanes[lane] = {'config_id':choice['config_id'],'variant':choice['variant'],'cost_floor':threshold,'modes':modes}
        profiles[profile['id']] = lanes
    output = Path(args['output'])
    r.write_json(output/f'private-selected-ledgers-{symbol}.json',ledgers)
    result = {'symbol':symbol,'profiles':profiles,'counts':counts,'selected_ledgers_sha256':r.digest(ledgers)}
    r.write_json(output/f'validation-summary-{symbol}.json',result)
    print(f'{symbol}: frozen risk-budget and fixed-0.01-lot comparisons complete',flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('cache','calendar','normalized','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--workers',type=int,default=6)
    args = parser.parse_args()
    if args.output.exists():parser.error('Preserve old evidence; output already exists')
    if not 1<=args.workers<=8:parser.error('Use 1-8 workers')
    old_path,catalog_path = ROOT/'docs/xmi-session-scalping-20261107.json',ROOT/'docs/xmi-lot-scalp-catalog-20261107.json'
    previous,catalog = [json.loads(p.read_text()) for p in (old_path,catalog_path)]
    if previous['source']!=r.source_identity() or previous['wrapper_sha256']!=r.file_hash(Path(scalp.__file__)):
        raise ValueError('Frozen scalp engine changed')
    if previous['calendar_sha256']!=r.file_hash(args.calendar):raise ValueError('Audited calendar changed')
    args.output.mkdir(parents=True)
    executable = r.build_executable(args.output)
    provenance = {'catalog':catalog,'catalog_sha256':r.file_hash(catalog_path),'source':r.source_identity(),
        'wrapper_sha256':r.file_hash(Path(__file__)),'source_summary_sha256':r.file_hash(old_path),
        'scalp_wrapper_sha256':r.file_hash(Path(scalp.__file__)),'cost_wrapper_sha256':r.file_hash(Path(cost.__file__)),
        'calendar_sha256':r.file_hash(args.calendar),'starting_equity_usd':1000,'as_of_date':'2026-11-07',
        'validation_evaluated':False,'holdout_archives_read':False}
    r.write_json(args.output/'preregistration.json',provenance)
    paths = {k:str(getattr(args,k).resolve()) for k in ('cache','calendar','normalized','output')}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(train_symbol,s,paths,previous,executable,catalog) for s in previous['catalog']['symbols']]
        training = {x['symbol']:x for x in (f.result() for f in futures)}
    r.write_json(args.output/'training-selection-freeze.json',{'symbols':training,
        'preregistration_sha256':r.file_hash(args.output/'preregistration.json'),'validation_evaluated':False,'holdout_archives_read':False})
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(validate_symbol,s,paths,previous,executable,catalog,training[s]) for s in training]
        validation = {x['symbol']:x for x in (f.result() for f in futures)}
    result = {**provenance,'symbols':{s:{'training':training[s],'reused_validation':validation[s]} for s in training},
        'training_counts':{k:sum(v['counts'][k] for v in training.values()) for k in next(iter(training.values()))['counts']},
        'evaluation_counts':{k:sum(v['counts'][k] for v in validation.values()) for k in next(iter(validation.values()))['counts']},
        'training_selection_freeze_sha256':r.file_hash(args.output/'training-selection-freeze.json'),
        'qualified_strategies':sum(m['qualifies'] for s in validation.values() for p in s['profiles'].values() for lane in p.values() for m in lane['modes'].values()),
        'validation_evaluated':True,'2024_status':'Reused development evidence, not untouched out-of-sample',
        'vendor_downloads':0,'orders_submitted':0,'production_or_staging_changed':False,
        'limitations':previous['limitations']+['Lot conversion, minimum/step and instrument leverage are modeled',
            'Fixed high gold spread is a sensitivity, not a verified historical spread series',
            'Displayed cash margin is recalculated with each historical entry price']}
    r.write_json(args.output/'results.json',result)
    print(json.dumps({'training':result['training_counts'],'evaluation':result['evaluation_counts'],
        'qualified_strategies':result['qualified_strategies'],'results_sha256':r.file_hash(args.output/'results.json')}),flush=True)


if __name__=='__main__':main()

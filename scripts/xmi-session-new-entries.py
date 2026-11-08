#!/usr/bin/env python3
"""Registered new closed-bar entry hypotheses on the fixed 0.01-lot engine."""
import argparse
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
import gzip
from importlib import import_module
import io
from itertools import product
import json
from pathlib import Path

import numpy as np

lot=import_module('xmi-session-lot-rerun')
cash_audit=import_module('xmi-session-lot-audit')
r,scalp=lot.r,lot.scalp
ROOT=Path(__file__).resolve().parents[1]


def lag(values,n=1):
    output=np.full(len(values),np.nan)
    output[n:]=values[:-n]
    return output


def prior_roll(values,n,operation):
    return lag(r.roll(values,n,operation))


def history_ready(frame,required=60):
    indexes=np.arange(len(frame.t))
    resets=np.r_[True,np.diff(frame.t)!=frame.minutes]
    return indexes-np.maximum.accumulate(np.where(resets,indexes,0))+1>=required


def entry_signals(frame,frames,rule,parameter,window_ids=None):
    """Every feature at row i is known at that row's candle close."""
    c,o,h,low=frame.c,frame.o,frame.h,frame.low
    core=frame.core();atr,rsi,adx=(core[k] for k in ('atr','rsi','adx'))
    ready=history_ready(frame)
    fast,slow=frame.ema(10),frame.ema(30)
    width=np.maximum(h-low,1e-12)
    bullish,bearish=c>o,c<o
    upper,lower=prior_roll(h,parameter,'max'),prior_roll(low,parameter,'min')
    if rule=='entry-compression':
        tight=upper-lower<=2*lag(atr)
        body=np.abs(c-o)>=.6*width
        long=tight&body&bullish&(c>upper+.1*atr)&(frame.ema(20)>frame.ema(50))
        short=tight&body&bearish&(c<lower-.1*atr)&(frame.ema(20)<frame.ema(50))
    elif rule=='entry-sweep':
        inside=(c>lower)&(c<upper)&(adx<=25)
        long=inside&(low<lower-.1*atr)&(np.minimum(o,c)-low>=.5*width)&(rsi<45)
        short=inside&(h>upper+.1*atr)&(h-np.maximum(o,c)>=.5*width)&(rsi>55)
    elif rule=='entry-pullback':
        higher=frames[15]
        bias=frame.higher(higher,higher.ema(20)-higher.ema(50))
        long=(prior_roll(c-fast,parameter,'min')<=0)&bullish&(c>upper)&(fast>slow)&(slow>lag(slow,3))&(adx>=20)&(bias>0)
        short=(prior_roll(c-fast,parameter,'max')>=0)&bearish&(c<lower)&(fast<slow)&(slow<lag(slow,3))&(adx>=20)&(bias<0)
    elif rule=='entry-impulse-reversal':
        tr=np.maximum.reduce((h-low,np.abs(h-lag(c)),np.abs(low-lag(c))))
        impulse=lag(tr)>=(parameter/10)*lag(atr,2)
        po,pc=lag(o),lag(c);mid=(po+pc)/2
        long=impulse&(pc<po)&(lag(rsi)<=35)&bullish&(c>mid)&(c<po)
        short=impulse&(pc>po)&(lag(rsi)>=65)&bearish&(c<mid)&(c>po)
    elif rule=='entry-band-return':
        center,sd=prior_roll(c,parameter,'mean'),prior_roll(c,parameter,'std')
        bottom,top=center-2*sd,center+2*sd
        common=(adx<=20)&(np.abs(c-o)>=.25*atr)
        long=common&(low<bottom)&(c>bottom)&(c<center)&bullish&(rsi<45)
        short=common&(h>top)&(c<top)&(c>center)&bearish&(rsi>55)
    elif rule=='entry-break-retest':
        if window_ids is None:raise ValueError('Break/retest needs entry-window identities')
        active=window_ids>=0
        up=ready&active&(c>upper+.1*atr)&(fast>slow)
        down=ready&active&(c<lower-.1*atr)&(fast<slow)
        index=np.arange(len(c));latest=lag(np.maximum.accumulate(np.where(up|down,index,-1000000)))
        long,short=np.zeros(len(c),dtype=bool),np.zeros(len(c),dtype=bool)
        for age in (1,2,3):
            same=(latest==index-age)&active&(window_ids==lag(window_ids,age))
            up_level,down_level=lag(upper,age),lag(lower,age)
            buffer=.1*lag(atr,age)
            valid_long,valid_short=same.copy(),same.copy()
            for held in range(1,age):
                valid_long&=lag(c,held)>=up_level-buffer
                valid_short&=lag(c,held)<=down_level+buffer
            long|=valid_long&(lag(up,age)==1)&(low<=up_level+buffer)&(c>up_level+buffer)&bullish
            short|=valid_short&(lag(down,age)==1)&(h>=down_level-buffer)&(c<down_level-buffer)&bearish
    else:
        raise ValueError('Unknown registered entry family')
    long,short=long&ready,short&ready
    return np.where(long&~short,1,np.where(short&~long,-1,0)).astype(np.int8)


class EntryStudy(lot.LotStudy):
    def plan(self,variant):
        if not variant.rule.startswith('entry-'):return super().plan(variant)
        if not hasattr(self,'entry_plans'):self.entry_plans,self.entry_signals_cache={},{}
        key=(variant.rule,variant.minutes,variant.window,variant.rule_parameter)
        if key in self.entry_plans:return self.entry_plans[key]
        frame,session=self.frames[variant.minutes],self.sessions[variant.window]
        cache_key=(variant.rule,variant.minutes,variant.rule_parameter,
                   variant.window if variant.rule=='entry-break-retest' else None)
        if cache_key not in self.entry_signals_cache:
            safe=np.minimum(frame.next,len(self.t)-1)
            ids=np.where((frame.next<len(self.t))&(self.t[safe]==frame.decision),session.begin[safe],-1)
            self.entry_signals_cache[cache_key]=entry_signals(frame,self.frames,variant.rule,variant.rule_parameter,ids)
        signals=self.entry_signals_cache[cache_key]
        keep=np.flatnonzero((signals!=0)&(frame.next<len(self.t)))
        first=frame.next[keep]
        valid=(self.t[first]==frame.decision[keep])&(session.begin[first]>=0)
        keep,first=keep[valid],first[valid]
        ends=np.ascontiguousarray(session.end[first])
        plan=(first.astype(np.int32),ends,np.ascontiguousarray(signals[keep]),
              np.ascontiguousarray(frame.core()['atr'][keep]),None,ends.copy())
        plan=scalp.screen.restrict_plan(self.t,plan,self.restrictions)
        self.entry_plans[key]=plan
        return plan


def variants(catalog):
    for window,rule in product(catalog['windows'],catalog['rules']):
        for parameter,minutes,hold,risk in product(rule['parameters'],catalog['signal_minutes'],
                catalog['holding_caps_minutes'],catalog['risk_ceiling_fractions']):
            yield r.Variant(rule['id'],minutes,window,risk,catalog['stop_atr'],catalog['gross_target_r'],hold,parameter)


def study_for(symbol,args,executable):
    original=json.loads((ROOT/'docs/xmi-session-scalping-20261107.json').read_text())
    source=json.loads((ROOT/'docs/xmi-session-calendar-rerun-2022-2024.json').read_text())
    calendar=scalp.screen.controls.load_calendar(Path(args['calendar']))
    restrictions=scalp.screen.controls.build_profiles(symbol,calendar,source['event_settings'],False,
        period=scalp.screen.PERIOD)['news+rollover']
    if restrictions.coverage_missing:raise ValueError('Incomplete calendar')
    return EntryStudy(Path(args['cache']),Path(args['normalized']),symbol,executable,
        original['catalog']['windows'],restrictions,original['symbols'][symbol]['training']['archives'])


def train_symbol(symbol,args,previous,executable,catalog):
    study=study_for(symbol,args,executable);output=Path(args['output'])
    counts={'configurations':0,'training_accounts':0,'training_fills':0,'eligible_training':0,'prior_control_parity_accounts':0}
    profiles={}
    for profile in previous['catalog']['profiles']:
        if profile['symbols']!='all' and symbol not in profile['symbols']:continue
        for lane,old in previous['symbols'][symbol]['reused_validation']['profiles'][profile['id']].items():
            for stress in scalp.COSTS:
                for i,fold in enumerate(r.FOLDS):
                    actual,_=study.run_lot(r.Variant(**old['variant']),fold,profile,old['cost_floor'],stress,True)
                    c=old['modes']['fixed_0.01']['costs'][str(stress)]
                    expected=c['training_folds'][i] if i<2 else c['folds'][i-2]
                    if actual!=expected:raise ValueError('Prior fixed-lot control changed')
                    counts['prior_control_parity_accounts']+=1
        leaders={};eligible=0;filename=f"training-{symbol}-{profile['id']}.ndjson.gz"
        with (output/filename).open('xb') as raw,gzip.GzipFile(fileobj=raw,filename='',mode='wb',mtime=0) as compressed,io.TextIOWrapper(compressed,encoding='utf-8') as stream:
            for variant in variants(catalog):
                for floor in catalog['cost_floors']:
                    spec={'symbol':symbol,'profile':profile['id'],'variant':asdict(variant),'cost_floor':floor,'sizing':'fixed_0.01'}
                    row={**spec,'config_id':r.digest(spec),'training':{}}
                    for stress in scalp.COSTS:
                        values=[]
                        for fold in r.FOLDS[:2]:
                            value,_=study.run_lot(variant,fold,profile,floor,stress,True)
                            values.append(value);counts['training_accounts']+=1;counts['training_fills']+=value['metrics']['n']
                        row['training'][str(stress)]=values
                    score=scalp.candidate_score(row,previous['catalog']['training_requirements_every_year_and_cost'])
                    row['training_eligible'],row['training_rank']=score[0],score
                    counts['configurations']+=1;counts['eligible_training']+=int(score[0]);eligible+=int(score[0])
                    lane=r.lane_for(variant.window)
                    if lane not in leaders or score>tuple(leaders[lane]['training_rank']):leaders[lane]=row
                    stream.write(json.dumps(row,separators=(',',':'),allow_nan=False)+'\n')
        profiles[profile['id']]={'leaders':leaders,'training_eligible':eligible,'results_file':filename,'results_sha256':r.file_hash(output/filename)}
        print(f"{symbol}/{profile['id']}: 3456 new-entry configurations; {eligible} training-eligible",flush=True)
    result={'symbol':symbol,'profiles':profiles,'counts':counts,'archives':study.manifest,
            'normalized_cache':study.normalized_record,'coverage':{w:s.coverage for w,s in study.sessions.items()}}
    r.write_json(output/f'training-summary-{symbol}.json',result)
    return result


def validate_symbol(symbol,args,previous,executable,training):
    study=study_for(symbol,args,executable);profiles={};ledgers=[]
    counts={'validation_accounts':0,'training_parity_replays':0,'price_audited_accounts':0,'price_audited_fills':0}
    for profile in previous['catalog']['profiles']:
        if profile['id'] not in training['profiles']:continue
        lanes={}
        for lane,choice in training['profiles'][profile['id']]['leaders'].items():
            variant=r.Variant(**choice['variant']);costs={}
            first,_,directions,_,_,_=study.plan(variant)
            for stress in scalp.COSTS:
                rows=[];combined=[]
                for i,fold in enumerate(r.FOLDS):
                    value,trades=study.run_lot(variant,fold,profile,choice['cost_floor'],stress,True)
                    if i<2:
                        if value!=choice['training'][str(stress)][i]:raise ValueError('Frozen training replay changed')
                        counts['training_parity_replays']+=1
                    else:
                        counts['validation_accounts']+=1;rows.append(value);combined.extend(trades)
                    equity=1000.
                    for trade in trades:
                        at=int(np.searchsorted(first,np.searchsorted(study.t,trade['entry_minute'])))
                        if at>=len(first) or study.t[first[at]]!=trade['entry_minute'] or directions[at]!=trade['side']:
                            raise ValueError('Fill lacks the registered closed-bar entry signal')
                        equity=cash_audit.audit_fill(study,variant,profile,choice['cost_floor'],stress,'fixed_0.01',trade,equity,previous['catalog']['contracts'])
                    if abs(equity-1000-value['metrics']['net_usd'])>1e-5:raise ValueError('Cash audit did not reconcile')
                    counts['price_audited_accounts']+=1;counts['price_audited_fills']+=len(trades)
                    ledgers.append({'profile':profile['id'],'lane':lane,'fold':fold[0],'cost':stress,'config_id':choice['config_id'],'trades':trades})
                if len({(t['entry_minute'],t['exit_minute'],t['side']) for t in combined})!=len(combined):raise ValueError('Duplicate development trade')
                costs[str(stress)]={'folds':rows,'aggregate':scalp.refinement.aggregate([v['metrics'] for v in rows]),'trade_ledger_sha256':r.digest(combined)}
            gates=lot.score_validation(costs,choice['training_eligible'])
            lanes[lane]={'config_id':choice['config_id'],'variant':choice['variant'],'cost_floor':choice['cost_floor'],
                         'training_eligible':choice['training_eligible'],'costs':costs,'gates':gates,'qualifies':all(gates.values())}
        profiles[profile['id']]=lanes
    output=Path(args['output']);r.write_json(output/f'private-selected-ledgers-{symbol}.json',ledgers)
    result={'symbol':symbol,'profiles':profiles,'counts':counts,'selected_ledgers_sha256':r.digest(ledgers)}
    r.write_json(output/f'validation-summary-{symbol}.json',result)
    print(f'{symbol}: frozen new entries evaluated and independently price-audited',flush=True)
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('cache','calendar','normalized','output'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--workers',type=int,default=6);args=parser.parse_args()
    if args.output.exists():parser.error('Preserve existing evidence; output exists')
    if not 1<=args.workers<=8:parser.error('Use 1-8 workers')
    old_path=ROOT/'docs/xmi-session-lot-rerun-20261107.json';catalog_path=ROOT/'docs/xmi-new-scalp-entry-catalog-20261107.json'
    previous,catalog=[json.loads(p.read_text()) for p in (old_path,catalog_path)]
    if previous['source']!=r.source_identity() or previous['wrapper_sha256']!=r.file_hash(Path(lot.__file__)):raise ValueError('Frozen execution changed')
    if previous['calendar_sha256']!=r.file_hash(args.calendar):raise ValueError('Audited calendar changed')
    args.output.mkdir(parents=True);executable=r.build_executable(args.output)
    provenance={'catalog':catalog,'catalog_sha256':r.file_hash(catalog_path),'source':r.source_identity(),
        'source_execution_sha256':r.file_hash(old_path),'wrapper_sha256':r.file_hash(Path(__file__)),
        'lot_wrapper_sha256':r.file_hash(Path(lot.__file__)),'cash_auditor_sha256':r.file_hash(Path(cash_audit.__file__)),
        'calendar_sha256':r.file_hash(args.calendar),'execution_profiles':previous['catalog']['profiles'],
        'contracts':previous['catalog']['contracts'],'starting_equity_usd':1000,'as_of_date':'2026-11-07',
        'new_entry_validation_evaluated':False,'holdout_archives_read':False}
    r.write_json(args.output/'preregistration.json',provenance)
    paths={k:str(getattr(args,k).resolve()) for k in ('cache','calendar','normalized','output')}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(train_symbol,s,paths,previous,executable,catalog) for s in previous['symbols']]
        training={v['symbol']:v for v in (f.result() for f in futures)}
    r.write_json(args.output/'training-selection-freeze.json',{'symbols':training,
        'preregistration_sha256':r.file_hash(args.output/'preregistration.json'),'new_entry_validation_evaluated':False,'holdout_archives_read':False})
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(validate_symbol,s,paths,previous,executable,training[s]) for s in training]
        validation={v['symbol']:v for v in (f.result() for f in futures)}
    result={**provenance,'symbols':{s:{'training':training[s],'reused_validation':validation[s]} for s in training},
        'training_counts':{k:sum(x['counts'][k] for x in training.values()) for k in next(iter(training.values()))['counts']},
        'evaluation_counts':{k:sum(x['counts'][k] for x in validation.values()) for k in next(iter(validation.values()))['counts']},
        'training_selection_freeze_sha256':r.file_hash(args.output/'training-selection-freeze.json'),
        'qualified_strategies':sum(row['qualifies'] for x in validation.values() for p in x['profiles'].values() for row in p.values()),
        'new_entry_validation_evaluated':True,'2024_status':'Previously reused development, never untouched out-of-sample',
        'vendor_downloads':0,'orders_submitted':0,'production_or_staging_changed':False,
        'limitations':previous['limitations']+['All six new patterns are modeled hypotheses, not verified market manipulation signals',
            'The same 0.01-lot and conditional contract/cost assumptions are retained']}
    r.write_json(args.output/'results.json',result)
    print(json.dumps({'training':result['training_counts'],'evaluation':result['evaluation_counts'],
        'qualified_strategies':result['qualified_strategies'],'results_sha256':r.file_hash(args.output/'results.json')}),flush=True)


if __name__=='__main__':main()

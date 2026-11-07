#!/usr/bin/env python3
"""Independently reconcile registered inventories and lot/cash fill accounting."""
import argparse
from importlib import import_module
import gzip
import json
from pathlib import Path

import numpy as np

run = import_module('xmi-session-lot-rerun')
r = run.r


def audit_fill(study,variant,profile,threshold,stress,mode,trade,equity,contracts):
    left,right = np.searchsorted(study.t,[trade['entry_minute'],trade['exit_minute']])
    assert study.t[left]==trade['entry_minute'] and study.t[right]==trade['exit_minute']
    assert 1<=study.t[right]+1-study.t[left]<=variant.hold_minutes<=15
    frame=study.frames[variant.minutes]
    row=int(np.searchsorted(frame.decision,trade['entry_minute']))
    assert frame.decision[row]==trade['entry_minute']
    direction=trade['side'];distance=variant.stop_atr*float(frame.core()['atr'][row])
    entry=float(study.prices[0,left]);stop=entry-direction*distance;target=entry+direction*distance*variant.reward
    gold=study.symbol=='XAUUSD';usd_base=study.symbol.startswith('USD')
    pip=.01 if study.symbol.endswith('JPY') else .0001
    spread=(profile['gold_spread_price'] if gold else 2*pip)*stress
    slip=(.07 if gold else .3*pip)*stress
    friction=spread+2*slip
    contract=contracts['gold_price_multiplier_per_lot' if gold else 'fx_units_per_lot']
    units=trade['size_lots']*contract
    assert trade['size_lots']>=.01 and abs(trade['size_lots']/.01-round(trade['size_lots']/.01))<1e-6
    if mode=='fixed_0.01':assert trade['size_lots']==.01
    assert variant.reward*distance/friction+1e-10>=threshold
    # A held earlier minute must not contain an unexecuted protective bracket.
    if right>left:
        lows,highs=study.prices[2,left:right],study.prices[1,left:right]
        assert not np.any((lows<=stop) if direction>0 else (highs>=stop))
        assert not np.any((highs>=target) if direction>0 else (lows<=target))
    op=float(study.prices[0,right]);high=float(study.prices[1,right]);low=float(study.prices[2,right])
    stop_gap=direction*(op-stop)<=0;target_gap=direction*(op-target)>=0
    adverse=low if direction>0 else high;favorable=high if direction>0 else low
    touched_stop=direction*(adverse-stop)<=0;touched_target=direction*(favorable-target)>=0
    reason=trade['exit_reason']
    if reason==1:
        assert stop_gap or (not target_gap and touched_stop)
        exit=op if stop_gap else stop
    elif reason==2:
        assert not stop_gap and (target_gap or (touched_target and not touched_stop))
        exit=target
    elif reason==3:
        assert not (stop_gap or target_gap or touched_stop or touched_target)
        exit=float(study.prices[3,right])
    elif reason==4:
        assert not (stop_gap or target_gap or touched_stop or touched_target)
        exit=adverse
    else:
        raise AssertionError('Unexpected opposite or unregistered exit')
    gross=units*direction*(exit-entry)/(exit if usd_base else 1.)
    cash_cost=units*friction/(exit if usd_base else 1.)
    leverage=profile['gold_leverage' if gold else 'fx_leverage']
    margin=units*(1. if usd_base else entry+spread)/leverage
    risk=units*(distance+friction)/(min(entry,stop) if usd_base else 1.)
    for key,expected in [('gross_pnl_usd',gross),('cost_usd',cash_cost),('pnl_usd',gross-cash_cost),
                         ('margin_usd',margin),('initial_stop_risk_usd',risk),('cash_equity_before_usd',equity),
                         ('risk_budget_usd',equity*variant.risk)]:
        assert abs(trade[key]-expected)<1e-7,(key,trade[key],expected)
    assert margin<=equity*.9+1e-7 and risk<=equity*variant.risk+1e-7
    study.restrictions.verify_trade(trade['entry_minute']*60000,(trade['exit_minute']+1)*60000-1)
    return equity+gross-cash_cost


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('cache','calendar','normalized','output'):parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();result=json.loads((args.output/'results.json').read_text())
    previous=json.loads((run.ROOT/'docs/xmi-session-scalping-20261107.json').read_text())
    assert r.file_hash(args.output/'training-selection-freeze.json')==result['training_selection_freeze_sha256']
    profiles={x['id']:x for x in result['catalog']['profiles']}
    counts={'configurations':0,'training_accounts':0,'training_audited_fills':0,'selected_accounts':0,'selected_price_audited_fills':0}
    paths={k:str(getattr(args,k).resolve()) for k in ('cache','calendar','normalized','output')}
    executable=r.build_executable(args.output)
    for symbol,entry in result['symbols'].items():
        for profile_name,summary in entry['training']['profiles'].items():
            path=args.output/summary['results_file'];assert r.file_hash(path)==summary['results_sha256']
            ids=set();best={}
            with gzip.open(path,'rt') as stream:
                for line in stream:
                    row=json.loads(line);assert row['config_id'] not in ids;ids.add(row['config_id'])
                    spec={k:row[k] for k in ('symbol','profile','variant','cost_floor','sizing')}
                    assert r.digest(spec)==row['config_id']
                    score=run.scalp.candidate_score(row,result['catalog']['training_requirements_every_year_and_cost'])
                    assert score==tuple(row['training_rank'])
                    lane=r.lane_for(row['variant']['window'])
                    if lane not in best or score>best[lane][0]:best[lane]=(score,row['config_id'])
                    counts['configurations']+=1
                    for folds in row['training'].values():
                        for account in folds:
                            assert account['metrics']['n']==account['audits']['audited_trades']
                            assert account['audits']['maximum_elapsed_holding_upper_bound_minutes']<=row['variant']['hold_minutes']
                            assert account['audits']['liquidation_audit_breaches']==0
                            counts['training_accounts']+=1;counts['training_audited_fills']+=account['metrics']['n']
            assert len(ids)==2016
            for lane,selected in summary['leaders'].items():assert best[lane][1]==selected['config_id']
        study=run.study_for(symbol,paths,previous,executable)
        ledgers=json.loads((args.output/f'private-selected-ledgers-{symbol}.json').read_text())
        assert r.digest(ledgers)==entry['reused_validation']['selected_ledgers_sha256']
        for ledger in ledgers:
            lane=entry['reused_validation']['profiles'][ledger['profile']][ledger['lane']]
            mode=lane['modes'][ledger['sizing']];value=mode['costs'][str(float(ledger['cost']))]
            training=ledger['fold'].startswith('train')
            index=0 if ledger['fold'] in ('train_2022','validation_h1_2024') else 1
            expected=value['training_folds' if training else 'folds'][index]
            assert mode['config_id']==ledger['config_id'] and r.digest(ledger['trades'])==expected['trade_ledger_sha256']
            assert len(ledger['trades'])==expected['metrics']['n']
            equity=1000.;variant=r.Variant(**lane['variant'])
            for trade in ledger['trades']:
                equity=audit_fill(study,variant,profiles[ledger['profile']],lane['cost_floor'],ledger['cost'],
                                  ledger['sizing'],trade,equity,result['catalog']['contracts'])
                counts['selected_price_audited_fills']+=1
            assert abs(equity-1000-expected['metrics']['net_usd'])<1e-5
            counts['selected_accounts']+=1
        print(f'{symbol}: complete inventory, selected cash/P&L and bracket audit passed',flush=True)
    assert counts['configurations']==18144 and counts['training_accounts']==108864
    assert counts['training_audited_fills']==result['training_counts']['audited_fills']
    assert counts['selected_accounts']==648
    audit={'counts':counts,'all_checks_passed':True,'full_results_sha256':r.file_hash(args.output/'results.json'),
           'auditor_sha256':r.file_hash(Path(__file__)),'method':'Independent Python price/bracket/currency/margin reconciliation; no C++ replay used to derive fill P/L',
           'limits':'Audits execution conditional on modeled contract and cost inputs; does not verify broker historical quotes'}
    r.write_json(args.output/'independent-audit.json',audit)
    print(json.dumps(audit),flush=True)


if __name__=='__main__':main()

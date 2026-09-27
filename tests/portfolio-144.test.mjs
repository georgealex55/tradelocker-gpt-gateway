import test from 'node:test';
import assert from 'node:assert/strict';
import { combinations, riskPercent, newsBlocked, M15, COSTS, REQUIRED_EVENTS } from '../lib/research/policies.mjs';
import { sizePosition, exitAt, simulate, summarize } from '../lib/research/engine.mjs';
import { validateDataset, preparePair, fitSchedule } from '../lib/research/prepare.mjs';

const metadata = { symbol:'EURUSD', pipSize:0.0001,lotSize:100000,minLot:0.01,lotStep:0.01,maxLot:50,baseCurrency:'EUR',quotingCurrency:'USD' };
const t = Date.parse('2025-02-03T08:00:00Z');
const combo = { ...combinations()[0], risk:'1.00', positions:2 };
function fixture(symbols = ['EURUSD'], opts={}) {
  const pairs={};
  for(const s of symbols) {
    const m={ ...metadata,symbol:s,baseCurrency:s.slice(0,3),quotingCurrency:s.slice(3) };
    const price=s==='USDCHF'?0.9:1.1;
    pairs[s]={metadata:m,candles:[{time:t,open:price,close:price,high:price+0.0002,low:price-0.0002},{time:t+M15,open:price,close:price,high:price+0.004,low:price-0.004},{time:t+2*M15,open:price,close:price,high:price+0.001,low:price-0.001}],tapes:{20:{[t]:{action:'BUY',stopLoss:price-0.0012,regime:{checks:{adx:35,pdi:30,mdi:10}}}}}};
  }
  return {pairs,blackouts:[],...opts};
}
test('144 unique IDs and exactly 48 trade-policy combinations',()=>{
  const rows=combinations(); assert.equal(rows.length,144);assert.equal(rows[0].id,'C001');assert.equal(rows.at(-1).id,'C144');
  assert.equal(new Set(rows.map(({risk,positions,daily,news,parameters})=>JSON.stringify([risk,positions,daily,news,parameters]))).size,48);
});
test('adaptive uses only explicit completed regime conditions',()=>{
  assert.equal(riskPercent('ADAPTIVE',{regime:{checks:{adx:30,pdi:25,mdi:15}}}),1);
  assert.equal(riskPercent('ADAPTIVE',{regime:{checks:{adx:29,pdi:50,mdi:10}}}),0.75);
  assert.equal(riskPercent('ADAPTIVE',{}),0.75);
});
test('minimum lots include transaction costs and never round up',()=>{
  const a=sizePosition({entry:1.1,stop:1.0985,metadata,equity:200,percent:0.75,committedRisk:0,costPrice:0.00024,maxPositions:1});assert.equal(a.skip,'MIN_LOT_RISK_SKIP');
  const b=sizePosition({entry:1.1,stop:1.0985,metadata,equity:200,percent:1,committedRisk:0,costPrice:0.00024,maxPositions:1});assert.equal(b.lots,0.01);assert.ok(b.riskAmount<=2);
  const c=sizePosition({entry:1.1,stop:1.0985,metadata,equity:200,percent:1,committedRisk:1.74,costPrice:0.00024,maxPositions:2});assert.equal(c.skip,'PORTFOLIO_RISK_CAP');
});
test('same-bar ambiguity resolves stop-first; adverse gaps fill open',()=>{
  const p={side:'BUY',stopLoss:1,takeProfit:1.2};
  assert.deepEqual(exitAt(p,{open:1.1,low:0.9,high:1.3}),{price:1,reason:'STOP_LOSS'});
  assert.deepEqual(exitAt(p,{open:0.9,low:0.8,high:1.3}),{price:0.9,reason:'GAP_STOP'});
});
test('news checked at actual entry, cooldown requires fresh pullback',()=>{
  const b=[{from:'2025-02-03T08:00:00Z',to:'2025-02-03T09:00:00Z',currencies:['USD']}];
  assert.equal(newsBlocked('EURUSD',t-M15,t,'STRICT_BLACKOUT',b),true);
  assert.equal(newsBlocked('EURUSD',t+5*M15,t+6*M15,'STRICT_BLACKOUT',b),false);
  assert.equal(newsBlocked('EURUSD',t+5*M15,t+6*M15,'COOLDOWN',b),true);
  assert.equal(newsBlocked('EURUSD',t+9*M15,t+10*M15,'COOLDOWN',b),false);
});
test('actual-next-open entry and 1.8R target use actual gap distance',()=>{
  const p=fixture();p.pairs.EURUSD.candles[1].open=1.1003;
  const r=simulate({prepared:p,combo,costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD']});
  assert.equal(r.trades.length,1);assert.equal(r.trades[0].entryTime,t+M15);assert.equal(r.trades[0].entryPrice,1.1003);
  assert.ok(Math.abs((r.trades[0].takeProfit-r.trades[0].entryPrice)/(r.trades[0].entryPrice-r.trades[0].stopLoss)-1.8)<1e-9);
  assert.equal(r.trades[0].reason,'STOP_LOSS');
});
test('entry-time spread fraction rejects narrow stop after gap',()=>{
  const p=fixture();p.pairs.EURUSD.candles[1].open=1.0997;
  const r=simulate({prepared:p,combo,costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD']});assert.equal(r.metrics.spreadBlocked,1);assert.equal(r.trades.length,0);
});
test('one portfolio slot blocks simultaneous setups without future intrabar exits',()=>{
  const p=fixture(['EURUSD','GBPUSD']);
  const r=simulate({prepared:p,combo:{...combo,positions:1},costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD','GBPUSD']});
  assert.equal(r.trades.length,1);assert.equal(r.metrics.capacityBlocked,1);
});
test('two slots respect aggregate risk, budget reduces after loss',()=>{
  const p=fixture(['EURUSD','GBPUSD']);
  const r=simulate({prepared:p,combo,costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD','GBPUSD']});
  assert.equal(r.trades.length,2);assert.ok(r.peakCommittedRisk<=3+1e-9);assert.ok(r.metrics.endingBalance<200);
});
test('objective cannot change trades or equity',()=>{
  const p=fixture();const a=simulate({prepared:p,combo,costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD']});
  const b=simulate({prepared:p,combo:{...combo,objective:'RETURN'},costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['EURUSD']});assert.deepEqual(a,b);
});
test('prefix result does not change when future candles change',()=>{
  const p=fixture();const q=structuredClone(p);q.pairs.EURUSD.candles.at(-1).close=9;
  const args={combo,costs:COSTS.BASE,from:t,to:t+2*M15,symbols:['EURUSD']};assert.deepEqual(simulate({prepared:p,...args}),simulate({prepared:q,...args}));
});
test('no-loss PF serializes explicitly without Infinity becoming misleading zero',()=>{
  const m=summarize([{pnl:2,rMultiple:1,stopPips:10,side:'BUY'}]);assert.equal(m.profitFactor,null);assert.equal(m.profitFactorState,'NO_LOSSES');
});
test('drawdown includes starting balance peak',()=>{
  const m=summarize([{pnl:-2,rMultiple:-1,stopPips:10,side:'BUY'}]);assert.equal(m.maxDrawdownDollars,2);assert.equal(m.maxDrawdownPercent,1);
});
test('invalid broker dataset is rejected before evaluation',()=>{assert.throws(()=>validateDataset({source:'synthetic'}),/TradeLocker/);});
test('production strategy config remains 1.2.0 $500; research is isolated',async()=>{
  const {FOREX_STRATEGY_V1_CONFIG:c}=await import('../lib/forexStrategyV1Config.js');assert.equal(c.version,'1.2.0');assert.equal(c.capital.startingBalanceUsd,500);assert.deepEqual(c.universe.preferredSymbols,['USDCHF']);
});
test('actual strategy tape is prefix invariant with completed H1 data',()=>{
  const candles=Array.from({length:1100},(_,i)=>{const v=1.1+Math.sin(i/20)*0.001+i*0.000001;return{time:Date.parse('2025-01-06T00:00:00Z')+i*M15,open:v,close:v+0.00001,high:v+0.0001,low:v-0.0001};});
  const a=preparePair({metadata,candles:candles.slice(0,1000)}),b=preparePair({metadata,candles});
  for(const adx of [20,25,30])assert.deepEqual(a.tapes[adx],Object.fromEntries(Object.entries(b.tapes[adx]).filter(([time])=>Number(time)<candles[1000].time)));
});

test('portfolio daily limit and per-pair limit produce distinct entry counts',()=>{
  const p=fixture(['EURUSD','GBPUSD']);
  for(const pair of Object.values(p.pairs)) {
    const base=pair.candles[0];pair.candles=Array.from({length:40},(_,i)=>({...base,time:t+i*M15}));
    // First trade exits immediately at target, second starts after cooldown.
    for(const i of [1,7,13]){pair.candles[i].high=1.104;pair.tapes[20][t+(i-1)*M15]={action:'BUY',stopLoss:1.0988};}
  }
  const common={prepared:p,costs:COSTS.BASE,from:t,to:t+40*M15,symbols:['EURUSD','GBPUSD']};
  const portfolio=simulate({...common,combo:{...combo,daily:'PORTFOLIO'}});
  const perPair=simulate({...common,combo:{...combo,daily:'PER_PAIR'}});
  assert.equal(portfolio.metrics.tradeCount,2);assert.equal(perPair.metrics.tradeCount,4);assert.ok(portfolio.metrics.skips.DAILY_TRADE_LIMIT>0);
});
test('USDCHF position P&L converts CHF into USD at historical exit price',()=>{
  const p=fixture(['USDCHF']);const r=simulate({prepared:p,combo,costs:COSTS.BASE,from:t,to:t+3*M15,symbols:['USDCHF']});
  const tr=r.trades[0];const expected=(tr.exitPrice-tr.entryPrice-tr.costPrice)*tr.units/tr.exitPrice;
  assert.ok(Math.abs(tr.pnl-expected)<1e-10);assert.ok(tr.riskAmount<=2);
});
test('no future validation candles affect first fold parameter selection',()=>{
  const p=fixture(['USDCHF','EURUSD','GBPUSD']);p.from=t;p.to=t+120*M15;
  for(const pair of Object.values(p.pairs)){const base=pair.candles[0];pair.candles=Array.from({length:120},(_,i)=>({...base,time:t+i*M15}));pair.tapes[25]={};pair.tapes[30]={};}
  const first=fitSchedule(p)[0];const q=structuredClone(p);
  for(const pair of Object.values(q.pairs))for(const c of pair.candles)if(c.time>=first.from){c.high+=0.5;c.low-=0.5;}
  assert.deepEqual(fitSchedule(q)[0],first);assert.equal(first.selected.EURUSD,20);assert.equal(first.evidence.EURUSD.fallback,true);
});
test('all 144 combinations execute on fixtures without scoring duplicates changing history',async()=>{
  const {evaluateCombo}=await import('../lib/research/prepare.mjs');
  const p=fixture(['USDCHF','EURUSD','GBPUSD']);p.from=t;p.to=t+3*M15;
  const schedule=[{from:t,to:p.to,selected:{USDCHF:20,EURUSD:20,GBPUSD:20}}];
  const rows=combinations().map(c=>evaluateCombo(p,c,schedule));assert.equal(rows.length,144);
  for(let i=0;i<144;i+=3){assert.deepEqual(rows[i].validation,rows[i+1].validation);assert.deepEqual(rows[i].validation,rows[i+2].validation);assert.equal(rows[i].eligible,false);}
});

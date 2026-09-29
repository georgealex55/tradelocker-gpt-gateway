// Independent ledger checks for frozen research output; no network or writes.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { combinations, COSTS, M15 } from '../lib/research/policies.mjs';
const file=process.argv[2] || 'research-output/results.json';
const expected=Number(process.argv[3] || 12);
const data=JSON.parse(await fs.readFile(file,'utf8'));
// A resumed run can already contain more than the initial controlled subset.
if(process.argv[4]==='pilot') {
  const ids=new Set(combinations().slice(0,expected).map(c=>c.id));
  data.results=data.results.filter(r=>ids.has(r.combo_id));
  data.completed=data.results.filter(r=>r.status==='COMPLETED').length;
  data.failures=data.results.filter(r=>r.status==='FAILED').length;
}
assert.equal(data.completed,expected);
assert.equal(data.failures,0);
const rows=data.results.filter(r=>r.status==='COMPLETED');
assert.equal(rows.length,expected);
assert.equal(new Set(rows.map(r=>r.combo_id)).size,expected);
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const policies=new Map();
let ledgerChecks=0;
for(const row of rows) {
  const r=row.result_json,c=r.combo;
  assert.deepEqual(c,combinations().find(x=>x.id===row.combo_id));
  const key=JSON.stringify([c.risk,c.positions,c.daily,c.news,c.parameters]);
  if(policies.has(key))for(const scope of ['descriptive','validation','stress'])assert.deepEqual(r[scope],policies.get(key)[scope]);
  else policies.set(key,r);
  for(const scope of ['descriptive','validation','stress']) {
    const s=r[scope],cost=scope==='stress'?COSTS.STRESS:COSTS.BASE;
    assert.equal(s.metrics.startingBalance,200);
    assert.equal(s.metrics.tradeCount,s.trades.length);
    near(s.metrics.endingBalance,200+s.trades.reduce((n,t)=>n+t.pnl,0));
    const events=[];
    for(const [i,t] of s.trades.entries()) {
      assert.equal(t.entryTime,t.signalTime+M15);
      assert.ok(t.entryTime>=s.from&&t.exitTime>=t.entryTime&&t.exitTime<s.to);
      near(t.lots,.01);near(t.units,1000);
      near(Math.abs(t.takeProfit-t.entryPrice),1.8*Math.abs(t.entryPrice-t.stopLoss));
      near(t.costPrice,(cost.spreadPips+2*cost.slippagePips)*.0001);
      const direction=t.side==='BUY'?1:-1;
      const conversion=t.symbol==='USDCHF'?1/t.exitPrice:1;
      near(t.pnl,((t.exitPrice-t.entryPrice)*direction-t.costPrice)*t.units*conversion);
      near(t.rMultiple,t.pnl/t.riskAmount);
      assert.ok(t.riskAmount>0&&t.riskAmount<=t.targetRiskAmount+1e-8);
      events.push({time:t.entryTime,entry:true,t,i},{time:t.exitTime,entry:false,t,i});
    }
    events.sort((a,b)=>a.time-b.time||Number(b.entry)-Number(a.entry)||a.i-b.i);
    let equity=200;const open=new Map(),daily=new Map();
    for(const e of events) {
      if(e.entry) {
        assert.ok(open.size<c.positions);
        assert.ok(![...open.values()].some(t=>t.symbol===e.t.symbol));
        const committed=[...open.values()].reduce((n,t)=>n+t.riskAmount,0);
        assert.ok(committed+e.t.riskAmount<=equity*(c.positions===2?.015:.01)+1e-8);
        near(e.t.targetRiskAmount,equity*e.t.riskPolicyPercent/100);
        const day=new Date(e.time).toISOString().slice(0,10)+(c.daily==='PER_PAIR'?e.t.symbol:'');
        daily.set(day,(daily.get(day)||0)+1);assert.ok(daily.get(day)<=2);
        open.set(e.i,e.t);
      } else { assert.ok(open.delete(e.i));equity+=e.t.pnl; }
    }
    assert.equal(open.size,0);near(equity,s.metrics.endingBalance);ledgerChecks+=s.trades.length;
  }
}
console.log(JSON.stringify({stage:'ledger-verification',completed:rows.length,uniquePolicies:policies.size,tradeLedgerChecks:ledgerChecks,startingBalance:200,status:'PASS'}));

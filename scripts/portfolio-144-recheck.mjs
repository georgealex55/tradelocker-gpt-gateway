// Research-only read requests to a pinned Preview. Never place orders or write database state.
import fs from 'node:fs/promises';
import { SYMBOLS, M15 } from '../lib/research/policies.mjs';
import { validateDataset, fingerprint } from '../lib/research/prepare.mjs';

const file = 'research-output/dataset.json';
const input = JSON.parse(await fs.readFile(file, 'utf8'));
validateDataset(input);
const origin = new URL(process.env.RESEARCH_GATEWAY);
if (origin.protocol !== 'https:' || origin.hostname !== 'tradelocker-gpt-gateway-fnpid8533-georgealex1925-2750s-projects.vercel.app') throw new Error('RESEARCH_PINNED_PREVIEW_REQUIRED');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function request(route, body) {
  for (let attempt=0; attempt<4; attempt++) {
    const response = await fetch(new URL(route, origin), { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(120000), headers: {
      'x-trade-approval-key': process.env.TRADE_APPROVAL_KEY,
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'content-type': 'application/json'
    }, ...(body ? {body:JSON.stringify(body)} : {}) });
    if (!response.ok) {
      if ([400,429,500,502,503,504].includes(response.status) && attempt<3) { await pause(1500*(attempt+1)); continue; }
      throw new Error(`GATEWAY_HTTP_${response.status}`);
    }
    const data=await response.json();
    if (data.ok===false || data.error) throw new Error('GATEWAY_REQUEST_FAILED');
    return data;
  }
}
try {
  const {runtime}=await request('/api/tradelocker/runtime-config');
  if (runtime?.tradingEnabled!==false || runtime?.killSwitch!==true || runtime?.vercelEnv!=='preview') throw new Error('RESEARCH_REQUIRES_SAFE_PREVIEW');
  const sets=Object.fromEntries(SYMBOLS.map(s=>[s,new Set(input.pairs[s].candles.map(c=>c.time))]));
  const union=[...new Set(SYMBOLS.flatMap(s=>[...sets[s]]))].sort((a,b)=>a-b);
  const days=Object.fromEntries(SYMBOLS.map(s=>[s,new Set(union.filter(t=>!sets[s].has(t)).map(t=>new Date(t).toISOString().slice(0,10)))]));
  // Probe non-weekend common holes too; weekend-scale closures are left intact.
  for(let i=1;i<union.length;i++) {
    if(union[i]-union[i-1]>36*3600000) continue;
    for(let t=union[i-1]+M15;t<union[i];t+=M15) {
      const d=new Date(t);
      if(![0,6].includes(d.getUTCDay())) for(const s of SYMBOLS) days[s].add(d.toISOString().slice(0,10));
    }
  }
  const report={ parentInputHash:fingerprint(input), safety:{tradingEnabled:false,killSwitch:true,environment:runtime.vercelEnv}, windows:[] };
  for(const symbol of SYMBOLS) {
    const m=input.pairs[symbol].metadata;
    const bars=new Map(input.pairs[symbol].candles.map(c=>[c.time,c]));
    for(const day of [...days[symbol]].sort()) {
      const from=Date.parse(day),to=from+86400000-1;
      const chunk=(await request('/api/trading/history',{symbol,tradableInstrumentId:m.tradableInstrumentId,infoRouteId:m.infoRouteId,resolution:'15m',from,to,maxBars:2000})).result;
      if(chunk.truncated || !Array.isArray(chunk.candles) || chunk.chunks?.some(c=>!['ok','no_data','no-data'].includes(c.status))) throw new Error('RESEARCH_RECHECK_INCOMPLETE');
      let added=0,conflicts=0;
      for(const c of chunk.candles) {
        if(c.time<from || c.time>to) throw new Error('RESEARCH_RECHECK_OUT_OF_RANGE');
        const prior=bars.get(c.time);
        if(prior && ['open','high','low','close'].some(k=>prior[k]!==c[k])) conflicts++;
        if(!prior){bars.set(c.time,c);added++;}
      }
      if(conflicts) throw new Error('RESEARCH_HISTORY_REVISION_REQUIRES_REVIEW');
      report.windows.push({symbol,day,returned:chunk.candles.length,added});
      console.log(JSON.stringify(report.windows.at(-1)));
      input.pairs[symbol].candles=[...bars.values()].sort((a,b)=>a.time-b.time);
      await fs.writeFile('research-output/dataset.rechecked.json',JSON.stringify(input,null,2));
      await fs.writeFile('research-output/recheck.json',JSON.stringify(report,null,2));
      await pause(500);
    }
  }
  validateDataset(input);
  report.complete=true;
  report.resultInputHash=fingerprint(input);
  await fs.writeFile('research-output/recheck.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({stage:'recheck-complete',windows:report.windows.length,added:report.windows.reduce((n,w)=>n+w.added,0)}));
} catch(error) {
  console.error(/^(RESEARCH_|GATEWAY_)/.test(error.message)?error.message:'RESEARCH_RECHECK_FAILED');
  process.exitCode=1;
}

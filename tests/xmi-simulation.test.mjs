import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {REGISTRY,makeVersion,confirm,compileSignals,closedHigherBars,digest,SECONDS} from '../lib/xmi-sim/registry.mjs';
import {verifyDataset,fetchForexHistory,annotateDataQuality} from '../lib/xmi-sim/data.mjs';
import {createAccount,acceptSignal,processBar,finishReplay,backtest,conversion,pipSize,sizePosition,reconcile,metrics} from '../lib/xmi-sim/execution.mjs';
import {qualification,forwardQualification,generateConfigurations,partition,trainingTrial,finishResearch,degradation} from '../lib/xmi-sim/research.mjs';
import {newState,simulationConfig,mutate,readState,saveDataset} from '../lib/xmi-sim/store.mjs';
import {reserveProviderCredit,queueResearch,tickResearch,setJobStatus,dailyReport} from '../lib/xmi-sim/jobs.mjs';
import {managementAuthorized,managementKeyMatches,issueManagementSession,mutationOriginAllowed} from '../lib/xmi-sim/auth.mjs';
import {DEFAULT_TECH,DEFAULT_CHART_SETTINGS,serializeWorkspace,deserializeWorkspace} from '../lib/xmiChartTools.mjs';
import {defaultStructureSettings} from '../lib/xmiStructure.mjs';
const first=Date.parse('2025-01-06T00:00:00Z')/1000;
function fixture(length=900){const out=[];let time=first;while(out.length<length){const d=new Date(time*1000),day=d.getUTCDay(),h=d.getUTCHours();if(!(day===6||day===0&&h<22||day===5&&h>=22)){const close=1.1+Math.sin(out.length/10)*0.006;out.push({time,open:close-0.0001,high:close+0.0003,low:close-0.0003,close,closed:true});}time+=900;}return out;}
const dataset=()=>verifyDataset(fixture(),{synthetic:true,acquiredAt:Date.now()});
const version=()=>makeVersion({strategyId:'ema-trend'});
function memoryStore(){let revision=0,state=newState(),datasets=new Map();return {environment:'test',datasets,sql:{query:async(text,args)=>{
 if(text.startsWith('SELECT revision'))return [{revision,payload:structuredClone(state)}];
 if(text.startsWith('UPDATE xmi_sim_state')){if(args[2]!==revision)return [];state=JSON.parse(args[0]);return [{revision:++revision}];}
 if(text.startsWith('SELECT payload FROM xmi_sim_datasets'))return datasets.has(args[0])?[{payload:structuredClone(datasets.get(args[0]))}]:[];
 throw Error('Unimplemented test SQL');
 }}};}
function sampleSignal(){const d=dataset(),v=version();return [...compileSignals(v,d).values()][0];}
test('Clean chart defaults compute research indicators independently and preserve intentional settings',()=>{
 assert.ok(Object.values(DEFAULT_TECH).every(v=>v===false));assert.equal(DEFAULT_CHART_SETTINGS.markerStyle,'off');
 assert.ok(Object.values(defaultStructureSettings(false)).every(x=>!x.enabled));
 const s=defaultStructureSettings(false);s.BOS.enabled=true;
 const restored=deserializeWorkspace(serializeWorkspace([],{...DEFAULT_CHART_SETTINGS,scale:'log'},{...DEFAULT_TECH,RSI:true},{},s));
 assert.equal(restored.technical.RSI,true);assert.equal(restored.structure.BOS.enabled,true);assert.equal(restored.settings.scale,'log');
 assert.ok(compileSignals(version(),dataset()).size>0);
});
test('Every executable registry entry has immutable versioning and a deterministic actionable signal',()=>{
 assert.equal(REGISTRY.length,4);const v=version(),d=dataset(),signals=compileSignals(v,d);assert.ok(signals.size>0);
 const [i,s]=[...signals][0];assert.deepEqual(s,confirm(v,d.bars.slice(0,i+1),{datasetId:d.id}));
 assert.equal(s.state,'CONFIRMED_ENTRY');assert.equal(s.configurationHash,v.configurationHash);assert.equal(s.timestamp,d.bars[i].time+900);
 assert.ok(s.sourceCandles.every(b=>b.closeTime<=s.timestamp));assert.equal(s.signalId,s.idempotencyKey);
 assert.throws(()=>confirm({...v,parameters:{...v.parameters,fast:8}},d.bars),/modified/);
 assert.notEqual(makeVersion({...v,parameters:{...v.parameters,fast:8}}).configurationHash,v.configurationHash);
});
test('All strategy families are causally invariant to future candles and reject forming input',()=>{
 const d=dataset();for(const def of REGISTRY){const v=makeVersion({strategyId:def.id});const cut=400;const a=compileSignals(v,{...d,bars:d.bars.slice(0,cut)}),b=compileSignals(v,d);assert.deepEqual([...a],[...b].filter(([i])=>i<cut));}
 assert.throws(()=>confirm(version(),[...d.bars.slice(0,90),{...d.bars[90],closed:false}]),/closed/);
 const s=sampleSignal();assert.throws(()=>confirm(version(),d.bars.slice(0,250),{availableAt:first}),/available/);
 assert.equal(closedHigherBars([{time:first,closed:true},{time:first+3600,closed:true}],first+3600,'1H').length,1);
});
test('Dataset normalization preserves real OHLC, removes identical duplicates and rejects conflicts',()=>{
 const bars=fixture(100),d=verifyDataset([...bars,bars[0]].reverse(),{synthetic:true});assert.equal(d.duplicatesRemoved,1);assert.equal(d.bars.length,100);assert.ok(d.bars.every(b=>b.volume===null));
 assert.throws(()=>verifyDataset([...bars,{...bars[0],close:1.1001}],{}),/Conflicting/);
 assert.throws(()=>verifyDataset([{...bars[0],high:0},...bars.slice(1)]),/Invalid/);
 const gap=verifyDataset(bars.filter((_,i)=>i!==50));assert.equal(gap.unresolvedGaps,1);assert.equal(gap.bars.length,99);
 const forming=verifyDataset(bars,{acquiredAt:(bars.at(-1).time+100)*1000});assert.equal(forming.excludedForming,1);
});
test('JPY pips, USD base/quote conversion, minimum lots and margin sizing are independent',()=>{
 assert.equal(pipSize('USDJPY'),0.01);assert.equal(pipSize('EURUSD'),0.0001);
 assert.equal(conversion('USDJPY',150).quoteUSD,1/150);assert.equal(conversion('EURUSD',1.2).baseUSD,1.2);
 const signal=sampleSignal(),small=createAccount({id:'small',balance:100,risk:0.0025}),large=createAccount({id:'large'});
 assert.equal(sizePosition(small,signal,1.1).accepted,false);const sized=sizePosition(large,signal,1.1);assert.equal(sized.accepted,true);assert.ok(sized.plannedRisk<=sized.budget);assert.ok(sized.margin<=large.equity);assert.equal(sized.units%1000,0);
 assert.throws(()=>createAccount({id:'bad',model:{leverage:1000}}),/leverage/);assert.throws(()=>conversion('EURGBP',0.8),/conversion/);
});
test('Confirmation produces one order, a risk-sized next-bar fill, stop-first exit and reconciled ledger',()=>{
 const signal=sampleSignal(),a=createAccount({id:'one'});assert.equal(acceptSignal(a,signal),true);assert.equal(acceptSignal(a,signal),false);
 const bar={time:signal.timestamp,open:1.1,high:1.108,low:1.092,close:1.1,closed:true};
 processBar(a,bar);finishReplay(a,bar);assert.equal(a.trades.length,1);assert.equal(a.trades[0].reason,'AMBIGUOUS_STOP_FIRST');assert.ok(a.trades[0].net<0);assert.ok(a.trades[0].costs>0);assert.ok(reconcile(a).ok);
 const snapshot=structuredClone(a);assert.equal(processBar(a,bar),false);assert.deepEqual(a,snapshot);
 assert.equal(a.events.filter(e=>e.type==='SIMULATED_ORDER').length,1);assert.equal(a.events.filter(e=>e.type==='SIMULATED_FILL').length,1);assert.equal(a.trades[0].signalId,signal.signalId);
});
test('Independent account/risk configurations never share balances, fills, or identities',()=>{
 const d=dataset(),v=version(),a=backtest(v,d,{balance:500,risk:0.005}),b=backtest(v,d,{balance:25000,risk:0.02});
 assert.notEqual(a.account.id,b.account.id);assert.ok(a.account.trades.every(t=>t.accountId===a.account.id));assert.ok(b.account.trades.every(t=>t.accountId===b.account.id));assert.ok(reconcile(a.account).ok);assert.ok(reconcile(b.account).ok);
 const before=b.account.balance;a.account.balance=0;assert.equal(b.account.balance,before);
});
test('Backtest partitions embargo entries, end positions at boundary and keep OOS ledgers separate',()=>{
 const d=dataset(),p=partition(d),r=backtest(version(),d,{...p.holdout,start:p.holdout.start+1});
 assert.ok(r.account.trades.every(t=>t.entryTime>=d.bars[p.holdout.start+1].time));assert.equal(r.account.position,null);assert.ok(r.metrics.reconciled);
 assert.throws(()=>partition({...d,bars:d.bars.slice(0,100)}),/420/);
 assert.throws(()=>backtest(version(),{...d,symbol:'USDJPY'}),/mismatch/);
});
test('Strict qualification cannot be satisfied by low sample, synthetic data, reuse or missing evidence',()=>{
 const m={expectancy:1,profitFactor:1.51,maxDrawdown:0.099,trades:200,costsIncluded:true,reconciled:true},e={lookaheadViolations:0,unresolvedDataFailures:0,untouchedHoldout:true,walkForwardPassed:true,parameterStabilityPassed:true,costSensitivityPassed:true,riskPassed:true,synthetic:false,sourceAuthenticated:true,multipleTestingPassed:true};
 assert.equal(qualification(m,e).passed,true);
 assert.equal(qualification({...m,trades:199},e).status,'INSUFFICIENT EVIDENCE');
 for(const metric of [{profitFactor:1.5},{maxDrawdown:0.1},{expectancy:0},{costsIncluded:false},{reconciled:false}])assert.equal(qualification({...m,...metric},e).passed,false);
 for(const evidence of [{synthetic:true},{untouchedHoldout:false},{unresolvedDataFailures:1},{lookaheadViolations:1},{parameterStabilityPassed:false}])assert.equal(qualification(m,{...e,...evidence}).passed,false);
});
test('Forward qualification enforces 30/90 days, independent samples and never uses historical fills',()=>{
 const m={trades:50,expectancy:2,profitFactor:2,maxDrawdown:0.02};const now=Date.now();
 assert.equal(forwardQualification(m,{style:'intraday',startedAt:now-29*86400000,now}).passed,false);
 assert.equal(forwardQualification(m,{style:'intraday',startedAt:now-30*86400000,now}).passed,true);
 assert.equal(forwardQualification(m,{style:'swing',startedAt:now-89*86400000,now}).passed,false);
 const a=createAccount({id:'forward',mode:'INTERNAL_FORWARD_PAPER'});assert.throws(()=>acceptSignal(a,sampleSignal()),/fresh observed quote/);assert.throws(()=>processBar(a,fixture()[0]),/cannot create forward/);
});
test('Parameter search is deterministic, bounded and counts unique tested configurations',()=>{
 const a=generateConfigurations(version(),{limit:16});assert.equal(a.length,16);assert.equal(new Set(a.map(v=>v.configurationHash)).size,16);assert.deepEqual(a,generateConfigurations(version(),{limit:16}));assert.throws(()=>generateConfigurations(version(),{limit:1000}),/1–32/);
});
test('Persisted optimistic updates serialize concurrent state mutations',async()=>{
 const store=memoryStore();await Promise.all([mutate(store,s=>{s.counter=(s.counter||0)+1;}),mutate(store,s=>{s.counter=(s.counter||0)+1;})]);assert.equal((await readState(store)).state.counter,2);
});
test('Worker recovers after calculation crash without duplicated trials, fills or holdout qualification',async()=>{
 const store=memoryStore(),d=dataset();store.datasets.set(d.id,d);
 const job=await queueResearch(store,{...version(),datasetId:d.id,limit:1});
 await assert.rejects(tickResearch(store,job.id,{fault:'AFTER_CALCULATION'}),/INJECTED/);
 assert.equal((await readState(store)).state.jobs[0].cursor,0);
 await tickResearch(store,job.id);assert.equal((await readState(store)).state.jobs[0].cursor,1);
 await assert.rejects(tickResearch(store,job.id,{fault:'BEFORE_COMMIT'}),/INJECTED/);
 await tickResearch(store,job.id);const state=(await readState(store)).state;assert.equal(state.runs.length,1);assert.equal(state.runs[0].evidence.untouchedHoldout,false);assert.equal(state.jobs[0].trials.length,1);assert.equal(state.runs[0].qualification.passed,false);assert.equal(state.scheduler.installed,false);
 await tickResearch(store,job.id);assert.equal((await readState(store)).state.runs.length,1);
});
test('Kill switch and retirement prevent worker advancement and keep lifecycle evidence',async()=>{
 const store=memoryStore(),d=dataset();store.datasets.set(d.id,d);const j=await queueResearch(store,{...version(),datasetId:d.id,limit:1});await mutate(store,s=>{s.paused=true;});assert.equal((await tickResearch(store,j.id)).advanced,false);
 await mutate(store,s=>setJobStatus(s,j.id,'RETIRED'));assert.equal((await readState(store)).state.jobs[0].status,'RETIRED');
 await assert.rejects(mutate(store,s=>setJobStatus(s,j.id,'QUEUED')),/transition/);
});
test('Research quota is shared across jobs, conservative on failures, and resets by UTC day',()=>{
 const state=newState(),now=Date.now();reserveProviderCredit(state,'EURUSD:15m',now);assert.throws(()=>reserveProviderCredit(state,'EURUSD:15m',now),/COOLDOWN/);
 for(let i=0;i<23;i++)reserveProviderCredit(state,'test:'+i,now+(i+1)*60000);
 assert.throws(()=>reserveProviderCredit(state,'new',now+30*60000),/DAILY/);
 reserveProviderCredit(state,'new',now+86400000);assert.equal(state.quota.used,1);
});
test('Provider failures do not fabricate history or leak keys; request is GET-only on fixed host',async()=>{
 const options={env:{TWELVEDATA_API_KEY:'test-key-secret'},now:Date.now()};
 await assert.rejects(fetchForexHistory({symbol:'EURUSD',timeframe:'15m'},{...options,fetchImpl:async(url,init)=>{assert.equal(url.host,'api.twelvedata.com');assert.equal(init.method,'GET');return {ok:false,status:429};}}),/QUOTA/);
 await assert.rejects(fetchForexHistory({symbol:'EURUSD',timeframe:'15m'},{...options,fetchImpl:async()=>{throw Error('test-key-secret');}}),e=>e.message==='PROVIDER_TIMEOUT');
});
test('Management sessions are scoped, tamper-resistant, expire, and do not accept feed cookies',()=>{
 const env={XMI_SIM_ADMIN_KEY:'a'.repeat(48)},now=Date.now(),token=issueManagementSession(env,now);
 assert.ok(managementKeyMatches('a'.repeat(48),env));assert.ok(managementAuthorized(token,env,now));assert.equal(managementAuthorized(token+'x',env,now),false);assert.equal(managementAuthorized(token,env,now+21600000),false);assert.equal(managementAuthorized('xmi_readonly_feed_v1',env,now),false);
 const req=origin=>new Request('https://staging.example/api/xmi/simulation',{headers:origin?{origin}:{}});assert.equal(mutationOriginAllowed(req('https://evil.example')),false);assert.equal(mutationOriginAllowed(req(null)),false);assert.ok(mutationOriginAllowed(req('https://staging.example')));
});
test('Simulation storage refuses production, gateway database reuse and synthetic evidence persistence',async()=>{
 const e={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/xmi-forex-simulation-staging',XMI_SIM_ENABLED:'true',XMI_SIM_ENVIRONMENT_ID:'xmi-forex-staging-v2',XMI_SIM_DATABASE_URL:'postgresql://test:test@ep-isolated.neon.tech/xmi_simulation'};
 assert.ok(simulationConfig(e));assert.throws(()=>simulationConfig({...e,VERCEL_ENV:'production',XMI_SIM_ALLOW_LOCAL:'true'}),/DISABLED/);assert.throws(()=>simulationConfig({...e,DATABASE_URL:e.XMI_SIM_DATABASE_URL}),/GUARD/);assert.throws(()=>simulationConfig({...e,XMI_SIM_DATABASE_URL:'postgresql://a@host/neondb'}),/GUARD/);
 await assert.rejects(saveDataset(memoryStore(),dataset()),/Synthetic/);
 for(const file of readdirSync(new URL('../lib/xmi-sim',import.meta.url))){const source=readFileSync(new URL('../lib/xmi-sim/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"].*(?:tradelocker|tradeGuard|tradeState|alpaca)/i);assert.doesNotMatch(source,/process\.env\.(?:TRADELOCKER|ALPACA)/);}
});
test('Reports label historical accounts separately and never invent background/forward activity',()=>{
 const r=dailyReport(newState());assert.equal(r.forwardTrades,0);assert.equal(r.researchRuns,0);assert.equal(r.mode,'HISTORICAL_RESEARCH_ONLY');assert.equal(r.scheduler.enabled,false);assert.match(r.expenses,/not verified billed/);
 assert.equal(degradation({maxDrawdown:0.1,trades:[]}).pause,true);assert.equal(degradation({maxDrawdown:0,trades:[]}).pause,false);
});

test('Signal idempotency remains stable when a dataset is extended or re-versioned',()=>{
 const d=dataset(),v=version(),[i,signal]=[...compileSignals(v,d)][0];
 const repeated=confirm(v,d.bars.slice(0,i+1),{datasetId:'new-provenance-version'});
 assert.equal(signal.idempotencyKey,repeated.idempotencyKey);assert.notEqual(signal.datasetId,repeated.datasetId);
});
test('Partial close and breakeven stop apply after the decision candle and reconcile all costs',()=>{
 const v=makeVersion({strategyId:'ema-trend',parameters:{direction:'long',partialAtR:1,breakevenR:1}}),signal=[...compileSignals(v,dataset()).values()][0];
 const a=createAccount({id:'partial'});acceptSignal(a,signal);
 processBar(a,{time:signal.timestamp,open:1.1,high:1.1002,low:1.0999,close:1.1,closed:true});
 const entry=a.position.entry,units=a.position.units;
 processBar(a,{time:signal.timestamp+900,open:entry,high:entry+0.003,low:entry-0.0002,close:entry+0.0025,closed:true});
 assert.ok(a.position);assert.ok(a.position.units<units);assert.equal(a.position.stop,entry);assert.equal(a.trades.length,0);
 processBar(a,{time:signal.timestamp+1800,open:entry+0.002,high:entry+0.0025,low:entry-0.0003,close:entry,closed:true});
 assert.equal(a.trades.length,1);assert.ok(a.events.some(e=>e.reason==='PARTIAL_CLOSE'));assert.ok(a.events.some(e=>e.type==='STOP_AMENDED'));assert.ok(reconcile(a).ok);
});
test('Wednesday modeled financing is triple and remains part of net ledger reconciliation',()=>{
 const v=makeVersion({strategyId:'ema-trend',parameters:{direction:'long'}}),signal=[...compileSignals(v,dataset()).values()][0],a=createAccount({id:'financing'});
 assert.equal(new Date(signal.timestamp*1000).getUTCDay(),1);acceptSignal(a,signal);
 processBar(a,{time:signal.timestamp,open:1.1,high:1.1002,low:1.0999,close:1.1,closed:true});
 const bar={time:first+3*86400+8*3600,open:1.1,high:1.1002,low:1.0999,close:1.1,closed:true};processBar(a,bar);
 const fees=a.events.filter(e=>e.type==='MODELED_FINANCING');assert.equal(fees.length,3);assert.ok(Math.abs(fees[1].amount-fees[0].amount*3)<1e-8);
 finishReplay(a,bar);assert.ok(reconcile(a).ok);assert.ok(a.trades[0].costs>fees.reduce((n,e)=>n+e.amount,0));
});
test('Concurrent workers claim one job lease and advance one deterministic trial',async()=>{
 const store=memoryStore(),d=dataset();store.datasets.set(d.id,d);const j=await queueResearch(store,{...version(),datasetId:d.id,limit:1});
 const results=await Promise.all([tickResearch(store,j.id),tickResearch(store,j.id)]);assert.equal(results.filter(r=>r.advanced).length,1);assert.equal((await readState(store)).state.jobs[0].cursor,1);
});

test('Weekend source candles are quarantined and block new research even with valid OHLC',async()=>{
 const bars=Array.from({length:500},(_,i)=>({time:Date.parse('2025-01-11T00:00:00Z')/1000+i*900,open:1.1,high:1.101,low:1.099,close:1.1,closed:true}));
 const d=verifyDataset(bars,{provider:'Twelve Data'});assert.equal(d.qualityStatus,'QUARANTINED');assert.equal(d.saturdayBars,96);assert.ok(d.unresolvedDataFailures>0);
 const store=memoryStore();store.datasets.set(d.id,d);await assert.rejects(queueResearch(store,{...version(),datasetId:d.id,limit:1}),/QUARANTINED/);
 assert.equal((await readState(store)).state.jobs.length,0);assert.equal((await readState(store)).state.dataIncidents.length,1);
});
test('Cached legacy datasets receive the new calendar audit without changing their OHLC or identity',()=>{
 const original={id:'source-v1',timeframe:'15m',unresolvedGaps:0,bars:[{time:Date.parse('2025-01-11T01:00:00Z')/1000,high:1.2,low:1.1}]};const audited=annotateDataQuality(original);assert.equal(audited.id,original.id);assert.equal(audited.bars,original.bars);assert.equal(audited.qualityStatus,'QUARANTINED');assert.equal(original.qualityStatus,undefined);
});

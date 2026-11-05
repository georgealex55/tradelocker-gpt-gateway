import {randomUUID} from 'node:crypto';
import {makeVersion,digest,BALANCES,RISKS} from './registry.mjs';
import {generateConfigurations,trainingTrial,finishResearch,partition} from './research.mjs';
import {mutate,loadDataset,saveDataset} from './store.mjs';
import {fetchForexHistory} from './data.mjs';
export function reserveProviderCredit(state,key,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);if(state.quota.day!==day)state.quota={day,used:0,lastByKey:{}};
 if(state.quota.used>=24)throw Error('DAILY_RESEARCH_PROVIDER_BUDGET');
 const last=state.quota.lastByKey[key];if(last&&now-last<300000)throw Error('DATASET_REFRESH_COOLDOWN');
 const minute=Object.values(state.quota.lastByKey).filter(t=>now-t<60000).length;if(minute>=4)throw Error('PROVIDER_MINUTE_BUDGET');
 state.quota.used++;state.quota.lastByKey[key]=now;
}
export async function recordDataQuarantine(store,dataset){
 if(dataset.qualityStatus!=='QUARANTINED')return;
 await mutate(store,s=>{s.dataIncidents=s.dataIncidents||[];if(!s.dataIncidents.some(i=>i.datasetId===dataset.id&&i.type==='OUT_OF_SESSION_CANDLES'))s.dataIncidents.push({datasetId:dataset.id,type:'OUT_OF_SESSION_CANDLES',status:'QUARANTINED',outOfSessionBars:dataset.outOfSessionBars,saturdayBars:dataset.saturdayBars,at:Date.now(),reason:'Provider response contains changing-price OHLC in core closed Forex weekend periods; no performance qualification is valid without source resolution.'});});
}
export async function acquireDataset(store,input,dependencies={}){
 const symbol=input.symbol,timeframe=input.timeframe;
 makeVersion({strategyId:'ema-trend',symbol,timeframe,style:input.style});
 await mutate(store,s=>reserveProviderCredit(s,symbol+':'+timeframe));
 const d=await fetchForexHistory({symbol,timeframe},dependencies);await saveDataset(store,d);await recordDataQuarantine(store,d);return d;
}
export async function queueResearch(store,input){
 const base=makeVersion(input),balance=Number(input.balance??10000),risk=Number(input.risk??0.005),limit=Number(input.limit??8);
 if(!BALANCES.includes(balance)||!RISKS.includes(risk)||!/^[a-f0-9]{64}$/.test(input.datasetId||''))throw Error('Invalid account or dataset');
 const dataset=await loadDataset(store,input.datasetId);if(dataset.qualityStatus==='QUARANTINED'){await recordDataQuarantine(store,dataset);throw Error('DATASET_QUARANTINED');}if(dataset.symbol!==base.symbol||dataset.timeframe!==base.timeframe)throw Error('Dataset/configuration mismatch');partition(dataset);
 const versions=generateConfigurations(base,{limit}),id=digest({datasetId:dataset.id,versions:versions.map(v=>v.configurationHash),balance,risk});
 return mutate(store,s=>{
  const old=s.jobs.find(j=>j.id===id);if(old)return old;
  if(s.jobs.length>=40||s.jobs.filter(j=>['QUEUED','RUNNING'].includes(j.status)).length>=3)throw Error('RESEARCH_JOB_BUDGET');
  const job={id,datasetId:dataset.id,versions,balance,risk,cursor:0,trials:[],status:'QUEUED',attempts:0,createdAt:Date.now(),lease:null,error:null};s.jobs.push(job);return job;
 });
}
export async function tickResearch(store,jobId,{now=Date.now(),fault=null}={}){
 const leaseId=randomUUID();
 const job=await mutate(store,s=>{
  const j=s.jobs.find(x=>x.id===jobId);if(!j)throw Error('JOB_NOT_FOUND');
  if(s.paused||!['QUEUED','RUNNING'].includes(j.status)||j.lease&&j.lease.expiresAt>now)return null;
  if(j.attempts>=5){j.status='FAILED';j.error='RETRY_LIMIT';return null;}
  j.status='RUNNING';j.lease={id:leaseId,expiresAt:now+60000};return structuredClone(j);
 });
 if(!job)return {advanced:false};
 try{
  const dataset=await loadDataset(store,job.datasetId);if(dataset.qualityStatus==='QUARANTINED'){await recordDataQuarantine(store,dataset);throw Error('DATASET_QUARANTINED');}
  if(job.cursor<job.versions.length){
   const version=makeVersion(job.versions[job.cursor]),trial=trainingTrial(version,dataset,{balance:job.balance,risk:job.risk});
   if(fault==='AFTER_CALCULATION')throw Error('INJECTED_TEST_CRASH');
   await mutate(store,s=>{const j=s.jobs.find(x=>x.id===jobId);if(j.lease?.id!==leaseId||j.status!=='RUNNING'||s.paused)return;
    if(!j.trials.some(t=>t.version.configurationHash===version.configurationHash))j.trials.push({version,metrics:trial.metrics});
    j.cursor++;j.lease=null;j.attempts=0;});return {advanced:true,completed:false};
  }
  const ranges=partition(dataset),start=dataset.bars[ranges.holdout.start].time,end=dataset.bars.at(-1).time;
  // Reserve the time range BEFORE evaluating. A crashed evaluation consumes it;
  // a retry can report the result but cannot call the holdout untouched.
  const untouched=await mutate(store,s=>{
   if(s.paused)return false;
   const j=s.jobs.find(x=>x.id===jobId);if(j.lease?.id!==leaseId||j.status!=='RUNNING')return false;
   const reused=s.holdouts.some(h=>h.symbol===dataset.symbol&&h.timeframe===dataset.timeframe&&h.start<=end&&h.end>=start);
   s.holdouts.push({jobId,symbol:dataset.symbol,timeframe:dataset.timeframe,start,end,reservedAt:now,leaseId});return !reused;
  });
  const run=finishResearch({candidates:job.trials,dataset,balance:job.balance,risk:job.risk,untouchedHoldout:untouched});
  if(fault==='BEFORE_COMMIT')throw Error('INJECTED_TEST_CRASH');
  await mutate(store,s=>{
   const j=s.jobs.find(x=>x.id===jobId);if(j.lease?.id!==leaseId||j.status!=='RUNNING'||s.paused)return;
   if(!s.runs.some(r=>r.id===jobId))s.runs.push({id:jobId,completedAt:Date.now(),...run});
   j.status='COMPLETED';j.lease=null;j.completedAt=Date.now();
   s.lifecycle.push({id:digest({jobId,state:run.qualification.status}),jobId,configurationHash:run.version.configurationHash,status:run.qualification.passed?'HISTORICALLY QUALIFIED':'REJECTED',evidenceStatus:run.qualification.status,at:Date.now(),reason:run.qualification.failures});
   if(run.qualification.passed)s.lifecycle.push({id:digest({jobId,state:'FORWARD_CANDIDATE'}),jobId,status:'PAUSED',at:Date.now(),reason:'Historically qualified; fresh-quote forward worker is not installed. No forward fills are inferred.'});
  });return {advanced:true,completed:true};
 }catch(e){
  await mutate(store,s=>{const j=s.jobs.find(x=>x.id===jobId);if(j.lease?.id===leaseId){j.lease=null;j.attempts++;j.status=e.message==='DATASET_QUARANTINED'?'PAUSED':j.attempts>=5?'FAILED':'QUEUED';j.error=String(e.message).slice(0,120);}});
  throw e;
 }
}
export function setJobStatus(state,id,status){
 const job=state.jobs.find(j=>j.id===id);if(!job)throw Error('JOB_NOT_FOUND');
 if(!['PAUSED','QUEUED','RETIRED'].includes(status)||['COMPLETED','RETIRED'].includes(job.status))throw Error('Invalid job lifecycle transition');
 job.status=status;job.lease=null;state.lifecycle.push({jobId:id,status,at:Date.now()});
}
export function dailyReport(state,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10),runs=state.runs.filter(r=>new Date(r.completedAt).toISOString().slice(0,10)===day);
 return {day,mode:'HISTORICAL_RESEARCH_ONLY',researchRuns:runs.length,distinctConfigurations:new Set(runs.flatMap(r=>r.experiments.map(e=>digest({hash:e.configurationHash,balance:r.balance,risk:r.risk,datasetId:r.datasetId})))).size,historicallyQualified:runs.filter(r=>r.qualification.passed).length,forwardQualified:0,forwardTrades:0,dataIncidents:state.dataIncidents||[],providerCreditsReserved:state.quota.day===day?state.quota.used:0,providerDailyLimit:24,paused:state.paused,scheduler:state.scheduler,accounts:runs.map(r=>({id:r.account.id,balance:r.balance,risk:r.risk,style:r.style,net:r.holdout.net,drawdown:r.holdout.maxDrawdown,profitFactor:r.holdout.profitFactor,winRate:r.holdout.winRate,expectancy:r.holdout.expectancy,evidence:r.qualification.status})),expenses:'No priced usage or invoice integration; credit reservations are request counts, not verified billed credits.'};
}

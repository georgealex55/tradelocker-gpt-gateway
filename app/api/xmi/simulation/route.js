import {NextResponse} from 'next/server.js';
import {REGISTRY,MAJORS,STYLES,BALANCES,RISKS} from '../../../../lib/xmi-sim/registry.mjs';
import {STRATEGIES} from '../../../../lib/xmiStrategyPresets.mjs';
import {simulationConfig,openStore,readState,listDatasets,mutate} from '../../../../lib/xmi-sim/store.mjs';
import {SESSION_COOKIE,managementAuthorized,managementKeyMatches,issueManagementSession,mutationOriginAllowed} from '../../../../lib/xmi-sim/auth.mjs';
import {acquireDataset,queueResearch,tickResearch,setJobStatus,dailyReport} from '../../../../lib/xmi-sim/jobs.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>NextResponse.json(value,{status,headers});
const authorized=req=>managementAuthorized(req.cookies.get(SESSION_COOKIE)?.value);
const attempts=new Map();
function limited(req){const minute=Math.floor(Date.now()/60000),key=(req.headers.get('x-vercel-forwarded-for')||'shared').split(',')[0]+':'+minute;const n=attempts.get(key)||0;if(attempts.size>500)attempts.clear();attempts.set(key,n+1);return n>=8;}
function failure(error){const code=String(error?.message||'SIMULATION_ERROR');const safe=/^[A-Z0-9_]{3,70}$/.test(code)?code:'SIMULATION_REQUEST_FAILED';console.warn('[xmi-simulation]',safe);return json({ok:false,code:safe,error:safe==='SIMULATION_REQUEST_FAILED'?'Request rejected or simulation service unavailable. Check the selected data and configuration.':safe},safe.includes('BUDGET')||safe.includes('COOLDOWN')?429:503);}
export async function GET(req){
 try{simulationConfig();}catch{return json({ok:true,simulationOnly:true,enabled:false,authenticated:false,registry:REGISTRY,majors:MAJORS,styles:STYLES,balances:BALANCES,risks:RISKS,scheduler:{installed:false,enabled:false}});}
 const action=new URL(req.url).searchParams.get('action')||'status';
 if(action==='status')return json({ok:true,simulationOnly:true,enabled:true,authenticated:authorized(req),registry:REGISTRY,legacyInventory:STRATEGIES.map(s=>({id:s.id,name:s.name,indicators:s.indicators,status:'ANNOTATION_ONLY',executable:false,source:'lib/xmiStrategyPresets.mjs'})),majors:MAJORS,styles:STYLES,balances:BALANCES,risks:RISKS,scheduler:{installed:false,enabled:false}});
 if(!authorized(req))return json({ok:false,error:'Management sign-in required'},401);
 try{
  const store=await openStore(),{state,revision}=await readState(store);
  if(action==='export'){
   const params=new URL(req.url).searchParams,run=state.runs.find(r=>r.id===params.get('id'));
   if(!run)return json({ok:false,error:'Run not found'},404);
   if(params.get('format')==='csv'){
    const columns=['dataQuality','id','accountId','strategyId','configurationHash','symbol','direction','entryTime','exitTime','units','entry','exit','gross','costs','net','reason','mode'];
    const escape=v=>'"'+(typeof v==='string'?v.replace(/^[=+@-]/,"'"):String(v??'')).replaceAll('"','""')+'"';
    const csv=[columns.join(','),...run.account.trades.map(t=>columns.map(c=>escape(c==='dataQuality'?(state.dataIncidents||[]).some(i=>i.datasetId===run.datasetId)?'QUARANTINED':'UNRESOLVED_CALENDAR_CHECK':t[c])).join(','))].join('\n');
    return new NextResponse(csv,{headers:{...headers,'Content-Type':'text/csv','Content-Disposition':'attachment; filename=xmi-simulated-trades.csv'}});
   }
   return new NextResponse(JSON.stringify({...run,qualityReview:(state.dataIncidents||[]).filter(i=>i.datasetId===run.datasetId),performanceEvidenceValid:run.qualification.passed&&!(state.dataIncidents||[]).some(i=>i.datasetId===run.datasetId)},null,2),{headers:{...headers,'Content-Type':'application/json','Content-Disposition':'attachment; filename=xmi-research-run.json'}});
  }
  return json({ok:true,revision,state,datasets:await listDatasets(store),report:dailyReport(state)});
 }catch(e){return failure(e);}
}
export async function POST(req){
 if(!mutationOriginAllowed(req))return json({ok:false,error:'Same-origin management only'},403);
 try{simulationConfig();}catch(e){return failure(e);}
 if(Number(req.headers.get('content-length')||0)>12000)return json({ok:false,error:'Request too large'},413);
 let body;try{const text=await req.text();if(text.length>12000)return json({ok:false,error:'Request too large'},413);body=JSON.parse(text);}catch{return json({ok:false,error:'Invalid JSON'},400);}
 if(body.action==='login'){
  if(limited(req))return json({ok:false,error:'Sign-in rate limit'},429);
  if(!managementKeyMatches(body.key))return json({ok:false,error:'Management key rejected'},401);
  const response=json({ok:true});response.cookies.set(SESSION_COOKIE,issueManagementSession(),{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'strict',path:'/api/xmi/simulation',maxAge:21600});return response;
 }
 if(!authorized(req))return json({ok:false,error:'Management sign-in required'},401);
 if(body.action==='logout'){const response=json({ok:true});response.cookies.set(SESSION_COOKIE,'',{path:'/api/xmi/simulation',maxAge:0});return response;}
 try{
  const store=await openStore();
  if(body.action==='fetchHistory')return json({ok:true,dataset:((d)=>({...d,bars:undefined}))(await acquireDataset(store,body))});
  if(body.action==='queue')return json({ok:true,job:await queueResearch(store,body)});
  if(body.action==='tick')return json({ok:true,...await tickResearch(store,body.id)});
  if(body.action==='pauseAll'){await mutate(store,s=>{s.paused=true;for(const j of s.jobs)j.lease=null;s.lifecycle.push({status:'PAUSED',at:Date.now(),reason:'USER_KILL_SWITCH'});});return json({ok:true});}
  if(body.action==='resumeAll'){await mutate(store,s=>{s.paused=false;s.lifecycle.push({status:'TESTING',at:Date.now(),reason:'USER_RESUME'});});return json({ok:true});}
  if(body.action==='jobStatus'){await mutate(store,s=>setJobStatus(s,body.id,body.status));return json({ok:true});}
  return json({ok:false,error:'Unknown simulation action'},400);
 }catch(e){return failure(e);}
}

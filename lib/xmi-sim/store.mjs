/* Dedicated simulation connection; NEVER fall back to the gateway DATABASE_URL. */
import {neon} from '@neondatabase/serverless';
import {annotateDataQuality,qualityMetadata,FXCM_ARCHIVE_KIND} from './data.mjs';
export const STAGING_BRANCH='feature/xmi-forex-simulation-staging';
export const ENVIRONMENT_ID='xmi-forex-staging-v3';
// Keep immutable records in their existing namespace while revoking obsolete
// preview code through the separate database guard version.
export const STATE_NAMESPACE='xmi-forex-staging-v1';
export function simulationConfig(env=process.env){
 const allowed=env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===STAGING_BRANCH||env.VERCEL_ENV!=='production'&&env.XMI_SIM_ALLOW_LOCAL==='true';
 if(!allowed||env.XMI_SIM_ENABLED!=='true'||env.XMI_SIM_ENVIRONMENT_ID!==ENVIRONMENT_ID)throw Error('SIMULATION_DISABLED');
 let url;try{url=new URL(env.XMI_SIM_DATABASE_URL);}catch{throw Error('SIMULATION_STORAGE_NOT_CONFIGURED');}
 if(url.protocol!=='postgresql:'||!url.hostname.endsWith('.neon.tech')||url.pathname!=='/xmi_simulation')throw Error('SIMULATION_STORAGE_GUARD');
 if(env.DATABASE_URL){try{if(url.hostname.replace('-pooler','')===new URL(env.DATABASE_URL).hostname.replace('-pooler',''))throw Error('SIMULATION_STORAGE_GUARD');}catch(e){if(e.message==='SIMULATION_STORAGE_GUARD')throw e;}}
 return {url:url.toString(),environment:STATE_NAMESPACE,guard:ENVIRONMENT_ID};
}
export function newState(){return {schema:1,paused:false,jobs:[],runs:[],holdouts:[],lifecycle:[],quota:{day:'',used:0,lastByKey:{}},scheduler:{installed:false,enabled:false,reason:'No unattended preview worker is installed. Use Resume next step for bounded durable jobs.'}};}
export async function openStore(env=process.env){
 const cfg=simulationConfig(env),sql=neon(cfg.url);
 const guard=await sql.query('SELECT environment_id, simulation_only FROM xmi_sim_guard WHERE id=1',[]);
 if(guard.length!==1||guard[0].environment_id!==cfg.guard||guard[0].simulation_only!==true)throw Error('SIMULATION_STORAGE_GUARD');
 return {sql,...cfg};
}
export async function readState(store){const rows=await store.sql.query('SELECT revision,payload FROM xmi_sim_state WHERE environment_id=$1',[store.environment]);if(rows.length!==1)throw Error('SIMULATION_STORAGE_NOT_INITIALIZED');return {revision:Number(rows[0].revision),state:rows[0].payload};}
export async function mutate(store,fn){
 for(let tries=0;tries<8;tries++){
  const {revision,state}=await readState(store),output=fn(state);
  const payload=JSON.stringify(state);if(payload.length>12000000)throw Error('SIMULATION_STORAGE_BUDGET');
  const rows=await store.sql.query('UPDATE xmi_sim_state SET payload=$1::jsonb,revision=revision+1,updated_at=now() WHERE environment_id=$2 AND revision=$3 RETURNING revision',[payload,store.environment,revision]);
  if(rows.length)return output;
 }
 throw Error('SIMULATION_BUSY');
}
export async function saveDataset(store,dataset){
 if(dataset.synthetic)throw Error('Synthetic data is prohibited in the staging research dataset store');
 await store.sql.query('INSERT INTO xmi_sim_datasets(id,environment_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING',[dataset.id,store.environment,JSON.stringify(dataset)]);
}
export async function loadDataset(store,id){const rows=await store.sql.query('SELECT payload FROM xmi_sim_datasets WHERE id=$1 AND environment_id=$2',[id,store.environment]);if(rows.length!==1)throw Error('DATASET_NOT_FOUND');return annotateDataQuality(rows[0].payload);}
export async function listDatasets(store){
 const rows=await store.sql.query(`SELECT id,payload-'bars' AS metadata,
  CASE WHEN payload->>'qualityAuditVersion'='3' THEN (payload->>'outOfSessionBars')::int
  ELSE (SELECT count(*)::int FROM jsonb_array_elements(payload->'bars') b
   WHERE extract(dow FROM to_timestamp((b->>'time')::bigint) AT TIME ZONE 'UTC')=6
    OR extract(dow FROM to_timestamp((b->>'time')::bigint) AT TIME ZONE 'UTC')=0 AND extract(hour FROM to_timestamp((b->>'time')::bigint) AT TIME ZONE 'UTC')<20
    OR extract(dow FROM to_timestamp((b->>'time')::bigint) AT TIME ZONE 'UTC')=5 AND extract(hour FROM to_timestamp((b->>'time')::bigint) AT TIME ZONE 'UTC')>=23) END AS out_of_session
  FROM xmi_sim_datasets WHERE environment_id=$1
  ORDER BY COALESCE(payload->'source'->>'kind'=$2,false) DESC,created_at DESC LIMIT 40`,[store.environment,FXCM_ARCHIVE_KIND]);
 return rows.map(({id,metadata,out_of_session})=>({id,...metadata,...qualityMetadata(metadata,{outOfSessionBars:metadata.timeframe==='1D'?0:Number(out_of_session)})}));
}

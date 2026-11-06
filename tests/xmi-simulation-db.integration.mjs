/* Explicitly opt-in; synthetic fixtures live in their own verification namespace. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore,newState,readState,mutate} from '../lib/xmi-sim/store.mjs';
import {verifyDataset} from '../lib/xmi-sim/data.mjs';
import {makeVersion} from '../lib/xmi-sim/registry.mjs';
import {queueResearch,tickResearch} from '../lib/xmi-sim/jobs.mjs';
if(process.env.XMI_SIM_INTEGRATION_TEST!=='true')throw Error('Explicit isolated integration test flag required');
const real=await openStore(),baseline=JSON.stringify((await readState(real)).state),scope='verification-'+randomUUID(),store={...real,environment:scope};
await store.sql.query('INSERT INTO xmi_sim_state(environment_id,payload) VALUES($1,$2::jsonb)',[scope,JSON.stringify(newState())]);
const first=Date.parse('2025-01-06T00:00:00Z')/1000;
const bars=[];let time=first;while(bars.length<600){const d=new Date(time*1000),day=d.getUTCDay(),h=d.getUTCHours();if(!(day===6||day===0&&h<22||day===5&&h>=22)){const close=1.1+Math.sin(bars.length/10)*0.006;bars.push({time,open:close-0.0001,high:close+0.0003,low:close-0.0003,close,closed:true});}time+=900;}
const dataset=verifyDataset(bars,{synthetic:true});dataset.id=scope;
await store.sql.query('INSERT INTO xmi_sim_datasets(id,environment_id,payload) VALUES($1,$2,$3::jsonb)',[dataset.id,scope,JSON.stringify(dataset)]);
await Promise.all([mutate(store,s=>{s.testCounter=(s.testCounter||0)+1;}),mutate(store,s=>{s.testCounter=(s.testCounter||0)+1;})]);
assert.equal((await readState(store)).state.testCounter,2);
// Each integration run gets a unique SHA-shaped dataset key in this namespace.
const id=(await import('node:crypto')).createHash('sha256').update(scope).digest('hex');dataset.id=id;
await store.sql.query('INSERT INTO xmi_sim_datasets(id,environment_id,payload) VALUES($1,$2,$3::jsonb)',[id,scope,JSON.stringify(dataset)]);
const j=await queueResearch(store,{...makeVersion({strategyId:'ema-trend'}),datasetId:id,limit:1});
await assert.rejects(tickResearch(store,j.id,{fault:'AFTER_CALCULATION'}),/INJECTED/);
await tickResearch(store,j.id);
const restarted={...await openStore(),environment:scope};
assert.equal((await readState(restarted)).state.jobs[0].cursor,1);
await tickResearch(restarted,j.id);await tickResearch(restarted,j.id);
const state=(await readState(restarted)).state;
assert.equal(state.runs.length,1);assert.equal(state.jobs[0].trials.length,1);assert.equal(state.runs[0].qualification.passed,false);
assert.equal(state.runs[0].account.trades.length,new Set(state.runs[0].account.trades.map(t=>t.id)).size);
const main=(await readState(real)).state;assert.equal(JSON.stringify(main),baseline);
console.log(JSON.stringify({databaseGuard:true,concurrentUpdates:true,checkpointReload:true,crashRecovery:true,noDuplicateTrials:true,noDuplicateTradeIds:true,syntheticQualificationBlocked:true,mainResearchNamespaceUnchanged:true,verificationScope:scope}));

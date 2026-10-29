import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {NextRequest} from "next/server";
import {COOKIE,productionFeedConfigured,verifyPassword,issueSession,verifySession,sameOrigin} from "../lib/xmiProductionFeedAuth.mjs";
import {GET as candles} from "../app/api/xmi/live/route.js";
import {GET as status,POST as login,DELETE as logout} from "../app/api/xmi/feed-session/route.js";
import {previewEnabled} from "../lib/xmiLiveProvider.mjs";
const origin="https://tradelocker-gpt-gateway.vercel.app";
const pwd="test-only-readonly-passphrase-24-characters";
const env=Object.freeze({VERCEL_ENV:"production",XMI_READONLY_MARKET_DATA_ENABLED:"true",
 XMI_FEED_PASSWORD_SHA256:createHash("sha256").update(pwd).digest("hex"),
 XMI_FEED_SESSION_SECRET:"test-only-signing-key-example-not-production-0123456789-abcxyz"});
function req(path,options={}){return new NextRequest(origin+path,options);}
async function withEnv(fn){
 const keys=Object.keys(env);
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,env);
 try{return await fn();}finally{for(const [key,value] of Object.entries(old)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }}
}
test("Production read-only feed requires explicit config and independent server-side session",()=>{
 assert.equal(productionFeedConfigured(env),true);
 assert.equal(previewEnabled(env),false);
 assert.equal(productionFeedConfigured({...env,XMI_READONLY_MARKET_DATA_ENABLED:"false"}),false);
 assert.equal(productionFeedConfigured({...env,XMI_FEED_SESSION_SECRET:"weak"}),false);
 assert.equal(productionFeedConfigured({...env,VERCEL_ENV:"preview"}),false);
 assert.equal(verifyPassword(pwd,env),true);
 assert.equal(verifyPassword(pwd+"x",env),false);
});
test("Sessions expire, resist tampering and cannot be replayed with another key",()=>{
 const now=1761750000000;
 const token=issueSession(env,now);
 assert.equal(verifySession(token,env,now+1000),true);
 assert.equal(verifySession(token,env,now+8*3600000+1),false);
 assert.equal(verifySession(token.replace(/.$/,"0"),env,now+1000),false);
 assert.equal(verifySession(token,{...env,XMI_FEED_SESSION_SECRET:env.XMI_FEED_SESSION_SECRET+"altered"},now+1000),false);
 assert.equal(verifySession(token,{...env,VERCEL_ENV:"preview"},now+1000),false);
 assert.ok(token.startsWith("v1."));
 assert.ok(!token.includes(pwd));
});
test("Read-only candle endpoint denies unauthenticated production requests before broker access",async()=>{
 await withEnv(async()=>{
  const response=await candles(req("/api/xmi/live?symbol=EURUSD&resolution=5m"));
  assert.equal(response.status,401);
  const data=await response.json();
  assert.equal(data.code,"FEED_LOCKED");
  assert.equal(response.headers.get("cache-control").includes("no-store"),true);
 });
});
test("Same-origin feed login sets HttpOnly strict session and permits access-status checks",async()=>{
 await withEnv(async()=>{
  const headers={"origin":origin,"sec-fetch-site":"same-origin","content-type":"application/json"};
  const unauthorized=await login(req("/api/xmi/feed-session",{method:"POST",headers,body:JSON.stringify({password:"not-right-password-value"})}));
  assert.equal(unauthorized.status,401);
  const response=await login(req("/api/xmi/feed-session",{method:"POST",headers,body:JSON.stringify({password:pwd})}));
  assert.equal(response.status,200);
  const cookie=response.headers.get("set-cookie");
  assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);
  assert.match(cookie,/Secure/i);assert.match(cookie,/Path=\/api\/xmi/i);
  const token=cookie.match(new RegExp(COOKIE+"=([^;]+)"))[1];
  assert.ok(verifySession(token,env));
  const active=await status(req("/api/xmi/feed-session",{headers:{cookie:COOKIE+"="+token}}));
  assert.equal((await active.json()).authenticated,true);
  const cleared=await logout(req("/api/xmi/feed-session",{method:"DELETE",headers:{"origin":origin,"cookie":COOKIE+"="+token}}));
  assert.match(cleared.headers.get("set-cookie"),/Max-Age=0/);
 });
});
test("Reject cross-origin feed credentials and reject missing production configuration",async()=>{
 await withEnv(async()=>{
  const evil=await login(req("/api/xmi/feed-session",{method:"POST",headers:{"origin":"https://attacker.invalid"},body:JSON.stringify({password:pwd})}));
  assert.equal(evil.status,403);
  assert.equal(sameOrigin(req("/api/xmi/feed-session",{headers:{"sec-fetch-site":"cross-site"}})),false);
  const blank=await candles(req("/api/xmi/live?symbol=EURUSD",{headers:{"sec-fetch-site":"cross-site"}}));
  assert.equal(blank.status,403);
 });
 const old=process.env.XMI_READONLY_MARKET_DATA_ENABLED;
 process.env.XMI_READONLY_MARKET_DATA_ENABLED="false";
 try{
  const resp=await candles(req("/api/xmi/live?symbol=EURUSD"));
  assert.equal(resp.status,503);
  assert.equal((await resp.json()).code,"FEED_DISABLED");
 }finally{if(old===undefined)delete process.env.XMI_READONLY_MARKET_DATA_ENABLED;
  else process.env.XMI_READONLY_MARKET_DATA_ENABLED=old;}
});
test("Cross-project broker execution flag stays hard-disabled",async()=>{
 const {XMI_CROSS_PROJECT_BRIDGE_APPROVED}=await import("../lib/xmiBridgePolicy.mjs");
 assert.equal(XMI_CROSS_PROJECT_BRIDGE_APPROVED,false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {tlFetch} from "../lib/tradelocker.js";
const keys=["TRADELOCKER_ENV","TRADELOCKER_EMAIL","TRADELOCKER_PASSWORD","TRADELOCKER_SERVER","TRADELOCKER_ACC_NUM"];
test("Broker requests singleflight login, retry only safe GET and redact provider responses",async()=>{
 const saved=new Map(keys.map(key=>[key,process.env[key]]));
 const originalFetch=globalThis.fetch;
 let logins=0,history=0,denied=0,post=0,token="t0";
 try{
  Object.assign(process.env,{TRADELOCKER_ENV:"demo",TRADELOCKER_EMAIL:"test@example.org",
   TRADELOCKER_PASSWORD:"fixture-not-real",TRADELOCKER_SERVER:"demo",TRADELOCKER_ACC_NUM:"1"});
  globalThis.fetch=async(url,options={})=>{
   const path=String(url);const method=options.method||"GET";
   if(path.endsWith("/auth/jwt/token")){
    logins++;token="fixture-token-"+logins;
    return new Response(JSON.stringify({accessToken:token,expiresIn:240}),{status:200});
   }
   if(path.endsWith("/trade/history?sample=ok")){
    history++;return new Response(JSON.stringify({d:{barDetails:[]}}),{status:200});
   }
   if(path.endsWith("/trade/history?sample=retry")){
    denied++;
    if(denied===1)return new Response("expired",{status:401});
    return new Response(JSON.stringify({ok:true}),{status:200});
   }
   if(path.endsWith("/trade/history?sample=blocked"))
    return new Response("<html>Do not leak broker server internals</html>",{status:403});
   if(path.endsWith("/trade/accounts/1/orders")&&method==="POST"){
    post++;return new Response("expired",{status:401});
   }
   throw Error("Unexpected mock TradeLocker route: "+path);
  };
  await Promise.all(Array.from({length:5},()=>tlFetch("/trade/history?sample=ok")));
  assert.equal(logins,1,"Concurrent requests must share exactly one broker login");
  assert.equal(history,5);
  assert.deepEqual(await tlFetch("/trade/history?sample=retry"),{ok:true});
  assert.equal(denied,2);
  assert.equal(logins,2,"Expired GET should cause exactly one safe reauthentication");
  await assert.rejects(tlFetch("/trade/history?sample=blocked"),err=>
   err.code==="UPSTREAM_ACCESS_DENIED"&&!/Do not leak/.test(err.message));
  await assert.rejects(tlFetch("/trade/accounts/1/orders",{method:"POST",body:"{}"}),err=>
   err.code==="UPSTREAM_AUTH_EXPIRED");
  assert.equal(post,1,"Order POST must not be retried automatically");
  assert.equal(logins,2);
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of keys){const value=saved.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

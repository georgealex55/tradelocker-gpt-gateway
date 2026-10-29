import test from "node:test";
import assert from "node:assert/strict";
import {googleConfig,correctOrigin,issueSession,sessionOwner,COOKIE_NAME} from "../lib/xmiGoogleSettings.mjs";
const secret="1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const env={XMI_GOOGLE_SETTINGS_ENABLED:"true",XMI_COACH_ENABLE_CLOUD:"true",
 XMI_GOOGLE_SETTINGS_ORIGIN:"https://research.example.org/",
 XMI_GOOGLE_CLIENT_ID:"1234567890-abcdefg.apps.googleusercontent.com",
 XMI_GOOGLE_SESSION_SECRET:secret};
test("Google account feature stays off without explicit complete preview configuration",()=>{
 assert.equal(googleConfig({}),null);
 assert.equal(googleConfig({...env,XMI_GOOGLE_SESSION_SECRET:"short"}),null);
 assert.equal(googleConfig({...env,XMI_GOOGLE_SETTINGS_ORIGIN:"http://research.example.org/"}),null);
 assert.equal(googleConfig({...env,XMI_COACH_ENABLE_CLOUD:"false"}),null);
 assert.equal(googleConfig(env).origin,"https://research.example.org");
});
test("HTTP-only scoped sessions require a verified owner and reject wrong audience/key",async()=>{
 const cfg=googleConfig(env),owner="a".repeat(64),token=await issueSession(owner,cfg);
 const request={cookies:{get:key=>key===COOKIE_NAME?{value:token}:undefined}};
 assert.equal(await sessionOwner(request,cfg),owner);
 await assert.rejects(()=>sessionOwner(request,{...cfg,secret:"1".repeat(64)}));
 await assert.rejects(()=>issueSession("not-verified",cfg));
 await assert.rejects(()=>sessionOwner({cookies:{get:()=>null}},cfg));
});
test("Only exactly authorized HTTPS preview origin can change private settings",()=>{
 const cfg=googleConfig(env);
 for(const input of ["https://research.example.org","https://research.example.org.evil.invalid","http://research.example.org","null"]){
  const request={headers:{get:()=>input}};
  assert.equal(correctOrigin(request,cfg),input===cfg.origin);
 }
});

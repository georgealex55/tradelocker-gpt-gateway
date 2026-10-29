import test from "node:test";
import assert from "node:assert/strict";
import {configuredAuth,configuredDatabase,allowedOrigin,restrictedLogin,XMI_COACH_PREVIEW_BRANCH} from "../lib/xmiCloudConfig.mjs";
import {subjectOwner} from "../lib/xmiCloudIdentity.mjs";
import {scopedTransaction,checkedTrades,fingerprintTrade,getJournal} from "../lib/xmiCloudStore.mjs";
const auth={
 XMI_COACH_ENABLE_CLOUD:"true",XMI_IDP_ISSUER:"https://id.example.org/",
 XMI_IDP_AUTHORIZE_URL:"https://id.example.org/oauth/authorize",
 XMI_IDP_TOKEN_URL:"https://id.example.org/oauth/token",
 XMI_IDP_JWKS_URL:"https://id.example.org/.well-known/jwks.json",
 XMI_IDP_CLIENT_ID:"xmi-public-client",XMI_IDP_AUDIENCE:"xmi-public-client",
 XMI_COACH_PUBLIC_ORIGIN:"https://xmi-preview.example.org/"
};
const db={
 XMI_COACH_ENABLE_CLOUD:"true",
 XMI_COACH_DATABASE_URL:"postgresql://xmi_coach_gateway_login:sample@ep-preview-neon.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require",
 DATABASE_URL:"postgresql://tradelocker_gateway:secret@otherhost.neon.tech/otherdb?sslmode=require",
 XMI_COACH_EXPECTED_BRANCH_ID:XMI_COACH_PREVIEW_BRANCH,XMI_COACH_ENVIRONMENT:"preview"
};
const config={branch:XMI_COACH_PREVIEW_BRANCH,environment:"preview"};
test("Private cloud fails closed when no explicit enable switch or missing provider fields",()=>{
 assert.equal(configuredAuth({}),null);
 assert.equal(configuredAuth({...auth,XMI_COACH_ENABLE_CLOUD:"false"}),null);
 assert.equal(configuredAuth({...auth,XMI_IDP_TOKEN_URL:""}),null);
 assert.equal(configuredAuth({...auth,XMI_IDP_AUDIENCE:"wrong"}),null);
 assert.equal(configuredAuth({...auth,XMI_IDP_JWKS_URL:"https://other.example.org/keys"}),null);
 assert.equal(configuredAuth({...auth,XMI_COACH_PUBLIC_ORIGIN:"https://xmi-preview.example.org/other"}),null);
 assert.equal(configuredAuth({...auth,XMI_COACH_PUBLIC_ORIGIN:"http://xmi-preview.example.org"}),null);
 assert.equal(configuredAuth(auth)?.redirectUri,"https://xmi-preview.example.org/xmi");
});
test("Production broker DB cannot substitute for the isolated preview store",()=>{
 assert.equal(configuredDatabase({}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_ENABLE_CLOUD:"false"}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_DATABASE_URL:db.DATABASE_URL}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_ENVIRONMENT:"production"}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_EXPECTED_BRANCH_ID:"br-wrong"}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_DATABASE_URL:"postgresql://neondb_owner:pass@ep-preview.neon.tech/db?sslmode=require"}),null);
 assert.equal(configuredDatabase({...db,XMI_COACH_DATABASE_URL:"postgresql://xmi:pass@unknown.example.org/db?sslmode=require"}),null);
 assert.equal(configuredDatabase(db)?.branch,XMI_COACH_PREVIEW_BRANCH);
});
test("Cross-origin mutation and privileged Neon login are rejected",()=>{
 assert.equal(allowedOrigin("https://xmi-preview.example.org","https://xmi-preview.example.org"),true);
 for(const origin of [null,"null","https://evil.example.org","http://xmi-preview.example.org",
  "https://xmi-preview.example.org.evil.org"])assert.equal(allowedOrigin(origin,"https://xmi-preview.example.org"),false);
 const role={rolname:"xmi_coach_gateway_login",rolcanlogin:true,rolbypassrls:false,
  rolsuper:false,rolcreaterole:false,rolcreatedb:false,member:true,can_set:true};
 assert.equal(restrictedLogin([role]),true);
 for(const flag of ["rolbypassrls","rolsuper","rolcreaterole","rolcreatedb"])
  assert.equal(restrictedLogin([{...role,[flag]:true}]),false);
 for(const flag of ["member","can_set","rolcanlogin"])
  assert.equal(restrictedLogin([{...role,[flag]:false}]),false);
 assert.equal(restrictedLogin([{...role,rolname:"neondb_owner"}]),false);
 assert.equal(restrictedLogin([role,role]),false);
});
test("Verified issuer and subject create stable and issuer-isolated owner keys",()=>{
 const a=subjectOwner("https://id.example.org/","account-A");
 assert.match(a,/^[a-f0-9]{64}$/);
 assert.equal(a,subjectOwner("https://id.example.org/","account-A"));
 assert.notEqual(a,subjectOwner("https://id.example.org/","account-B"));
 assert.notEqual(a,subjectOwner("https://other.example.org/","account-A"));
 assert.throws(()=>subjectOwner("x",""),/subject/);
});
function fakeDb(){
 const calls=[];
 const sql=(strings,...values)=>({text:strings.join("?"),values});
 sql.transaction=async statements=>{calls.push(statements);return [[],[{guard:1}],[{owner_scope:"a"}],
  [{id:4,trade:{symbol:"SPY"},source:"manual",created_at:"2026-10-28T15:00:00Z"}]];};
 return {sql,calls};
}
test("Private transaction always drops privilege, checks preview branch, then binds owner",async()=>{
 const {sql,calls}=fakeDb();
 const owner="a".repeat(64);
 const results=await scopedTransaction(sql,owner,config,[{text:"SELECT trade"}]);
 assert.equal(results.length,4);
 const ops=calls[0];
 assert.equal(ops.length,4);
 assert.match(ops[0].text,/SET LOCAL ROLE xmi_coach_app/);
 assert.match(ops[1].text,/xmi_coach_environment_guard/);
 assert.deepEqual(ops[1].values,[XMI_COACH_PREVIEW_BRANCH,"preview"]);
 assert.match(ops[2].text,/set_config/);
 assert.deepEqual(ops[2].values,[owner]);
 assert.equal(ops[3].text,"SELECT trade");
 assert.throws(()=>scopedTransaction(sql,"client-controlled",config,[{text:"SELECT"}]),/verified journal scope/);
});
test("Get journal returns only scoped data and never returns an unbounded page",async()=>{
 const {sql,calls}=fakeDb();
 const data=await getJournal(sql,"a".repeat(64),config,null);
 assert.equal(data.ok,true);
 assert.deepEqual(data.trades,[{symbol:"SPY",source:"manual",savedAt:"2026-10-28T15:00:00Z"}]);
 assert.equal(data.nextCursor,null);
 assert.equal(calls.length,1);
 await assert.rejects(()=>getJournal(sql,"a".repeat(64),config,"abc"),/Invalid cursor/);
});
test("Journal input keeps canonical stock/ETF trades and rejects raw broker fills",()=>{
 const valid={symbol:"SPY",side:"LONG",entry_time:"2026-10-28T15:00:00Z",
  entry_price:600,quantity:2};
 const trades=checkedTrades({source:"manual",trades:[valid]});
 assert.equal(trades[0].symbol,"SPY");
 assert.match(fingerprintTrade(trades[0]),/^[a-f0-9]{64}$/);
 assert.throws(()=>checkedTrades({source:"manual",trades:[{...valid,side:"BUY"}]}),/LONG or SHORT/);
 assert.throws(()=>checkedTrades({source:"broker",trades:[valid]}),/source/);
 assert.throws(()=>checkedTrades({source:"manual",trades:Array(101).fill(valid)}),/1-100/);
});

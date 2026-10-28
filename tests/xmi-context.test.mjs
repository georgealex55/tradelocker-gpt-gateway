import test from "node:test";
import assert from "node:assert/strict";
import {parseQuery,filterEvidence,loadPublicContext,XMI_PUBLIC_FEED} from "../lib/xmiContext.mjs";
const at=Date.parse("2026-09-24T16:00:00Z")/1000;
const valid={success:true,generatedAt:"2026-09-24T17:00:00Z",news:[
 {Timestamp:"2026-09-24T15:40:00Z","Published / Event Time":"2026-09-24T15:35:00Z",
  "Market / Asset":"SPY","Headline / Raw Event":"SPY market update",Source:"Evidence one",
  "Source URL":"https://example.org/spy"},
 {Timestamp:"2026-09-24T15:45:00Z","Published / Event Time":"2026-09-24T15:30:00Z",
  "Market / Asset":"",Topic:"GLOBAL MACRO","Headline / Raw Event":"Macro headline",Source:"Evidence two",
  "Source URL":"https://example.org/macro"},
 {Timestamp:"2026-09-24T16:05:00Z","Published / Event Time":"2026-09-24T15:20:00Z",
  "Market / Asset":"SPY","Headline / Raw Event":"Seen only after range end",
  "Source URL":"https://example.org/late"},
 {Timestamp:"2026-09-24T15:31:00Z","Published / Event Time":"2026-09-24T16:10:00Z",
  "Market / Asset":"SPY","Headline / Raw Event":"Published after range end",
  "Source URL":"https://example.org/future"},
 {Timestamp:"2026-09-24T15:10:00Z","Published / Event Time":"2026-09-24T15:01:00Z",
  "Market / Asset":"OANDA:USDCHF","Headline / Raw Event":"USDCHF story",
  "Source URL":"https://example.org/forex"},
 {Timestamp:"2026-09-24T15:15:00Z","Published / Event Time":"2026-09-24T15:13:00Z",
  "Market / Asset":"SPY","Headline / Raw Event":"Unsafe URL",
  "Source URL":"javascript:alert(1)"}
]};
const q={ticker:"AMEX:SPY",symbol:"SPY",start:at-3600,end:at};
test("Chart context accepts only bounded stock/ETF dates and venues",()=>{
 assert.deepEqual(parseQuery({symbol:"AMEX:SPY",start:at-3600,end:at},at),q);
 for(const params of [
 {symbol:"FOREX:USDCHF",start:at-3600,end:at},
 {symbol:"AMEX:SPY",start:at,end:at-1},
 {symbol:"AMEX:SPY",start:at-32*86400,end:at},
 {symbol:"AMEX:SPY",start:at,end:at+400}
 ])assert.throws(()=>parseQuery(params,at));
});
test("XMI evidence requires news published and first observed before end",()=>{
 const result=filterEvidence(valid,q);
 assert.equal(result.count,2);
 assert.deepEqual(result.stories.map(x=>x.scope),["broader-market","ticker-related"]);
 assert.ok(result.stories.every(x=>Date.parse(x.publishedAt)<=at*1000));
 assert.ok(result.stories.every(x=>Date.parse(x.observedAt)<=at*1000));
 assert.equal(result.coverage.type,"latest-80-only");
 assert.equal(result.coverage.requestedIntervalCovered,false);
 assert.match(result.notice,/not a complete historical archive/);
});
test("Broader-market news is differentiated from exact symbol",()=>{
 const result=filterEvidence(valid,q);
 assert.equal(result.stories.find(x=>x.scope==="ticker-related").title,"SPY market update");
 assert.equal(result.stories.find(x=>x.scope==="broader-market").title,"Macro headline");
});
test("Malformed response fails without inventing empty full-history coverage",()=>{
 assert.throws(()=>filterEvidence({},q),/unavailable/);
 assert.throws(()=>filterEvidence({success:true,news:null},q));
});
test("Public fetch target cannot be chosen through query parameters",async()=>{
 const calls=[];
 const mock=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(valid)};
 };
 const result=await loadPublicContext({...q,otherOrigin:"https://attacker.example"},mock);
 assert.equal(result.count,2);
 assert.equal(calls[0].url,XMI_PUBLIC_FEED);
 assert.equal(calls[0].options.method,"GET");
 assert.equal(calls[0].options.cache,"no-store");
});
test("Oversized or unavailable public responses fail closed",async()=>{
 await assert.rejects(()=>loadPublicContext(q,async()=>({ok:false})),/unavailable/);
 await assert.rejects(()=>loadPublicContext(q,async()=>({ok:true,headers:{get:()=>4_000_000}})),/size limit/);
});

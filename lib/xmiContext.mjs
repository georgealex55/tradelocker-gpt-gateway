/* Read-only public XMI news snapshot adapter.
 * No Neon credentials and no TradeLocker execution import. The upstream public
 * terminal returns only its latest 80 items; never claim exhaustive history.
 */
import {normalizeTicker} from "./xmiWorkspace.mjs";
export const XMI_PUBLIC_FEED="https://xmi-terminal.vercel.app/api/xmi";
const MAX_RANGE=31*86400;
function seconds(v){
 const n=Number(v);
 return Number.isSafeInteger(n)&&n>0?n:null;
}
export function parseQuery(raw, now=Math.floor(Date.now()/1000)){
 let ticker;
 try{ticker=normalizeTicker(String(raw?.symbol||""));}catch{throw Error("Select a stock/ETF exchange and symbol");}
 const start=seconds(raw?.start),end=seconds(raw?.end);
 if(!start||!end||start>=end||end-start>MAX_RANGE||end>now+120)
  throw Error("Select a valid historical interval of up to 31 days");
 return {symbol:ticker.split(":")[1],ticker,start,end};
}
function validHref(value){
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.length>3?u.href:null;}
 catch{return null;}
}
function relevant(news,symbol){
 const asset=String(news["Market / Asset"]||"").toUpperCase();
 const headline=String(news["Headline / Raw Event"]||"").toUpperCase();
 const topic=String(news.Topic||"").toUpperCase();
 const token=new RegExp("(^|[^A-Z0-9])"+symbol.replace(/[.-]/g,"\\$&")+"([^A-Z0-9]|$)");
 if(token.test(asset+" "+headline))return "ticker-related";
 if(/MACRO|GEOPOLIT|GLOBAL|FED|US ECONOMY|US POLICY|TRADE|CHINA/i.test(topic))return "broader-market";
 return null;
}
export function filterEvidence(snapshot,query){
 if(!snapshot||snapshot.success!==true||!Array.isArray(snapshot.news))throw Error("XMI snapshot unavailable");
 const seen=new Set(),stories=[],dropped={notRelevant:0,timestamp:0,duplicate:0};
 for(const row of snapshot.news.slice(0,80)){
  if(!row||typeof row!=="object")continue;
  const published=Date.parse(row["Published / Event Time"]||"");
  const observed=Date.parse(row.Timestamp||"");
  const href=validHref(row["Source URL"]);
  if(!Number.isFinite(published)||!Number.isFinite(observed)||!href||
    published>observed+120000||published>query.end*1000||observed>query.end*1000||
    observed<(query.start-86400)*1000||published<(query.start-86400)*1000){
   dropped.timestamp++;continue;
  }
  const scope=relevant(row,query.symbol);
  if(!scope){dropped.notRelevant++;continue;}
  if(seen.has(href)){dropped.duplicate++;continue;}
  seen.add(href);
  stories.push({
   title:String(row["Headline / Raw Event"]||"Untitled").slice(0,180),
   publishedAt:new Date(published).toISOString(),
   observedAt:new Date(observed).toISOString(),
   source:String(row.Source||"XMI public feed").slice(0,80),
   url:href,scope,
   timing:published<query.start*1000?"prior":"during"
  });
 }
 stories.sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
 const snapshotAt=Date.parse(snapshot.generatedAt||"");
 const seenObservations=(Array.isArray(snapshot.news)?snapshot.news:[]).map(r=>Date.parse(r?.Timestamp||"")).filter(Number.isFinite);
 const newestObserved=seenObservations.length?new Date(Math.max(...seenObservations)).toISOString():null;
 const oldestObserved=seenObservations.length?new Date(Math.min(...seenObservations)).toISOString():null;
 return {ok:true,symbol:query.symbol,ticker:query.ticker,start:query.start,end:query.end,
  stories:stories.slice(0,50),count:stories.length,feed:"XMI public Neon snapshot",coverage:{
   type:"latest-80-only",requestedIntervalCovered:false,oldestObserved,newestObserved,
   snapshotGeneratedAt:Number.isFinite(snapshotAt)?new Date(snapshotAt).toISOString():null,
   checked:Math.min(snapshot.news.length,80),returned:stories.length
  },
  notice:"Only up to 80 most recent XMI public news entries were checked. This is not a complete historical archive. Both publication and first-collected timestamps must precede the selected range end. News co-occurrence does not prove price causation."
 };
}
export async function loadPublicContext(query,requestFetch=fetch){
 const response=await requestFetch(XMI_PUBLIC_FEED,{
  method:"GET",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw Error("XMI public intelligence feed unavailable");
 const headerLength=Number(response.headers?.get?.("content-length")||0);
 if(headerLength>3_000_000)throw Error("XMI response exceeds size limit");
 const body=await response.text();
 if(body.length>3_000_000)throw Error("XMI response exceeds size limit");
 let data;try{data=JSON.parse(body);}catch{throw Error("XMI public feed response invalid");}
 return filterEvidence(data,query);
}

import {NextResponse} from "next/server.js";
import {getLiveSnapshot,previewEnabled,validatedRequest} from "../../../../lib/xmiLiveProvider.mjs";
import {parseInstrument,validateResolution} from "../../../../lib/xmiLiveMath.mjs";
import {XMI_MULTI_PROVIDER_MODE,getMultiProviderSnapshot} from "../../../../lib/xmiMultiProvider.mjs";
import {COOKIE,productionFeedConfigured,verifySession,sameOrigin,passphraselessStagingFeed,passphraselessProductionFeed} from "../../../../lib/xmiProductionFeedAuth.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
function json(payload,status){return NextResponse.json(payload,{status,headers});}
// Best-effort per-instance abuse control for password-free public candle reads.
// This never forwards account credentials or permits any broker write methods.
// External distributed/WAF limits are still advisable when traffic grows.
const minuteRequests=new Map();
let instanceMinute=0,instanceHits=0;
function publicFeedRateLimited(req){
 const minute=Math.floor(Date.now()/60000);
 if(minute!==instanceMinute){instanceMinute=minute;instanceHits=0;minuteRequests.clear();}
 const ip=(req.headers.get("x-vercel-forwarded-for")||"unknown").split(",")[0].trim().slice(0,100);
 const count=minuteRequests.get(ip)||0;
 if(instanceHits>=240||count>=75)return true;
 instanceHits++;minuteRequests.set(ip,count+1);
 if(minuteRequests.size>1000)minuteRequests.clear();
 return false;
}
export async function GET(req){
 // The original protected preview remains unchanged. Production requires an
 // explicit feed enable switch AND a separately verified, signed cookie.
 const preview=previewEnabled(process.env);
 const production=productionFeedConfigured(process.env);
 const automatic=passphraselessStagingFeed(process.env)||passphraselessProductionFeed(process.env);
 // Explicit switch only; legacy production remains untouched until a reviewed cutover.
 const multi=process.env.XMI_DATA_PROVIDER_MODE===XMI_MULTI_PROVIDER_MODE;
 if(!preview&&!production&&!automatic)return json({ok:false,readOnly:true,code:"FEED_DISABLED",
  error:"Read-only market data is not configured for this environment"},503);
 if(!sameOrigin(req))return json({ok:false,code:"ORIGIN_DENIED",error:"Same-origin XMI access only"},403);
 if(passphraselessProductionFeed(process.env)&&publicFeedRateLimited(req))
  return json({ok:false,readOnly:true,code:"FEED_RATE_LIMIT",
   error:"Read-only feed request limit reached. Refresh shortly."},429);
 if(production&&!automatic&&!verifySession(req.cookies.get(COOKIE)?.value,process.env))
  return json({ok:false,readOnly:true,code:"FEED_LOCKED",
   error:"Unlock the read-only candle feed to view current quotes"},401);
 let params;
 try{
  const u=new URL(req.url);
  const requested={symbol:u.searchParams.get("symbol"),resolution:u.searchParams.get("resolution")};
  params=multi?{instrument:parseInstrument(requested.symbol),
   resolution:validateResolution(requested.resolution||"5m")}:validatedRequest(requested);
 }catch{return json({ok:false,error:"Choose a supported instrument and timeframe"},400);}
 try{
  const data=multi?
   await getMultiProviderSnapshot({symbol:params.instrument.key,resolution:params.resolution}):
   await getLiveSnapshot({symbol:params.instrument.symbol,resolution:params.resolution});
  return json(data,200);
 }catch(e){
  // Return a bounded diagnostic category; never disclose auth responses or route metadata.
  const allowed=new Set(["EMPTY_CANDLES","UPSTREAM_AUTH_EXPIRED","UPSTREAM_ACCESS_DENIED",
   "UPSTREAM_RATE_LIMIT","UPSTREAM_QUOTA","UPSTREAM_UNAVAILABLE","UPSTREAM_BAD_RESPONSE",
   "PROVIDER_NOT_CONFIGURED","INVALID_PROVIDER_CANDLES"]);
  const code=allowed.has(e?.code)?e.code:"SOURCE_UNAVAILABLE";
  console.warn("[xmi-live] read-only source:",code);
  return json({ok:false,readOnly:true,code,
   error:code==="EMPTY_CANDLES"?"No verified candles returned for this symbol/timeframe":
    code==="UPSTREAM_RATE_LIMIT"?"Market-data provider is rate limiting requests":
    code==="UPSTREAM_ACCESS_DENIED"?"Market-data provider denied access":
    code==="PROVIDER_NOT_CONFIGURED"?"Market-data provider credentials are not configured":
    code==="INVALID_PROVIDER_CANDLES"?"Market-data provider returned invalid candles":
    "Read-only market candles are currently unavailable"},code==="UPSTREAM_RATE_LIMIT"?429:503);
 }
}

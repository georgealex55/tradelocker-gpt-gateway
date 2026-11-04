import {NextResponse} from "next/server.js";
import {getLiveSnapshot,previewEnabled,validatedRequest} from "../../../../lib/xmiLiveProvider.mjs";
import {parseInstrument,validateResolution} from "../../../../lib/xmiLiveMath.mjs";
import {XMI_MULTI_PROVIDER_MODE,getMultiProviderSnapshot} from "../../../../lib/xmiMultiProvider.mjs";
import {COOKIE,productionFeedConfigured,verifySession,sameOrigin} from "../../../../lib/xmiProductionFeedAuth.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
function json(payload,status){return NextResponse.json(payload,{status,headers});}
export async function GET(req){
 // The original protected preview remains unchanged. Production requires an
 // explicit feed enable switch AND a separately verified, signed cookie.
 const preview=previewEnabled(process.env);
 const production=productionFeedConfigured(process.env);
 // Explicit switch only; legacy production remains untouched until a reviewed cutover.
 const multi=process.env.XMI_DATA_PROVIDER_MODE===XMI_MULTI_PROVIDER_MODE;
 if(!preview&&!production)return json({ok:false,readOnly:true,code:"FEED_DISABLED",
  error:"Read-only market data is not configured for this environment"},503);
 if(!sameOrigin(req))return json({ok:false,code:"ORIGIN_DENIED",error:"Same-origin XMI access only"},403);
 if(production&&!verifySession(req.cookies.get(COOKIE)?.value,process.env))
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

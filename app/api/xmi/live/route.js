import {NextResponse} from "next/server.js";
import {getLiveSnapshot,previewEnabled,validatedRequest} from "../../../../lib/xmiLiveProvider.mjs";
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
 if(!preview&&!production)return json({ok:false,readOnly:true,code:"FEED_DISABLED",
  error:"Read-only TradeLocker candles are not configured for this environment"},503);
 if(!sameOrigin(req))return json({ok:false,code:"ORIGIN_DENIED",error:"Same-origin XMI access only"},403);
 if(production&&!verifySession(req.cookies.get(COOKIE)?.value,process.env))
  return json({ok:false,readOnly:true,code:"FEED_LOCKED",
   error:"Unlock the read-only candle feed to view current quotes"},401);
 let params;
 try{
  const u=new URL(req.url);
  params=validatedRequest({symbol:u.searchParams.get("symbol"),resolution:u.searchParams.get("resolution")});
 }catch{return json({ok:false,error:"Choose a supported forex pair and timeframe"},400);}
 try{
  const data=await getLiveSnapshot({symbol:params.instrument.symbol,resolution:params.resolution});
  return json(data,200);
 }catch(e){
  // Return a bounded diagnostic category; never disclose auth responses or route metadata.
  const allowed=new Set(["EMPTY_CANDLES","UPSTREAM_AUTH_EXPIRED","UPSTREAM_ACCESS_DENIED",
   "UPSTREAM_RATE_LIMIT","UPSTREAM_QUOTA","UPSTREAM_UNAVAILABLE","UPSTREAM_BAD_RESPONSE"]);
  const code=allowed.has(e?.code)?e.code:"SOURCE_UNAVAILABLE";
  console.warn("[xmi-live] read-only source:",code);
  return json({ok:false,readOnly:true,code,
   error:code==="EMPTY_CANDLES"?"No verified candles returned for this symbol/timeframe":
    code==="UPSTREAM_RATE_LIMIT"?"Market-data provider is rate limiting requests":
    code==="UPSTREAM_ACCESS_DENIED"?"Market-data provider denied access":
    "Forex candle data is currently unavailable"},code==="UPSTREAM_RATE_LIMIT"?429:503);
 }
}

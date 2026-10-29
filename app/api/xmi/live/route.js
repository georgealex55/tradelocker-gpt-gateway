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
  // Never expose brokerage response bodies, auth tokens, account IDs or stack traces.
  console.warn("[xmi-live] read-only candle source unavailable:",e?.name||"Error");
  return json({ok:false,readOnly:true,code:"SOURCE_UNAVAILABLE",
   error:"Forex candle data is currently unavailable"},503);
 }
}

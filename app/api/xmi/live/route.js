import {NextResponse} from "next/server";
import {getLiveSnapshot,previewEnabled,validatedRequest} from "../../../../lib/xmiLiveProvider.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
function json(payload,status){return NextResponse.json(payload,{status,headers});}
export async function GET(req){
 if(!previewEnabled(process.env))return json({ok:false,readOnly:true,
   code:"FEED_DISABLED",error:"Live broker candles are not enabled for this protected preview"},503);
 // The enable switch is not authentication. Enable only on a Vercel-auth-protected preview.
 const site=req.headers.get("sec-fetch-site");
 if(site&&site!=="same-origin")return json({ok:false,error:"Same-origin research only"},403);
 let params;
 try{
  const u=new URL(req.url);
  params=validatedRequest({symbol:u.searchParams.get("symbol"),resolution:u.searchParams.get("resolution")});
 }catch{return json({ok:false,error:"Choose a supported forex pair and timeframe"},400);}
 try{
  const data=await getLiveSnapshot({symbol:params.instrument.symbol,resolution:params.resolution});
  return json(data,200);
 }catch(e){
  // Broker exception text can contain account metadata. Never return it to the browser.
  console.warn("[xmi-live] read-only candle adapter unavailable:",e?.name||"Error");
  return json({ok:false,readOnly:true,code:"SOURCE_UNAVAILABLE",error:"Forex candle data is currently unavailable"},503);
 }
}

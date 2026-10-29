import {NextResponse} from "next/server";
import {getLiveSnapshot} from "../../../../lib/xmiLiveProvider.mjs";
import {bridgeEnabled,validateBridgeParams,authorizeBridge} from "../../../../lib/xmiBridgeAuth.mjs";
import {XMI_CROSS_PROJECT_BRIDGE_APPROVED} from "../../../../lib/xmiBridgePolicy.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0",
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function json(data,status){return NextResponse.json(data,{status,headers});}
export async function GET(req){
 // Hard disabled while private XMI defers authentication (owner option C).
 // Env switches and valid HMAC cannot override this code-reviewed policy.
 if(!XMI_CROSS_PROJECT_BRIDGE_APPROVED)
  return json({ok:false,code:"IMPORT_ONLY_POLICY",readOnly:true},503);
 if(!bridgeEnabled(process.env))
  return json({ok:false,code:"BRIDGE_DISABLED",readOnly:true},503);
 let params;
 try{
  const url=new URL(req.url);
  // Reject any extraneous query values to keep signature canonical and API bounded.
  if([...url.searchParams.keys()].some(k=>!["symbol","resolution"].includes(k))||
     url.searchParams.getAll("symbol").length!==1||
     url.searchParams.getAll("resolution").length!==1)throw Error("Invalid query");
  params=validateBridgeParams({symbol:url.searchParams.get("symbol"),resolution:url.searchParams.get("resolution")});
 }catch{return json({ok:false,code:"INVALID_REQUEST",readOnly:true},400);}
 if(!authorizeBridge({secret:process.env.XMI_BRIDGE_SHARED_SECRET,headers:req.headers,params}))
  return json({ok:false,code:"UNAUTHORIZED",readOnly:true},401);
 try{
  const data=await getLiveSnapshot(params);
  // Export only proven OHLC data, not broker account or instrument routing metadata.
  return json({ok:true,contract:"xmi-gateway-bridge/v1",readOnly:true,
   market:"forex",provider:"TradeLocker",symbol:params.symbol,
   resolution:params.resolution,asOf:data.asOf,
   sourceClock:"gateway snapshot time; bars carry broker OHLC timestamps",
   volumeBasis:data.volumeBasis,bars:data.bars},200);
 }catch(e){
  // Exception strings sometimes contain broker/route details. Do not expose them.
  console.warn("[xmi-bridge] read-only source unavailable:",e?.name||"Error");
  return json({ok:false,readOnly:true,code:"SOURCE_UNAVAILABLE"},503);
 }
}
export async function POST(){return json({ok:false,readOnly:true,code:"METHOD_NOT_ALLOWED"},405);}

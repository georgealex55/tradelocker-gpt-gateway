/* Preview-only owner-scoped chart preferences; no broker or production Neon access. */
import {NextResponse} from "next/server";
import {configuredDatabase} from "../../../../lib/xmiCloudConfig.mjs";
import {googleConfig,correctOrigin,sessionOwner} from "../../../../lib/xmiGoogleSettings.mjs";
import {verifiedStore,scopedTransaction} from "../../../../lib/xmiCloudStore.mjs";
import {deserializeWorkspace} from "../../../../lib/xmiChartTools.mjs";
import {strategyById} from "../../../../lib/xmiStrategyPresets.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADERS={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
function json(body,status=200){return NextResponse.json(body,{status,headers:HEADERS});}
async function context(request,write=false){
 const auth=googleConfig(process.env),db=configuredDatabase(process.env);
 if(!auth||!db)return {error:json({ok:false,error:"Account storage not configured"},503)};
 if(write&&!correctOrigin(request,auth))return {error:json({ok:false,error:"Origin rejected"},403)};
 let owner;try{owner=await sessionOwner(request,auth);}catch{return {error:json({ok:false,error:"Google sign-in required"},401)};}
 try{return {owner,db,sql:await verifiedStore(db)};}catch{return {error:json({ok:false,error:"Restricted preferences database unavailable"},503)};}
}
function validate(body){
 if(!body||JSON.stringify(body).length>370000||typeof body.workspace!=="string"||body.workspace.length>350000||
  !strategyById(body.strategyId))throw Error("Invalid saved research configuration");
 deserializeWorkspace(body.workspace);
 const layout=body.layout??{showBanner:true,showTabs:true};
 if(!layout||typeof layout!=="object"||Array.isArray(layout)||
  Object.keys(layout).some(key=>!["showBanner","showTabs"].includes(key))||
  typeof layout.showBanner!=="boolean"||typeof layout.showTabs!=="boolean")
  throw Error("Invalid layout preferences");
 const pins=body.pins??{};
 if(!pins||typeof pins!=="object"||Array.isArray(pins)||Object.keys(pins).length>30)throw Error("Invalid saved pin collection");
 for(const [ticker,urls] of Object.entries(pins)){
  if(!/^(FX:)?[A-Z0-9:.]{1,25}$/.test(ticker)||!Array.isArray(urls)||urls.length>40||
    urls.some(url=>typeof url!=="string"||url.length>700||!url.startsWith("https://")))throw Error("Invalid saved pin");
 }
 const patterns=body.patterns??{};
 if(!patterns||typeof patterns!=="object"||Array.isArray(patterns)||
  Object.values(patterns).some(v=>typeof v!=="boolean"))throw Error("Invalid pattern preferences");
 return {version:1,workspace:body.workspace,strategyId:body.strategyId,layout,pins,patterns};
}
export async function GET(request){
 const ctx=await context(request);if(ctx.error)return ctx.error;
 try{
  const [,,,rows]=await scopedTransaction(ctx.sql,ctx.owner,ctx.db,[
   ctx.sql`SELECT preferences FROM public.xmi_private_preferences WHERE owner_sub=${ctx.owner} LIMIT 1`
  ]);
  return json({ok:true,preferences:rows[0]?.preferences??null});
 }catch{return json({ok:false,error:"Preferences not available; check restricted schema setup"},503);}
}
export async function PUT(request){
 const ctx=await context(request,true);if(ctx.error)return ctx.error;
 if(Number(request.headers.get("content-length")||0)>380000)return json({ok:false,error:"Settings too large"},413);
 let prefs;try{prefs=validate(await request.json());}catch{return json({ok:false,error:"Invalid settings payload"},422);}
 try{
  await scopedTransaction(ctx.sql,ctx.owner,ctx.db,[
   ctx.sql`INSERT INTO public.xmi_private_preferences (owner_sub,preferences)
   VALUES (${ctx.owner},${JSON.stringify(prefs)}::jsonb)
   ON CONFLICT(owner_sub) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=now()`
  ]);
  return json({ok:true,saved:true});
 }catch{return json({ok:false,error:"Preferences could not be saved"},503);}
}

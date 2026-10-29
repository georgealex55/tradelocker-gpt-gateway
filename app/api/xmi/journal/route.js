import {NextResponse} from "next/server";
import {configuredAuth,configuredDatabase,allowedOrigin} from "../../../../lib/xmiCloudConfig.mjs";
import {requestOwner} from "../../../../lib/xmiCloudIdentity.mjs";
import {verifiedStore,getJournal,saveJournal,deleteJournal} from "../../../../lib/xmiCloudStore.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Vary":"Authorization"};
function json(value,status=200){return NextResponse.json(value,{status,headers});}
async function authorize(request,mutation){
 const auth=configuredAuth(process.env),db=configuredDatabase(process.env);
 if(!auth||!db)return {error:json({ok:false,error:"Private cloud journal not configured"},503)};
 if(mutation&&!allowedOrigin(request.headers.get("origin"),auth.origin))
  return {error:json({ok:false,error:"Invalid request origin"},403)};
 let owner;
 try{owner=await requestOwner(request,auth);}catch{
  return {error:json({ok:false,error:"Sign-in required or session expired"},401)};
 }
 try{return {sql:await verifiedStore(db),owner,db};}
 catch{return {error:json({ok:false,error:"Private store is not ready"},503)};}
}
export async function GET(request){
 const ctx=await authorize(request,false);if(ctx.error)return ctx.error;
 const cursor=new URL(request.url).searchParams.get("cursor");
 if(cursor!==null&&!/^[1-9][0-9]{0,17}$/.test(cursor))
  return json({ok:false,error:"Invalid cursor"},400);
 try{return json(await getJournal(ctx.sql,ctx.owner,ctx.db,cursor));}
 catch{return json({ok:false,error:"Private journal query unavailable"},503);}
}
export async function POST(request){
 const ctx=await authorize(request,true);if(ctx.error)return ctx.error;
 if(Number(request.headers.get("content-length")||0)>300000)
  return json({ok:false,error:"Request too large"},413);
 let body;try{body=await request.json();}catch{
  return json({ok:false,error:"Invalid JSON"},400);
 }
 try{
  const normalized=(await import("../../../../lib/xmiCloudStore.mjs")).checkedTrades(body);
  if(JSON.stringify(normalized).length>250000)throw Error("Trade batch too large");
  return json(await saveJournal(ctx.sql,ctx.owner,ctx.db,body));
 }catch(e){
  if(/Trade |Submit |source|batch too large/i.test(e.message))
   return json({ok:false,error:e.message.slice(0,180)},422);
  return json({ok:false,error:"Private journal write unavailable"},503);
 }
}
export async function DELETE(request){
 const ctx=await authorize(request,true);if(ctx.error)return ctx.error;
 let body;try{body=await request.json();}catch{return json({ok:false,error:"Invalid JSON"},400);}
 if(body?.confirm!=="DELETE MY JOURNAL")return json({ok:false,error:"Explicit deletion confirmation required"},400);
 try{return json(await deleteJournal(ctx.sql,ctx.owner,ctx.db));}
 catch{return json({ok:false,error:"Private journal deletion unavailable"},503);}
}

import {NextResponse} from "next/server";
import {loadPublicContext,parseQuery} from "../../../../lib/xmiContext.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req){
 const headers={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"};
 let parsed;
 try{
  const url=new URL(req.url);
  parsed=parseQuery({symbol:url.searchParams.get("symbol"),start:url.searchParams.get("start"),end:url.searchParams.get("end")});
 }catch(e){
  return NextResponse.json({ok:false,error:e.message},{status:400,headers});
 }
 try{
  const evidence=await loadPublicContext(parsed);
  return NextResponse.json(evidence,{status:200,headers});
 }catch{
  return NextResponse.json({ok:false,error:"XMI public news snapshot is temporarily unavailable",coverage:{type:"unavailable"}},{status:503,headers});
 }
}

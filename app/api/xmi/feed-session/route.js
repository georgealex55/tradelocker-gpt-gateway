import {NextResponse} from "next/server";
import {COOKIE,productionFeedConfigured,verifyPassword,issueSession,verifySession,sameOrigin} from "../../../../lib/xmiProductionFeedAuth.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const security={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const failures=new Map(); // Best-effort per-instance throttle; distributed Vercel WAF limits remain advisable.
function json(data,status=200){return NextResponse.json(data,{status,headers:security});}
function clientKey(req){
 const ip=req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||"unknown";
 return ip.slice(0,128);
}
function blocked(key,now){
 const prior=failures.get(key);
 if(!prior||prior.until<now){failures.delete(key);return false;}
 return prior.count>=8;
}
function failure(key,now){
 if(failures.size>1000)failures.clear();
 const prior=failures.get(key);
 failures.set(key,!prior||prior.until<now?{count:1,until:now+900000}:
  {count:prior.count+1,until:prior.until});
}
function configured(){return productionFeedConfigured(process.env);}
function hasSession(req){
 const token=req.cookies.get(COOKIE)?.value;
 return verifySession(token,process.env);
}
export async function GET(request){
 if(!sameOrigin(request))return json({ok:false,error:"Same-origin XMI access only"},403);
 return json({ok:true,configured:configured(),authenticated:hasSession(request),scope:"candles-only"});
}
export async function POST(request){
 if(!sameOrigin(request)||request.headers.get("origin")!==new URL(request.url).origin)
  return json({ok:false,error:"Same-origin login required"},403);
 if(!configured())return json({ok:false,code:"FEED_DISABLED",error:"Production read-only market feed not configured"},503);
 if(Number(request.headers.get("content-length")||0)>512)
  return json({ok:false,error:"Request too large"},413);
 const key=clientKey(request),now=Date.now();
 if(blocked(key,now))return json({ok:false,error:"Too many attempts. Try again later."},429);
 let body;try{body=await request.json();}catch{return json({ok:false,error:"Invalid request"},400);}
 if(!verifyPassword(body?.password,process.env)){
  failure(key,now);
  return json({ok:false,error:"Incorrect read-only access passphrase"},401);
 }
 failures.delete(key);
 const response=json({ok:true,authenticated:true,scope:"candles-only"});
 response.cookies.set(COOKIE,issueSession(process.env,now),{
  path:"/api/xmi",secure:process.env.VERCEL_ENV==="production",
  httpOnly:true,sameSite:"strict",maxAge:8*3600
 });
 return response;
}
export async function DELETE(request){
 if(!sameOrigin(request)||request.headers.get("origin")!==new URL(request.url).origin)
  return json({ok:false,error:"Same-origin logout required"},403);
 const response=json({ok:true,authenticated:false});
 response.cookies.set(COOKIE,"",{path:"/api/xmi",httpOnly:true,
  secure:process.env.VERCEL_ENV==="production",sameSite:"strict",maxAge:0});
 return response;
}

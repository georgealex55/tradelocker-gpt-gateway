import {NextResponse} from "next/server";
import {configuredAuth,configuredDatabase,allowedOrigin} from "../../../../../lib/xmiCloudConfig.mjs";
import {verifyIdentity} from "../../../../../lib/xmiCloudIdentity.mjs";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export async function POST(request){
 const cfg=configuredAuth(process.env),db=configuredDatabase(process.env);
 if(!cfg||!db)return NextResponse.json({ok:false,error:"Private sign-in not configured"},{status:503,headers});
 if(!allowedOrigin(request.headers.get("origin"),cfg.origin))
  return NextResponse.json({ok:false,error:"Invalid origin"},{status:403,headers});
 if(Number(request.headers.get("content-length")||0)>8000)
  return NextResponse.json({ok:false,error:"Request too large"},{status:413,headers});
 let values;try{values=await request.json();}catch{
  return NextResponse.json({ok:false,error:"Invalid JSON"},{status:400,headers});
 }
 const {code,verifier,nonce}=values||{};
 if(typeof code!=="string"||code.length<5||code.length>2048||
  typeof verifier!=="string"||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||
  typeof nonce!=="string"||!/^[A-Za-z0-9._~-]{16,255}$/.test(nonce))
  return NextResponse.json({ok:false,error:"Invalid PKCE callback"},{status:400,headers});
 try{
  const body=new URLSearchParams({grant_type:"authorization_code",client_id:cfg.clientId,code,
    code_verifier:verifier,redirect_uri:cfg.redirectUri});
  const response=await fetch(cfg.tokenUrl,{method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
   body:body.toString(),cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!response.ok)return NextResponse.json({ok:false,error:"Authentication code rejected"},{status:401,headers});
  const data=await response.json();
  const verified=await verifyIdentity(data.id_token,cfg,nonce);
  return NextResponse.json({ok:true,idToken:data.id_token,expiresAt:verified.expiresAt},{headers});
 }catch{
  return NextResponse.json({ok:false,error:"Sign-in could not be completed"},{status:401,headers});
 }
}

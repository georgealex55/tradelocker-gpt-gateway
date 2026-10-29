import {NextResponse} from "next/server";
import {configuredDatabase} from "../../../../../lib/xmiCloudConfig.mjs";
import {googleConfig,correctOrigin,googleCredentialOwner,issueSession,COOKIE_NAME,cookieOptions} from "../../../../../lib/xmiGoogleSettings.mjs";
export const runtime="nodejs";
export async function POST(request){
 const cfg=googleConfig(process.env);
 if(!cfg||!configuredDatabase(process.env))
  return NextResponse.json({ok:false,error:"Google cloud settings are not configured"},{status:503});
 if(!correctOrigin(request,cfg))return NextResponse.json({ok:false,error:"Origin rejected"},{status:403});
 if(Number(request.headers.get("content-length")||0)>12000)
  return NextResponse.json({ok:false,error:"Request too large"},{status:413});
 let body;try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid JSON"},{status:400});}
 try{
  const owner=await googleCredentialOwner(body?.credential,body?.nonce,cfg);
  const token=await issueSession(owner,cfg);
  const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
  response.cookies.set(COOKIE_NAME,token,cookieOptions);
  return response;
 }catch{return NextResponse.json({ok:false,error:"Google identity could not be verified"},{status:401});}
}

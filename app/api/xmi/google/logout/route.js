import {NextResponse} from "next/server";
import {googleConfig,correctOrigin,COOKIE_NAME,cookieOptions} from "../../../../../lib/xmiGoogleSettings.mjs";
export async function POST(request){
 const cfg=googleConfig(process.env);
 if(!cfg||!correctOrigin(request,cfg))
  return NextResponse.json({ok:false,error:"Origin rejected"},{status:403});
 const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
 response.cookies.set(COOKIE_NAME,"",{...cookieOptions,maxAge:0});
 return response;
}

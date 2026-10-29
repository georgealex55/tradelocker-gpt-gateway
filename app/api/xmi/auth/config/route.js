import {NextResponse} from "next/server";
import {configuredAuth,configuredDatabase} from "../../../../../lib/xmiCloudConfig.mjs";
export const dynamic="force-dynamic";
export function GET(){
 const auth=configuredAuth(process.env),db=configuredDatabase(process.env);
 const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 if(!auth||!db)return NextResponse.json({ok:true,configured:false},{headers});
 return NextResponse.json({ok:true,configured:true,authorizeUrl:auth.authorizeUrl,
  clientId:auth.clientId,redirectUri:auth.redirectUri},{headers});
}

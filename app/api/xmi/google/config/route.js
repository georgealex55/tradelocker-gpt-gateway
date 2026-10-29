import {NextResponse} from "next/server";
import {configuredDatabase} from "../../../../../lib/xmiCloudConfig.mjs";
import {googleConfig} from "../../../../../lib/xmiGoogleSettings.mjs";
export const dynamic="force-dynamic";
export function GET(){
 const cfg=googleConfig(process.env);
 const configured=Boolean(cfg&&configuredDatabase(process.env));
 return NextResponse.json({ok:true,configured,clientId:configured?cfg.clientId:null},
  {headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

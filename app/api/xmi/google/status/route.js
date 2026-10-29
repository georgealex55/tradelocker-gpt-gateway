import {NextResponse} from "next/server";
import {configuredDatabase} from "../../../../../lib/xmiCloudConfig.mjs";
import {googleConfig,sessionOwner} from "../../../../../lib/xmiGoogleSettings.mjs";
export const dynamic="force-dynamic";
export async function GET(request){
 const cfg=googleConfig(process.env);
 let signedIn=false;
 if(cfg&&configuredDatabase(process.env))try{await sessionOwner(request,cfg);signedIn=true;}catch{}
 return NextResponse.json({ok:true,signedIn},{headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
}

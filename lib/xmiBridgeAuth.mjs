/* Narrow private-XMI integration auth. No broker credentials or order capabilities. */
import {createHmac,timingSafeEqual} from "node:crypto";
const MAX_SKEW_MS=60000;
const RE=/^[A-Z]{6}$/;
const RES=new Set(["1m","5m","15m","30m","1H","4H","1D"]);
export function bridgeEnabled(env){
 return env.VERCEL_ENV==="preview"&&
  env.VERCEL_GIT_COMMIT_REF==="feature/xmi-tradingview-workstation-preview"&&
  env.XMI_READONLY_MARKET_DATA_ENABLED==="true"&&
  env.XMI_BRIDGE_ENABLED==="true"&&
  typeof env.XMI_BRIDGE_SHARED_SECRET==="string"&&env.XMI_BRIDGE_SHARED_SECRET.length>=32;
}
export function validateBridgeParams(input){
 const symbol=String(input.symbol||"").toUpperCase();
 const resolution=String(input.resolution||"5m");
 if(!RE.test(symbol)||!RES.has(resolution))throw Error("Invalid bridge symbol or timeframe");
 return {symbol,resolution};
}
export function signatureInput({symbol,resolution,timestamp}){
 return ["GET","/api/xmi/bridge",symbol,resolution,String(timestamp)].join("\n");
}
export function signBridge(secret,params){
 if(typeof secret!=="string"||secret.length<32)throw Error("Invalid bridge key");
 return createHmac("sha256",secret).update(signatureInput(params)).digest("hex");
}
export function authorizeBridge({secret,headers,params,now=Date.now()}){
 if(!secret||secret.length<32)return false;
 const timestamp=String(headers.get("x-xmi-bridge-timestamp")||"");
 if(!/^[0-9]{13}$/.test(timestamp))return false;
 if(Math.abs(now-Number(timestamp))>MAX_SKEW_MS)return false;
 const provided=String(headers.get("x-xmi-bridge-signature")||"");
 if(!/^[0-9a-f]{64}$/i.test(provided))return false;
 const expected=signBridge(secret,{...params,timestamp});
 return timingSafeEqual(Buffer.from(provided,"hex"),Buffer.from(expected,"hex"));
}

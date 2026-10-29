/* Server-side production authorization for read-only XMI candle history.
 * Never authorizes broker orders, positions, account access, or cross-project bridges.
 */
import {createHmac,createHash,randomBytes,timingSafeEqual} from "node:crypto";
export const COOKIE="xmi_readonly_feed_v1";
const TTL_MS=8*60*60*1000,COOKIE_RE=/^v1\.([0-9]{13})\.([A-Za-z0-9_-]{24})\.([0-9a-f]{64})$/;
export function productionFeedConfigured(env){
 return env.VERCEL_ENV==="production"&&env.XMI_READONLY_MARKET_DATA_ENABLED==="true"&&
  /^[0-9a-f]{64}$/.test(env.XMI_FEED_PASSWORD_SHA256||"")&&
  typeof env.XMI_FEED_SESSION_SECRET==="string"&&env.XMI_FEED_SESSION_SECRET.length>=48;
}
export function verifyPassword(candidate,env){
 if(!productionFeedConfigured(env)||typeof candidate!=="string"||
   candidate.length<16||candidate.length>128)return false;
 const actual=createHash("sha256").update(candidate,"utf8").digest();
 const expected=Buffer.from(env.XMI_FEED_PASSWORD_SHA256,"hex");
 return expected.length===32&&timingSafeEqual(actual,expected);
}
function signature(value,secret){return createHmac("sha256",secret).update(value).digest("hex");}
export function issueSession(env,now=Date.now()){
 if(!productionFeedConfigured(env))throw Error("Production market data is not configured");
 const body="v1."+(now+TTL_MS)+"."+randomBytes(18).toString("base64url");
 return body+"."+signature(body,env.XMI_FEED_SESSION_SECRET);
}
export function verifySession(token,env,now=Date.now()){
 if(!productionFeedConfigured(env)||typeof token!=="string"||token.length>210)return false;
 const match=COOKIE_RE.exec(token);if(!match)return false;
 const expires=Number(match[1]);
 if(!Number.isSafeInteger(expires)||expires<=now||expires>now+TTL_MS)return false;
 const i=token.lastIndexOf(".");
 const correct=Buffer.from(signature(token.slice(0,i),env.XMI_FEED_SESSION_SECRET),"hex");
 const supplied=Buffer.from(match[3],"hex");
 return supplied.length===correct.length&&timingSafeEqual(supplied,correct);
}
export function sameOrigin(request){
 const site=request.headers.get("sec-fetch-site");
 if(site&&site!=="same-origin")return false;
 const origin=request.headers.get("origin");
 if(!origin)return true; // GET can omit Origin; cookie is SameSite=Strict and HttpOnly.
 try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}

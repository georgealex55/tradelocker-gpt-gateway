/* Preview-only Google sign-in for saving XMI research preferences.
 * Never grants broker, execution, journal or production-database access. */
import {createRemoteJWKSet,jwtVerify,SignJWT} from "jose";
import {createHash} from "node:crypto";
const JWKS=createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export const COOKIE_NAME="xmi_google_research";
const safeOrigin=value=>{try{const u=new URL(value);return u.protocol==="https:"&&u.pathname==="/"&&!u.search&&!u.hash?u.origin:null;}catch{return null;}};
export function googleConfig(env){
 if(env.XMI_GOOGLE_SETTINGS_ENABLED!=="true"||env.XMI_COACH_ENABLE_CLOUD!=="true")return null;
 const origin=safeOrigin(env.XMI_GOOGLE_SETTINGS_ORIGIN||"");
 const clientId=env.XMI_GOOGLE_CLIENT_ID,secret=env.XMI_GOOGLE_SESSION_SECRET;
 if(!origin||typeof clientId!=="string"||!/^[A-Za-z0-9_.-]{8,180}\.apps\.googleusercontent\.com$/.test(clientId)||
  typeof secret!=="string"||secret.length<48||secret.length>512)return null;
 return {origin,clientId,secret};
}
export const correctOrigin=(request,cfg)=>request.headers.get("origin")===cfg.origin;
const key=cfg=>new TextEncoder().encode(cfg.secret);
export async function googleCredentialOwner(token,nonce,cfg){
 if(typeof token!=="string"||token.length>8192||typeof nonce!=="string"||
  !/^[A-Za-z0-9_-]{20,100}$/.test(nonce))throw Error("Invalid Google sign-in");
 const {payload}=await jwtVerify(token,JWKS,{issuer:["https://accounts.google.com","accounts.google.com"],
  audience:cfg.clientId,algorithms:["RS256"],clockTolerance:"30 seconds",maxTokenAge:"5 minutes"});
 if(payload.nonce!==nonce||typeof payload.sub!=="string"||!payload.sub||
  payload.sub.length>180||payload.email_verified!==true)
  throw Error("Google sign-in verification failed");
 return createHash("sha256").update("google\0"+payload.sub).digest("hex");
}
export async function issueSession(owner,cfg){
 if(!/^[a-f0-9]{64}$/.test(owner))throw Error("Invalid verified account");
 return new SignJWT({scope:"xmi-settings",owner}).setProtectedHeader({alg:"HS256"})
  .setIssuer(cfg.origin).setAudience("xmi-settings-preview").setIssuedAt().setExpirationTime("30m")
  .sign(key(cfg));
}
export async function sessionOwner(req,cfg){
 const token=req.cookies.get(COOKIE_NAME)?.value;
 if(typeof token!=="string"||token.length>4096)throw Error("Sign-in required");
 const {payload}=await jwtVerify(token,key(cfg),{issuer:cfg.origin,audience:"xmi-settings-preview",
  algorithms:["HS256"],clockTolerance:"10 seconds"});
 if(payload.scope!=="xmi-settings"||typeof payload.owner!=="string"||
  !/^[a-f0-9]{64}$/.test(payload.owner))throw Error("Session unavailable");
 return payload.owner;
}
export const cookieOptions={httpOnly:true,secure:true,sameSite:"lax",path:"/api/xmi",maxAge:1800};

/* RS256 OIDC identity verification: issuer, audience, nonce and expiry.
 * Owner is a pseudonym derived from the VERIFIED subject, never client input.
 */
import {createHash} from "node:crypto";
import {createRemoteJWKSet,jwtVerify} from "jose";
const cache=new Map();
export function subjectOwner(issuer,subject){
 if(typeof issuer!=="string"||typeof subject!=="string"||!subject||subject.length>180)
  throw Error("Verified account subject required");
 return createHash("sha256").update(issuer+"\0"+subject).digest("hex");
}
export async function verifyIdentity(idToken,cfg,nonce){
 if(typeof idToken!=="string"||idToken.length>8192||!cfg)
  throw Error("Invalid identity token");
 let jwks=cache.get(cfg.jwksUrl);
 if(!jwks){jwks=createRemoteJWKSet(new URL(cfg.jwksUrl));cache.set(cfg.jwksUrl,jwks);}
 const {payload}=await jwtVerify(idToken,jwks,{
  algorithms:["RS256"],issuer:cfg.issuer,audience:cfg.clientId,
  clockTolerance:"30 seconds",maxTokenAge:"1 hour"
 });
 if(typeof payload.sub!=="string"||!payload.sub||payload.sub.length>180)
  throw Error("Subject missing from verified token");
 if(nonce!==undefined&&
   (typeof nonce!=="string"||nonce.length<16||payload.nonce!==nonce))
  throw Error("OIDC nonce mismatch");
 return {owner:subjectOwner(cfg.issuer,payload.sub),expiresAt:payload.exp};
}
export async function requestOwner(req,cfg){
 const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get("authorization")||"");
 if(!match)throw Error("Sign in required");
 return (await verifyIdentity(match[1],cfg)).owner;
}

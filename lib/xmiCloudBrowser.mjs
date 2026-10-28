/* Browser-only PKCE callback. The verified ID token is held by the caller in memory.
 * Pending state contains no journal records, broker credentials, or DB secrets.
 */
const KEY="xmi-gateway-oidc-pkce";
function random(bytes){
 const values=new Uint8Array(bytes);
 crypto.getRandomValues(values);
 return btoa(String.fromCharCode(...values)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function loginRedirect(cfg){
 if(!cfg?.configured)throw Error("Private sign-in is not configured");
 if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)throw Error("Secure browser cryptography required");
 const verifier=random(32),nonce=random(24),state=random(24);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 sessionStorage.setItem(KEY,JSON.stringify({verifier,nonce,state,at:Date.now()}));
 const url=new URL(cfg.authorizeUrl);
 // Never inherit provider query parameters that could redirect the sign-in.
 url.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,
  response_type:"code",scope:"openid profile",code_challenge:challenge,
  code_challenge_method:"S256",state,nonce}).toString();
 window.location.assign(url.href);
}
export async function finishCallback(cfg){
 const u=new URL(window.location.href),code=u.searchParams.get("code");
 const error=u.searchParams.get("error");
 if(!code&&!error)return null;
 const returnedState=u.searchParams.get("state");
 for(const key of ["code","state","error","error_description","session_state"])
  u.searchParams.delete(key);
 window.history.replaceState(null,"",u.pathname+u.search+u.hash);
 let pending=null;
 try{pending=JSON.parse(sessionStorage.getItem(KEY)||"null");}catch{}
 sessionStorage.removeItem(KEY);
 if(error)throw Error("Identity provider declined sign-in");
 if(!pending||pending.state!==returnedState||Date.now()-pending.at>600000||
   Date.now()<pending.at||!cfg?.configured)
  throw Error("Sign-in state missing, invalid or expired");
 const response=await fetch("/api/xmi/auth/exchange",{method:"POST",
  headers:{"Content-Type":"application/json"},cache:"no-store",
  body:JSON.stringify({code,verifier:pending.verifier,nonce:pending.nonce})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok||typeof result.idToken!=="string")
  throw Error(result.error||"Identity verification failed");
 return {token:result.idToken,expiresAt:result.expiresAt};
}
export async function journalRequest(token,method="GET",payload=null,url="/api/xmi/journal"){
 if(typeof token!=="string"||!token)throw Error("Sign in before accessing private journal");
 if(!["GET","POST","DELETE"].includes(method)||!url.startsWith("/api/xmi/journal"))
  throw Error("Invalid private journal request");
 const response=await fetch(url,{method,cache:"no-store",
  headers:{"Authorization":"Bearer "+token,...(payload===null?{}:{"Content-Type":"application/json"})},
  ...(payload===null?{}:{body:JSON.stringify(payload)})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.ok!==true)
  throw Error(result.error||"Private journal request failed");
 return result;
}

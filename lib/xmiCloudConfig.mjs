/* Preview-only XMI private coaching configuration.
 * No fallback to gateway DATABASE_URL; no public trading credentials.
 */
export const XMI_COACH_PREVIEW_BRANCH="br-square-wave-awkq5zyt";
function httpsURL(raw){
 try{const u=new URL(raw);
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.hash?u:null;
 }catch{return null;}
}
export function configuredAuth(env){
 if(env.XMI_COACH_ENABLE_CLOUD!=="true")return null;
 const issuer=httpsURL(env.XMI_IDP_ISSUER);
 const authorize=httpsURL(env.XMI_IDP_AUTHORIZE_URL);
 const token=httpsURL(env.XMI_IDP_TOKEN_URL);
 const jwks=httpsURL(env.XMI_IDP_JWKS_URL);
 const origin=httpsURL(env.XMI_COACH_PUBLIC_ORIGIN);
 const clientId=env.XMI_IDP_CLIENT_ID;
 if(!issuer||!authorize||!token||!jwks||!origin||
  !clientId||typeof clientId!=="string"||clientId.length>200||
  !/^[A-Za-z0-9._~:/-]+$/.test(clientId)||env.XMI_IDP_AUDIENCE!==clientId||
  [authorize,token,jwks].some(x=>x.origin!==issuer.origin)||
  origin.pathname!=="/"||origin.search||origin.port&&origin.port!=="443")return null;
 return Object.freeze({issuer:issuer.href,authorizeUrl:authorize.href,
  tokenUrl:token.href,jwksUrl:jwks.href,clientId,
  redirectUri:origin.origin+"/xmi",origin:origin.origin});
}
export function configuredDatabase(env){
 if(env.XMI_COACH_ENABLE_CLOUD!=="true"||
  env.XMI_COACH_EXPECTED_BRANCH_ID!==XMI_COACH_PREVIEW_BRANCH||
  env.XMI_COACH_ENVIRONMENT!=="preview")return null;
 const raw=env.XMI_COACH_DATABASE_URL;
 if(typeof raw!=="string"||!raw||raw===env.DATABASE_URL)return null;
 try{
  const u=new URL(raw);
  if(!["postgres:","postgresql:"].includes(u.protocol)||
    !u.hostname.endsWith(".neon.tech")||!u.username||!u.password||
    u.username==="neondb_owner"||
    !["require","verify-full"].includes(u.searchParams.get("sslmode")))return null;
  // These credentials must be a dedicated SQL-created NO-BYPASSRLS login.
  return Object.freeze({url:raw,branch:XMI_COACH_PREVIEW_BRANCH,environment:"preview"});
 }catch{return null;}
}
export function cloudStatus(env){
 return {enabled:!!(configuredAuth(env)&&configuredDatabase(env))};
}
export function allowedOrigin(origin,configuredOrigin){
 if(typeof origin!=="string"||typeof configuredOrigin!=="string")return false;
 const u=httpsURL(origin);
 return !!u&&u.href===u.origin+"/"&&u.origin===configuredOrigin;
}
export function restrictedLogin(rows){
 const x=Array.isArray(rows)&&rows.length===1?rows[0]:null;
 return !!(x&&x.rolcanlogin===true&&x.rolbypassrls===false&&
  x.rolsuper===false&&x.rolcreaterole===false&&x.rolcreatedb===false&&
  x.member===true&&x.can_set===true&&x.rolname!=="neondb_owner"&&
  x.rolname!=="xmi_coach_app");
}

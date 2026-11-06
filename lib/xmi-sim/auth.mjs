import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const SESSION_COOKIE='xmi_sim_management_v1';
const hash=value=>createHash('sha256').update(value).digest();
export function managementKeyMatches(candidate,env=process.env){return typeof candidate==='string'&&candidate.length>=32&&candidate.length<=160&&typeof env.XMI_SIM_ADMIN_KEY==='string'&&env.XMI_SIM_ADMIN_KEY.length>=32&&timingSafeEqual(hash(candidate),hash(env.XMI_SIM_ADMIN_KEY));}
export function issueManagementSession(env=process.env,now=Date.now()){
 if(!env.XMI_SIM_ADMIN_KEY||env.XMI_SIM_ADMIN_KEY.length<32)throw Error('MANAGEMENT_NOT_CONFIGURED');
 const body='sim1.'+(now+6*3600000);return body+'.'+createHmac('sha256',env.XMI_SIM_ADMIN_KEY).update(body).digest('hex');
}
export function managementAuthorized(token,env=process.env,now=Date.now()){
 if(typeof token!=='string'||token.length>100||!env.XMI_SIM_ADMIN_KEY||env.XMI_SIM_ADMIN_KEY.length<32)return false;
 const m=/^sim1\.([0-9]{13})\.([a-f0-9]{64})$/.exec(token);if(!m)return false;
 const expires=Number(m[1]);if(expires<=now||expires>now+6*3600000)return false;
 const expected=createHmac('sha256',env.XMI_SIM_ADMIN_KEY).update('sim1.'+m[1]).digest();return timingSafeEqual(expected,Buffer.from(m[2],'hex'));
}
export function mutationOriginAllowed(request){
 const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if(site&&site!=='same-origin')return false;
 if(!origin)return false;
 try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}

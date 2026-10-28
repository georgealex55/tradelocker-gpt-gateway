/* Private coaching Neon store. Never use the gateway execution DATABASE_URL. */
import {neon} from "@neondatabase/serverless";
import {normalizeTrade} from "./xmiJournal.mjs";
import {restrictedLogin} from "./xmiCloudConfig.mjs";
import {createHash} from "node:crypto";
export function fingerprintTrade(t){
 return createHash("sha256").update(JSON.stringify([t.symbol,t.side,t.entry_time,t.entry_price,t.quantity,t.exit_time])).digest("hex");
}
export function scopedTransaction(sql,owner,cfg,queries){
 if(!/^[a-f0-9]{64}$/.test(owner)||!cfg||!Array.isArray(queries)||!queries.length)
  throw Error("Missing verified journal scope");
 // Transaction-local role change MUST precede branch verification and owner bind.
 return sql.transaction([
  sql`SET LOCAL ROLE xmi_coach_app`,
  sql`SELECT 1/(CASE WHEN (SELECT count(*) FROM public.xmi_coach_environment_guard)=1
    AND EXISTS(SELECT 1 FROM public.xmi_coach_environment_guard
     WHERE branch_id=${cfg.branch} AND environment=${cfg.environment}) THEN 1 ELSE 0 END) AS guard`,
  sql`SELECT set_config('xmi.coach_owner_sub',${owner},true) AS owner_scope`,
  ...queries
 ]);
}
export async function verifiedStore(cfg){
 const sql=neon(cfg.url);
 const rows=await sql.query("SELECT r.rolname,r.rolcanlogin,r.rolbypassrls,r.rolsuper,r.rolcreaterole,r.rolcreatedb,pg_has_role(current_user,'xmi_coach_app','member') AS member,pg_has_role(current_user,'xmi_coach_app','SET') AS can_set FROM pg_roles r WHERE r.rolname=current_user",[]);
 if(!restrictedLogin(rows))throw Error("Private Neon login is not restricted");
 return sql;
}
export function checkedTrades(body){
 if(!body||!Array.isArray(body.trades)||body.trades.length<1||body.trades.length>100)
  throw Error("Submit 1-100 complete trade records");
 if(!["manual","csv"].includes(body.source))throw Error("Trade source must be manual or csv");
 return body.trades.map((r,i)=>{try{return normalizeTrade(r);}catch(e){throw Error("Trade "+(i+1)+": "+e.message);}});
}
export async function getJournal(sql,owner,cfg,cursor){
 if(cursor!==null&&!/^[1-9][0-9]{0,17}$/.test(cursor))throw Error("Invalid cursor");
 const query=cursor
  ?sql`SELECT id,trade,source,created_at FROM public.xmi_private_trades WHERE owner_sub=${owner} AND id<${cursor}::bigint ORDER BY id DESC LIMIT 201`
  :sql`SELECT id,trade,source,created_at FROM public.xmi_private_trades WHERE owner_sub=${owner} ORDER BY id DESC LIMIT 201`;
 const [,,,rows]=await scopedTransaction(sql,owner,cfg,[query]);
 const page=rows.slice(0,200);
 return {ok:true,trades:page.map(r=>({...r.trade,source:r.source,savedAt:r.created_at})),
  nextCursor:rows.length>200?String(page[page.length-1].id):null};
}
export async function saveJournal(sql,owner,cfg,body){
 const trades=checkedTrades(body);
 const inserts=trades.map(t=>sql`INSERT INTO public.xmi_private_trades (owner_sub,fingerprint,trade,source)
  VALUES(${owner},${fingerprintTrade(t)},${JSON.stringify(t)}::jsonb,${body.source})
  ON CONFLICT(owner_sub,fingerprint) DO NOTHING RETURNING id`);
 const results=await scopedTransaction(sql,owner,cfg,inserts);
 const inserted=results.slice(3).reduce((n,rows)=>n+rows.length,0);
 return {ok:true,inserted,duplicates:trades.length-inserted};
}
export async function deleteJournal(sql,owner,cfg){
 const [,,,rows]=await scopedTransaction(sql,owner,cfg,
  [sql`WITH deleted AS (DELETE FROM public.xmi_private_trades WHERE owner_sub=${owner} RETURNING id)
    SELECT count(*)::int AS count FROM deleted`]);
 return {ok:true,deleted:rows[0]?.count||0};
}

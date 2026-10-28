"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import {loginRedirect,finishCallback,journalRequest} from "../../lib/xmiCloudBrowser.mjs";
import {fingerprint} from "../../lib/xmiJournal.mjs";
function shortError(e){return String(e?.message||"Request failed").slice(0,190);}
export default function XMICloudSync({trades,setTrades}){
 const [config,setConfig]=useState(null);
 const [session,setSession]=useState(null);
 const [status,setStatus]=useState("Checking private-account configuration…");
 const [busy,setBusy]=useState(false);
 const initialized=useRef(false);
 useEffect(()=>{
  let mounted=true;
  // Reuse the same callback promise during React strict-mode effect replay.
  // Parsing an OAuth code twice would consume it and lose the session.
  if(!initialized.current)initialized.current=(async()=>{
   const response=await fetch("/api/xmi/auth/config",{cache:"no-store"});
   const cfg=await response.json();
   if(!response.ok||cfg.ok!==true)throw Error("Account configuration unavailable");
   const account=await finishCallback(cfg);
   return {cfg,account};
  })();
  initialized.current.then(({cfg,account})=>{
   if(!mounted)return;
   setConfig(cfg);
   if(account){setSession(account);setStatus("Signed in. Upload or load is optional; no background sync.");}
   else setStatus(cfg.configured?
     "Cloud journal ready for sign-in. No trades upload automatically.":
     "Cloud sync unavailable: secure identity provider and private Neon login are not configured.");
  }).catch(e=>{
   if(mounted){setConfig({configured:false});setStatus("Sign-in unavailable: "+shortError(e));}
  });
  return ()=>{mounted=false;};
 },[]);
 function token(){
  if(!session?.token)throw Error("Sign in to access your private cloud journal");
  if(Number(session.expiresAt)*1000<Date.now()+30000){
   setSession(null);throw Error("Session expired. Sign in again");
  }
  return session.token;
 }
 async function login(){
  if(trades.length){
   setStatus("Export and clear unsaved local journal entries before sign-in. OAuth redirects reload the page.");
   return;
  }
  try{await loginRedirect(config);}
  catch(e){setStatus("Cannot sign in: "+shortError(e));}
 }
 async function load(){
  setBusy(true);setStatus("Loading your own trade history…");
  try{
   const id=token(),received=[];let cursor=null;
   for(let page=0;page<26;page++){
    const url="/api/xmi/journal"+(cursor?"?cursor="+encodeURIComponent(cursor):"");
    const data=await journalRequest(id,"GET",null,url);
    if(!Array.isArray(data.trades))throw Error("Invalid journal response");
    received.push(...data.trades);
    cursor=data.nextCursor;
    if(!cursor)break;
    if(page===25)throw Error("Journal has more than 5,200 entries; pagination stopped");
   }
   setTrades(previous=>{
    const seen=new Set(previous.map(fingerprint)),next=[...previous];
    for(const t of received){
     const key=fingerprint(t);
     if(!seen.has(key)){next.push(t);seen.add(key);}
    }
    return next.slice(-5000);
   });
   setStatus("Loaded "+received.length+" private cloud records into this tab. No cloud writes performed.");
  }catch(e){
   if(/expired|Sign in/i.test(e?.message||""))setSession(null);
   setStatus("Cloud download unavailable: "+shortError(e));
  }finally{setBusy(false);}
 }
 async function upload(){
  if(!trades.length){setStatus("No local trades to upload.");return;}
  if(!window.confirm("Upload "+trades.length+" local trades to YOUR private Neon journal? This is an explicit cloud-storage action."))return;
  setBusy(true);setStatus("Uploading your approved local journal records…");
  try{
   const id=token();let inserted=0,duplicates=0;
   for(const source of ["csv","manual"]){
    const chosen=trades.filter(t=>t.source===source||!t.source&&source==="manual");
    for(let i=0;i<chosen.length;i+=100){
     const data=await journalRequest(id,"POST",{source,trades:chosen.slice(i,i+100)});
     inserted+=Number(data.inserted||0);
     duplicates+=Number(data.duplicates||0);
    }
   }
   setStatus("Cloud upload complete: "+inserted+" new records, "+duplicates+" duplicates. Local records remain intact.");
  }catch(e){
   if(/expired|Sign in/i.test(e?.message||""))setSession(null);
   setStatus("Cloud upload stopped: "+shortError(e)+". Some earlier batches may have saved; retry is deduplicated.");
  }finally{setBusy(false);}
 }
 async function deleteCloud(){
  if(!window.confirm("Delete all of YOUR cloud journal records? This does not delete local entries."))return;
  const typed=window.prompt("Type DELETE MY JOURNAL to confirm permanent cloud deletion");
  if(typed!=="DELETE MY JOURNAL"){setStatus("Cloud deletion canceled.");return;}
  setBusy(true);setStatus("Deleting verified account's cloud records…");
  try{
   const data=await journalRequest(token(),"DELETE",{confirm:"DELETE MY JOURNAL"});
   setStatus("Deleted "+Number(data.deleted||0)+" records from your cloud journal. Local records were not deleted.");
  }catch(e){setStatus("Cloud deletion unavailable: "+shortError(e));}
  finally{setBusy(false);}
 }
 const signedIn=Boolean(session);
 return <div className={styles.coachCloud}>
   <h3>Private Neon account memory</h3>
   <p>Account access is opt-in. ID tokens stay in tab memory only. No automatic uploads,
     broker data access, or public journal endpoint.</p>
   <p role="status" className={styles.contextStatus}>{status}</p>
   <div className={styles.journalActions}>
    {!signedIn?<button type="button" onClick={login}
      disabled={!config?.configured||busy||trades.length>0}>Sign in securely</button>:
      <>
       <button type="button" onClick={load} disabled={busy}>Load cloud history</button>
       <button type="button" onClick={upload} disabled={busy||!trades.length}>Upload selected journal</button>
       <button type="button" onClick={deleteCloud} disabled={busy}>Delete my cloud journal</button>
       <button type="button" onClick={()=>{setSession(null);setStatus("Signed out. Local entries remain in this tab.");}}
        disabled={busy}>Sign out</button>
      </>
    }
   </div>
   {trades.length>0&&!signedIn?<p className={styles.muted}>
      Sign-in uses an external redirect. Export your local journal first and clear it
      before redirecting, or sign in before importing trades. This prevents silent loss
      of tab-only records.</p>:null}
   <p className={styles.muted}>Cloud sync cannot run until preview-only OIDC settings,
     a restricted SQL-created Neon login, and owner-isolation browser QA are completed.
     Do not use TradeLocker's execution database for coaching history.</p>
 </div>;
}

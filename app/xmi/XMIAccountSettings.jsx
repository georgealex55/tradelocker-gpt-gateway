"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
function nonce(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
export default function XMIAccountSettings({workspace,strategyId,onRestore}){
 const [open,setOpen]=useState(false),[config,setConfig]=useState(null);
 const [signedIn,setSignedIn]=useState(false),[status,setStatus]=useState("Checking account configuration…");
 const [busy,setBusy]=useState(false);
 const target=useRef(null);
 async function load(){
  const r=await fetch("/api/xmi/preferences",{cache:"no-store"});
  const data=await r.json();
  if(!r.ok||!data.ok)throw Error(data.error||"Cloud preferences unavailable");
  if(data.preferences){onRestore(data.preferences);setStatus("Private settings restored from your account.");}
  else setStatus("Account connected; no saved settings yet.");
 }
 useEffect(()=>{let live=true;(async()=>{
  const response=await fetch("/api/xmi/google/config",{cache:"no-store"});
  const cfg=await response.json();if(!live)return;
  setConfig(cfg);
  if(!cfg.configured){setStatus("Google sign-in and restricted private settings storage require preview-only setup.");return;}
  const auth=await fetch("/api/xmi/google/status",{cache:"no-store"}).then(x=>x.json());
  if(!live)return;setSignedIn(Boolean(auth.signedIn));
  if(auth.signedIn)try{await load();}catch(e){if(live)setStatus(e.message);}
  else setStatus("Sign in with Google to save and restore account preferences.");
 })().catch(()=>live&&setStatus("Account settings service unavailable."));return ()=>{live=false;};},[]);
 useEffect(()=>{
  if(!open||!config?.configured||signedIn||!target.current)return;
  let canceled=false,loaded=false;
  const script=document.createElement("script");
  script.src="https://accounts.google.com/gsi/client";script.async=true;script.defer=true;
  script.onload=()=>{
   if(canceled||!window.google?.accounts?.id||!target.current)return;
   const value=nonce();
   window.google.accounts.id.initialize({
    client_id:config.clientId,nonce:value,
    callback:async({credential})=>{
     if(canceled)return;
     setBusy(true);
     try{
      const response=await fetch("/api/xmi/google/login",{method:"POST",credentials:"same-origin",
       headers:{"Content-Type":"application/json"},body:JSON.stringify({credential,nonce:value})});
      const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||"Login rejected");
      setSignedIn(true);await load();
     }catch(e){setStatus("Google sign-in failed: "+String(e.message).slice(0,130));}
     finally{setBusy(false);}
    }
   });
   loaded=true;target.current.replaceChildren();
   window.google.accounts.id.renderButton(target.current,{theme:"filled_black",size:"large",text:"signin_with",width:240});
  };
  script.onerror=()=>setStatus("Google sign-in script blocked or unavailable.");
  document.head.appendChild(script);
  return ()=>{canceled=true;if(loaded)window.google?.accounts?.id?.cancel?.();script.remove();};
 },[open,config?.configured,config?.clientId,signedIn]);
 async function save(){
  if(!signedIn){setOpen(true);return;}
  if(typeof workspace!=="string"||!workspace){setStatus("Open the Live Chart first so there are settings to save.");return;}
  setBusy(true);
  try{
   const pins=JSON.parse(localStorage.getItem("xmi-news-pins-v1")||"{}");
   const patterns=JSON.parse(localStorage.getItem("xmi-pattern-types-v1")||"{}");
   const result=await fetch("/api/xmi/preferences",{method:"PUT",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspace,strategyId,pins,patterns})});
   const data=await result.json();if(!result.ok||!data.ok)throw Error(data.error||"Save failed");
   setStatus("Account settings saved in the isolated, owner-scoped preview database.");
  }catch(e){setStatus("Cloud save failed: "+String(e.message).slice(0,130));}finally{setBusy(false);}
 }
 async function logout(){
  try{await fetch("/api/xmi/google/logout",{method:"POST",credentials:"same-origin"});}catch{}
  setSignedIn(false);setStatus("Signed out. Local preview settings remain on this device.");
 }
 return <div className={styles.accountSettings}>
  <button type="button" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>
   {signedIn?"Google account · connected":"Google sign-in / Settings"}
  </button>
  <button type="button" onClick={save} disabled={busy}>{busy?"Working…":"Save settings"}</button>
  {open?<section className={styles.accountWall} aria-label="Google account settings">
   <div><strong>Sign in to save across devices</strong>
    <button type="button" aria-label="Close account settings" onClick={()=>setOpen(false)}>×</button></div>
   <p>{status}</p>
   {!config?.configured?<p>Google OAuth and restricted preview-only Neon storage are not configured. Guest research remains available, but cloud saves are disabled. No credentials have been installed automatically.</p>:null}
   {signedIn?<div className={styles.accountActions}>
    <button type="button" onClick={load} disabled={busy}>Restore saved settings</button>
    <button type="button" onClick={logout}>Sign out</button>
   </div>:<div ref={target} aria-label="Google sign in" />}
   <small>Google identity grants access to saved preferences only. It does not enable broker feeds or trading.</small>
  </section>:null}
 </div>;
}

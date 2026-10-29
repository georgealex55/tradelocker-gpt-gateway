"use client";
import {useEffect,useState} from "react";
import styles from "./xmi.module.css";
import {usernameKey,storageKey,register,unlock,reseal} from "../../lib/xmiLocalVault.mjs";
import {CHART_UI_KEY,normalizeChartUI,normalizeShellUI} from "../../lib/xmiWorkspaceState.mjs";

export default function XMIAccountSettings({workspace,strategyId,layout,strategyEdits={},workspaceUI,onRestore}){
 const [open,setOpen]=useState(false),[session,setSession]=useState(null);
 const [mode,setMode]=useState("login"),[username,setUsername]=useState("");
 const [password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("Sign in to a local device account to save encrypted research preferences.");
 const [hydrated,setHydrated]=useState(false);
 useEffect(()=>setHydrated(true),[]);
 useEffect(()=>{if(!open){setPassword("");setConfirm("");}},[open]);
 function currentPreferences(){
  let pins={},patterns={};
  try{pins=JSON.parse(localStorage.getItem("xmi-news-pins-v1")||"{}");}catch{}
  try{patterns=JSON.parse(localStorage.getItem("xmi-pattern-types-v1")||"{}");}catch{}
  let chartUI=null;
  try{
   const raw=localStorage.getItem(CHART_UI_KEY);
   if(raw)chartUI=normalizeChartUI(JSON.parse(raw));
  }catch{}
  return {workspace:typeof workspace==="string"?workspace:"",
   strategyId,layout:{showBanner:layout?.showBanner!==false,showTabs:layout?.showTabs!==false},
   pins,patterns,strategyEdits,chartUI,workspaceUI:normalizeShellUI(workspaceUI)};
 }
 async function enter(event){
  event.preventDefault();if(busy)return;
  setBusy(true);
  try{
   const name=usernameKey(username),keyName=storageKey(name);
   const saved=localStorage.getItem(keyName);
   if(mode==="create"){
    if(saved!==null)throw Error("That local username already exists on this device");
    if(password!==confirm)throw Error("Passwords do not match");
    const created=await register(name,password,currentPreferences());
    localStorage.setItem(keyName,JSON.stringify(created.record));
    setSession({username:name,key:created.key});
    setStatus("Local account created. Your encrypted settings backup is saved on this device.");
   }else{
    if(!saved)throw Error("No local account at this site in this browser. Preview and production accounts are separate; choose Create account here.");
    const unlocked=await unlock(name,password,JSON.parse(saved));
    setSession({username:name,key:unlocked.key});
    onRestore?.(unlocked.preferences);
    setStatus("Signed in locally. Your encrypted settings were restored.");
   }
   setPassword("");setConfirm("");
  }catch(error){setStatus(String(error?.message||"Local account action failed").slice(0,170));}
  finally{setBusy(false);}
 }
 async function save(){
  if(!session){setOpen(true);setStatus("Sign in locally before saving settings.");return;}
  if(!workspace){setStatus("Open Live Chart to initialize research settings before saving.");return;}
  setBusy(true);
  try{
   const keyName=storageKey(session.username),saved=localStorage.getItem(keyName);
   if(!saved)throw Error("Local account backup is missing");
   const record=await reseal(session.username,session.key,JSON.parse(saved),currentPreferences());
   localStorage.setItem(keyName,JSON.stringify(record));
   setStatus("Encrypted preferences saved on this device. No network request was made.");
  }catch(error){setStatus("Local save failed: "+String(error.message).slice(0,150));}
  finally{setBusy(false);}
 }
 function signOut(){
  if(!window.confirm("Sign out and clear unencrypted working chart settings from this device? Save your encrypted account settings first."))return;
  for(const name of ["xmi-chart-workbench-v1",CHART_UI_KEY,"xmi-workspace-ui-v3","xmi-pattern-types-v1","xmi-news-pins-v1","xmi-layout-ui-v2","xmi-strategy-edits-v1","xmi-strategy-research-versions-v1","xmi-strategy-research-comparisons-v1"]){
   try{localStorage.removeItem(name);}catch{}
  }
  setSession(null);setPassword("");setConfirm("");window.location.assign("/xmi");
 }
 return <div className={styles.accountSettings}>
  <button type="button" disabled={!hydrated} onClick={()=>setOpen(x=>!x)} aria-expanded={open}>
   {session?"Local account · "+session.username:"Local login / Settings"}
  </button>
  <button type="button" onClick={save} disabled={busy||!hydrated}>{busy?"Working…":"Save settings"}</button>
  {open?<section className={styles.accountWall} aria-label="Local account settings">
   <div><strong>Device-local account</strong><button type="button" aria-label="Close account settings" onClick={()=>setOpen(false)}>×</button></div>
   <p role="status">{status}</p>
   {session?<div className={styles.accountActions}>
     <button type="button" onClick={signOut}>Sign out</button>
    </div>:<>
     <div className={styles.accountActions} role="group" aria-label="Account action">
      <button type="button" aria-pressed={mode==="login"} onClick={()=>setMode("login")}>Sign in</button>
      <button type="button" aria-pressed={mode==="create"} onClick={()=>setMode("create")}>Create account</button>
     </div>
     <form onSubmit={enter} className={styles.localLoginForm}>
      <label>Username<input required autoComplete="username" maxLength={32} value={username} onChange={e=>setUsername(e.target.value)} placeholder="researcher"/></label>
      <label>Password<input required type="password" autoComplete={mode==="create"?"new-password":"current-password"}
       minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="12+ characters"/></label>
      {mode==="create"?<label>Confirm password<input required type="password" autoComplete="new-password" minLength={12}
       maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>:null}
      <button type="submit" disabled={busy}>{busy?"Checking…":mode==="create"?"Create encrypted account":"Unlock local account"}</button>
     </form>
    </>}
   <small>Sign-in is for this website and browser profile only. A login created on a preview URL will not automatically work at the production URL. Accounts and encrypted settings exist only in this browser on this device. Passwords are not sent to a server or stored. There is no Google sign-in, cloud synchronization or password-recovery service. Losing your password or clearing browser storage makes this backup unrecoverable. Existing guest chart caches may remain visible on the device.</small>
  </section>:null}
 </div>;
}

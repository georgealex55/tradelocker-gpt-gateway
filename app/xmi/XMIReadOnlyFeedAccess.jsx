"use client";
import {useEffect,useState} from "react";
import styles from "./xmi.module.css";
export default function XMIReadOnlyFeedAccess(){
 const [configured,setConfigured]=useState(false),[authenticated,setAuthenticated]=useState(false);
 const [open,setOpen]=useState(false),[passphrase,setPassphrase]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("Checking market-data access…");
 useEffect(()=>{let active=true;
  fetch("/api/xmi/feed-session",{cache:"no-store",credentials:"same-origin"})
   .then(r=>r.json()).then(d=>{if(!active)return;
    setConfigured(d.configured===true);setAuthenticated(d.authenticated===true);
    setStatus(d.configured?"Unlock read-only candles with your feed passphrase.":
      "Live candles are not enabled on this environment. Historical imports remain available.");
   }).catch(()=>{if(active)setStatus("Unable to check feed access; use historical imports.");});
  return ()=>{active=false;};
 },[]);
 function changed(){window.dispatchEvent(new Event("xmi:feed-access-changed"));}
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);
  try{
   const response=await fetch("/api/xmi/feed-session",{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({password:passphrase})});
   const data=await response.json();setPassphrase("");
   if(!response.ok||data.authenticated!==true)
    throw Error(data.error||"Read-only candle access denied");
   setAuthenticated(true);setOpen(false);setStatus("Read-only candles unlocked for this browser session.");changed();
  }catch(error){setStatus(String(error.message).slice(0,180));}
  finally{setBusy(false);}
 }
 async function logout(){
  if(busy)return;setBusy(true);
  try{
   const r=await fetch("/api/xmi/feed-session",{method:"DELETE",credentials:"same-origin"});
   if(!r.ok)throw Error("Could not close the read-only feed session");
   setAuthenticated(false);setPassphrase("");
   setStatus("Read-only feed access locked; imported historical charts remain available.");changed();
  }catch(error){setStatus(String(error.message).slice(0,180));}
  finally{setBusy(false);}
 }
 return <div className={styles.feedAccess}>
  <button type="button" disabled={busy} onClick={()=>setOpen(x=>!x)} aria-expanded={open}
   title={authenticated?"Read-only feed session authorized. Candle freshness is shown on each chart.":status}>
   <span aria-hidden="true" className={authenticated?styles.statusGood:styles.statusDot}/>
   {authenticated?"Feed unlocked":"Unlock read-only feed"}
  </button>
  {open?<section className={styles.feedAccessPanel} aria-label="Read-only market data access">
   <div className={styles.popoverHeading}><strong>TradeLocker candles · read only</strong>
    <button type="button" aria-label="Close feed access" onClick={()=>setOpen(false)}>×</button></div>
   <p role="status">{status}</p>
   {authenticated?
    <button type="button" disabled={busy} onClick={logout}>Lock feed</button>:
    <form onSubmit={submit}>
     <label htmlFor="xmi-feed-passphrase">Feed access passphrase</label>
     <input id="xmi-feed-passphrase" type="password" minLength={16} maxLength={128}
      autoComplete="off" required value={passphrase} onChange={e=>setPassphrase(e.target.value)}
      placeholder="Access passphrase" disabled={!configured||busy}/>
     <button type="submit" disabled={!configured||busy}>{busy?"Verifying…":"Unlock read-only candles"}</button>
    </form>}
   <small>This unlock is separate from your device-local account that saves research settings.
    Sessions expire after eight hours. Feed access does not permit trading or order submission.</small>
  </section>:null}
 </div>;
}

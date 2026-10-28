"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import XMICloudSync from "./XMICloudSync";
import {importTrades,normalizeTrade,fingerprint,coachSummary} from "../../lib/xmiJournal.mjs";

function localISO(value){
 if(!value)return "";
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))throw Error("Invalid trade time");
 return new Date(ms).toISOString();
}
export default function XMICoachPanel({ticker}){
 const [rows,setRows]=useState([]);
 const [mode,setMode]=useState("manual");
 const [report,setReport]=useState("This is your private, tab-only journal. Nothing uploads automatically.");
 const [formError,setFormError]=useState("");
 const [notes,setNotes]=useState("");
 const [setup,setSetup]=useState("");
 const stats=coachSummary(rows);
 function mergeTrades(previous,trades,source){
  const known=new Set(previous.map(fingerprint)),next=[...previous];
  for(const t of trades){
   const key=fingerprint(t);
   if(!known.has(key)){next.push({...t,source:t.source||source});known.add(key);}
  }
  return next.slice(-5000);
 }
 async function onImport(event){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>2_000_000){setReport("Import rejected: maximum file size 2 MB.");return;}
  try{
   const batch=importTrades(await file.text());
   setRows(previous=>mergeTrades(previous,batch.trades,"csv"));
   setReport("Processed "+batch.total+" CSV rows · "+batch.trades.length+" valid · "+
      batch.errors.length+" invalid. Duplicate trades are skipped. "+
      (batch.errors.length?"First errors: "+batch.errors.slice(0,2).map(x=>"row "+x.row+" "+x.reason).join("; "):""));
  }catch(e){setReport("CSV import rejected: "+e.message);}
 }
 function onManual(event){
  event.preventDefault();setFormError("");
  try{
   const values=Object.fromEntries(new FormData(event.currentTarget).entries());
   values.symbol=ticker.split(":")[1];
   values.entry_time=localISO(values.entry_time);
   values.exit_time=localISO(values.exit_time);
   values.notes=notes;values.setup=setup;
   const trade=normalizeTrade(values);
   setRows(previous=>mergeTrades(previous,[trade],"manual"));
   setReport("Trade saved in this tab only. No broker order or upload was placed.");
   event.currentTarget.reset();setNotes("");setSetup("");
  }catch(e){setFormError(e.message);}
 }
 async function restore(event){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>2_000_000){setReport("Restore rejected: maximum file size 2 MB.");return;}
  try{
   const data=JSON.parse(await file.text());
   if(data?.format!=="xmi-local-journal-v1"||!Array.isArray(data.trades)||
      data.trades.length>5000)throw Error("Not a supported XMI journal export");
   const trades=data.trades.map((raw,index)=>{
    try{return {...normalizeTrade(raw),source:raw.source==="csv"?"csv":"manual"};}
    catch(e){throw Error("Record "+(index+1)+": "+e.message);}
   });
   setRows(previous=>mergeTrades(previous,trades,"manual"));
   setReport("Restored "+trades.length+" validated local records. Cloud upload is still optional.");
  }catch(e){setReport("Restore rejected: "+e.message);}
 }
 function exportJournal(){
  if(!rows.length)return;
  const payload={format:"xmi-local-journal-v1",exportedAt:new Date().toISOString(),trades:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;
  a.download="xmi-private-journal-"+new Date().toISOString().slice(0,10)+".json";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setReport("Private JSON exported. Keep the downloaded file secure.");
 }
 const actions=[{id:"manual",title:"New trade",hint:"Manual entry"},
   {id:"import",title:"Import history",hint:"CSV or saved JSON"},
   {id:"cloud",title:"Private account",hint:"Opt-in sync"}];
 return <section className={styles.infoCard+" "+styles.toolCard} id="xmi-coach" aria-label="Personal trade journal">
   <div className={styles.toolIntro}>
    <div><h3>Personal trade journal</h3>
     <p>Record the trade, review habits, and keep control of where your history lives.</p></div>
    <span className={styles.dataSource}>LOCAL BY DEFAULT</span>
   </div>
   <div className={styles.journalMetrics}>
    <div><span>Trades</span><strong>{stats.trades}</strong></div>
    <div><span>Closed</span><strong>{stats.completed}</strong></div>
    <div><span>Recorded P/L</span><strong>{stats.pnl.toFixed(2)}</strong></div>
    <div><span>Win rate</span><strong>{stats.winRate===null?"—":stats.winRate+"%"}</strong></div>
    <div><span>Rules followed</span><strong>{stats.consistency===null?"—":stats.consistency+"%"}</strong></div>
   </div>
   <div className={styles.journalModes} role="group" aria-label="Journal actions">
    {actions.map(action=><button type="button" key={action.id}
       className={mode===action.id?styles.modeActive:""} aria-pressed={mode===action.id}
       onClick={()=>{setMode(action.id);setFormError("");}}>
       <strong>{action.title}</strong><small>{action.hint}</small>
    </button>)}
   </div>
   <div hidden={mode!=="manual"} className={styles.journalArea}>
    <div className={styles.modeHeading}><h4>Journal {ticker.split(":")[1]}</h4>
      <span>Stock/ETF · local record</span></div>
    <form onSubmit={onManual} className={styles.journalForm}>
     <div className={styles.fieldGrid}>
      <label>Direction<select name="side"><option>LONG</option><option>SHORT</option></select></label>
      <label>Entry time · local<input required type="datetime-local" name="entry_time"/></label>
      <label>Entry price<input required type="number" name="entry_price" step="any" min="0.000001"/></label>
      <label>Shares<input required type="number" name="quantity" step="any" min="0.000001"/></label>
      <label>Exit time · optional<input type="datetime-local" name="exit_time"/></label>
      <label>Exit price · optional<input type="number" name="exit_price" step="any" min="0.000001"/></label>
     </div>
     <details className={styles.advancedForm}>
      <summary>Setup notes & behavior checks <span>Optional</span></summary>
      <label className={styles.fullLabel}>Setup<input maxLength={80} value={setup}
        onChange={e=>setSetup(e.target.value)} placeholder="e.g. Pullback + retest"/></label>
      <label className={styles.fullLabel}>Trade notes<textarea maxLength={2000} rows={2}
        value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did the setup look like?"/></label>
      <div className={styles.fieldGrid}>
       <label>Entry confirmed?<select name="confirmed"><option value="">Unrecorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
       <label>Followed plan?<select name="followed_plan"><option value="">Unrecorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
       <label>Chased entry?<select name="chased"><option value="">Unrecorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
       <label>Moved stop?<select name="moved_stop"><option value="">Unrecorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
     </details>
     <button className={styles.primaryAction} type="submit">Save trade locally</button>
     {formError?<p className={styles.error} role="alert">{formError}</p>:null}
    </form>
   </div>
   <div hidden={mode!=="import"} className={styles.journalArea}>
    <div className={styles.modeHeading}><h4>Import or restore trades</h4><span>Local validation only</span></div>
    <div className={styles.importOptions}>
     <label>Import trade CSV <input type="file" accept=".csv,text/csv"
       aria-label="Import a CSV of historical stock trades" onChange={onImport}/></label>
     <label>Restore XMI journal JSON <input type="file" accept=".json,application/json"
       aria-label="Restore your exported local XMI journal" onChange={restore}/></label>
    </div>
    <details className={styles.advancedForm}>
     <summary>CSV format and limits</summary>
     <p>One LONG/SHORT stock or ETF trade per row; raw BUY/SELL order fills are not
       interpreted as round trips. Maximum 2 MB and 5,000 rows.</p>
     <code>symbol,side,entry_time,entry_price,quantity</code>
     <p>For completed trades, include <code>exit_time</code> and <code>exit_price</code>.
       Use timezone-qualified ISO times, e.g. 2026-10-28T14:30:00Z.</p>
    </details>
   </div>
   <div hidden={mode!=="cloud"} className={styles.journalArea}>
    <XMICloudSync trades={rows} setTrades={setRows}/>
   </div>
   <div className={styles.resultStrip} role="status" aria-live="polite">{report}</div>
   <div className={styles.journalActions}>
    <button type="button" disabled={!rows.length} onClick={exportJournal}>Export private JSON</button>
    <button type="button" disabled={!rows.length} onClick={()=>{
      if(window.confirm("Discard all local trades in this browser tab?")){
       setRows([]);setReport("Local records cleared. Cloud records, if any, are unchanged.");
      }
    }}>Clear local records</button>
   </div>
   {stats.alerts.length?<details className={styles.advancedForm}>
    <summary>Observed behavior flags <span>{stats.alerts.length}</span></summary>
    <ul className={styles.storyList}>
     {stats.alerts.slice(0,10).map((item,i)=><li key={item.at+"-"+i}>
      {item.symbol} · {item.note} · {new Date(item.at).toLocaleString()}</li>)}
    </ul>
   </details>:null}
   <p className={styles.disclaimer}>P/L is based on recorded entry/exit prices and share quantity,
     excluding fees and slippage. Behavior flags use only your annotations, not predictions.
     Local data disappears on reload unless exported. Cloud storage remains disabled until
     sign-in and restricted database access are configured and verified.</p>
 </section>;
}

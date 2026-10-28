"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import XMICloudSync from "./XMICloudSync";
import {importTrades,normalizeTrade,fingerprint,coachSummary} from "../../lib/xmiJournal.mjs";

function localISO(value){
 if(!value)return "";
 const millis=Date.parse(value);
 if(!Number.isFinite(millis))throw Error("Invalid trade time");
 return new Date(millis).toISOString();
}
export default function XMICoachPanel({ticker}){
 const [rows,setRows]=useState([]);
 const [report,setReport]=useState("Journal data is held only in this browser tab's memory.");
 const [formError,setFormError]=useState("");
 const [notes,setNotes]=useState("");
 const [setup,setSetup]=useState("");
 const stats=coachSummary(rows);
 async function onImport(event){
  const f=event.target.files?.[0];event.target.value="";
  if(!f)return;
  if(f.size>2_000_000){setReport("Import rejected: maximum file size 2 MB.");return;}
  try{
   const batch=importTrades(await f.text());let added=0;
   setRows(previous=>{
    const known=new Set(previous.map(fingerprint));
    const next=[...previous];
    for(const t of batch.trades){
     const id=fingerprint(t);
     if(!known.has(id)){next.push({...t,source:'csv'});known.add(id);added++;}
    }
    return next.slice(-5000);
   });
   setReport("Imported "+batch.trades.length+" valid rows, with "+batch.errors.length+
     " invalid rows flagged. Review CSV first; duplicates are skipped. "+
     (batch.errors.length?"Examples: "+batch.errors.slice(0,3).map(e=>"row "+e.row+" "+e.reason).join("; "):""));
  }catch(e){setReport("Import rejected: "+e.message);}
 }
 function onManual(event){
  event.preventDefault();setFormError("");
  try{
   const payload=Object.fromEntries(new FormData(event.currentTarget).entries());
   payload.symbol=ticker.split(":")[1];
   payload.entry_time=localISO(payload.entry_time);
   payload.exit_time=localISO(payload.exit_time);
   payload.notes=notes;payload.setup=setup;
   const trade=normalizeTrade(payload);
   setRows(previous=>{
    if(previous.some(x=>fingerprint(x)===fingerprint(trade)))return previous;
    return [...previous,{...trade,source:'manual'}].slice(-5000);
   });
   setReport("Trade journaled locally (no broker order, no server upload).");
   event.currentTarget.reset();
   setNotes("");setSetup("");
  }catch(e){setFormError(e.message);}
 }
 function exportEntries(){
  if(!rows.length){setReport("No journal records to export.");return;}
  const blob=new Blob([JSON.stringify({format:"xmi-local-journal-v1",exportedAt:new Date().toISOString(),trades:rows},null,2)],
   {type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="xmi-private-journal-"+new Date().toISOString().slice(0,10)+".json";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setReport("Export requested. Keep the downloaded file private; it contains your trades.");
 }
 return <section className={styles.infoCard} id="xmi-coach" aria-label="Personal trading coach">
  <h2>Personal Trading Coach</h2>
  <p>Historical trades and manually annotated setups are analyzed locally. Nothing on this panel places
    orders or uploads journal data to TradeLocker, XMI, or Vercel.</p>
  <div className={styles.coachNotice}>
    <strong>Private cloud sync: not active.</strong> A verified identity provider and
    least-privilege Neon login are required before account memory can be enabled.
    The private coach service in XMI Draft PR #2 is not yet deployed.
  </div>
  <div className={styles.journalMetrics}>
   <div><span>Trades</span><strong>{stats.trades}</strong></div>
   <div><span>Completed</span><strong>{stats.completed}</strong></div>
   <div><span>Recorded P/L</span><strong>{stats.pnl.toFixed(2)}</strong></div>
   <div><span>Win rate</span><strong>{stats.winRate===null?"—":stats.winRate+"%"}</strong></div>
   <div><span>Rule adherence</span><strong>{stats.consistency===null?"—":stats.consistency+"%"}</strong></div>
  </div>
  <div className={styles.journalSplit}>
   <div>
    <h3>Import historical trade CSV</h3>
    <p>One row per LONG/SHORT trade, not raw broker fills. Max 2 MB / 5,000 rows.</p>
    <input type="file" accept=".csv,text/csv" aria-label="Import historical trade CSV" onChange={onImport}/>
    <details><summary>Required CSV columns</summary>
     <code>symbol,side,entry_time,entry_price,quantity</code>
     <p>Closed trades also require exit_time and exit_price. Use timezone-qualified ISO timestamps
      (for example, 2026-10-28T14:30:00Z). Optional:
      setup, notes, confirmed, followed_plan, chased, moved_stop.</p>
    </details>
   </div>
   <div>
    <h3>Journal {ticker.split(":")[1]} setup</h3>
    <form onSubmit={onManual} className={styles.journalForm}>
     <div className={styles.fieldGrid}>
      <label>Direction<select name="side"><option>LONG</option><option>SHORT</option></select></label>
      <label>Entry (local)<input required name="entry_time" type="datetime-local"/></label>
      <label>Entry price<input required name="entry_price" type="number" min="0.000001" step="any"/></label>
      <label>Shares<input required name="quantity" type="number" min="0.000001" step="any"/></label>
      <label>Exit (optional, local)<input name="exit_time" type="datetime-local"/></label>
      <label>Exit price (optional)<input name="exit_price" type="number" min="0.000001" step="any"/></label>
      <label>Entry confirmed?<select name="confirmed"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label>Followed plan?<select name="followed_plan"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label>Chased entry?<select name="chased"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label>Moved stop?<select name="moved_stop"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
     </div>
     <label className={styles.fullLabel}>Setup<input value={setup} maxLength={80} onChange={e=>setSetup(e.target.value)} placeholder="EMA pullback"/></label>
     <label className={styles.fullLabel}>Trade notes<textarea value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)}
       rows={2} placeholder="Plan, conditions, lesson…"/></label>
     <button type="submit">Save trade locally</button>
     {formError?<p className={styles.error} role="alert">{formError}</p>:null}
    </form>
   </div>
  </div>
  <p role="status" className={styles.contextStatus}>{report}</p>
  <div className={styles.journalActions}>
    <button type="button" onClick={exportEntries} disabled={!rows.length}>Export private JSON</button>
    <button type="button" disabled={!rows.length} onClick={()=>{
      if(window.confirm("Discard all local journal records in this tab?")){setRows([]);setReport("Local journal cleared.");}
    }}>Clear local journal</button>
  </div>
  <XMICloudSync trades={rows} setTrades={setRows}/>
  {stats.alerts.length?<div><h3>Observed behavior flags</h3>
    <ul className={styles.storyList}>{stats.alerts.slice(0,10).map((a,i)=><li key={a.at+i}>
      {a.symbol} · {a.note} · {new Date(a.at).toLocaleString()}</li>)}</ul></div>:null}
  <p className={styles.muted}>Only explicitly recorded behavior is flagged. Small samples are not
    predictive. Local records disappear on page reload unless you export them; the TradingView
    hosted widget cannot provide trade entry or selected-region data programmatically.</p>
 </section>;
}

"use client";
import {useEffect,useState} from "react";
import {replayHistoricalJson} from "../../lib/xmiHistoricalReplay.mjs";
import {STRATEGY_VERSIONS_KEY,RESEARCH_COMPARISONS_KEY,
 normalizeStrategyVersions,saveStrategyVersion,removeStrategyVersion,
 compareSavedStrategyVersions,normalizeComparisonSummaries,saveComparisonSummary}
 from "../../lib/xmiStrategyResearch.mjs";
import styles from "./xmi.module.css";

/* Research files remain in browser memory. Only explicit version configs and
 * abbreviated comparison summaries are persisted to device-local storage. */
export default function XMIHistoricalReplay({symbol,resolution,strategyId,edit}){
 const [source,setSource]=useState(""),[capturedAt,setCapturedAt]=useState(null);
 const [filename,setFilename]=useState("");
 const [result,setResult]=useState(null),[comparison,setComparison]=useState(null);
 const [versions,setVersions]=useState([]),[summaries,setSummaries]=useState([]);
 const [versionsReady,setVersionsReady]=useState(false);
 const [versionName,setVersionName]=useState("");
 const [baselineId,setBaselineId]=useState(""),[candidateId,setCandidateId]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{
  try{
   const raw=window.localStorage.getItem(STRATEGY_VERSIONS_KEY);
   setVersions(raw?normalizeStrategyVersions(JSON.parse(raw)):[]);
  }catch{setVersions([]);setError("Invalid saved strategy versions; retained safe empty list.");}
  try{
   const raw=window.localStorage.getItem(RESEARCH_COMPARISONS_KEY);
   setSummaries(raw?normalizeComparisonSummaries(JSON.parse(raw)):[]);
  }catch{setSummaries([]);setError("Invalid local comparison archive; retained safe empty list.");}
  setVersionsReady(true);
 },[]);
 useEffect(()=>{if(!versionsReady)return;
  try{localStorage.setItem(STRATEGY_VERSIONS_KEY,JSON.stringify({version:1,records:versions}));}
  catch{setError("Strategy versions could not be stored on this device.");}
 },[versionsReady,versions]);
 useEffect(()=>{if(!versionsReady)return;
  try{localStorage.setItem(RESEARCH_COMPARISONS_KEY,JSON.stringify({version:1,records:summaries}));}
  catch{setError("Research summaries could not be stored on this device.");}
 },[versionsReady,summaries]);
 useEffect(()=>{setResult(null);setComparison(null);setError("");setNotice("");},
  [symbol,resolution,strategyId,edit?.rsiBull,edit?.rsiBear,edit?.requireMacd,edit?.requireVwap]);
 const relevant=versions.filter(x=>x.strategyId===strategyId);
 const comparable=relevant.filter(x=>x.edit.timeframe===resolution);
 function fail(e){setError(String(e?.message||"Research action failed").slice(0,220));setNotice("");}
 async function receive(event){
  const file=event.target.files?.[0];event.target.value="";
  setResult(null);setComparison(null);
  if(!file)return;
  if(file.size>900000){setError("Historical JSON exceeds 900 KB");setSource("");setFilename("");setCapturedAt(null);return;}
  try{
   const value=await file.text();
   setSource(value);setFilename(file.name.slice(0,100));
   setCapturedAt(Date.now());setError("");setNotice("");
  }catch{setError("Cannot read the selected local file");setSource("");setFilename("");setCapturedAt(null);}
 }
 function replay(){
  setResult(null);
  try{
   if(!source)throw Error("Choose a local historical OHLC JSON file first");
   const record=replayHistoricalJson(source,{symbol,resolution,strategyId,edit,now:capturedAt});
   setResult(record);setError("");setNotice("");
  }catch(e){fail(e);}
 }
 function saveVersion(){
  try{
   if(!versionsReady)throw Error("Local research storage is not ready");
   const next=saveStrategyVersion(versions,{strategyId,
    name:versionName||"Research "+(relevant.length+1),edit});
   const newest=next.at(-1);
   setVersions(next);setVersionName("");setError("");
   if(!baselineId)setBaselineId(newest.id);
   else if(!candidateId)setCandidateId(newest.id);
   setNotice("Saved immutable research configuration "+newest.id+" on this device.");
  }catch(e){fail(e);}
 }
 function deleteVersion(){
  const target=relevant.find(x=>x.id===candidateId||x.id===baselineId);
  if(!target)return;
  if(!window.confirm("Delete local research version "+target.name+"? Saved comparisons remain summaries only."))return;
  try{
   setVersions(removeStrategyVersion(versions,target.id));
   if(baselineId===target.id)setBaselineId("");
   if(candidateId===target.id)setCandidateId("");
   setComparison(null);setError("");setNotice("Local research version deleted.");
  }catch(e){fail(e);}
 }
 function runComparison(){
  setComparison(null);
  try{
   if(!source)throw Error("Upload local OHLC JSON before comparing versions");
   const baseline=comparable.find(x=>x.id===baselineId);
   const candidate=comparable.find(x=>x.id===candidateId);
   const record=compareSavedStrategyVersions(source,{symbol,resolution,
    baseline,candidate,now:capturedAt});
   setComparison(record);setError("");setNotice("");
  }catch(e){fail(e);}
 }
 function saveSummary(){
  try{
   if(!comparison)throw Error("Run the research comparison first");
   setSummaries(saveComparisonSummary(summaries,comparison));setError("");
   setNotice("Summary saved locally. Candle data and replay observations are not stored.");
  }catch(e){fail(e);}
 }
 function clear(){setSource("");setFilename("");setCapturedAt(null);
  setResult(null);setComparison(null);setError("");setNotice("");}
 return <section className={styles.replayLab} aria-label="Offline historical replay">
  <div className={styles.replayLabHeading}>
   <div><p className={styles.eyebrow}>MILESTONE 2E · DEVICE ONLY</p>
    <h3>Closed-candle historical replay</h3>
    <p>Load 2–400 genuine OHLC candles for {symbol} · {resolution}. Recompute each bar using only candles closed by that moment. No market connection or order execution.</p>
   </div><span>RESEARCH ONLY</span>
  </div>
  <div className={styles.replayLabControls}>
   <label>Local OHLC JSON <input aria-label="Historical replay OHLC JSON" type="file"
    accept=".json,application/json" onChange={receive}/></label>
   <button type="button" onClick={replay} disabled={!source}>Replay closed candles</button>
   <button type="button" onClick={clear} disabled={!source&&!result&&!comparison}>Clear file</button>
  </div>
  <p className={styles.muted}>{filename?"Loaded locally: "+filename:
   "No historical file loaded. This tool does not fetch prices."}</p>
  {error?<p className={styles.replayError} role="alert">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {result?<div role="status" className={styles.replayResults}>
   <strong>OFFLINE REPLAY · {result.totalBars} closed bars · {result.scored} scored</strong>
   <div className={styles.replayCounts}>
    {Object.entries(result.counts).map(([name,value])=>
     <div key={name}><b>{value}</b><span>{name==="notReady"?"Not ready":name}</span></div>)}
   </div>
   {result.excludedFormingBars?<p>{result.excludedFormingBars} unclosed imported candle(s) excluded from replay.</p>:null}
   <p>Continuity: {result.gaps.missing} unobserved intervals · {result.gaps.weekendUtcEstimate} estimated UTC-weekend intervals · {result.gaps.unclassified} unclassified. Calendar is heuristic, not an exchange schedule.</p>
   <p>{result.interpretation}</p>
   <div className={styles.replayHistory} role="group" aria-label="Latest historical replay observations">
    {result.observations.slice(-12).map(row=><div key={row.time}>
     <time>{new Date(row.time*1000).toISOString().slice(0,16).replace("T"," ")+" UTC"}</time>
     <span>{row.state}</span>
    </div>)}
   </div>
  </div>:null}
  <div className={styles.researchVersions} role="group" aria-label="Versioned strategy research">
   <h4>Saved strategy research versions</h4>
   <p>Save an immutable copy of the current {strategyId} research settings. Up to 12 versions per strategy. Saved on this browser only; the original XMI rules remain unscored.</p>
   <div className={styles.researchVersionControls}>
    <label>Version label<input aria-label="Strategy version label" maxLength={48}
     placeholder="e.g. RSI 60 / 40" value={versionName} onChange={e=>setVersionName(e.target.value)}/></label>
    <button type="button" disabled={!versionsReady||relevant.length>=12}
     onClick={saveVersion}>Save research version</button>
   </div>
   <p>{relevant.length}/12 saved versions for {strategyId} · {comparable.length} match {resolution}</p>
   <div className={styles.researchVersionControls}>
    <label>Baseline version<select aria-label="Baseline strategy version" value={baselineId}
     onChange={e=>{setBaselineId(e.target.value);setComparison(null);}}>
     <option value="">Select baseline</option>
     {comparable.map(row=><option key={row.id} value={row.id}>{row.id} · {row.name}</option>)}
    </select></label>
    <label>Candidate version<select aria-label="Candidate strategy version" value={candidateId}
     onChange={e=>{setCandidateId(e.target.value);setComparison(null);}}>
     <option value="">Select candidate</option>
     {comparable.map(row=><option key={row.id} value={row.id}>{row.id} · {row.name}</option>)}
    </select></label>
    <button type="button" disabled={!source||!baselineId||!candidateId}
     onClick={runComparison}>Compare saved versions</button>
    <button type="button" disabled={!baselineId&&!candidateId}
     onClick={deleteVersion}>Delete selected version</button>
   </div>
   {comparison?<div className={styles.replayResults} aria-label="Version comparison results" role="region">
    <strong>OFFLINE RESEARCH COMPARISON · {comparison.baselineId} vs {comparison.candidateId}</strong>
    <p>{comparison.totalBars} identical historical candles · {comparison.changedClassifications} changed classifications · {comparison.changedScored} changed where both were scored · {comparison.readyBoth} jointly scored.</p>
    <div className={styles.replayCounts}>
     {[["Baseline aligned",comparison.baselineCounts.aligned],
       ["Candidate aligned",comparison.candidateCounts.aligned],
       ["Baseline not ready",comparison.baselineCounts.notReady],
       ["Candidate not ready",comparison.candidateCounts.notReady]].map(([name,value])=>
        <div key={name}><b>{value}</b><span>{name}</span></div>)}
    </div>
    <p>Dataset label: {comparison.datasetLabel} (non-cryptographic, not provider authentication).</p>
    <p>{comparison.disclosure}</p>
    <button type="button" onClick={saveSummary}>Save comparison summary locally</button>
   </div>:null}
   {summaries.length?<details><summary>Saved comparison summaries ({summaries.length}/8)</summary>
    {summaries.slice().reverse().map((row,i)=><p key={i}>
     {row.baselineId} vs {row.candidateId} · {row.totalBars} bars · {row.changedClassifications} differences · {row.datasetLabel}
    </p>)}
   </details>:null}
  </div>
 </section>;
}

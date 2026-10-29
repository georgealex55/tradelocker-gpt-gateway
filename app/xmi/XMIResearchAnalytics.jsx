"use client";
import {useState} from "react";
import {pageResearchObservations} from "../../lib/xmiResearchAnalytics.mjs";
import styles from "./xmi.module.css";
const COLORS={aligned:"researchAligned",conflicted:"researchConflicted",
 mixed:"researchMixed",notReady:"researchNotReady"};
const date=t=>new Date(t*1000).toISOString().slice(0,16).replace("T"," ")+" UTC";
export default function XMIResearchAnalytics({analytics}){
 const [filter,setFilter]=useState("changed"),[page,setPage]=useState(0);
 const view=pageResearchObservations(analytics,{filter,page,pageSize:20});
 const share=value=>value+"%";
 const metricRows=[
  ["Observed candles",analytics.coverage.observedBars],
  ["Classification changes",analytics.agreement.changed],
  ["Jointly scored bars",analytics.agreement.jointlyScored],
  ["Unverified intervals",analytics.coverage.unverifiedIntervals]
 ];
 return <section className={styles.researchAnalytics} role="region"
  aria-label="Historical research analytics">
  <header>
   <h4>Historical research analytics · descriptive only</h4>
   <p>Versions {analytics.baselineId} and {analytics.candidateId} share the exact same
    closed historical candles. Classification changes are not trading wins or losses.</p>
  </header>
  <div className={styles.analyticsMetrics}>
   {metricRows.map(([name,value])=><div key={name}><strong>{value}</strong><span>{name}</span></div>)}
  </div>
  <div className={styles.analyticsDistribution} aria-label="Research classification distribution">
   <h5>Classification distribution</h5>
   {analytics.distribution.baseline.map((entry,i)=>{
    const candidate=analytics.distribution.candidate[i];
    return <div key={entry.category} className={styles.analyticsCategoryRow}>
     <span>{entry.category==="notReady"?"Not ready":entry.category}</span>
     <div>
      <div className={styles.analyticsTrack} aria-label={"Baseline "+entry.category+
       " "+entry.count+" of "+analytics.totalBars}>
       <div className={styles[COLORS[entry.category]]} style={{width:share(entry.shareOfObservedPercent)}}/>
      </div>
      <div className={styles.analyticsTrack} aria-label={"Candidate "+entry.category+
       " "+candidate.count+" of "+analytics.totalBars}>
       <div className={styles[COLORS[candidate.category]]} style={{width:share(candidate.shareOfObservedPercent)}}/>
      </div>
     </div>
     <small>{entry.count} / {candidate.count}</small>
    </div>;
   })}
   <p className={styles.muted}>Each pair of bars: baseline (top) and candidate (bottom).
    Counts are observation categories, not position returns.</p>
  </div>
  <div className={styles.analyticsCoverage} role="group" aria-label="Historical data coverage">
   <h5>Dataset coverage</h5>
   <p><strong>{analytics.coverage.observedWallClockPercent}%</strong> observed
    wall-clock slots ({analytics.coverage.observedBars} of {analytics.coverage.wallClockSlots}).
    This is not verified trading-session completeness.</p>
   <p>{analytics.coverage.gapSpans} gap spans · {analytics.coverage.missingIntervals} missing
    intervals · {analytics.coverage.utcWeekendCandidates} UTC-weekend candidates ·
    {" "+analytics.coverage.unverifiedIntervals} other unverified intervals.</p>
   <p>Exchange calendar and market-data origin: <strong>UNVERIFIED</strong>.
    Weekends, holidays, DST and venue hours may explain intervals.</p>
  </div>
  <div className={styles.analyticsChecks} role="group" aria-label="Research readiness checklist">
   <h5>Transparent data-readiness checklist</h5>
   {analytics.checklist.map(item=><div key={item.id}>
    <strong>{item.label}</strong>
    <span>{item.status}</span>
    <small>{item.detail}</small>
   </div>)}
  </div>
  <div className={styles.analyticsHistory}>
   <div className={styles.researchVersionControls}>
    <label>Observation view
     <select aria-label="Research observation filter" value={filter}
      onChange={e=>{setFilter(e.target.value);setPage(0);}}>
      <option value="changed">Different classifications</option>
      <option value="all">All observed bars</option>
      <option value="jointlyScored">Both versions scored</option>
      <option value="notReady">At least one unscored</option>
     </select>
    </label>
    <span role="status">{view.total} observations · Page {view.page+1} of {view.pages}</span>
    <button type="button" disabled={view.page===0}
     onClick={()=>setPage(n=>Math.max(0,n-1))}>Previous observations</button>
    <button type="button" disabled={view.page>=view.pages-1}
     onClick={()=>setPage(n=>Math.min(view.pages-1,n+1))}>Next observations</button>
   </div>
   <div className={styles.analyticsTableWrap}>
    <table className={styles.analyticsTable}>
     <thead><tr><th scope="col">Historical close</th><th scope="col">Baseline</th>
      <th scope="col">Candidate</th><th scope="col">Difference</th></tr></thead>
     <tbody>
      {view.rows.map(row=><tr key={row.time}>
       <td>{date(row.time)}</td>
       <td>{row.baseline}</td><td>{row.candidate}</td>
       <td>{row.changed?"Changed":"Same"}</td>
      </tr>)}
      {!view.rows.length?<tr><td colSpan={4}>No observations match this filter.</td></tr>:null}
     </tbody>
    </table>
   </div>
  </div>
  <p className={styles.muted}>{analytics.disclaimer}</p>
 </section>;
}

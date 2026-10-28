"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import {TOOL_CATALOG,PANEL_NAMES,CHART_TYPES} from "../../lib/xmiChartTools.mjs";
import {STRUCTURE_CONCEPTS,STRUCTURE_TIMEFRAMES,setStructureOption,defaultStructureSettings} from "../../lib/xmiStructure.mjs";
const TECH=["EMA","VWAP","RSI","MACD","Volume"];
const ICONS={"Indicators":"∑","Annotations":"✎","Patterns":"◇","Fibonacci":"φ","Lines":"／","Measurements":"↔","Chart Settings":"⚙"};
const SETTINGS=[
 ["theme","Theme","select",["dark","light"]],["bull","Up color","color"],["bear","Down color","color"],
 ["grid","Grid lines","check"],["crosshair","Crosshair","check"],
 ["timezone","Display timezone","select",["UTC","America/New_York","Europe/London","Asia/Tokyo"]],
 ["scale","Price scale","select",["normal","log"]],
 ["precision","Price precision","select",[2,3,4,5,6]],
 ["wicks","Candle wicks","check"],["borders","Candle borders","check"],
 ["priceLine","Last-price line","check"],["bidAsk","Bid / ask labels (only when supplied)","check"],
 ["syncTimeframes","Sync timeframes across charts","check"],
 ["indicatorDefaults","Show indicators by default","check"]
];
export default function XMIToolbox({
 activePanel,setActivePanel,orientation,setOrientation,docked,setDocked,pinned,setPinned,
 tech,setTech,structure,setStructure,drawTool,setDrawTool,
 autoPatterns,setAutoPatterns,autoFib,setAutoFib,
 globalSettings,setGlobalSettings,chartOverride,setChartOverride,slot,
 onUndo,onClear,onExport,onImport,onFullscreen,onMaximize,maximized,
 onFocusMode,focusMode,drawingsCount
}){
 const [search,setSearch]=useState("");
 const [groups,setGroups]=useState({technical:true,market:true});
 const [scope,setScope]=useState("global");
 const [settingsExpanded,setSettingsExpanded]=useState(true);
 const ref=useRef(null),upload=useRef(null);
 const settings=scope==="chart"?{...globalSettings,...(chartOverride[slot]||{})}:globalSettings;
 const updateSetting=(key,value)=>{
  if(scope==="global")setGlobalSettings(old=>({...old,[key]:value}));
  else setChartOverride(old=>({...old,[slot]:{...old[slot],[key]:value}}));
 };
 useEffect(()=>{
  if(!activePanel||docked||pinned)return;
  const escape=e=>{if(e.key==="Escape")setActivePanel(null);};
  const outside=e=>{if(ref.current&&!ref.current.contains(e.target))setActivePanel(null);};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[activePanel,docked,pinned,setActivePanel]);
 const open=(panel)=>{setSearch("");setActivePanel(x=>x===panel?null:panel);};
 const chooseTool=tool=>{
  setDrawTool(old=>old===tool?null:tool);
  if(!pinned&&!docked)setActivePanel(null);
 };
 const group=(key,label,children)=><section className={styles.toolboxGroup}>
   <button type="button" className={styles.toolboxGroupHead} onClick={()=>setGroups(old=>({...old,[key]:!old[key]}))}
    aria-expanded={groups[key]!==false}>{label}<span>{groups[key]===false?"＋":"−"}</span></button>
   {groups[key]!==false?children:null}
  </section>;
 const active=activePanel;
 return <div ref={ref} className={styles.toolShell+" "+(orientation==="vertical"?styles.toolVertical:styles.toolHorizontal)}>
  <div className={styles.toolButtons} role="toolbar" aria-label="Chart tools">
   {PANEL_NAMES.map(panel=><button type="button" key={panel} title={panel}
    className={active===panel?styles.toolSelected:""} aria-pressed={active===panel}
    onClick={()=>open(panel)}><span aria-hidden="true">{ICONS[panel]}</span><small>{panel}</small></button>)}
   <button type="button" title="Switch toolbar position" onClick={()=>setOrientation(v=>v==="vertical"?"horizontal":"vertical")}>
    <span aria-hidden="true">⇄</span><small>Position</small>
   </button>
   <button type="button" title="Focus Mode" aria-pressed={focusMode} onClick={onFocusMode}>
    <span aria-hidden="true">◎</span><small>{focusMode?"Restore":"Focus"}</small>
   </button>
   <button type="button" title="Maximize chart in XMI" aria-pressed={maximized} onClick={onMaximize}>
    <span aria-hidden="true">▣</span><small>{maximized?"Restore":"Maximize"}</small>
   </button>
   <button type="button" title="Browser fullscreen" onClick={onFullscreen}>
    <span aria-hidden="true">⛶</span><small>Fullscreen</small>
   </button>
  </div>
  {active?<div className={styles.toolboxPopup+" "+(docked?styles.toolboxDocked:styles.toolboxFloating)}
    role="dialog" aria-label={active+" tools"}>
   <div className={styles.toolboxHeading}>
    <strong>{active}</strong>
    <div>
     <button type="button" onClick={()=>setDocked(x=>!x)} aria-pressed={docked}
      title="Dock or pop out this menu">{docked?"Pop out":"Dock"}</button>
     <button type="button" onClick={()=>setPinned(x=>!x)} aria-pressed={pinned}
      title="Keep this menu open">{pinned?"Unpin":"Pin"}</button>
     <button type="button" onClick={()=>setActivePanel(null)} aria-label="Close panel">×</button>
    </div>
   </div>
   <div className={styles.toolboxScroll}>
    {active==="Indicators"?<>
     <input className={styles.toolboxSearch} placeholder="Search technical or market structure…"
      aria-label="Search indicators" value={search} onChange={e=>setSearch(e.target.value)} />
     {group("technical","Technical indicators",<div className={styles.toolboxRows}>
      {TECH.filter(x=>x.toLowerCase().includes(search.toLowerCase())).map(id=><label key={id}>
       <input type="checkbox" checked={tech[id]} onChange={e=>setTech(prev=>({...prev,[id]:e.target.checked}))}/>
       <span>{id==="EMA"?"EMA 20 / 50 / 200":id==="VWAP"?"VWAP (FX tick-volume proxy)":id}</span></label>)}
     </div>)}
     {group("market","Market structure · close-confirmed",<div className={styles.toolboxRows}>
      <div className={styles.toolboxInline}>
       <button type="button" onClick={()=>setStructure(defaultStructureSettings())}>Show all</button>
       <button type="button" onClick={()=>setStructure(prev=>Object.fromEntries(Object.entries(prev)
        .map(([k,v])=>[k,{...v,enabled:false}]))) }>Hide all</button>
      </div>
      {STRUCTURE_CONCEPTS.filter(x=>(x.label+" "+x.description).toLowerCase().includes(search.toLowerCase()))
       .map(item=><div key={item.id} className={styles.toolboxIndicatorRow}>
        <label title={item.description}>
         <input type="checkbox" checked={structure[item.id].enabled}
          onChange={e=>setStructure(prev=>setStructureOption(prev,item.id,{enabled:e.target.checked}))}/>
         <span>{item.label}</span></label>
        <select aria-label={item.label+" timeframe"} value={structure[item.id].resolution}
         onChange={e=>setStructure(prev=>setStructureOption(prev,item.id,{resolution:e.target.value}))}>
         {STRUCTURE_TIMEFRAMES.map(tf=><option key={tf}>{tf}</option>)}
        </select>
       </div>)}
      <p className={styles.toolboxNote}>Each concept has a separate timeframe. Max five annotations per concept; chart overlays do not activate strategies.</p>
     </div>)}
    </>:null}
    {Object.prototype.hasOwnProperty.call(TOOL_CATALOG,active)?<>
     <p className={styles.toolboxNote}>{active==="Patterns"?"Completed patterns are heuristics. They do not confirm trading signals.":
      active==="Fibonacci"?"Anchors snap to the last confirmed opposing swing pivots.":
      active==="Measurements"?"Measurements and risk/reward are hypothetical, never broker orders.":
      "Select a tool, then click its points on the chart. Esc cancels."}</p>
     {active==="Patterns"?<label className={styles.toolboxToggle}><input type="checkbox"
      checked={autoPatterns} onChange={e=>setAutoPatterns(e.target.checked)}/> Detect completed patterns automatically</label>:null}
     {active==="Fibonacci"?<label className={styles.toolboxToggle}><input type="checkbox"
      checked={autoFib} onChange={e=>setAutoFib(e.target.checked)}/> Show selected automatic Fibonacci levels</label>:null}
     <div className={styles.toolboxRows}>
      {TOOL_CATALOG[active].map(tool=><button type="button" key={tool} onClick={()=>chooseTool(tool)}
       className={drawTool===tool?styles.toolSelected:""} aria-pressed={drawTool===tool}>
       {tool}{drawTool===tool?" ✓":""}</button>)}
     </div>
     <div className={styles.toolboxInline}>
      <button type="button" onClick={()=>setDrawTool(null)}>Exit drawing</button>
      <button type="button" onClick={onUndo}>Undo last</button>
      <button type="button" onClick={onClear}>Clear symbol</button>
     </div>
     <p className={styles.toolboxNote}>{drawingsCount} saved drawing(s). Drawings are shared across timeframes for the same symbol.</p>
     <div className={styles.toolboxInline}>
      <button type="button" onClick={onExport}>Export JSON</button>
      <button type="button" onClick={()=>upload.current?.click()}>Import JSON</button>
     </div>
     <input hidden ref={upload} type="file" accept=".json,application/json"
      onChange={e=>{const file=e.target.files?.[0];if(file)onImport(file);e.target.value="";}}/>
    </>:null}
    {active==="Chart Settings"?<>
     <p className={styles.toolboxNote}>Shared platform defaults. Override an individual chart when needed.</p>
     <div className={styles.toolboxInline}>
      <button type="button" aria-pressed={scope==="global"} onClick={()=>setScope("global")}>All charts</button>
      <button type="button" aria-pressed={scope==="chart"} onClick={()=>setScope("chart")}>Focused chart</button>
     </div>
     <label className={styles.toolboxSetting}>Chart type<select value={settings.chartType}
      onChange={e=>updateSetting("chartType",e.target.value)}>
      {CHART_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
     <section className={styles.toolboxGroup}>
      <button type="button" className={styles.toolboxGroupHead} aria-expanded={settingsExpanded}
       onClick={()=>setSettingsExpanded(x=>!x)}>Appearance, scales & data <span>{settingsExpanded?"−":"＋"}</span></button>
      {settingsExpanded?SETTINGS.map(([key,label,kind,options])=><label className={styles.toolboxSetting} key={key}>
       <span>{label}</span>
       {kind==="check"?<input type="checkbox" checked={settings[key]}
        onChange={e=>updateSetting(key,e.target.checked)}/>:
        kind==="color"?<input type="color" value={settings[key]}
        onChange={e=>updateSetting(key,e.target.value)}/>:
        <select value={settings[key]} onChange={e=>updateSetting(key,key==="precision"?Number(e.target.value):e.target.value)}>
         {options.map(x=><option key={x} value={x}>{x}</option>)}</select>}
      </label>):null}
     </section>
     <p className={styles.toolboxNote}>Bid/ask values require a verified quote feed; this chart never invents one. Heikin Ashi prices are transformed, not executable broker prices. Timezone changes presentation only; structure session rules retain UTC.</p>
     {scope==="chart"?<button type="button" onClick={()=>setChartOverride(prev=>{
      const next={...prev};delete next[slot];return next;
     })}>Reset focused chart overrides</button>:null}
    </>:null}
   </div>
  </div>:null}
 </div>;
}

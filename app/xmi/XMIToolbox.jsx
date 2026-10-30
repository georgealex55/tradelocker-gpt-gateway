"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import {STRATEGIES} from "../../lib/xmiStrategyPresets.mjs";
import {TOOL_CATALOG,PANEL_NAMES,CHART_TYPES,DEFAULT_TECH} from "../../lib/xmiChartTools.mjs";
import {ADVANCED_INDICATORS} from "../../lib/xmiAdvancedIndicators.mjs";
import {INDICATOR_PARAMETERS,DEFAULT_INDICATOR_SETTINGS,normalizeIndicatorSettings} from "../../lib/xmiIndicatorSettings.mjs";
import {STRUCTURE_CONCEPTS,STRUCTURE_TIMEFRAMES,setStructureOption,defaultStructureSettings} from "../../lib/xmiStructure.mjs";
const TECH=["EMA","VWAP","RSI","MACD","Volume",...ADVANCED_INDICATORS.map(x=>x.id)];
const DEFAULT_INDICATORS=DEFAULT_TECH;
const INDICATOR_SECTIONS=Object.freeze([
 {name:"Trend",ids:["EMA","VWAP"]},
 {name:"Momentum",ids:["RSI","MACD","Stochastic"]},
 {name:"Trend strength",ids:["ADX"]},
 {name:"Volatility",ids:["ATR","Bollinger"]},
 {name:"Breakouts",ids:["Donchian"]},
 {name:"Activity",ids:["Volume"]}
]);
const MARKER_FIELDS=Object.freeze([
 ["markerStructure","Market-structure events"],["markerADX","ADX strength markers"],
 ["markerBollinger","Bollinger markers"],["markerDonchian","Donchian markers"],
 ["markerStochastic","Stochastic markers"]
]);
const ICONS={"Strategy":"▦","Indicators":"∑","Annotations":"✎","Patterns":"◇","Fibonacci":"φ","Lines":"／","Measurements":"↔","Chart Settings":"⚙"};
const SETTINGS=[
 ["theme","Theme","select",["dark","light"]],["bull","Up color","color"],["bear","Down color","color"],
 ["grid","Grid lines","check"],["crosshair","Crosshair","check"],
 ["timezone","Display timezone","select",["UTC","America/New_York","Europe/London","Asia/Tokyo"]],
 ["scale","Price scale","select",["normal","log"]],
 ["precision","Price precision","select",[2,3,4,5,6]],
 ["wicks","Candle wicks","check"],["borders","Candle borders","check"],
 ["priceLine","Last-price line","check"],["bidAsk","Bid / ask labels (only when supplied)","check"],
 ["syncTimeframes","Sync timeframes across charts","check"],
 ["indicatorDefaults","Show indicators by default","check"],
 ["candleTimer","Candle-close countdown (local clock)","check"],
 ["markerStyle","Chart marker detail","select",["compact","full","off"]],
 ["markerPalette","Chart marker palette","select",["vivid","contrast"]],
 ["refreshProfile","Read-only candle polling","select",["balanced","responsive"]],
 ["kineticScroll","Smooth inertial panning","check"],
 ["algorithmMode","Algorithmic overlay","select",["off","regression","atrBands","both"]],
 ["algorithmWindow","Regression lookback bars","select",[20,50,100]],
 ["algorithmMultiplier","Algorithm channel multiplier","select",[1,1.5,2,3]],
 ...MARKER_FIELDS.map(([key,label])=>[key,label,"check"])
];
export default function XMIToolbox({
 activePanel,setActivePanel,orientation,setOrientation,docked,setDocked,pinned,setPinned,
 tech,setTech,indicatorSettings=DEFAULT_INDICATOR_SETTINGS,setIndicatorSettings,structure,setStructure,drawTool,setDrawTool,strategyId,onStrategyChange,
 autoPatterns,setAutoPatterns,patternEnabled,setPatternEnabled,autoFib,setAutoFib,
 globalSettings,setGlobalSettings,chartOverride,setChartOverride,slot,
 onUndo,onClear,onExport,onImport,onFullscreen,onMaximize,maximized,
 onFocusMode,focusMode,drawingsCount
}){
 const [search,setSearch]=useState("");
 const [groups,setGroups]=useState({technical:true,market:true,markers:true,patterns:true});
 const [scope,setScope]=useState("global");
 const [settingsExpanded,setSettingsExpanded]=useState(true);
 const ref=useRef(null),upload=useRef(null);
 const settings=scope==="chart"?{...globalSettings,...(chartOverride[slot]||{})}:globalSettings;
 const updateSetting=(key,value)=>{
  if(key==="indicatorDefaults"&&scope==="global")setTech(Object.fromEntries(
   Object.keys(DEFAULT_INDICATORS).map(id=>[id,value])
  ));
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
  if(TOOL_CATALOG.Fibonacci.includes(tool))setAutoFib(true);
  setDrawTool(old=>old===tool?null:tool);
  if(!pinned&&!docked)setActivePanel(null);
 };
 const group=(key,label,children)=><section className={styles.toolboxGroup}>
   <button type="button" className={styles.toolboxGroupHead} onClick={()=>setGroups(old=>({...old,[key]:!old[key]}))}
    aria-expanded={groups[key]!==false}>{label}<span>{groups[key]===false?"＋":"−"}</span></button>
   {groups[key]!==false?children:null}
  </section>;
 const toggleIndicatorSection=(ids,checked)=>setTech(prev=>({...prev,...Object.fromEntries(ids.map(id=>[id,checked]))}));
 const indicatorSections=INDICATOR_SECTIONS.map(section=>{
  const shown=section.ids.filter(id=>(id+" "+
   (ADVANCED_INDICATORS.find(x=>x.id===id)?.label||"")).toLowerCase().includes(search.toLowerCase()));
  if(!shown.length)return null;
  return <section key={section.name} className={styles.toolboxSubsection}>
   <div className={styles.toolboxSectionActions}><strong>{section.name}</strong>
    <button type="button" onClick={()=>toggleIndicatorSection(section.ids,true)}
     aria-label={"Apply all "+section.name+" indicators"}>Apply all</button>
    <button type="button" onClick={()=>toggleIndicatorSection(section.ids,false)}
     aria-label={"Hide all "+section.name+" indicators"}>Hide all</button></div>
   {shown.map(id=><div key={id} className={styles.toolboxStudySettings}>
    <label><input type="checkbox" checked={!!tech[id]}
     onChange={e=>setTech(old=>({...old,[id]:e.target.checked}))}/>
     <span>{id==="EMA"?"EMA":id==="VWAP"?"VWAP tick-volume proxy":
      ADVANCED_INDICATORS.find(x=>x.id===id)?.label||id}</span></label>
    <div className={styles.toolboxParamGrid}>
     {INDICATOR_PARAMETERS.filter(p=>p.section===id).map(p=><label key={p.key}>
      <span>{p.label}</span>
      {p.choices?<select aria-label={p.label} value={indicatorSettings[p.key]}
       onChange={e=>setIndicatorSettings(old=>normalizeIndicatorSettings({...old,[p.key]:e.target.value}))}>
       {p.choices.map(v=><option key={v} value={v}>{v}</option>)}</select>:
       <input aria-label={p.label} type="number" min={p.min} max={p.max} step={p.step}
        value={indicatorSettings[p.key]}
        onChange={e=>setIndicatorSettings(old=>normalizeIndicatorSettings({...old,[p.key]:Number(e.target.value)}))}/>}
     </label>)}
    </div>
   </div>)}
  </section>;
 });
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
    {active==="Strategy"?<section className={styles.toolboxGroup}>
      <strong>Choose an educational strategy preset</strong>
      <p className={styles.toolboxNote}>Switching presets applies matching indicators and a suggested timeframe to the focused chart; it cannot place trades.</p>
      <div className={styles.toolboxRows}>
       {STRATEGIES.map(preset=><button key={preset.id} type="button"
        aria-pressed={strategyId===preset.id} onClick={()=>onStrategyChange?.(preset.id)}>
        {preset.name} · {preset.timeframe}{preset.unscored?" · not validated":""}</button>)}
      </div>
      <p className={styles.toolboxNote}>The live Intelligence panel contains the collapsible 9-cell research engine, plus snapshot controls. Scores use the last verified closed bar only.</p>
     </section>:null}
    {active==="Indicators"?<>
     <input className={styles.toolboxSearch} placeholder="Search indicators, patterns or market structure…"
      aria-label="Search indicators" value={search} onChange={e=>setSearch(e.target.value)} />
     {group("technical","Technical indicators",<div className={styles.toolboxRows}>
      <div className={styles.toolboxInline}>
       <button type="button" onClick={()=>toggleIndicatorSection(TECH,true)}>Apply all technical</button>
       <button type="button" onClick={()=>toggleIndicatorSection(TECH,false)}>Hide all technical</button>
      </div>
      {indicatorSections}
      <button type="button" onClick={()=>setIndicatorSettings({...DEFAULT_INDICATOR_SETTINGS})}>Reset indicator periods</button>
     </div>)}
     {group("markers","Marker overlays",<div className={styles.toolboxRows}>
      <div className={styles.toolboxInline}>
       <button type="button" onClick={()=>setGlobalSettings(old=>({...old,
        markerStyle:"compact",...Object.fromEntries(MARKER_FIELDS.map(([key])=>[key,true]))}))}>Apply all markers</button>
       <button type="button" onClick={()=>setGlobalSettings(old=>({...old,
        ...Object.fromEntries(MARKER_FIELDS.map(([key])=>[key,false]))}))}>Hide all markers</button>
      </div>
      {MARKER_FIELDS.map(([key,label])=><label key={key}><input type="checkbox"
       checked={globalSettings[key]} onChange={e=>setGlobalSettings(old=>({...old,[key]:e.target.checked}))}/>
       {label}</label>)}
     </div>)}
     <p className={styles.toolboxNote}>Study parameters use verified candle history. Marker stacks show multiple closed-candle observations; click a dot to reveal its label. No study guarantees profitable trades.</p>
     {group("patterns","Automatic chart patterns · per-type toggles",<div className={styles.toolboxRows}>
      <div className={styles.toolboxInline}>
       <button type="button" onClick={()=>{setAutoPatterns(true);setPatternEnabled(
        Object.fromEntries(TOOL_CATALOG.Patterns.map(id=>[id,true])));}}>Apply all patterns</button>
       <button type="button" onClick={()=>{setAutoPatterns(false);setPatternEnabled(
        Object.fromEntries(TOOL_CATALOG.Patterns.map(id=>[id,false])));}}>Hide all patterns</button>
      </div>
      <label><input type="checkbox" checked={autoPatterns} onChange={e=>setAutoPatterns(e.target.checked)}/> Enable automatic detection</label>
      {TOOL_CATALOG.Patterns.filter(x=>x.toLowerCase().includes(search.toLowerCase())).map(name=><div key={name} className={styles.toolboxIndicatorRow}>
        <label><input type="checkbox" checked={patternEnabled[name]!==false}
         onChange={e=>setPatternEnabled(old=>({...old,[name]:e.target.checked}))}/>{name}</label>
        <button type="button" onClick={()=>chooseTool(name)} title={"Draw "+name}>Draw</button>
       </div>)}
      <p className={styles.toolboxNote}>Individual patterns use closed, confirmed pivots and are not validated entries. Draw uses the selected manual tool.</p>
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
      <button type="button" onClick={()=>setDrawTool("Move saved drawings")}
       aria-pressed={drawTool==="Move saved drawings"}>Drag saved handles</button>
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
        <select value={settings[key]} onChange={e=>updateSetting(key,["precision","algorithmWindow","algorithmMultiplier"].includes(key)?Number(e.target.value):e.target.value)}>
         {options.map(x=><option key={x} value={x}>{x}</option>)}</select>}
      </label>):null}
     </section>
     <p className={styles.toolboxNote}>Responsive polling only shortens requests to the existing authorized OHLC endpoint. No tick-streaming, future-bar signals or price interpolation.</p>
     <p className={styles.toolboxNote}>Bid/ask values require a verified quote feed; this chart never invents one. Heikin Ashi prices are transformed, not executable broker prices. Timezone changes presentation only; structure session rules retain UTC.</p>
     {scope==="chart"?<button type="button" onClick={()=>setChartOverride(prev=>{
      const next={...prev};delete next[slot];return next;
     })}>Reset focused chart overrides</button>:null}
    </>:null}
   </div>
  </div>:null}
 </div>;
}

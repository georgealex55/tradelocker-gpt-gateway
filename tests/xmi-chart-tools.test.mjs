import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {TOOL_CATALOG,PANEL_NAMES,CHART_TYPES,DEFAULT_TECH,DEFAULT_CHART_SETTINGS,
 validateChartSettings,validateChartOverrides,resolveChartSettings,heikinAshi,
 chartSeriesData,requiredClicks,drawingPoint,validateDrawings,drawingsForSymbol,
 serializeWorkspace,deserializeWorkspace,detectedPivots,autoFibonacci,detectClassicPatterns,samePatternEvents}
 from "../lib/xmiChartTools.mjs";
import {XMIDrawingPrimitive,drawingTooltip} from "../lib/xmiDrawingPrimitive.mjs";
const t=Date.parse("2026-10-28T12:00:00Z")/1000;
function bar(i,high=101,low=99){return {time:t+i*60,open:100,high,low,close:100,closed:true};}
test("Seven chart tool groups contain every selected drawing, pattern, Fibonacci and measurement family",()=>{
 assert.deepEqual(PANEL_NAMES,["Indicators","Annotations","Patterns","Fibonacci","Lines","Measurements","Chart Settings"]);
 assert.equal(TOOL_CATALOG.Annotations.length,4);
 assert.equal(TOOL_CATALOG.Patterns.length,7);
 assert.equal(TOOL_CATALOG.Fibonacci.length,3);
 assert.equal(TOOL_CATALOG.Lines.length,5);
 assert.equal(TOOL_CATALOG.Measurements.length,4);
 assert.deepEqual(CHART_TYPES,["Candlesticks","Hollow Candles","Heikin Ashi","OHLC Bars","Line","Area"]);
 assert.equal(Object.keys(DEFAULT_TECH).length,5);
});
test("Global defaults and per-chart overrides are validated rather than using arbitrary options",()=>{
 const base=validateChartSettings(DEFAULT_CHART_SETTINGS);
 assert.equal(base.theme,"dark");
 assert.equal(resolveChartSettings(base,{1:{theme:"light"}} ,1).theme,"light");
 assert.equal(resolveChartSettings(base,{1:{theme:"light"}} ,0).theme,"dark");
 assert.deepEqual(validateChartOverrides({0:{grid:false},3:{chartType:"Area"}}),
  {0:{grid:false},3:{chartType:"Area"}});
 for(const config of [{chartType:"Renko"},{timezone:"Invalid/Zone"},
  {precision:0},{bull:"javascript:alert(1)"},{grid:1}])
  assert.throws(()=>validateChartSettings(config));
 assert.throws(()=>validateChartOverrides({4:{theme:"dark"}}));
});
test("Heikin Ashi remains explicitly transformed and OHLC, line and area render actual source",()=>{
 const data=[{time:t,open:10,high:14,low:8,close:12},
 {time:t+60,open:12,high:17,low:9,close:16}];
 const ha=heikinAshi(data);
 assert.equal(ha[0].open,11);
 assert.equal(ha[0].close,11);
 assert.equal(ha[1].open,11);
 assert.equal(ha[1].close,13.5);
 assert.equal(ha[1].high,17);
 assert.equal(chartSeriesData(data,"Line")[1].value,16);
 assert.equal(chartSeriesData(data,"Area")[0].value,12);
 assert.deepEqual(chartSeriesData(data,"OHLC Bars")[0],data[0]);
 assert.throws(()=>chartSeriesData(data,"Renko"));
});
test("Drawing tools require finite timestamp/price and bounded user-created geometry",()=>{
 assert.equal(requiredClicks("Text labels"),1);
 assert.equal(requiredClicks("Parallel Channel"),3);
 assert.equal(requiredClicks("Head & Shoulders / Inverse"),5);
 assert.equal(requiredClicks("Double Top / Bottom"),3);
 assert.equal(requiredClicks("Freehand drawing"),0);
 assert.throws(()=>drawingPoint(42,-1));
 const d={id:"test-1",symbol:"EURUSD",tool:"Trendline",points:[
   drawingPoint(t,1.086),drawingPoint(t+60,1.089)
  ],text:""};
 assert.equal(validateDrawings([d]).length,1);
 assert.equal(drawingsForSymbol([d],"GBPUSD").length,0);
 assert.match(drawingTooltip(d),/approx. pips/);
 assert.throws(()=>validateDrawings([{...d,tool:"Order execution"}]));
 assert.throws(()=>validateDrawings(Array(151).fill(d)),/Too many/);
});
test("JSON drawing workspace round-trip persists chart overrides but never passwords or order keys",()=>{
 const d={id:"note-1",symbol:"EURUSD",tool:"Text labels",points:[drawingPoint(t,1.08)],text:"London open"};
 const payload=serializeWorkspace([d],DEFAULT_CHART_SETTINGS,DEFAULT_TECH,{2:{chartType:"Line"}});
 const restored=deserializeWorkspace(payload);
 assert.equal(restored.drawings[0].text,"London open");
 assert.equal(restored.overrides["2"].chartType,"Line");
 assert.equal(restored.technical.EMA,true);
 assert.doesNotMatch(payload,/TradeLocker|password|api_key|placeOrder/i);
 assert.throws(()=>deserializeWorkspace(JSON.stringify({version:999,drawings:[]})));
 assert.throws(()=>deserializeWorkspace(JSON.stringify({version:1,drawings:[{...d,text:"x".repeat(101)}],settings:DEFAULT_CHART_SETTINGS})));
});
test("Confirmed swing anchors do not use the forming candle or future bar",()=>{
 const bars=Array.from({length:18},(_,i)=>bar(i));
 bars[3]=bar(3,106,99);
 bars[8]=bar(8,101,94);
 bars[13]=bar(13,107,99);
 const pts=detectedPivots(bars);
 assert.ok(pts.some(x=>x.type==="H"&&x.price===106&&x.confirmedAt===t+6*60));
 assert.ok(pts.some(x=>x.type==="L"&&x.price===94));
 const fib=autoFibonacci(bars,"Fib Retracement");
 assert.ok(fib);
 assert.equal(fib.points.length,2);
 assert.equal(autoFibonacci(bars,"Unconfigured"),null);
 const pending=[...bars,{...bar(18,300,1),closed:false}];
 assert.equal(detectedPivots(pending).length,pts.length);
});
test("Auto pattern detector finds confirmed double top and excludes unclosed swing",()=>{
 const bars=Array.from({length:16},(_,i)=>bar(i));
 bars[3]=bar(3,106,99);
 bars[6]=bar(6,101,95);
 bars[9]=bar(9,106.2,99);
 const patterns=detectClassicPatterns(bars);
 assert.ok(patterns.some(x=>x.concept==="Double Top / Bottom"));
 const confirmed=patterns.find(x=>x.concept==="Double Top / Bottom");
 assert.equal(confirmed.points.length,3);
 assert.ok(confirmed.confirmedAt<=bars.at(-1).time+60);
 const early=detectClassicPatterns(bars.slice(0,10));
 assert.ok(!early.some(x=>x.concept==="Double Top / Bottom"));
});
test("Optional drawing primitive fails safely if chart is resizing/unavailable",()=>{
 const overlay=new XMIDrawingPrimitive();
 const view=overlay.paneViews()[0];
 assert.equal(view.zOrder(),"top");
 assert.equal(typeof view.renderer().draw,"function");
 overlay.attached({chart:{timeScale(){throw Error("resizing")}},series:{},requestUpdate:()=>{}});
 overlay.setDrawings([{tool:"Trendline",points:[{time:t,price:1.1},{time:t+60,price:1.2}]}]);
 assert.doesNotThrow(()=>view.renderer().draw({}));
});
test("Unified toolbar removed duplicate indicators from price chart and SMC sidebar",()=>{
 const chart=readFileSync(new URL("../app/xmi/XMILiveChart.jsx",import.meta.url),"utf8");
 const desk=readFileSync(new URL("../app/xmi/XMIEngineDesk.jsx",import.meta.url),"utf8");
 const shell=readFileSync(new URL("../app/xmi/XMIToolbox.jsx",import.meta.url),"utf8");
 assert.ok(!chart.includes('className={styles.indicatorControls}'));
 assert.ok(!desk.includes('aria-label="Smart money concept visibility"'));
 assert.match(shell,/Search technical or market structure/);
 assert.match(shell,/Pop out/);
 assert.match(shell,/Focus Mode/);
 assert.match(desk,/requestFullscreen/);
});

test("Unchanged pattern feedback never causes a new parent state update",()=>{
 const first=[{id:"double-top:300",confirmedAt:300,points:[]}];
 assert.equal(samePatternEvents(undefined,[]),false);
 assert.equal(samePatternEvents([],[]),true);
 assert.equal(samePatternEvents(first,[{id:"double-top:300",confirmedAt:300,points:[]}]),true);
 assert.equal(samePatternEvents(first,[{id:"double-top:300",confirmedAt:301,points:[]}]),false);
 const update=(old,events)=>samePatternEvents(old["1|FX:EURUSD|5m"],events)?
  old:{...old,["1|FX:EURUSD|5m"]:events};
 const firstState=update({},[]);
 assert.equal(update(firstState,[]),firstState,"Repeated empty initial responses must preserve identity");
 const next=update(firstState,first);
 assert.equal(update(next,[{...first[0]}]),next,"Repeated detections must preserve state identity");
});
test("Chart Studio memoizes array-valued child props across unrelated intelligence renders",()=>{
 const desk=readFileSync(new URL("../app/xmi/XMIEngineDesk.jsx",import.meta.url),"utf8");
 const chart=readFileSync(new URL("../app/xmi/XMILiveChart.jsx",import.meta.url),"utf8");
 assert.match(desk,/chartDrawingMap=useMemo\(/);
 assert.match(desk,/chartSettingsBySlot=useMemo\(/);
 assert.match(desk,/savedDrawings=\{chartDrawingMap\[item.symbol\]\}/);
 assert.match(desk,/chartSettings=\{chartSettingsBySlot\[index\]\}/);
 assert.doesNotMatch(desk,/savedDrawings=\{drawingsForSymbol\(/);
 assert.match(desk,/samePatternEvents\(old\[id\],result\)\?old/);
 assert.match(chart,/if\(!feed.stats\)\{primitive.setDrawings\(\[\]\);if\(selected\)onPatternsRef.current\?\.\(\[\]\);return;\}/);
});

test("Price-widget failure is contained within the chart tile, not the XMI page",()=>{
 const desk=readFileSync(new URL("../app/xmi/XMIEngineDesk.jsx",import.meta.url),"utf8");
 const boundary=readFileSync(new URL("../app/xmi/XMIChartErrorBoundary.jsx",import.meta.url),"utf8");
 assert.match(desk,/import XMIChartErrorBoundary from/);
 assert.match(desk,/<XMIChartErrorBoundary key=\{key\+"\|"\+resolutions\[index\]\}>/);
 assert.match(desk,/<\/XMIChartErrorBoundary>/);
 assert.match(boundary,/getDerivedStateFromError/);
 assert.match(boundary,/Retry chart/);
});

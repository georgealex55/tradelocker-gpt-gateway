/* XMI private Studio. No broker calls, orders, or private data uploads. */
(()=>{"use strict";
 const core=window.XMIChartCore,lib=window.LightweightCharts,draw=window.XMIDrawingTools,overlay=window.XMIDrawingLayer,$=id=>document.getElementById(id);
 if(!core||!draw||!overlay){
  const message=document.getElementById("error");
  if(message){message.textContent="Chart analysis script unavailable; no candles can be displayed.";message.hidden=false;}
  return;
 }
 const WATCH=["FX:EURUSD","FX:GBPUSD","FX:USDJPY","FX:USDCHF","FX:AUDUSD","FX:EURGBP","FX:USDCAD"];
 const PANELS=["Indicators","Annotations","Patterns","Fibonacci","Lines","Measurements","Chart Settings"];
 const STYLES={dark:{background:"#0b1729",grid:"#203049",text:"#a6bbd6"},
  light:{background:"#f7f9ff",grid:"#dbe4ee",text:"#2b4561"}};
 const THREW=err=>{const el=$("error");el.textContent=err.message||String(err);el.hidden=false;};
 const state={
  watch:[...WATCH],slots:[{symbol:WATCH[0],timeframe:"5m"},{symbol:WATCH[1],timeframe:"5m"},
   {symbol:WATCH[2],timeframe:"5m"},{symbol:WATCH[3],timeframe:"5m"}],
  focus:0,layout:1,data:new Map(),instances:[],activePanel:null,docked:false,pinned:false,
  toolbar:"vertical",tech:{EMA:true,VWAP:true,RSI:true,MACD:true,Volume:true},
  structure:Object.fromEntries(core.SMC.map(n=>[n,{on:true,timeframe:"5m"}])),
  settings:{chartType:"Candlesticks",theme:"dark",grid:true,priceLine:true},
  toolsHidden:false,drawTool:null,pending:[],drawings:[],autoPatterns:true,
  watchHidden:false,intelHidden:false,focusMode:false,
  selectedDrawingId:null,history:[],future:[]
 };
 const safeStorage=()=>{
  try{localStorage.setItem("xmi2-studio-v1",JSON.stringify({watch:state.watch,tech:state.tech,
   structure:state.structure,settings:state.settings,drawings:draw.validate(state.drawings).slice(-150)}));}
  catch{ /* Private mode is allowed; ephemeral settings. */ }
 };
 try{
  const data=JSON.parse(localStorage.getItem("xmi2-studio-v1")||"null");
  if(data){
   if(Array.isArray(data.watch))state.watch=[...new Set(data.watch.filter(x=>{try{return core.checkSymbol(x)===x}catch{return false}}))].slice(0,10);
   if(!state.watch.length)state.watch=[WATCH[0]];
   for(const k of core.TECH)if(typeof data.tech?.[k]==="boolean")state.tech[k]=data.tech[k];
   for(const k of core.SMC)if(typeof data.structure?.[k]?.on==="boolean"&&core.STEPS[data.structure[k]?.timeframe])
    state.structure[k]={on:data.structure[k].on,timeframe:data.structure[k].timeframe};
   if(core.TYPES.includes(data.settings?.chartType))state.settings.chartType=data.settings.chartType;
   if(["dark","light"].includes(data.settings?.theme))state.settings.theme=data.settings.theme;
   if(typeof data.settings?.grid==="boolean")state.settings.grid=data.settings.grid;
   if(Array.isArray(data.drawings)){
    const legacy=data.drawings.slice(-draw.MAX_DRAWINGS).map((d,i)=>({
     ...d,id:d.id||"old"+i,points:Array.isArray(d.points)?d.points:[]}));
    try{state.drawings=draw.validate(legacy);}catch{state.drawings=[];}
   }
  }
 }catch{ /* ignore malformed/local-disabled browser storage */ }
 function el(name,props={},children=[]){
  const e=document.createElement(name);
  for(const [k,v] of Object.entries(props)){
   if(k==="text")e.textContent=v;
   else if(k==="className")e.className=v;
   else if(k==="onClick")e.addEventListener("click",v);
   else if(k==="onChange")e.addEventListener("change",v);
   else if(k==="checked")e.checked=v;
   else if(k==="value")e.value=v;
   else if(k==="title")e.title=v;
   else e.setAttribute(k,v);
  }
  for(const child of children)e.append(child);
  return e;
 }
 function current(){return state.slots[state.focus];}
 function record(){return state.data.get(current().symbol+"|"+current().timeframe);}
 function fmtSymbol(symbol){return symbol.replace(/^FX:/,"").replace(/^([A-Z]{3})([A-Z]{3})$/,"$1/$2");}
 function status(text,color){$("sourceStatus").textContent=text;$("sourceStatus").style.color=color||"";}
 function notice(text){$("chartNotice").textContent=text;}
 function syncControls(){
  $("focusedName").textContent=fmtSymbol(current().symbol)+" · "+current().timeframe;
  $("intelSymbol").textContent=fmtSymbol(current().symbol);
  $("timeframeSelect").value=current().timeframe;
  $("chartTypeSelect").value=state.settings.chartType;
  $("layoutSelect").value=String(state.layout);
 }
 function renderWatch(){
  const list=$("watchList");list.replaceChildren();
  $("watchCount").textContent=state.watch.length+"/10";
  state.watch.forEach(sym=>{
   const row=el("div",{className:"watch-item"+(current().symbol===sym?" active":"")});
   const pick=el("button",{type:"button",onClick:()=>{state.slots[state.focus].symbol=sym;state.pending=[];renderAll();}});
   pick.append(el("strong",{text:fmtSymbol(sym)}),el("small",{text:state.data.has(sym+"|"+current().timeframe)?"Imported OHLC":"Source needed"}));
   const del=el("button",{type:"button","aria-label":"Remove "+sym,onClick:()=>{
    if(state.watch.length<=1){THREW(Error("Keep at least one forex pair"));return;}
    state.watch=state.watch.filter(x=>x!==sym);
    state.slots=state.slots.map(s=>s.symbol===sym?{...s,symbol:state.watch[0]}:s);
    safeStorage();renderAll();
   },text:"×"});
   row.append(pick,del);list.append(row);
  });
 }
 function destroyCharts(){
  for(const instance of state.instances)try{instance.layer?.dispose();instance.chart.remove();}catch{}
  state.instances=[];
 }
 function seriesData(kind,bars){
  return core.chartBars(bars,kind);
 }
 function newPriceSeries(chart){
  const type=state.settings.chartType;
  const clazz=type==="Line"?lib.LineSeries:type==="Area"?lib.AreaSeries:
   type==="OHLC Bars"?lib.BarSeries:lib.CandlestickSeries;
  const options={priceFormat:{type:"price",precision:5,minMove:.00001},priceLineVisible:state.settings.priceLine};
  if(type==="Line")Object.assign(options,{color:"#4bd6c8",lineWidth:2});
  else if(type==="Area")Object.assign(options,{lineColor:"#4bd6c8",topColor:"rgba(75,214,200,.25)",bottomColor:"rgba(75,214,200,.02)"});
  else if(type==="OHLC Bars")Object.assign(options,{upColor:"#36c7a8",downColor:"#ef7b8b"});
  else Object.assign(options,{upColor:type==="Hollow Candles"?"rgba(0,0,0,0)":"#36c7a8",
   downColor:"#ef7b8b",borderVisible:type==="Hollow Candles",borderUpColor:"#36c7a8",borderDownColor:"#ef7b8b",
   wickUpColor:"#36c7a8",wickDownColor:"#ef7b8b"});
  return chart.addSeries(clazz,options);
 }
 function addLine(chart,values,color,pane=0){
  if(!values.length)return;
  const line=chart.addSeries(lib.LineSeries,{color,lineWidth:1,priceLineVisible:false,lastValueVisible:false},pane);
  line.setData(values);
 }
 function addAnnotations(chart,price,record){
  const enabled=core.SMC.filter(name=>state.structure[name].on&&state.structure[name].timeframe===record.timeframe);
  const structure=core.structure(record.bars),points=[];
  for(const name of enabled)for(const event of structure[name]){
   if(!record.bars.find(b=>b.time===event.time&&b.closed))continue;
   points.push({time:event.time,position:event.side==="bull"?"belowBar":"aboveBar",
    color:event.side==="bull"?"#53ceab":"#e8a57d",
    shape:event.side==="bull"?"arrowUp":"circle",
    text:name==="HH / HL / LH / LL"?"SWING":name.slice(0,7)});
  }
  const possible=points.sort((a,b)=>a.time-b.time).slice(-40);
  if(lib.createSeriesMarkers&&possible.length)lib.createSeriesMarkers(price,possible);
  const zones=enabled.flatMap(id=>structure[id].filter(e=>e.price!=null).slice(-2));
  for(const e of zones.slice(-10)){
   price.createPriceLine({price:e.price,color:"#597e9b",lineWidth:1,lineStyle:2,
    axisLabelVisible:false,title:e.concept.slice(0,4)});
  }
  return structure;
 }
 function saveState(next,selected=null){
  const validated=draw.validate(next);
  state.history.push(state.drawings.map(d=>({...d,points:d.points.map(p=>({...p}))})));
  state.history=state.history.slice(-50);state.future=[];
  state.drawings=validated;state.selectedDrawingId=selected;
  safeStorage();redrawLayers();renderDrawPanel();
 }
 function saveOne(d){
  const current=state.drawings.findIndex(old=>old.id===d.id);
  if(current<0&&state.drawings.length>=draw.MAX_DRAWINGS)throw Error("Maximum 150 drawings; remove some before adding");
  const next=state.drawings.slice();
  if(current<0)next.push(d);else next[current]=d;
  saveState(next,d.id);
 }
 function redrawLayers(){
  for(const instance of state.instances)instance.layer?.setSelected(state.selectedDrawingId);
 }
 function undoDrawing(){
  if(!state.history.length)return;
  state.future.push(state.drawings);state.drawings=state.history.pop();
  state.selectedDrawingId=null;safeStorage();redrawLayers();renderDrawPanel();
 }
 function redoDrawing(){
  if(!state.future.length)return;
  state.history.push(state.drawings);state.drawings=state.future.pop();
  state.selectedDrawingId=null;safeStorage();redrawLayers();renderDrawPanel();
 }
 function deleteDrawing(){
  if(!state.selectedDrawingId)return;
  saveState(state.drawings.filter(d=>d.id!==state.selectedDrawingId));
 }
 function eraseSymbol(){
  if(!window.confirm("Delete all saved drawings for "+fmtSymbol(current().symbol)+"?"))return;
  saveState(state.drawings.filter(d=>d.symbol!==current().symbol));
 }
 function exportDrawings(){
  try{
   const contents=draw.serialize(state.drawings);
   const uri=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
   const link=document.createElement("a");link.href=uri;link.download="xmi-local-chart-drawings.json";
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(uri),1000);
  }catch(err){THREW(err);}
 }
 async function importDrawings(file){
  try{
   if(file.size>250000)throw Error("Drawings JSON too large");
   const imported=draw.deserialize(await file.text());
   if(!window.confirm("Replace local drawing collection with "+imported.length+" imported drawings?"))return;
   saveState(imported);notice("Imported "+imported.length+" local drawings (no broker access).");
  }catch(err){THREW(Error("Drawing import rejected: "+err.message));}
 }
 function selectDrawTool(tool){
  state.drawTool=state.drawTool===tool?null:tool;state.pending=[];
  // Preserve the last completed drawing when entering Select / Edit so its
  // handles remain available immediately instead of requiring an extra click.
  if(state.drawTool!=="Select / Edit")state.selectedDrawingId=null;
  for(const instance of state.instances){
   instance.layer?.setMode(instance.slot===state.focus?state.drawTool:null);
   instance.layer?.setSelected(state.selectedDrawingId);
  }
  renderDrawPanel();
  notice(state.drawTool?state.drawTool==="Select / Edit"?
   "Select anchors or shapes to drag, edit, duplicate or delete.":
   "Draw "+state.drawTool+" using "+(draw.clicks(state.drawTool)||"dragged")+" chart anchor(s).":
   "Drawing mode closed. Scroll or pan charts normally.");
 }
 function addSwingFibonacci(tool){
  const source=record();
  if(!source){THREW(Error("Import historical candles first to anchor Fibonacci to confirmed swings."));return;}
  try{
   const anchors=draw.confirmedSwingAnchors(core.pivots(source.bars),tool);
   if(!anchors)throw Error("At least "+(tool==="Trend-Based Fib Extension"?3:2)+
    " alternating confirmed swing pivots are needed in imported closed candles.");
   const annotation={id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,9),
    symbol:current().symbol,tool,points:anchors,text:"Confirmed swing anchors",color:"#eac077"};
   saveOne(annotation);
   notice(tool+" anchored to confirmed historical swing candles. This is not a trade signal.");
  }catch(err){THREW(err);}
 }
 function renderDrawPanel(){
  if(!["Annotations","Patterns","Fibonacci","Lines","Measurements"].includes(state.activePanel))return;
  renderPanel();
 }
 function renderCharts(){
  destroyCharts();const grid=$("chartGrid");grid.className="chart-grid layout-"+state.layout;
  const cards=[...grid.querySelectorAll(".chart-tile")];
  for(let i=0;i<4;i++){
   const card=cards[i],slot=state.slots[i];
   card.hidden=i>=state.layout;card.classList.toggle("active",i===state.focus);
   if(card.hidden)continue;
   const container=card.querySelector(".chart-viewport"),empty=card.querySelector(".tile-empty");
   container.replaceChildren();
   const tileData=state.data.get(slot.symbol+"|"+slot.timeframe);
   card.querySelector(".chart-label").textContent=fmtSymbol(slot.symbol)+" · "+slot.timeframe+
    (tileData?.origin==="gateway-readonly"?" · BROKER SNAPSHOT":tileData?" · HISTORICAL IMPORT":"");
   const data=state.data.get(slot.symbol+"|"+slot.timeframe);
   if(!data){empty.hidden=false;empty.textContent="NO CANDLES FOR "+fmtSymbol(slot.symbol)+" · "+slot.timeframe+". Import historical OHLC JSON; XMI will not invent prices.";continue;}
   if(!lib?.createChart){empty.hidden=false;empty.textContent="Chart library unavailable. Check the pinned external script connection.";continue;}
   empty.hidden=true;
   try{
    const style=STYLES[state.settings.theme];
    const chart=lib.createChart(container,{width:Math.max(230,container.clientWidth),
     height:container.clientHeight||450,
     layout:{background:{type:"solid",color:style.background},textColor:style.text,fontSize:11},
     localization:{locale:"en-US"},
     grid:{vertLines:{color:state.settings.grid?style.grid:"transparent"},horzLines:{color:state.settings.grid?style.grid:"transparent"}},
     timeScale:{timeVisible:true,secondsVisible:false,rightOffset:5},rightPriceScale:{borderColor:style.grid}});
    const price=newPriceSeries(chart);
    const bars=data.bars,plot=seriesData(state.settings.chartType,bars);
    price.setData(plot);
    const result=core.indicators(bars);
    if(state.tech.EMA){addLine(chart,result.ema20,"#ffd079");addLine(chart,result.ema50,"#63b9eb");addLine(chart,result.ema200,"#bd93e4");}
    if(state.tech.VWAP)addLine(chart,result.vwap,"#60d4b3");
    if(state.tech.RSI)addLine(chart,result.rsi,"#e8b57c",1);
    if(state.tech.MACD){addLine(chart,result.macd,"#cf8be7",2);addLine(chart,result.macdSignal,"#dfa16d",2);}
    if(state.tech.Volume&&result.volume.length){
     const vol=chart.addSeries(lib.HistogramSeries,{color:"#688cae",priceLineVisible:false,lastValueVisible:false},3);
     vol.setData(result.volume);
    }
    addAnnotations(chart,price,data);
    const layer=new overlay.DrawingLayer({
     chart,series:price,root:container,record:data,symbol:slot.symbol,
     getDrawings:()=>state.drawings,
     onSave:saveOne,
     onSelect:id=>{state.selectedDrawingId=id;renderDrawPanel();},
     onNotice:notice,onError:THREW
    });
    layer.setSelected(state.selectedDrawingId);
    layer.setMode(i===state.focus?state.drawTool:null);
    chart.timeScale().setVisibleLogicalRange({from:Math.max(0,plot.length-75),to:plot.length+5});
    state.instances.push({chart,container,layer,slot:i});
   }catch(err){empty.hidden=false;empty.textContent="Chart error: "+(err.message||"Render unavailable");THREW(err);}
  }
  if(state.focus>=state.layout){state.focus=0;syncControls();}
  const currentData=record();
  if(currentData){
   status(currentData.origin==="gateway-readonly"?"TRADELOCKER READ-ONLY SNAPSHOT · REFRESHING":
    "HISTORICAL USER IMPORT · NOT LIVE","#d4e7a4");
   notice(currentData.origin==="gateway-readonly"?
    "Read-only TradeLocker snapshot · "+currentData.bars.length+" candles · source as of "+
    currentData.asOf+" · received "+currentData.observedAt+". No trading execution.":
    "Imported "+currentData.bars.length+" historical candles · "+currentData.source+
    " · as of "+currentData.asOf+". Data is user-supplied, not independently broker-verified.");
  }else{
   status("HISTORICAL IMPORT ONLY · NO LIVE FEED");
   notice("No candles available for "+fmtSymbol(current().symbol)+" "+current().timeframe+
    ". Broker access remains disabled under owner option C; import timestamped historical OHLC.");
  }
  renderIntelligence();
 }
 function renderIntelligence(){
  syncControls();
  const data=record(),events=$("intelEvents"),patterns=$("intelPatterns");
  events.replaceChildren();patterns.replaceChildren();
  if(!data){$("intelSource").textContent="Not connected";$("intelLast").textContent="—";
   $("intelAnalysis").textContent="Awaiting source candles";events.textContent="No verified historical data.";patterns.textContent="No patterns.";return;}
  $("intelSource").textContent=data.origin==="gateway-readonly"?
   "TradeLocker · read-only verified source":("User import · "+data.source);
  const last=data.bars.at(-1);$("intelLast").textContent=last.close.toFixed(5)+(last.closed?" · closed":" · forming");
  const result=core.structure(data.bars),out=[];
  let missing=0;
  for(const name of core.SMC)if(state.structure[name].on){
   if(state.structure[name].timeframe===data.timeframe){
    const found=result[name]?.at(-1);if(found)out.push(found);
   }else missing++;
  }
  out.sort((a,b)=>b.time-a.time);
  $("intelAnalysis").textContent=data.bars.filter(x=>x.closed).length+" closed candles · "+missing+" concept(s) require other timeframe data";
  for(const e of out.slice(0,8))events.append(el("div",{className:"event"},[
   el("strong",{text:e.concept}),el("span",{text:e.description+" · "+new Date(e.time*1000).toLocaleString()})]));
  if(!out.length)events.textContent="No matching confirmed structures in imported history.";
  const found=window.XMIAutoPatterns?window.XMIAutoPatterns.detect(data.bars):[];
  for(const e of found)patterns.append(el("div",{className:"event"},[
   el("strong",{text:e.pattern}),el("span",{text:"Close-confirmed · score "+Math.round(e.confidence*100)+"/100 (heuristic, not probability) · "+e.status+(e.invalidatedAt?" at "+new Date(e.invalidatedAt*1000).toLocaleString():"")+" · "+new Date(e.time*1000).toLocaleString()})]));
  if(!found.length)patterns.textContent="No close-confirmed automatic patterns in imported history.";
 }
 function renderAll(){renderWatch();syncControls();renderCharts();}
 function setPanel(name){
  if(state.activePanel===name){state.activePanel=null;$("toolPopup").hidden=true;return;}
  state.activePanel=name;$("toolTitle").textContent=name;
  $("toolPopup").hidden=false;
  for(const btn of $("toolBar").querySelectorAll("[data-panel]"))
   btn.classList.toggle("selected",btn.dataset.panel===name);
  renderPanel();
 }
 function toolLabel(name,checked,onChange){
  const label=el("label");const input=el("input",{type:"checkbox",checked});
  input.addEventListener("change",()=>onChange(input.checked));
  label.append(input,el("span",{text:name}));return label;
 }
 function renderPanel(){
  const contents=$("toolContents"),name=state.activePanel;contents.replaceChildren();if(!name)return;
  if(name==="Indicators"){
   const search=el("input",{type:"text",placeholder:"Search indicators and market structure","aria-label":"Search indicators"});
   contents.append(search);
   const results=el("div");
   const draw=(term="")=>{
    results.replaceChildren();
    const tech=el("div",{className:"tool-group"},[el("strong",{text:"Technical indicators"})]);
    for(const k of core.TECH)if(k.toLowerCase().includes(term.toLowerCase()))
     tech.append(toolLabel(k,state.tech[k],v=>{state.tech[k]=v;safeStorage();renderCharts();}));
    results.append(tech);
    const smc=el("div",{className:"tool-group"},[el("strong",{text:"Market structure · candle-close confirmed"})]);
    for(const k of core.SMC)if(k.toLowerCase().includes(term.toLowerCase())){
     const row=el("div",{className:"tool-row"});
     row.append(toolLabel(k,state.structure[k].on,v=>{state.structure[k].on=v;safeStorage();renderCharts();}));
     const sel=el("select",{"aria-label":k+" timeframe"});
     for(const tf of Object.keys(core.STEPS))sel.append(el("option",{value:tf,text:tf}));
     sel.value=state.structure[k].timeframe;
     sel.addEventListener("change",()=>{state.structure[k].timeframe=sel.value;safeStorage();renderCharts();});
     row.append(sel);smc.append(row);
    }results.append(smc);
    results.append(el("p",{className:"tool-tip",text:"Each market-structure concept has its own source timeframe. Missing timeframe data is unavailable, never inferred."}));
   };search.addEventListener("input",()=>draw(search.value));draw();contents.append(results);
  }else if(name==="Chart Settings"){
   const types=el("select",{"aria-label":"Chart type"});
   for(const type of core.TYPES)types.append(el("option",{text:type,value:type}));
   types.value=state.settings.chartType;
   types.addEventListener("change",()=>{state.settings.chartType=types.value;$("chartTypeSelect").value=types.value;safeStorage();renderCharts();});
   const typeLabel=el("label",{text:"Chart type"});typeLabel.append(types);contents.append(typeLabel);
   const theme=el("select",{"aria-label":"Theme"});for(const t of ["dark","light"])theme.append(el("option",{text:t,value:t}));
   theme.value=state.settings.theme;theme.addEventListener("change",()=>{state.settings.theme=theme.value;safeStorage();renderCharts();});
   const tl=el("label",{text:"Theme"});tl.append(theme);contents.append(tl);
   for(const [key,label] of [["grid","Show grid"],["priceLine","Show price line"]])
    contents.append(toolLabel(label,state.settings[key],v=>{state.settings[key]=v;safeStorage();renderCharts();}));
   contents.append(el("p",{className:"tool-tip",text:"Stage 1 uses global chart settings. Per-chart overrides, timezone and live bid/ask settings remain pending a source authorization decision."}));
  }else{
   const choices=draw.TOOLS[name]||[];
   contents.append(el("p",{className:"tool-tip",text:
    "Choose a tool and click anchor points. Freehand: drag. Select / Edit: drag handles or a whole shape. Drawing data is local-only and tied to the FX symbol across timeframes."}));
   contents.append(el("button",{type:"button",className:"tool-pick",
    "aria-pressed":String(state.drawTool==="Select / Edit"),text:"◎ Select / Edit",
    onClick:()=>selectDrawTool("Select / Edit")}));
   for(const tool of choices)contents.append(el("button",{type:"button",className:"tool-pick",
    "aria-pressed":String(state.drawTool===tool),text:(state.drawTool===tool?"✓ ":"")+tool,
    onClick:()=>selectDrawTool(tool)}));
   contents.append(el("button",{type:"button",className:"tool-pick",
    text:"Exit drawing mode",onClick:()=>{state.drawTool=null;
     for(const instance of state.instances)instance.layer?.setMode(null);
     renderPanel();notice("Chart navigation restored.");}}));
   if(name==="Fibonacci"){
    const auto=el("div",{className:"tool-group"},[el("strong",{text:"Auto-anchor from confirmed swings"})]);
    for(const type of draw.TOOLS.Fibonacci)auto.append(el("button",{
     type:"button",className:"tool-pick",text:"Use confirmed swings · "+type,
     onClick:()=>addSwingFibonacci(type)
    }));
    auto.append(el("p",{className:"tool-tip",text:
     "Swing anchors require completed candles plus two bars of right-hand confirmation. No live prices or lookahead."}));
    contents.append(auto);
   }
   const own=state.drawings.filter(d=>d.symbol===current().symbol).slice(-20).reverse();
   if(own.length){
    const chooser=el("div",{className:"tool-group"},[el("strong",{text:"Your saved drawings · select to edit"})]);
    for(const d of own){
     chooser.append(el("button",{type:"button",className:"tool-pick",
      "data-select-drawing":d.id,
      "aria-pressed":String(state.selectedDrawingId===d.id),
      text:(state.selectedDrawingId===d.id?"✓ ":"")+d.tool+" · "+d.id.slice(-5),
      onClick:()=>{
       state.selectedDrawingId=d.id;state.drawTool="Select / Edit";
       for(const instance of state.instances){
        instance.layer?.setMode(instance.slot===state.focus?"Select / Edit":null);
        instance.layer?.setSelected(d.id);
       }
       renderPanel();notice("Selected "+d.tool+". Drag its anchor handles or choose an edit action.");
      }
     }));
    }
    contents.append(chooser);
   }
   const selected=state.drawings.find(d=>d.id===state.selectedDrawingId&&d.symbol===current().symbol);
   if(selected){
    const edit=el("div",{className:"tool-group"},[el("strong",{text:"Selected · "+selected.tool})]);
    const colorLabel=el("label",{text:"Stroke color "});
    const color=el("input",{type:"color",value:selected.color||"#65d1e7","aria-label":"Drawing color"});
    color.addEventListener("change",()=>{saveOne({...selected,color:color.value});});
    colorLabel.append(color);edit.append(colorLabel);
    const controls=el("div",{className:"tool-actions"});
    controls.append(el("button",{type:"button",text:"Duplicate",onClick:()=>{
     saveOne({...selected,id:"d"+Date.now().toString(36)+Math.random().toString(36).slice(2,9),
      points:selected.points.map(p=>({...p,time:p.time+core.STEPS[current().timeframe]}))});
    }}),el("button",{type:"button",text:"Delete selected",onClick:deleteDrawing}));
    if(selected.tool==="Text labels")controls.append(el("button",{type:"button",
     text:"Edit label",onClick:()=>{
      const value=window.prompt("Label (max 100 characters)",selected.text);
      if(value!==null&&value.trim())saveOne({...selected,text:value.trim().slice(0,100)});
     }}));
    edit.append(controls);
    if(draw.TOOLS.Measurements.includes(selected.tool)){
     const metric=draw.metrics(selected,core.STEPS[current().timeframe]);
     edit.append(el("p",{className:"tool-tip",text:"Hypothetical research measurement · "+
      (selected.tool==="Long / Short Risk Reward"?"R:R "+(metric.ratio?.toFixed(2)||"N/A"):
       metric.pips.toFixed(1)+" approx. pips · "+metric.percent.toFixed(2)+"%")}));
    }
    contents.append(edit);
   }
   const actions=el("div",{className:"tool-actions"});
   actions.append(el("button",{type:"button",text:"Undo",onClick:undoDrawing}),
    el("button",{type:"button",text:"Redo",onClick:redoDrawing}),
    el("button",{type:"button",text:"Clear symbol",onClick:eraseSymbol}));
   contents.append(actions);
   const io=el("div",{className:"tool-actions"});
   io.append(el("button",{type:"button",text:"Export drawings JSON",onClick:exportDrawings}),
    el("button",{type:"button",text:"Import drawings JSON",onClick:()=>{
     document.getElementById("drawingImport").click();
    }}));
   contents.append(io);
   contents.append(el("p",{className:"tool-tip",text:
    state.drawings.filter(d=>d.symbol===current().symbol).length+
    " local drawing(s) for "+fmtSymbol(current().symbol)+". Press Ctrl/Cmd+Z to undo or Delete to remove a selected drawing."}));
   if(name==="Patterns")contents.append(el("p",{className:"tool-tip",text:
    "Pattern outlines are manual annotations. Automatic pattern recognition remains separate and candle-close-only."}));
  }
 }
 function setup(){
  $("addSymbolForm").addEventListener("submit",e=>{
   e.preventDefault();const raw=$("newSymbol").value.toUpperCase().trim();let symbol;
   try{symbol=core.checkSymbol(raw.startsWith("FX:")?raw:"FX:"+raw);
    if(state.watch.includes(symbol))throw Error("Already in watchlist");
    if(state.watch.length===10)throw Error("Maximum 10 symbols");
    state.watch.push(symbol);state.slots[state.focus].symbol=symbol;$("newSymbol").value="";safeStorage();renderAll();
   }catch(err){THREW(err);}
  });
  $("importButton").addEventListener("click",()=>$("importFile").click());
  $("drawingImport").addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(file)await importDrawings(file);
   e.target.value="";
  });
  $("importFile").addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{
    if(file.size>2_500_000)throw Error("Maximum import 2.5 MB");
    const parsed=core.normalize(JSON.parse(await file.text()));
    state.data.set(parsed.symbol+"|"+parsed.timeframe,parsed);
    if(!state.watch.includes(parsed.symbol)){
     if(state.watch.length>=10)throw Error("Watchlist full; remove a pair before importing");
     state.watch.push(parsed.symbol);
    }
    state.slots[state.focus]={symbol:parsed.symbol,timeframe:parsed.timeframe};
    $("error").hidden=true;renderAll();
   }catch(err){THREW(err);}finally{e.target.value="";}
  });
  for(const [id,key] of [["toggleWatch","watchHidden"],["toggleIntel","intelHidden"]])
   $(id).addEventListener("click",()=>{state[key]=!state[key];layout();});
  for(const [btn,body] of [["watchCollapse","watchBody"],["intelCollapse","intelBody"]])
   $(btn).addEventListener("click",()=>{$(body).hidden=!$(body).hidden;$(btn).textContent=$(body).hidden?"Expand":"Collapse";});
  $("layoutSelect").addEventListener("change",e=>{state.layout=Number(e.target.value);if(state.focus>=state.layout)state.focus=0;renderAll();});
  $("timeframeSelect").addEventListener("change",e=>{current().timeframe=e.target.value;renderAll();});
  $("chartTypeSelect").addEventListener("change",e=>{state.settings.chartType=e.target.value;safeStorage();renderCharts();});
  for(const card of document.querySelectorAll(".chart-tile"))card.addEventListener("pointerdown",()=>{
   state.focus=Number(card.dataset.slot);syncControls();renderWatch();renderIntelligence();
   for(const instance of state.instances)instance.layer?.setMode(instance.slot===state.focus?state.drawTool:null);
  });
  for(const btn of $("toolBar").querySelectorAll("[data-panel]"))btn.addEventListener("click",()=>setPanel(btn.dataset.panel));
  $("closePanel").addEventListener("click",()=>{state.activePanel=null;$("toolPopup").hidden=true;});
  $("dockPanel").addEventListener("click",()=>{state.docked=!state.docked;$("toolDock").classList.toggle("docked",state.docked);
   $("dockPanel").textContent=state.docked?"Pop out":"Dock";});
  $("pinPanel").addEventListener("click",()=>{state.pinned=!state.pinned;$("pinPanel").textContent=state.pinned?"Unpin":"Pin";});
  $("moveToolbar").addEventListener("click",()=>{$("toolDock").classList.toggle("horizontal");});
  $("closeToolbar").addEventListener("click",()=>{$("toolBar").hidden=true;$("toolPopup").hidden=true;
   $("restoreToolbar").hidden=false;});
  $("restoreToolbar").addEventListener("click",()=>{$("toolBar").hidden=false;$("restoreToolbar").hidden=true;});
  const studio=$("studio");
  function toggleFocus(){
   state.focusMode=!state.focusMode;
   studio.classList.toggle("focus",state.focusMode);
   $("exitFocus").hidden=!state.focusMode;
   $("focusButton").textContent=state.focusMode?"Exit focus":"Focus mode";
   layout();
  }
  $("focusButton").addEventListener("click",toggleFocus);
  $("exitFocus").addEventListener("click",toggleFocus);
  $("maximizeButton").addEventListener("click",()=>{studio.classList.toggle("maximized");
   $("maximizeButton").textContent=studio.classList.contains("maximized")?"Restore":"Maximize";resize();});
  $("fullscreenButton").addEventListener("click",async()=>{
   try{if(document.fullscreenElement)await document.exitFullscreen();else await studio.requestFullscreen();resize();}
   catch(e){THREW(Error("Fullscreen denied by browser"));}});
  document.addEventListener("keydown",e=>{
   const editable=e.target?.matches?.("input,textarea,select,[contenteditable=true]");
   if(!editable&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
    e.preventDefault();if(e.shiftKey)redoDrawing();else undoDrawing();return;
   }
   if(!editable&&!e.ctrlKey&&!e.metaKey&&(e.key==="Delete"||e.key==="Backspace")){
    deleteDrawing();return;
   }
   if(e.key==="Escape"){
    state.pending=[];
    if(state.drawTool){
     state.drawTool=null;
     for(const instance of state.instances)instance.layer?.setMode(null);
    }
    if(!state.pinned){$("toolPopup").hidden=true;state.activePanel=null;}
   }
  });
  document.addEventListener("pointerdown",e=>{
   if(!state.activePanel||state.docked||state.pinned)return;
   if(!$("toolDock").contains(e.target)){$("toolPopup").hidden=true;state.activePanel=null;}
  });
  let resizeID=0;window.addEventListener("resize",()=>{cancelAnimationFrame(resizeID);resizeID=requestAnimationFrame(resize);});
  if("ResizeObserver"in window)new ResizeObserver(resize).observe($("chartGrid"));
 }
 function resize(){for(const {chart,container} of state.instances)try{
  chart.resize(Math.max(230,container.clientWidth),Math.max(300,container.clientHeight));}catch{}}
 function layout(){
  const workspace=document.querySelector(".workspace");
  $("watchPanel").hidden=state.watchHidden||state.focusMode;
  $("intelPanel").hidden=state.intelHidden||state.focusMode;
  workspace.classList.toggle("no-watch",state.watchHidden||state.focusMode);
  workspace.classList.toggle("no-intel",state.intelHidden||state.focusMode);
  $("toggleWatch").textContent=state.watchHidden?"Show watchlist":"Hide watchlist";
  $("toggleIntel").textContent=state.intelHidden?"Show intelligence":"Hide intelligence";
  setTimeout(resize,0);
 }
 if(!core){THREW(Error("Chart analysis library did not load"));return;}
 setup();renderAll();
})();

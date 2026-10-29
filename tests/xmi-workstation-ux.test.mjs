import test from "node:test";
import assert from "node:assert/strict";
import {normalizeShellUI,DEFAULT_SHELL_UI} from "../lib/xmiWorkspaceState.mjs";
import {workspaceShortcut,filterHeadlines,filterJournalRows} from "../lib/xmiWorkspaceUX.mjs";
import {newsContextFlag} from "../lib/xmiNewsContext.mjs";

test("Legacy shell layouts gain safe presentation defaults without losing workspace state",()=>{
 const legacy={tab:"journal",showTabs:false,collapsed:{research:true},maximized:{journal:true}};
 const ui=normalizeShellUI(legacy);
 assert.equal(ui.tab,"journal");assert.equal(ui.collapsed.research,true);
 assert.equal(ui.maximized.journal,true);assert.equal(ui.showTabs,false);
 assert.equal(ui.density,"compact");assert.equal(ui.shortcuts,false);
 assert.deepEqual(normalizeShellUI(null),DEFAULT_SHELL_UI);
});
test("Density and shortcuts round-trip through the existing settings format, rejecting malformed values",()=>{
 const ui=normalizeShellUI({density:"comfortable",shortcuts:true});
 assert.deepEqual(normalizeShellUI(JSON.parse(JSON.stringify(ui))),ui);
 assert.equal(normalizeShellUI({density:"huge",shortcuts:"true"}).density,"compact");
 assert.equal(normalizeShellUI({shortcuts:"true"}).shortcuts,false);
 assert.deepEqual(Object.keys(ui.collapsed),["live","research","strategy","journal","admin"]);
});
const key={code:"Digit1",altKey:true,shiftKey:true,target:{closest:()=>null}};
test("Workspace shortcuts require explicit modifiers and one of the five workspace digits",()=>{
 assert.equal(workspaceShortcut(key),"live");
 assert.equal(workspaceShortcut({...key,code:"Digit5"}),"admin");
 for(const change of [{altKey:false},{shiftKey:false},{ctrlKey:true},{metaKey:true},
  {defaultPrevented:true},{repeat:true},{isComposing:true},{code:"Digit6"},{code:"KeyR"}])
  assert.equal(workspaceShortcut({...key,...change}),null);
});
test("Shortcuts never intercept typing, editable descendants or native select input",()=>{
 assert.equal(workspaceShortcut({...key,target:{isContentEditable:true}}),null);
 for(const name of ["input","textarea","select","[role='textbox']","[contenteditable]"])
  assert.equal(workspaceShortcut({...key,target:{closest:selector=>selector.includes(name)?{}:null}}),null);
});
const stories=[
 {title:"EURUSD rally",source:"Source A"},
 {title:"Market falls",source:"Source B"},
 {title:"Market update",source:"Source B"}
];
test("Headline filters combine text, source and existing language flags without changing the source snapshot",()=>{
 const original=structuredClone(stories);
 assert.deepEqual(filterHeadlines(stories,"  MARKET ","Source B","negative",newsContextFlag),[stories[1]]);
 assert.deepEqual(filterHeadlines(stories,"source a"),[stories[0]]);
 assert.deepEqual(filterHeadlines(stories,"", "", "unclear",newsContextFlag),[stories[2]]);
 assert.deepEqual(filterHeadlines(stories,"not found"),[]);
 assert.deepEqual(stories,original);
});
test("Journal search sorts a separate view and preserves original records, notes, quantities and P/L",()=>{
 const rows=[{symbol:"AAPL",side:"LONG",entry_time:"2026-10-01T10:00:00Z",setup:"Pullback",notes:"Review",quantity:3,pnl:6.25},
  {symbol:"MSFT",side:"SHORT",entry_time:"2026-10-02T10:00:00Z",setup:"Retest",notes:"Review exit",quantity:5,pnl:null}];
 const original=structuredClone(rows);
 assert.deepEqual(filterJournalRows(rows).map(row=>row.symbol),["MSFT","AAPL"]);
 assert.deepEqual(filterJournalRows(rows,"review","LONG"),[rows[0]]);
 assert.deepEqual(filterJournalRows(rows," REtest "),[rows[1]]);
 assert.deepEqual(filterJournalRows(rows,"missing"),[]);
 assert.deepEqual(rows,original);
 assert.equal(filterJournalRows(rows)[0],rows[1],"Views retain the existing calculated values");
});

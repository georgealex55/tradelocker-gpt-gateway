/* Presentation-only helpers. No market, journal or strategy calculations. */
import {TABS} from "./xmiWorkspaceState.mjs";
export function workspaceShortcut(event){
 if(event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||
    !event.altKey||!event.shiftKey)return null;
 const target=event.target;
 if(target?.isContentEditable||target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"))return null;
 const match=/^Digit([1-5])$/.exec(event.code||"");
 return match?TABS[Number(match[1])-1]:null;
}
export function filterHeadlines(stories,query="",source="",flag="",classify=()=>({})){
 const q=query.trim().toLocaleLowerCase();
 return stories.filter(story=>(!q||(story.title+" "+story.source).toLocaleLowerCase().includes(q))&&
  (!source||story.source===source)&&(!flag||classify(story).type===flag));
}
export function filterJournalRows(rows,query="",side=""){
 const q=query.trim().toLocaleLowerCase();
 return rows.filter(row=>(!side||row.side===side)&&(!q||
  [row.symbol,row.setup,row.notes].join(" ").toLocaleLowerCase().includes(q)))
  .sort((a,b)=>Date.parse(b.entry_time)-Date.parse(a.entry_time));
}

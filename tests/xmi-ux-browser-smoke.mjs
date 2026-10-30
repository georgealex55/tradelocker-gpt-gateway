/* Isolated UI regression checks. Fixtures are local test data, never deployed prices. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=process.env.XMI_SMOKE_ORIGIN||'http://127.0.0.1:3000';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(root).hostname),'UI fixtures may run only against a local test server');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
const stories=[
 {title:'EURUSD rally after data beats estimates',source:'Fixture A',scope:'pair-related',url:'https://example.com/one',publishedAt:'2026-10-29T12:00:00Z'},
 {title:'Market falls on weak report',source:'Fixture B',scope:'broader-market',url:'https://example.com/two',publishedAt:'2026-10-29T11:00:00Z'},
 {title:'Market update',source:'Fixture B',scope:'broader-market',url:'https://example.com/three',publishedAt:'2026-10-29T10:00:00Z'}
];
await page.route('**/api/xmi/live?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'FEED_DISABLED',error:'Isolated test: no live feed enabled'})}));
await page.route('**/api/xmi/feed-session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,configured:false,authenticated:false})}));
await page.route('**/api/xmi/context?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,stories,coverage:{type:'latest-80-only'}})}));
const navigation=()=>page.getByRole('navigation',{name:'XMI workspaces'});
const go=title=>navigation().getByRole('button',{name:new RegExp('^'+title)}).click();
const menu=()=>page.getByText('View & shortcuts',{exact:true});
const workspaceTitles=['Live Chart','News & Research','Strategy Lab','Trading Journal','Admin'];
try{
 assert.equal((await page.goto(root+'/xmi')).status(),200);
 await page.getByLabel('EURUSD data status',{exact:true}).filter({visible:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="EURUSD data status"]')?.textContent==='FEED DISABLED');
 assert.equal(await navigation().getByRole('button').count(),5);
 assert.ok(await page.locator('canvas').count()>0,'The original chart engine still mounts without a live quote');
 assert.equal(await page.getByText('<i>●</i> Feed unlocked',{exact:true}).count(),0);
 console.log('PASS chart engine and explicit non-live source status');

 // Independent collapse, maximize and restore for every mounted workspace, at every requested width.
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[390,844]]){
  await page.setViewportSize({width,height});
  for(const title of workspaceTitles){
   await go(title);
   const shell=await page.locator('[data-xmi-root]').boundingBox();
   const clientWidth=await page.evaluate(()=>document.documentElement.clientWidth);
   assert.ok(shell.x>=-1&&shell.x+shell.width<=clientWidth+1,`${width}: ${title} shell must fit the viewport`);
   const toolbar=page.getByRole('toolbar',{name:title+' workspace controls'});
   const controls=await toolbar.boundingBox();
   assert.ok(controls.x>=0&&controls.x+controls.width<=clientWidth+1,`${width}: ${title} controls are not clipped`);
   await page.getByRole('button',{name:'Collapse '+title+' workspace',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Expand '+title+' workspace',exact:true}).getAttribute('aria-expanded'),'false');
   // Maximizing a collapsed workspace must reveal its content.
   await page.getByRole('button',{name:'Maximize '+title+' workspace',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Collapse '+title+' workspace',exact:true}).getAttribute('aria-expanded'),'true');
   const maximized=page.locator('[class*="workspaceMaximized"]').filter({visible:true});
   const box=await maximized.boundingBox();
   assert.ok(box.x<=1&&box.y<=1&&box.width>=clientWidth-1,`${width}: ${title} must maximize to the viewport`);
   assert.ok(await page.getByRole('combobox',{name:'Workspace selector',exact:true}).isVisible());
   await page.getByRole('button',{name:'Restore '+title+' workspace',exact:true}).click();
  }
  const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(overflow.scroll<=overflow.width+1,`${width}: no document overflow`);
  console.log(`PASS ${width}×${height}: all five workspaces fit, collapse, maximize and restore`);
 }
 await page.setViewportSize({width:1366,height:768});
 await go('Live Chart');
 // Presentation options survive hydration and do not mutate chart/watchlist settings.
 const chartBefore=await page.evaluate(()=>localStorage.getItem('xmi-chart-ui-v1'));
 await menu().click();
 await page.getByRole('radio',{name:'Comfortable',exact:true}).check();
 await page.getByRole('checkbox',{name:'Enable workspace keyboard shortcuts'}).check();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('[data-xmi-root]').getAttribute('data-density'),'comfortable');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('[data-xmi-root]')?.dataset.density==='comfortable');
 await page.keyboard.press('Alt+Shift+Digit5');
 await page.getByRole('heading',{name:'System & access overview'}).waitFor();
 await page.keyboard.press('Alt+Shift+Digit3');
 await page.getByRole('textbox',{name:'Strategy research notes'}).fill('Keep this unsaved edit');
 await page.getByRole('textbox',{name:'Strategy research notes'}).press('Alt+Shift+Digit1');
 assert.ok(await page.getByRole('heading',{name:'Strategy presets & 9-cell engine'}).isVisible(),'Typing fields must suppress shortcuts');
 await page.getByRole('button',{name:'Maximize Strategy Lab workspace',exact:true}).click();
 await page.keyboard.press('Escape');
 assert.ok(await page.getByRole('button',{name:'Maximize Strategy Lab workspace',exact:true}).isVisible());
 await go('Live Chart');
 await page.getByRole('searchbox',{name:'Filter this watchlist'}).fill('GBP');
 assert.equal(await page.getByRole('complementary',{name:'Market sidebar'}).getByRole('listitem').count(),1);
 await page.getByRole('searchbox',{name:'Filter this watchlist'}).fill('no-match');
 await page.getByRole('button',{name:'Clear symbol filter'}).click();
 assert.equal(await page.getByRole('complementary',{name:'Market sidebar'}).getByRole('listitem').count(),7);
 assert.equal(await page.evaluate(()=>localStorage.getItem('xmi-chart-ui-v1')),chartBefore,'Filtering and density do not rewrite chart settings');
 console.log('PASS density persistence, optional shortcuts, typing isolation, Escape restoration and non-destructive watchlist search');

 await go('News & Research');
 const mainNews=page.getByRole('region',{name:'Ticker news and research'}).filter({visible:true});
 await mainNews.getByRole('group',{name:'Filter loaded headlines'}).waitFor();
 const newsRequests=()=>requests.filter(request=>request.url.includes('/api/xmi/context?')).length;
 const reads=newsRequests();
 await mainNews.getByRole('searchbox',{name:'Filter headline text'}).fill('market');
 assert.equal(await mainNews.getByRole('listitem').count(),2);
 await mainNews.getByRole('combobox',{name:'Filter headline language'}).selectOption('negative');
 assert.equal(await mainNews.getByRole('listitem').count(),1);
 await mainNews.getByRole('combobox',{name:'Filter news source'}).selectOption('Fixture A');
 await mainNews.getByText('No headlines match these filters',{exact:true}).waitFor();
 await mainNews.getByRole('button',{name:'Clear filters',exact:true}).first().click();
 assert.equal(await mainNews.getByRole('listitem').count(),3);
 assert.equal(newsRequests(),reads,'Local news filtering must not add network requests');
 console.log('PASS combined local headline filters, result counts and clearable empty state');

 await go('Trading Journal');
 await page.getByRole('button',{name:'Import existing records',exact:true}).click();
 const trades=Array.from({length:30},(_,index)=>({symbol:index===0?'AAPL':'MSFT',side:index%2?'SHORT':'LONG',entry_time:new Date(Date.UTC(2026,9,1,10,index)).toISOString(),entry_price:100,exit_time:new Date(Date.UTC(2026,9,1,11,index)).toISOString(),exit_price:102,quantity:2,setup:index===0?'Pullback':'Review',notes:'Isolated UI regression record'}));
 await page.getByLabel('Restore your exported local XMI journal').setInputFiles({name:'test-only-journal.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'xmi-local-journal-v1',trades}))});
 const table=page.getByRole('region',{name:'Recorded trades table'});
 await table.waitFor();
 assert.equal(await table.locator('tbody tr').count(),25);
 await page.getByRole('button',{name:'Next records',exact:true}).click();
 assert.equal(await table.locator('tbody tr').count(),5);
 await page.getByRole('searchbox',{name:'Search journal records'}).fill('pullback');
 assert.equal(await table.locator('tbody tr').count(),1);
 assert.equal(await table.locator('tbody tr td').nth(5).textContent(),'4.00','Display the original P/L calculation');
 await go('Strategy Lab');
 assert.equal(await page.getByRole('textbox',{name:'Strategy research notes'}).inputValue(),'Keep this unsaved edit');
 await go('Trading Journal');
 assert.equal(await table.locator('tbody tr').count(),1,'Workspace switching retains private journal state');
 await menu().click();
 await page.getByRole('button',{name:'Reset workspace view',exact:true}).click();
 await page.keyboard.press('Escape');
 assert.equal(await table.locator('tbody tr').count(),1,'View reset must preserve journal data and filters');
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export private JSON',exact:true}).click();
 const exported=await download;
 const fs=await import('node:fs/promises');
 const data=JSON.parse(await fs.readFile(await exported.path(),'utf8'));
 assert.equal(data.format,'xmi-local-journal-v1');assert.equal(data.trades.length,30);
 assert.equal(data.trades[0].pnl,4);
 const saved=await page.evaluate(()=>JSON.stringify({...localStorage}));
 assert.equal(saved.includes('Isolated UI regression record'),false,'Journal records never enter localStorage');
 assert.equal(saved.includes('Pullback'),false);
 assert.equal(requests.filter(request=>request.method!=='GET'&&request.method!=='HEAD').length,0,'UI changes must not create writes, cloud uploads or execution calls');
 assert.equal(requests.filter(request=>request.url.includes('/api/tradelocker/')||/\/api\/xmi\/(journal|bridge)/.test(request.url)).length,0,'No broker or journal write endpoints may be called');
 assert.deepEqual(errors,[],'No client runtime errors');
 console.log('PASS journal pagination, search, private state retention, original export format, layout reset and zero write/execution requests');
 console.log('PASS XMI usability browser regression suite');
}finally{await browser.close();}

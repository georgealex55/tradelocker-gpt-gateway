import test from 'node:test';
import assert from 'node:assert/strict';
import {replayAMDRetest} from '../scripts/xmi-amd-retest-execution.mjs';

const t0=Date.UTC(2023,0,3,12);
const bars=Array.from({length:5},(_,i)=>({
 t:new Date(t0+i*300000).toISOString(),o:1.12,h:1.122,l:1.118,c:1.12
}));
const signals=[{entryIndex:1,signalIndex:0,direction:1,sweepExtreme:1.116,
 atrAtRetest:.003,rangeModel:'rolling',entryModel:'range_reclaim_retest',
 rangeHigh:1.122,rangeLow:1.118}];
const inst={lotSize:100000,minLot:.01,lotStep:.01,symbolLeverage:500,
 spreadPrice:.00019,slippagePriceEachSide:.00003,
 specStatus:'PLATFORM_SCREENSHOT_PARTIAL',
 swapLongUsdPerLotPerNight:null,swapShortUsdPerLotPerNight:null};
const settings=sizing=>({symbol:'EURUSD',lane:'risk_fit',sizing,
 exitModel:'bracket_2r',carry:'session_flat'});
test('experimental 2% sizing accepted and not pooled into normal risk',()=>{
 const experimental=replayAMDRetest(bars,signals,inst,settings('risk_0.02'));
 const normal=replayAMDRetest(bars,signals,inst,settings('risk_0.01'));
 assert.equal(experimental.startingCapitalUSD,1000);
 assert.equal(normal.startingCapitalUSD,1000);
 assert.equal(experimental.decisions[0].riskBudgetUSD,20);
 assert.equal(normal.decisions[0].riskBudgetUSD,10);
 assert.equal(experimental.summary.historicalBidAskVerified,false);
 assert.equal(experimental.summary.instrumentSpecVerified,false);
 assert.throws(()=>replayAMDRetest(bars,signals,inst,settings('risk_0.03')),/Unknown risk sizing/);
});

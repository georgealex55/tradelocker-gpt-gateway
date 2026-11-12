import test from 'node:test';import assert from 'node:assert/strict';
import {auditMt5MinuteBars,spreadPointsToPrice} from '../lib/mt5/barSession.mjs';
const row=(time,spread=12)=>({time,spread});
const window={from:'2024-03-10T06:55:00.000Z',to:'2024-03-10T07:15:00.000Z'};
test('UTC bars across North American DST jump do not infer local missing hour',()=>{
 const x=auditMt5MinuteBars([row('2024-03-10T06:55:00.000Z'),row('2024-03-10T07:00:00.000Z')],{resolution:'5m',window,asOf:Date.parse(window.to)});
 assert.equal(x.missingBars,0);assert.equal(x.sourceClock,'UTC');
});
test('gap remains unverified, not fabricated session close',()=>{
 const x=auditMt5MinuteBars([row('2024-03-10T06:55:00.000Z'),row('2024-03-10T07:05:00.000Z')],{resolution:'5m',window,asOf:Date.parse(window.to)});
 assert.equal(x.missingBars,1);assert.equal(x.gaps[0].classification,'UNVERIFIED_SESSION_GAP');
});
test('duplicate, unaligned and timezone-less timestamps fail',()=>{
 const opts={resolution:'1m',window,asOf:Date.parse(window.to)};
 assert.throws(()=>auditMt5MinuteBars([row('2024-03-10T07:00:00.000Z'),row('2024-03-10T07:00:00.000Z')],opts),/DUPLICATE/);
 assert.throws(()=>auditMt5MinuteBars([row('2024-03-10T07:00:00.000Z'),row('2024-03-10T07:01:30.000Z')],opts),/UNALIGNED/);
 assert.throws(()=>auditMt5MinuteBars([row('2024-03-10 07:00:00'),row('2024-03-10T07:01:00.000Z')],opts),/EXPLICIT_UTC/);
});
test('spread points remain points without verified symbol point',()=>{
 const x=auditMt5MinuteBars([row('2024-03-10T07:00:00.000Z'),row('2024-03-10T07:05:00.000Z')],{resolution:'5m',window,asOf:Date.parse(window.to)});
 assert.equal(x.spreadPriceConversion,'UNAVAILABLE_NO_VERIFIED_SYMBOL_POINT');
 assert.equal(spreadPointsToPrice(12,0.00001),0.00012000000000000002);
 assert.throws(()=>spreadPointsToPrice(-1,0.00001));
});
test('invalid candle, missing completion and negative spread fail',()=>{
 const opts={resolution:'5m',window:{...window,to:'2024-03-10T07:11:00.000Z'},asOf:Date.parse('2024-03-10T07:11:00.000Z')};
 assert.throws(()=>auditMt5MinuteBars([row('2024-03-10T07:00:00.000Z'),row('2024-03-10T07:10:00.000Z')],opts),/INCOMPLETE/);
 assert.throws(()=>auditMt5MinuteBars([row('2024-03-10T07:00:00.000Z',-1),row('2024-03-10T07:05:00.000Z')],{...opts,asOf:Date.parse(window.to)}),/SPREAD/);
});

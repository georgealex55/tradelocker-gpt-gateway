import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMt5Capabilities} from '../scripts/mt5_capability_audit.mjs';
const matrix=JSON.parse(readFileSync(new URL('../docs/research/MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json',import.meta.url),'utf8'));
test('exact 34 feature ledger, evidence statuses and read-only summary',()=>{
 const report=auditMt5Capabilities(matrix);
 assert.equal(report.feature_count,34);assert.equal(report.execution_enabled,false);assert.equal(report.holdout_2025_read,false);
 assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),34);
});
test('duplicate capability fails closed',()=>{const m=structuredClone(matrix);m.capabilities[1].id=m.capabilities[0].id;assert.throws(()=>auditMt5Capabilities(m),/DUPLICATE/);});
test('missing capability fails closed',()=>{const m=structuredClone(matrix);m.capabilities.pop();assert.throws(()=>auditMt5Capabilities(m),/INCOMPLETE/);});
test('unsubstantiated verified status fails closed',()=>{const m=structuredClone(matrix);m.capabilities[0].status='verified';m.capabilities[0].acceptance_evidence=[];assert.throws(()=>auditMt5Capabilities(m),/UNSUPPORTED_VERIFICATION/);});

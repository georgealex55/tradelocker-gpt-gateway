import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { loadResearch, createResearch, writeResearch } from '../../../../lib/research/store';
import { killSwitchEnabled } from '../../../../lib/tradeGuard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
function approved(req) {
  const expected = process.env.TRADE_APPROVAL_KEY;
  const supplied = req.headers.get('x-trade-approval-key');
  return Boolean(expected && supplied && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(req) {
  if (!approved(req)) return json({ error: 'Approval key missing or invalid' }, 403);
  try { return json(await loadResearch(new URL(req.url).searchParams.get('runId'))); }
  catch { return json({ error: 'RESEARCH_DATABASE_UNAVAILABLE', detail: 'Verify database connection and apply migration 002.' }, 503); }
}
export async function POST(req) {
  if (!approved(req)) return json({ error: 'Approval key missing or invalid' }, 403);
  if (String(process.env.TRADING_ENABLED || 'false').toLowerCase() === 'true' || !killSwitchEnabled()) return json({ error: 'RESEARCH_REQUIRES_EXECUTION_DISABLED' }, 409);
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 3500000) return json({ error: 'RESULT_TOO_LARGE' }, 413);
    const body = JSON.parse(text);
    const result = body.action === 'create' ? await createResearch(body) : await writeResearch(body);
    return json(result);
  } catch (error) {
    const safe = ['INVALID_MANIFEST','INVALID_WORKER','RUN_BUSY_OR_MISSING','INVALID_COMBO','INVALID_RESULT','COMBO_MISMATCH','INVALID_METRICS','INVALID_ACTION'];
    return json({ error: safe.includes(error.message) ? error.message : 'RESEARCH_WRITE_FAILED', detail: 'Verify research schema and runner input. Secrets and raw database errors are never returned.' }, 400);
  }
}

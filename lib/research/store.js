import { dbQuery, tradeStateDbEnabled } from '../db';
import { combinations, ENGINE_VERSION } from './policies.mjs';

function enabled() { if (!tradeStateDbEnabled()) throw new Error('RESEARCH_DATABASE_UNAVAILABLE'); }
export async function loadResearch(runId) {
  enabled();
  const runs = await dbQuery(runId ? 'SELECT * FROM portfolio_backtest_runs WHERE id=$1' : 'SELECT * FROM portfolio_backtest_runs ORDER BY created_at DESC LIMIT 1', runId ? [runId] : []);
  if (!runs.length) return { run: null, results: [], total: 144, completed: 0, failures: 0 };
  const { worker_id, lease_until, ...run } = runs[0];
  const results = await dbQuery('SELECT combo_id, status, result_json, error_code FROM portfolio_backtest_results WHERE run_id=$1 ORDER BY combo_id', [run.id]);
  return { run, results, total: 144, completed: results.filter(r => r.status === 'COMPLETED').length, failures: results.filter(r => r.status === 'FAILED').length };
}
export async function createResearch(body) {
  enabled();
  if (!/^[a-f0-9]{64}$/.test(body.inputHash || '') || body.engineVersion !== ENGINE_VERSION || !body.manifest || !body.workerId) throw new Error('INVALID_MANIFEST');
  const id = `${ENGINE_VERSION}-${body.inputHash.slice(0, 20)}`;
  await dbQuery(`INSERT INTO portfolio_backtest_runs(id,input_hash,engine_version,manifest_json) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING`, [id, body.inputHash, ENGINE_VERSION, JSON.stringify(body.manifest)]);
  return { id };
}
export async function writeResearch(body) {
  enabled();
  if (!body.runId || !/^[a-f0-9-]{36}$/.test(body.workerId || '')) throw new Error('INVALID_WORKER');
  const claimed = await dbQuery(`UPDATE portfolio_backtest_runs SET worker_id=$2,lease_until=now()+interval '10 minutes',updated_at=now()
    WHERE id=$1 AND (worker_id=$2 OR lease_until IS NULL OR lease_until<now()) RETURNING id`, [body.runId, body.workerId]);
  if (!claimed.length) throw new Error('RUN_BUSY_OR_MISSING');
  if (body.action === 'processing') {
    if (!combinations().some(c => c.id === body.comboId)) throw new Error('INVALID_COMBO');
    await dbQuery("UPDATE portfolio_backtest_runs SET current_combo=$2,status='RUNNING' WHERE id=$1", [body.runId, body.comboId]);
  } else if (body.action === 'result') {
    const canonical = combinations().find(c => c.id === body.comboId);
    if (!canonical || !['COMPLETED','FAILED'].includes(body.status)) throw new Error('INVALID_RESULT');
    if (body.status === 'COMPLETED') {
      if (JSON.stringify(body.result?.combo) !== JSON.stringify(canonical)) throw new Error('COMBO_MISMATCH');
      for (const scope of ['descriptive','validation','stress']) if (!Number.isFinite(body.result?.[scope]?.metrics?.endingBalance)) throw new Error('INVALID_METRICS');
    }
    // Only research tables; no trade-state or production setting mutations.
    await dbQuery(`INSERT INTO portfolio_backtest_results(run_id,combo_id,status,result_json,error_code) VALUES($1,$2,$3,$4::jsonb,$5)
      ON CONFLICT(run_id,combo_id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json,error_code=excluded.error_code
      WHERE portfolio_backtest_results.status='FAILED'`,
    [body.runId, body.comboId, body.status, body.status === 'COMPLETED' ? JSON.stringify(body.result) : null, body.status === 'FAILED' ? 'COMBO_EXECUTION_FAILED' : null]);
  } else if (body.action === 'finish') {
    await dbQuery(`UPDATE portfolio_backtest_runs SET
      status=CASE WHEN (SELECT count(*) FROM portfolio_backtest_results WHERE run_id=$1)=144
        THEN CASE WHEN EXISTS(SELECT 1 FROM portfolio_backtest_results WHERE run_id=$1 AND status='FAILED') THEN 'COMPLETED_WITH_FAILURES' ELSE 'COMPLETED' END
        ELSE 'RUNNING' END,current_combo=NULL,worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1`, [body.runId]);
  } else throw new Error('INVALID_ACTION');
  return { ok: true };
}

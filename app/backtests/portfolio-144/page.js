'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import './research.css';
const endpoint = '/api/trading/portfolio-144';
const numeric = (v, digits = 2) => v == null ? '—' : Number(v).toFixed(digits);
const policies = ['risk', 'positions', 'daily', 'news', 'parameters', 'objective'];
const metrics = ['endingBalance','returnPercent','totalR','tradeCount','wins','losses','winRate','profitFactor','expectancyR','maxDrawdownPercent','maxDrawdownDollars','longestLosingStreak','minLotSkips','spreadBlocked','newsBlocked','capacityBlocked','averageStopPips','medianStopPips','averageRealizedR'];
const labels = { endingBalance:'Ending $', returnPercent:'Return %', totalR:'Total R', tradeCount:'Trades', wins:'Wins', losses:'Losses', winRate:'Win %', profitFactor:'PF', expectancyR:'Expectancy R', maxDrawdownPercent:'Drawdown %', maxDrawdownDollars:'Drawdown $', longestLosingStreak:'Losing streak', minLotSkips:'Min-lot skips', spreadBlocked:'Spread blocks', newsBlocked:'News blocks', capacityBlocked:'Capacity blocks', averageStopPips:'Avg stop', medianStopPips:'Median stop', averageRealizedR:'Avg R' };
function download(name, value, type) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export default function PortfolioResearch() {
  const [key, setKey] = useState(''), [connectedKey, setConnectedKey] = useState('');
  const [state, setState] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({}), [scope, setScope] = useState('validation'), [sort, setSort] = useState({ key: 'returnPercent', desc: true });
  const [selected, setSelected] = useState(null), [allColumns, setAllColumns] = useState(false);
  const refresh = useCallback(async () => {
    if (!connectedKey) return;
    setLoading(true);
    try {
      const id = new URLSearchParams(window.location.search).get('runId');
      const res = await fetch(endpoint + (id ? `?runId=${encodeURIComponent(id)}` : ''), { cache: 'no-store', headers: { 'x-trade-approval-key': connectedKey } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Results unavailable');
      setState(data); setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [connectedKey]);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [refresh]);
  const results = useMemo(() => (state?.results || []).filter(r => r.status === 'COMPLETED').map(r => r.result_json), [state]);
  const rows = useMemo(() => results.filter(r => policies.every(p => !filters[p] || String(r.combo[p]) === filters[p])).sort((a, b) => {
    const av = a[scope]?.metrics?.[sort.key] ?? a.combo[sort.key], bv = b[scope]?.metrics?.[sort.key] ?? b.combo[sort.key];
    if (av == null) return 1; if (bv == null) return -1;
    return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * (sort.desc ? -1 : 1);
  }), [results, filters, scope, sort]);
  const columns = allColumns ? metrics : ['endingBalance','returnPercent','tradeCount','profitFactor','expectancyR','maxDrawdownPercent','minLotSkips'];
  function exportCsv() {
    const fields = ['id', ...policies, 'scope', ...metrics, 'longTrades','longTotalR','shortTrades','shortTotalR','eligible','rejectionReasons'];
    const data = results.map(r => ({ ...r.combo, scope, ...r[scope].metrics, longTrades:r[scope].metrics.long.trades, longTotalR:r[scope].metrics.long.totalR, shortTrades:r[scope].metrics.short.trades, shortTotalR:r[scope].metrics.short.totalR, eligible:r.eligible,rejectionReasons:r.rejectionReasons.join(';') }));
    const csv = [fields, ...data.map(r => fields.map(k => r[k]))].map(a => a.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    download('portfolio-144.csv', csv, 'text/csv');
  }
  const shortlist = objective => results.filter(r => r.combo.objective === objective && r.eligible).sort((a,b) => b.score-a.score).slice(0,5);
  const robust = [...new Map(['BALANCED','RETURN','DRAWDOWN_CONTROL'].flatMap(shortlist).map(r => [JSON.stringify(policies.filter(p => p !== 'objective').map(p => r.combo[p])), r])).values()].slice(0,10);
  const elapsed = state?.run ? Math.round((Date.parse(state.run.updated_at) - Date.parse(state.run.created_at)) / 1000) : 0;
  return <main className="research">
    <header><div className="eyebrow">FOREX RESEARCH / V1.2</div><h1>Portfolio 144</h1><p>$200 · USDCHF / EURUSD / GBPUSD · Historical simulation only</p><span className="badge">No order execution</span></header>
    <form className="panel access" onSubmit={e => { e.preventDefault(); setConnectedKey(key); setKey(''); }}>
      <label>Existing gateway approval key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={connectedKey ? 'Connected for this tab' : 'Enter securely in this tab'} /></label>
      <button type="submit" disabled={!key}>Load results</button>
      <button type="button" disabled={!connectedKey || loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      <small>The key stays in tab memory and is sent only to this app. Refreshing the page requires entering it again.</small>
    </form>
    {error && <p role="alert" className="notice">{error}</p>}
    <section className="stats">
      {[['Combinations',144],['Completed',state?.completed || 0],['Failures',state?.failures || 0],['Current',state?.run?.current_combo || '—']].map(([label,value]) => <div className="panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </section>
    <progress aria-label="Completed combinations" max="144" value={state?.completed || 0} />
    <p className="muted">{state?.run?.status || 'Awaiting a persisted research run'} · {elapsed}s recorded elapsed · Results refresh every 10 seconds while connected.</p>
    {!results.length && <section className="panel"><h2>No historical results yet</h2><p>The runner must verify broker history, instrument metadata and event-calendar coverage, pass the subset check, then persist the experiment. An empty table is not a completed backtest.</p><p>144 rows represent 48 distinct trading policies scored three ways.</p></section>}
    <section className="shortlists">{['RETURN','BALANCED','DRAWDOWN_CONTROL'].map(o => <div className="panel" key={o}><h2>{o.replaceAll('_',' ')}</h2>{shortlist(o).length ? shortlist(o).map(r => <button className="resultlink" key={r.combo.id} onClick={() => setSelected(r)}>{r.combo.id} · {numeric(r.validation.metrics.returnPercent)}% · {r.validation.metrics.tradeCount} trades</button>) : <p className="muted">No eligible configurations yet.</p>}</div>)}</section>
    <section className="panel"><h2>Robustness shortlist</h2><p>{robust.length ? robust.map(r => r.combo.id).join(' · ') : 'No recommendations until the validation and stress criteria are met.'}</p><small>At least 30 validation trades, positive expectancy, PF &gt; 1.1, drawdown ≤ 10%, positive stress expectancy with ≥ 20 trades, ≥ 5 trades per pair, two positive windows, no pair or window above 75% of positive gains.</small></section>
    <section className="panel"><div className="toolbar"><h2>Results</h2><select aria-label="Performance period" value={scope} onChange={e => setScope(e.target.value)}><option value="validation">Held-forward validation</option><option value="descriptive">Full descriptive history</option><option value="stress">Stress-cost validation</option></select><button onClick={exportCsv} disabled={!results.length}>Export CSV</button><button disabled={!state?.run} onClick={() => download('portfolio-144.json',JSON.stringify(state,null,2),'application/json')}>Full JSON</button></div>
      <div className="filters">{policies.map(p => <label key={p}>{p}<select value={filters[p] || ''} onChange={e => setFilters({ ...filters,[p]:e.target.value })}><option value="">All</option>{[...new Set(results.map(r => String(r.combo[p])))].sort().map(v => <option key={v}>{v}</option>)}</select></label>)}</div>
      <label><input type="checkbox" checked={allColumns} onChange={e => setAllColumns(e.target.checked)} /> Show all metric columns</label>
      <div className="tablewrap"><table><thead><tr>{['id',...policies,...columns].map(k => <th key={k}><button onClick={() => setSort({key:k,desc:sort.key === k ? !sort.desc : true})}>{labels[k] || k}{sort.key === k ? sort.desc ? ' ↓' : ' ↑' : ''}</button></th>)}<th>Eligibility</th></tr></thead><tbody>{rows.map(r => <tr key={r.combo.id}><td><button className="resultlink" onClick={() => setSelected(r)}>{r.combo.id}</button></td>{policies.map(k => <td key={k}>{r.combo[k]}</td>)}{columns.map(k => <td key={k}>{numeric(r[scope].metrics[k],['tradeCount','wins','losses','minLotSkips','spreadBlocked','newsBlocked','capacityBlocked','longestLosingStreak'].includes(k) ? 0 : 2)}</td>)}<td>{r.eligible ? 'Eligible' : 'Rejected'}</td></tr>)}</tbody></table></div>
      <p className="muted">Drawdown is realized balance drawdown. PF uses dollar P&amp;L. Costs use the canonical OHLC proxy; exact bid/ask execution, commission and financing are not modeled. Prior strategy-tuning overlap is unknown.</p>
    </section>
    {selected && <section className="panel"><div className="toolbar"><h2>{selected.combo.id} details</h2><button onClick={() => setSelected(null)}>Close details</button></div><p>{selected.rejectionReasons.join(' · ') || 'Passes predefined robustness criteria'}</p><h3>Pair contributions · {scope}</h3><div className="tablewrap"><table><thead><tr><th>Pair</th><th>Trades</th><th>Win %</th><th>PF</th><th>Expectancy R</th><th>Total R</th><th>P&amp;L $</th></tr></thead><tbody>{Object.entries(selected[scope].byPair).map(([s,m]) => <tr key={s}><td>{s}</td><td>{m.tradeCount}</td><td>{numeric(m.winRate)}</td><td>{numeric(m.profitFactor)}</td><td>{numeric(m.expectancyR)}</td><td>{numeric(m.totalR)}</td><td>{numeric(m.endingBalance-200)}</td></tr>)}</tbody></table></div><details><summary>Windows, trade ledger and skip counts</summary><pre>{JSON.stringify(selected,null,2)}</pre></details></section>}
    {state?.run && <details className="panel"><summary>Reproducibility manifest and fitted parameters</summary><pre>{JSON.stringify(state.run.manifest_json,null,2)}</pre></details>}
  </main>;
}

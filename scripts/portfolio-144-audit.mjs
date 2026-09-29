// Offline research inspection. No gateway, database or order access.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SYMBOLS, M15 } from '../lib/research/policies.mjs';
import { validateDataset } from '../lib/research/prepare.mjs';

const file = process.argv[2] || 'research-output/dataset.json';
const bytes = await fs.readFile(file);
const input = JSON.parse(bytes);
const prepared = validateDataset(input);
const from = Date.parse(input.requestedFrom), to = Date.parse(input.requestedTo);
const warmupFrom = from - 30 * 86400000;
const iso = t => new Date(t).toISOString();
const sets = Object.fromEntries(SYMBOLS.map(s => [s, new Set(input.pairs[s].candles.map(c => c.time))]));
const union = [...new Set(SYMBOLS.flatMap(s => [...sets[s]]))].sort((a,b) => a-b);
const gaps = [];
for (let i=1; i<union.length; i++) {
  if (union[i] - union[i-1] > M15) gaps.push({ from: iso(union[i-1]+M15), toExclusive: iso(union[i]), missingBars: (union[i]-union[i-1])/M15-1 });
}
const rawMissing = Object.fromEntries(SYMBOLS.map(s => [s, union.filter(t => !sets[s].has(t))]));
const allHours = [...new Set(union.map(t => Math.floor(t/3600000)*3600000))];
const incompleteHours = allHours.filter(h => SYMBOLS.some(s => [0,1,2,3].some(i => !sets[s].has(h+i*M15))));
const report = {
  sha256: createHash('sha256').update(bytes).digest('hex'), inputHash: prepared.inputHash,
  requested: { from: iso(from), toExclusive: iso(to), warmupFrom: iso(warmupFrom) },
  actual: { commonFrom: iso(prepared.commonFrom), commonToExclusive: iso(prepared.commonTo), scoringFrom: iso(prepared.from), scoringToExclusive: iso(prepared.to) },
  safety: input.safety,
  pairs: Object.fromEntries(SYMBOLS.map(s => {
    const raw = input.pairs[s].candles, kept = prepared.pairs[s].candles;
    if (raw.some(c => c.time < warmupFrom || c.time + M15 > to)) throw new Error(`OUT_OF_REQUEST_RANGE_${s}`);
    const warmupHours = new Set(kept.filter(c => c.time < from).map(c => Math.floor(c.time/3600000))).size;
    if (warmupHours < 250) throw new Error(`WARMUP_INCOMPLETE_${s}`);
    return [s, { rawBars: raw.length, retainedBars: kept.length, first: iso(raw[0].time), lastClose: iso(raw.at(-1).time+M15), warmupHours, removedBars: raw.length-kept.length, missingAgainstUnion: rawMissing[s].length, missingTimes: rawMissing[s].map(iso) }];
  })),
  incompleteHours: incompleteHours.map(iso), commonGaps: gaps,
  calendar: { complete: input.calendar.complete, reviewedAt: input.calendar.reviewedAt, events: input.calendar.blackouts.length, counts: Object.fromEntries(input.calendar.coverage.map(c => [c.event, input.calendar.blackouts.filter(b => b.event === c.event).length])) },
  note: 'Structural validation passed. Common gaps and boundary closures require review; no missing candles are synthesized.'
};
await fs.writeFile(file.replace(/\.json$/, '.audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, pairs: Object.fromEntries(Object.entries(report.pairs).map(([s,{missingTimes,...v}])=>[s,v])), incompleteHours: report.incompleteHours.length, commonGaps: report.commonGaps.length }, null, 2));

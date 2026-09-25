// Summarizes run.sh output: per workload and number of concurrent copies, the per-copy medians
// against the medians of the runs alone. Usage: node summarize.mjs OUT_DIR
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

import {isContended} from '../../../src/bench/contention.js';

const out = process.argv[2];
if (!out) throw new TypeError('usage: node summarize.mjs OUT_DIR');

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const groups = new Map();
for (const name of readdirSync(out)) {
  const match = /^(\w+)-k(\d+)-r\d+-c\d+\.json$/.exec(name);
  if (!match) continue;
  const [, workload, k] = match,
    data = JSON.parse(readFileSync(path.join(out, name), 'utf8')),
    series = data.results[0],
    key = `${workload}\t${k}`;
  if (!groups.has(key))
    groups.set(key, {workload, k: +k, medians: [], preempted: 0, samples: 0, warned: 0});
  const group = groups.get(key);
  group.medians.push(median(series.samples) * 1e6);
  group.preempted += series.contention?.preempted ?? 0;
  group.samples += series.contention?.samples ?? 0;
  if (isContended(series.contention)) ++group.warned;
}

const rows = [...groups.values()].sort((a, b) => a.workload.localeCompare(b.workload) || a.k - b.k);
console.log(
  'workload  k  copies  median ns  min–max ns        vs alone  above every alone  preempted  warned'
);
for (const g of rows) {
  const alone = groups.get(`${g.workload}\t1`),
    m = median(g.medians),
    ratio = m / median(alone.medians),
    above = g.medians.filter(x => x > Math.max(...alone.medians)).length;
  console.log(
    [
      g.workload.padEnd(8),
      String(g.k).padStart(2),
      String(g.medians.length).padStart(7),
      m.toFixed(2).padStart(10),
      `${Math.min(...g.medians).toFixed(2)}–${Math.max(...g.medians).toFixed(2)}`.padStart(17),
      `${ratio.toFixed(3)}×`.padStart(9),
      (g.k === 1 ? '-' : `${above} of ${g.medians.length}`).padStart(18),
      `${((100 * g.preempted) / Math.max(1, g.samples)).toFixed(1)}%`.padStart(9),
      `${g.warned} of ${g.medians.length}`.padStart(8)
    ].join('  ')
  );
}

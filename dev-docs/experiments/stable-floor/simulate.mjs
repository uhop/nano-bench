// Replays `nano-bench-io --stable` against collected populations: draws runs with replacement,
// checks the median CI width every 10 runs from the floor as collectMacro does, and records where
// each policy stops, whether its CI covers the population median, and how far its median is off.
// Progress goes to stderr. Usage: node simulate.mjs POPULATION.json... [--trials N] [--series NAME]
import {readFileSync} from 'node:fs';

import {bootstrapSummary} from '../../../src/stats.js';
import {mulberry32} from '../../../src/utils/prng.js';

const args = process.argv.slice(2),
  option = name => {
    const at = args.indexOf(name);
    return at >= 0 ? args.splice(at, 2)[1] : null;
  },
  trials = parseInt(option('--trials') ?? '1000'),
  only = option('--series'),
  files = args;
if (!files.length)
  throw new TypeError('usage: node simulate.mjs POPULATION.json... [--trials N] [--series NAME]');

const policies = [
    {name: 'floor 10', minRuns: 10, consecutive: 1},
    {name: 'floor 30', minRuns: 30, consecutive: 1},
    {name: 'two checks', minRuns: 10, consecutive: 2},
    {name: '30 + two', minRuns: 30, consecutive: 2}
  ],
  targets = [10, 5],
  fixedSizes = [10, 30, 100],
  checkEvery = 10,
  maxRuns = 300, // the CLI's cap is 1,000; runs that reach 300 count as capped
  seed = 1; // the CLI reuses one seed for every check of a run

const median = values => {
  const sorted = values.slice().sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const quantile = (values, q) =>
  values.slice().sort((a, b) => a - b)[Math.floor(q * (values.length - 1))];

const summarize = samples =>
  bootstrapSummary(samples, {alpha: 0.05, bootstrap: 1000, random: mulberry32(seed)});

const outcome = (samples, truth) => {
  const s = summarize(samples);
  return {
    n: samples.length,
    capped: samples.length >= maxRuns,
    covered: s.ciLo <= truth && truth <= s.ciHi,
    error: Math.abs(s.median - truth) / truth
  };
};

const stopping = (population, truth, target, policy, draw) => {
  const samples = [];
  let passed = 0;
  for (;;) {
    samples.push(population[Math.floor(draw() * population.length)]);
    const n = samples.length;
    if (n >= maxRuns) break;
    if (n < policy.minRuns || n % checkEvery) continue;
    const s = summarize(samples);
    passed = (100 * (s.ciHi - s.ciLo)) / s.median <= target ? passed + 1 : 0;
    if (passed >= policy.consecutive) break;
  }
  return outcome(samples, truth);
};

// the control: the same CI at a fixed number of runs, with no stopping rule
const fixed = (population, truth, n, draw) => {
  const samples = [];
  for (let i = 0; i < n; ++i) samples.push(population[Math.floor(draw() * population.length)]);
  return outcome(samples, truth);
};

const row = (label, target, name, outcomes) => {
  const ns = outcomes.map(o => o.n),
    share = test => `${((100 * outcomes.filter(test).length) / outcomes.length).toFixed(1)}%`;
  console.log(
    [
      label.padEnd(18),
      target.padStart(6),
      name.padEnd(11),
      String(quantile(ns, 0.1)).padStart(11),
      String(median(ns)).padStart(7),
      String(quantile(ns, 0.9)).padStart(5),
      share(o => o.capped).padStart(7),
      share(o => o.covered).padStart(8),
      `${(
        100 *
        quantile(
          outcomes.map(o => o.error),
          0.9
        )
      ).toFixed(1)}%`.padStart(10)
    ].join('  ')
  );
};

console.log(
  'population        target  policy       stop n: p10  median  p90   capped   covered  error p90'
);
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8')),
    label = file
      .split('/')
      .pop()
      .replace(/\.json$/, '');
  for (const series of data.results) {
    if (only && series.name !== only) continue;
    const population = series.samples,
      truth = median(population),
      name = `${label}/${series.name}`,
      rows = fixedSizes.length + targets.length * policies.length;
    let rowIndex = 0;
    const batch = (target, policyName, runOne) => {
      ++rowIndex;
      const draw = mulberry32(12345),
        outcomes = [];
      for (let t = 0; t < trials; ++t) {
        outcomes.push(runOne(draw));
        if ((t + 1) % 20 === 0)
          console.error(`${name}: row ${rowIndex} of ${rows}, trial ${t + 1} of ${trials}`);
      }
      row(name, target, policyName, outcomes);
    };
    for (const n of fixedSizes) batch('-', `fixed ${n}`, draw => fixed(population, truth, n, draw));
    for (const target of targets) {
      for (const policy of policies)
        batch(`${target}%`, policy.name, draw => stopping(population, truth, target, policy, draw));
    }
  }
}

import test from 'tape-six';

import {exactSummary, bootstrapSummary} from 'nano-benchmark/stats.js';
import {mulberry32} from 'nano-benchmark/utils/prng.js';

const ramp = n => {
  const data = [];
  for (let i = 1; i <= n; ++i) data.push(i);
  return data;
};

test('exactSummary()', t => {
  const data = ramp(100),
    before = data.join(','),
    s = exactSummary(data, {alpha: 0.05});
  t.ok(s.lo <= s.median && s.median <= s.hi, 'lo <= median <= hi');
  t.ok(s.median > 40 && s.median < 60, 'median near the middle');
  t.equal(data.join(','), before, 'input is not mutated');
  const again = exactSummary(data, {alpha: 0.05});
  t.ok(again.median === s.median && again.lo === s.lo && again.hi === s.hi, 'deterministic');
});

test('bootstrapSummary()', t => {
  const data = ramp(100);
  t.test('seeded → reproducible', t => {
    const a = bootstrapSummary(data, {bootstrap: 80, random: mulberry32(123)}),
      b = bootstrapSummary(data, {bootstrap: 80, random: mulberry32(123)});
    t.ok(a.median === b.median && a.lo === b.lo && a.hi === b.hi, 'same seed → identical summary');
  });
  t.test('ordered and finite', t => {
    const s = bootstrapSummary(data, {bootstrap: 80, random: mulberry32(7)});
    t.ok(s.lo <= s.median && s.median <= s.hi, 'lo <= median <= hi');
    t.ok(Number.isFinite(s.median) && Number.isFinite(s.lo) && Number.isFinite(s.hi), 'finite');
  });
  t.test('the median CI brackets the median inside the spread', t => {
    const s = bootstrapSummary(data, {bootstrap: 200, random: mulberry32(7)});
    t.ok(s.ciLo <= s.median && s.median <= s.ciHi, 'ciLo <= median <= ciHi');
    t.ok(s.lo < s.ciLo && s.ciHi < s.hi, 'the CI is inside the spread');
  });
  t.test('the median CI narrows with more runs; the spread does not', t => {
    const random = mulberry32(99),
      noisy = n => Array.from({length: n}, () => 100 + 20 * random()),
      width = (s, a, b) => (s[b] - s[a]) / s.median,
      small = bootstrapSummary(noisy(25), {bootstrap: 400, random: mulberry32(1)}),
      large = bootstrapSummary(noisy(1600), {bootstrap: 400, random: mulberry32(1)});
    t.ok(
      width(large, 'ciLo', 'ciHi') < width(small, 'ciLo', 'ciHi') / 4,
      '64× the runs: CI at least 4× narrower (√64 = 8)'
    );
    t.ok(
      width(large, 'lo', 'hi') > width(small, 'lo', 'hi') * 0.7,
      'the spread stays roughly the width of the data'
    );
  });
  t.test('pinned summary for a fixed seed (bit-identical across runtimes)', t => {
    const s = bootstrapSummary(ramp(20), {alpha: 0.05, bootstrap: 200, random: mulberry32(12345)});
    t.equal(s.median, 10.829999999999993, 'median');
    // re-pinned: the old 1.4499999999999955 was the sample minimum, not the 2.5th percentile
    t.equal(s.lo, 1.9344999999999952, 'lo');
    t.equal(s.hi, 19.03000000000003, 'hi');
  });
});

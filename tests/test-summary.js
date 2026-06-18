import test from 'tape-six';

import {exactSummary, bootstrapSummary} from 'nano-benchmark/stats.js';

const makeRandom = seed => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 0x100000000;
  };
};

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
    const a = bootstrapSummary(data, {bootstrap: 80, random: makeRandom(123)}),
      b = bootstrapSummary(data, {bootstrap: 80, random: makeRandom(123)});
    t.ok(a.median === b.median && a.lo === b.lo && a.hi === b.hi, 'same seed → identical summary');
  });
  t.test('ordered and finite', t => {
    const s = bootstrapSummary(data, {bootstrap: 80, random: makeRandom(7)});
    t.ok(s.lo <= s.median && s.median <= s.hi, 'lo <= median <= hi');
    t.ok(Number.isFinite(s.median) && Number.isFinite(s.lo) && Number.isFinite(s.hi), 'finite');
  });
});

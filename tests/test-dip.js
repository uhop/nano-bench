import test from 'tape-six';

import dipTest, {dipStatistic} from 'nano-benchmark/stats/dip.js';
import {mulberry32} from 'nano-benchmark/utils/prng.js';

test('dipStatistic()', t => {
  t.test('evenly spaced data sits at the 1/(2n) floor', t => {
    t.equal(dipStatistic(Array.from({length: 100}, (_, i) => i)), 0.005);
    t.equal(dipStatistic([1, 2, 3, 4]), 0.125);
  });

  t.test('tight bimodal approaches the 0.25 maximum', t => {
    const bimodal = [];
    for (let i = 0; i < 50; ++i) bimodal.push(i * 0.001, 10 + i * 0.001);
    t.ok(dipStatistic(bimodal.sort((a, b) => a - b)) > 0.2);
  });

  t.test('shift/scale invariant (up to float rounding)', t => {
    const x = [1, 2, 2.1, 2.2, 8, 8.1, 8.2, 9],
      y = x.map(v => v * 3 + 100);
    t.ok(Math.abs(dipStatistic(x) - dipStatistic(y)) < 1e-9);
  });

  t.test('edges', t => {
    t.equal(dipStatistic([]), 0);
    t.equal(dipStatistic([1, 2]), 0.25);
  });
});

test('dipTest()', t => {
  t.test('uniform data is not flagged', t => {
    const random = mulberry32(42),
      samples = Array.from({length: 200}, () => random());
    t.ok(dipTest(samples, {random: mulberry32(7)}).p > 0.05);
  });

  t.test('a sum-of-uniforms bell is not flagged', t => {
    const random = mulberry32(5),
      samples = Array.from({length: 150}, () => random() + random() + random() + random());
    t.ok(dipTest(samples, {random: mulberry32(7)}).p > 0.05);
  });

  t.test('separated bimodal is flagged', t => {
    const random = mulberry32(99),
      samples = [];
    for (let i = 0; i < 100; ++i) samples.push(random(), 5 + random());
    t.ok(dipTest(samples, {random: mulberry32(7)}).p < 0.05);
  });
});

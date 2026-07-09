import test from 'tape-six';

import detectWarmup from 'nano-benchmark/bench/warmup-detect.js';
import {mulberry32} from 'nano-benchmark/utils/prng.js';

const steady = (n, base, random) => Array.from({length: n}, () => base + random());

test('detectWarmup()', t => {
  t.test('steady data drops nothing', t => {
    t.equal(detectWarmup(steady(100, 10, mulberry32(1))), 0);
  });

  t.test('a slow head is detected and sized', t => {
    const random = mulberry32(2),
      samples = [...steady(10, 25, random), ...steady(90, 10, random)];
    const drop = detectWarmup(samples);
    t.ok(drop >= 10);
    t.ok(drop <= 15);
  });

  t.test('the drop is capped at a quarter of the runs', t => {
    const random = mulberry32(3),
      samples = Array.from({length: 100}, (_, i) => 30 - i * 0.2 + random());
    t.ok(detectWarmup(samples) <= 25);
  });

  t.test('a fast head is not warmup', t => {
    const random = mulberry32(4),
      samples = [...steady(10, 5, random), ...steady(90, 10, random)];
    t.equal(detectWarmup(samples), 0);
  });

  t.test('too few runs to judge', t => {
    t.equal(detectWarmup([30, 30, 30, 10, 10, 10, 10, 10, 10, 10]), 0);
  });
});

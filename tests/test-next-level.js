import test from 'tape-six';

import {nextLevel} from 'nano-benchmark/bench/runner.js';

test('nextLevel()', t => {
  t.test('from 1', t => {
    const result = [1];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
  });

  t.test('from 3', t => {
    const result = [3];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]);
  });

  t.test('from 11', t => {
    const result = [11];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [11, 22, 44, 88, 176, 352, 704, 1408, 2816, 5632]);
  });

  t.test('non-round ramp stays positive past 2^30 (float *2, not 32-bit <<)', t => {
    let n = 11,
      prev = 0,
      min = Infinity;
    for (let i = 0; i < 200 && n > prev; ++i) {
      min = Math.min(min, n);
      prev = n;
      n = nextLevel(n);
    }
    t.ok(min > 0, 'every level stayed positive (no 32-bit wrap)');
    t.ok(prev >= 2 ** 31, 'ramped past 2^31');
  });

  t.test('bounded by MAX_SAFE_INTEGER', t => {
    t.equal(nextLevel(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER, 'fixed point at the cap');
    t.ok(nextLevel(5e15) <= Number.MAX_SAFE_INTEGER, 'never exceeds the cap');
    let n = 1,
      steps = 0;
    while (nextLevel(n) > n && ++steps < 500) n = nextLevel(n);
    t.equal(n, Number.MAX_SAFE_INTEGER, 'ramp from 1 terminates exactly at the cap');
    t.ok(steps < 100, `in a bounded number of steps (${steps})`);
  });
});

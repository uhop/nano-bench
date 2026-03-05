import test from 'tape-six';

import {
  mean,
  variance,
  stdDev,
  zScore,
  makeZScoreFn,
  adjustedSkewness,
  skewness
} from 'nano-benchmark/stats.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('zScore()', t => {
  t.test('z-score of the mean is 0', t => {
    t.ok(approx(zScore(5, 5, 2), 0));
  });
  t.test('z-score one stdDev above mean is 1', t => {
    t.ok(approx(zScore(7, 5, 2), 1));
  });
  t.test('z-score one stdDev below mean is -1', t => {
    t.ok(approx(zScore(3, 5, 2), -1));
  });
});

test('makeZScoreFn()', t => {
  t.test('returns a function', t => {
    const fn = makeZScoreFn([1, 2, 3, 4, 5]);
    t.equal(typeof fn, 'function');
  });
  t.test('z-score of the mean is 0', t => {
    const data = [1, 2, 3, 4, 5];
    const fn = makeZScoreFn(data);
    t.ok(approx(fn(mean(data)), 0));
  });
  t.test('consistent with zScore', t => {
    const data = [10, 20, 30, 40, 50];
    const fn = makeZScoreFn(data);
    const m = mean(data);
    const s = stdDev(data);
    t.ok(approx(fn(25), zScore(25, m, s)));
  });
});

test('adjustedSkewness()', t => {
  t.test('symmetric data has zero adjusted skewness', t => {
    t.ok(approx(adjustedSkewness([1, 2, 3, 4, 5]), 0));
  });
  t.test('right-skewed data has positive adjusted skewness', t => {
    t.ok(adjustedSkewness([1, 1, 1, 1, 1, 1, 1, 10]) > 0);
  });
  t.test('same sign as unadjusted skewness', t => {
    const data = [1, 1, 1, 2, 5, 8, 12, 15, 20];
    const sk = skewness(data);
    const ask = adjustedSkewness(data);
    t.ok(sk * ask > 0);
  });
});

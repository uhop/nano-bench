import test from 'tape-six';

import ppf from 'nano-benchmark/stats/ppf.js';

const approx = (a, b, eps = 1e-2) => Math.abs(a - b) < eps;

test('ppf()', t => {
  t.test('uniform CDF: ppf at 0.5 returns midpoint', t => {
    const result = ppf(() => 1, 0.5, {a: 0, b: 1, initialValue: 0});
    t.ok(approx(result, 0.5));
  });

  t.test('uniform CDF: ppf at 0.25 returns quarter', t => {
    const result = ppf(() => 1, 0.25, {a: 0, b: 1, initialValue: 0});
    t.ok(approx(result, 0.25));
  });

  t.test('uniform CDF: ppf at 0.75 returns three-quarters', t => {
    const result = ppf(() => 1, 0.75, {a: 0, b: 1, initialValue: 0});
    t.ok(approx(result, 0.75));
  });

  t.test('ppf at boundaries', t => {
    const lo = ppf(() => 1, 0, {a: 0, b: 1, initialValue: 0});
    const hi = ppf(() => 1, 1, {a: 0, b: 1, initialValue: 0});
    t.ok(lo <= 0.01);
    t.ok(hi >= 0.99);
  });

  t.test('ppf is monotonic', t => {
    const v1 = ppf(() => 1, 0.2, {a: 0, b: 1, initialValue: 0});
    const v2 = ppf(() => 1, 0.5, {a: 0, b: 1, initialValue: 0});
    const v3 = ppf(() => 1, 0.8, {a: 0, b: 1, initialValue: 0});
    t.ok(v1 < v2);
    t.ok(v2 < v3);
  });
});

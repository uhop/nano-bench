import test from 'tape-six';

import {rk23} from 'nano-benchmark/utils/rk.js';

const approx = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

test('rk23()', t => {
  t.test('solves dy/dx = 1 (linear)', t => {
    const result = rk23(() => 1, {a: 0, b: 1, initialValue: 0});
    t.ok(approx(result.finalValue, 1, 1e-3));
  });

  t.test('solves dy/dx = 2x => y = x^2', t => {
    const result = rk23(x => 2 * x, {a: 0, b: 2, initialValue: 0});
    t.ok(approx(result.finalValue, 4, 1e-2));
  });

  t.test('solves dy/dx = y => y = e^x', t => {
    const result = rk23((_x, y) => y, {a: 0, b: 1, initialValue: 1});
    t.ok(approx(result.finalValue, Math.E, 1e-2));
  });

  t.test('returns ts and us arrays', t => {
    const result = rk23(() => 1, {a: 0, b: 1, initialValue: 0});
    t.ok(Array.isArray(result.ts));
    t.ok(Array.isArray(result.us));
    t.ok(result.ts.length > 1);
    t.equal(result.ts.length, result.us.length);
    t.ok(approx(result.ts[0], 0));
  });

  t.test('respects custom interval [a, b]', t => {
    const result = rk23(() => 1, {a: 2, b: 5, initialValue: 0});
    t.ok(approx(result.finalValue, 3, 1e-3));
  });
});

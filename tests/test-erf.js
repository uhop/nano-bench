import test from 'tape-six';

import erf from 'nano-benchmark/stats/erf.js';

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('erf()', t => {
  t.test('erf(0) = 0', t => {
    t.ok(approx(erf(0), 0));
  });

  t.test('erf(1) ≈ 0.842701', t => {
    t.ok(approx(erf(1), 0.842701, 1e-4));
  });

  t.test('erf(-1) ≈ -0.842701 (odd function)', t => {
    t.ok(approx(erf(-1), -0.842701, 1e-4));
  });

  t.test('erf(2) ≈ 0.995322', t => {
    t.ok(approx(erf(2), 0.995322, 1e-4));
  });

  t.test('erf(3) ≈ 0.999978', t => {
    t.ok(approx(erf(3), 0.999978, 1e-4));
  });

  t.test('odd symmetry: erf(-x) = -erf(x)', t => {
    for (const x of [0.5, 1, 1.5, 2]) {
      t.ok(approx(erf(-x), -erf(x)));
    }
  });
});

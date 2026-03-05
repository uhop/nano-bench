import test from 'tape-six';

import {normalCdf, normalPdf} from 'nano-benchmark/stats/normal.js';
import normalPpf from 'nano-benchmark/stats/normal-ppf.js';
import {zCdf, zPdf} from 'nano-benchmark/stats/z.js';
import zPpf from 'nano-benchmark/stats/z-ppf.js';
import {incompleteBeta, beta} from 'nano-benchmark/stats/beta.js';
import betaPpf from 'nano-benchmark/stats/beta-ppf.js';
import chiSquaredPpf from 'nano-benchmark/stats/chi-squared-ppf.js';
import {zeta} from 'nano-benchmark/stats/zeta.js';
import {logGamma} from 'nano-benchmark/stats/gamma.js';

const approx = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

test('normalCdf()', t => {
  t.test('normalCdf(0) = 0.5', t => {
    t.ok(approx(normalCdf(0), 0.5));
  });
  t.test('normalCdf(-Infinity) approaches 0', t => {
    t.ok(normalCdf(-6) < 0.001);
  });
  t.test('normalCdf(+Infinity) approaches 1', t => {
    t.ok(normalCdf(6) > 0.999);
  });
  t.test('normalCdf(1.96) ≈ 0.975', t => {
    t.ok(approx(normalCdf(1.96), 0.975, 1e-3));
  });
  t.test('custom mu and sigma', t => {
    t.ok(approx(normalCdf(10, 10, 1), 0.5));
  });
});

test('normalPdf()', t => {
  t.test('peak at mean', t => {
    const peak = normalPdf(0);
    t.ok(peak > normalPdf(1));
    t.ok(peak > normalPdf(-1));
  });
  t.test('symmetric', t => {
    t.ok(approx(normalPdf(1), normalPdf(-1)));
  });
});

test('normalPpf()', t => {
  t.test('normalPpf(0.5) = 0 for standard normal', t => {
    t.ok(approx(normalPpf(0.5), 0, 1e-3));
  });
  t.test('normalPpf(0.975) ≈ 1.96', t => {
    t.ok(approx(normalPpf(0.975), 1.96, 1e-2));
  });
  t.test('roundtrip: normalCdf(normalPpf(p)) ≈ p', t => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      t.ok(approx(normalCdf(normalPpf(p)), p, 1e-3));
    }
  });
});

test('zCdf()', t => {
  t.test('zCdf(0) = 0.5', t => {
    t.ok(approx(zCdf(0), 0.5));
  });
  t.test('matches normalCdf for standard normal', t => {
    for (const z of [-2, -1, 0, 1, 2]) {
      t.ok(approx(zCdf(z), normalCdf(z)));
    }
  });
});

test('zPdf()', t => {
  t.test('symmetric', t => {
    t.ok(approx(zPdf(1), zPdf(-1)));
  });
  t.test('peak at 0', t => {
    t.ok(zPdf(0) > zPdf(1));
  });
});

test('zPpf()', t => {
  t.test('zPpf(0.5) = 0', t => {
    t.ok(approx(zPpf(0.5), 0, 1e-3));
  });
  t.test('zPpf(0.025) ≈ -1.96', t => {
    t.ok(approx(zPpf(0.025), -1.96, 1e-2));
  });
  t.test('roundtrip: zCdf(zPpf(p)) ≈ p', t => {
    for (const p of [0.05, 0.1, 0.5, 0.9, 0.95]) {
      t.ok(approx(zCdf(zPpf(p)), p, 1e-3));
    }
  });
});

test('beta()', t => {
  t.test('beta(1, 1) ≈ 1', t => {
    t.ok(approx(beta(1, 1), 1, 2e-3));
  });
  t.test('beta(a, b) = beta(b, a)', t => {
    t.ok(approx(beta(2, 3), beta(3, 2), 1e-3));
  });
});

test('incompleteBeta()', t => {
  t.test('incompleteBeta(0, a, b) = 0', t => {
    t.ok(approx(incompleteBeta(0, 2, 3), 0));
  });
  t.test('incompleteBeta(1, 1, 1) = 1', t => {
    t.ok(approx(incompleteBeta(1, 1, 1), 1, 1e-3));
  });
});

test('betaPpf()', t => {
  t.test('betaPpf(0.5, 1, 1) = 0.5 (uniform)', t => {
    t.ok(approx(betaPpf(0.5, 1, 1), 0.5, 1e-2));
  });
  t.test('betaPpf returns value in [0, 1]', t => {
    const v = betaPpf(0.95, 2, 5);
    t.ok(v >= 0 && v <= 1);
  });
});

test('chiSquaredPpf()', t => {
  t.test('monotonic in probability', t => {
    const lo = chiSquaredPpf(0.5, 4);
    const hi = chiSquaredPpf(0.95, 4);
    t.ok(hi > lo);
  });
  t.test('returns value in [0, 1]', t => {
    const v = chiSquaredPpf(0.95, 4);
    t.ok(v >= 0 && v <= 1);
  });
});

test('zeta()', t => {
  t.test('zeta(2, 1) = pi^2/6 ≈ 1.6449', t => {
    t.ok(approx(zeta(2, 1), (Math.PI * Math.PI) / 6, 1e-3));
  });
});

test('logGamma()', t => {
  t.test('logGamma(1) = 0 (since gamma(1) = 1)', t => {
    t.ok(approx(logGamma(1), 0, 1e-2));
  });
  t.test('logGamma(2) = 0 (since gamma(2) = 1)', t => {
    t.ok(approx(logGamma(2), 0, 1e-2));
  });
});

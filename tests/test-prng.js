import test from 'tape-six';

import {mulberry32} from 'nano-benchmark/utils/prng.js';

test('mulberry32()', t => {
  t.test('known sequence (pins cross-runtime stability)', t => {
    const r = mulberry32(1);
    t.equal(r(), 0.6270739405881613);
    t.equal(r(), 0.002735721180215478);
    t.equal(r(), 0.5274470399599522);
  });
  t.test('deterministic for a given seed', t => {
    const a = mulberry32(42),
      b = mulberry32(42);
    t.ok(a() === b() && a() === b() && a() === b(), 'same seed → same sequence');
  });
  t.test('distinct seeds diverge', t => {
    t.ok(mulberry32(1)() !== mulberry32(2)(), 'different seeds → different first value');
  });
  t.test('range [0, 1)', t => {
    const r = mulberry32(12345);
    let ok = true;
    for (let i = 0; i < 1000; ++i) {
      const v = r();
      if (v < 0 || v >= 1) ok = false;
    }
    t.ok(ok, 'all draws in [0, 1)');
  });
});

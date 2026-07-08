import test from 'tape-six';

import quantileSorted from 'nano-benchmark/stats/quantile.js';

test('quantileSorted()', t => {
  t.test('median of odd/even sets', t => {
    t.equal(quantileSorted([1, 2, 3, 4, 5], 0.5), 3);
    t.equal(quantileSorted([1, 2, 3, 4], 0.5), 2.5);
  });

  t.test('R-7 interpolation', t => {
    t.equal(quantileSorted([1, 2, 3, 4, 5], 0.9), 4.6);
    t.equal(quantileSorted([10, 20], 0.25), 12.5);
  });

  t.test('edges', t => {
    t.equal(quantileSorted([7], 0.99), 7);
    t.equal(quantileSorted([1, 2, 3], 0), 1);
    t.equal(quantileSorted([1, 2, 3], 1), 3);
    t.ok(isNaN(quantileSorted([], 0.5)));
  });
});

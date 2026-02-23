import test from 'tape-six';

import mwtest from 'nano-benchmark/significance/mwtest.js';
import kwtest from 'nano-benchmark/significance/kwtest.js';
import kstest from 'nano-benchmark/significance/kstest.js';

const sort = arr => arr.slice().sort((a, b) => a - b);
const approx = (a, b, eps = 1e-2) => Math.abs(a - b) < eps;

test('mwtest()', t => {
  t.test('Wikipedia tortoises vs hares — not significant', t => {
    const result = mwtest(sort([6, 1, 1, 1, 1, 1]), sort([5, 5, 5, 5, 5, 0]), 0.05);
    t.equal(result.different, false);
  });

  t.test('clearly different samples — significant', t => {
    const result = mwtest(sort([1, 2, 3, 4, 5]), sort([100, 200, 300, 400, 500]), 0.05);
    t.equal(result.different, true);
  });

  t.test('identical samples — not significant', t => {
    const result = mwtest(sort([5, 5, 5, 5, 5]), sort([5, 5, 5, 5, 5]), 0.05);
    t.equal(result.different, false);
  });

  t.test('BU example — significant', t => {
    const result = mwtest(
      sort([8, 7, 6, 2, 5, 8, 7, 3]),
      sort([9, 9, 7, 8, 10, 9, 6]),
      0.05
    );
    t.equal(result.different, true);
  });
});

test('kwtest()', t => {
  t.test('statisticshowto example — significant', t => {
    const result = kwtest(
      [sort([23, 41, 54, 66, 90]), sort([45, 55, 60, 70, 72]), sort([20, 30, 34, 40, 44])],
      0.05
    );
    t.equal(result.different, true);
    t.ok(approx(result.value, 6.72, 0.1));
  });

  t.test('identical groups — not significant', t => {
    const result = kwtest(
      [sort([5, 5, 5, 5, 5]), sort([5, 5, 5, 5, 5]), sort([5, 5, 5, 5, 5])],
      0.05
    );
    t.equal(result.different, false);
  });

  t.test('post-hoc groupDifference matrix is symmetric', t => {
    const result = kwtest(
      [sort([1, 2, 3, 4, 5]), sort([50, 60, 70, 80, 90]), sort([1, 2, 3, 4, 5])],
      0.05
    );
    if (result.different && result.groupDifference) {
      const m = result.groupDifference;
      for (let i = 0; i < m.length; ++i) {
        for (let j = i + 1; j < m.length; ++j) {
          t.equal(m[i][j], m[j][i]);
        }
      }
    }
  });

  t.test('throws with fewer than 2 groups', t => {
    t.throws(() => kwtest([sort([1, 2, 3])], 0.05));
  });
});

test('kstest()', t => {
  t.test('identical samples — not significant', t => {
    const data = sort([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = kstest(data, data, 0.05);
    t.equal(result.different, false);
    t.equal(result.value, 0);
  });

  t.test('clearly different distributions — significant', t => {
    const result = kstest(
      sort([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      sort([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]),
      0.05
    );
    t.equal(result.different, true);
    t.equal(result.value, 1);
  });

  t.test('statext example', t => {
    const result = kstest(
      sort([
        497, 839, 798, 892, 1585, 755, 388, 617, 248, 1641, 1180, 619, 253, 661, 1981, 1746,
        1865, 238, 1199, 1524
      ]),
      sort([
        820, 184, 921, 488, 721, 614, 801, 396, 864, 845, 404, 781, 457, 1029, 1047, 552, 718,
        495, 382, 1090
      ]),
      0.05
    );
    t.equal(typeof result.different, 'boolean');
    t.ok(result.value >= 0 && result.value <= 1);
  });
});

import test from 'tape-six';

import rank, {getTotal} from 'nano-benchmark/stats/rank.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('getTotal()', t => {
  t.test('sums group lengths', t => {
    t.equal(getTotal([[1, 2], [3, 4, 5], [6]]), 6);
  });
  t.test('empty groups', t => {
    t.equal(getTotal([[], []]), 0);
  });
});

test('rank()', t => {
  t.test('no ties', t => {
    const result = rank([[1, 3], [2, 4]]);
    t.equal(result.N, 4);
    t.equal(result.k, 2);
    t.ok(approx(result.avgRank, 2.5));
    const ranks = result.ranked.map(r => r.rank);
    t.deepEqual(ranks, [1, 2, 3, 4]);
  });

  t.test('with ties', t => {
    const result = rank([[1, 2], [2, 3]]);
    const ranks = result.ranked.map(r => r.rank);
    // sorted: 1, 2, 2, 3 => ranks: 1, 2.5, 2.5, 4
    t.deepEqual(ranks, [1, 2.5, 2.5, 4]);
  });

  t.test('all tied', t => {
    const result = rank([[5, 5], [5, 5]]);
    const ranks = result.ranked.map(r => r.rank);
    t.deepEqual(ranks, [2.5, 2.5, 2.5, 2.5]);
  });

  t.test('group ranks sum correctly', t => {
    const result = rank([[1, 3, 5], [2, 4, 6]]);
    // group 0 ranks: 1+3+5 = 9, group 1 ranks: 2+4+6 = 12
    t.ok(approx(result.groupRank[0], 9));
    t.ok(approx(result.groupRank[1], 12));
  });
});

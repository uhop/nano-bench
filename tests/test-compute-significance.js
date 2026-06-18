import test from 'tape-six';

import {computeSignificance, significanceMatrix} from 'nano-benchmark/bench/significance.js';

const a = [],
  b = [],
  c = [];
for (let i = 1; i <= 10; ++i) {
  a.push(i);
  b.push(i);
  c.push(100 + i);
}

test('computeSignificance()', t => {
  t.test('two identical series → mann-whitney, not different', t => {
    const r = computeSignificance([a, b], 0.05);
    t.equal(r.test, 'mann-whitney-u', 'names the test');
    t.equal(r.different, false, 'identical samples are not different');
    t.equal(r.groupDifference, undefined, 'no matrix for the pair case');
  });
  t.test('two separated series → different', t => {
    const r = computeSignificance([a, c], 0.05);
    t.equal(r.test, 'mann-whitney-u');
    t.equal(r.different, true, 'well-separated samples differ');
  });
  t.test('three series → kruskal-wallis', t => {
    const r = computeSignificance([a, b, c], 0.05);
    t.equal(r.test, 'kruskal-wallis', 'names the test');
    t.ok('value' in r && 'limit' in r, 'has the statistic and critical value');
  });
  t.test('does not mutate inputs', t => {
    const x = [5, 3, 1, 4, 2],
      before = x.join(',');
    computeSignificance([x, c], 0.05);
    t.equal(x.join(','), before, 'inputs untouched');
  });
});

test('significanceMatrix()', t => {
  t.test('null when not different', t => {
    t.equal(significanceMatrix({different: false}), null);
  });
  t.test('fabricated 2×2 for a different pair', t => {
    const m = significanceMatrix({different: true});
    t.ok(m[0][1] === true && m[1][0] === true && m[0][0] === false, '2×2 off-diagonal true');
  });
  t.test('passes through groupDifference', t => {
    const gd = [
      [false, true],
      [true, false]
    ];
    t.equal(significanceMatrix({different: true, groupDifference: gd}), gd, 'uses post-hoc matrix');
  });
});

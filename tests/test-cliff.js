import test from 'tape-six';

import cliffDelta, {effectMagnitude} from 'nano-benchmark/significance/cliff.js';
import mwtest from 'nano-benchmark/significance/mwtest.js';

const bruteForce = (a, b) => {
  let sum = 0;
  for (const x of a) for (const y of b) sum += Math.sign(x - y);
  return sum / (a.length * b.length);
};

test('cliffDelta()', t => {
  t.equal(cliffDelta([1, 2, 3], [4, 5, 6]), -1, 'every x below every y');
  t.equal(cliffDelta([4, 5, 6], [1, 2, 3]), 1, 'every x above every y');
  t.equal(cliffDelta([1, 2, 3], [1, 2, 3]), 0, 'identical samples');
  t.equal(cliffDelta([], [1]), 0, 'an empty sample');
  t.equal(cliffDelta([2, 2, 2], [2, 2]), 0, 'all ties');

  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647,
    draw = (n, scale) =>
      Array.from({length: n}, () => Math.round(random() * scale)).sort((x, y) => x - y);
  for (let k = 0; k < 20; ++k) {
    const a = draw(5 + k, 10),
      b = draw(8 + 2 * k, 12);
    t.ok(Math.abs(cliffDelta(a, b) - bruteForce(a, b)) < 1e-12, `random samples with ties, ${k}`);
    t.ok(
      Math.abs(cliffDelta(a, b) - mwtest(a, b).delta) < 1e-12,
      `matches the Mann–Whitney delta, ${k}`
    );
  }
});

test('effectMagnitude()', t => {
  t.equal(effectMagnitude(0.1), 'negligible');
  t.equal(effectMagnitude(-0.2), 'small');
  t.equal(effectMagnitude(0.4), 'medium');
  t.equal(effectMagnitude(-0.9), 'large');
});

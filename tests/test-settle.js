import test from 'tape-six';

import settlePairs from 'nano-benchmark/bench/settle.js';
import {mulberry32} from 'nano-benchmark/utils/prng.js';

const around = (center, n, spread, random) =>
  Array.from({length: n}, () => center * (1 + spread * (random() - 0.5)));

test('settlePairs()', t => {
  const random = mulberry32(1),
    fast = around(10, 60, 0.02, random),
    slow = around(20, 60, 0.02, random),
    twin = around(10, 60, 0.02, random),
    near = around(10.4, 60, 0.02, random),
    noisy = around(11, 8, 1.5, random);
  const options = {threshold: 0.05, random: mulberry32(2), bootstrap: 500};

  let r = settlePairs([fast, slow], options);
  t.equal(r.pairs.length, 1);
  t.equal(r.pairs[0].state, 'faster', 'half the time: faster by at least 5%');
  t.ok(r.pairs[0].ratioHi < 1 / 1.05, 'the ratio CI sits below 1/1.05');
  t.ok(r.settled);

  r = settlePairs([slow, fast], options);
  t.equal(r.pairs[0].state, 'slower', 'the other way round');

  r = settlePairs([fast, twin], options);
  t.equal(r.pairs[0].state, 'equivalent', 'the same distribution: within 5%');

  r = settlePairs([fast, near], {...options, threshold: 0.01});
  t.equal(r.pairs[0].state, 'faster', '4% apart against a 1% threshold');

  r = settlePairs([fast, noisy], options);
  t.equal(r.pairs[0].state, 'unsettled', 'eight wildly spread runs settle nothing');
  t.notOk(r.settled);

  r = settlePairs([fast, slow, twin], options);
  t.deepEqual(
    r.pairs.map(pair => `${pair.i}${pair.j}:${pair.state}`),
    ['01:faster', '02:equivalent', '12:slower'],
    'every pair, in order'
  );
});

import test from 'tape-six';

import mad, {modifiedZ} from 'nano-benchmark/stats/mad.js';

test('mad()', t => {
  t.test('known vector', t => {
    t.equal(mad([1, 2, 3, 4, 5]), 1);
  });

  t.test('constant data has zero MAD', t => {
    t.equal(mad([5, 5, 5, 5]), 0);
  });

  t.test('modified z-score', t => {
    t.equal(modifiedZ(5, 3, 1), 0.6745 * 2);
    t.equal(modifiedZ(3, 3, 1), 0);
  });
});

import test from 'tape-six';

import {nextLevel} from 'nano-benchmark/bench/runner.js';

test('nextLevel()', t => {
  t.test('from 1', t => {
    const result = [1];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
  });

  t.test('from 3', t => {
    const result = [3];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]);
  });

  t.test('from 11', t => {
    const result = [11];

    while (result.length < 10) {
      result.push(nextLevel(result[result.length - 1]));
    }

    t.deepEqual(result, [11, 22, 44, 88, 176, 352, 704, 1408, 2816, 5632]);
  });
});

import test from 'tape-six';

import {median} from 'nano-benchmark/median.js';

test('median()', t => {
  t.test('single element', t => {
    t.equal(median([42]), 42);
  });

  t.test('three elements already sorted', t => {
    t.equal(median([1, 2, 3]), 2);
  });

  t.test('three elements reverse sorted', t => {
    t.equal(median([3, 2, 1]), 2);
  });

  t.test('three elements unsorted', t => {
    t.equal(median([3, 1, 2]), 2);
  });

  t.test('result is a value from the input', t => {
    const data = [9, 1, 5, 3, 7];
    const result = median(data);
    t.ok(data.includes(result));
  });

  t.test('uniform values', t => {
    t.equal(median([7, 7, 7, 7, 7, 7, 7, 7, 7]), 7);
  });
});

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

  t.test('two elements', t => {
    const data = [10, 20];
    const result = median(data);
    t.ok(data.includes(result));
  });

  t.test('even-length array', t => {
    const data = [4, 2, 6, 8];
    const result = median(data);
    t.ok(data.includes(result));
  });

  t.test('larger array returns a value from input', t => {
    const data = [15, 3, 9, 21, 7, 12, 18, 1, 6, 24, 30, 2, 11, 5, 27];
    const original = data.slice();
    const result = median(data);
    t.ok(original.includes(result));
  });

  t.test('descending sequence', t => {
    const data = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    const result = median(data);
    t.ok(result >= 1 && result <= 9);
  });
});

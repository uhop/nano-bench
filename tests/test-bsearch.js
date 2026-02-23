import test from 'tape-six';

import bsearch from 'nano-benchmark/utils/bsearch.js';

test('bsearch()', t => {
  t.test('finds insertion point in sorted array', t => {
    const arr = [10, 20, 30, 40, 50];
    t.equal(bsearch(arr, x => x < 25), 2);
    t.equal(bsearch(arr, x => x < 35), 3);
  });

  t.test('value below all elements', t => {
    const arr = [10, 20, 30];
    t.equal(bsearch(arr, x => x < 5), 0);
  });

  t.test('value above all elements', t => {
    const arr = [10, 20, 30];
    t.equal(bsearch(arr, x => x < 35), 3);
  });

  t.test('exact match returns index after matching run', t => {
    const arr = [10, 20, 30, 40, 50];
    t.equal(bsearch(arr, x => x < 30), 2);
  });

  t.test('empty array', t => {
    t.equal(bsearch([], x => x < 5), 0);
  });

  t.test('single element — less', t => {
    t.equal(bsearch([10], x => x < 5), 0);
  });

  t.test('single element — greater', t => {
    t.equal(bsearch([10], x => x < 15), 1);
  });
});

import test from 'tape-six';

import outlierNotes from 'nano-benchmark/bench/outlier-notes.js';

test('outlierNotes()', t => {
  t.test('clean data has no note', t => {
    const {outliers, note} = outlierNotes([10, 11, 9, 10.5, 9.5, 10.2, 9.8]);
    t.deepEqual(outliers, []);
    t.equal(note, '');
  });

  t.test('constant data (zero MAD) has no note', t => {
    const {outliers, note} = outlierNotes([10, 10, 10, 10, 100]);
    t.deepEqual(outliers, []);
    t.equal(note, '');
  });

  t.test('slow first run suggests caching', t => {
    const {outliers, note} = outlierNotes([100, 10, 11, 9, 10.5, 9.5, 10, 11.2, 9.8, 10.1]);
    t.deepEqual(outliers, [0]);
    t.ok(/caching/.test(note));
    t.ok(/--warmup/.test(note));
  });

  t.test('scattered slow runs suggest interference', t => {
    const {outliers, note} = outlierNotes([10, 11, 9, 100, 10, 9.5, 11, 10, 105, 10.2]);
    t.deepEqual(outliers, [3, 8]);
    t.ok(/interference/.test(note));
  });

  t.test('fast outliers are ignored', t => {
    const {outliers, note} = outlierNotes([10, 11, 9, 0.1, 10.5, 9.5, 10, 11.2, 9.8, 10.1]);
    t.deepEqual(outliers, []);
    t.equal(note, '');
  });
});

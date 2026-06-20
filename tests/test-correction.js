import test from 'tape-six';

import {correctPairwise, corrections} from 'nano-benchmark/significance/correction.js';

test('correctPairwise()', t => {
  t.test('corrections list', t => {
    t.deepEqual(corrections, ['none', 'holm', 'bonferroni']);
  });

  t.test('all statistics far past every threshold → all reject', t => {
    const stats = [8, 6, 5];
    for (const method of corrections) {
      t.deepEqual(correctPairwise(stats, 0.05, method), [true, true, true], method);
    }
  });

  t.test('borderline family — power ordering bonferroni ⊆ holm ⊆ none', t => {
    const stats = [2.5, 2.3, 1.9],
      none = correctPairwise(stats, 0.05, 'none'),
      holm = correctPairwise(stats, 0.05, 'holm'),
      bonf = correctPairwise(stats, 0.05, 'bonferroni');
    t.deepEqual(none, [true, true, false], 'none rejects on the raw α');
    t.deepEqual(holm, [true, true, false], 'holm matches none here');
    t.deepEqual(bonf, [true, false, false], 'bonferroni is the most conservative');
    for (let i = 0; i < stats.length; ++i) {
      t.ok(!bonf[i] || holm[i], 'every bonferroni rejection is a holm rejection');
      t.ok(!holm[i] || none[i], 'every holm rejection is a none rejection');
    }
  });

  t.test("holm step-down halts: a blocked middle stat drops the tail below none's set", t => {
    const stats = [2.5, 2.2, 2.0];
    t.deepEqual(correctPairwise(stats, 0.05, 'none'), [true, true, true]);
    t.deepEqual(correctPairwise(stats, 0.05, 'holm'), [true, false, false]);
    t.deepEqual(correctPairwise(stats, 0.05, 'bonferroni'), [true, false, false]);
  });

  t.test('holm preserves input order in the returned flags', t => {
    const stats = [1.9, 2.5, 2.3];
    t.deepEqual(correctPairwise(stats, 0.05, 'holm'), [false, true, true]);
  });

  t.test('single comparison — all methods equivalent to the raw α', t => {
    for (const method of corrections) {
      t.deepEqual(correctPairwise([2.5], 0.05, method), [true], method);
      t.deepEqual(correctPairwise([1.5], 0.05, method), [false], method);
    }
  });

  t.test('defaults to holm', t => {
    const stats = [2.5, 2.2, 2.0];
    t.deepEqual(correctPairwise(stats, 0.05), correctPairwise(stats, 0.05, 'holm'));
  });
});

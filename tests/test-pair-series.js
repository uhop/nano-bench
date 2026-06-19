import test from 'tape-six';

import {planComparison} from 'nano-benchmark/bench/pair-series.js';

const s = (name, tag) => ({name, tag, samples: []});

test('planComparison()', t => {
  t.test('paired: one block per name with ≥2 series', t => {
    const series = [
      s('plus', 'base'),
      s('template', 'base'),
      s('plus', 'new'),
      s('template', 'new')
    ];
    const {blocks, unpaired, degraded} = planComparison(series, {pooled: false});
    t.deepEqual(
      blocks.map(b => b.name),
      ['plus', 'template']
    );
    t.equal(blocks[0].members.length, 2);
    t.deepEqual(unpaired, []);
    t.notOk(degraded);
  });

  t.test('paired: a name appearing once goes to unpaired, not a block', t => {
    const series = [s('plus', 'base'), s('plus', 'new'), s('only', 'base')];
    const {blocks, unpaired} = planComparison(series, {pooled: false});
    t.deepEqual(
      blocks.map(b => b.name),
      ['plus']
    );
    t.deepEqual(unpaired, ['only']);
  });

  t.test('paired: 3+ versions of one name form a single k-way block', t => {
    const series = [s('plus', 'a'), s('plus', 'b'), s('plus', 'c')];
    const {blocks} = planComparison(series, {pooled: false});
    t.equal(blocks.length, 1);
    t.equal(blocks[0].members.length, 3);
  });

  t.test('paired with no shared names → degrades to one pooled block', t => {
    const series = [s('a', 'f1'), s('b', 'f2')];
    const {blocks, unpaired, degraded} = planComparison(series, {pooled: false});
    t.equal(blocks.length, 1);
    t.equal(blocks[0].name, null);
    t.equal(blocks[0].members.length, 2);
    t.deepEqual(unpaired, []);
    t.ok(degraded);
  });

  t.test('pooled: one block over all series, never degraded', t => {
    const series = [s('plus', 'base'), s('template', 'base'), s('plus', 'new')];
    const {blocks, unpaired, degraded} = planComparison(series, {pooled: true});
    t.equal(blocks.length, 1);
    t.equal(blocks[0].name, null);
    t.equal(blocks[0].members.length, 3);
    t.deepEqual(unpaired, []);
    t.notOk(degraded);
  });

  t.test('paired: preserves first-seen name order', t => {
    const series = [s('z', 'a'), s('z', 'b'), s('a', 'a'), s('a', 'b')];
    const {blocks} = planComparison(series, {pooled: false});
    t.deepEqual(
      blocks.map(b => b.name),
      ['z', 'a']
    );
  });
});

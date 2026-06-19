import test from 'tape-six';

import {computeHistograms, percentile} from 'nano-benchmark/bench/histogram.js';

const sum = a => a.reduce((x, y) => x + y, 0);

test('percentile()', t => {
  const s = [0, 1, 2, 3, 4];
  t.equal(percentile(s, 0), 0);
  t.equal(percentile(s, 1), 4);
  t.equal(percentile(s, 0.5), 2);
  t.equal(percentile(s, 0.25), 1);
});

test('computeHistograms()', t => {
  t.test('every sample lands in a bin or an outlier tail', t => {
    const samples = Array.from({length: 100}, (_, i) => i);
    const s = computeHistograms([samples], {clamp: 0.05}).series[0];
    t.equal(sum(s.counts) + (s.below?.count ?? 0) + (s.above?.count ?? 0), 100);
    t.ok(s.below && s.above, 'a p5/p95 clamp produces tails on both sides');
  });

  t.test('series share one range and bin count', t => {
    const h = computeHistograms([
      [1, 2, 3, 4, 5],
      [3, 4, 5, 6, 7]
    ]);
    t.equal(h.series.length, 2);
    t.equal(h.series[0].counts.length, h.k);
    t.equal(h.series[1].counts.length, h.k);
  });

  t.test('explicit bins honored, and capped by maxBins', t => {
    const samples = Array.from({length: 200}, (_, i) => i);
    t.equal(computeHistograms([samples], {bins: 10}).k, 10);
    t.equal(computeHistograms([samples], {bins: 999, maxBins: 32}).k, 32);
  });

  t.test('outlier counts and extents are reported', t => {
    const samples = [...Array(98).fill(10), 0.001, 9999];
    const s = computeHistograms([samples], {clamp: 0.01}).series[0];
    t.equal(s.below.count, 1);
    t.equal(s.below.min, 0.001);
    t.equal(s.above.count, 1);
    t.equal(s.above.max, 9999);
  });

  t.test('meanSparse flags a bimodal distribution, not a tight one', t => {
    const bimodal = [...Array(90).fill(10), ...Array(10).fill(100)];
    const tight = Array.from({length: 100}, (_, i) => 50 + (i % 5));
    t.ok(computeHistograms([bimodal]).series[0].meanSparse, 'mean falls in the empty valley');
    t.notOk(computeHistograms([tight]).series[0].meanSparse);
  });

  t.test('maxCount is the global peak across series', t => {
    const h = computeHistograms(
      [
        [1, 1, 1, 2],
        [1, 2, 3, 4]
      ],
      {bins: 4}
    );
    t.equal(h.maxCount, Math.max(...h.series.flatMap(s => s.counts)));
  });
});

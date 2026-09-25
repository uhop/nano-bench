import test from 'tape-six';

import {violinSvg} from 'nano-benchmark/bench/render/svg-violin.js';
import {distributionSvg} from 'nano-benchmark/bench/render/svg-distribution.js';
import {computeHistograms} from 'nano-benchmark/bench/histogram.js';
import {kdeDensity} from 'nano-benchmark/stats/kde-modes.js';

const around = (center, n) => Array.from({length: n}, (_, i) => center + (i % 7) - 3);

test('kdeDensity()', t => {
  const peaked = [...Array(20).fill(10), ...Array(10).fill(9), ...Array(10).fill(11), 8, 8, 12, 12],
    sorted = peaked.sort((a, b) => a - b),
    {lo, step, density, h} = kdeDensity(sorted, {grid: 64});
  t.equal(density.length, 64);
  t.ok(h > 0, 'a positive bandwidth');
  const peak = density.indexOf(Math.max(...density));
  t.ok(Math.abs(lo + peak * step - 10) < 0.5, 'the peak sits at the mode');
  t.ok(kdeDensity([5, 5, 5]).h > 0, 'identical values still get a bandwidth');
  const fixed = kdeDensity(sorted, {grid: 11, lo: 0, hi: 20});
  t.equal(fixed.lo, 0);
  t.equal(fixed.step, 2, 'a given range sets the grid');
});

test('violinSvg()', t => {
  const svg = violinSvg({
    names: ['a', 'b'],
    samples: [around(10, 40), around(20, 40)],
    stats: [
      {median: 10, lo: 7, hi: 13, ciLo: 9.5, ciHi: 10.5},
      {median: 20, lo: 17, hi: 23, ciLo: 19.5, ciHi: 20.5}
    ],
    formatTicks: ticks => ticks.map(String),
    width: 600
  });
  t.ok(svg.startsWith('<svg class="dist violin"'));
  t.equal(svg.match(/class="violin-body"/g).length, 2, 'one body per series');
  t.equal(svg.match(/class="median"/g).length, 2);
  t.notOk(svg.includes('NaN'), 'no NaN coordinates');
});

test('distributionSvg() binClass', t => {
  const hist = computeHistograms([around(10, 40)], {bins: 8, maxBins: 8}),
    svg = distributionSvg({
      names: ['a'],
      hist,
      stats: [{median: 10, lo: 7, hi: 13}],
      formatTicks: ticks => ticks.map(String),
      describeBin: () => '',
      binClass: (i, j) => (j < 4 ? '' : 'cluster-1')
    });
  t.ok(svg.includes('class="bar cluster-1"'), 'the extra class lands on a bar');
  t.ok(svg.includes('class="bar"'), 'bars without one keep the plain class');
});

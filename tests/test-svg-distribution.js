import test from 'tape-six';

import {computeHistograms} from 'nano-benchmark/bench/histogram.js';
import {
  distributionSvg,
  escapeXml,
  logTicks,
  niceTicks
} from 'nano-benchmark/bench/render/svg-distribution.js';

const count = (s, re) => (s.match(re) ?? []).length;

const render = (arrays, options = {}) => {
  const hist = computeHistograms(arrays, {bins: 10}),
    names = options.names ?? arrays.map((_, i) => 'series ' + i);
  return {
    hist,
    svg: distributionSvg({
      names,
      hist,
      stats: arrays.map(a => ({median: a[a.length >> 1], lo: a[0], hi: a[a.length - 1]})),
      formatTicks: ticks => ticks.map(String),
      describeBin: (i, j) => `bin ${i}/${j}`,
      ...options
    })
  };
};

test('niceTicks()', t => {
  t.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  t.deepEqual(niceTicks(0.13, 0.52, 4), [0.2, 0.3, 0.4, 0.5]);
  t.deepEqual(niceTicks(5, 5), [5], 'an empty span yields its only value');
  for (const [lo, hi] of [
    [1e-7, 3e-7],
    [123, 9876]
  ]) {
    const ticks = niceTicks(lo, hi);
    t.ok(ticks.length >= 2, `at least two ticks in [${lo}, ${hi}]`);
    t.ok(
      ticks.every(v => v >= lo && v <= hi),
      `all ticks inside [${lo}, ${hi}]`
    );
  }
});

test('logTicks()', t => {
  t.deepEqual(
    logTicks(0, 2, 10).map(p => +(10 ** p).toPrecision(6)),
    [1, 2, 5, 10, 20, 50, 100],
    '1-2-5 per decade'
  );
  t.deepEqual(
    logTicks(0, 6, 3).map(p => Math.round(p)),
    [0, 1, 2, 3, 4, 5, 6],
    'crowded spans thin to decades'
  );
  const narrow = logTicks(Math.log10(3), Math.log10(4));
  t.ok(narrow.length >= 2, 'a span inside one decade falls back to linear nice ticks');
  t.ok(narrow.every(p => p >= Math.log10(3) - 1e-9 && p <= Math.log10(4) + 1e-9));
});

test('escapeXml()', t => {
  t.equal(escapeXml(`a<b>&"c"'`), 'a&lt;b&gt;&amp;&quot;c&quot;&#39;');
});

test('distributionSvg()', t => {
  const a = [1, 2, 2, 3, 3, 3, 4, 4, 5],
    b = [4, 5, 5, 6, 6, 6, 7, 7, 8];

  t.test('one row per series, one hit target per bin', t => {
    const {svg, hist} = render([a, b]);
    t.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    t.equal(count(svg, /<g class="row">/g), 2);
    t.equal(count(svg, /class="hit"/g), 2 * hist.k);
    const nonEmpty = hist.series.flatMap(s => s.counts).filter(c => c > 0).length;
    t.equal(count(svg, /class="bar"/g), nonEmpty, 'a bar for every non-empty bin');
    t.equal(count(svg, /class="median"/g), 2);
    t.equal(count(svg, /class="ci"/g), 2);
  });

  t.test('names and tooltips are escaped', t => {
    const {svg} = render([a], {names: ['<script>&']});
    t.ok(svg.includes('&lt;script&gt;&amp;'));
    t.notOk(svg.includes('<script>'));
    t.ok(svg.includes('<title>bin 0/0</title>'));
  });

  t.test('given ticks replace the computed ones', t => {
    const {svg} = render([a], {ticks: [2, 4], formatTicks: ticks => ticks.map(v => `t${v}`)});
    t.equal(count(svg, /class="tick-label"/g), 2);
    t.ok(svg.includes('>t2<') && svg.includes('>t4<'));
  });

  t.test('narrow widths put labels above the rows', t => {
    const wide = render([a, b], {width: 800}).svg,
      narrow = render([a, b], {width: 360}).svg;
    t.ok(/class="label"[^>]*text-anchor="end"/.test(wide), 'wide: right-aligned gutter labels');
    t.notOk(/class="label"[^>]*text-anchor="end"/.test(narrow), 'narrow: no gutter labels');
    const height = s => +s.match(/height="(\d+)"/)[1];
    t.ok(height(narrow) > height(wide), 'narrow rows are taller by the label line');
  });
});

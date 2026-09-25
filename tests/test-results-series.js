import test from 'tape-six';

import {
  buildSeries,
  comparisonArrays,
  fileTag,
  isolationWarning,
  multimodalityP,
  resultsWarnings
} from 'nano-benchmark/bench/results/series.js';

const samples = (base, n = 40) => Array.from({length: n}, (_, i) => base + (i % 7) * 0.01);

const makeFile = (file, {label, env = {}, params = {}, series}) => ({
  file,
  results: {
    schemaVersion: 1,
    ...(label ? {label} : {}),
    environment: {runtime: {name: 'node', version: '26.0.0'}, ...env},
    params: {alpha: 0.05, samples: 40, bootstrap: 200, seed: 7, ...params},
    results: series.map(([name, base, bodyHash = 'sha256:x']) => ({
      name,
      reps: 1000,
      bodyHash,
      samples: samples(base)
    }))
  }
});

test('fileTag()', t => {
  t.equal(fileTag(makeFile('runs/base.json', {series: []})), 'base');
  t.equal(fileTag(makeFile('C:\\runs\\win.json', {series: []})), 'win');
  t.equal(fileTag(makeFile('a.json', {label: 'v2', series: []})), 'v2', 'a label wins');
});

test('buildSeries()', t => {
  t.test('names shared across files are qualified by the file tag', t => {
    const files = [
        makeFile('base.json', {
          series: [
            ['a', 1],
            ['b', 2]
          ]
        }),
        makeFile('next.json', {series: [['a', 1.5]]})
      ],
      series = buildSeries(files, {alpha: 0.05});
    t.deepEqual(
      series.map(s => s.label),
      ['base/a', 'b', 'next/a']
    );
    t.deepEqual(
      series.map(s => s.tag),
      ['base', 'base', 'next']
    );
  });

  t.test('summaries are reproducible from the recorded seed', t => {
    const files = [
        makeFile('base.json', {
          series: [
            ['a', 1],
            ['b', 2]
          ]
        })
      ],
      first = buildSeries(files, {alpha: 0.05}),
      second = buildSeries(files, {alpha: 0.05});
    t.deepEqual(
      first.map(s => s.summary),
      second.map(s => s.summary)
    );
    t.ok(first[0].summary.lo <= first[0].summary.median);
    t.ok(first[0].summary.median <= first[0].summary.hi);
  });

  t.test('a different seed gives a different bootstrap', t => {
    const a = buildSeries([makeFile('x.json', {series: [['a', 1]]})], {alpha: 0.05}),
      b = buildSeries([makeFile('x.json', {params: {seed: 8}, series: [['a', 1]]})], {
        alpha: 0.05
      });
    t.notDeepEqual(a[0].summary, b[0].summary);
  });
});

test('resultsWarnings()', t => {
  t.test('a single file warns about nothing', t => {
    t.deepEqual(resultsWarnings([makeFile('a.json', {series: [['a', 1]]})]), []);
  });

  t.test('environment, parameters, and function bodies are compared', t => {
    const warnings = resultsWarnings([
      makeFile('a.json', {series: [['f', 1, 'sha256:1']]}),
      makeFile('b.json', {
        env: {runtime: {name: 'node', version: '27.0.0'}},
        params: {samples: 60},
        series: [['f', 1, 'sha256:2']]
      })
    ]);
    t.ok(warnings.some(w => w.includes('runtime.version')));
    t.ok(warnings.some(w => w.includes('params.samples')));
    t.ok(warnings.some(w => w.includes('"f" body differs')));
    t.equal(warnings.length, 3);
  });
});

test('multimodalityP()', t => {
  const unimodal = samples(1, 100).sort((a, b) => a - b),
    bimodal = [...samples(1, 50), ...samples(3, 50)].sort((a, b) => a - b);
  t.ok(multimodalityP(bimodal, 1, 0) < 0.05, 'two separated clumps are flagged');
  t.equal(multimodalityP(unimodal, 1, 0), multimodalityP(unimodal, 1, 0), 'seeded: repeatable');
});

test('comparisonArrays()', t => {
  const pooled = [1, 2, 3, 10, 11, 12];
  t.deepEqual(
    comparisonArrays([
      {samples: pooled, processSizes: [3, 3]},
      {samples: pooled, processSizes: [2, 4]}
    ]),
    {
      arrays: [
        [2, 11],
        [1.5, 10.5]
      ],
      unit: 'process-medians'
    },
    'several processes each: per-process medians'
  );
  t.equal(
    comparisonArrays([
      {samples: pooled, processSizes: [6]},
      {samples: pooled, processSizes: [3, 3]}
    ]).unit,
    'samples',
    'a single-process series keeps the sample test'
  );
  t.equal(comparisonArrays([{samples: pooled}, {samples: pooled}]).unit, 'samples', 'older files');
  t.deepEqual(
    comparisonArrays([
      {samples: pooled, roundSize: 3},
      {samples: pooled, roundSize: 2}
    ]),
    {
      arrays: [
        [2, 11],
        [1.5, 6.5, 11.5]
      ],
      unit: 'round-medians'
    },
    'rounds of concurrent calls: per-round medians'
  );
  t.equal(
    comparisonArrays([
      {samples: pooled, roundSize: 3},
      {samples: pooled, roundSize: null}
    ]).unit,
    'samples',
    'a series without rounds keeps the sample test'
  );
});

test('buildSeries() roundSize', t => {
  const [withRounds] = buildSeries(
      [makeFile('a.json', {params: {parallel: 4}, series: [['f', 1]]})],
      {alpha: 0.05}
    ),
    [oneBurst] = buildSeries([makeFile('b.json', {params: {parallel: true}, series: [['f', 1]]})], {
      alpha: 0.05
    });
  t.equal(withRounds.roundSize, 4, '-p N stores N');
  t.equal(oneBurst.roundSize, null, 'an older -p file was one burst: no rounds');
});

test('isolationWarning()', t => {
  t.equal(isolationWarning(undefined, 50), null, 'not a browser run');
  t.equal(isolationWarning({crossOriginIsolated: true, timerResolutionMs: 0.005}, 50), null);
  const text = isolationWarning(
    {crossOriginIsolated: false, timerResolutionMs: 0.09999999403953552},
    50
  );
  t.ok(text.includes('stepped 0.1 ms (up to 0.2% of a 50 ms sample)'), text);

  const file = {
    file: 'a.json',
    results: {
      environment: {browser: {crossOriginIsolated: false, timerResolutionMs: 1}},
      params: {ms: 50},
      results: []
    }
  };
  t.ok(
    resultsWarnings([file]).some(w => w.startsWith('the page was not cross-origin isolated')),
    'resultsWarnings() reports it'
  );
});

test('comparisonArrays(): per-phase medians', t => {
  const {arrays, unit} = comparisonArrays([
    {samples: [1, 2, 3, 10, 20], phaseSizes: [3, 2]},
    {samples: [4, 5, 6, 7], phaseSizes: [1, 3]}
  ]);
  t.equal(unit, 'phase-medians');
  t.deepEqual(arrays, [
    [2, 15],
    [4, 6]
  ]);
  t.equal(
    comparisonArrays([
      {samples: [1, 2], phaseSizes: [2]},
      {samples: [3], phaseSizes: [1]}
    ]).unit,
    'samples',
    'one phase each: the samples are the unit'
  );
});

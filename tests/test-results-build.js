import test from 'tape-six';

import {buildResultsObject} from 'nano-benchmark/bench/results/build.js';

const base = {
  pkg: {name: 'nano-benchmark', version: '9.9.9'},
  createdAt: '2026-01-01T00:00:00.000Z',
  source: {file: 'x.js', export: 'default', methods: ['a']},
  environment: {runtime: {name: 'node'}},
  params: {samples: 100, seed: 7},
  series: [{name: 'a', bodyHash: 'sha256:00', reps: 10, samples: [1, 2], summary: {}}]
};

test('buildResultsObject()', t => {
  t.test('core shape', t => {
    const o = buildResultsObject(base);
    t.equal(o.schemaVersion, 1, 'schemaVersion');
    t.equal(o.tool, 'nano-benchmark', 'tool from pkg.name');
    t.equal(o.toolVersion, '9.9.9', 'toolVersion from pkg.version');
    t.equal(o.createdAt, '2026-01-01T00:00:00.000Z', 'createdAt passthrough');
    t.equal(o.results.length, 1, 'series → results');
    t.equal(o.results[0].name, 'a', 'series content preserved');
  });
  t.test('label optional', t => {
    t.equal(buildResultsObject(base).label, undefined, 'no label key by default');
    t.equal(buildResultsObject({...base, label: 'v1'}).label, 'v1', 'label recorded when given');
  });
  t.test('significance optional', t => {
    t.equal(buildResultsObject(base).significance, undefined, 'omitted for a single series');
    const sig = {test: 'mann-whitney-u', different: true};
    t.equal(
      buildResultsObject({...base, significance: sig}).significance,
      sig,
      'recorded when given'
    );
  });
});

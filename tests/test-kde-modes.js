import test from 'tape-six';

import kdeClusters from 'nano-benchmark/stats/kde-modes.js';
import {mulberry32} from 'nano-benchmark/utils/prng.js';

test('kdeClusters()', t => {
  t.test('two separated blobs split into two clusters', t => {
    const random = mulberry32(11),
      samples = [];
    for (let i = 0; i < 75; ++i) samples.push(8 + random());
    for (let i = 0; i < 25; ++i) samples.push(30 + random());
    samples.sort((a, b) => a - b);
    const {clusters, boundaries} = kdeClusters(samples);
    t.equal(clusters.length, 2);
    t.equal(clusters[0].length, 75);
    t.equal(clusters[1].length, 25);
    t.ok(boundaries[0] > 9 && boundaries[0] < 30);
  });

  t.test('a single bell-shaped blob stays one cluster', t => {
    const random = mulberry32(3),
      samples = Array.from({length: 100}, () => 5 + random() + random() + random()).sort(
        (a, b) => a - b
      );
    const {clusters} = kdeClusters(samples);
    t.equal(clusters.length, 1);
    t.equal(clusters[0].length, 100);
  });

  t.test('constant data stays one cluster', t => {
    const {clusters, boundaries} = kdeClusters([7, 7, 7, 7]);
    t.equal(clusters.length, 1);
    t.deepEqual(boundaries, []);
  });

  t.test('cluster sizes always sum to n', t => {
    const random = mulberry32(21),
      samples = [];
    for (let i = 0; i < 40; ++i) samples.push(random(), 4 + random(), 9 + random());
    samples.sort((a, b) => a - b);
    const {clusters} = kdeClusters(samples);
    t.equal(
      clusters.reduce((acc, cluster) => acc + cluster.length, 0),
      120
    );
    t.ok(clusters.length >= 2);
  });
});

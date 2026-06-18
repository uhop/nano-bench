import test from 'tape-six';
import os from 'node:os';

import {captureEnvironment, diffEnvironments} from 'nano-benchmark/bench/results/environment.js';

test('captureEnvironment()', t => {
  t.test('shape', t => {
    const env = captureEnvironment();
    t.ok(env.runtime && typeof env.runtime.name === 'string', 'runtime.name');
    t.ok(env.os && typeof env.os.platform === 'string', 'os.platform');
    t.ok(env.cpu && typeof env.cpu.count === 'number', 'cpu.count');
    t.ok(typeof env.totalmemMB === 'number', 'totalmemMB');
  });
  t.test('host omitted by default', t => {
    t.equal(captureEnvironment().host, undefined, 'no host without opt-in');
    t.equal(captureEnvironment({}).host, undefined, 'no host with empty opts');
  });
  t.test('--host records os.hostname()', t => {
    t.equal(captureEnvironment({host: true}).host, os.hostname());
  });
  t.test('--host-name records the given string', t => {
    t.equal(captureEnvironment({hostName: 'ci-box'}).host, 'ci-box');
  });
  t.test('--host-name overrides --host', t => {
    t.equal(captureEnvironment({host: true, hostName: 'ci-box'}).host, 'ci-box');
  });
});

test('diffEnvironments()', t => {
  const a = {
    host: 'box-a',
    runtime: {name: 'node', version: '22', engine: 'v8 12'},
    os: {platform: 'linux', release: '7', arch: 'x64'},
    cpu: {model: 'Ryzen', count: 16, speedMHz: 3600},
    totalmemMB: 64000
  };

  t.test('identical environments → no diffs', t => {
    t.equal(diffEnvironments([a, {...a}]).length, 0, 'no differences');
  });
  t.test('fewer than two → no diffs', t => {
    t.equal(diffEnvironments([a]).length, 0, 'single environment');
  });
  t.test('host is excluded', t => {
    t.equal(diffEnvironments([a, {...a, host: 'box-b'}]).length, 0, 'differing host ignored');
  });
  t.test('a differing property is reported', t => {
    const diffs = diffEnvironments([a, {...a, cpu: {...a.cpu, model: 'Xeon'}}]);
    t.equal(diffs.length, 1, 'one diff');
    t.equal(diffs[0].path, 'cpu.model', 'reports the path');
  });
  t.test('cpu.speedMHz is excluded (noisy instantaneous clock)', t => {
    t.equal(diffEnvironments([a, {...a, cpu: {...a.cpu, speedMHz: 9999}}]).length, 0, 'ignored');
  });
});

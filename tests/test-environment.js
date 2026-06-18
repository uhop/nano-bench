import test from 'tape-six';
import os from 'node:os';

import {captureEnvironment} from 'nano-benchmark/bench/results/environment.js';

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

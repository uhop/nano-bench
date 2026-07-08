import test from 'tape-six';

import collectMacro from 'nano-benchmark/bench/macro-runner.js';

test('collectMacro()', t => {
  t.test('fixed run count', async t => {
    let calls = 0;
    const samples = await collectMacro(() => ++calls, {runs: 7});
    t.equal(samples.length, 7);
    t.equal(calls, 7);
    t.ok(samples.every(time => typeof time == 'number' && time >= 0));
  });

  t.test('warmup runs are discarded', async t => {
    let calls = 0;
    const samples = await collectMacro(() => ++calls, {runs: 5, warmup: 3});
    t.equal(samples.length, 5);
    t.equal(calls, 8);
  });

  t.test('minRuns is honored with a zero budget', async t => {
    const samples = await collectMacro(() => {}, {minRuns: 12, budget: 0});
    t.equal(samples.length, 12);
  });

  t.test('maxRuns caps the default policy', async t => {
    const samples = await collectMacro(() => {}, {minRuns: 1, budget: 60000, maxRuns: 20});
    t.equal(samples.length, 20);
  });

  t.test('adaptive stop consults ciWidth after minRuns, every checkEvery runs', async t => {
    const consulted = [];
    const samples = await collectMacro(() => {}, {
      minRuns: 5,
      stable: 5,
      checkEvery: 10,
      maxRuns: 100,
      ciWidth: s => {
        consulted.push(s.length);
        return s.length >= 30 ? 1 : 100;
      }
    });
    t.equal(samples.length, 30);
    t.deepEqual(consulted, [10, 20, 30]);
  });

  t.test('prepare/teardown wrap every run, warmup included', async t => {
    const log = [];
    await collectMacro(() => log.push('run'), {
      runs: 2,
      warmup: 1,
      prepare: () => log.push('prep'),
      teardown: () => log.push('down')
    });
    t.deepEqual(log, ['prep', 'run', 'down', 'prep', 'run', 'down', 'prep', 'run', 'down']);
  });

  t.test('async functions are awaited per run', async t => {
    const samples = await collectMacro(n => new Promise(resolve => setTimeout(resolve, 5 * n)), {
      runs: 3
    });
    t.equal(samples.length, 3);
    t.ok(samples.every(time => time >= 3));
  });
});

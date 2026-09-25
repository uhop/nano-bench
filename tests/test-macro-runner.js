import test from 'tape-six';

import collectMacro, {collectMacroRounds} from 'nano-benchmark/bench/macro-runner.js';

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

  t.test('each stability check is reported with its width', async t => {
    const checks = [];
    await collectMacro(
      () => {},
      {
        minRuns: 5,
        stable: 5,
        checkEvery: 10,
        maxRuns: 100,
        ciWidth: s => (s.length >= 20 ? 4 : 50)
      },
      (name, data) => name === 'macro-check' && checks.push([data.n, data.width])
    );
    t.deepEqual(checks, [
      [10, 50],
      [20, 4]
    ]);
  });

  t.test('consecutive: the width must pass at that many checks in a row', async t => {
    const widths = {10: 1, 20: 50, 30: 1, 40: 1, 50: 1};
    const samples = await collectMacro(() => {}, {
      minRuns: 10,
      stable: 5,
      consecutive: 2,
      maxRuns: 100,
      ciWidth: s => widths[s.length]
    });
    t.equal(samples.length, 40, 'a pass at 10 is reset by the miss at 20; 30 and 40 pass');
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

  t.test('metrics hooks wrap measured runs only, warmup excluded', async t => {
    let counter = 0;
    const tokens = [];
    await collectMacro(() => {}, {
      runs: 3,
      warmup: 2,
      metricsBefore: () => ++counter,
      metricsAfter: token => tokens.push(token)
    });
    t.deepEqual(tokens, [1, 2, 3]);
  });

  t.test('async functions are awaited per run', async t => {
    const samples = await collectMacro(n => new Promise(resolve => setTimeout(resolve, 5 * n)), {
      runs: 3
    });
    t.equal(samples.length, 3);
    t.ok(samples.every(time => time >= 3));
  });
});

test('collectMacroRounds()', t => {
  const tracer = log => ['A', 'B', 'C'].map(name => () => log.push(name));

  t.test('one run of each function per round, rotating the start', async t => {
    const log = [];
    const samples = await collectMacroRounds(tracer(log), {runs: 3});
    t.deepEqual(log.join(''), 'ABCBCACAB');
    t.deepEqual(
      samples.map(s => s.length),
      [3, 3, 3]
    );
  });

  t.test('warmup counts rounds and is discarded', async t => {
    const log = [];
    const samples = await collectMacroRounds(tracer(log), {runs: 2, warmup: 1});
    t.equal(log.length, 9);
    t.deepEqual(
      samples.map(s => s.length),
      [2, 2, 2]
    );
  });

  t.test('minRuns counts rounds with a zero budget', async t => {
    const samples = await collectMacroRounds([() => {}, () => {}], {minRuns: 12, budget: 0});
    t.deepEqual(
      samples.map(s => s.length),
      [12, 12]
    );
  });

  t.test('maxRuns caps rounds', async t => {
    const samples = await collectMacroRounds([() => {}, () => {}], {
      minRuns: 1,
      budget: 60000,
      maxRuns: 20
    });
    t.deepEqual(
      samples.map(s => s.length),
      [20, 20]
    );
  });

  t.test('the budget is the whole loop, not each function', async t => {
    const slow = () => new Promise(resolve => setTimeout(resolve, 20)),
      samples = await collectMacroRounds([slow, slow], {minRuns: 1, budget: 100});
    t.ok(samples[0].length <= 4, `about 100 ms of 40 ms rounds: ${samples[0].length} rounds`);
  });

  t.test('stable: a check passes only when every function is within the target', async t => {
    const consulted = [];
    const samples = await collectMacroRounds([() => {}, () => {}], {
      minRuns: 5,
      stable: 5,
      consecutive: 2,
      maxRuns: 100,
      ciWidth: (s, i) => {
        consulted.push(`${i}@${s.length}`);
        return i === 1 && s.length < 30 ? 50 : 1;
      }
    });
    t.deepEqual(
      samples.map(s => s.length),
      [40, 40],
      'function 1 passes from 30; 30 and 40 pass in a row'
    );
    t.deepEqual(consulted.slice(0, 4), ['0@10', '1@10', '0@20', '1@20']);
  });

  t.test('checks report the widest function', async t => {
    const checks = [];
    await collectMacroRounds(
      [() => {}, () => {}],
      {
        minRuns: 10,
        stable: 5,
        maxRuns: 100,
        ciWidth: (s, i) => (s.length >= 20 ? 4 : 10 * (i + 1))
      },
      (name, data) => name === 'macro-check' && checks.push([data.n, data.width, data.widths])
    );
    t.deepEqual(checks, [
      [10, 20, [10, 20]],
      [20, 4, [4, 4]]
    ]);
  });

  t.test('prepare/teardown wrap every run; metrics hooks get the function index', async t => {
    const log = [],
      indexes = [];
    await collectMacroRounds([() => log.push('a'), () => log.push('b')], {
      runs: 1,
      warmup: 1,
      prepare: () => log.push('<'),
      teardown: () => log.push('>'),
      metricsBefore: i => i,
      metricsAfter: (token, i) => indexes.push([token, i])
    });
    t.equal(log.join(''), '<a><b><b><a>');
    t.deepEqual(indexes, [
      [1, 1],
      [0, 0]
    ]);
  });
});

test('GC hooks', async t => {
  const log = [];
  await collectMacro(() => log.push('run'), {
    runs: 2,
    warmup: 1,
    prepare: () => log.push('prep'),
    afterWarmup: () => log.push('once'),
    beforeRun: () => log.push('each')
  });
  t.deepEqual(
    log,
    ['prep', 'run', 'once', 'prep', 'each', 'run', 'prep', 'each', 'run'],
    'collectMacro: once after warmup; each after prepare, before the run'
  );

  log.length = 0;
  await collectMacroRounds([() => log.push('a'), () => log.push('b')], {
    runs: 1,
    afterWarmup: () => log.push('once'),
    beforeRun: () => log.push('each')
  });
  t.deepEqual(log, ['once', 'each', 'a', 'each', 'b'], 'collectMacroRounds: the same');
});

test('collectMacroRounds() settle', async t => {
  const checks = [];
  const samples = await collectMacroRounds(
    [() => {}, () => {}],
    {
      minRuns: 10,
      consecutive: 2,
      maxRuns: 100,
      budget: 0,
      settle: s => ({settled: s[0].length >= 30})
    },
    (name, data) => name === 'macro-settle' && checks.push([data.n, data.settled, data.passed])
  );
  t.deepEqual(
    samples.map(s => s.length),
    [40, 40],
    'settled at 30 and 40: two checks in a row'
  );
  t.deepEqual(checks, [
    [10, false, 0],
    [20, false, 0],
    [30, true, 1],
    [40, true, 2]
  ]);

  const capped = await collectMacroRounds([() => {}, () => {}], {
    minRuns: 10,
    maxRuns: 25,
    settle: () => ({settled: false})
  });
  t.equal(capped[0].length, 25, 'never settled: --max-runs stops it');
});

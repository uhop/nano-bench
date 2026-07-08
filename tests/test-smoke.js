import test from 'tape-six';

import smokeRun from 'nano-benchmark/bench/smoke.js';

test('smokeRun()', t => {
  t.test('runs each function once with n = 1, in order', async t => {
    const calls = [];
    const results = await smokeRun(
      {
        a: n => calls.push(['a', n]),
        b: async n => calls.push(['b', n])
      },
      ['a', 'b']
    );
    t.deepEqual(calls, [
      ['a', 1],
      ['b', 1]
    ]);
    t.deepEqual(
      results.map(result => ({name: result.name, ok: result.ok})),
      [
        {name: 'a', ok: true},
        {name: 'b', ok: true}
      ]
    );
    t.ok(results.every(result => typeof result.time == 'number' && result.time >= 0));
  });

  t.test('a throw is captured, not propagated', async t => {
    const results = await smokeRun(
      {
        bad: () => {
          throw new Error('boom');
        }
      },
      ['bad']
    );
    t.equal(results[0].ok, false);
    t.ok(/boom/.test(String(results[0].error)));
    t.ok(results[0].time >= 0);
  });

  t.test('an async rejection is captured', async t => {
    const results = await smokeRun(
      {
        bad: async () => {
          throw new Error('async boom');
        }
      },
      ['bad']
    );
    t.equal(results[0].ok, false);
    t.ok(/async boom/.test(String(results[0].error)));
  });

  t.test('a failure does not stop later functions', async t => {
    const results = await smokeRun(
      {
        bad: () => {
          throw new Error('x');
        },
        good: () => {}
      },
      ['bad', 'good']
    );
    t.deepEqual(
      results.map(result => result.ok),
      [false, true]
    );
  });

  t.test('only selected functions run', async t => {
    const calls = [];
    await smokeRun({a: () => calls.push('a'), b: () => calls.push('b')}, ['b']);
    t.deepEqual(calls, ['b']);
  });

  t.test('custom n is passed through', async t => {
    let seen;
    await smokeRun({a: n => (seen = n)}, ['a'], 5);
    t.equal(seen, 5);
  });
});

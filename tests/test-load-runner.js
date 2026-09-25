import test from 'tape-six';

import collectLoad, {runClosedPhase, runOpenPhase} from 'nano-benchmark/bench/load-runner.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('runClosedPhase()', async t => {
  let running = 0,
    peak = 0;
  const fn = async () => {
    peak = Math.max(peak, ++running);
    await sleep(10);
    --running;
  };
  const r = await runClosedPhase(fn, {inFlight: 4, duration: 60});
  t.equal(peak, 4, 'exactly N calls in flight');
  t.ok(r.latencies.length >= 12, `about 6 calls per worker: ${r.latencies.length}`);
  t.ok(
    r.latencies.every(ms => ms >= 9),
    'each latency covers its call'
  );
});

test('runOpenPhase()', async t => {
  let r = await runOpenPhase(() => sleep(2), {rate: 200, duration: 100});
  t.equal(r.scheduled, 20, 'one call every 5 ms for 100 ms');
  t.equal(r.latencies.length + r.dropped, 20);
  t.ok(
    r.latencies.every((ms, k) => ms >= r.services[k]),
    'latency counts from the intended start'
  );

  // a target slower than the rate: calls pile up behind the cap
  r = await runOpenPhase(() => sleep(50), {rate: 500, duration: 60, maxInFlight: 5});
  t.ok(r.dropped > 0, `calls beyond the cap are dropped: ${r.dropped}`);
  t.ok(r.latencies.length <= 30);

  await t.rejects(
    runOpenPhase(
      async () => {
        throw new Error('boom');
      },
      {rate: 100, duration: 30}
    ),
    'a failing call fails the phase'
  );
});

test('collectLoad()', async t => {
  const log = [],
    fns = ['a', 'b'].map(name => async () => {
      log.push(name);
      await sleep(1);
    });
  const events = [];
  const {phases} = await collectLoad(
    fns,
    {
      mode: 'closed',
      inFlight: 1,
      phase: 10,
      phases: 2,
      warmup: 1,
      beforePhase: () => events.push('before'),
      afterWarmup: () => events.push('warm')
    },
    (name, data) => name === 'load-phase' && events.push(`${'ab'[data.index]}${data.round}`)
  );
  t.deepEqual(
    phases.map(list => list.length),
    [2, 2],
    'warmup phases are discarded'
  );
  t.deepEqual(
    events,
    [
      'before',
      'a0',
      'before',
      'b0',
      'warm',
      'before',
      'b1',
      'before',
      'a1',
      'before',
      'a2',
      'before',
      'b2'
    ],
    'interleaved: the start rotates each round; warmup ends once'
  );

  events.length = 0;
  await collectLoad(
    fns,
    {
      mode: 'open',
      rate: 100,
      phase: 10,
      phases: 1,
      warmup: 1,
      order: 'sequential',
      afterWarmup: () => events.push('warm')
    },
    (name, data) => name === 'load-phase' && events.push(`${'ab'[data.index]}${data.round}`)
  );
  t.deepEqual(
    events,
    ['a0', 'warm', 'a1', 'b0', 'warm', 'b1'],
    'sequential: warmup ends per function'
  );
});

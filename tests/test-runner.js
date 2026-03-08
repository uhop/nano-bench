import test from 'tape-six';

import {Stats, wrapper, benchmark, findLevel} from 'nano-benchmark/bench/runner.js';

test('Stats', t => {
  t.test('ensureSorted sorts data', t => {
    const s = new Stats({data: [5, 3, 1, 4, 2], sorted: false});
    s.ensureSorted();
    t.deepEqual(s.data, [1, 2, 3, 4, 5]);
    t.equal(s.sorted, true);
  });

  t.test('ensureSorted is idempotent', t => {
    const s = new Stats({data: [3, 1, 2], sorted: false});
    s.ensureSorted();
    s.ensureSorted();
    t.deepEqual(s.data, [1, 2, 3]);
  });

  t.test('normalizeReps divides data by reps', t => {
    const s = new Stats({data: [10, 20, 30], reps: 10});
    s.normalizeReps();
    t.deepEqual(s.data, [1, 2, 3]);
    t.equal(s.reps, 1);
  });

  t.test('normalizeReps with reps=1 is no-op', t => {
    const s = new Stats({data: [10, 20, 30], reps: 1});
    s.normalizeReps();
    t.deepEqual(s.data, [10, 20, 30]);
  });

  t.test('copyStats produces independent copy', t => {
    const s = new Stats({data: [3, 1, 2], reps: 5, sorted: false});
    const copy = s.copyStats();
    copy.data[0] = 999;
    copy.reps = 1;
    t.equal(s.data[0], 3);
    t.equal(s.reps, 5);
  });

  t.test('sortNumbersAsc comparator', t => {
    t.ok(Stats.sortNumbersAsc(1, 2) < 0);
    t.ok(Stats.sortNumbersAsc(2, 1) > 0);
    t.equal(Stats.sortNumbersAsc(3, 3), 0);
  });
});

test('wrapper()', t => {
  t.test('calls fn n times', t => {
    let count = 0;
    const fn = () => ++count;
    const wrapped = wrapper(fn);
    wrapped(5);
    t.equal(count, 5);
  });

  t.test('returns undefined', t => {
    const wrapped = wrapper(() => 42);
    t.equal(wrapped(3), undefined);
  });
});

test('findLevel()', t => {
  t.test('returns a positive number for a sync function', async t => {
    const fn = n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const level = await findLevel(fn, {threshold: 1});
    t.equal(typeof level, 'number');
    t.ok(level >= 1);
  });

  t.test('works with an async function', async t => {
    const fn = async n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const level = await findLevel(fn, {threshold: 1});
    t.equal(typeof level, 'number');
    t.ok(level >= 1);
  });

  t.test('respects startFrom option', async t => {
    const fn = n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const level = await findLevel(fn, {threshold: 1, startFrom: 1000});
    t.ok(level >= 1000);
  });

  t.test('invokes the report callback', async t => {
    const fn = n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const events = [];
    await findLevel(fn, {threshold: 1}, (name, data) => {
      events.push(name);
    });
    t.ok(events.length > 0);
    t.ok(events.includes('finding-level'));
  });
});

test('benchmark()', t => {
  t.test('returns a promise that resolves to a number', async t => {
    const fn = n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const time = await benchmark(fn, 1000);
    t.equal(typeof time, 'number');
    t.ok(time >= 0);
  });

  t.test('works with thenable (async) functions', async t => {
    const fn = async n => {
      let s = 0;
      for (let i = 0; i < n; ++i) s += i;
    };
    const time = await benchmark(fn, 100);
    t.equal(typeof time, 'number');
    t.ok(time >= 0);
  });
});

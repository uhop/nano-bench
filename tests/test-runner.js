import {performance} from 'node:perf_hooks';

import test from 'tape-six';

import {
  Stats,
  wrapper,
  benchmark,
  findLevel,
  benchmarkSeries,
  benchmarkSeriesPar,
  measure
} from 'nano-benchmark/bench/runner.js';

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
    await findLevel(fn, {threshold: 1}, name => {
      events.push(name);
    });
    t.ok(events.length > 0);
    t.ok(events.includes('finding-level'));
  });

  t.test('terminates at the cap when the threshold is never reached', async t => {
    // a no-op ignores n, so no batch ever hits the threshold; the ramp must stop
    // at MAX_SAFE_INTEGER instead of growing unbounded / overflowing / hanging
    const level = await findLevel(() => {}, {threshold: 1e9, timeout: 0});
    t.equal(level, Number.MAX_SAFE_INTEGER);
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

test('observe option (User Timing API)', t => {
  const noop = n => {
    let s = 0;
    for (let i = 0; i < n; ++i) s += i;
  };

  const namesOf = entries => entries.map(e => e.name);

  t.test('findLevel emits no marks by default', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await findLevel(noop, {threshold: 1});
    t.equal(performance.getEntriesByType('mark').length, 0);
    t.equal(performance.getEntriesByType('measure').length, 0);
  });

  t.test('findLevel with observe emits one mark and one measure', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await findLevel(noop, {threshold: 1, observe: 'unit-test'});
    t.deepEqual(namesOf(performance.getEntriesByType('mark')), [
      'nano-bench/unit-test/find-level:start'
    ]);
    t.deepEqual(namesOf(performance.getEntriesByType('measure')), [
      'nano-bench/unit-test/find-level'
    ]);
  });

  t.test('benchmarkSeries with observe emits a series mark/measure', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await benchmarkSeries(noop, 1, {nSeries: 2, observe: 'series-test'});
    t.deepEqual(namesOf(performance.getEntriesByType('mark')), [
      'nano-bench/series-test/series:start'
    ]);
    t.deepEqual(namesOf(performance.getEntriesByType('measure')), [
      'nano-bench/series-test/series'
    ]);
  });

  t.test('benchmarkSeriesPar with observe emits a series-par mark/measure', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await benchmarkSeriesPar(noop, 1, {nSeries: 2, observe: 'par-test'});
    t.deepEqual(namesOf(performance.getEntriesByType('mark')), [
      'nano-bench/par-test/series-par:start'
    ]);
    t.deepEqual(namesOf(performance.getEntriesByType('measure')), [
      'nano-bench/par-test/series-par'
    ]);
  });

  t.test('measure() with observe threads through to find-level + series', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await measure(noop, {nSeries: 2, threshold: 1, observe: 'thread-test'});
    t.deepEqual(namesOf(performance.getEntriesByType('mark')).sort(), [
      'nano-bench/thread-test/find-level:start',
      'nano-bench/thread-test/series:start'
    ]);
    t.deepEqual(namesOf(performance.getEntriesByType('measure')).sort(), [
      'nano-bench/thread-test/find-level',
      'nano-bench/thread-test/series'
    ]);
  });

  t.test('observe: true uses default label', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await findLevel(noop, {threshold: 1, observe: true});
    t.deepEqual(namesOf(performance.getEntriesByType('mark')), [
      'nano-bench/default/find-level:start'
    ]);
  });

  t.test('measure entries record positive duration', async t => {
    performance.clearMarks();
    performance.clearMeasures();
    await findLevel(noop, {threshold: 1, observe: 'duration-test'});
    const measures = performance.getEntriesByType('measure');
    t.equal(measures.length, 1);
    t.ok(measures[0].duration >= 0);
  });

  performance.clearMarks();
  performance.clearMeasures();
});

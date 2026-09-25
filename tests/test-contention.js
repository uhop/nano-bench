import test from 'tape-six';

import {
  cpuClockKind,
  contentionSummary,
  contentionWarning,
  cpuTime,
  isContended,
  PREEMPTED_RATIO
} from 'nano-benchmark/bench/contention.js';
import {benchmark, benchmarkRounds} from 'nano-benchmark/bench/runner.js';

// blocks the thread without using the CPU: elapsed time passes, CPU time does not
const block = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const spin = ms => {
  const end = performance.now() + ms;
  let x = 0;
  while (performance.now() < end) x += Math.sqrt(x + 1);
  return x;
};

test('cpuTime()', t => {
  const before = cpuTime();
  spin(20);
  const used = cpuTime() - before;
  t.ok(Number.isFinite(before), 'available');
  t.ok(used > 0, `spinning 20 ms uses CPU time (${used.toFixed(1)} ms)`);
});

test('contentionSummary()', t => {
  t.equal(contentionSummary([]), null, 'no samples');
  t.equal(contentionSummary([NaN, NaN]), null, 'only async samples');
  const s = contentionSummary([1, 1, 0.5, NaN, 0.95, 0.2]);
  t.equal(s.samples, 5, 'NaN ignored');
  t.equal(s.preempted, 2, `below ${PREEMPTED_RATIO}`);
  t.equal(s.medianRatio, 0.95);
});

test('isContended() and contentionWarning()', t => {
  t.notOk(isContended(null));
  t.notOk(isContended({samples: 100, preempted: 9}), 'under 10%');
  t.ok(isContended({samples: 100, preempted: 10}), '10% or more');
  t.ok(
    contentionWarning({samples: 40, preempted: 12}).startsWith('12 of 40 samples were preempted')
  );
});

// a process-wide clock also counts the other test workers running in parallel, so a
// blocked sample can read above 1; blocked-sample checks need the thread clock
const threadClock = cpuClockKind() === 'thread';

test('cpuClockKind()', t => {
  t.ok(['thread', 'process', 'none'].includes(cpuClockKind()), cpuClockKind());
});

test('benchmark() ratios', async t => {
  // the suite runs files in parallel workers, so a spinning sample can itself be preempted;
  // only a blocked sample's ratio is fixed, since its own thread uses no CPU while it waits
  const ratios = [];
  await benchmark(() => spin(20), 1, ratios);
  t.ok(ratios[0] > 0.3, `a spinning sample uses the CPU (${ratios[0].toFixed(2)})`);

  await benchmark(() => block(20), 1, ratios);
  if (threadClock) {
    t.ok(ratios[1] < 0.2, `a blocked sample reads as preempted (${ratios[1].toFixed(2)})`);
  } else {
    t.ok(Number.isFinite(ratios[1]), 'process clock: a blocked sample still gets a ratio');
  }

  await benchmark(async () => spin(1), 1, ratios);
  t.ok(Number.isNaN(ratios[2]), 'an async sample has no ratio');

  const time = await benchmark(() => spin(1), 1);
  t.ok(time > 0, 'ratios are optional');
});

test('benchmarkRounds() collects ratios per function', async t => {
  const ratios = [[], []];
  await benchmarkRounds([() => spin(5), () => block(5)], [1, 1], {nSeries: 4, timeout: 0, ratios});
  t.equal(ratios[0].length, 4);
  t.equal(ratios[1].length, 4);
  const spinning = contentionSummary(ratios[0]),
    blocking = contentionSummary(ratios[1]);
  if (!threadClock) {
    t.ok(spinning && blocking, 'process clock: both summarized');
    return;
  }
  t.ok(isContended(blocking), 'the blocking function looks preempted');
  t.ok(spinning.medianRatio > blocking.medianRatio, 'the spinning one reads higher');
});

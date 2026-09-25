import {performance} from 'node:perf_hooks';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Closed loop: `inFlight` workers, each starting its next call when the last one settles,
 * until `duration` ms have passed; calls already started run to the end.
 * @param {(n: number) => unknown} fn
 * @param {{inFlight: number, duration: number}} options
 * @returns {Promise<{latencies: number[], elapsed: number}>}
 */
export const runClosedPhase = async (fn, {inFlight, duration}) => {
  const latencies = [],
    start = performance.now(),
    end = start + duration,
    worker = async () => {
      while (performance.now() < end) {
        const t = performance.now();
        await fn(1);
        latencies.push(performance.now() - t);
      }
    };
  await Promise.all(Array.from({length: inFlight}, worker));
  return {latencies, elapsed: performance.now() - start};
};

/**
 * Open loop: a call is due every 1000 / `rate` ms for `duration` ms, whether or not earlier
 * calls have settled. Latency counts from the call's intended start (coordinated omission,
 * after wrk2); `services` counts from its actual start; `lags` is how late the harness started
 * it. A call due while `maxInFlight` calls are running is dropped and counted.
 * @param {(n: number) => unknown} fn
 * @param {{rate: number, duration: number, maxInFlight?: number}} options
 * @returns {Promise<{latencies: number[], services: number[], lags: number[], dropped: number, scheduled: number, elapsed: number}>}
 */
export const runOpenPhase = async (fn, {rate, duration, maxInFlight = 1000}) => {
  const latencies = [],
    services = [],
    lags = [],
    calls = [],
    interval = 1000 / rate,
    start = performance.now();
  let inFlight = 0,
    dropped = 0,
    scheduled = 0,
    failure = null;
  for (let k = 0; ; ++k) {
    const offset = k * interval;
    if (offset >= duration) break;
    const intended = start + offset;
    ++scheduled;
    const wait = intended - performance.now();
    if (wait > 0) await sleep(wait);
    // timers can fire a fraction of a millisecond early: never start a call before its time
    while (performance.now() < intended);
    if (failure) break;
    if (inFlight >= maxInFlight) {
      ++dropped;
      continue;
    }
    ++inFlight;
    const actual = performance.now();
    lags.push(actual - intended);
    calls.push(
      (async () => {
        try {
          await fn(1);
          const end = performance.now();
          latencies.push(end - intended);
          services.push(end - actual);
        } catch (error) {
          failure ??= error;
        } finally {
          --inFlight;
        }
      })()
    );
  }
  await Promise.all(calls);
  if (failure) throw failure;
  return {latencies, services, lags, dropped, scheduled, elapsed: performance.now() - start};
};

/**
 * Phases of load, one function per phase, rotating the start every round (`order:
 * 'interleaved'`) or each function's phases in turn (`'sequential'`).
 * @param {Function[]} fns
 * @param {{mode: 'closed' | 'open', inFlight?: number, rate?: number, maxInFlight?: number, phase: number, phases: number, warmup?: number, order?: 'interleaved' | 'sequential', beforePhase?: () => unknown, afterPhase?: () => unknown, afterWarmup?: () => unknown}} options
 * @param {(name: string, data: any) => unknown} [report]
 * @returns {Promise<{phases: any[][]}>} per function, the result of each measured phase
 */
export const collectLoad = async (fns, options, report) => {
  const {
    mode,
    inFlight = 1,
    rate = 1,
    maxInFlight = 1000,
    phase,
    phases,
    warmup = 0,
    order = 'interleaved',
    beforePhase,
    afterPhase,
    afterWarmup
  } = options;
  const k = fns.length,
    run = fn =>
      mode === 'open'
        ? runOpenPhase(fn, {rate, duration: phase, maxInFlight})
        : runClosedPhase(fn, {inFlight, duration: phase}),
    plan = [];
  if (order === 'sequential') {
    for (let i = 0; i < k; ++i)
      for (let round = 0; round < warmup + phases; ++round) plan.push({i, round});
  } else {
    for (let round = 0; round < warmup + phases; ++round)
      for (let j = 0; j < k; ++j) plan.push({i: (round + j) % k, round});
  }
  const results = fns.map(() => /** @type {any[]} */ ([]));
  let warmed = false;
  for (let p = 0; p < plan.length; ++p) {
    const {i, round} = plan[p];
    if (round === warmup && (order === 'sequential' || !warmed)) {
      warmed = true;
      await afterWarmup?.();
    }
    await beforePhase?.();
    const result = await run(fns[i]);
    await afterPhase?.();
    if (round >= warmup) results[i].push(result);
    await report?.('load-phase', {done: p + 1, total: plan.length, index: i, round, result});
  }
  return {phases: results};
};

export default collectLoad;

import {performance} from 'node:perf_hooks';

export const collectMacro = async (fn, options = {}, report) => {
  const {
    warmup = 0,
    runs = 0,
    minRuns = 10,
    budget = 5000,
    stable = 0,
    maxRuns = 1000,
    checkEvery = 10,
    consecutive = 1,
    ciWidth,
    prepare,
    teardown,
    metricsBefore,
    metricsAfter,
    afterWarmup,
    beforeRun
  } = options;

  for (let i = 0; i < warmup; ++i) {
    await prepare?.();
    await fn(1);
    await teardown?.();
    await report?.('macro-warmup', {n: i + 1, warmup});
  }

  await afterWarmup?.();
  const samples = [],
    started = performance.now();
  let passed = 0;
  for (;;) {
    await prepare?.();
    await beforeRun?.();
    const token = metricsBefore?.();
    const start = performance.now();
    await fn(1);
    const time = performance.now() - start;
    metricsAfter?.(token);
    await teardown?.();
    samples.push(time);
    await report?.('macro-run', {n: samples.length, time});

    const n = samples.length;
    if (runs > 0) {
      if (n >= runs) break;
      continue;
    }
    if (n >= maxRuns) break;
    if (n < minRuns) continue;
    if (stable > 0) {
      if (n % checkEvery === 0 && ciWidth) {
        const width = ciWidth(samples);
        passed = width <= stable ? passed + 1 : 0;
        await report?.('macro-check', {n, width, passed});
        if (passed >= consecutive) break;
      }
      continue;
    }
    if (performance.now() - started >= budget) break;
  }
  return samples;
};

/**
 * One run of every function per round, rotating which goes first. The stop policy counts rounds:
 * `runs` and `minRuns`/`maxRuns` are rounds, `budget` is the whole loop's wall time, and with
 * `stable` a check passes when every function's width is within the target; with `settle` it
 * passes when `settle(samples).settled` is true.
 * @param {Function[]} fns
 * @param {{warmup?: number, runs?: number, minRuns?: number, budget?: number, stable?: number, maxRuns?: number, checkEvery?: number, consecutive?: number, ciWidth?: (samples: number[], index: number) => number, prepare?: () => unknown, teardown?: () => unknown, metricsBefore?: (index: number) => any, metricsAfter?: (token: any, index: number) => unknown, afterWarmup?: () => unknown, beforeRun?: () => unknown, settle?: (samples: number[][]) => {settled: boolean}}} [options]
 * @param {(name: string, data: any) => unknown} [report]
 * @returns {Promise<number[][]>} samples per function, in time order
 */
export const collectMacroRounds = async (fns, options = {}, report) => {
  const {
    warmup = 0,
    runs = 0,
    minRuns = 10,
    budget = 5000,
    stable = 0,
    maxRuns = 1000,
    checkEvery = 10,
    consecutive = 1,
    ciWidth,
    prepare,
    teardown,
    metricsBefore,
    metricsAfter,
    afterWarmup,
    beforeRun,
    settle
  } = options;
  const k = fns.length;

  for (let round = 0; round < warmup; ++round) {
    for (let j = 0; j < k; ++j) {
      await prepare?.();
      await fns[(round + j) % k](1);
      await teardown?.();
    }
    await report?.('macro-warmup', {n: round + 1, warmup});
  }

  await afterWarmup?.();
  const samples = fns.map(() => /** @type {number[]} */ ([])),
    started = performance.now();
  let passed = 0;
  for (let round = 0; ; ++round) {
    for (let j = 0; j < k; ++j) {
      const i = (warmup + round + j) % k;
      await prepare?.();
      await beforeRun?.();
      const token = metricsBefore?.(i);
      const start = performance.now();
      await fns[i](1);
      const time = performance.now() - start;
      metricsAfter?.(token, i);
      await teardown?.();
      samples[i].push(time);
      await report?.('macro-run', {n: round + 1, index: i, time});
    }
    await report?.('macro-round', {n: round + 1, samples});

    const n = round + 1;
    if (runs > 0) {
      if (n >= runs) break;
      continue;
    }
    if (n >= maxRuns) break;
    if (n < minRuns) continue;
    if (settle) {
      if (n % checkEvery === 0) {
        const verdict = settle(samples);
        passed = verdict.settled ? passed + 1 : 0;
        await report?.('macro-settle', {...verdict, n, passed});
        if (passed >= consecutive) break;
      }
      continue;
    }
    if (stable > 0) {
      if (n % checkEvery === 0 && ciWidth) {
        const widths = samples.map((s, i) => ciWidth(s, i)),
          width = Math.max(...widths);
        passed = width <= stable ? passed + 1 : 0;
        await report?.('macro-check', {n, width, widths, passed});
        if (passed >= consecutive) break;
      }
      continue;
    }
    if (performance.now() - started >= budget) break;
  }
  return samples;
};

export default collectMacro;

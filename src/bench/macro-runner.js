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
    ciWidth,
    prepare,
    teardown
  } = options;

  for (let i = 0; i < warmup; ++i) {
    await prepare?.();
    await fn(1);
    await teardown?.();
    await report?.('macro-warmup', {n: i + 1, warmup});
  }

  const samples = [],
    started = performance.now();
  for (;;) {
    await prepare?.();
    const start = performance.now();
    await fn(1);
    const time = performance.now() - start;
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
      if (n % checkEvery === 0 && ciWidth && ciWidth(samples) <= stable) break;
      continue;
    }
    if (performance.now() - started >= budget) break;
  }
  return samples;
};

export default collectMacro;

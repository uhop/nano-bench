import {numericAsc} from '../utils/numeric-asc.js';
import {cpuTime} from './contention.js';

/**
 * @typedef {boolean | string} Observe
 *   false / undefined — no instrumentation; true — emit marks with label "default";
 *   string — emit marks with the given label.
 */

const makeObserver = (observe, defaultLabel) => {
  if (!observe) return null;
  const label = typeof observe === 'string' ? observe : defaultLabel;
  const prefix = `nano-bench/${label}`;
  return {
    mark: phase => performance.mark(`${prefix}/${phase}:start`),
    measure: phase => performance.measure(`${prefix}/${phase}`, `${prefix}/${phase}:start`)
  };
};

// ramp cap — reps must stay exact integers (`<< 1` was mod-2^32, overflowing negative)
export const MAX_REPS = Number.MAX_SAFE_INTEGER;

export const nextLevel = n => {
  if (n < 1) return 1;
  let exp = 0;
  while (!(n % 10)) {
    ++exp;
    n = n / 10;
  }
  if (n < 5) {
    n = n < 2 ? 2 : 5;
  } else if (n < 10) {
    n = 10;
  } else {
    n = n * 2;
  }
  while (exp--) {
    n *= 10;
  }
  return n > MAX_REPS ? MAX_REPS : n;
};

/**
 * @param {{threshold?: number, startFrom?: number, timeout?: number, observe?: Observe}} [opts]
 * @param {Function} [report]
 */
export const findLevel = async (fn, opts = {}, report) => {
  const {threshold = 20, startFrom = 1, timeout = 5, observe} = opts;
  const obs = makeObserver(observe, 'default');
  obs?.mark('find-level');
  try {
    return await new Promise((resolve, reject) => {
      const bench = async n => {
        report && (await report('finding-level', {n}));
        try {
          const start = performance.now(),
            result = fn(n),
            finish = performance.now();
          if (result && typeof result.then == 'function') {
            // thenable
            result.then(async () => {
              const finish = performance.now();
              if (finish - start >= threshold) return resolve(n);
              const next = nextLevel(n);
              if (next <= n) return resolve(n);
              report && (await report('finding-level-next', {n, time: finish - start}));
              setTimeout(bench, timeout, next);
            }, reject);
            return;
          }
          if (finish - start >= threshold) return resolve(n);
          const next = nextLevel(n);
          if (next <= n) return resolve(n);
          report && (await report('finding-level-next', {n, time: finish - start}));
          setTimeout(bench, timeout, next);
        } catch (error) {
          reject(error);
        }
      };
      bench(startFrom);
    });
  } finally {
    obs?.measure('find-level');
  }
};

/**
 * @param {Function} fn
 * @param {number} n
 * @param {number[]} [ratios] receives CPU time / elapsed time for a synchronous sample, NaN otherwise
 * @returns {Promise<number>}
 */
export const benchmark = (fn, n, ratios) =>
  new Promise((resolve, reject) => {
    try {
      const cpuStart = ratios ? cpuTime() : 0,
        start = performance.now(),
        result = fn(n),
        finish = performance.now();
      if (result && typeof result.then == 'function') {
        // thenable: waiting is not running, so its CPU ratio says nothing
        result.then(() => {
          const finish = performance.now();
          ratios?.push(NaN);
          resolve(finish - start);
        }, reject);
        return;
      }
      ratios?.push((cpuTime() - cpuStart) / (finish - start));
      resolve(finish - start);
    } catch (error) {
      reject(error);
    }
  });

/**
 * @param {{nSeries?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe, onSample?: (done: number) => unknown, ratios?: number[], beforeSample?: () => unknown}} [opts]
 */
export const benchmarkSeries = async (fn, n, opts = {}) => {
  const {
    nSeries = 100,
    timeout = 5,
    DataArray = Array,
    observe,
    onSample,
    ratios,
    beforeSample
  } = opts;
  const total = nSeries;
  const obs = makeObserver(observe, 'default');
  obs?.mark('series');
  try {
    const data = new DataArray(nSeries);

    const bench = async (nSeries, resolve, reject) => {
      --nSeries;
      try {
        if (beforeSample) await beforeSample();
        data[nSeries] = await benchmark(fn, n, ratios);
        if (onSample) await onSample(total - nSeries);
        if (nSeries) {
          setTimeout(bench, timeout, nSeries, resolve, reject);
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };

    await new Promise((resolve, reject) => bench(nSeries, resolve, reject));

    return data;
  } finally {
    obs?.measure('series');
  }
};

/**
 * Starts `concurrency` calls at once and waits for all of them.
 * @returns {Promise<number[]>} the time of each call, from its start to its settling
 */
export const burst = (fn, n, concurrency) => {
  const calls = [];
  for (let i = 0; i < concurrency; ++i) calls.push(benchmark(fn, n));
  return Promise.all(calls);
};

/**
 * @param {Function[]} fns
 * @param {number[]} ns batch size for each function
 * @param {{nSeries?: number, timeout?: number, concurrency?: number, observe?: Observe, onSample?: (done: number, total: number) => unknown, ratios?: number[][], beforeSample?: () => unknown}} [opts]
 * @param {(round: number, data: number[][]) => unknown} [report] awaited after each round
 * @returns {Promise<number[][]>} samples per function, in time order; with `concurrency`, a
 *   burst of that many per function and round
 */
export const benchmarkRounds = async (fns, ns, opts = {}, report) => {
  const {
    nSeries = 100,
    timeout = 5,
    concurrency = 0,
    observe,
    onSample,
    ratios,
    beforeSample
  } = opts;
  const obs = makeObserver(observe, 'default');
  obs?.mark('rounds');
  try {
    const k = fns.length,
      data = fns.map(() => /** @type {number[]} */ ([])),
      pause = () => new Promise(resolve => setTimeout(resolve, timeout));
    for (let round = 0; round < nSeries; ++round) {
      // rotate the start so no function always runs first in a round
      for (let j = 0; j < k; ++j) {
        const i = (round + j) % k;
        if (beforeSample) await beforeSample();
        if (concurrency > 0) data[i].push(...(await burst(fns[i], ns[i], concurrency)));
        else data[i].push(await benchmark(fns[i], ns[i], ratios?.[i]));
        if (onSample) await onSample(round * k + j + 1, nSeries * k);
        await pause();
      }
      if (report) await report(round + 1, data);
    }
    return data;
  } finally {
    obs?.measure('rounds');
  }
};

/**
 * Without `concurrency`, one burst of `nSeries` calls. With it, `nSeries` rounds of `concurrency`
 * calls started together, `timeout` ms apart; the samples come round by round.
 * @param {{nSeries?: number, concurrency?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe, onSample?: (done: number, total: number) => unknown, beforeSample?: () => unknown}} [opts]
 */
export const benchmarkSeriesPar = async (fn, n, opts = {}) => {
  const {
    nSeries = 100,
    concurrency = 0,
    timeout = 5,
    DataArray = Array,
    observe,
    onSample,
    beforeSample
  } = opts;
  const obs = makeObserver(observe, 'default');
  obs?.mark('series-par');
  try {
    let results;
    if (concurrency > 0) {
      results = [];
      for (let round = 0; round < nSeries; ++round) {
        if (round) await new Promise(resolve => setTimeout(resolve, timeout));
        if (beforeSample) await beforeSample();
        results.push(...(await burst(fn, n, concurrency)));
        if (onSample) await onSample(round + 1, nSeries);
      }
    } else {
      if (beforeSample) await beforeSample();
      results = await burst(fn, n, nSeries);
    }
    return DataArray === Array ? results : DataArray.from(results);
  } finally {
    obs?.measure('series-par');
  }
};

/**
 * @typedef {object} StatsInit
 * @property {number[]} data
 * @property {number} reps
 * @property {number} [time]
 * @property {boolean} [sorted]
 */

export class Stats {
  /** @param {StatsInit} object */
  constructor(object) {
    /** @type {number[]} */
    this.data = object.data;
    this.reps = object.reps;
    this.time = object.time;
    this.sorted = object.sorted ?? false;
  }

  static sortNumbersAsc = numericAsc;

  ensureSorted() {
    if (!this.sorted) {
      this.data.sort(Stats.sortNumbersAsc);
      this.sorted = true;
    }
    return this;
  }

  normalizeReps() {
    if (this.reps !== 1) {
      const data = this.data,
        reps = this.reps,
        size = data.length;
      for (let i = 0; i < size; ++i) {
        data[i] /= reps;
      }
      this.reps = 1;
    }
    return this;
  }

  copyStats() {
    return new Stats({...this, data: this.data.slice()});
  }
}

/**
 * @param {{nSeries?: number, threshold?: number, startFrom?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe}} [opts]
 * @param {Function} [report]
 */
export const measure = async (fn, opts = {}, report) => {
  const {
    nSeries = 100,
    threshold = 20,
    startFrom = 1,
    timeout = 5,
    DataArray = Array,
    observe
  } = opts;
  report?.('finding-reps');
  const reps =
    startFrom < 0 ? -startFrom : await findLevel(fn, {threshold, startFrom, timeout, observe});
  report?.('found-reps', {reps});
  report?.('starting-benchmarks', {nSeries, reps});
  const start = performance.now(),
    data = await benchmarkSeries(fn, reps, {nSeries, timeout, DataArray, observe}),
    finish = performance.now(),
    result = {data, reps, time: finish - start};
  report?.('finished-benchmarks', {...result, nSeries});
  return new Stats(result);
};

/**
 * @param {{nSeries?: number, concurrency?: number, threshold?: number, startFrom?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe}} [opts]
 * @param {Function} [report]
 */
export const measurePar = async (fn, opts = {}, report) => {
  const {
    nSeries = 100,
    concurrency = 0,
    threshold = 20,
    startFrom = 1,
    timeout = 5,
    DataArray = Array,
    observe
  } = opts;
  report?.('finding-reps');
  const reps =
    startFrom < 0 ? -startFrom : await findLevel(fn, {threshold, startFrom, timeout, observe});
  report?.('found-reps', {reps});
  report?.('starting-benchmarks', {nSeries, reps});
  const start = performance.now(),
    data = await benchmarkSeriesPar(fn, reps, {nSeries, concurrency, timeout, DataArray, observe}),
    finish = performance.now(),
    result = {data, reps, time: finish - start};
  report?.('finished-benchmarks', {...result, nSeries});
  return new Stats(result);
};

export const wrapper = fn => n => {
  for (let i = 0; i < n; ++i) fn();
};

import {performance} from 'node:perf_hooks';

import {numericAsc} from '../utils/numeric-asc.js';

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

export const benchmark = (fn, n) =>
  new Promise((resolve, reject) => {
    try {
      const start = performance.now(),
        result = fn(n),
        finish = performance.now();
      if (result && typeof result.then == 'function') {
        // thenable
        result.then(() => {
          const finish = performance.now();
          resolve(finish - start);
        }, reject);
        return;
      }
      resolve(finish - start);
    } catch (error) {
      reject(error);
    }
  });

/**
 * @param {{nSeries?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe}} [opts]
 */
export const benchmarkSeries = async (fn, n, opts = {}) => {
  const {nSeries = 100, timeout = 5, DataArray = Array, observe} = opts;
  const obs = makeObserver(observe, 'default');
  obs?.mark('series');
  try {
    const data = new DataArray(nSeries);

    const bench = async (nSeries, resolve, reject) => {
      --nSeries;
      try {
        data[nSeries] = await benchmark(fn, n);
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
 * @param {{nSeries?: number, DataArray?: ArrayConstructor, observe?: Observe}} [opts]
 */
export const benchmarkSeriesPar = async (fn, n, opts = {}) => {
  let {nSeries = 100} = opts;
  const {DataArray = Array, observe} = opts;
  const obs = makeObserver(observe, 'default');
  obs?.mark('series-par');
  try {
    const benchmarks = [];
    for (; nSeries > 0; --nSeries) benchmarks.push(benchmark(fn, n));
    const results = await Promise.all(benchmarks);
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
 * @param {{nSeries?: number, threshold?: number, startFrom?: number, timeout?: number, DataArray?: ArrayConstructor, observe?: Observe}} [opts]
 * @param {Function} [report]
 */
export const measurePar = async (fn, opts = {}, report) => {
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
    data = await benchmarkSeriesPar(fn, reps, {nSeries, DataArray, observe}),
    finish = performance.now(),
    result = {data, reps, time: finish - start};
  report?.('finished-benchmarks', {...result, nSeries});
  return new Stats(result);
};

export const wrapper = fn => n => {
  for (let i = 0; i < n; ++i) fn();
};

import {performance} from 'node:perf_hooks';

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
    n = n << 1;
  }
  while (exp--) {
    n *= 10;
  }
  return n;
};

export const findLevel = (fn, {threshold = 20, startFrom = 1, timeout = 5} = {}) =>
  new Promise((resolve, reject) => {
    const bench = n => {
      try {
        const start = performance.now(),
          result = fn(n),
          finish = performance.now();
        if (result && typeof result.then == 'function') {
          // thenable
          result.then(() => {
            const finish = performance.now();
            if (finish - start >= threshold) return resolve(n);
            setTimeout(bench, timeout, nextLevel(n));
          }, reject);
          return;
        }
        if (finish - start >= threshold) return resolve(n);
        setTimeout(bench, timeout, nextLevel(n));
      } catch (error) {
        reject(error);
      }
    };
    bench(startFrom);
  });

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

export const benchmarkSeries = async (
  fn,
  n,
  {nSeries = 100, timeout = 5, DataArray = Array} = {}
) => {
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
};

export const benchmarkSeriesPar = async (fn, n, {nSeries = 100, DataArray = Array} = {}) => {
  const benchmarks = [];
  for (; nSeries > 0; --nSeries) benchmarks.push(benchmark(fn, n));
  const results = Promise.all(benchmarks);
  return DataArray === Array ? results : DataArray.from(results);
};

export class Stats {
  constructor(object) {
    Object.assign(this, object);
  }

  static sortNumbersAsc = (a, b) => a - b;

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

export const measure = async (
  fn,
  {nSeries = 100, threshold = 20, startFrom = 1, timeout = 5, DataArray = Array} = {}
) => {
  const reps = startFrom < 0 ? -startFrom : await findLevel(fn, {threshold, startFrom, timeout}),
    start = performance.now(),
    data = await benchmarkSeries(fn, reps, {nSeries, timeout, DataArray}),
    finish = performance.now();
  return new Stats({data, reps, time: finish - start});
};

export const measurePar = async (
  fn,
  {nSeries = 100, threshold = 20, startFrom = 1, timeout = 5, DataArray = Array} = {}
) => {
  const reps = startFrom < 0 ? -startFrom : await findLevel(fn, {threshold, startFrom, timeout}),
    start = performance.now(),
    data = await benchmarkSeriesPar(fn, reps, {nSeries, DataArray}),
    finish = performance.now();
  return new Stats({data, reps, time: finish - start});
};

export const wrapper = fn => n => {
  for (let i = 0; i < n; ++i) fn();
};

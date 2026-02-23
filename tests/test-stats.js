import test from 'tape-six';

import {
  mean,
  variance,
  stdDev,
  skewness,
  kurtosis,
  excessKurtosis,
  getWeightedValue,
  getPercentile,
  bootstrap
} from 'nano-benchmark/stats.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('mean()', t => {
  t.test('uniform values', t => {
    t.ok(approx(mean([5, 5, 5, 5]), 5));
  });
  t.test('simple average', t => {
    t.ok(approx(mean([1, 2, 3, 4, 5]), 3));
  });
  t.test('single element', t => {
    t.ok(approx(mean([42]), 42));
  });
  t.test('negative values', t => {
    t.ok(approx(mean([-2, -1, 0, 1, 2]), 0));
  });
});

test('variance()', t => {
  t.test('uniform values have zero variance', t => {
    t.ok(approx(variance([5, 5, 5, 5]), 0));
  });
  t.test('known variance', t => {
    // [1,2,3,4,5]: mean=3, variance = ((4+1+0+1+4)/5) = 2
    t.ok(approx(variance([1, 2, 3, 4, 5]), 2));
  });
  t.test('two values', t => {
    // [0, 10]: mean=5, variance = (25+25)/2 = 25
    t.ok(approx(variance([0, 10]), 25));
  });
});

test('stdDev()', t => {
  t.test('known stdDev', t => {
    t.ok(approx(stdDev([1, 2, 3, 4, 5]), Math.sqrt(2)));
  });
});

test('skewness()', t => {
  t.test('symmetric data has zero skewness', t => {
    t.ok(approx(skewness([1, 2, 3, 4, 5]), 0));
  });
  t.test('right-skewed data has positive skewness', t => {
    t.ok(skewness([1, 1, 1, 1, 1, 1, 1, 10]) > 0);
  });
  t.test('left-skewed data has negative skewness', t => {
    t.ok(skewness([1, 10, 10, 10, 10, 10, 10, 10]) < 0);
  });
});

test('kurtosis()', t => {
  t.test('normal-like data has kurtosis near 3', t => {
    // large uniform: kurtosis = 1.8 (platykurtic)
    const data = [];
    for (let i = 0; i < 1000; ++i) data.push(i);
    const k = kurtosis(data);
    t.ok(k > 1 && k < 4);
  });
  t.test('excessKurtosis is kurtosis - 3', t => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    t.ok(approx(excessKurtosis(data), kurtosis(data) - 3));
  });
});

test('getWeightedValue()', t => {
  t.test('median of sorted odd array', t => {
    t.ok(approx(getWeightedValue([1, 2, 3, 4, 5], 0.5), 3));
  });
  t.test('median of sorted even array', t => {
    t.ok(approx(getWeightedValue([1, 2, 3, 4], 0.5), 2.5));
  });
  t.test('weight 0 returns first element', t => {
    t.ok(approx(getWeightedValue([10, 20, 30], 0), 10));
  });
  t.test('weight 1 returns last element', t => {
    t.ok(approx(getWeightedValue([10, 20, 30], 1), 30));
  });
  t.test('quartiles', t => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    t.ok(approx(getWeightedValue(data, 0.25), 3.5));
    t.ok(approx(getWeightedValue(data, 0.75), 8.5));
  });
});

test('getPercentile()', t => {
  t.test('value below all', t => {
    t.equal(getPercentile([10, 20, 30], 5), 0);
  });
  t.test('value above all', t => {
    t.equal(getPercentile([10, 20, 30], 35), 3);
  });
  t.test('value at element', t => {
    t.equal(getPercentile([10, 20, 30], 20), 2);
  });
  t.test('value between elements', t => {
    t.equal(getPercentile([10, 20, 30], 15), 1);
  });
});

test('bootstrap()', t => {
  t.test('returns correct number of results', t => {
    const data = [1, 2, 3, 4, 5];
    const results = bootstrap(x => x[0], data, 500);
    t.equal(results.length, 500);
  });
  t.test('bootstrap mean converges to population mean', t => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = bootstrap(
      samples => samples.reduce((a, b) => a + b, 0) / samples.length,
      data,
      2000
    );
    const bootstrapMean = results.reduce((a, b) => a + b, 0) / results.length;
    t.ok(approx(bootstrapMean, 5.5, 0.5));
  });
});

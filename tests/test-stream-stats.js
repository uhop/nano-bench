import test from 'tape-six';

import {mean, variance, skewness, kurtosis} from 'nano-benchmark/stats.js';
import {StatCounter, streamStats} from 'nano-benchmark/stream-stats.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('StatCounter', t => {
  t.test('matches batch mean', t => {
    const data = [3, 7, 1, 9, 4, 6, 2, 8, 5, 10];
    const counter = new StatCounter();
    for (const v of data) counter.add(v);
    t.ok(approx(counter.mean, mean(data)));
  });

  t.test('matches batch variance', t => {
    const data = [3, 7, 1, 9, 4, 6, 2, 8, 5, 10];
    const counter = new StatCounter();
    for (const v of data) counter.add(v);
    t.ok(approx(counter.variance, variance(data)));
  });

  t.test('matches batch skewness', t => {
    const data = [1, 1, 1, 2, 5, 8, 12, 15, 20];
    const counter = new StatCounter();
    for (const v of data) counter.add(v);
    t.ok(approx(counter.skewness, skewness(data), 1e-6));
  });

  t.test('matches batch excess kurtosis', t => {
    const data = [1, 1, 1, 2, 5, 8, 12, 15, 20];
    const counter = new StatCounter();
    for (const v of data) counter.add(v);
    t.ok(approx(counter.kurtosis, kurtosis(data) - 3, 1e-6));
  });

  t.test('count tracks additions', t => {
    const counter = new StatCounter();
    counter.add(1);
    counter.add(2);
    counter.add(3);
    t.equal(counter.count, 3);
  });

  t.test('clone produces independent copy', t => {
    const counter = new StatCounter();
    counter.add(1);
    counter.add(2);
    const clone = counter.clone();
    clone.add(100);
    t.equal(counter.count, 2);
    t.equal(clone.count, 3);
    t.ok(approx(counter.mean, 1.5));
  });
});

test('StatCounter sampleVariance', t => {
  t.test('sampleVariance = M2 / (n - 1)', t => {
    const data = [2, 4, 6, 8, 10];
    const counter = new StatCounter();
    for (const v of data) counter.add(v);
    t.ok(approx(counter.sampleVariance, counter.variance * (data.length / (data.length - 1))));
  });

  t.test('sampleVariance > variance for n > 1', t => {
    const counter = new StatCounter();
    counter.add(1);
    counter.add(10);
    t.ok(counter.sampleVariance > counter.variance);
  });
});

test('streamStats()', t => {
  t.test('matches batch stats', t => {
    const data = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    const result = streamStats(data);
    t.ok(approx(result.mean, mean(data)));
    t.ok(approx(result.variance, variance(data)));
    t.equal(result.count, data.length);
  });

  t.test('returns skewness and kurtosis', t => {
    const data = [1, 1, 1, 2, 5, 8, 12, 15, 20];
    const result = streamStats(data);
    t.ok(approx(result.skewness, skewness(data), 1e-6));
    t.ok(approx(result.kurtosis, kurtosis(data) - 3, 1e-6));
  });

  t.test('returns sampleVariance', t => {
    const data = [2, 4, 6, 8, 10];
    const result = streamStats(data);
    t.equal(typeof result.sampleVariance, 'number');
    t.ok(result.sampleVariance > result.variance);
  });
});

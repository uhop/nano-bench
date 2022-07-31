import {measure} from '../src/runner.js';
import {mean, bootstrap, getWeightedValue} from '../src/stats.js';
import {prepareTimeFormat, formatTime, abbrNumber} from '../src/formatters.js';
import kstest from '../src/kstest.js';

const ALPHA = 0.05; // confidence is 95%

const numericSortingAsc = (a, b) => a - b;

const print = (label, stats, nSeries) => {
  const reps = stats.reps;
  stats.ensureSorted().normalizeReps();

  // classics
  // const median = getWeightedValue(stats.data),
  //   lo = getWeightedValue(stats.data, ALPHA / 2),
  //   hi = getWeightedValue(stats.data, 1 - ALPHA / 2),
  //   timeFormat = prepareTimeFormat([median, lo, hi, median - lo, hi - median], 1000),
  //   plus = formatTime(hi - median, timeFormat),
  //   minus = formatTime(median - lo, timeFormat);

  // bootstrap
  const median = mean(
      bootstrap(samples => getWeightedValue(samples.sort(numericSortingAsc)), stats.data)
    ),
    lo = mean(
      bootstrap(samples => getWeightedValue(samples.sort(numericSortingAsc), ALPHA / 2), stats.data)
    ),
    hi = mean(
      bootstrap(
        samples => getWeightedValue(samples.sort(numericSortingAsc), 1 - ALPHA / 2),
        stats.data
      )
    ),
    timeFormat = prepareTimeFormat([median, lo, hi, median - lo, hi - median], 1000),
    plus = formatTime(hi - median, timeFormat),
    minus = formatTime(median - lo, timeFormat);

  console.log(
    label,
    'median',
    formatTime(median, timeFormat),
    plus === minus ? '±' + plus : '+' + plus + ' -' + minus,
    'for',
    abbrNumber(reps),
    'iterations in',
    abbrNumber(nSeries),
    'series'
  );
};

const compare = async (label1, fn1, label2, fn2, options = {}, options1 = {}, options2 = {}) => {
  const stats1 = await measure(fn1, Object.assign({}, options, options1));
  stats1.ensureSorted();

  const stats2 = await measure(fn2, Object.assign({}, options, options2));
  stats2.ensureSorted();

  const {alpha = ALPHA} = options || {};
  const results = kstest(stats1.data, stats2.data, alpha);

  print(label1, stats1, options1?.nSeries || options?.nSeries || 100);
  print(label2, stats2, options2?.nSeries || options?.nSeries || 100);
  console.log(
    'The difference is statistically ' +
      (results.rejected ? 'SIGNIFICANT' : 'insignificant') +
      '.\n'
  );
};

await compare(
  'String:',
  n => {
    let x = '';
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) x = a + '-' + b;
  },
  'Backticks:',
  n => {
    let x = '';
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) x = `${a}-${b}`;
  }
);

await compare(
  'String fn:',
  n => {
    let x = '';
    const a = 'a',
      b = 'b';
    const fn = (...args) => args.join('');
    for (let i = 0; i < n; ++i) x = fn(a, '-', b);
  },
  'Backtick fn:',
  n => {
    let x = '';
    const a = 'a',
      b = 'b';
    const fn = (parts, ...args) => parts[0] + args.map((arg, i) => arg + parts[i + i]).join('');
    for (let i = 0; i < n; ++i) x = fn`${a}-${b}`;
  }
);

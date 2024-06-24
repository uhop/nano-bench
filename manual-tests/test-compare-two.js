import {measure, wrapper} from 'nano-bench/bench/runner.js';
import {abbrNumber, formatTime, prepareTimeFormat} from 'nano-bench/formatters.js';
import {mean, getWeightedValue, bootstrap} from 'nano-bench/stats.js';

const ALPHA = 0.05; // confidence is 95%

const numericSortingAsc = (a, b) => a - b;

const measureFn = async (label, fn, nSeries = 100) => {
  const stats = await measure(fn, {nSeries, DataArray: Float64Array}),
    reps = stats.reps;

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
      bootstrap(
        samples => getWeightedValue(samples.sort(numericSortingAsc), ALPHA / 2),
        stats.data
      )
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

await measureFn('Case "no actions":', n => {
  for (let i = 0; i < n; ++i);
});

await measureFn('Case "addition":  ', n => {
  let x = 0;
  const a = 1,
    b = 2;
  for (let i = 0; i < n; ++i) x = a + b;
});

await measureFn(
  'Case "empty fn":  ',
  wrapper(() => {})
);

await measureFn('Case "sum fn":    ', n => {
  let x = 0;
  const a = 1,
    b = 2;
  const fn = () => (x = a + b);
  for (let i = 0; i < n; ++i) fn();
});

await measureFn('Case "strings":   ', n => {
  let x = '';
  const a = 'a',
    b = 'b';
  for (let i = 0; i < n; ++i) x = a + '-' + b;
});

await measureFn('Case "strings fn":', n => {
  let x = '';
  const a = 'a',
    b = 'b';
  const fn = (...args) => args.join('');
  for (let i = 0; i < n; ++i) x = fn(a, '-', b);
});

await measureFn('Case "backticks": ', n => {
  let x = '';
  const a = 'a',
    b = 'b';
  for (let i = 0; i < n; ++i) x = `${a}-${b}`;
});

await measureFn('Case "backticks*":', n => {
  let x = '';
  const a = 'a',
    b = 'b';
  const fn = (parts, ...args) => parts[0] + args.map((arg, i) => arg + parts[i + i]).join('');
  for (let i = 0; i < n; ++i) x = fn`${a}-${b}`;
});

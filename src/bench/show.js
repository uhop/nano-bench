import compare from './compare.js';
import {mean, bootstrap, getWeightedValue} from '../stats.js';
import {prepareTimeFormat, formatTime, formatInteger, formatNumber, abbrNumber} from '../formatters.js';

const ALPHA = 0.05,
  N_SERIES = 100,
  BOOTSTRAP = 1000;

const numericSortingAsc = (a, b) => a - b;
const getPercentile = weight => samples =>
  getWeightedValue(samples.sort(numericSortingAsc), weight);

const show = async (inputs, options) => {
  options = Object.assign({alpha: ALPHA, nSeries: N_SERIES, bootstrap: BOOTSTRAP}, options);
  console.log(
    `\nmeasuring (confidence interval: ${formatNumber(100 * (1 - options.alpha), {
      decimals: 2
    })}%, series: ${formatInteger(options.nSeries)}, bootstrap samples: ${formatInteger(
      options.bootstrap
    )}) ...\n`
  );
  const results = await compare(inputs, options),
    b = options.bootstrap,
    data = results.data,
    keys = Object.keys(inputs);

  for (let i = 0; i < keys.length; ++i) {
    // bootstrap
    const median = mean(bootstrap(getPercentile(0.5), data[i], b)),
      lo = mean(bootstrap(getPercentile(options.alpha / 2), data[i], b)),
      hi = mean(bootstrap(getPercentile(1 - options.alpha / 2), data[i], b)),
      timeFormat = prepareTimeFormat([median, lo, hi, median - lo, hi - median], 1000),
      plus = formatTime(hi - median, timeFormat),
      minus = formatTime(median - lo, timeFormat);

    console.log(
      '"' + keys[i] + '":',
      'median',
      formatTime(median, timeFormat),
      plus === minus ? '±' + plus : '+' + plus + ' -' + minus,
      'for',
      abbrNumber(results.reps[i]),
      'iterations in',
      abbrNumber(options.nSeries),
      'series'
    );
  }

  console.log(
    '\nThe difference is ' +
      (results.different ? 'STATISTICALLY SIGNIFICANT!' : 'statistically insignificant.')
  );

  if (!results.different || !results.groupDifference) return;

  console.log('\nA statistically significant difference between groups:\n');

  for (let i = 0, k = results.groupDifference.length; i < k; ++i) {
    for (let j = i + 1; j < k; ++j) {
      if (results.groupDifference[i][j]) {
        console.log('"' + keys[i] + '" and "' + keys[j] + '"');
      }
    }
  }
};

export default show;

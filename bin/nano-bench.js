#!/usr/bin/env node

import process from 'node:process';

import {Option, program} from 'commander';

import {CURSOR_NORMAL, CURSOR_INVISIBLE, CLEAR_EOL} from 'console-toolkit/ansi';
import {infinity, minus, multiplication} from 'console-toolkit/symbols.js';
import {
  abbrNumber,
  compareDifference,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import style, {c} from 'console-toolkit/style';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';
import Writer from 'console-toolkit/output/writer.js';
import Updater from 'console-toolkit/output/updater.js';

import {findLevel, benchmarkSeries, benchmarkSeriesPar} from '../src/bench/runner.js';
import {bootstrap, getWeightedValue, mean} from '../src/stats.js';
import mwtest from '../src/significance/mwtest.js';
import kwtest from '../src/significance/kwtest.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  toInt = value => parseInt(value),
  toFloat = value => parseFloat(value);

program
  .name('nano-bench')
  .description('Small utility to benchmark and compare code.')
  .version('1.0.0')
  .argument('<file>', 'File to benchmark')
  .option('-m, --ms <ms>', 'measurement time in milliseconds', toInt, 50)
  .addOption(
    new Option('-i, --iterations <iterations>', 'measurement iterations (overrides --ms)')
      .conflicts('ms')
      .argParser(toInt)
  )
  .option('--min-iterations <min-iterations>', 'minimum number of iterations', toInt, 1)
  .option('-e, --export <name>', 'name of the export in the file', 'default')
  .option('-a, --alpha <alpha>', 'significance level', toFloat, 0.05)
  .option('-s, --samples <samples>', 'number of samples', toInt, 100)
  .option('-p, --parallel', 'take samples in parallel asynchronously')
  .option('-b, --bootstrap <bootstrap>', 'number of bootstrap samples', toInt, 1000)
  .showHelpAfterError('(add --help to see available options)');

program.parse();

const options = program.opts(),
  args = program.args;

// validate the options

if (options.minIterations < 1) program.error('The minimum number of iterations must be >= 1');
if (options.alpha <= 0 || options.alpha >= 1)
  program.error('The significance level must be > 0 and < 1');
if (options.samples < 1) program.error('The number of samples must be >= 1');
if (options.bootstrap < 1) program.error('The number of bootstrap samples must be >= 1');

// open the file

const fileName = new URL(args[0], `file://${process.cwd()}/`);

let fns;
try {
  const file = await import(fileName);
  fns = file[options.export];
} catch (error) {
  program.error(`File not found: ${args[0]} (${fileName})`);
}

if (!fns) program.error(`Export not found: ${options.export}`);

const names = Object.keys(fns).filter(name => typeof fns[name] == 'function');
if (names.length < 1) {
  program.error('The exported object has no functions to measure');
}

// set up the writer and the updater

const writer = new Writer();

let updater;

process.once('exit', () => updater?.done());
process.once('SIGINT', async () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));

// setup running the benchmark

const numericSortingAsc = (a, b) => a - b;
const getPercentile = weight => samples =>
  getWeightedValue(samples.sort(numericSortingAsc), weight);

const getStats = samples => {
  samples.sort(numericSortingAsc);
  const median = getWeightedValue(samples, 0.5),
    lo = getWeightedValue(samples, options.alpha / 2),
    hi = getWeightedValue(samples, 1 - options.alpha / 2);
  return {median, lo, hi, bootstrap: false};
};

const getBootstrapStats = samples => {
  const median = mean(bootstrap(getPercentile(0.5), samples, options.bootstrap)),
    lo = mean(bootstrap(getPercentile(options.alpha / 2), samples, options.bootstrap)),
    hi = mean(bootstrap(getPercentile(1 - options.alpha / 2), samples, options.bootstrap));
  return {median, lo, hi, bootstrap: true};
};

const normalizeSamples = (samples, batchSize) => {
  for (let i = 0; i < samples.length; ++i) {
    samples[i] /= batchSize;
  }
  return samples;
};

const benchSeries = options.parallel ? benchmarkSeriesPar : benchmarkSeries;

let iterations = [];
if (options.iterations > 0) {
  iterations = new Array(names.length).fill(Math.max(options.iterations, options.minIterations));
}

const results = [],
  stats = [];
let significance = null;

const tableHeader1 = [
    {value: '#', height: 2, align: 'dc'},
    {value: 'name', height: 2, align: 'dc'},
    {value: 'time', width: 3, align: 'c'},
    null,
    null,
    {value: 'op/s', height: 2, align: 'dc'},
    {value: 'batch', height: 2, align: 'dc'}
  ],
  tableHeader2 = [
    null,
    null,
    {value: 'median', align: 'c'},
    {value: '+', align: 'c'},
    {value: minus, align: 'c'},
    null,
    null
  ];

if (names.length > 1) {
  tableHeader1.push({value: 'SSD', width: names.length, align: 'c'});
  for (let i = 0; i < names.length; ++i) {
    if (i) tableHeader1.push(null);
    tableHeader2.push({value: i + 1, align: 'c'});
  }
}

const makeTableData = () => {
  const tableData = [tableHeader1, tableHeader2];
  for (let i = 0; i < names.length; ++i) {
    const row = [i + 1, names[i]],
      s = stats[i];
    if (s) {
      const format = prepareTimeFormat([s.median - s.lo, s.median, s.hi - s.median], 1000);
      row.push(
        {value: formatTime(s.median, format), align: 'r'},
        {value: '+' + formatTime(s.hi - s.median, format), align: 'r'},
        {value: minus + formatTime(s.median - s.lo, format), align: 'r'},
        {value: abbrNumber(1000 / s.median), align: 'r'}
      );
    } else if (i == stats.length) {
      row.push({value: 'measuring...', width: 4}, null, null, null);
    } else {
      row.push(null, null, null, null);
    }
    row.push(i < iterations.length ? {value: abbrNumber(iterations[i]), align: 'r'} : null);
    if (names.length > 1) {
      const sign = significance?.[i];
      if (sign) {
        for (let j = 0; j < sign.length; ++j) {
          if (!sign[j]) {
            row.push(null);
            continue;
          }
          const result = compareDifference(stats[i].median, stats[j].median);
          let text = '';
          if (result.ratio) {
            text = result.ratio + multiplication;
          } else if (result.percentage) {
            text = result.percentage + '%';
          } else if (result.infinity) {
            text = infinity;
          }
          if (!text) {
            row.push(null);
            continue;
          }
          row.push({value: text + ' ' + (result.less ? 'faster' : 'slower'), align: 'c'});
        }
      } else {
        row.push(...new Array(names.length).fill(null));
      }
    }
    tableData.push(row);
  }
  return tableData;
};

// find the level

const report = () => {
  const tableData = makeTableData(),
    table = makeTable(tableData, lineTheme);
  table.vAxis[2] = 2;
  return table.toStrings();
};

updater = new Updater(
  report,
  {prologue: CURSOR_INVISIBLE, epilogue: CURSOR_NORMAL, afterLine: CLEAR_EOL},
  writer
);

while (iterations.length < names.length) {
  const index = iterations.length,
    fn = fns[names[index]];

  iterations.push(0);

  const batchSize = await findLevel(
    fn,
    {threshold: options.ms, startFrom: options.minIterations},
    async (name, data) => {
      if (name === 'finding-level-next') {
        iterations[index] = data.n;
        await updater.update();
        await sleep(5);
      }
    }
  );

  iterations[index] = batchSize;
  await updater.update();
}

// run the benchmark

for (let i = 0; i < iterations.length; ++i) {
  const batchSize = iterations[i],
    samples = await benchSeries(fns[names[i]], batchSize, {nSeries: options.samples});
  normalizeSamples(samples, batchSize);
  results.push(samples);
  stats.push(getStats(samples));
  await updater.update();
  await sleep(5);
  stats[i] = getBootstrapStats(samples);
  await updater.update();
  await sleep(5);
}

// calculate significance

if (results.length > 1) {
  for (const samples of results) samples.sort(numericSortingAsc);
  if (results.length == 2) {
    const result = mwtest(results[0], results[1], options.alpha);
    significance = [
      [false, result.different],
      [result.different, false]
    ];
  } else {
    const result = kwtest(results, options.alpha);
    significance = result.groupDifference;
  }
}

await updater.final();

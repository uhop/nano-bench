#!/usr/bin/env node

import process from 'node:process';

import {program} from 'commander';

import {CURSOR_NORMAL, CURSOR_INVISIBLE, CLEAR_EOS} from 'console-toolkit/ansi';
import {
  formatInteger,
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import style, {c} from 'console-toolkit/style';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';
import Writer from 'console-toolkit/output/writer.js';
import Updater from 'console-toolkit/output/updater.js';

import {findLevel, benchmark} from '../src/bench/runner.js';
import {MedianCounter} from '../src/stream-median.js';
import {StatCounter} from '../src/stream-stats.js';
import {abbrNumber} from 'console-toolkit/alphanumeric/number-formatters.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

program
  .name('nano-watch')
  .description('Small utility to continuously benchmark code.')
  .version('1.0.0')
  .argument('<file>', 'File to benchmark')
  .argument('[method]', 'Method name to benchmark')
  .option('-m, --ms <ms>', 'milliseconds per iteration', value => parseInt(value), 500)
  .option('-i, --iterations <number>', 'number of iterations (default: Infinity)', value =>
    parseInt(value)
  )
  .option('-e, --export <name>', 'name of the export in the file', 'default')
  .showHelpAfterError('(add --help to see available options)');

program.parse();

const options = program.opts(),
  args = program.args;

const fileName = new URL(args[0], `file://${process.cwd()}/`);

let fn;
try {
  const file = await import(fileName);
  fn = file[options.export];
} catch (error) {
  program.error(`File not found: ${args[0]} (${fileName})`);
}

if (!fn) program.error(`Export not found: ${options.export}`);
if (args[1]) fn = fn[args[1]];
if (typeof fn != 'function')
  program.error(
    `Function not found (export: ${options.export}${args[1] ? `, method: ${args[1]}` : ''})`
  );

const iterations =
  isNaN(options.iterations) || options.iterations <= 0 ? Infinity : options.iterations;

const writer = new Writer();

let updater;

process.once('exit', () => updater?.final());
process.once('SIGINT', async () => {
  updater && (await updater.final());
  updater = null;
  process.exit(0);
});
process.once('SIGTERM', () => process.exit(143));

function reportFindLevel(state) {
  switch (state) {
    case 'active':
      const format = prepareTimeFormat([this.data.time], 1000),
        time = formatTime(this.data.time, format);
      return c`${CLEAR_EOS}Batch size: {{save.bright.cyan}}${formatInteger(
        this.data.n
      )}{{restore}}, time: {{bright.cyan}}${time}`;
    case 'finished':
      return c`${CLEAR_EOS}Batch size: {{bright.cyan}}${formatInteger(this.data.n)}`;
  }
  return [];
}

updater = new Updater(
  reportFindLevel,
  {prologue: CURSOR_INVISIBLE, epilogue: CURSOR_NORMAL},
  writer
);

const batchSize = await findLevel(fn, {threshold: options.ms}, async (name, data) => {
  if (name === 'finding-level-next') {
    updater.data = data;
    await updater.update();
    await sleep(5);
  }
});

updater.data = {n: batchSize};
await updater.final();
updater = null;

const medianCounter = new MedianCounter();
const statCounter = new StatCounter();

const formatTimeLocal = (value, format) => {
  let result = (value * format.scale).toFixed(format.precision);
  return result + format.unit;
};

const showData = time => {
  time /= batchSize;
  medianCounter.add(time);
  statCounter.add(time);

  const m = process.memoryUsage(),
    median = medianCounter.get(),
    stdDev = Math.sqrt(statCounter.variance),
    format = prepareTimeFormat([statCounter.mean, stdDev, median], 1000),
    tableData = [
      ['count', 'time', 'mean', 'stdDev', 'median', 'skewness', 'kurtosis'],
      [style.bright.yellow.text(formatInteger(statCounter.count))]
        .concat(
          [time, statCounter.mean, stdDev, median]
            .map(value => formatTimeLocal(value, format))
            .map(value => style.bright.yellow.text(value))
        )
        .concat(
          [statCounter.skewness, statCounter.kurtosis]
            .map(value => formatNumber(value, {precision: 3}))
            .map(value => style.bright.yellow.text(value))
        ),
      [
        style.bold.text('op/s'),
        style.bright.yellow.text(abbrNumber(1000 / time)),
        style.bright.yellow.text(abbrNumber(1000 / statCounter.mean)),
        null,
        style.bright.yellow.text(abbrNumber(1000 / median)),
        null,
        null
      ],
      [
        style.bold.text('memory'),
        {
          value: c`{{save.bold}}used:{{restore}} {{bright.cyan}}${abbrNumber(m.heapUsed)}`,
          width: 2
        },
        null,
        {
          value: c`{{save.bold}}total:{{restore}} {{bright.cyan}}${abbrNumber(m.heapTotal)}`,
          width: 2
        },
        null,
        {value: c`{{save.bold}}rss:{{restore}} {{bright.cyan}}${abbrNumber(m.rss)}`, width: 2},
        null
      ]
    ],
    table = makeTable(tableData, lineTheme, {hAlignDefault: 'r', states: {rowFirst: style.bold}});

  table.vAxis[3] = 2;

  return table.toStrings();
};

function reportBenchmark(state) {
  switch (state) {
    case 'active':
    case 'finished': {
      const strings = showData(this.data.time);
      return `${CLEAR_EOS}${strings.join('\n')}`;
    }
  }
  return [];
}

updater = new Updater(
  reportBenchmark,
  {prologue: CURSOR_INVISIBLE, epilogue: CURSOR_NORMAL},
  writer
);

for (let i = 0; i < iterations; ++i) {
  const time = await benchmark(fn, batchSize);
  updater.data = {time, iteration: i};
  await updater.update();
  await sleep(5);
}

await updater.final();
updater = null;

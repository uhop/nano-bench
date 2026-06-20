#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';

import {Option, program} from 'commander';

import {CURSOR_NORMAL, CURSOR_INVISIBLE, CLEAR_EOL} from 'console-toolkit/ansi';
import {
  formatInteger,
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import {c} from 'console-toolkit/style.js';
import Writer from 'console-toolkit/output/writer.js';
import Updater from 'console-toolkit/output/updater.js';

import {findLevel, benchmarkSeries, benchmarkSeriesPar} from '../src/bench/runner.js';
import {exactSummary, bootstrapSummary, mean, stdDev} from '../src/stats.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {corrections} from '../src/significance/correction.js';
import {mulberry32} from '../src/utils/prng.js';
import {summaryTable} from '../src/bench/render/summary-table.js';
import {writeSignificance} from '../src/bench/render/significance-table.js';
import selectFunctions from '../src/bench/select-functions.js';
import {bodyHash} from '../src/utils/body-hash.js';
import {captureEnvironment} from '../src/bench/results/environment.js';
import {buildResultsObject} from '../src/bench/results/build.js';
import {computeHistograms, binCount} from '../src/bench/histogram.js';
import {writeHistograms} from '../src/bench/render/histogram-chart.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  toInt = value => parseInt(value),
  toFloat = value => parseFloat(value);

const filePath = new URL('../package.json', import.meta.url),
  pkg = JSON.parse(await readFile(filePath, {encoding: 'utf8'}));

const showSelf = () => {
  const self = new URL(import.meta.url);
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self));
  } else {
    console.log(self);
  }
  process.exit(0);
};

program
  .name('nano-bench')
  .version(pkg.version)
  .description('Benchmark and compare code.')
  .argument('<file>', 'File to benchmark.\nIf "self", returns its file name to stdout and exits')
  .argument(
    '[methods...]',
    'function names to benchmark; omit to run all (one name = baseline, no significance test)'
  )
  .option('-m, --ms <ms>', 'measurement time in milliseconds', toInt, 50)
  .addOption(
    new Option('-i, --iterations <iterations>', 'measurement iterations (overrides --ms)')
      .conflicts('ms')
      .argParser(toInt)
  )
  .option('--min-iterations <min-iterations>', 'minimum number of iterations', toInt, 1)
  .option('-e, --export <name>', 'name of the export', 'default')
  .option('-a, --alpha <alpha>', 'significance level', toFloat, 0.05)
  .addOption(
    new Option('--correction <method>', 'post-hoc multiple-comparison correction')
      .choices(corrections)
      .default('holm')
  )
  .option('-s, --samples <samples>', 'number of samples', toInt, 100)
  .option('-p, --parallel', 'collect samples in parallel')
  .option('-b, --bootstrap <bootstrap>', 'number of bootstrap samples', toInt, 1000)
  .option('--seed <seed>', 'bootstrap RNG seed (32-bit integer; default: random)', toInt)
  .option('--json <file>', 'write results to a JSON file')
  .option('--label <label>', 'free-form run label recorded in the JSON')
  .option('-H, --host', 'record os.hostname() in the JSON')
  .option('--host-name <name>', 'record a custom machine name in the JSON (overrides --host)')
  .option(
    '-o, --observe',
    'emit User Timing marks at phase boundaries (PerformanceObserver/DevTools)'
  )
  .option('-v, --verbose', 'show significance test statistics and critical values')
  .option('--histogram', 'show a distribution histogram per function')
  .addOption(
    new Option('--chart <type>', 'histogram orientation')
      .choices(['columns', 'bars'])
      .default('columns')
  )
  .option(
    '--bins <bins>',
    'histogram bin count (default: auto, scaled to samples and terminal size)',
    toInt
  )
  .option('--no-emoji', 'use ASCII fastest/slowest markers (F/S) instead of emoji')
  .option('--self', 'print the file name to stdout and exit')
  .showHelpAfterError('(add --help to see available options)');

program.on('option:self', showSelf);

program.parse();

const options = program.opts(),
  args = program.args;

if (args[0] === 'self') showSelf();

// validate the options

if (options.minIterations < 1) program.error('The minimum number of iterations must be >= 1');
if (options.alpha <= 0 || options.alpha >= 1)
  program.error('The significance level must be > 0 and < 1');
if (options.samples < 1) program.error('The number of samples must be >= 1');
if (options.bootstrap < 1) program.error('The number of bootstrap samples must be >= 1');

// open the file

const fileName = pathToFileURL(path.join(process.cwd(), args[0]));

let fns;
try {
  const file = await import(fileName.href);
  fns = file[options.export];
} catch (error) {
  program.error(`File not found: ${args[0]} (${fileName})`);
}

if (!fns) program.error(`Export not found: ${options.export}`);

let names;
try {
  names = selectFunctions(fns, args.slice(1));
} catch (error) {
  program.error(error.message);
}

// set up the writer and the updater

const writer = new Writer();
let updater;

process.once('exit', () => updater?.done());
process.once('SIGINT', async () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));

const normalizeSamples = (samples, batchSize) => {
  for (let i = 0; i < samples.length; ++i) {
    samples[i] /= batchSize;
  }
  return samples;
};

const benchSeries = options.parallel ? benchmarkSeriesPar : benchmarkSeries;

const seed = (options.seed ?? Math.random() * 2 ** 32) >>> 0;

let iterations = [];
if (options.iterations > 0) {
  iterations = new Array(names.length).fill(Math.max(options.iterations, options.minIterations));
}

await writer.write([
  c`{{bold.save.bright.cyan}}${program.name()}{{restore}} {{save.bright.yellow}}${program.version()}{{restore}}: ${program.description()}`,
  '',
  c`Confidence interval: {{save.bright.yellow}}${formatNumber(100 * (1 - options.alpha), {decimals: 2})}%{{restore}} bootstrap-percentile of the median ({{save.bright.yellow}}${formatInteger(
    options.bootstrap
  )}{{restore}} resamples), samples: {{save.bright.yellow}}${formatInteger(
    options.samples
  )}{{restore}}`,
  iterations.length
    ? c`Measuring {{save.bright.yellow}}${formatInteger(
        iterations[0]
      )}{{restore}} iterations per sample ({{save.bright.yellow}}${formatInteger(
        iterations[0] * options.samples
      )}{{restore}} per function)`
    : c`Measuring {{save.bright.yellow}}${formatTime(
        options.ms,
        prepareTimeFormat([options.ms], 1000)
      )}{{restore}} per sample (~{{save.bright.yellow}}${formatTime(
        options.ms * 2 * options.samples,
        prepareTimeFormat([options.ms * 2 * options.samples], 1000)
      )}{{restore}} per function)`,
  ''
]);

const results = [],
  stats = [];

const report = () => summaryTable(names, stats, iterations);

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
    {
      threshold: options.ms,
      startFrom: options.minIterations,
      observe: options.observe ? names[index] : undefined
    },
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
    samples = await benchSeries(fns[names[i]], batchSize, {
      nSeries: options.samples,
      observe: options.observe ? names[i] : undefined
    });
  normalizeSamples(samples, batchSize);
  results.push(samples);
  stats.push({...exactSummary(samples, {alpha: options.alpha}), bootstrap: false});
  await updater.update();
  await sleep(5);
  stats[i] = {
    ...bootstrapSummary(samples, {
      alpha: options.alpha,
      bootstrap: options.bootstrap,
      random: mulberry32((seed + Math.imul(i, 0x9e3779b9)) >>> 0)
    }),
    bootstrap: true
  };
  await updater.update();
  await sleep(5);
}

await updater.final();
updater = null;

let significance = null;
if (results.length > 1) {
  const testResult = computeSignificance(results, options.alpha, options.correction),
    matrix = significanceMatrix(testResult);
  significance = testResult;
  writeSignificance(writer, {
    testResult,
    matrix,
    stats,
    names,
    results,
    alpha: options.alpha,
    correction: options.correction,
    verbose: options.verbose,
    emoji: options.emoji
  });
}

if (options.histogram) {
  // columns are bound by terminal width (1 col/bin); bars by terminal height (1 row/bin)
  const budget =
    options.chart === 'bars'
      ? Math.max(8, (writer.size.rows || 24) - 8)
      : Math.max(16, (writer.columns || 80) - 2);
  writeHistograms(writer, {
    names,
    hist: computeHistograms(results, {
      bins: options.bins || binCount(options.samples, budget),
      maxBins: budget
    }),
    orientation: options.chart,
    emoji: options.emoji
  });
}

if (options.json) {
  const obj = buildResultsObject({
    pkg,
    createdAt: new Date().toISOString(),
    label: options.label,
    source: {file: args[0], export: options.export, methods: names},
    environment: captureEnvironment({host: options.host, hostName: options.hostName}),
    params: {
      ...(options.iterations > 0 ? {iterations: options.iterations} : {ms: options.ms}),
      minIterations: options.minIterations,
      samples: options.samples,
      bootstrap: options.bootstrap,
      seed,
      alpha: options.alpha,
      correction: options.correction,
      parallel: Boolean(options.parallel)
    },
    series: names.map((name, i) => ({
      name,
      bodyHash: bodyHash(fns[name]),
      reps: iterations[i],
      samples: results[i],
      summary: {
        median: stats[i].median,
        lo: stats[i].lo,
        hi: stats[i].hi,
        mean: mean(results[i]),
        stdDev: stdDev(results[i]),
        opsPerSec: 1000 / stats[i].median,
        ci: 'bootstrap-percentile'
      }
    })),
    significance
  });
  await writeFile(options.json, JSON.stringify(obj, null, 2) + '\n');
}

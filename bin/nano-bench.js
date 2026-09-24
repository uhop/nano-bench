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

import {
  findLevel,
  benchmarkSeries,
  benchmarkSeriesPar,
  benchmarkRounds
} from '../src/bench/runner.js';
import {exactSummary, bootstrapSummary, mean, stdDev, getWeightedValue} from '../src/stats.js';
import {runChild, isolationPlan, fastestPerRound} from '../src/bench/isolate.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {corrections} from '../src/significance/correction.js';
import {mulberry32} from '../src/utils/prng.js';
import {numericAsc} from '../src/utils/numeric-asc.js';
import {multimodalityP} from '../src/bench/results/series.js';
import {summaryTable} from '../src/bench/render/summary-table.js';
import {progressLine} from '../src/bench/render/progress.js';
import {writeSignificance} from '../src/bench/render/significance-table.js';
import {smokeTable} from '../src/bench/render/smoke-table.js';
import selectFunctions from '../src/bench/select-functions.js';
import smokeRun from '../src/bench/smoke.js';
import {bodyHash} from '../src/utils/body-hash.js';
import {captureEnvironment} from '../src/bench/results/environment.js';
import {buildResultsObject} from '../src/bench/results/build.js';
import {computeHistograms, binCount} from '../src/bench/histogram.js';
import {writeHistograms} from '../src/bench/render/histogram-chart.js';

const pText = p => (p <= 1 / 201 ? 'p < 0.01' : 'p ≈ ' + formatNumber(p, {decimals: 2}));

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
  .addOption(
    new Option(
      '--order <order>',
      'sample order: one sample of each function per round, or each function in turn'
    )
      .choices(['interleaved', 'sequential'])
      .default('interleaved')
      .conflicts('parallel')
  )
  .addOption(
    new Option('--isolate', 'measure each function in its own process').conflicts('parallel')
  )
  .option('--repeat <n>', 'with --isolate: processes per function', toInt, 1)
  .addOption(new Option('--emit-samples', 'internal: child mode of --isolate').hideHelp())
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
  .option('--smoke', 'run each function once to verify the module, then exit (non-zero on failure)')
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
if (options.repeat < 1) program.error('The number of processes per function must be >= 1');
if (options.repeat > 1 && !options.isolate) program.error('--repeat needs --isolate');

// open the file

const fileName = pathToFileURL(path.resolve(process.cwd(), args[0]));

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

if (options.emitSamples) {
  if (!(options.iterations > 0) || names.length !== 1)
    program.error('--emit-samples is internal to --isolate: it needs -i and one function');
  // benchmarkRounds keeps time order, so the parent knows which sample came first
  const [samples] = await benchmarkRounds([fns[names[0]]], [options.iterations], {
    nSeries: options.samples
  });
  const out = JSON.stringify(samples.map(time => time / options.iterations)) + '\n';
  await new Promise(resolve => process.stdout.write(out, () => resolve(undefined)));
  process.exit(0);
}

// set up the writer and the updater

const writer = new Writer();
let updater;

process.once('exit', () => updater?.done());
process.once('SIGINT', async () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));

if (options.smoke) {
  await writer.write([
    c`{{bold.save.bright.cyan}}${program.name()}{{restore}} {{save.bright.yellow}}${program.version()}{{restore}}: smoke run, each function once (n = 1)`,
    ''
  ]);
  const smoke = await smokeRun(fns, names);
  await writer.write(smokeTable(smoke));
  const failed = smoke.filter(result => !result.ok).length;
  await writer.write([
    '',
    failed
      ? c`{{save.bright.red}}Failed: ${failed} of ${smoke.length}{{restore}}`
      : c`{{save.bright.green}}All ${smoke.length} passed{{restore}}`
  ]);
  process.exit(failed ? 1 : 0);
}

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
  ...(options.isolate
    ? [
        c`Isolated: each function in its own process, {{save.bright.yellow}}${formatInteger(
          options.repeat
        )}{{restore}} per function (${options.order}); the first sample of each process is dropped`
      ]
    : []),
  ''
]);

const results = [],
  stats = [];

let progress = null;
const setProgress = (label, done, total, startedAt) => {
  const remainingMs =
    startedAt !== undefined && done > 0
      ? ((performance.now() - startedAt) / done) * (total - done)
      : undefined;
  progress = {label, done, total, remainingMs};
};

// the final frame drops the progress line: the table is all that remains
const report = state => {
  const lines = summaryTable(names, stats, iterations);
  if (state !== 'finished' && progress) lines.push(progressLine(progress));
  return lines;
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
  setProgress(
    `calibrating ${names[index]} (${index + 1} of ${names.length})`,
    index + 1,
    names.length
  );

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

const summarize = async i => {
  setProgress(`bootstrapping ${names[i]} (${i + 1} of ${names.length})`, i + 1, names.length);
  await updater.update();
  stats[i] = {
    ...bootstrapSummary(results[i], {
      alpha: options.alpha,
      bootstrap: options.bootstrap,
      random: mulberry32((seed + Math.imul(i, 0x9e3779b9)) >>> 0)
    }),
    bootstrap: true
  };
  await updater.update();
  await sleep(5);
};

const median = samples => getWeightedValue(samples.slice().sort(numericAsc), 0.5);

// perProcess[fn][round]: the samples of one child process, first sample dropped
let perProcess = null;

if (options.isolate) {
  const script = fileURLToPath(import.meta.url),
    file = fileURLToPath(fileName),
    plan = isolationPlan(names.length, options.repeat, options.order),
    startedAt = performance.now();
  perProcess = names.map(() => []);
  for (let p = 0; p < plan.length; ++p) {
    const {fn: i, round} = plan[p];
    setProgress(
      `process ${p + 1} of ${plan.length}: ${names[i]}` +
        (options.repeat > 1 ? ` (round ${round + 1} of ${options.repeat})` : ''),
      p,
      plan.length,
      startedAt
    );
    await updater.update();
    let samples;
    try {
      samples = await runChild(script, [
        file,
        names[i],
        '-e',
        options.export,
        '-i',
        String(iterations[i]),
        '-s',
        String(options.samples + 1),
        '--emit-samples'
      ]);
    } catch (error) {
      await updater.final();
      updater = null;
      program.error(`${names[i]}: ${error.message}`);
    }
    // a fresh process's first sample pays for JIT warmup
    perProcess[i][round] = samples.slice(1);
    stats[i] = {
      ...exactSummary(perProcess[i].filter(Boolean).flat(), {alpha: options.alpha}),
      bootstrap: false
    };
    await updater.update();
  }
  results.push(...perProcess.map(list => list.flat()));
  for (let i = 0; i < results.length; ++i) await summarize(i);
} else if (!options.parallel && options.order === 'interleaved') {
  const startedAt = performance.now();
  const slices = names.length * options.samples,
    sliceLabel = done =>
      `sampling: round ${Math.min(options.samples, Math.floor(done / names.length) + 1)} of ${options.samples}`;
  setProgress(sliceLabel(0), 0, slices, startedAt);
  const collected = await benchmarkRounds(
    names.map(name => fns[name]),
    iterations,
    {
      nSeries: options.samples,
      observe: options.observe ? 'all' : undefined,
      onSample: async done => {
        setProgress(sliceLabel(done), done, slices, startedAt);
        await updater.update();
      }
    },
    async (_, data) => {
      for (let i = 0; i < data.length; ++i) {
        const provisional = data[i].map(time => time / iterations[i]);
        stats[i] = {...exactSummary(provisional, {alpha: options.alpha}), bootstrap: false};
      }
      await updater.update();
    }
  );
  collected.forEach((samples, i) => normalizeSamples(samples, iterations[i]));
  results.push(...collected);
  for (let i = 0; i < results.length; ++i) await summarize(i);
} else {
  const startedAt = performance.now(),
    total = names.length * options.samples,
    sampling = (i, done) =>
      setProgress(
        options.parallel
          ? `sampling ${names[i]} in parallel (${i + 1} of ${names.length})`
          : `sampling ${names[i]} (${i + 1} of ${names.length}): ${done} of ${options.samples}`,
        i * options.samples + done,
        total,
        startedAt
      );
  for (let i = 0; i < iterations.length; ++i) {
    sampling(i, 0);
    await updater.update();
    const samples = await benchSeries(fns[names[i]], iterations[i], {
      nSeries: options.samples,
      observe: options.observe ? names[i] : undefined,
      onSample: async done => {
        sampling(i, done);
        await updater.update();
      }
    });
    normalizeSamples(samples, iterations[i]);
    results.push(samples);
    stats.push({...exactSummary(samples, {alpha: options.alpha}), bootstrap: false});
    await updater.update();
    await sleep(5);
    await summarize(i);
  }
}

await updater.final();
updater = null;

{
  const warn = options.emoji ? '⚠' : '!';
  for (let i = 0; i < results.length; ++i) {
    // same stream as nano-bench-compare, so a recompare flags the same series
    const p = multimodalityP(results[i].slice().sort(numericAsc), seed, i);
    if (p >= 0.05) continue;
    await writer.write(
      c`{{save.bright.yellow}}${warn}{{restore}} ${names[i]}: distribution looks multimodal (dip test ${pText(p)}) — the median may hide a slow mode; nano-bench-io measures one call per run and reports the tail`
    );
  }
}

let significance = null;
if (results.length > 1) {
  // with several processes per function the process is the unit: pooling their samples
  // would treat a per-process offset as independent evidence
  const byProcess = perProcess && options.repeat > 1,
    tested = byProcess ? perProcess.map(list => list.map(median)) : results,
    testResult = computeSignificance(tested, options.alpha, options.correction),
    matrix = significanceMatrix(testResult);
  significance = byProcess ? {...testResult, unit: 'process-medians'} : testResult;
  if (byProcess) {
    const wins = fastestPerRound(tested),
      tally = names
        .map((name, i) => [name, wins[i]])
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name} ${count} of ${options.repeat}`)
        .join(', ');
    await writer.write([
      '',
      c`{{save.bold}}Processes:{{restore}} ${options.repeat} per function; the test below compares per-process medians`,
      c`Fastest median in each round of processes: ${tally}`
    ]);
  }
  writeSignificance(writer, {
    testResult,
    matrix,
    stats,
    names,
    results: tested,
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
      parallel: Boolean(options.parallel),
      order: options.parallel ? 'parallel' : options.order,
      ...(options.isolate ? {isolate: true, repeat: options.repeat} : {})
    },
    series: names.map((name, i) => ({
      name,
      bodyHash: bodyHash(fns[name]),
      reps: iterations[i],
      samples: results[i],
      ...(perProcess ? {processSizes: perProcess[i].map(list => list.length)} : {}),
      summary: {
        median: stats[i].median,
        lo: stats[i].lo,
        hi: stats[i].hi,
        ciLo: stats[i].ciLo,
        ciHi: stats[i].ciHi,
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

// must be explicit: a module holding live handles would otherwise keep a finished run alive
process.exit(0);

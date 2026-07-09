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

import {collectMacro} from '../src/bench/macro-runner.js';
import runCommand, {commandFunctions} from '../src/bench/command-runner.js';
import {rusageAvailable, rusageDelta} from '../src/bench/metrics.js';
import {procAvailable} from '../src/bench/proc-metrics.js';
import {
  metricsTable,
  metricSpecs,
  guardedMedians,
  metricLegends
} from '../src/bench/render/metrics-table.js';
import {exactSummary, bootstrapSummary, mean, stdDev} from '../src/stats.js';
import quantileSorted from '../src/stats/quantile.js';
import {outlierNotes} from '../src/bench/outlier-notes.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {corrections} from '../src/significance/correction.js';
import {mulberry32} from '../src/utils/prng.js';
import {numericAsc} from '../src/utils/numeric-asc.js';
import {ioSummaryTable} from '../src/bench/render/io-summary-table.js';
import {writeSignificance} from '../src/bench/render/significance-table.js';
import {smokeTable} from '../src/bench/render/smoke-table.js';
import selectFunctions from '../src/bench/select-functions.js';
import smokeRun from '../src/bench/smoke.js';
import {bodyHash, textHash} from '../src/utils/body-hash.js';
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
  .name('nano-bench-io')
  .version(pkg.version)
  .description('Benchmark slow (ms-scale) functions per run: distributions and tails, no batching.')
  .argument('<file>', 'File to benchmark.\nIf "self", returns its file name to stdout and exits')
  .argument(
    '[methods...]',
    'function names to benchmark; omit to run all (one name = baseline, no significance test)'
  )
  .option('-w, --warmup <runs>', 'discarded warmup runs per function', toInt, 0)
  .option('--min-runs <runs>', 'minimum measured runs per function', toInt, 10)
  .option('-t, --budget <ms>', 'time budget per function in milliseconds', toInt, 5000)
  .addOption(
    new Option('-r, --runs <runs>', 'exact number of runs (overrides the stop policy)')
      .conflicts(['budget', 'minRuns', 'stable'])
      .argParser(toInt)
  )
  .option(
    '--stable <pct>',
    'run until the median CI width is <= pct% of the median (overrides --budget)',
    toFloat
  )
  .option('--max-runs <runs>', 'hard cap on measured runs', toInt, 1000)
  .option('-c, --command', 'treat the arguments as shell commands to benchmark, not a module file')
  .option('--prepare <cmd>', 'shell command run (untimed) before every run in command mode')
  .option('-M, --metrics', 'collect per-run system metrics (rusage; Linux /proc for commands)')
  .option('-e, --export <name>', 'name of the export', 'default')
  .option('-a, --alpha <alpha>', 'significance level', toFloat, 0.05)
  .addOption(
    new Option('--correction <method>', 'post-hoc multiple-comparison correction')
      .choices(corrections)
      .default('holm')
  )
  .option('-b, --bootstrap <bootstrap>', 'number of bootstrap samples', toInt, 1000)
  .option('--seed <seed>', 'bootstrap RNG seed (32-bit integer; default: random)', toInt)
  .option('--json <file>', 'write results to a JSON file')
  .option('--label <label>', 'free-form run label recorded in the JSON')
  .option('-H, --host', 'record os.hostname() in the JSON')
  .option('--host-name <name>', 'record a custom machine name in the JSON (overrides --host)')
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

if (options.warmup < 0) program.error('The number of warmup runs must be >= 0');
if (options.minRuns < 1) program.error('The minimum number of runs must be >= 1');
if (options.budget < 1) program.error('The time budget must be >= 1 ms');
if (options.runs !== undefined && options.runs < 1)
  program.error('The number of runs must be >= 1');
if (options.stable !== undefined && options.stable <= 0)
  program.error('The CI width target must be > 0');
if (options.maxRuns < 1) program.error('The maximum number of runs must be >= 1');
if (options.alpha <= 0 || options.alpha >= 1)
  program.error('The significance level must be > 0 and < 1');
if (options.bootstrap < 1) program.error('The number of bootstrap samples must be >= 1');

// open the file (or adapt the commands)

const metricsKind = options.command ? 'proc' : 'rusage',
  metricsOn = options.metrics && (options.command ? procAvailable() : rusageAvailable()),
  metricsByName = new Map();

let fns, names, prepare, teardown;
if (options.command) {
  if (new Set(args).size !== args.length) program.error('Duplicate commands');
  names = args;
  if (metricsOn) for (const name of names) metricsByName.set(name, []);
  fns = commandFunctions(
    names,
    metricsOn
      ? command => ({metrics: reading => metricsByName.get(command).push(reading)})
      : undefined
  );
  if (options.prepare) {
    const prepareCommand = options.prepare;
    prepare = () => runCommand(prepareCommand);
  }
} else {
  const fileName = pathToFileURL(path.resolve(process.cwd(), args[0]));
  try {
    const file = await import(fileName.href);
    fns = file[options.export];
    if (typeof file.prepare == 'function') prepare = file.prepare;
    if (typeof file.teardown == 'function') teardown = file.teardown;
  } catch (error) {
    program.error(`File not found: ${args[0]} (${fileName})`);
  }

  if (!fns) program.error(`Export not found: ${options.export}`);

  try {
    names = selectFunctions(fns, args.slice(1));
  } catch (error) {
    program.error(error.message);
  }
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

const seed = (options.seed ?? Math.random() * 2 ** 32) >>> 0;

const policyLine =
  options.runs > 0
    ? c`Measuring {{save.bright.yellow}}${formatInteger(options.runs)}{{restore}} runs per function (no batching, one call per run)`
    : options.stable > 0
      ? c`Measuring until the median CI width is {{save.bright.yellow}}${formatNumber(options.stable, {decimals: 2})}%{{restore}} of the median (at least ${formatInteger(
          options.minRuns
        )} runs, at most ${formatInteger(options.maxRuns)})`
      : c`Measuring for {{save.bright.yellow}}${formatTime(
          options.budget,
          prepareTimeFormat([options.budget], 1000)
        )}{{restore}} per function (at least ${formatInteger(
          options.minRuns
        )} runs, at most ${formatInteger(options.maxRuns)})`;

await writer.write([
  c`{{bold.save.bright.cyan}}${program.name()}{{restore}} {{save.bright.yellow}}${program.version()}{{restore}}: ${program.description()}`,
  '',
  c`Confidence interval: {{save.bright.yellow}}${formatNumber(100 * (1 - options.alpha), {decimals: 2})}%{{restore}} bootstrap-percentile of the median ({{save.bright.yellow}}${formatInteger(
    options.bootstrap
  )}{{restore}} resamples)`,
  policyLine,
  ''
]);

const results = [],
  stats = [],
  runCounts = names.map(() => 0),
  runMetrics = names.map(() => []),
  notes = [];

const report = () => ioSummaryTable(names, stats, runCounts);

updater = new Updater(
  report,
  {prologue: CURSOR_INVISIBLE, epilogue: CURSOR_NORMAL, afterLine: CLEAR_EOL},
  writer
);

const ciWidth = samples => {
  const s = bootstrapSummary(samples, {
    alpha: options.alpha,
    bootstrap: options.bootstrap,
    random: mulberry32(seed)
  });
  return (100 * (s.hi - s.lo)) / s.median;
};

for (let i = 0; i < names.length; ++i) {
  let samples;
  try {
    samples = await collectMacro(
      fns[names[i]],
      {
        warmup: options.warmup,
        runs: options.runs || 0,
        minRuns: options.minRuns,
        budget: options.budget,
        stable: options.stable || 0,
        maxRuns: options.maxRuns,
        ciWidth: options.stable > 0 ? ciWidth : undefined,
        prepare,
        teardown,
        metricsBefore: metricsOn && !options.command ? () => process.resourceUsage() : undefined,
        metricsAfter:
          metricsOn && !options.command
            ? token => runMetrics[i].push(rusageDelta(token, process.resourceUsage()))
            : undefined
      },
      async (name, data) => {
        if (name === 'macro-run') {
          runCounts[i] = data.n;
          await updater.update();
        }
      }
    );
  } catch (error) {
    program.error(String(error));
  }
  results.push(samples);
  runCounts[i] = samples.length;
  if (metricsOn && options.command) {
    runMetrics[i] = metricsByName.get(names[i]).slice(options.warmup);
  }

  const sorted = samples.slice().sort(numericAsc),
    percentiles = {p90: quantileSorted(sorted, 0.9), p99: quantileSorted(sorted, 0.99)};
  stats.push({...exactSummary(samples, {alpha: options.alpha}), ...percentiles, bootstrap: false});
  await updater.update();
  await sleep(5);
  stats[i] = {
    ...bootstrapSummary(samples, {
      alpha: options.alpha,
      bootstrap: options.bootstrap,
      random: mulberry32((seed + Math.imul(i, 0x9e3779b9)) >>> 0)
    }),
    ...percentiles,
    bootstrap: true
  };
  await updater.update();
  await sleep(5);

  const {note} = outlierNotes(samples);
  if (note) notes.push({name: names[i], note});
}

await updater.final();
updater = null;

if (options.metrics) {
  if (metricsOn) {
    const medians = names.map((_, i) => guardedMedians(runMetrics[i], metricSpecs[metricsKind]));
    await writer.write(['', c`{{save.bold}}Metrics{{restore}} (median per run):`, '']);
    await writer.write(metricsTable(names, medians, metricsKind));
    await writer.write([c`{{save.dim}}${metricLegends[metricsKind]}{{restore}}`, '']);
    if (metricsKind === 'proc') {
      for (let i = 0; i < names.length; ++i) {
        const total = runMetrics[i].length,
          caught = runMetrics[i].filter(Boolean).length;
        if (caught === total) continue;
        notes.push({
          name: names[i],
          note:
            caught * 2 >= total
              ? `metrics captured in ${caught} of ${total} runs (the rest were too short for a /proc reading)`
              : `metrics captured in ${caught} of ${total} runs — below the half threshold, not shown`
        });
      }
    }
  } else {
    notes.push({
      name: '',
      note: options.command
        ? 'command metrics need Linux /proc — not available on this platform'
        : 'metrics not supported on this runtime (process.resourceUsage unavailable)'
    });
  }
}

const warn = options.emoji ? '⚠' : '!';
if (results.some(samples => samples.length < 100)) {
  notes.push({
    name: '',
    note: 'fewer than 100 runs — p99 lands on the few slowest runs and is coarse'
  });
}
for (const {name, note} of notes) {
  await writer.write(c`{{save.bright.yellow}}${warn}{{restore}} ${name ? name + ': ' : ''}${note}`);
}
if (notes.length) await writer.write('');

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
  const budget =
    options.chart === 'bars'
      ? Math.max(8, (writer.size.rows || 24) - 8)
      : Math.max(16, (writer.columns || 80) - 2);
  writeHistograms(writer, {
    names,
    hist: computeHistograms(results, {
      bins: options.bins || binCount(Math.max(...results.map(samples => samples.length)), budget),
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
    source: options.command
      ? {commands: names, ...(options.prepare ? {prepare: options.prepare} : {})}
      : {file: args[0], export: options.export, methods: names},
    environment: captureEnvironment({host: options.host, hostName: options.hostName}),
    params: {
      mode: 'macro',
      ...(options.runs > 0
        ? {runs: options.runs}
        : {minRuns: options.minRuns, budget: options.budget}),
      ...(options.stable > 0 ? {stable: options.stable} : {}),
      ...(metricsOn ? {metrics: metricsKind} : {}),
      maxRuns: options.maxRuns,
      warmup: options.warmup,
      bootstrap: options.bootstrap,
      seed,
      alpha: options.alpha,
      correction: options.correction
    },
    series: names.map((name, i) => ({
      name,
      bodyHash: options.command ? textHash(name) : bodyHash(fns[name]),
      reps: 1,
      samples: results[i],
      ...(metricsOn ? {metrics: runMetrics[i]} : {}),
      summary: {
        median: stats[i].median,
        lo: stats[i].lo,
        hi: stats[i].hi,
        p90: stats[i].p90,
        p99: stats[i].p99,
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

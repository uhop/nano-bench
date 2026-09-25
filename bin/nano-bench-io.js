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

import {collectMacro, collectMacroRounds} from '../src/bench/macro-runner.js';
import {runChild, isolationPlan, fastestPerRound} from '../src/bench/isolate.js';
import findGc, {gcModes} from '../src/bench/gc.js';
import {parseParams, paramsMain} from '../src/bench/params.js';
import detectWarmup from '../src/bench/warmup-detect.js';
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
import dipTest from '../src/stats/dip.js';
import kdeClusters from '../src/stats/kde-modes.js';
import {clustersTable} from '../src/bench/render/clusters-table.js';
import {outlierNotes} from '../src/bench/outlier-notes.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {corrections} from '../src/significance/correction.js';
import {mulberry32} from '../src/utils/prng.js';
import {numericAsc} from '../src/utils/numeric-asc.js';
import {ioSummaryTable} from '../src/bench/render/io-summary-table.js';
import {progressLine} from '../src/bench/render/progress.js';
import {writeSignificance} from '../src/bench/render/significance-table.js';
import {smokeTable} from '../src/bench/render/smoke-table.js';
import selectFunctions from '../src/bench/select-functions.js';
import smokeRun from '../src/bench/smoke.js';
import {bodyHash, textHash} from '../src/utils/body-hash.js';
import settlePairs from '../src/bench/settle.js';
import collectLoad from '../src/bench/load-runner.js';
import zPpf from '../src/stats/z-ppf.js';
import {loadTable} from '../src/bench/render/load-table.js';
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
  .option(
    '-w, --warmup <runs>',
    'discarded warmup runs per function (omitted: auto-detected; 0 disables detection)',
    toInt,
    0
  )
  .option(
    '--min-runs <runs>',
    'minimum measured runs per function (default: 10, or 30 with --stable)',
    toInt
  )
  .option('-t, --budget <ms>', 'time budget per function in milliseconds', toInt, 5000)
  .addOption(
    new Option('-r, --runs <runs>', 'exact number of runs (overrides the stop policy)')
      .conflicts(['budget', 'minRuns', 'stable', 'settle'])
      .argParser(toInt)
  )
  .option(
    '--stable <pct>',
    'run until the median CI width is <= pct% of the median at two checks in a row (overrides --budget)',
    toFloat
  )
  .addOption(
    new Option(
      '--settle <pct>',
      "run until every pair's median ratio CI shows a difference of at least pct% or rules one out, at two checks in a row (overrides --budget)"
    )
      .conflicts(['stable', 'isolate'])
      .argParser(toFloat)
  )
  .option('--max-runs <runs>', 'hard cap on measured runs', toInt, 1000)
  .addOption(
    new Option('--in-flight <n>', 'closed loop: keep n calls in flight for each load phase')
      .conflicts([
        ...['runs', 'stable', 'settle', 'isolate', 'metrics', 'minRuns', 'maxRuns'],
        'rate'
      ])
      .argParser(toInt)
  )
  .addOption(
    new Option(
      '--rate <r>',
      "open loop: start r calls per second, latency counted from each call's intended start"
    )
      .conflicts(['runs', 'stable', 'settle', 'isolate', 'metrics', 'minRuns', 'maxRuns'])
      .argParser(toFloat)
  )
  .option(
    '--phase <ms>',
    'load phase length in milliseconds (with --in-flight or --rate)',
    toInt,
    1000
  )
  .option(
    '--max-in-flight <n>',
    'with --rate: calls allowed in flight; a call due past it is dropped',
    toInt,
    1000
  )
  .addOption(
    new Option(
      '--order <order>',
      'run order: one run of each function per round, or each function in turn'
    )
      .choices(['interleaved', 'sequential'])
      .default('interleaved')
  )
  .addOption(
    new Option('--isolate', 'measure each function in its own process').conflicts('command')
  )
  .option('--repeat <n>', 'with --isolate: processes per function', toInt, 1)
  .addOption(
    new Option('--gc <mode>', 'force a garbage collection: once after warmup, or before each run')
      .choices(gcModes)
      .default('none')
      .conflicts('command')
  )
  .option(
    '--params <values>',
    'comma-separated parameter values for a factory export (overrides its params)'
  )
  .addOption(new Option('--param-json <json>', 'internal: one parameter value').hideHelp())
  .addOption(new Option('--emit-runs', 'internal: child mode of --isolate').hideHelp())
  .option('-c, --command', 'treat the arguments as shell commands to benchmark, not a module file')
  .option('--prepare <cmd>', 'shell command run (untimed) before every run in command mode')
  .option('-M, --metrics', 'collect per-run system metrics (rusage; Linux /proc for commands)')
  .option('--clusters', 'split multimodal distributions into clusters (dip-test gated)')
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
// measured 2026-09-24 (dev-docs/stable-stopping.md): a 10-run floor and a single passing check
// stopped on lucky clusters and under-covered the median (82.5% for a 95% CI)
options.minRuns ??= options.stable > 0 || options.settle > 0 ? 30 : 10;
if (options.minRuns < 1) program.error('The minimum number of runs must be >= 1');
if (options.budget < 1) program.error('The time budget must be >= 1 ms');
if (options.runs !== undefined && options.runs < 1)
  program.error('The number of runs must be >= 1');
if (options.settle !== undefined && !(options.settle > 0))
  program.error('The settle threshold must be > 0');
if (options.settle > 0 && options.order === 'sequential')
  program.error('--settle compares functions round by round: it needs --order interleaved');
if (options.stable !== undefined && options.stable <= 0)
  program.error('The CI width target must be > 0');
if (options.maxRuns < 1) program.error('The maximum number of runs must be >= 1');
if (options.alpha <= 0 || options.alpha >= 1)
  program.error('The significance level must be > 0 and < 1');
if (options.bootstrap < 1) program.error('The number of bootstrap samples must be >= 1');
if (options.repeat < 1) program.error('The number of processes per function must be >= 1');
if (options.repeat > 1 && !options.isolate) program.error('--repeat needs --isolate');
if (options.inFlight !== undefined && !(options.inFlight >= 1))
  program.error('The number of calls in flight must be >= 1');
if (options.rate !== undefined && !(options.rate > 0)) program.error('The rate must be > 0');
if (!(options.phase >= 1)) program.error('The phase length must be >= 1 ms');
if (!(options.maxInFlight >= 1)) program.error('The in-flight cap must be >= 1');
if (program.getOptionValueSource('maxInFlight') !== 'default' && options.rate === undefined)
  program.error('--max-in-flight needs --rate');
if (
  program.getOptionValueSource('phase') !== 'default' &&
  options.rate === undefined &&
  options.inFlight === undefined
)
  program.error('--phase needs --in-flight or --rate');

const load =
    /** @type {{mode: 'closed' | 'open', inFlight?: number, rate?: number, maxInFlight?: number} | null} */ (
      options.inFlight !== undefined
        ? {mode: 'closed', inFlight: options.inFlight}
        : options.rate !== undefined
          ? {mode: 'open', rate: options.rate, maxInFlight: options.maxInFlight}
          : null
    ),
  loadPhases = load ? Math.max(1, Math.round(options.budget / options.phase)) : 0;

const seed = (options.seed ?? Math.random() * 2 ** 32) >>> 0;

const ciWidth = samples => {
  const s = bootstrapSummary(samples, {
    alpha: options.alpha,
    bootstrap: options.bootstrap,
    random: mulberry32(seed)
  });
  return (100 * (s.ciHi - s.ciLo)) / s.median;
};

const gc = options.gc === 'none' ? null : await findGc();

const policy = {
  afterWarmup: options.gc === 'once' ? (gc ?? undefined) : undefined,
  beforeRun: options.gc === 'each' ? (gc ?? undefined) : undefined,
  warmup: options.warmup,
  runs: options.runs || 0,
  minRuns: options.minRuns,
  budget: options.budget,
  stable: options.stable || 0,
  consecutive: 2,
  maxRuns: options.maxRuns,
  ciWidth: options.stable > 0 ? ciWidth : undefined,
  settle:
    options.settle > 0
      ? samples =>
          settlePairs(samples, {
            threshold: options.settle / 100,
            alpha: options.alpha,
            bootstrap: options.bootstrap,
            random: mulberry32(seed)
          })
      : undefined
};

// open the file (or adapt the commands)

const metricsKind = options.command ? 'proc' : 'rusage',
  metricsOn = options.metrics && (options.command ? procAvailable() : rusageAvailable()),
  metricsByName = new Map();

let fns, names, prepare, teardown, fileName;
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
  fileName = pathToFileURL(path.resolve(process.cwd(), args[0]));
  let file;
  try {
    file = await import(fileName.href);
    fns = file[options.export];
    if (typeof file.prepare == 'function') prepare = file.prepare;
    if (typeof file.teardown == 'function') teardown = file.teardown;
  } catch (error) {
    program.error(`File not found: ${args[0]} (${fileName})`);
  }

  if (!fns) program.error(`Export not found: ${options.export}`);

  if (typeof fns == 'function') {
    if (options.paramJson === undefined) {
      const values = options.params ? parseParams(options.params) : file.params;
      if (!Array.isArray(values) || !values.length)
        program.error(
          'A factory export needs parameter values: export const params = [...], or pass --params'
        );
      await paramsMain({
        script: fileURLToPath(import.meta.url),
        argv: process.argv.slice(2),
        values,
        json: options.json
      });
    }
    fns = await fns(JSON.parse(options.paramJson));
    if (!fns || typeof fns != 'object')
      program.error('The factory export must return an object of functions');
  }

  try {
    names = selectFunctions(fns, args.slice(1));
  } catch (error) {
    program.error(error.message);
  }
}

if (options.emitRuns) {
  if (options.command || names.length !== 1)
    program.error('--emit-runs is internal to --isolate: it needs a module and one function');
  const metrics = [];
  const samples = await collectMacro(fns[names[0]], {
    ...policy,
    prepare,
    teardown,
    metricsBefore: metricsOn ? () => process.resourceUsage() : undefined,
    metricsAfter: metricsOn
      ? token => metrics.push(rusageDelta(token, process.resourceUsage()))
      : undefined
  });
  const out = JSON.stringify({samples, ...(metricsOn ? {metrics} : {})}) + '\n';
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

if (options.settle > 0 && names.length < 2)
  program.error('--settle compares functions: it needs two or more');

const interleaved = !options.isolate && options.order === 'interleaved' && names.length > 1;

const policyLine = load
  ? load.mode === 'closed'
    ? c`Load: a closed loop, {{save.bright.yellow}}${formatInteger(load.inFlight)}{{restore}} calls in flight; ${formatInteger(loadPhases)} phases of ${formatTime(options.phase, prepareTimeFormat([options.phase], 1000))} per function (${options.order})`
    : c`Load: an open loop at {{save.bright.yellow}}${formatNumber(load.rate, {decimals: 2})}{{restore}} calls/s (at most ${formatInteger(load.maxInFlight)} in flight); ${formatInteger(loadPhases)} phases of ${formatTime(options.phase, prepareTimeFormat([options.phase], 1000))} per function (${options.order}); latency counts from each call's intended start`
  : options.runs > 0
    ? c`Measuring {{save.bright.yellow}}${formatInteger(options.runs)}{{restore}} runs per function (no batching, one call per run)`
    : options.settle > 0
      ? c`Measuring until every pair's difference is settled against {{save.bright.yellow}}±${formatNumber(options.settle, {decimals: 2})}%{{restore}} at two checks in a row (at least ${formatInteger(
          options.minRuns
        )} rounds, at most ${formatInteger(options.maxRuns)})`
      : options.stable > 0
        ? c`Measuring until the median CI width is {{save.bright.yellow}}${formatNumber(options.stable, {decimals: 2})}%{{restore}} of the median at two checks in a row (at least ${formatInteger(
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
  ...(options.isolate
    ? [
        c`Isolated: each function in its own process, {{save.bright.yellow}}${formatInteger(
          options.repeat
        )}{{restore}} per function (${options.order}); the stop policy runs in each process`
      ]
    : interleaved && !load
      ? ['Interleaved: one run of each function per round; the stop policy counts rounds']
      : []),
  ...(options.gc === 'none'
    ? []
    : [
        !gc
          ? 'No garbage collector is available on this runtime: --gc is ignored'
          : options.gc === 'once'
            ? 'GC: one forced collection after warmup'
            : load
              ? 'GC: a forced collection before every load phase'
              : 'GC: a forced collection before every run, outside the timed window'
      ]),
  ''
]);

const results = [],
  stats = [],
  runCounts = names.map(() => 0),
  runMetrics = names.map(() => []),
  detectedWarmup = names.map(() => 0),
  warmupExplicit = program.getOptionValueSource('warmup') !== 'default',
  notes = [],
  clusterReports = [];

const pText = p => (p <= 1 / 201 ? 'p < 0.01' : 'p ≈ ' + formatNumber(p, {decimals: 2}));

let progress = null;

// the final frame drops the progress line, so it is one line shorter than the frame before
// it; the updater does not clear the leftover line
const finishUpdater = async () => {
  await updater.final();
  updater = null;
  if (progress && writer.isTTY) await writer.writeString(CLEAR_EOL);
};

// the final frame drops the progress line: the table is all that remains
const report = state => {
  const lines = ioSummaryTable(names, stats, runCounts);
  if (state !== 'finished' && progress) lines.push(progressLine(progress));
  return lines;
};

updater = new Updater(
  report,
  {prologue: CURSOR_INVISIBLE, epilogue: CURSOR_NORMAL, afterLine: CLEAR_EOL},
  writer
);

// warmup detection, the bootstrap summary, and the per-function notes
const summarize = async (i, samples, detect = !warmupExplicit) => {
  const which = `${names[i]} (${i + 1} of ${names.length})`;
  if (metricsOn && options.command) {
    runMetrics[i] = metricsByName.get(names[i]).slice(options.warmup);
  }
  if (detect) {
    const drop = detectWarmup(samples);
    if (drop) {
      detectedWarmup[i] = drop;
      samples = samples.slice(drop);
      if (metricsOn) runMetrics[i] = runMetrics[i].slice(drop);
      notes.push({
        name: names[i],
        note: `warmup detected: the first ${drop} runs read slower — discarded (pin with --warmup ${drop}, keep with --warmup 0)`
      });
    }
  }
  results[i] = samples;
  runCounts[i] = samples.length;

  const sorted = samples.slice().sort(numericAsc),
    percentiles = {p90: quantileSorted(sorted, 0.9), p99: quantileSorted(sorted, 0.99)};
  stats[i] = {...exactSummary(samples, {alpha: options.alpha}), ...percentiles, bootstrap: false};
  progress = {label: `bootstrapping ${which}`, done: 1, total: 1};
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

  const {p} = dipTest(sorted, {random: mulberry32((seed + Math.imul(i, 0x85ebca6b)) >>> 0)});
  if (p < 0.05) {
    if (options.clusters) {
      clusterReports.push({name: names[i], sorted, p});
    } else {
      notes.push({
        name: names[i],
        note: `distribution looks multimodal (dip test ${pText(p)}) — pass --clusters to split`
      });
    }
  } else if (options.clusters) {
    notes.push({name: names[i], note: `no multimodality detected (dip test ${pText(p)})`});
  }
};

const measureProgress = (prefix, n, elapsed, budget, width, unit = 'runs') => {
  if (options.runs > 0)
    return {
      label: `${prefix}: ${n} of ${options.runs} ${unit}`,
      done: n,
      total: options.runs,
      remainingMs: n > 0 ? (elapsed / n) * (options.runs - n) : undefined
    };
  if (options.stable > 0) {
    const shown = Number.isFinite(width) ? `${formatNumber(width, {decimals: 1})}%` : '…';
    return {
      label: `${prefix}: ${n} ${unit}, ${unit === 'rounds' ? 'widest CI' : 'CI width'} ${shown} of ${options.stable}% target`,
      done: Number.isFinite(width) ? Math.min(1, options.stable / width) : 0,
      total: 1
    };
  }
  return {
    label: `${prefix}: ${n} ${unit}`,
    done: Math.min(1, n / options.minRuns, elapsed / budget),
    total: 1,
    remainingMs: Math.max(budget - elapsed, n > 0 ? (elapsed / n) * (options.minRuns - n) : 0)
  };
};

const moduleMetrics = metricsOn && !options.command;

let lastSettle = null,
  settleReport = null;

// perProcess[fn][round]: the runs of one child process, detected warmup dropped
let perProcess = null;

// perPhase[fn]: the load phases' results; loads[fn]: calls, throughput, and open-loop counts
let perPhase = null,
  loads = null;

if (load) {
  const startedAt = performance.now();
  progress = {label: 'load', done: 0, total: 1};
  await updater.update();
  let collected;
  try {
    collected = await collectLoad(
      names.map(name => fns[name]),
      {
        ...load,
        phase: options.phase,
        phases: loadPhases,
        warmup: options.warmup,
        order: options.order,
        beforePhase: async () => {
          await prepare?.();
          await policy.beforeRun?.();
        },
        afterPhase: teardown,
        afterWarmup: policy.afterWarmup
      },
      async (name, data) => {
        if (name !== 'load-phase') return;
        const elapsed = performance.now() - startedAt;
        progress = {
          label: `phase ${data.done} of ${data.total}: ${names[data.index]}${data.round < options.warmup ? ' (warmup)' : ''}`,
          done: data.done,
          total: data.total,
          remainingMs: (elapsed / data.done) * (data.total - data.done)
        };
        await updater.update();
      }
    );
  } catch (error) {
    await finishUpdater();
    program.error(String(error));
  }
  perPhase = collected.phases;
  const medianOf = values =>
    values.length ? quantileSorted(values.slice().sort(numericAsc), 0.5) : undefined;
  loads = perPhase.map(phases => {
    const calls = phases.reduce((sum, r) => sum + r.latencies.length, 0),
      elapsed = phases.reduce((sum, r) => sum + r.elapsed, 0);
    return {
      calls,
      throughput: elapsed > 0 ? (1000 * calls) / elapsed : 0,
      ...(load.mode === 'open'
        ? {
            scheduled: phases.reduce((sum, r) => sum + r.scheduled, 0),
            dropped: phases.reduce((sum, r) => sum + r.dropped, 0),
            serviceMedian: medianOf(phases.flatMap(r => r.services)),
            lagMedian: medianOf(phases.flatMap(r => r.lags))
          }
        : {})
    };
  });
  for (let i = 0; i < names.length; ++i) {
    if (!loads[i].calls) {
      await finishUpdater();
      program.error(`${names[i]}: no call finished in any phase; lengthen --phase`);
    }
    await summarize(
      i,
      perPhase[i].flatMap(r => r.latencies),
      false
    );
  }
} else if (options.isolate) {
  const script = fileURLToPath(import.meta.url),
    file = fileURLToPath(fileName),
    plan = isolationPlan(names.length, options.repeat, options.order),
    childArgs = [
      '-e',
      options.export,
      ...(options.runs > 0
        ? ['-r', String(options.runs)]
        : [
            '--min-runs',
            String(options.minRuns),
            '-t',
            String(options.budget),
            '--max-runs',
            String(options.maxRuns),
            ...(options.stable > 0 ? ['--stable', String(options.stable)] : [])
          ]),
      ...(warmupExplicit ? ['-w', String(options.warmup)] : []),
      '-a',
      String(options.alpha),
      '-b',
      String(options.bootstrap),
      '--seed',
      String(seed),
      ...(metricsOn ? ['-M'] : []),
      '--gc',
      options.gc,
      ...(options.paramJson !== undefined ? ['--param-json', options.paramJson] : []),
      '--emit-runs'
    ],
    processMetrics = names.map(() => []),
    processWarmup = names.map(() => /** @type {number[]} */ ([])),
    startedAt = performance.now();
  perProcess = names.map(() => []);
  for (let p = 0; p < plan.length; ++p) {
    const {fn: i, round} = plan[p],
      elapsed = performance.now() - startedAt;
    progress = {
      label:
        `process ${p + 1} of ${plan.length}: ${names[i]}` +
        (options.repeat > 1 ? ` (round ${round + 1} of ${options.repeat})` : ''),
      done: p,
      total: plan.length,
      remainingMs: p > 0 ? (elapsed / p) * (plan.length - p) : undefined
    };
    await updater.update();
    let child;
    try {
      child = await runChild(script, [file, names[i], ...childArgs]);
    } catch (error) {
      await finishUpdater();
      program.error(`${names[i]}: ${error.message}`);
    }
    // a macro run's first call is a real measurement: detection decides, per process
    const drop = warmupExplicit ? 0 : detectWarmup(child.samples);
    processWarmup[i][round] = drop;
    perProcess[i][round] = child.samples.slice(drop);
    processMetrics[i][round] = (child.metrics ?? []).slice(drop);
    const pooled = perProcess[i].filter(Boolean).flat();
    stats[i] = {...exactSummary(pooled, {alpha: options.alpha}), bootstrap: false};
    runCounts[i] = pooled.length;
    await updater.update();
  }
  for (let i = 0; i < names.length; ++i) {
    const drops = processWarmup[i],
      dropped = drops.filter(drop => drop > 0).length;
    if (dropped) {
      detectedWarmup[i] = drops;
      notes.push({
        name: names[i],
        note: `warmup detected in ${dropped} of ${drops.length} ${drops.length > 1 ? 'processes' : 'process'}: up to ${Math.max(...drops)} runs discarded per process (pin with --warmup N, keep with --warmup 0)`
      });
    }
    if (metricsOn) runMetrics[i] = processMetrics[i].flat();
    await summarize(i, perProcess[i].flat(), false);
  }
} else if (interleaved) {
  const k = names.length,
    budget = options.budget * k;
  let started = performance.now(),
    lastWidth = Infinity;
  progress = {label: 'measuring', done: 0, total: 1};
  await updater.update();
  let collected;
  try {
    collected = await collectMacroRounds(
      names.map(name => fns[name]),
      {
        ...policy,
        budget,
        prepare,
        teardown,
        metricsBefore: moduleMetrics ? () => process.resourceUsage() : undefined,
        metricsAfter: moduleMetrics
          ? (token, i) => runMetrics[i].push(rusageDelta(token, process.resourceUsage()))
          : undefined
      },
      async (name, data) => {
        if (name === 'macro-warmup') {
          progress = {
            label: `warming up: round ${data.n} of ${data.warmup}`,
            done: data.n,
            total: data.warmup
          };
          started = performance.now();
          await updater.update();
        } else if (name === 'macro-check') {
          lastWidth = data.width;
        } else if (name === 'macro-settle') {
          lastSettle = data;
        } else if (name === 'macro-round') {
          for (let i = 0; i < k; ++i) {
            stats[i] = {...exactSummary(data.samples[i], {alpha: options.alpha}), bootstrap: false};
            runCounts[i] = data.n;
          }
          if (options.settle > 0) {
            const done = lastSettle
                ? lastSettle.pairs.filter(pair => pair.state !== 'unsettled').length
                : 0,
              total = (k * (k - 1)) / 2;
            progress = {
              label: `measuring: ${data.n} rounds, ${done} of ${total} ${total > 1 ? 'pairs' : 'pair'} settled`,
              done: lastSettle ? done : 0,
              total
            };
            await updater.update();
            return;
          }
          progress = measureProgress(
            'measuring',
            data.n,
            performance.now() - started,
            budget,
            lastWidth,
            'rounds'
          );
          await updater.update();
        }
      }
    );
  } catch (error) {
    program.error(String(error));
  }
  for (let i = 0; i < k; ++i) await summarize(i, collected[i]);
  if (options.settle > 0) {
    settleReport = {
      threshold: options.settle,
      reason: lastSettle?.passed >= 2 ? 'settled' : 'max-runs',
      rounds: collected[0].length,
      ...policy.settle(results)
    };
  }
} else {
  for (let i = 0; i < names.length; ++i) {
    const which = `${names[i]} (${i + 1} of ${names.length})`;
    let samples,
      started = performance.now(),
      lastWidth = Infinity;
    progress = {label: `measuring ${which}`, done: 0, total: 1};
    await updater.update();
    try {
      samples = await collectMacro(
        fns[names[i]],
        {
          ...policy,
          prepare,
          teardown,
          metricsBefore: moduleMetrics ? () => process.resourceUsage() : undefined,
          metricsAfter: moduleMetrics
            ? token => runMetrics[i].push(rusageDelta(token, process.resourceUsage()))
            : undefined
        },
        async (name, data) => {
          if (name === 'macro-warmup') {
            progress = {
              label: `warming up ${which}: ${data.n} of ${data.warmup}`,
              done: data.n,
              total: data.warmup
            };
            started = performance.now();
            await updater.update();
          } else if (name === 'macro-check') {
            lastWidth = data.width;
          } else if (name === 'macro-run') {
            runCounts[i] = data.n;
            progress = measureProgress(
              `measuring ${which}`,
              data.n,
              performance.now() - started,
              options.budget,
              lastWidth
            );
            await updater.update();
          }
        }
      );
    } catch (error) {
      program.error(String(error));
    }
    await summarize(i, samples);
  }
}

await finishUpdater();

if (loads) {
  await writer.write(['', c`{{save.bold}}Load:{{restore}} measured phases`, '']);
  await writer.write(loadTable(names, loads, load.mode === 'open'));
  // mwtest's normal approximation: n phases a side reach at most |z| = n·sqrt(3 / (2n + 1))
  if (
    names.length === 2 &&
    loadPhases > 1 &&
    loadPhases * Math.sqrt(3 / (2 * loadPhases + 1)) <= -zPpf(options.alpha / 2)
  )
    notes.push({
      name: '',
      note: `${loadPhases} phases per function: the per-phase test cannot reach α = ${options.alpha}; raise --budget or shorten --phase`
    });
  for (let i = 0; i < names.length; ++i) {
    const l = loads[i];
    if (load.mode === 'open' && l.dropped)
      notes.push({
        name: names[i],
        note: `${formatInteger(l.dropped)} of ${formatInteger(l.scheduled)} calls dropped at the in-flight cap: the target fell behind ${formatNumber(load.rate, {decimals: 2})} calls/s`
      });
  }
}

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

for (const report of clusterReports) {
  const {clusters} = kdeClusters(report.sorted);
  if (clusters.length < 2) {
    notes.push({
      name: report.name,
      note: `dip test flags multimodality (${pText(report.p)}) but KDE found a single mode — likely heavy skew`
    });
    continue;
  }
  const clusterStats = clusters.map((cluster, k) => ({
    weight: cluster.length / report.sorted.length,
    ...bootstrapSummary(cluster, {
      alpha: options.alpha,
      bootstrap: options.bootstrap,
      random: mulberry32((seed + Math.imul(k + 1, 0xc2b2ae35)) >>> 0)
    }),
    min: cluster[0],
    max: cluster[cluster.length - 1]
  }));
  await writer.write([
    '',
    c`{{save.bold}}Clusters:{{restore}} ${report.name} — ${clusters.length} modes (heuristic; dip test ${pText(report.p)})`,
    ''
  ]);
  await writer.write(clustersTable(clusterStats));
}
if (clusterReports.length) await writer.write('');

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
// the significance block opens with its own blank line
if (notes.length && results.length < 2) await writer.write('');

if (settleReport) {
  const pct = `${formatNumber(settleReport.threshold, {decimals: 2})}%`,
    ratio = pair =>
      `ratio ${formatNumber(pair.ratioLo, {decimals: 3})}–${formatNumber(pair.ratioHi, {decimals: 3})}`,
    verdict = pair =>
      pair.state === 'faster'
        ? `${names[pair.i]} is faster by at least ${pct}`
        : pair.state === 'slower'
          ? `${names[pair.j]} is faster by at least ${pct}`
          : pair.state === 'equivalent'
            ? `within ${pct} of each other`
            : 'unsettled';
  await writer.write([
    '',
    c`{{save.bold}}Settle:{{restore}} each pair against ±${pct}, ${formatNumber(100 * (1 - options.alpha), {decimals: 2})}% CI of the median ratio, after ${formatInteger(settleReport.rounds)} rounds`,
    ...settleReport.pairs.map(
      pair => `  ${names[pair.i]} vs ${names[pair.j]}: ${verdict(pair)} (${ratio(pair)})`
    )
  ]);
  if (settleReport.reason === 'max-runs') {
    const open = settleReport.pairs.filter(pair => pair.state === 'unsettled').length;
    await writer.write(
      c`{{save.bright.yellow}}${warn}{{restore}} stopped at --max-runs: ${
        open
          ? `${open} ${open > 1 ? 'pairs' : 'pair'} still unsettled; the difference may sit near ±${pct}`
          : 'the pairs settled only in the final rounds, after the last check'
      }`
    );
  }
}

let significance = null;
if (results.length > 1) {
  // several processes per function: the process is the unit, as in nano-bench --isolate
  // calls in one load phase share the load: the phase is the unit
  const byProcess = perProcess && options.repeat > 1,
    byPhase = perPhase && loadPhases > 1,
    medianOfRuns = runs => quantileSorted(runs.slice().sort(numericAsc), 0.5),
    tested = byProcess
      ? perProcess.map(list => list.map(medianOfRuns))
      : byPhase
        ? perPhase.map(phases => phases.map(r => medianOfRuns(r.latencies)))
        : results,
    testResult = computeSignificance(tested, options.alpha, options.correction),
    matrix = significanceMatrix(testResult);
  significance = byProcess
    ? {...testResult, unit: 'process-medians'}
    : byPhase
      ? {...testResult, unit: 'phase-medians'}
      : testResult;
  if (byPhase)
    await writer.write([
      '',
      c`{{save.bold}}Phases:{{restore}} ${formatInteger(loadPhases)} per function; the test below compares per-phase medians`
    ]);
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
    if (options.verbose) {
      const format = prepareTimeFormat(tested.flat(), 1000);
      await writer.write(
        names.map(
          (name, i) => `  ${name}: ${tested[i].map(value => formatTime(value, format)).join(', ')}`
        )
      );
    }
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
      ...(options.stable > 0 ? {stable: options.stable, stableChecks: 2} : {}),
      ...(options.settle > 0 ? {settle: options.settle, settleChecks: 2} : {}),
      ...(load ? {load, phase: options.phase, phases: loadPhases} : {}),
      ...(metricsOn ? {metrics: metricsKind} : {}),
      maxRuns: options.maxRuns,
      warmup: options.warmup,
      bootstrap: options.bootstrap,
      seed,
      alpha: options.alpha,
      correction: options.correction,
      order: options.order,
      ...(gc ? {gc: options.gc} : {}),
      ...(options.paramJson !== undefined ? {param: JSON.parse(options.paramJson)} : {}),
      ...(options.isolate ? {isolate: true, repeat: options.repeat} : {})
    },
    series: names.map((name, i) => ({
      name,
      bodyHash: options.command ? textHash(name) : bodyHash(fns[name]),
      reps: 1,
      samples: results[i],
      ...(detectedWarmup[i] ? {warmupDetected: detectedWarmup[i]} : {}),
      ...(perProcess ? {processSizes: perProcess[i].map(runs => runs.length)} : {}),
      ...(perPhase
        ? {
            phaseSizes: perPhase[i].map(r => r.latencies.length),
            load: loads[i],
            ...(load.mode === 'open' ? {serviceSamples: perPhase[i].flatMap(r => r.services)} : {})
          }
        : {}),
      ...(metricsOn ? {metrics: runMetrics[i]} : {}),
      summary: {
        median: stats[i].median,
        lo: stats[i].lo,
        hi: stats[i].hi,
        ciLo: stats[i].ciLo,
        ciHi: stats[i].ciHi,
        p90: stats[i].p90,
        p99: stats[i].p99,
        mean: mean(results[i]),
        stdDev: stdDev(results[i]),
        opsPerSec: 1000 / stats[i].median,
        ci: 'bootstrap-percentile'
      }
    })),
    significance,
    settle: settleReport
      ? {
          threshold: settleReport.threshold,
          reason: settleReport.reason,
          rounds: settleReport.rounds,
          pairs: settleReport.pairs.map(pair => ({
            a: names[pair.i],
            b: names[pair.j],
            state: pair.state,
            ratioLo: pair.ratioLo,
            ratioHi: pair.ratioHi
          }))
        }
      : undefined
  });
  await writeFile(options.json, JSON.stringify(obj, null, 2) + '\n');
}

// must be explicit: a module holding live handles would otherwise keep a finished run alive
process.exit(0);

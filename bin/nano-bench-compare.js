#!/usr/bin/env node

import {readFile} from 'node:fs/promises';

import {Option, program} from 'commander';

import {c} from 'console-toolkit/style.js';
import Writer from 'console-toolkit/output/writer.js';

import {bootstrapSummary} from '../src/stats.js';
import kdeClusters from '../src/stats/kde-modes.js';
import {clustersTable} from '../src/bench/render/clusters-table.js';
import {numericAsc} from '../src/utils/numeric-asc.js';
import {formatNumber} from 'console-toolkit/alphanumeric/number-formatters.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {corrections} from '../src/significance/correction.js';
import {mulberry32} from '../src/utils/prng.js';
import {summaryTable} from '../src/bench/render/summary-table.js';
import {
  metricsTable,
  metricSpecs,
  guardedMedians,
  metricLegends
} from '../src/bench/render/metrics-table.js';
import {writeSignificance} from '../src/bench/render/significance-table.js';
import {loadResults} from '../src/bench/results/load.js';
import {
  buildSeries,
  comparisonArrays,
  resultsWarnings,
  multimodalityP
} from '../src/bench/results/series.js';
import {planComparison} from '../src/bench/pair-series.js';
import {computeHistograms, binCount} from '../src/bench/histogram.js';
import {writeHistograms} from '../src/bench/render/histogram-chart.js';

const toFloat = value => parseFloat(value),
  toInt = value => parseInt(value);

const pkgUrl = new URL('../package.json', import.meta.url),
  pkg = JSON.parse(await readFile(pkgUrl, {encoding: 'utf8'}));

program
  .name('nano-bench-compare')
  .version(pkg.version)
  .description('View and compare nano-bench results JSON files.')
  .argument('<files...>', 'one or more results JSON files')
  .option(
    '-a, --alpha <alpha>',
    'significance level for the recompute (default: the first file’s α)',
    toFloat
  )
  .addOption(
    new Option(
      '--correction <method>',
      'post-hoc correction (default: the first file’s method)'
    ).choices(corrections)
  )
  .option('-v, --verbose', 'show significance test statistics and critical values')
  .option('--pooled', 'compare all series as one k-sample omnibus instead of pairing by name')
  .option('--clusters', 'split multimodal distributions into clusters (dip-test gated)')
  .option('--no-emoji', 'use ASCII fastest/slowest markers (F/S) instead of emoji')
  .option('--histogram', 'show a distribution histogram per series')
  .addOption(
    new Option('--chart <type>', 'histogram orientation')
      .choices(['columns', 'bars'])
      .default('columns')
  )
  .option('--bins <bins>', 'histogram bin count (default: auto)', toInt)
  .showHelpAfterError('(add --help to see available options)');

program.parse();

const options = program.opts();

let files;
try {
  files = program.args.map(file => ({file, results: loadResults(file)}));
} catch (error) {
  program.error(error.message);
}

const alpha = options.alpha ?? files[0].results.params.alpha ?? 0.05;
const correction = options.correction ?? files[0].results.params.correction ?? 'holm';

const series = buildSeries(files, {alpha});

const writer = new Writer();
const warn = message => writer.writeString(c`{{save.bright.yellow}}⚠ ${message}{{restore}}\n`);

for (const message of resultsWarnings(files)) warn(message);

await writer.write(
  summaryTable(
    series.map(s => s.label),
    series.map(s => s.summary),
    series.map(s => s.reps)
  )
);

for (const kind of Object.keys(metricSpecs)) {
  const carrying = series.filter(s => s.metricsKind === kind && s.metrics);
  if (!carrying.length) continue;
  await writer.write(['', c`{{save.bold}}Metrics{{restore}} (median per run):`, '']);
  await writer.write(
    metricsTable(
      carrying.map(s => s.label),
      carrying.map(s => guardedMedians(s.metrics, metricSpecs[kind])),
      kind
    )
  );
  await writer.write([c`{{save.dim}}${metricLegends[kind]}{{restore}}`]);
}

const pText = p => (p <= 1 / 201 ? 'p < 0.01' : 'p ≈ ' + formatNumber(p, {decimals: 2}));

{
  const dipSeed = files[0].results.params.seed ?? 1,
    bootstrapN = files[0].results.params.bootstrap ?? 1000;
  let shown = false;
  for (let j = 0; j < series.length; ++j) {
    const s = series[j],
      sortedSamples = s.samples.slice().sort(numericAsc),
      p = multimodalityP(sortedSamples, dipSeed, j);
    if (p >= 0.05) continue;
    if (!options.clusters) {
      warn(
        `${s.label}: distribution looks multimodal (dip test ${pText(p)}) — pass --clusters to split`
      );
      continue;
    }
    const {clusters} = kdeClusters(sortedSamples);
    if (clusters.length < 2) {
      warn(
        `${s.label}: dip test flags multimodality (${pText(p)}) but KDE found a single mode — likely heavy skew`
      );
      continue;
    }
    const clusterStats = clusters.map((cluster, k) => ({
      weight: cluster.length / sortedSamples.length,
      ...bootstrapSummary(cluster, {
        alpha,
        bootstrap: bootstrapN,
        random: mulberry32((dipSeed + Math.imul(k + 1, 0xc2b2ae35)) >>> 0)
      }),
      min: cluster[0],
      max: cluster[cluster.length - 1]
    }));
    await writer.write([
      '',
      c`{{save.bold}}Clusters:{{restore}} ${s.label} — ${clusters.length} modes (heuristic; dip test ${pText(p)})`,
      ''
    ]);
    await writer.write(clustersTable(clusterStats));
    shown = true;
  }
  if (shown) await writer.write('');
}

const renderBlock = (members, name) => {
  if (members.length < 2) return;
  const {arrays, unit} = comparisonArrays(members),
    testResult = computeSignificance(arrays, alpha, correction),
    matrix = significanceMatrix(testResult);
  if (name) writer.writeString(c`\n{{save.bold.cyan}}${name}{{restore}}\n`);
  if (unit === 'process-medians')
    writer.writeString(
      c`\n{{save.bold}}Processes:{{restore}} the test compares per-process medians (${arrays.map(a => a.length).join(' vs ')})\n`
    );
  else if (unit === 'round-medians')
    writer.writeString(
      c`\n{{save.bold}}Rounds:{{restore}} the test compares per-round medians of concurrent calls (${arrays.map(a => a.length).join(' vs ')})\n`
    );
  writeSignificance(writer, {
    testResult,
    matrix,
    stats: members.map(s => s.summary),
    names: members.map(s => (name ? s.tag : s.label)),
    results: arrays,
    alpha,
    correction,
    verbose: options.verbose,
    emoji: options.emoji
  });
};

const {blocks, unpaired, degraded} = planComparison(series, {pooled: options.pooled});

for (const {name, members} of blocks) renderBlock(members, name);

if (unpaired.length) {
  writer.writeString(
    c`\n{{save.dim}}Not compared (one series each): ${unpaired.join(', ')}{{restore}}\n`
  );
} else if (degraded && files.length > 1) {
  writer.writeString(
    c`\n{{save.dim}}No shared names; compared all series together — pass --pooled to silence.{{restore}}\n`
  );
}

if (options.histogram) {
  // columns are bound by terminal width (1 col/bin); bars by terminal height (1 row/bin)
  const budget =
      options.chart === 'bars'
        ? Math.max(8, (writer.size.rows || 24) - 8)
        : Math.max(16, (writer.columns || 80) - 2),
    n = Math.min(...series.map(s => s.samples.length));
  writeHistograms(writer, {
    names: series.map(s => s.label),
    hist: computeHistograms(
      series.map(s => s.samples),
      {bins: options.bins || binCount(n, budget), maxBins: budget}
    ),
    orientation: options.chart,
    emoji: options.emoji
  });
}

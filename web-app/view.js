import {
  buildSeries,
  comparisonArrays,
  resultsWarnings,
  multimodalityP,
  fileTag
} from '../src/bench/results/series.js';
import {planComparison} from '../src/bench/pair-series.js';
import {computeSignificance, significanceMatrix} from '../src/bench/significance.js';
import {effectMagnitude} from '../src/significance/cliff.js';
import {computeHistograms, binCount} from '../src/bench/histogram.js';
import {distributionSvg, escapeXml as esc, logTicks} from '../src/bench/render/svg-distribution.js';
import {numericAsc} from '../src/utils/numeric-asc.js';
import {violinSvg} from '../src/bench/render/svg-violin.js';
import kdeClusters from '../src/stats/kde-modes.js';
import {bootstrapSummary} from '../src/stats.js';
import {mulberry32} from '../src/utils/prng.js';
import {guardedMedians, metricLegends, metricSpecs} from '../src/bench/metrics-specs.js';
import {
  abbrNumber,
  compareDifference,
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';

// samples are ms per iteration; the formatters work in seconds
const MS = 1000;

const correctionLabel = method =>
  ({none: 'uncorrected', holm: 'Holm-corrected', bonferroni: 'Bonferroni-corrected'})[method] ??
  method;

const pText = p => (p <= 1 / 201 ? 'p < 0.01' : 'p ≈ ' + formatNumber(p, {decimals: 2}));

const describeEnvironment = env => {
  const r = env?.runtime,
    parts = [];
  if (r)
    parts.push([r.name, r.version].filter(Boolean).join(' ') + (r.engine ? ` (${r.engine})` : ''));
  if (env?.os) parts.push([env.os.platform, env.os.release, env.os.arch].filter(Boolean).join(' '));
  if (env?.cpu?.model) parts.push(`${env.cpu.model} × ${env.cpu.count}`);
  if (env?.host) parts.push(`host ${env.host}`);
  return parts.join(' · ');
};

const filesSection = files =>
  `<section class="files">${files
    .map(({file, results}) => {
      const p = results.params ?? {},
        methods = results.results.map(s => s.name).join(', ');
      return `<div class="file-card">
<div class="file-head"><span class="tag">${esc(fileTag({file, results}))}</span> <code>${esc(file)}</code></div>
<div class="meta">${esc(results.createdAt ?? '')}${results.source?.file ? ` · <code>${esc(results.source.file)}</code>` : ''} · ${esc(methods)}</div>
<div class="meta">${esc(describeEnvironment(results.environment))}</div>
<div class="meta">${esc(runDescription(p))}</div>
</div>`;
    })
    .join('')}</section>`;

const runDescription = p => {
  const parts = [];
  if (p.param !== undefined) parts.push(`param = ${p.param}`);
  if (p.load)
    parts.push(
      p.load.mode === 'closed'
        ? `load: ${p.load.inFlight} in flight`
        : `load: ${p.load.rate} calls/s, at most ${p.load.maxInFlight} in flight`
    );
  if (p.samples !== undefined) parts.push(`samples ${p.samples}`);
  if (p.runs !== undefined) parts.push(`runs ${p.runs}`);
  parts.push(`bootstrap ${p.bootstrap ?? '?'}`, `seed ${p.seed ?? '?'}`, `α ${p.alpha ?? '?'}`);
  if (p.parallel) parts.push('parallel');
  return parts.join(' · ');
};

const warningsSection = warnings =>
  warnings.length
    ? `<section class="warnings"><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></section>`
    : '';

const markers = series => {
  if (series.length < 2) return series.map(() => '');
  const medians = series.map(s => s.summary.median),
    min = Math.min(...medians),
    max = Math.max(...medians);
  return medians.map(m =>
    m === min
      ? '<span title="fastest">🐇</span>'
      : m === max
        ? '<span title="slowest">🐢</span>'
        : ''
  );
};

const summarySection = (series, format) => {
  const marks = markers(series);
  const rows = series.map(
    (s, i) => `<tr>
<td class="mark">${marks[i]}</td>
<td class="name">${esc(s.label)}</td>
<td class="num strong">${esc(formatTime(s.summary.median, format))}</td>
<td class="num">+${esc(formatTime(s.summary.ciHi - s.summary.median, format))}</td>
<td class="num">−${esc(formatTime(s.summary.median - s.summary.ciLo, format))}</td>
<td class="num">+${esc(formatTime(s.summary.hi - s.summary.median, format))}</td>
<td class="num">−${esc(formatTime(s.summary.median - s.summary.lo, format))}</td>
<td class="num">${esc(abbrNumber(MS / s.summary.median))}</td>
<td class="num">${esc(abbrNumber(s.reps))}</td>
</tr>`
  );
  return `<section>
<h2>Summary</h2>
<div class="scroll"><table class="summary">
<thead>
<tr><th rowspan="2"></th><th rowspan="2">Name</th><th rowspan="2" class="num">Median</th><th colspan="2" class="group">CI</th><th colspan="2" class="group">Spread</th><th rowspan="2" class="num">op/s</th><th rowspan="2" class="num">Batch</th></tr>
<tr><th class="num">+</th><th class="num">−</th><th class="num">+</th><th class="num">−</th></tr>
</thead>
<tbody>${rows.join('')}</tbody>
</table></div>
<p class="note">Median time per call. <strong>CI</strong> is the median’s bootstrap confidence interval: how precisely the median is known. <strong>Spread</strong> is the range most runs fall in (bootstrap estimates of the α/2 and 1 − α/2 quantiles): how noisy the runs are. Both are recomputed from the saved samples, as <code>nano-bench-compare</code> does. All rows share one unit.</p>
</section>`;
};

const differenceText = (a, b) => {
  const result = compareDifference(a, b);
  if (result.infinity) return {text: '∞', less: result.less};
  if (result.percentage) return {text: result.percentage + '%', less: result.less};
  if (result.ratio) return {text: result.ratio + '×', less: result.less};
  return null;
};

const significanceBlock = (members, name, {alpha, correction}) => {
  const {arrays, unit} = comparisonArrays(members),
    test = computeSignificance(arrays, alpha, correction),
    matrix = significanceMatrix(test),
    isPair = members.length === 2,
    method = isPair ? 'none' : (correction ?? test.correction ?? 'none'),
    names = members.map(s => (name ? s.tag : s.label)),
    stats = members.map(s => s.summary),
    out = [];

  out.push(`<div class="block">`);
  if (name) out.push(`<h3>${esc(name)}</h3>`);
  if (unit === 'process-medians')
    out.push(
      `<p>Each function was measured in several processes, so the test compares per-process medians (${arrays.map(a => a.length).join(' vs ')}).</p>`
    );
  else if (unit === 'phase-medians')
    out.push(
      `<p>Each function ran in phases under load, so the test compares per-phase medians (${arrays.map(a => a.length).join(' vs ')}).</p>`
    );
  else if (unit === 'round-medians')
    out.push(
      `<p>Each function ran in rounds of concurrent calls, so the test compares per-round medians (${arrays.map(a => a.length).join(' vs ')}).</p>`
    );
  out.push(
    `<p>${isPair ? 'Mann–Whitney U test (two-sided, tie-corrected)' : 'Kruskal–Wallis H test'}, α = ${esc(alpha)}${
      isPair
        ? ''
        : `; post-hoc: Conover–Iman pairwise (${esc(correctionLabel(method))}${test.m ? `, m=${test.m}` : ''})`
    }.</p>`
  );

  if (isPair && typeof test.a12 == 'number') {
    const size = Math.abs(test.delta),
      magnitude = effectMagnitude(size),
      wins = Math.max(test.a12, 1 - test.a12);
    out.push(
      `<p>Effect size: Cliff’s δ = <strong>${size.toFixed(2)}</strong> (${magnitude}): the faster one wins ${Math.round(100 * wins)}% of random run pairs.</p>`
    );
  }

  const statistic = isPair
    ? `z = ${test.value.toFixed(2)}, critical |z| = ${Math.abs(test.limit).toFixed(2)}`
    : `H = ${test.value.toFixed(2)}, critical H = ${test.limit.toFixed(2)} (β-approximation)`;

  if (!matrix) {
    out.push(
      `<p class="verdict">The difference is not statistically significant. <span class="muted">${esc(statistic)}</span></p>`
    );
    out.push(effectsTable(test, names));
    out.push('</div>');
    return out.join('');
  }

  out.push(
    `<p class="verdict">The difference is statistically significant. <span class="muted">${esc(statistic)}</span></p>`
  );
  const marks = markers(members),
    head = names.map((_, j) => `<th class="num">${j + 1}</th>`).join(''),
    rows = names.map((n, i) => {
      const cells = matrix[i].map((different, j) => {
        if (!different) return '<td></td>';
        const d = differenceText(stats[i].median, stats[j].median);
        return d
          ? `<td class="num ${d.less ? 'faster' : 'slower'}">${esc(d.text)} ${d.less ? 'faster' : 'slower'}</td>`
          : '<td></td>';
      });
      return `<tr><td class="mark">${marks[i]}</td><td class="num">${i + 1}</td><td class="name">${esc(n)}</td>${cells.join('')}</tr>`;
    });
  out.push(
    `<div class="scroll"><table class="matrix"><thead><tr><th></th><th class="num">#</th><th>Name</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  );
  out.push(
    `<p class="note">Read a row against a column: the row is faster or slower than the column.</p>`
  );
  out.push(effectsTable(test, names));
  out.push('</div>');
  return out.join('');
};

const effectsTable = (test, names) => {
  if (!test.effects) return '';
  const head = names.map((_, j) => `<th class="num">${j + 1}</th>`).join(''),
    rows = names.map((n, i) => {
      const cells = test.effects[i].map((delta, j) =>
        i === j
          ? '<td></td>'
          : `<td class="num">${Math.abs(delta).toFixed(2)} ${effectMagnitude(delta)}</td>`
      );
      return `<tr><td class="num">${i + 1}</td><td class="name">${esc(n)}</td>${cells.join('')}</tr>`;
    });
  return (
    `<p>Effect sizes: Cliff’s δ for each pair, with its magnitude.</p>` +
    `<div class="scroll"><table class="matrix"><thead><tr><th class="num">#</th><th>Name</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  );
};

const significanceSection = (series, fileCount, options) => {
  const {blocks, unpaired, degraded} = planComparison(series),
    parts = blocks
      .filter(b => b.members.length > 1)
      .map(b => significanceBlock(b.members, b.name, options));
  if (unpaired.length)
    parts.push(`<p class="note">Not compared (one series each): ${esc(unpaired.join(', '))}.</p>`);
  else if (degraded && fileCount > 1)
    parts.push(
      `<p class="note">No shared names across files, so all series are compared together.</p>`
    );
  return parts.length ? `<section><h2>Significance</h2>${parts.join('')}</section>` : '';
};

const metricValue = (value, kind) => {
  if (value == null) return '';
  if (kind === 'us') return formatTime(value / 1000, prepareTimeFormat([value / 1000], MS));
  return abbrNumber(value) + (kind === 'bytes' ? 'B' : '');
};

const metricsSection = series => {
  const kinds = [
    ...new Set(series.filter(s => s.metrics && s.metricsKind).map(s => s.metricsKind))
  ];
  if (!kinds.length) return '';
  const tables = kinds.map(kind => {
    const spec = metricSpecs[kind] ?? [],
      rows = series
        .filter(s => s.metrics && s.metricsKind === kind)
        .map(s => {
          const medians = guardedMedians(s.metrics, spec);
          return `<tr><td class="name">${esc(s.label)}</td>${spec
            .map(({key, kind: k}) => `<td class="num">${esc(metricValue(medians[key], k))}</td>`)
            .join('')}</tr>`;
        });
    return `<div class="scroll"><table class="summary"><thead><tr><th>Name</th>${spec
      .map(({label}) => `<th class="num">${esc(label)}</th>`)
      .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>
<p class="note">Median per run. ${esc(metricLegends[kind] ?? '')}</p>`;
  });
  return `<section><h2>Metrics</h2>${tables.join('')}</section>`;
};

const clusterClass = k =>
  k === 0 ? '' : k === 1 ? 'cluster-1' : k === 2 ? 'cluster-2' : 'cluster-more';

const clustersSection = (series, seed) => {
  const split = series.filter(s => s.clusters);
  if (!split.length) return '';
  const blocks = split.map((s, j) => {
    const stats = s.clusters.map((cluster, k) => ({
        weight: cluster.length / s.samples.length,
        ...bootstrapSummary(cluster, {
          random: mulberry32(
            (seed + Math.imul(j + 1, 0x85ebca6b) + Math.imul(k + 1, 0xc2b2ae35)) >>> 0
          )
        }),
        min: cluster[0],
        max: cluster[cluster.length - 1]
      })),
      format = prepareTimeFormat(
        stats.flatMap(c => [c.median, c.min, c.max]),
        MS
      ),
      t = v => esc(formatTime(v, format)),
      rows = stats.map(
        (c, k) =>
          `<tr><td><span class="swatch ${clusterClass(k)}"></span>${k + 1}</td><td class="num">${esc(formatNumber(100 * c.weight, {decimals: 1}))}%</td><td class="num strong">${t(c.median)}</td><td class="num">${t(c.ciLo)} … ${t(c.ciHi)}</td><td class="num">${t(c.min)} … ${t(c.max)}</td></tr>`
      );
    return `<div class="block"><h3>${esc(s.label)}</h3>
<div class="scroll"><table class="summary"><thead><tr><th>Cluster</th><th class="num">Weight</th><th class="num">Median</th><th class="num">CI</th><th class="num">Range</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
  });
  return `<section><h2>Clusters</h2>${blocks.join('')}<p class="note">A dip test flagged these distributions as multimodal; a kernel density estimate splits them at its minima. The number of modes is a heuristic. The histogram colors each cluster’s bars to match.</p></section>`;
};

const loadSection = series => {
  const loaded = series.filter(s => s.load);
  if (!loaded.length) return '';
  const open = loaded.some(s => s.load.scheduled !== undefined),
    fmt = values => {
      const format = prepareTimeFormat(values, MS);
      return v => (typeof v == 'number' ? formatTime(v, format) : '');
    },
    service = fmt(loaded.map(s => s.load.serviceMedian ?? 0)),
    lag = fmt(loaded.map(s => s.load.lagMedian ?? 0)),
    rows = loaded.map(
      s =>
        `<tr><td class="name">${esc(s.label)}</td><td class="num">${esc(formatNumber(s.load.calls, {decimals: 0}))}</td><td class="num">${esc(formatNumber(s.load.throughput, {decimals: 1}))}</td>${
          open
            ? `<td class="num">${esc(formatNumber(s.load.dropped ?? 0, {decimals: 0}))}</td><td class="num">${esc(service(s.load.serviceMedian))}</td><td class="num">${esc(lag(s.load.lagMedian))}</td>`
            : ''
        }</tr>`
    );
  return `<section>
<h2>Load</h2>
<div class="scroll"><table class="summary"><thead><tr><th>Name</th><th class="num">Calls</th><th class="num">Calls/s</th>${
    open
      ? '<th class="num">Dropped</th><th class="num">Service</th><th class="num">Start lag</th>'
      : ''
  }</tr></thead><tbody>${rows.join('')}</tbody></table></div>
<p class="note">Calls finished under load and the rate each function sustained.${
    open
      ? ' In an open loop latency counts from each call’s intended start; <strong>Service</strong> is the median time from the actual start, and <strong>Start lag</strong> is how late the harness itself started calls. A call due at the in-flight cap is dropped.'
      : ''
  }</p>
</section>`;
};

const settleSection = files => {
  const settled = files.filter(f => f.results.settle);
  if (!settled.length) return '';
  const blocks = settled.map(({file, results}) => {
    const {threshold, reason, rounds, pairs} = results.settle,
      verdict = pair =>
        pair.state === 'faster'
          ? `${pair.a} is faster by at least ${threshold}%`
          : pair.state === 'slower'
            ? `${pair.b} is faster by at least ${threshold}%`
            : pair.state === 'equivalent'
              ? `within ${threshold}% of each other`
              : 'unsettled';
    return `<div class="block"><h3>${esc(fileTag({file, results}))}</h3>
<p>Each pair against ±${esc(threshold)}%, after ${esc(rounds)} rounds${reason === 'max-runs' ? ', stopped at <code>--max-runs</code>' : ''}.</p>
<ul>${pairs
      .map(
        pair =>
          `<li><strong>${esc(pair.a)}</strong> vs <strong>${esc(pair.b)}</strong>: ${esc(verdict(pair))} <span class="muted">(ratio ${esc(formatNumber(pair.ratioLo, {decimals: 3}))}–${esc(formatNumber(pair.ratioHi, {decimals: 3}))})</span></li>`
      )
      .join('')}</ul></div>`;
  });
  return `<section><h2>Settle</h2>${blocks.join('')}</section>`;
};

// runs of one parameterized file, one per value: medians by function and value
const scalingSection = (files, series) => {
  const groups = new Map();
  files.forEach(({results}, index) => {
    if (results.params?.param === undefined) return;
    const key = results.source?.file ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({index, param: results.params.param});
  });
  const blocks = [];
  for (const [source, runs] of groups) {
    if (runs.length < 2) continue;
    runs.sort((a, b) =>
      typeof a.param == 'number' && typeof b.param == 'number'
        ? a.param - b.param
        : String(a.param).localeCompare(String(b.param))
    );
    const tags = runs.map(run => fileTag(files[run.index])),
      names = [...new Set(series.filter(s => tags.includes(s.tag)).map(s => s.name))],
      cell = (name, tag) => series.find(s => s.tag === tag && s.name === name)?.summary.median,
      format = prepareTimeFormat(
        names.flatMap(name => tags.map(tag => cell(name, tag) ?? 0)),
        MS
      ),
      rows = names.map(
        name =>
          `<tr><td class="name">${esc(name)}</td>${tags
            .map(tag => {
              const v = cell(name, tag);
              return `<td class="num">${typeof v == 'number' ? esc(formatTime(v, format)) : '—'}</td>`;
            })
            .join('')}</tr>`
      );
    blocks.push(`<div class="block">${source ? `<h3><code>${esc(source)}</code></h3>` : ''}
<div class="scroll"><table class="summary"><thead><tr><th>Name</th>${runs
      .map(run => `<th class="num">${esc(run.param)}</th>`)
      .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`);
  }
  return blocks.length
    ? `<section><h2>Scaling</h2>${blocks.join('')}<p class="note">Median time per call by parameter value, one run per value.</p></section>`
    : '';
};

// past this spread a linear axis collapses the faster series into a column or two
const LOG_RATIO = 20;

export const preferLog = series => {
  const pooled = series.flatMap(s => s.samples).sort(numericAsc),
    lo = pooled[Math.floor(pooled.length * 0.01)],
    hi = pooled[Math.ceil(pooled.length * 0.99) - 1];
  return lo > 0 && hi / lo > LOG_RATIO;
};

const chartSvg = (series, format, log, width) => {
  const n = Math.min(...series.map(s => s.samples.length)),
    toAxis = log ? Math.log10 : v => v,
    fromAxis = log ? v => 10 ** v : v => v,
    hist = computeHistograms(
      series.map(s => s.samples.map(toAxis)),
      {bins: binCount(n, 48), maxBins: 48}
    ),
    fmt = v => formatTime(v, format),
    fmtOwn = v => formatTime(v, prepareTimeFormat([v], MS));
  return distributionSvg({
    names: series.map(s => s.label),
    hist,
    stats: series.map(({summary: s}) => ({
      median: toAxis(s.median),
      lo: toAxis(s.lo),
      hi: toAxis(s.hi),
      ciLo: toAxis(s.ciLo),
      ciHi: toAxis(s.ciHi)
    })),
    width,
    ticks: log ? logTicks(hist.lo, hist.hi, Math.max(2, Math.round(width / 110))) : undefined,
    formatTicks: ticks => {
      if (log) return ticks.map(t => fmtOwn(fromAxis(t)));
      const tickFormat = prepareTimeFormat(
        ticks.filter(t => t > 0),
        MS
      );
      return ticks.map(t => formatTime(t, tickFormat));
    },
    describeRow: i => {
      const s = series[i].summary;
      return `${series[i].label}: median ${fmt(s.median)}, CI ${fmt(s.ciLo)} … ${fmt(s.ciHi)}, spread ${fmt(s.lo)} … ${fmt(s.hi)}`;
    },
    binClass: (i, j) => {
      const bounds = series[i].clusterBounds;
      if (!bounds) return '';
      const center = fromAxis(hist.lo + (j + 0.5) * hist.binWidth);
      return clusterClass(bounds.filter(b => b < center).length);
    },
    describeBin: (i, j) => {
      const from = fromAxis(hist.lo + j * hist.binWidth),
        to = fromAxis(hist.lo + (j + 1) * hist.binWidth),
        count = hist.series[i].counts[j];
      return `${series[i].label}: ${fmtOwn(from)} … ${fmtOwn(to)}, ${count} sample${count === 1 ? '' : 's'}`;
    }
  });
};

const violinChart = (series, format, log, width) => {
  const toAxis = log ? Math.log10 : v => v,
    fromAxis = log ? v => 10 ** v : v => v,
    fmt = v => formatTime(v, format),
    pooled = series.flatMap(s => s.samples.map(toAxis)).sort(numericAsc),
    lo = pooled[Math.floor(pooled.length * 0.01)],
    hi = pooled[Math.max(0, Math.ceil(pooled.length * 0.99) - 1)];
  return violinSvg({
    names: series.map(s => s.label),
    samples: series.map(s => s.samples.map(toAxis)),
    stats: series.map(({summary: s}) => ({
      median: toAxis(s.median),
      lo: toAxis(s.lo),
      hi: toAxis(s.hi),
      ciLo: toAxis(s.ciLo),
      ciHi: toAxis(s.ciHi)
    })),
    width,
    ticks: log ? logTicks(lo, hi, Math.max(2, Math.round(width / 110))) : undefined,
    formatTicks: ticks => {
      const values = ticks.map(fromAxis),
        tickFormat = prepareTimeFormat(
          values.filter(t => t > 0),
          MS
        );
      return values.map(t => formatTime(t, tickFormat));
    },
    describeRow: i => {
      const s = series[i].summary;
      return `${series[i].label}: median ${fmt(s.median)}, CI ${fmt(s.ciLo)} … ${fmt(s.ciHi)}, spread ${fmt(s.lo)} … ${fmt(s.hi)}`;
    }
  });
};

/** @param {'shared' | 'log' | 'rows' | 'violin' | 'violin-log'} mode */
export const renderChart = (container, series, format, mode) => {
  const width = Math.max(300, Math.floor(container.clientWidth));
  container.innerHTML =
    mode === 'rows'
      ? series.map(s => chartSvg([s], format, false, width)).join('')
      : mode === 'violin' || mode === 'violin-log'
        ? violinChart(series, format, mode === 'violin-log', width)
        : chartSvg(series, format, mode === 'log', width);
};

/**
 * @param {HTMLElement} root
 * @param {{file: string, results: any}[]} files
 */
export const renderView = (root, files) => {
  const alpha = files[0].results.params.alpha ?? 0.05,
    correction = files[0].results.params.correction ?? 'holm',
    series = buildSeries(files, {alpha}),
    warnings = resultsWarnings(files),
    dipSeed = files[0].results.params.seed ?? 1;

  series.forEach((s, j) => {
    const sorted = s.samples.slice().sort(numericAsc),
      p = multimodalityP(sorted, dipSeed, j);
    if (p >= 0.05) return;
    const {clusters, boundaries} = kdeClusters(sorted);
    if (clusters.length > 1) {
      s.clusters = clusters;
      s.clusterBounds = boundaries;
      warnings.push(
        `${s.label}: the distribution looks multimodal (dip test ${pText(p)}); the Clusters section splits it`
      );
    } else {
      warnings.push(
        `${s.label}: the dip test flags multimodality (${pText(p)}) but the density has a single mode, likely heavy skew`
      );
    }
  });

  const format = prepareTimeFormat(
    series.flatMap(s => [
      s.summary.median - s.summary.lo,
      s.summary.median,
      s.summary.hi - s.summary.median,
      s.summary.median - s.summary.ciLo,
      s.summary.ciHi - s.summary.median
    ]),
    MS
  );

  root.innerHTML = `${filesSection(files)}
${warningsSection(warnings)}
${summarySection(series, format)}
${scalingSection(files, series)}
${loadSection(series)}
${settleSection(files)}
${metricsSection(series)}
${clustersSection(series, dipSeed)}
<section>
<div class="section-head"><h2>Distribution</h2>
<div class="axis-toggle" role="group" aria-label="Time axis">
<button type="button" data-axis="auto">Auto</button><button type="button" data-axis="linear">Linear</button><button type="button" data-axis="log">Log</button><button type="button" data-axis="rows">Per row</button><button type="button" data-axis="violin">Violin</button>
</div></div>
<div class="chart"></div>
<p class="note chart-note"></p>
</section>
${significanceSection(series, files.length, {alpha, correction})}`;

  const chart = /** @type {HTMLElement} */ (root.querySelector('.chart')),
    toggle = /** @type {HTMLElement} */ (root.querySelector('.axis-toggle')),
    chartNote = /** @type {HTMLElement} */ (root.querySelector('.chart-note')),
    autoLog = preferLog(series),
    axes = ['auto', 'linear', 'log', 'rows', 'violin'];
  let axis = new URLSearchParams(location.search).get('axis') ?? 'auto';
  if (!axes.includes(axis)) axis = 'auto';
  const draw = () => {
    const mode =
      axis === 'rows'
        ? 'rows'
        : axis === 'violin'
          ? autoLog
            ? 'violin-log'
            : 'violin'
          : axis === 'log' || (axis === 'auto' && autoLog)
            ? 'log'
            : 'shared';
    toggle.dataset.state = axis;
    const where = {
        rows: 'on its own axis, so shapes compare but positions do not',
        log: 'on one shared logarithmic axis',
        shared: 'on one shared axis',
        violin: 'on one shared axis',
        'violin-log': 'on one shared logarithmic axis'
      }[mode],
      marks =
        'The shaded band is the spread; the vertical line is the median, and the dark bar on top of it is the median’s CI (drawn at least 4\u00a0px wide).';
    chartNote.textContent =
      mode === 'violin' || mode === 'violin-log'
        ? `Each row is a violin of per-call times ${where}: a kernel density estimate, mirrored and scaled to its own peak. ${marks} The axis covers the 1st–99th percentile range.`
        : `Each row is a histogram of per-call times ${where}. ${marks} Counts at the edges are samples outside the 1st–99th percentile range. Hover a column for its range and count.`;
    renderChart(chart, series, format, mode);
  };
  toggle.addEventListener('click', event => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button[data-axis]');
    if (!button) return;
    axis = /** @type {HTMLElement} */ (button).dataset.axis;
    const url = new URL(location.href);
    if (axis === 'auto') url.searchParams.delete('axis');
    else url.searchParams.set('axis', axis);
    history.replaceState(null, '', url);
    draw();
  });
  draw();
  let lastWidth = chart.clientWidth;
  new ResizeObserver(() => {
    if (chart.clientWidth === lastWidth) return;
    lastWidth = chart.clientWidth;
    draw();
  }).observe(chart);
};

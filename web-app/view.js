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
<div class="meta">samples ${esc(p.samples ?? '?')} · bootstrap ${esc(p.bootstrap ?? '?')} · seed ${esc(p.seed ?? '?')} · α ${esc(p.alpha ?? '?')}${p.parallel ? ' · parallel' : ''}</div>
</div>`;
    })
    .join('')}</section>`;

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
    describeBin: (i, j) => {
      const from = fromAxis(hist.lo + j * hist.binWidth),
        to = fromAxis(hist.lo + (j + 1) * hist.binWidth),
        count = hist.series[i].counts[j];
      return `${series[i].label}: ${fmtOwn(from)} … ${fmtOwn(to)}, ${count} sample${count === 1 ? '' : 's'}`;
    }
  });
};

/** @param {'shared' | 'log' | 'rows'} mode */
export const renderChart = (container, series, format, mode) => {
  const width = Math.max(300, Math.floor(container.clientWidth));
  container.innerHTML =
    mode === 'rows'
      ? series.map(s => chartSvg([s], format, false, width)).join('')
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
    const p = multimodalityP(s.samples.slice().sort(numericAsc), dipSeed, j);
    if (p < 0.05)
      warnings.push(
        `${s.label}: the distribution looks multimodal (dip test ${pText(p)}); nano-bench-compare --clusters splits it`
      );
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
<section>
<div class="section-head"><h2>Distribution</h2>
<div class="axis-toggle" role="group" aria-label="Time axis">
<button type="button" data-axis="auto">Auto</button><button type="button" data-axis="linear">Linear</button><button type="button" data-axis="log">Log</button><button type="button" data-axis="rows">Per row</button>
</div></div>
<div class="chart"></div>
<p class="note">Each row is a histogram of per-call times <span class="axis-note"></span>. The shaded band is the spread; the vertical line is the median, and the dark bar on top of it is the median’s CI (drawn at least 4&nbsp;px wide). Counts at the edges are samples outside the 1st–99th percentile range. Hover a column for its range and count.</p>
</section>
${significanceSection(series, files.length, {alpha, correction})}`;

  const chart = /** @type {HTMLElement} */ (root.querySelector('.chart')),
    toggle = /** @type {HTMLElement} */ (root.querySelector('.axis-toggle')),
    axisNote = /** @type {HTMLElement} */ (root.querySelector('.axis-note')),
    autoLog = preferLog(series);
  let axis = 'auto';
  const draw = () => {
    const mode =
      axis === 'rows' ? 'rows' : axis === 'log' || (axis === 'auto' && autoLog) ? 'log' : 'shared';
    toggle.dataset.state = axis;
    axisNote.textContent = {
      rows: 'on its own axis, so shapes compare but positions do not',
      log: 'on one shared logarithmic axis',
      shared: 'on one shared axis'
    }[mode];
    renderChart(chart, series, format, mode);
  };
  toggle.addEventListener('click', event => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button[data-axis]');
    if (!button) return;
    axis = /** @type {HTMLElement} */ (button).dataset.axis;
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

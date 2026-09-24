export const escapeXml = s =>
  String(s).replace(
    /[&<>"']/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );

export const niceTicks = (lo, hi, count = 5) => {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count,
    magnitude = 10 ** Math.floor(Math.log10(raw)),
    norm = raw / magnitude,
    step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude,
    ticks = [];
  for (let i = Math.ceil(lo / step); i * step <= hi + step * 1e-9; ++i)
    ticks.push(+(i * step).toPrecision(12));
  return ticks;
};

// positions are log10 values; 1-2-5 steps per decade, thinned to decades when crowded
export const logTicks = (lo, hi, count = 5) => {
  const ticks = [];
  for (let d = Math.floor(lo); d <= Math.ceil(hi); ++d) {
    for (const m of [1, 2, 5]) {
      const p = d + Math.log10(m);
      if (p >= lo - 1e-9 && p <= hi + 1e-9) ticks.push(p);
    }
  }
  const decades = ticks.filter(p => Math.abs(p - Math.round(p)) < 1e-9);
  if (ticks.length > count * 1.5 && decades.length >= 2) return decades;
  if (ticks.length >= 2) return ticks;
  return niceTicks(10 ** lo, 10 ** hi, count)
    .filter(v => v > 0)
    .map(Math.log10);
};

const round = x => Math.round(x * 100) / 100;

// rounded data-end, square at the baseline
const barPath = (x, y, w, h) => {
  const r = Math.min(4, w / 2, h);
  return (
    `M${round(x)},${round(y + h)}V${round(y + r)}` +
    `Q${round(x)},${round(y)} ${round(x + r)},${round(y)}` +
    `H${round(x + w - r)}Q${round(x + w)},${round(y)} ${round(x + w)},${round(y + r)}` +
    `V${round(y + h)}Z`
  );
};

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Small-multiple histograms on one shared axis, one row per series.
 * @param {object} options
 * @param {string[]} options.names
 * @param {ReturnType<typeof import('../histogram.js').computeHistograms>} options.hist
 * @param {{median: number, lo: number, hi: number, ciLo?: number, ciHi?: number}[]} options.stats
 * @param {(values: number[]) => string[]} options.formatTicks
 * @param {(series: number, bin: number) => string} options.describeBin
 * @param {(series: number) => string} [options.describeRow]
 * @param {number[]} [options.ticks] tick positions in the histogram's units
 * @param {number} [options.width]
 */
export const distributionSvg = ({
  names,
  hist,
  stats,
  formatTicks,
  describeBin,
  describeRow = i => names[i],
  ticks: givenTicks,
  width = 720
}) => {
  // narrow: labels ride above their rows instead of a left gutter
  const compact = width < 560,
    labelHeight = compact ? 18 : 0,
    rowHeight = 52,
    rowGap = 12,
    rowStep = labelHeight + rowHeight + rowGap,
    padTop = 6,
    axisHeight = 28,
    labelWidth = compact ? 0 : Math.min(170, Math.max(90, Math.round(width * 0.22))),
    x0 = compact ? 12 : labelWidth,
    x1 = width - 12,
    plotWidth = x1 - x0,
    rows = names.length,
    height = padTop + rows * rowStep - rowGap + axisHeight,
    {lo, hi, k, maxCount} = hist,
    span = hi - lo || 1,
    X = v => x0 + (Math.min(hi, Math.max(lo, v)) - lo) * (plotWidth / span),
    slot = plotWidth / k,
    barWidth = Math.max(1, Math.min(24, slot - 2)),
    ticks = givenTicks ?? niceTicks(lo, hi, Math.max(2, Math.round(plotWidth / 110))),
    tickLabels = formatTicks(ticks),
    plotBottom = padTop + rows * rowStep - rowGap,
    out = [];

  out.push(
    `<svg class="dist" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Sample distributions">`
  );

  for (const t of ticks) {
    const x = round(X(t));
    out.push(`<line class="grid" x1="${x}" y1="${padTop}" x2="${x}" y2="${plotBottom}"/>`);
  }

  for (let i = 0; i < rows; ++i) {
    const top = padTop + i * rowStep + labelHeight,
      base = top + rowHeight,
      s = hist.series[i],
      st = stats[i];
    out.push(`<g class="row">`);
    const label = compact
      ? `<text class="label" x="${x0}" y="${top - 5}">${escapeXml(truncate(names[i], Math.floor(plotWidth / 7.5)))}`
      : `<text class="label" x="${x0 - 10}" y="${top + rowHeight / 2}" text-anchor="end" dominant-baseline="middle">${escapeXml(truncate(names[i], Math.floor(labelWidth / 7.5)))}`;
    out.push(`${label}<title>${escapeXml(describeRow(i))}</title></text>`);
    if (st) {
      const a = round(X(st.lo)),
        b = round(X(st.hi));
      out.push(
        `<rect class="spread" x="${a}" y="${top}" width="${round(Math.max(1, b - a))}" height="${rowHeight}"/>`
      );
    }
    for (let j = 0; j < k; ++j) {
      const count = s.counts[j],
        sx = x0 + j * slot,
        h = (count / maxCount) * (rowHeight - 4);
      out.push(`<g class="bin">`);
      out.push(
        `<rect class="hit" x="${round(sx)}" y="${top}" width="${round(slot)}" height="${rowHeight}"/>`
      );
      if (count)
        out.push(
          `<path class="bar" d="${barPath(sx + (slot - barWidth) / 2, base - h, barWidth, h)}"/>`
        );
      out.push(`<title>${escapeXml(describeBin(i, j))}</title></g>`);
    }
    out.push(`<line class="baseline" x1="${x0}" y1="${base}" x2="${x1}" y2="${base}"/>`);
    if (st) {
      const m = round(X(st.median));
      out.push(`<line class="median" x1="${m}" y1="${top}" x2="${m}" y2="${base}"/>`);
      if (typeof st.ciLo == 'number' && typeof st.ciHi == 'number') {
        const a = X(st.ciLo),
          w = Math.max(4, X(st.ciHi) - a);
        out.push(
          `<rect class="median-ci" x="${round(Math.min(a, m - w / 2))}" y="${top}" width="${round(w)}" height="4" rx="2"/>`
        );
      }
    }
    if (s.below)
      out.push(
        `<text class="tail" x="${x0 + 2}" y="${top + 10}">‹ ${s.below.count}<title>${s.below.count} below the axis</title></text>`
      );
    if (s.above)
      out.push(
        `<text class="tail" x="${x1 - 2}" y="${top + 10}" text-anchor="end">${s.above.count} ›<title>${s.above.count} above the axis</title></text>`
      );
    out.push(`</g>`);
  }

  ticks.forEach((t, i) => {
    const x = round(X(t));
    out.push(`<line class="tick" x1="${x}" y1="${plotBottom}" x2="${x}" y2="${plotBottom + 4}"/>`);
    out.push(
      `<text class="tick-label" x="${x}" y="${plotBottom + 18}" text-anchor="middle">${escapeXml(tickLabels[i])}</text>`
    );
  });

  out.push('</svg>');
  return out.join('');
};

export default distributionSvg;

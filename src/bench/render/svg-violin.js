import {kdeDensity} from '../../stats/kde-modes.js';
import {numericAsc} from '../../utils/numeric-asc.js';
import {escapeXml, niceTicks} from './svg-distribution.js';

const round = x => Math.round(x * 100) / 100;

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * One violin per series on a shared axis: the KDE of its samples mirrored around the row's
 * center line, each row scaled to its own peak, with the spread, the median, and its CI.
 * @param {object} options
 * @param {string[]} options.names
 * @param {number[][]} options.samples in axis units
 * @param {{median: number, lo: number, hi: number, ciLo?: number, ciHi?: number}[]} options.stats
 * @param {(values: number[]) => string[]} options.formatTicks
 * @param {(series: number) => string} [options.describeRow]
 * @param {number[]} [options.ticks]
 * @param {number} [options.width]
 */
export const violinSvg = ({
  names,
  samples,
  stats,
  formatTicks,
  describeRow = i => names[i],
  ticks: givenTicks,
  width = 720
}) => {
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
    sorted = samples.map(s => s.slice().sort(numericAsc)),
    // the 1st–99th percentile range of the pooled samples, as the histogram axis uses
    pooled = sorted.flat().sort(numericAsc),
    lo = pooled[Math.floor(pooled.length * 0.01)],
    hi = pooled[Math.max(0, Math.ceil(pooled.length * 0.99) - 1)],
    span = hi - lo || 1,
    X = v => x0 + (Math.min(hi, Math.max(lo, v)) - lo) * (plotWidth / span),
    ticks = givenTicks ?? niceTicks(lo, hi, Math.max(2, Math.round(plotWidth / 110))),
    tickLabels = formatTicks(ticks),
    plotBottom = padTop + rows * rowStep - rowGap,
    grid = Math.max(32, Math.min(200, Math.round(plotWidth / 3))),
    out = [];

  out.push(
    `<svg class="dist violin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Sample distributions as violins">`
  );
  for (const t of ticks) {
    const x = round(X(t));
    out.push(`<line class="grid" x1="${x}" y1="${padTop}" x2="${x}" y2="${plotBottom}"/>`);
  }

  for (let i = 0; i < rows; ++i) {
    const top = padTop + i * rowStep + labelHeight,
      mid = top + rowHeight / 2,
      half = rowHeight / 2 - 2,
      st = stats[i];
    out.push('<g class="row">');
    const label = compact
      ? `<text class="label" x="${x0}" y="${top - 5}">${escapeXml(truncate(names[i], Math.floor(plotWidth / 7.5)))}`
      : `<text class="label" x="${x0 - 10}" y="${mid}" text-anchor="end" dominant-baseline="middle">${escapeXml(truncate(names[i], Math.floor(labelWidth / 7.5)))}`;
    out.push(`${label}<title>${escapeXml(describeRow(i))}</title></text>`);
    if (st) {
      const a = round(X(st.lo)),
        b = round(X(st.hi));
      out.push(
        `<rect class="spread" x="${a}" y="${top}" width="${round(Math.max(1, b - a))}" height="${rowHeight}"/>`
      );
    }
    if (sorted[i].length > 1) {
      const {lo: gLo, step, density} = kdeDensity(sorted[i], {grid, lo, hi}),
        peak = Math.max(...density) || 1,
        upper = density.map(
          (d, g) => `${round(X(gLo + g * step))},${round(mid - (d / peak) * half)}`
        ),
        lower = density
          .map((d, g) => `${round(X(gLo + g * step))},${round(mid + (d / peak) * half)}`)
          .reverse();
      out.push(`<path class="violin-body" d="M${upper.join('L')}L${lower.join('L')}Z"/>`);
    }
    out.push(
      `<line class="baseline" x1="${x0}" y1="${round(mid)}" x2="${x1}" y2="${round(mid)}"/>`
    );
    if (st) {
      const m = round(X(st.median));
      out.push(`<line class="median" x1="${m}" y1="${top}" x2="${m}" y2="${top + rowHeight}"/>`);
      if (typeof st.ciLo == 'number' && typeof st.ciHi == 'number') {
        const a = X(st.ciLo),
          w = Math.max(4, X(st.ciHi) - a);
        out.push(
          `<rect class="median-ci" x="${round(Math.min(a, m - w / 2))}" y="${top}" width="${round(w)}" height="4" rx="2"/>`
        );
      }
    }
    out.push('</g>');
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

export default violinSvg;

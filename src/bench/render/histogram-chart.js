import {formatTime, prepareTimeFormat} from 'console-toolkit/alphanumeric/number-formatters.js';
import style, {c} from 'console-toolkit/style';
import drawColumns from 'console-toolkit/charts/columns/plain.js';
import drawBars from 'console-toolkit/charts/bars/plain.js';
import Turtle from 'console-toolkit/turtle/turtle.js';
import drawLineArt from 'console-toolkit/turtle/draw-line-art.js';
import axisTheme from 'console-toolkit/themes/lines/unicode.js';

const HEIGHT = 6,
  BARLEN = 40;

const palette = [
  style.brightCyan,
  style.brightMagenta,
  style.brightGreen,
  style.brightYellow,
  style.brightBlue,
  style.brightRed
];

const themeFor = color => /** @type {any} */ ([{colorState: color.getState()}]);
const ftime = v => formatTime(v, prepareTimeFormat([v], 1000));
const colOf = (value, lo, hi, width) =>
  Math.max(0, Math.min(width - 1, Math.round(((value - lo) / (hi - lo || 1)) * (width - 1))));

const markerRow = (width, lo, hi, marks) => {
  const cells = new Array(width).fill(null);
  for (const {value, glyph, color} of marks) {
    const col = colOf(value, lo, hi, width);
    if (!cells[col]) cells[col] = color.text(glyph);
  }
  return cells.map(cell => cell ?? ' ').join('');
};

// a notched axis baseline (square theme — an axis wants square ticks, not rounded);
// ticks point down toward the labels below it
const axisLine = (width, cols) => {
  const t = new Turtle(width, 1).markHalfDown();
  for (let i = 1; i < cols.length; ++i) t.forward(cols[i] - cols[i - 1]).markHalfDown();
  return drawLineArt(t, axisTheme).box[0];
};

const labelRow = (width, labels) => {
  const cells = new Array(width).fill(' ');
  for (const {col, label, align} of labels) {
    const at =
        align === 'left'
          ? col
          : align === 'right'
            ? col - label.length + 1
            : col - (label.length >> 1),
      start = Math.max(0, Math.min(width - label.length, at));
    for (let i = 0; i < label.length; ++i) cells[start + i] = label[i];
  }
  return cells.join('');
};

const axisLabels = (width, tick, lo, hi) => {
  const loL = tick(lo),
    midL = tick((lo + hi) / 2),
    hiL = tick(hi),
    mid = Math.round((width - 1) / 2);
  if (width >= loL.length + midL.length + hiL.length + 2)
    return labelRow(width, [
      {col: 0, label: loL, align: 'left'},
      {col: mid, label: midL, align: 'center'},
      {col: width - 1, label: hiL, align: 'right'}
    ]);
  if (width >= loL.length + hiL.length + 1)
    return labelRow(width, [
      {col: 0, label: loL, align: 'left'},
      {col: width - 1, label: hiL, align: 'right'}
    ]);
  return `${loL} … ${hiL}`;
};

export const writeHistograms = (writer, {names, hist, orientation = 'columns', emoji = true}) => {
  const {lo, hi, k, maxCount, series} = hist,
    bodyFmt = prepareTimeFormat([lo, hi], 1000),
    tick = v => formatTime(v, bodyFmt);

  // the time axis is the same range under every chart — render it once, restack under each
  // (plain columns are 1 char per bin, so the chart width is exactly k)
  const axisStr = axisLine(k, [0, Math.round((k - 1) / 2), k - 1]),
    labelStr = axisLabels(k, tick, lo, hi);

  writer.writeString(
    c`\n{{save.bold}}Distribution{{restore}} (${k} bins over ${tick(lo)}–${tick(hi)})\n`
  );

  for (let i = 0; i < series.length; ++i) {
    const s = series[i],
      color = palette[i % palette.length];
    // this line doubles as the marker legend: ▾ = median, ▿ = mean
    writer.writeString(
      `\n${color.text(style.bold.text(names[i]))}   ${color.text('▾')} ${style.dim.text('median')} ${color.text(ftime(s.median))}   ${color.text('▿')} ${style.dim.text('mean')} ${color.text(ftime(s.mean))}\n`
    );

    if (orientation === 'bars') {
      for (const l of drawBars(s.counts, BARLEN, {maxValue: maxCount, theme: themeFor(color)}))
        writer.writeString('  ' + l + '\n');
      writer.writeString(style.dim.text(`  time ${tick(lo)} (top) → ${tick(hi)} (bottom)`) + '\n');
    } else {
      // markers above the chart, pointing down — a mark over a near-empty bin flags a mean/median mismatch
      writer.writeString(
        '  ' +
          markerRow(k, lo, hi, [
            {value: s.median, glyph: '▾', color},
            {value: s.mean, glyph: '▿', color}
          ]) +
          '\n'
      );
      for (const l of drawColumns(s.counts, HEIGHT, {maxValue: maxCount, theme: themeFor(color)}))
        writer.writeString('  ' + l + '\n');
      writer.writeString('  ' + axisStr + '\n');
      writer.writeString('  ' + labelStr + '\n');
    }

    const parts = [];
    if (s.below) parts.push(`${s.below.count}↓ below (min ${ftime(s.below.min)})`);
    if (s.above) parts.push(`${s.above.count}↑ above (max ${ftime(s.above.max)})`);
    if (parts.length) writer.writeString(style.dim.text(`  outliers: ${parts.join(' · ')}`) + '\n');
    if (s.meanSparse)
      writer.writeString(
        c`  {{save.bright.yellow}}${emoji ? '⚠' : '!'} mean sits where few samples landed — distribution may be multimodal{{restore}}\n`
      );
  }
};

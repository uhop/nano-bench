import {formatTime, prepareTimeFormat} from 'console-toolkit/alphanumeric/number-formatters.js';
import style, {c} from 'console-toolkit/style';
import drawColumns from 'console-toolkit/charts/columns/plain.js';
import drawBars from 'console-toolkit/charts/bars/block-frac.js';
import Turtle from 'console-toolkit/turtle/turtle.js';
import drawLineArt from 'console-toolkit/turtle/draw-line-art.js';
import axisTheme from 'console-toolkit/themes/lines/unicode.js';
import Box from 'console-toolkit/box.js';

const HEIGHT = 6, // column chart height (rows)
  MINBAR = 8, //    bar length floor: charts get wider with fewer functions, down to this, then equal
  MAXBAR = 28; //   bar length ceiling, so one or two functions don't sprawl across a wide terminal

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

const legendLine = (name, s, color, lglyph, rglyph, tick) =>
  `${color.text(style.bold.text(name))}   ${color.text(lglyph)} ${style.dim.text('median')} ${color.text(tick(s.median))}   ${color.text(rglyph)} ${style.dim.text('mean')} ${color.text(tick(s.mean))}`;

// notes below the charts; with `prefix` (the side-by-side bars), a left-aligned name box keeps the
// note text lined up — the name sits on a function's first note, blank on any following ones
const writeOutliers = (writer, names, series, emoji, prefix) => {
  const nameRows = [],
    textRows = [];
  for (let i = 0; i < series.length; ++i) {
    const s = series[i],
      notes = [],
      parts = [];
    if (s.below) parts.push(`${s.below.count}↓ below (min ${ftime(s.below.min)})`);
    if (s.above) parts.push(`${s.above.count}↑ above (max ${ftime(s.above.max)})`);
    if (parts.length) notes.push(style.dim.text(parts.join(' · ')));
    if (s.meanSparse)
      notes.push(
        c`{{save.bright.yellow}}${emoji ? '⚠' : '!'} mean sits where few samples landed — distribution may be multimodal{{restore}}`
      );
    for (let j = 0; j < notes.length; ++j) {
      nameRows.push(j === 0 && prefix ? palette[i % palette.length].text(names[i]) : '');
      textRows.push(notes[j]);
    }
  }
  if (!textRows.length) return;
  const block = prefix
    ? Box.make(nameRows, {align: 'left'}).padRight(2).addRight(Box.make(textRows))
    : Box.make(textRows);
  for (const l of block.toStrings()) writer.writeString('  ' + l + '\n');
};

// bars: columns rotated 90° — horizontal bars, a vertical time axis on the left, the per-function
// charts stacked side by side (one shared axis), median/mean markers on the right pointing left.
// Every element (labels, axis, each chart, each marker column) is its own k-row Box, so addRight
// keeps them aligned; the legend is three aligned columns (names | medians | means).
const writeBars = (writer, {names, lo, hi, k, maxCount, series, tick, emoji}) => {
  const mid = Math.round((k - 1) / 2),
    color = i => palette[i % palette.length],
    rows = fn => Box.make(Array.from({length: k}, (_, r) => fn(r))),
    n = series.length,
    labelW = Math.max(...[lo, (lo + hi) / 2, hi].map(v => tick(v).length)),
    // split the terminal width across the n charts (each is barLen bars + 1 marker, gaps of 2,
    // plus indent + labels + rail): wider with fewer functions, clamped to [MINBAR, MAXBAR]
    fixed = 2 + labelW + 1 + n + 2 * (n - 1),
    barLen = Math.max(MINBAR, Math.min(MAXBAR, Math.floor(((writer.columns || 80) - fixed) / n)));

  // legend: three columns, padded apart, so names/medians/means line up vertically
  const namesBox = Box.make(
      series.map((_, i) => color(i).text(style.bold.text(names[i]))),
      {align: 'left'}
    ),
    medBox = Box.make(
      series.map(
        (s, i) =>
          `${color(i).text('◂')} ${style.dim.text('median')} ${color(i).text(tick(s.median))}`
      )
    ),
    meanBox = Box.make(
      series.map(
        (s, i) => `${color(i).text('◃')} ${style.dim.text('mean')} ${color(i).text(tick(s.mean))}`
      )
    );
  writer.writeString('\n');
  for (const l of namesBox.padRight(3).addRight(medBox.padRight(3)).addRight(meanBox).toStrings())
    writer.writeString(l + '\n');
  writer.writeString('\n');

  // chart: labels | axis | (chart_i | markers_i)…
  const labelCol = Box.make(
      Array.from({length: k}, (_, r) => {
        const v = r === 0 ? lo : r === mid ? (lo + hi) / 2 : r === k - 1 ? hi : null;
        return v === null ? '' : style.dim.text(tick(v));
      }),
      {align: 'right'}
    ),
    rail = rows(r => (r === 0 ? '┐' : r === k - 1 ? '┘' : r === mid ? '┤' : '│'));
  let chart = labelCol.addRight(rail);
  for (let i = 0; i < series.length; ++i) {
    const s = series[i],
      medRow = colOf(s.median, lo, hi, k),
      meanRow = colOf(s.mean, lo, hi, k),
      barsBox = Box.make(
        drawBars(s.counts, barLen, {maxValue: maxCount, rectSize: 1, theme: themeFor(color(i))})
      ),
      bars = barsBox.padRight(barLen - barsBox.width),
      markers = rows(r =>
        r === medRow ? color(i).text('◂') : r === meanRow ? color(i).text('◃') : ' '
      );
    chart = chart.addRight(i ? bars.padLeft(2) : bars).addRight(markers);
  }
  for (const l of chart.toStrings()) writer.writeString('  ' + l + '\n');

  writeOutliers(writer, names, series, emoji, true);
};

export const writeHistograms = (writer, {names, hist, orientation = 'columns', emoji = true}) => {
  // one format across every drawn body label — axis ticks + each median/mean — so they all share
  // unit and decimals; keepFractionAsIs holds the fixed precision (a documented formatTime option)
  const {lo, hi, k, maxCount, series} = hist,
    bodyFmt = {
      ...prepareTimeFormat(
        [lo, (lo + hi) / 2, hi, ...series.flatMap(s => [s.median, s.mean])],
        1000
      ),
      keepFractionAsIs: true
    },
    tick = v => formatTime(v, bodyFmt);

  writer.writeString(
    c`\n{{save.bold}}Distribution{{restore}} (${k} bins over ${tick(lo)}–${tick(hi)})\n`
  );

  if (orientation === 'bars') {
    writeBars(writer, {names, lo, hi, k, maxCount, series, tick, emoji});
    return;
  }

  // columns: per-function ridgeline. The time axis is the same range under every chart — render
  // it once (plain columns are 1 char per bin, so the chart width is exactly k) and restack it.
  const axisStr = axisLine(k, [0, Math.round((k - 1) / 2), k - 1]),
    labelStr = axisLabels(k, tick, lo, hi);

  for (let i = 0; i < series.length; ++i) {
    const s = series[i],
      color = palette[i % palette.length];
    // this line doubles as the marker legend: ▾ = median, ▿ = mean
    writer.writeString('\n' + legendLine(names[i], s, color, '▾', '▿', tick) + '\n');

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

    writeOutliers(writer, [names[i]], [s], emoji, false);
  }
};

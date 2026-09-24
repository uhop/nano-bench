import {
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import {minus} from 'console-toolkit/symbols.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

import {ciDeltas, intervalCells} from './summary-table.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

// clusters: [{weight, median, lo, hi, ciLo, ciHi, min, max}]
export const clustersTable = clusters => {
  const format = prepareTimeFormat(
      clusters.flatMap(c => [
        c.median - c.lo,
        c.median,
        c.hi - c.median,
        ...ciDeltas(c),
        c.min,
        c.max
      ]),
      1000
    ),
    tableData = /** @type {any[]} */ ([
      [
        {value: bold('#'), height: 2, align: 'dc'},
        {value: bold('weight'), height: 2, align: 'dc'},
        {value: bold('median'), height: 2, align: 'dc'},
        {value: bold('CI'), width: 2, align: 'c'},
        null,
        {value: bold('spread'), width: 2, align: 'c'},
        null,
        {value: bold('min'), height: 2, align: 'dc'},
        {value: bold('max'), height: 2, align: 'dc'}
      ],
      [
        null,
        null,
        null,
        {value: bold('+'), align: 'c'},
        {value: bold(minus), align: 'c'},
        {value: bold('+'), align: 'c'},
        {value: bold(minus), align: 'c'},
        null,
        null
      ]
    ]);
  clusters.forEach((c, i) => {
    tableData.push([
      bold(String(i + 1)),
      {value: num(formatNumber(100 * c.weight, {decimals: 1}) + '%'), align: 'r'},
      {value: bold(num(formatTime(c.median, format))), align: 'r'},
      ...intervalCells(c.ciLo, c.ciHi, c.median, format),
      ...intervalCells(c.lo, c.hi, c.median, format),
      {value: num(formatTime(c.min, format)), align: 'r'},
      {value: num(formatTime(c.max, format)), align: 'r'}
    ]);
  });
  const table = makeTable(tableData, lineTheme);
  table.vAxis[2] = 2;
  return table.toStrings();
};

export default clustersTable;

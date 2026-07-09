import {
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import {minus} from 'console-toolkit/symbols.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

// clusters: [{weight, median, lo, hi, min, max}]
export const clustersTable = clusters => {
  const format = prepareTimeFormat(
      clusters.flatMap(c => [c.median - c.lo, c.median, c.hi - c.median, c.min, c.max]),
      1000
    ),
    tableData = [
      [
        bold('#'),
        {value: bold('weight'), align: 'c'},
        {value: bold('median'), align: 'c'},
        {value: bold('+'), align: 'c'},
        {value: bold(minus), align: 'c'},
        {value: bold('min'), align: 'c'},
        {value: bold('max'), align: 'c'}
      ]
    ];
  clusters.forEach((c, i) => {
    tableData.push([
      bold(String(i + 1)),
      {value: num(formatNumber(100 * c.weight, {decimals: 1}) + '%'), align: 'r'},
      {value: bold(num(formatTime(c.median, format))), align: 'r'},
      {value: num('+' + formatTime(c.hi - c.median, format)), align: 'r'},
      {value: num(minus + formatTime(c.median - c.lo, format)), align: 'r'},
      {value: num(formatTime(c.min, format)), align: 'r'},
      {value: num(formatTime(c.max, format)), align: 'r'}
    ]);
  });
  const table = makeTable(tableData, lineTheme);
  table.vAxis[1] = 2;
  return table.toStrings();
};

export default clustersTable;

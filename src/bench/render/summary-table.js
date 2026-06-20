import {
  abbrNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import {minus} from 'console-toolkit/symbols.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

const tableHeader1 = [
    {value: 'name', height: 2, align: 'dc'},
    {value: 'time', width: 3, align: 'c'},
    null,
    null,
    {value: 'op/s', height: 2, align: 'dc'},
    {value: 'batch', height: 2, align: 'dc'}
  ].map(cell => (cell ? {...cell, value: bold(cell.value)} : null)),
  tableHeader2 = [
    null,
    {value: 'median', align: 'c'},
    {value: '+', align: 'c'},
    {value: minus, align: 'c'},
    null,
    null
  ].map(cell => (cell ? {...cell, value: bold(cell.value)} : null));

const makeTableData = (names, stats, iterations) => {
  const tableData = /** @type {any[]} */ ([tableHeader1, tableHeader2]);
  for (let i = 0; i < names.length; ++i) {
    const row = /** @type {any[]} */ ([bold(names[i])]),
      s = stats[i];
    if (s) {
      const format = prepareTimeFormat([s.median - s.lo, s.median, s.hi - s.median], 1000);
      row.push(
        {value: bold(num(formatTime(s.median, format))), align: 'r'},
        {value: num('+' + formatTime(s.hi - s.median, format)), align: 'r'},
        {value: num(minus + formatTime(s.median - s.lo, format)), align: 'r'},
        {value: num(abbrNumber(1000 / s.median)), align: 'r'}
      );
    } else if (i == stats.length) {
      row.push({value: 'measuring...', width: 4}, null, null, null);
    } else {
      row.push(null, null, null, null);
    }
    row.push(i < iterations.length ? {value: num(abbrNumber(iterations[i])), align: 'r'} : null);
    tableData.push(row);
  }
  return tableData;
};

export const summaryTable = (names, stats, iterations) => {
  const table = makeTable(makeTableData(names, stats, iterations), lineTheme);
  table.vAxis[2] = 2;
  return table.toStrings();
};

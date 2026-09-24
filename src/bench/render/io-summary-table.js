import {abbrNumber, formatTime} from 'console-toolkit/alphanumeric/number-formatters.js';
import {minus} from 'console-toolkit/symbols.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

import {intervalCells, sharedTimeFormat} from './summary-table.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

const tableHeader1 = [
    {value: 'name', height: 2, align: 'dc'},
    {value: 'median', height: 2, align: 'dc'},
    {value: 'CI', width: 2, align: 'c'},
    null,
    {value: 'spread', width: 2, align: 'c'},
    null,
    {value: 'p90', height: 2, align: 'dc'},
    {value: 'p99', height: 2, align: 'dc'},
    {value: 'op/s', height: 2, align: 'dc'},
    {value: 'runs', height: 2, align: 'dc'}
  ].map(cell => (cell ? {...cell, value: bold(cell.value)} : null)),
  tableHeader2 = [
    null,
    null,
    {value: '+', align: 'c'},
    {value: minus, align: 'c'},
    {value: '+', align: 'c'},
    {value: minus, align: 'c'},
    null,
    null,
    null,
    null
  ].map(cell => (cell ? {...cell, value: bold(cell.value)} : null));

const makeTableData = (names, stats, runs) => {
  const tableData = /** @type {any[]} */ ([tableHeader1, tableHeader2]),
    format = sharedTimeFormat(stats, s => [s.p90, s.p99]);
  for (let i = 0; i < names.length; ++i) {
    const row = /** @type {any[]} */ ([bold(names[i])]),
      s = stats[i];
    if (s) {
      row.push(
        {value: bold(num(formatTime(s.median, format))), align: 'r'},
        ...intervalCells(s.ciLo, s.ciHi, s.median, format),
        ...intervalCells(s.lo, s.hi, s.median, format),
        {value: num(formatTime(s.p90, format)), align: 'r'},
        {value: num(formatTime(s.p99, format)), align: 'r'},
        {value: num(abbrNumber(1000 / s.median)), align: 'r'}
      );
    } else if (i == stats.length) {
      row.push({value: 'measuring...', width: 8}, null, null, null, null, null, null, null);
    } else {
      row.push(null, null, null, null, null, null, null, null);
    }
    row.push(i < runs.length ? {value: num(abbrNumber(runs[i])), align: 'r'} : null);
    tableData.push(row);
  }
  return tableData;
};

export const ioSummaryTable = (names, stats, runs) => {
  const table = makeTable(makeTableData(names, stats, runs), lineTheme);
  table.vAxis[2] = 2;
  return table.toStrings();
};

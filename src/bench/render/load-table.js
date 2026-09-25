import {
  formatInteger,
  formatNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

/**
 * Per function: calls, the achieved throughput, and for an open loop the dropped calls, the
 * median service time (from the actual start), and the median start lag of the harness.
 * @param {string[]} names
 * @param {{calls: number, throughput: number, dropped?: number, scheduled?: number, serviceMedian?: number, lagMedian?: number}[]} loads
 * @param {boolean} open
 * @returns {string[]}
 */
export const loadTable = (names, loads, open) => {
  const serviceFormat = prepareTimeFormat(
      loads.map(l => l.serviceMedian ?? 0),
      1000
    ),
    lagFormat = prepareTimeFormat(
      loads.map(l => l.lagMedian ?? 0),
      1000
    ),
    header = [bold('name'), bold('calls'), bold('calls/s')];
  if (open) header.push(bold('dropped'), bold('service'), bold('start lag'));
  const tableData = /** @type {any[]} */ ([header]);
  for (let i = 0; i < names.length; ++i) {
    const l = loads[i],
      row = [
        bold(names[i]),
        {value: num(formatInteger(l.calls)), align: 'r'},
        {value: num(formatNumber(l.throughput, {decimals: 1})), align: 'r'}
      ];
    if (open)
      row.push(
        {value: num(formatInteger(l.dropped ?? 0)), align: 'r'},
        {value: num(formatTime(l.serviceMedian ?? 0, serviceFormat)), align: 'r'},
        {value: num(formatTime(l.lagMedian ?? 0, lagFormat)), align: 'r'}
      );
    tableData.push(row);
  }
  return makeTable(tableData, lineTheme).toStrings();
};

export default loadTable;

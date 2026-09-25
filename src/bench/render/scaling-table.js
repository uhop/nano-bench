import {formatTime, prepareTimeFormat} from 'console-toolkit/alphanumeric/number-formatters.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

/**
 * Medians by function (rows) and parameter value (columns), one time unit throughout.
 * @param {string[]} names
 * @param {unknown[]} values
 * @param {(number | undefined)[][]} medians medians[function][value]; undefined for a missing run
 * @returns {string[]}
 */
export const scalingTable = (names, values, medians) => {
  const format = prepareTimeFormat(
      medians.flat().filter(value => typeof value == 'number'),
      1000
    ),
    tableData = /** @type {any[]} */ ([
      [bold('name'), ...values.map(value => ({value: bold(String(value)), align: 'c'}))]
    ]);
  for (let i = 0; i < names.length; ++i) {
    tableData.push([
      bold(names[i]),
      ...medians[i].map(value => ({
        value: typeof value == 'number' ? num(formatTime(value, format)) : '—',
        align: 'r'
      }))
    ]);
  }
  const table = makeTable(tableData, lineTheme);
  return table.toStrings();
};

export default scalingTable;

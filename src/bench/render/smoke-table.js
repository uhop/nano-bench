import {formatTime, prepareTimeFormat} from 'console-toolkit/alphanumeric/number-formatters.js';
import {c} from 'console-toolkit/style.js';
import {Table} from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

export const smokeTable = smoke => {
  const timeFormat = prepareTimeFormat(
      smoke.map(result => result.time),
      1000
    ),
    rows = [];
  for (const result of smoke) {
    rows.push([
      result.ok ? c`{{save.bright.green}}OK{{restore}}` : c`{{save.bright.red}}FAILED{{restore}}`,
      result.name,
      {
        value: c`{{save.bright.yellow}}${formatTime(result.time, timeFormat)}{{restore}}`,
        align: 'r'
      }
    ]);
    if (!result.ok)
      rows.push([
        null,
        {value: c`{{save.bright.red}}${String(result.error)}{{restore}}`, width: 2},
        null
      ]);
  }
  return new Table(rows, lineTheme, {
    hAxis: [0, 0, 0, 0],
    vAxis: new Array(rows.length + 1).fill(0)
  }).toStrings();
};

export default smokeTable;

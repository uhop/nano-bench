import {
  abbrNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

import {metricSpecs} from '../metrics-specs.js';

export {metricSpecs, metricLegends, metricMedians, guardedMedians} from '../metrics-specs.js';

const formatValue = (value, kind) => {
  if (value == null) return '';
  switch (kind) {
    case 'us':
      return formatTime(value / 1000, prepareTimeFormat([value / 1000], 1000));
    case 'bytes':
      return abbrNumber(value) + 'B';
  }
  return abbrNumber(value);
};

export const metricsTable = (names, medians, specName) => {
  const spec = metricSpecs[specName],
    tableData = [[bold('name'), ...spec.map(({label}) => ({value: bold(label), align: 'c'}))]];
  for (let i = 0; i < names.length; ++i) {
    tableData.push([
      bold(names[i]),
      ...spec.map(({key, kind}) => ({value: num(formatValue(medians[i][key], kind)), align: 'r'}))
    ]);
  }
  const table = makeTable(tableData, lineTheme);
  table.vAxis[1] = 2;
  return table.toStrings();
};

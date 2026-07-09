import {
  abbrNumber,
  formatTime,
  prepareTimeFormat
} from 'console-toolkit/alphanumeric/number-formatters.js';
import style from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';

import quantileSorted from '../../stats/quantile.js';
import numericAsc from '../../utils/numeric-asc.js';

const bold = s => style.bold.text(s),
  num = s => style.bright.yellow.text(s);

export const metricSpecs = {
  rusage: [
    {key: 'cpuUser', label: 'cpu user', kind: 'us'},
    {key: 'cpuSystem', label: 'cpu sys', kind: 'us'},
    {key: 'minorPageFault', label: 'minor pf', kind: 'count'},
    {key: 'majorPageFault', label: 'major pf', kind: 'count'},
    {key: 'voluntaryContextSwitches', label: 'vcsw', kind: 'count'},
    {key: 'involuntaryContextSwitches', label: 'icsw', kind: 'count'}
  ],
  proc: [
    {key: 'peakRSS', label: 'peak rss', kind: 'bytes'},
    {key: 'logicalRead', label: 'read', kind: 'bytes'},
    {key: 'logicalWrite', label: 'write', kind: 'bytes'},
    {key: 'physicalRead', label: 'phys read', kind: 'bytes'},
    {key: 'physicalWrite', label: 'phys write', kind: 'bytes'},
    {key: 'syscallRead', label: 'syscr', kind: 'count'},
    {key: 'syscallWrite', label: 'syscw', kind: 'count'}
  ]
};

export const metricLegends = {
  rusage: 'pf = page fault, icsw/vcsw = (in)voluntary context switches',
  proc: 'phys = block-layer bytes, syscr/syscw = read/write syscalls'
};

export const metricMedians = (perRun, spec) => {
  const medians = {};
  for (const {key} of spec) {
    const sorted = perRun
      .filter(Boolean)
      .map(reading => reading[key])
      .sort(numericAsc);
    medians[key] = sorted.length ? quantileSorted(sorted, 0.5) : null;
  }
  return medians;
};

// a median over a minority of runs isn't a median — render blank instead
export const guardedMedians = (perRun, spec) =>
  metricMedians(perRun.filter(Boolean).length * 2 >= perRun.length ? perRun : [], spec);

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

import quantileSorted from '../stats/quantile.js';
import numericAsc from '../utils/numeric-asc.js';

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

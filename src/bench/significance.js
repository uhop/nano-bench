import mwtest from '../significance/mwtest.js';
import kwtest from '../significance/kwtest.js';
import cliffDelta from '../significance/cliff.js';
import {numericAsc} from '../utils/numeric-asc.js';

export const computeSignificance = (seriesArrays, alpha = 0.05, correction = 'holm') => {
  const sorted = seriesArrays.map(series => series.slice().sort(numericAsc));
  return sorted.length === 2
    ? {test: 'mann-whitney-u', correction: 'none', ...mwtest(sorted[0], sorted[1], alpha)}
    : {
        test: 'kruskal-wallis',
        ...kwtest(sorted, alpha, correction),
        effects: sorted.map((a, i) => sorted.map((b, j) => (i === j ? 0 : cliffDelta(a, b))))
      };
};

export const significanceMatrix = result =>
  result.different
    ? (result.groupDifference ?? [
        [false, true],
        [true, false]
      ])
    : null;

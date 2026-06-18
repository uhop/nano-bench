import mwtest from '../significance/mwtest.js';
import kwtest from '../significance/kwtest.js';

const numericAsc = (a, b) => a - b;

export const computeSignificance = (seriesArrays, alpha = 0.05) => {
  const sorted = seriesArrays.map(series => series.slice().sort(numericAsc));
  return sorted.length === 2
    ? {test: 'mann-whitney-u', ...mwtest(sorted[0], sorted[1], alpha)}
    : {test: 'kruskal-wallis', ...kwtest(sorted, alpha)};
};

export const significanceMatrix = result =>
  result.different
    ? (result.groupDifference ?? [
        [false, true],
        [true, false]
      ])
    : null;

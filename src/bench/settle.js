import {bootstrap, getWeightedValue} from '../stats.js';
import {numericAsc} from '../utils/numeric-asc.js';

const median = sample => getWeightedValue(sample.sort(numericAsc), 0.5);

/**
 * Whether each pair's difference is settled against a threshold: the bootstrap percentile CI of
 * the log ratio of medians lies wholly beyond ±log(1 + threshold) (a difference of at least the
 * threshold) or wholly inside it (none that big). Per-pair α, not corrected for the pair count.
 * @param {number[][]} samples runs per function
 * @param {{threshold: number, alpha?: number, bootstrap?: number, random?: () => number}} options
 *   `threshold` as a fraction: 0.05 for 5%
 * @returns {{settled: boolean, pairs: {i: number, j: number, ratioLo: number, ratioHi: number, state: 'faster' | 'slower' | 'equivalent' | 'unsettled'}[]}}
 *   `faster`: function i is faster than j by at least the threshold
 */
export const settlePairs = (samples, {threshold, alpha = 0.05, bootstrap: n = 1000, random}) => {
  const medians = samples.map(s => bootstrap(median, s, n, random)),
    bound = Math.log1p(threshold),
    pairs = [];
  for (let i = 0; i < samples.length; ++i) {
    for (let j = i + 1; j < samples.length; ++j) {
      const logs = medians[i].map((m, k) => Math.log(m / medians[j][k])).sort(numericAsc),
        lo = getWeightedValue(logs, alpha / 2),
        hi = getWeightedValue(logs, 1 - alpha / 2),
        state =
          hi < -bound
            ? 'faster'
            : lo > bound
              ? 'slower'
              : lo >= -bound && hi <= bound
                ? 'equivalent'
                : 'unsettled';
      pairs.push({i, j, ratioLo: Math.exp(lo), ratioHi: Math.exp(hi), state});
    }
  }
  return {settled: pairs.every(pair => pair.state !== 'unsettled'), pairs};
};

export default settlePairs;

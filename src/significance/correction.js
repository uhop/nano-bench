// Family-wise error-rate control for the post-hoc pairwise comparisons.
// https://en.wikipedia.org/wiki/Holm%E2%80%93Bonferroni_method
// Operates on |z|-like statistics whose uncorrected two-sided critical value
// is zPpf(1 - alpha/2); returns a per-comparison rejection flag.

import zPpf from '../stats/z-ppf.js';

export const corrections = ['none', 'holm', 'bonferroni'];

export const correctPairwise = (stats, alpha, correction = 'holm') => {
  const M = stats.length;

  if (correction === 'bonferroni') {
    const c = zPpf(1 - alpha / M / 2);
    return stats.map(t => t > c);
  }

  if (correction === 'holm') {
    // step down over statistics sorted descending (≡ p-values ascending);
    // the first comparison that fails its threshold halts the rest.
    const order = stats.map((_, i) => i).sort((x, y) => stats[y] - stats[x]),
      reject = new Array(M).fill(false);
    for (let r = 0; r < M; ++r) {
      if (stats[order[r]] > zPpf(1 - alpha / (M - r) / 2)) reject[order[r]] = true;
      else break;
    }
    return reject;
  }

  const c = zPpf(1 - alpha / 2);
  return stats.map(t => t > c);
};

export default correctPairwise;

import mwtest from '../significance/mwtest.js';
import numericAsc from '../utils/numeric-asc.js';

// windowed Mann–Whitney screen over the run sequence: drop leading windows that
// read significantly slower than the remainder — repeated tests make this a
// heuristic, and it is labeled as such upstream
export const detectWarmup = (samples, {alpha = 0.05, maxFraction = 0.25, minRuns = 20} = {}) => {
  const n = samples.length;
  if (n < minRuns) return 0;
  const window = Math.max(5, Math.floor(n / 20)),
    maxDrop = Math.floor(n * maxFraction);
  let drop = 0;
  while (drop + window <= maxDrop) {
    const head = samples.slice(drop, drop + window).sort(numericAsc),
      rest = samples.slice(drop + window).sort(numericAsc),
      result = mwtest(head, rest, alpha);
    if (!result.different || result.delta <= 0) break;
    drop += window;
  }
  return drop;
};

export default detectWarmup;

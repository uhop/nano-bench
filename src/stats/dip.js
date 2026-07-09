import numericAsc from '../utils/numeric-asc.js';

// prefix pass: for every m, the max gap of the ECDF step-tops above the greatest
// convex minorant of the first m+1 points (AS 217's dl, per prefix)
const prefixGaps = x => {
  const n = x.length,
    hull = [0],
    segGap = [0],
    prefMax = [0],
    gaps = new Array(n).fill(0);
  for (let i = 1; i < n; ++i) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2],
        b = hull[hull.length - 1];
      if ((x[i] - x[b]) * (b - a) < (x[b] - x[a]) * (i - b)) break;
      hull.pop();
      segGap.pop();
      prefMax.pop();
    }
    const jb = hull[hull.length - 1],
      width = x[i] - x[jb];
    let gap = 1;
    if (i - jb > 1 && width > 0) {
      const slope = (i - jb) / width;
      for (let r = jb + 1; r < i; ++r) {
        const t = r - jb + 1 - (x[r] - x[jb]) * slope;
        if (t > gap) gap = t;
      }
    }
    hull.push(i);
    segGap.push(gap);
    prefMax.push(Math.max(gap, prefMax[prefMax.length - 1]));
    gaps[i] = prefMax[prefMax.length - 1] / n;
  }
  return gaps;
};

// unimodality gap: min over mode positions of the half-gap to the nearest
// convex-then-concave CDF — a Hartigan-dip-style statistic (lower-bounds the
// classical dip where the two halves conflict at the mode). The p-value comes
// from a seeded bootstrap of the SAME statistic under the uniform null, so the
// calibration stays honest.
export const dipStatistic = sorted => {
  const n = sorted.length;
  if (n < 4) return n ? 1 / (2 * n) : 0;
  const left = prefixGaps(sorted),
    reversed = new Array(n);
  for (let i = 0; i < n; ++i) reversed[i] = -sorted[n - 1 - i];
  const rightReversed = prefixGaps(reversed);
  let dip = Infinity;
  for (let m = 0; m < n; ++m) {
    const e = Math.max(left[m], rightReversed[n - 1 - m]);
    if (e < dip) dip = e;
  }
  return Math.max(dip, 1 / n) / 2;
};

const CAP = 500;

export const dipTest = (samples, {bootstrap = 200, random = Math.random} = {}) => {
  let data = samples;
  // n is capped to bound the O(n^2) worst case; a random subsample is a valid,
  // slightly less powerful test
  if (data.length > CAP) {
    data = [];
    for (let i = 0; i < CAP; ++i) data.push(samples[Math.floor(random() * samples.length)]);
  }
  const n = data.length,
    dip = dipStatistic(data.slice().sort(numericAsc));
  let exceeded = 0;
  const uniform = new Array(n);
  for (let b = 0; b < bootstrap; ++b) {
    for (let i = 0; i < n; ++i) uniform[i] = random();
    if (dipStatistic(uniform.sort(numericAsc)) >= dip) ++exceeded;
  }
  return {dip, n, p: (exceeded + 1) / (bootstrap + 1)};
};

export default dipTest;

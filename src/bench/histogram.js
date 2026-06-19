const asc = (a, b) => a - b;

export const percentile = (sorted, p) => {
  const i = (sorted.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// Freedman–Diaconis: IQR-based bin width, robust to the right tails timing data has.
const fdBinCount = (sorted, span) => {
  const n = sorted.length,
    iqr = percentile(sorted, 0.75) - percentile(sorted, 0.25);
  if (iqr <= 0 || span <= 0) return Math.max(1, Math.ceil(Math.sqrt(n)));
  return Math.max(1, Math.ceil(span / (2 * iqr * Math.pow(n, -1 / 3))));
};

/**
 * @param {number[][]} seriesArrays
 * @param {{bins?: number, clamp?: number, maxBins?: number}} [options]
 */
export const computeHistograms = (seriesArrays, {bins, clamp = 0.01, maxBins = 40} = {}) => {
  const pooled = seriesArrays.flat().slice().sort(asc),
    lo = percentile(pooled, clamp),
    hi = percentile(pooled, 1 - clamp),
    span = hi - lo || 1,
    inRange = pooled.filter(x => x >= lo && x <= hi),
    k = Math.max(1, Math.min(maxBins, bins || fdBinCount(inRange, span))),
    binOf = x => Math.min(k - 1, Math.max(0, Math.floor(((x - lo) / span) * k)));

  const series = seriesArrays.map(arr => {
    const sorted = arr.slice().sort(asc),
      counts = new Array(k).fill(0);
    let belowCount = 0,
      belowMin = Infinity,
      aboveCount = 0,
      aboveMax = -Infinity;
    for (const x of sorted) {
      if (x < lo) {
        ++belowCount;
        if (x < belowMin) belowMin = x;
      } else if (x > hi) {
        ++aboveCount;
        if (x > aboveMax) aboveMax = x;
      } else ++counts[binOf(x)];
    }
    const med = percentile(sorted, 0.5),
      avg = mean(sorted),
      medianBin = binOf(Math.min(hi, Math.max(lo, med))),
      meanInRange = avg >= lo && avg <= hi,
      // the post's lesson: an average landing where almost nothing was measured
      meanSparse = meanInRange ? counts[binOf(avg)] < 0.25 * Math.max(1, counts[medianBin]) : true;
    return {
      counts,
      median: med,
      mean: avg,
      below: belowCount ? {count: belowCount, min: belowMin} : null,
      above: aboveCount ? {count: aboveCount, max: aboveMax} : null,
      meanSparse
    };
  });

  return {
    lo,
    hi,
    k,
    binWidth: span / k,
    maxCount: Math.max(1, ...series.flatMap(s => s.counts)),
    series
  };
};

import quantileSorted from '../stats/quantile.js';
import {mad, modifiedZ} from '../stats/mad.js';
import numericAsc from '../utils/numeric-asc.js';

const THRESHOLD = 3.5;

// slow side only: fast outliers don't mislead a latency benchmark
export const outlierNotes = (samples, threshold = THRESHOLD) => {
  const sorted = [...samples].sort(numericAsc),
    med = quantileSorted(sorted, 0.5),
    m = mad(sorted, med);
  if (!m) return {outliers: [], note: ''};
  const outliers = [];
  for (let i = 0; i < samples.length; ++i) {
    if (modifiedZ(samples[i], med, m) > threshold) outliers.push(i);
  }
  if (!outliers.length) return {outliers, note: ''};
  return {
    outliers,
    note: outliers.every(i => i < 2)
      ? 'the slowest runs were the first ones — caching/warmup suspected, consider --warmup'
      : 'scattered slow outliers — interference from other programs suspected'
  };
};

export default outlierNotes;

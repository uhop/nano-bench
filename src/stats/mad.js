import quantileSorted from './quantile.js';
import numericAsc from '../utils/numeric-asc.js';

export const mad = (sorted, med = quantileSorted(sorted, 0.5)) =>
  quantileSorted(sorted.map(x => Math.abs(x - med)).sort(numericAsc), 0.5);

// Iglewicz–Hoaglin modified z-score
export const modifiedZ = (x, med, madValue) => (0.6745 * (x - med)) / madValue;

export default mad;

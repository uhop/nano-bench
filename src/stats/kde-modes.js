import {stdDev} from '../stats.js';
import quantileSorted from './quantile.js';

// Gaussian KDE with Silverman's bandwidth; clusters split at the density minima
// between local maxima — the mode count is a heuristic, not an assertion
export const kdeClusters = (sorted, {grid = 256} = {}) => {
  const n = sorted.length;
  if (n < 2 || sorted[0] === sorted[n - 1]) return {clusters: [sorted], boundaries: [], modes: []};
  const sd = stdDev(sorted),
    iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25),
    spread = Math.min(sd || Infinity, iqr / 1.34 || Infinity),
    h =
      0.9 * (isFinite(spread) && spread > 0 ? spread : (sorted[n - 1] - sorted[0]) / 4) * n ** -0.2;
  const lo = sorted[0] - 3 * h,
    hi = sorted[n - 1] + 3 * h,
    step = (hi - lo) / (grid - 1),
    density = new Array(grid).fill(0);
  for (let g = 0; g < grid; ++g) {
    const cx = lo + g * step;
    let sum = 0;
    for (let i = 0; i < n; ++i) {
      const z = (cx - sorted[i]) / h;
      if (z > -6 && z < 6) sum += Math.exp(-0.5 * z * z);
    }
    density[g] = sum;
  }
  const maxima = [];
  for (let g = 0; g < grid; ++g) {
    const left = g > 0 ? density[g - 1] : -1,
      right = g + 1 < grid ? density[g + 1] : -1;
    if (density[g] > left && density[g] >= right) maxima.push(g);
  }
  const boundaries = [];
  for (let k = 1; k < maxima.length; ++k) {
    let argmin = maxima[k - 1] + 1;
    for (let g = argmin + 1; g < maxima[k]; ++g) {
      if (density[g] < density[argmin]) argmin = g;
    }
    boundaries.push(lo + argmin * step);
  }
  const clusters = [];
  let start = 0;
  for (const boundary of boundaries) {
    let end = start;
    while (end < n && sorted[end] <= boundary) ++end;
    if (end > start) {
      clusters.push(sorted.slice(start, end));
      start = end;
    }
  }
  if (start < n) clusters.push(sorted.slice(start));
  return {clusters, boundaries, modes: maxima.map(g => lo + g * step)};
};

export default kdeClusters;

// R-7 linear interpolation (R/NumPy default)
export const quantileSorted = (sorted, p) => {
  const n = sorted.length;
  if (!n) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * p,
    i = Math.floor(h),
    frac = h - i;
  return i + 1 < n ? sorted[i] + frac * (sorted[i + 1] - sorted[i]) : sorted[i];
};

export default quantileSorted;

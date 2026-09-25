// Cliff's delta: https://en.wikipedia.org/wiki/Effect_size#Effect_size_for_ordinal_data

/**
 * P(x > y) − P(x < y) over every pair of an element of `sorted1` and one of `sorted2`,
 * the same value as 2·A12 − 1 from the Mann–Whitney U statistic.
 * @param {ArrayLike<number>} sorted1 ascending
 * @param {ArrayLike<number>} sorted2 ascending
 * @returns {number} in [−1, 1]; positive when the first sample tends to be larger
 */
export const cliffDelta = (sorted1, sorted2) => {
  const n1 = sorted1.length,
    n2 = sorted2.length;
  if (!n1 || !n2) return 0;
  let below = 0,
    notAbove = 0,
    greater = 0,
    less = 0;
  for (let i = 0; i < n1; ++i) {
    const x = sorted1[i];
    while (below < n2 && sorted2[below] < x) ++below;
    if (notAbove < below) notAbove = below;
    while (notAbove < n2 && sorted2[notAbove] <= x) ++notAbove;
    greater += below;
    less += n2 - notAbove;
  }
  return (greater - less) / (n1 * n2);
};

// Romano et al. 2006
/** @param {number} delta */
export const effectMagnitude = delta => {
  const size = Math.abs(delta);
  return size < 0.147 ? 'negligible' : size < 0.33 ? 'small' : size < 0.474 ? 'medium' : 'large';
};

export default cliffDelta;

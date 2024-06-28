// Kruskal-Wallis significance test
// based on https://en.wikipedia.org/wiki/Kruskal%E2%80%93Wallis_one-way_analysis_of_variance
// beta approximation: https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.661.7863&rep=rep1&type=pdf

import betaPpf from '../stats/beta-ppf.js';
import chiSquaredPpf from '../stats/chi-squared-ppf.js';
import rank, {getTotal} from '../stats/rank.js';

export const getParameters = (groups, N = getTotal(groups)) => {
  const k = groups.length,
    mu = k - 1,
    nu = (N * N * N - groups.reduce((acc, {length: n}) => acc + n * n * n, 0)) / N / (N + 1),
    sigmaSquared =
      2 * mu -
      (0.4 * (3 * k * k - 6 * k + N * (2 * k * k - 6 * k + 1))) / N / (N + 1) -
      1.2 * groups.reduce((acc, group) => acc + 1 / group.length, 0),
    a = (mu * ((mu * (nu - mu)) / sigmaSquared - 1)) / nu,
    b = a * (nu / mu - 1);
  return {mu, nu, sigmaSquared, a, b, k, N};
};

export const rankData = groups => {
  const {N, k, ranked: t, groupRank, avgGroupRank, avgRank} = rank(groups),
    avgRankC = N * avgRank * avgRank;

  // calculate required sums
  let numerator = 0,
    T = 0;
  for (let i = 0; i < avgGroupRank.length; ++i) {
    const x = avgGroupRank[i] - avgRank;
    numerator += groups[i].length * x * x;
    T += (groupRank[i] * groupRank[i]) / groups[i].length - avgRankC;
  }

  let denominator = 0,
    S2 = 0;
  for (let i = 0; i < t.length; ++i) {
    const x = t[i].rank - avgRank;
    denominator += x * x;
    S2 = t[i].rank * t[i].rank - avgRankC;
  }

  S2 /= N - 1;
  T /= S2;

  // calculate and return H statistics
  return {H: ((N - 1) * numerator) / denominator, T, S2, groupRank, avgGroupRank, avgRank, k, N};
};

export const kwtest = (sortedArrays, alpha = 0.05) => {
  if (sortedArrays.length < 2) throw new Error('Two or more data arrays were expected');

  const {a, b, nu, k, N} = getParameters(sortedArrays),
    {H, T, S2, avgGroupRank} = rankData(sortedArrays),
    limit = betaPpf(1 - alpha, a, b) * nu, // Hc
    results = {value: H, alpha, limit, different: H > limit};

  if (!results.different || k < 3) return results;

  // post-hoc tests

  const m = new Array(k),
    C = chiSquaredPpf(1 - alpha / 2, N - k) * Math.sqrt((S2 * (N - 1 - T)) / (N - k));

  for (let i = 0; i < k; ++i) {
    m[i] = new Array(k);
  }
  for (let i = 0; i < k; ++i) {
    m[i][i] = false;
    for (let j = i + 1; j < k; ++j) {
      m[i][j] = m[j][i] =
        Math.abs(avgGroupRank[i] - avgGroupRank[j]) >
        C * Math.sqrt(1 / sortedArrays[i].length + 1 / sortedArrays[j].length);
    }
  }

  results.groupDifference = m;
  return results;
};

export default kwtest;

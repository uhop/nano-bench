// Kruskal-Wallis significance test
// based on https://en.wikipedia.org/wiki/Kruskal%E2%80%93Wallis_one-way_analysis_of_variance
// beta approximation: https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.661.7863&rep=rep1&type=pdf
// incomplete beta function: https://mathworld.wolfram.com/IncompleteBetaFunction.html

import betaPpf from './beta-ppf.js';
import chiSquaredPpf from './chi-squared-ppf.js';

const getTotal = groups => groups.reduce((acc, group) => acc + group.length, 0);

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
  const N = getTotal(groups),
    k = groups.length,
    t = new Array(N);

  // put in one array preserving grouping
  let o = 0;
  for (let i = 0; i < k; ++i) {
    const group = groups[i];
    for (let j = 0; j < group.length; ++j) {
      t[o++] = {value: group[j], group: i};
    }
  }

  const groupRank = new Array(k);
  groupRank.fill(0);

  // sort and rank
  t.sort((a, b) => a.value - b.value);
  for (let i = 0; i < t.length; ) {
    let ahead = i + 1;
    const value = t[i].value;
    while (ahead < t.length && value === t[ahead].value) ++ahead;
    if (ahead - i === 1) {
      groupRank[t[i].group] += t[i].rank = i + 1;
    } else {
      const rank = (i + 1 + ahead) / 2;
      for (let j = i; j < ahead; ++j) {
        groupRank[t[j].group] += t[j].rank = rank;
      }
    }
    i = ahead;
  }
  const avgGroupRank = groupRank.map((rank, i) => rank / groups[i].length);

  const avgRank = (N + 1) / 2,
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

const kwtest = (sortedArrays, alpha = 0.05) => {
  const {a, b, nu, k, N} = getParameters(sortedArrays),
    {H, T, S2, avgGroupRank} = rankData(sortedArrays),
    limit = betaPpf(1 - alpha, a, b) * nu, // Hc
    results = {value: H, alpha, limit, rejected: H > limit};

  if (!results.rejected) return results;

  // post-hoc tests

  const m = new Array(k),
    C = chiSquaredPpf(1 - alpha / 2, N - k) * Math.sqrt((S2 * (N - 1 - T)) / (N - k));

  for (let i = 0; i < k; ++i) {
    m[i] = new Array(k);
    for (let j = i + 1; j < k; ++j) {
      m[i][j] =
        Math.abs(avgGroupRank[i] - avgGroupRank[j]) >
        C * Math.sqrt(1 / sortedArrays[i].length + 1 / sortedArrays[j].length);
    }
  }

  results.groupDifference = m;
  return results;
};

export default kwtest;

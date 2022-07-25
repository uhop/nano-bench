// Kruskal-Wallis significance test
// based on https://en.wikipedia.org/wiki/Kruskal%E2%80%93Wallis_one-way_analysis_of_variance
// beta approximation: https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.661.7863&rep=rep1&type=pdf
// incomplete beta function: https://mathworld.wolfram.com/IncompleteBetaFunction.html

const LIMIT = 1000;
const EPSILON = 1e-30;

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
    t = new Array(N);

  // put in one array preserving grouping
  let o = 0;
  for (let i = 0; i < groups.length; ++i) {
    const group = groups[i];
    for (let j = 0; j < group.length; ++j) {
      t[o++] = {value: group[j], group: i};
    }
  }

  const avgGroupRank = new Array(groups.length);
  avgGroupRank.fill(0);

  // sort and rank
  t.sort((a, b) => a.value - b.value);
  for (let i = 0; i < t.length; ) {
    let ahead = i + 1;
    const value = t[i].value;
    while (ahead < t.length && value === t[ahead].value) ++ahead;
    if (ahead - i === 1) {
      avgGroupRank[t[i].group] += t[i].rank = i + 1;
    } else {
      const rank = (i + 1 + ahead) / 2;
      for (let j = i; j < ahead; ++j) {
        avgGroupRank[t[j].group] += t[j].rank = rank;
      }
    }
    i = ahead;
  }
  for (let i = 0; i < avgGroupRank.length; ++i) {
    avgGroupRank[i] /= groups[i].length;
  }

  const avgRank = (N + 1) / 2;
  // console.log(t, avgRank, avgGroupRank);

  // calculate required sums
  let numerator = 0;
  for (let i = 0; i < avgGroupRank.length; ++i) {
    const x = avgGroupRank[i] - avgRank;
    numerator += groups[i].length * x * x;
  }

  let denominator = 0;
  for (let i = 0; i < t.length; ++i) {
    const x = t[i].rank - avgRank;
    denominator += x * x;
  }

  // calculate and return H statistics
  return ((N - 1) * numerator) / denominator;
};

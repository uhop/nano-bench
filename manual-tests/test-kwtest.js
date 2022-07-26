import {getParameters, rankData} from '../src/kwtest.js';
import betaPpf from '../src/beta-ppf.js';
import chiSquaredPpf from '../src/chi-squared-ppf.js';

const ALPHA = 0.05;

const calculateH = (...groups) => {
  const {a, b, nu, k, N} = getParameters(groups),
    {H, T, S2, avgGroupRank} = rankData(groups),
    Hc = betaPpf(1 - ALPHA, a, b) * nu;

  console.log('parameters:', a, b, nu, k, N);
  console.log(H, Hc, H > Hc ? 'STATISTICALLY SIGNIFICANT' : 'statistically insignificant');

  if (H <= Hc) return;

  // post-hoc tests

  const C = chiSquaredPpf(1 - ALPHA / 2, N - k) * Math.sqrt((S2 * (N - 1 - T)) / (N - k));

  console.log('\nStatistically significant difference between groups:');

  for (let i = 0; i < k; ++i) {
    for (let j = i + 1; j < k; ++j) {
      const flag =
        Math.abs(avgGroupRank[i] - avgGroupRank[j]) >
        C * Math.sqrt(1 / groups[i].length + 1 / groups[j].length);
      if (flag) {
        console.log(i, j);
      }
    }
  }
};

// Test case from: https://www.statisticshowto.com/probability-and-statistics/statistics-definitions/kruskal-wallis/

calculateH(
  [23, 41, 54, 66, 90], // women
  [45, 55, 60, 70, 72], // men
  [20, 30, 34, 40, 44] // minorities
);

// Expected: H = 6.72, Hc = 5.9915

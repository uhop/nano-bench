import kwtest from '../src/kwtest.js';

const ALPHA = 0.05;

const calculateH = (...groups) => {
  const results = kwtest(groups);

  console.log('results:', results);
  console.log(results.rejected ? 'STATISTICALLY SIGNIFICANT' : 'statistically insignificant');

  if (!results.rejected) return;

  // post-hoc tests

  console.log('\nStatistically significant difference between groups:');

  for (let i = 0, k = results.matrix.length; i < k; ++i) {
    for (let j = i + 1; j < k; ++j) {
      if (results.matrix[i][j]) {
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

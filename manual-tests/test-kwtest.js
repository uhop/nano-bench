import kwtest from 'nano-bench/significance/kwtest.js';

const ALPHA = 0.05;

const numericSortingAsc = (a, b) => a - b;

const testGroups = (...groups) => {
  groups.forEach(group => group.sort(numericSortingAsc));

  const results = kwtest(groups, ALPHA);

  console.log('results:', results);
  console.log(results.different ? 'STATISTICALLY SIGNIFICANT' : 'statistically insignificant');

  if (!results.different) return;

  // post-hoc tests

  console.log('\nStatistically significant difference between groups:');

  for (let i = 0, k = results.groupDifference.length; i < k; ++i) {
    for (let j = i + 1; j < k; ++j) {
      if (results.groupDifference[i][j]) {
        console.log(i, j);
      }
    }
  }
};

// Test case from: https://www.statisticshowto.com/probability-and-statistics/statistics-definitions/kruskal-wallis/

testGroups(
  [23, 41, 54, 66, 90], // women
  [45, 55, 60, 70, 72], // men
  [20, 30, 34, 40, 44] // minorities
);

// Expected: H = 6.72, Hc = 5.9915

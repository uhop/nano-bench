import mwtest from '../src/mwtest.js';

const ALPHA = 0.05; // confidence is 95%

const numericSortingAsc = (a, b) => a - b;

const testGroups = (group1, group2) => {
  group1.sort(numericSortingAsc);
  group2.sort(numericSortingAsc);

  const results = mwtest(group1, group2, ALPHA);

  console.log('results:', results);
  // console.log(results.rejected ? 'STATISTICALLY SIGNIFICANT' : 'statistically insignificant');
};

// Test case form: https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test
testGroups(
  [6, 1, 1, 1, 1, 1], // tortoises
  [5, 5, 5, 5, 5, 0] // hares
);

// Test case form: https://sphweb.bumc.bu.edu/otlt/mph-modules/bs/bs704_nonparametric/bs704_nonparametric4.html
testGroups(
  [8, 7, 6, 2, 5, 8, 7, 3], // usual care
  [9, 9, 7, 8, 10, 9, 6] // new program
);

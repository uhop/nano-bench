import kstest from 'nano-benchmark/significance/kstest.js';

const ALPHA = 0.05; // confidence is 95%

const numericSortingAsc = (a, b) => a - b;

const testGroups = (group1, group2) => {
  group1.sort(numericSortingAsc);
  group2.sort(numericSortingAsc);

  const results = kstest(group1, group2, ALPHA);

  console.log('results:', results);
  console.log(results.different ? 'STATISTICALLY SIGNIFICANT' : 'statistically insignificant');
};

// Test case form: https://www.statext.com/practice/KolmogorovSmirnovT04.php
testGroups(
  [
    497, 839, 798, 892, 1585, 755, 388, 617, 248, 1641, 1180, 619, 253, 661, 1981, 1746, 1865, 238,
    1199, 1524
  ], // men
  [
    820, 184, 921, 488, 721, 614, 801, 396, 864, 845, 404, 781, 457, 1029, 1047, 552, 718, 495, 382,
    1090
  ] // women
);

// Test case from: https://www.ncl.ucar.edu/Document/Functions/Built-in/kolsm2_n.shtml
testGroups(
  [15.7, 16.1, 15.9, 16.2, 15.9, 16.0, 15.8, 16.1, 16.3, 16.5, 15.5],
  [15.4, 16.0, 15.6, 15.7, 16.6, 16.3, 16.4, 16.8, 15.2, 16.9, 15.1]
);

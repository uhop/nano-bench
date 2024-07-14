import mwtest from 'nano-benchmark/significance/mwtest.js';
import kstest from 'nano-benchmark/significance/kstest.js';
import kwtest from 'nano-benchmark/significance/kwtest.js';

const ALPHA = 0.05; // confidence is 95%

const numericSortingAsc = (a, b) => a - b;

const testGroups = (group1, group2) => {
  group1.sort(numericSortingAsc);
  group2.sort(numericSortingAsc);

  const results = mwtest(group1, group2, ALPHA);

  console.log('===');
  console.log('mwtest:', mwtest(group1, group2, ALPHA).different);
  console.log('kstest:', kstest(group1, group2, ALPHA).different);
  console.log('kwtest:', kwtest([group1, group2], ALPHA).different);
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

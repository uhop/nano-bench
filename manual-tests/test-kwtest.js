import {getParameters, rankData} from '../src/kwtest.js';
import findCriticalValue from '../src/beta-critical.js';

const ALPHA = 0.05;

const calculateH = (...groups) => {
  const parameters = getParameters(groups),
    H = rankData(groups),
    Hc = findCriticalValue(1 - ALPHA, parameters.a, parameters.b) * parameters.nu;

  console.log(parameters);
  console.log(H, Hc, H > Hc);
};

// Test case from: https://www.statisticshowto.com/probability-and-statistics/statistics-definitions/kruskal-wallis/

calculateH(
  [23, 41, 54, 66, 90], // women
  [45, 55, 60, 70, 72], // men
  [20, 30, 34, 40, 44] // minorities
);

// Expected: H = 6.72, Hc = 5.9915

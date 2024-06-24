// Two sample Kolmogorov-Smirnov significance test
// based on https://en.wikipedia.org/wiki/Kolmogorov%E2%80%93Smirnov_test

// sup(F1(x) - F2(x))
const sup = (sorted1, sorted2) => {
  let size1 = sorted1.length,
    size2 = sorted2.length,
    i = 0,
    j = 0,
    result = 0;
  while (i < size1 && j < size2) {
    const a = sorted1[i],
      b = sorted2[j];
    if (a < b) {
      for (++i; i < size1 && a === sorted1[i]; ++i);
    } else if (b < a) {
      for (++j; j < size2 && b === sorted2[j]; ++j);
    } else {
      for (++i; i < size1 && a === sorted1[i]; ++i);
      for (++j; j < size2 && b === sorted2[j]; ++j);
    }
    result = Math.max(result, Math.abs(i / size1 - j / size2));
  }
  while (i < size1) {
    const a = sorted1[i];
    for (++i; i < size1 && a === sorted1[i]; ++i);
    result = Math.max(result, Math.abs(i / size1 - 1));
  }
  while (j < size2) {
    const b = sorted2[j];
    for (++j; j < size2 && b === sorted2[j]; ++j);
    result = Math.max(result, Math.abs(1 - j / size2));
  }
  return result;
};

export const kstest = (sorted1, sorted2, alpha = 0.05) => {
  const d = sup(sorted1, sorted2),
    limit = Math.sqrt((-Math.log(alpha / 2) / 2) * (1 / sorted1.length + 1 / sorted2.length));
  return {value: d, alpha, limit, different: d > limit};
};

export default kstest;

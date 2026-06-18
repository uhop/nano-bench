export const mean = data => {
  let m = 0;
  const size = data.length;
  for (let i = 0; i < size; ++i) {
    m += data[i] / size;
  }
  return m;
};

export const variance = (data, meanValue = mean(data)) => {
  let s = 0;
  const size = data.length;
  for (let i = 0; i < size; ++i) {
    const diff = data[i] - meanValue;
    s += (diff * diff) / size;
  }
  return s;
};

export const stdDev = (data, meanValue = mean(data)) => Math.sqrt(variance(data, meanValue));

export const zScore = (x, mean, stdDev) => (x - mean) / stdDev;

export const makeZScoreFn = data => {
  const m = mean(data),
    s = stdDev(data, m);
  return x => (x - m) / s;
};

export const skewness = (data, meanValue = mean(data), stdDevValue = stdDev(data, meanValue)) => {
  let s = 0;
  const size = data.length;
  for (let i = 0; i < size; ++i) {
    const z = (data[i] - meanValue) / stdDevValue;
    s += (z * z * z) / size;
  }
  return s;
};

export const adjustedSkewness = (
  data,
  meanValue = mean(data),
  stdDevValue = stdDev(data, meanValue)
) => {
  const size = data.length;
  return (Math.sqrt(size * (size - 1)) / (size - 2)) * skewness(data, meanValue, stdDevValue);
};

export const kurtosis = (data, meanValue = mean(data), stdDevValue = stdDev(data, meanValue)) => {
  let s = 0;
  const size = data.length;
  for (let i = 0; i < size; ++i) {
    const z = (data[i] - meanValue) / stdDevValue,
      z2 = z * z;
    s += (z2 * z2) / size;
  }
  return s;
};

export const excessKurtosis = (
  data,
  meanValue = mean(data),
  stdDevValue = stdDev(data, meanValue)
) => kurtosis(data, meanValue, stdDevValue) - 3;

export const getPercentile = (sortedArray, value) => {
  // getting percentile (index) by value
  let lowerIndex = 0,
    upperIndex = sortedArray.length - 1;
  while (lowerIndex < upperIndex) {
    let middleIndex = (lowerIndex + upperIndex) >> 1;
    if (sortedArray[middleIndex] < value) {
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex;
    }
  }
  return lowerIndex < sortedArray.length && value < sortedArray[lowerIndex]
    ? lowerIndex
    : lowerIndex + 1;
};

export const getWeightedValue = (sortedArray, weight = 0.5) => {
  // getting weighted data from a sorted array
  let pos = weight * (sortedArray.length - 1),
    upperIndex = Math.ceil(pos),
    lowerIndex = upperIndex - 1;
  if (lowerIndex <= 0) {
    // return first element
    return sortedArray[0];
  }
  if (upperIndex >= sortedArray.length) {
    // return last element
    return sortedArray[sortedArray.length - 1];
  }
  // linear approximation
  return (
    sortedArray[lowerIndex] * (upperIndex - pos) + sortedArray[upperIndex] * (pos - lowerIndex)
  );
};

export const bootstrap = (fn, data, n = 1000, random = Math.random) => {
  const size = data.length,
    samples = new Array(data.length),
    results = new Array(n);

  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < size; ++j) {
      samples[j] = data[Math.floor(random() * size)];
    }
    results[i] = fn(samples);
  }

  return results;
};

const numericAsc = (a, b) => a - b;

export const exactSummary = (data, {alpha = 0.05} = {}) => {
  const sorted = data.slice().sort(numericAsc);
  return {
    median: getWeightedValue(sorted, 0.5),
    lo: getWeightedValue(sorted, alpha / 2),
    hi: getWeightedValue(sorted, 1 - alpha / 2)
  };
};

export const bootstrapSummary = (
  data,
  {alpha = 0.05, bootstrap: n = 1000, random = Math.random} = {}
) => {
  const percentile = weight => sample => getWeightedValue(sample.sort(numericAsc), weight);
  return {
    median: mean(bootstrap(percentile(0.5), data, n, random)),
    lo: mean(bootstrap(percentile(alpha / 2), data, n, random)),
    hi: mean(bootstrap(percentile(1 - alpha / 2), data, n, random))
  };
};

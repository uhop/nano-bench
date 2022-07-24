export const mean = data => {
  let m = 0;
  const size = data.length;
  for (let i = 0; i < size; ++i) {
    m += data[i] / size;
  }
  return m;
}

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

export const bootstrap = (fn, data, n = 1000) => {
  const size = data.length,
    samples = new Array(data.length),
    results = new Array(n);

  for (let i = 0; i < n; ++i) {
    // resample
    for (let j = 0; j < size; ++j) {
      samples[j] = data[Math.floor(Math.random() * size)];
    }
    results[i] = fn(samples);
  }

  return results;
};

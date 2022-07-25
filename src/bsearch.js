const bsearch = (sortedArray, lessFn, from = 0, to = sortedArray.length) => {
  let i = from,
    j = to;
  while (j - i > 0) {
    const m = (i + j) >> 1;
    if (lessFn(sortedArray[m])) i = m + 1;
    else j = m;
  }
  return j;
};
export default bsearch;

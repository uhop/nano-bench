const bsearch = (sortedArray, lessFn, l = 0, r = sortedArray.length) => {
  while (l < r) {
    const m = (l + r) >> 1;
    if (lessFn(sortedArray[m])) l = m + 1;
    else r = m;
  }
  return r;
};
export default bsearch;

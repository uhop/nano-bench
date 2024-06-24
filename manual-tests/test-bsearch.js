import bsearch from "nano-bench/utils/bsearch.js";

const testArray = [1, 2, 3, 3, 3, 4, 4];

const test = (value, sortedArray = testArray) => {
  const index = bsearch(sortedArray, x => x < value);
  console.log(value, index, '[' + sortedArray.join(', ') + ']');
}

test(0);
test(0.5);
test(1);
test(1.5);
test(2);
test(2.5);
test(3);
test(3.5);
test(4);
test(4.5);

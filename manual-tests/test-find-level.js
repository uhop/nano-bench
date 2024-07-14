import {findLevel} from 'nano-benchmark/bench/runner.js';

console.log(
  await findLevel(n => {
    for (let i = 0; i < n; ++i);
  })
);

console.log(
  await findLevel(n => {
    let x = 0;
    const a = 1,
      b = 2;
    for (let i = 0; i < n; ++i) x = a + b;
  })
);

console.log(
  await findLevel(n => {
    const fn = () => {};
    for (let i = 0; i < n; ++i) fn();
  })
);

console.log(
  await findLevel(n => {
    let x = 0;
    const a = 1,
      b = 2;
    const fn = () => {
      x = a + b;
    };
    for (let i = 0; i < n; ++i) fn();
  })
);

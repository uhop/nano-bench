import {rk23} from '../src/rk.js';

const test = (z, a, b) => {
  const fn = z => {
    if (z == 0 || z == 1) return 0;
    const result = Math.pow(z, a - 1) * Math.pow(1 - z, b - 1);
    return isFinite(result) ? result : 0;
  };
  return rk23(fn, {b: z}).finalValue / rk23(fn).finalValue;
};

console.log(test(0.45407, 0.8770370370370371, 4.604444444444445));

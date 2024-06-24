import zeta from './zeta.js';

const LIMIT = 1000;
const EPSILON = 1e-30;

export const logGamma = z => {
  let result = 0;
  for (let i = 2; i < LIMIT; ++i) {
    const previous = result;
    result += ((i - 1) / i / (i + 1)) * zeta(i, z + 1);
    if (Math.abs(result - previous) < EPSILON * result) break;
  }
  return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + 0.5 * result;
};

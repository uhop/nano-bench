const LIMIT = 1000;
const EPSILON = 1e-30;

const TWO_BY_SQRT_PI = 2 / Math.sqrt(Math.PI);

export const erf = z => {
  let x = z,
    result = x;
  for (let i = 1; i < LIMIT; ++i) {
    const previous = result;
    x *= (-z * z) / i;
    result += x / (2 * i + 1);
    if (
      (Math.abs(result) < EPSILON ? Math.abs(result - previous) : Math.abs(1 - previous / result)) <
      EPSILON
    ) {
      break;
    }
  }
  return TWO_BY_SQRT_PI * result;
};

export default erf;

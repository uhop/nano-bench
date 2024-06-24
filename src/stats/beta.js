const LIMIT = 1000;
const EPSILON = 1e-30;

export const incompleteBeta = (z, a, b) => {
  let x = 1,
    result = 1 / a;
  for (let i = 1; i < LIMIT; ++i) {
    x *= ((i - b) / i) * z;
    const previous = result;
    result += x / (a + i);
    if (Math.abs(result - previous) < EPSILON * result) break;
  }
  return Math.pow(z, a) * result;
};

export const beta = (a, b) => {
  let result = 1;
  for (let i = 1; i < LIMIT; ++i) {
    const previous = result;
    result *= (1 + (a + b) / i) / (1 + a / i) / (1 + b / i);
    if (Math.abs(result - previous) < EPSILON * result) break;
  }
  return ((a + b) * result) / a / b;
};

export default beta;

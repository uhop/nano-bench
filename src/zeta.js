const LIMIT = 1000;
const EPSILON = 1e-30;

export const zeta = (s, a) => {
  let result = 0;
  for (let i = 0; i < LIMIT; ++i) {
    const previous = result;
    result += 1 / Math.pow(i + a, s);
    if (Math.abs(result - previous) < EPSILON * result) break;
  }
  return result;
};

export default zeta;

import {normalMakeCdf, normalMakePdf} from './normal.js';
import ppf from './ppf.js';

// percent point function
const normalPpf = (z, mu = 0, sigma = 1) => {
  // find the lower bound
  const cdf = normalMakeCdf(mu, sigma);
  let x = mu - 6 * sigma,
    p = cdf(x);
  while (p > z) {
    x = mu - (mu - x) * 2;
    p = cdf(x);
  }

  const fn = normalMakePdf(mu, sigma);
  return ppf(fn, z, {a: x, b: 2 * mu - x, initialValue: p});
};

export default normalPpf;

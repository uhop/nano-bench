import {zCdf, zPdf} from './z.js';
import ppf from './ppf.js';

// percent point function
const zPpf = (z) => {
  // find the lower bound
  let x = -6,
    p = zCdf(x);
  while (p > z) {
    x = 2 * x;
    p = zCdf(x);
  }

  return ppf(zPdf, z, {a: x, b: -x, initialValue: p});
};

export default zPpf;

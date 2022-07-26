import ppf from './ppf.js';

// percent point function
const chiSquaredPpf = (z, k) => {
  const C = k / 2 - 1,
    fn = z => Math.exp(-z / 2) * Math.pow(z, C);
  return ppf(fn, z);
};

export default chiSquaredPpf;

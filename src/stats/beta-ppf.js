import ppf from './ppf.js';

// percent point function
const betaPpf = (z, a, b) => {
  const fn = z => {
    if (z == 0 || z == 1) return 0;
    const result = Math.pow(z, a - 1) * Math.pow(1 - z, b - 1);
    return isFinite(result) ? result : 0;
  };
  return ppf(fn, z);
};

export default betaPpf;

import erf from './erf.js';

const LIMIT = 1000;
const EPSILON = 1e-30;

const SQRT_2 = Math.sqrt(2),
  SQRT_2_PI = Math.sqrt(2 * Math.PI);

export const normalCdf = (z, mu = 0, sigma = 1) => 0.5 * (1 + erf((z - mu) / sigma / SQRT_2));
export const normalMakeCdf =
  (mu = 0, sigma = 1) =>
  z =>
    0.5 * (1 + erf((z - mu) / sigma / SQRT_2));

export const normalPdf = (z, mu = 0, sigma = 1) => {
  const x = (z - mu) / sigma;
  return Math.exp(-0.5 * x * x) / sigma / SQRT_2_PI;
};

export const normalMakePdf =
  (mu = 0, sigma = 1) =>
  z => {
    const x = (z - mu) / sigma;
    return Math.exp(-0.5 * x * x) / sigma / SQRT_2_PI;
  };

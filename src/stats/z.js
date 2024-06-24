import erf from './erf.js';

const SQRT_2 = Math.sqrt(2),
  SQRT_2_PI = Math.sqrt(2 * Math.PI);

export const zCdf = (z) => 0.5 * (1 + erf((z) / SQRT_2));
export const zPdf = (z) => Math.exp(-0.5 * z * z) / SQRT_2_PI;

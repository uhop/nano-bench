const ONE_THIRD = 1 / 3;

export const rk23 = (fn, {a = 0, b = 1, tolerance = 1e-6, initialValue = 0} = {}) => {
  const ts = [a],
    us = [initialValue];
  let t = ts[0],
    u = us[0],
    h = Math.min(0.5 * Math.pow(tolerance, ONE_THIRD), b - t),
    s1 = fn(a, initialValue);

  while (t < b) {
    if (t + h == t) {
      // underflow
      console.warn('Warning: step is too small near:', t);
      break;
    }

    let s2 = fn(t + h / 2, u + (h / 2) * s1),
      s3 = fn(t + 0.75 * h, u + 0.75 * h * s2),
      uNew = u + (h * (2 * s1 + 3 * s2 + 4 * s3)) / 9, // 2nd order solution
      s4 = fn(t + h, uNew),
      error = Math.abs(h * ((-5 / 72) * s1 + s2 / 12 + s3 / 9 - s4 / 8)), // 2nd/3rd diff error estimate
      maxError = tolerance * (1 + Math.abs(u)); // relative/absolute blend

    if (error < maxError) {
      ts.push((t += h));
      us.push(u = uNew);
      s1 = s4;
    }

    const q = Math.min(4, 0.8 * Math.pow(maxError / error, ONE_THIRD));
    h = Math.min(q * h, b - t);
  }

  return {ts, us, finalValue: us[us.length - 1]};
};

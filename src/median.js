export const median = data => {
  let step = 1,
    n = Math.floor(data.length / 3);
  for (;;) {
    for (let i = 0; i < n; ++i) {
      const ai = 3 * step * i,
        bi = ai + step,
        ci = bi + step;
      let a = data[ai],
        b = data[bi],
        c = data[ci];
      if (b < a) [a, b] = [b, a];
      if (c < b) [b, c] = [c, b];
      if (b < a) [a, b] = [b, a];
      data[ai] = b;
      data[bi] = a;
      data[ci] = c;
    }

    const last = Math.ceil((data.length - 3 * step * n) / step);
    if (last == 2) {
      const ai = 3 * step * n,
        bi = ai + step;
      let a = data[ai],
        b = data[bi];
      if (b < a) [a, b] = [b, a];
      data[ai] = b;
      data[bi] = a;
    }

    step *= 3;
    if (step >= data.length) break;
    n = Math.floor(data.length / (3 * step));
  }

  return data[0];
};

export default median;

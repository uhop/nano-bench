// Mann-Whitney U test
// based on https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test

import rank from './rank.js';
import zPpf from './z-ppf.js';

export const mwtest = (sorted1, sorted2, alpha = 0.05) => {
  const {groupRank, ranked: t} = rank([sorted1, sorted2]),
    u1 = groupRank[0] - (sorted1.length * (sorted1.length + 1)) / 2,
    u2 = groupRank[1] - (sorted2.length * (sorted2.length + 1)) / 2,
    u = Math.min(u1, u2);

  const m = (sorted1.length * sorted2.length) / 2;

  let tiesC = 0;
  for (let i = 0, size = t.length; i < size; ) {
    const rank = t[i].rank;
    let j = i + 1;
    while (j < size && rank === t[j].rank) ++j;
    const nt = j - i;
    i = j;
    if (nt > 1) {
      tiesC += nt * nt * nt - nt;
    }
  }
  const n = sorted1.length + sorted2.length,
    s = Math.sqrt(((sorted1.length * sorted2.length) / 12) * (n + 1 - tiesC / n / (n - 1)));

  const z = (u - m) / s,
    zc = zPpf(alpha / 2);

  return {value: z, alpha, limit: zc, different: z < zc || z > -zc};
};

export default mwtest;

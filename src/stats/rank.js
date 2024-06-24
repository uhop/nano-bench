export const getTotal = groups => groups.reduce((acc, group) => acc + group.length, 0);

export const rank = groups => {
  const N = getTotal(groups),
    k = groups.length,
    t = new Array(N);

  // put in one array preserving grouping
  let o = 0;
  for (let i = 0; i < k; ++i) {
    const group = groups[i];
    for (let j = 0; j < group.length; ++j) {
      t[o++] = {value: group[j], group: i};
    }
  }

  const groupRank = new Array(k);
  groupRank.fill(0);

  // sort and rank
  t.sort((a, b) => a.value - b.value);
  for (let i = 0; i < t.length; ) {
    let ahead = i + 1;
    const value = t[i].value;
    while (ahead < t.length && value === t[ahead].value) ++ahead;
    if (ahead - i === 1) {
      groupRank[t[i].group] += t[i].rank = i + 1;
    } else {
      const rank = (i + 1 + ahead) / 2;
      for (let j = i; j < ahead; ++j) {
        groupRank[t[j].group] += t[j].rank = rank;
      }
    }
    i = ahead;
  }
  const avgRank = (N + 1) / 2, avgGroupRank = groupRank.map((rank, i) => rank / groups[i].length);

  return {ranked: t, N, k, avgRank, groupRank, avgGroupRank, groups};
};

export default rank;

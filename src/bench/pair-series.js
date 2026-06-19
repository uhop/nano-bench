export const planComparison = (series, {pooled = false} = {}) => {
  if (pooled) return {blocks: [{name: null, members: series}], unpaired: [], degraded: false};

  const byName = new Map();
  for (const s of series) {
    const group = byName.get(s.name);
    if (group) group.push(s);
    else byName.set(s.name, [s]);
  }

  const blocks = [],
    unpaired = [];
  for (const [name, members] of byName) {
    if (members.length > 1) blocks.push({name, members});
    else unpaired.push(name);
  }

  // no shared name → one omnibus, so a single-file render still shows its table
  if (!blocks.length)
    return {blocks: [{name: null, members: series}], unpaired: [], degraded: true};

  return {blocks, unpaired, degraded: false};
};

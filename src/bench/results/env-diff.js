// not diffed: host (provenance only) and cpu.speedMHz (instantaneous clock, noisy run-to-run)
const ENV_PATHS = [
  'runtime.name',
  'runtime.version',
  'runtime.engine',
  'os.platform',
  'os.release',
  'os.arch',
  'cpu.model',
  'cpu.count',
  'totalmemMB'
];

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export const diffEnvironments = environments => {
  if (environments.length < 2) return [];
  const diffs = [];
  for (const p of ENV_PATHS) {
    const values = environments.map(env => getPath(env, p) ?? null);
    if (new Set(values.map(v => JSON.stringify(v))).size > 1) diffs.push({path: p, values});
  }
  return diffs;
};

export default diffEnvironments;

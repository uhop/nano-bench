import {performance} from 'node:perf_hooks';

export const smokeRun = async (fns, names, n = 1) => {
  const results = [];
  for (const name of names) {
    const start = performance.now();
    try {
      await fns[name](n);
      results.push({name, ok: true, time: performance.now() - start});
    } catch (error) {
      results.push({name, ok: false, time: performance.now() - start, error});
    }
  }
  return results;
};

export default smokeRun;

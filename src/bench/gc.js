/**
 * A function that forces a full garbage collection, or null when the runtime offers none.
 * Probes an exposed `gc`, then `Bun.gc`, then turns on V8's `--expose-gc` at run time (Node, Deno).
 * @returns {Promise<(() => unknown) | null>}
 */
export const findGc = async () => {
  const g = /** @type {any} */ (globalThis);
  if (typeof g.gc == 'function') return () => g.gc();
  if (typeof g.Bun?.gc == 'function') return () => g.Bun.gc(true);
  try {
    const {setFlagsFromString} = await import('node:v8'),
      {runInNewContext} = await import('node:vm');
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc');
    if (typeof gc == 'function') return gc;
  } catch {
    // no node:v8 or node:vm: no collector
  }
  return null;
};

export const gcModes = ['none', 'once', 'each'];

export default findGc;

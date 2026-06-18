import os from 'node:os';
import process from 'node:process';

const detectRuntime = () => {
  const g = /** @type {any} */ (globalThis),
    versions = /** @type {any} */ (process.versions ?? {});
  if (g.Deno) {
    const v = g.Deno.version ?? {};
    return {name: 'deno', version: v.deno ?? null, engine: v.v8 ? `v8 ${v.v8}` : null};
  }
  if (g.Bun) {
    return {
      name: 'bun',
      version: versions.bun ?? null,
      engine: versions.webkit ? `jsc ${versions.webkit}` : null
    };
  }
  return {
    name: 'node',
    version: versions.node ?? null,
    engine: versions.v8 ? `v8 ${versions.v8}` : null
  };
};

/**
 * @param {{host?: boolean, hostName?: string}} [opts]
 */
export const captureEnvironment = (opts = {}) => {
  const {host, hostName} = opts;
  const cpus = os.cpus();
  const env = {
    runtime: detectRuntime(),
    os: {platform: os.platform(), release: os.release(), arch: os.arch()},
    cpu: {model: cpus[0]?.model ?? null, count: cpus.length, speedMHz: cpus[0]?.speed ?? null},
    totalmemMB: Math.round(os.totalmem() / 1e6)
  };
  const name = hostName ?? (host ? os.hostname() : null);
  return name ? {host: name, ...env} : env;
};

export default captureEnvironment;

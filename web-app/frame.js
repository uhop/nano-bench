import {benchmark, findLevel} from '../src/bench/runner.js';
import {sha256Hex} from '../src/utils/sha256.js';

// one benchmark function per iframe; without `fn` it only lists the module's functions
const params = new URLSearchParams(location.search),
  reply = message => parent.postMessage(message, location.origin);

// crypto.subtle exists only in secure contexts: HTTPS or localhost
const hash = async text => {
  const bytes = new TextEncoder().encode(text);
  if (!crypto.subtle) return 'sha256:' + sha256Hex(bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

let fn;
try {
  const module = await import(params.get('file')),
    exported = module[params.get('export') || 'default'];
  if (!exported || typeof exported != 'object')
    throw new TypeError(`export not found: ${params.get('export') || 'default'}`);
  if (!params.has('fn')) {
    reply({
      type: 'names',
      names: Object.keys(exported).filter(k => typeof exported[k] == 'function')
    });
  } else {
    fn = exported[params.get('fn')];
    if (typeof fn != 'function') throw new TypeError(`not a function: ${params.get('fn')}`);
    reply({type: 'ready', name: params.get('fn'), bodyHash: await hash(fn.toString())});
  }
} catch (error) {
  reply({type: 'error', name: params.get('fn'), message: String(error?.message || error)});
}

addEventListener('message', async event => {
  if (event.origin !== location.origin || !fn) return;
  const {id, op, n, threshold, minIterations} = event.data || {};
  try {
    const value =
      op === 'calibrate'
        ? await findLevel(fn, {threshold, startFrom: minIterations})
        : op === 'sample'
          ? await benchmark(fn, n)
          : undefined;
    reply({type: 'result', id, value});
  } catch (error) {
    reply({type: 'result', id, error: String(error?.message || error)});
  }
});

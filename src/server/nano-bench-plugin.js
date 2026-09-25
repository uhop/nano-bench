import {mkdir, open, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {isInside, mimeOf, toPosix} from './files.js';

export const PREFIX = '/--nano-bench/';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

// the dependency's own location: it may be hoisted or nested, so ask the resolver
const consoleToolkitSrc = path.dirname(
  path.dirname(
    fileURLToPath(import.meta.resolve('console-toolkit/alphanumeric/number-formatters.js'))
  )
);

const mounts = new Map([
  ['web-app', path.join(packageRoot, 'web-app')],
  ['src', path.join(packageRoot, 'src')],
  ['console-toolkit', consoleToolkitSrc]
]);

const serveFile = async (fileName, url) => {
  let info = await stat(fileName).catch(() => null);
  if (info?.isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
      return new Response(null, {status: 307, headers: {location: url.href}});
    }
    fileName = path.join(fileName, 'index.html');
    info = await stat(fileName).catch(() => null);
  }
  if (!info?.isFile()) return new Response('not found\n', {status: 404});
  return new Response(await readFile(fileName), {headers: {'content-type': mimeOf(fileName)}});
};

const skipFolder = name => name.startsWith('.') || name === 'node_modules';

const walk = async function* (folder, accept) {
  const entries = await readdir(folder, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    const fileName = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!skipFolder(entry.name)) yield* walk(fileName, accept);
    } else if (entry.isFile() && accept(entry.name)) {
      yield fileName;
    }
  }
};

// the write-bench naming convention: bench/bench-<name>.js, or <name>.bench.js
const isBenchFile = name => /^bench[-_.].*\.m?js$|\.bench\.m?js$/i.test(name);

export const listBenches = async rootFolder => {
  const found = [];
  for await (const fileName of walk(rootFolder, isBenchFile)) {
    const info = await stat(fileName);
    found.push({
      path: toPosix(path.relative(rootFolder, fileName)),
      size: info.size,
      mtime: info.mtime.toISOString()
    });
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
};

export const RESULTS_FOLDER = 'nano-bench-results';
const MAX_RESULTS_BYTES = 50 * 2 ** 20;

export const saveResults = async (rootFolder, name, text) => {
  if (text.length > MAX_RESULTS_BYTES) throw new RangeError('results file is too large');
  const data = JSON.parse(text);
  if (data?.schemaVersion !== 1 || data?.tool !== 'nano-benchmark' || !Array.isArray(data.results))
    throw new TypeError('not a nano-bench results file');
  const base = (name || 'results')
      .replace(/\.json$/i, '')
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 120),
    folder = path.join(rootFolder, RESULTS_FOLDER);
  await mkdir(folder, {recursive: true});
  for (let i = 0; ; ++i) {
    const fileName = path.join(folder, base + (i ? '-' + (i + 1) : '') + '.json');
    try {
      await writeFile(fileName, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
      return toPosix(path.relative(rootFolder, fileName));
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
};

const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

// the benchmark iframe, with the project's import map inlined so bench files can use bare imports
const framePage = importmap =>
  `<!doctype html>
<meta charset="utf-8" />
<title>nano-bench frame</title>
<script type="importmap">${JSON.stringify(importmap || {imports: {}}).replace(/</g, '\\u003c')}</script>
<script type="module" src="${PREFIX}web-app/frame.js"></script>
`;

// cross-origin isolation: precise timers (5 µs in Chromium, 20 µs elsewhere) for the runner
const isolate = response => {
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-embedder-policy', 'require-corp');
  return response;
};

const HEAD_BYTES = 512;

const looksLikeResults = async fileName => {
  const handle = await open(fileName, 'r').catch(() => null);
  if (!handle) return false;
  try {
    const buffer = Buffer.alloc(HEAD_BYTES),
      {bytesRead} = await handle.read(buffer, 0, HEAD_BYTES, 0),
      head = buffer.toString('utf8', 0, bytesRead);
    return /"schemaVersion"\s*:\s*1\b/.test(head) && /"tool"\s*:\s*"nano-benchmark"/.test(head);
  } finally {
    await handle.close();
  }
};

const describe = async (rootFolder, fileName) => {
  let data;
  try {
    data = JSON.parse(await readFile(fileName, 'utf8'));
  } catch {
    return null;
  }
  if (data?.schemaVersion !== 1 || !Array.isArray(data.results)) return null;
  const info = await stat(fileName),
    runtime = data.environment?.runtime;
  return {
    path: toPosix(path.relative(rootFolder, fileName)),
    size: info.size,
    mtime: info.mtime.toISOString(),
    label: data.label ?? null,
    createdAt: data.createdAt ?? null,
    source: data.source?.file ?? null,
    series: data.results.map(s => s.name),
    runtime: runtime ? [runtime.name, runtime.version].filter(Boolean).join(' ') : null,
    host: data.environment?.host ?? null
  };
};

export const listResults = async rootFolder => {
  const found = [];
  for await (const fileName of walk(rootFolder, name => name.endsWith('.json'))) {
    if (!(await looksLikeResults(fileName))) continue;
    const entry = await describe(rootFolder, fileName);
    if (entry) found.push(entry);
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
};

export const nanoBenchPlugin = api => ({
  name: 'nano-bench',
  prefix: PREFIX,
  async fetch(request) {
    const url = new URL(request.url),
      pathname = decodeURIComponent(url.pathname).substring(PREFIX.length);
    if (pathname === 'save') {
      if (request.method !== 'POST')
        return new Response(null, {status: 405, headers: {allow: 'POST'}});
      try {
        const saved = await saveResults(
          api.rootFolder,
          url.searchParams.get('name'),
          await request.text()
        );
        return Response.json({path: saved});
      } catch (error) {
        return new Response(String(error?.message || error) + '\n', {status: 400});
      }
    }
    if (pathname === 'results') return Response.json(await listResults(api.rootFolder));
    if (pathname === 'benches') return Response.json(await listBenches(api.rootFolder));
    if (pathname === 'meta') return Response.json({name: pkg.name, version: pkg.version});
    if (pathname === 'frame')
      return isolate(
        new Response(framePage(api.config?.importmap), {
          headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}
        })
      );
    const slash = pathname.indexOf('/'),
      base = mounts.get(slash < 0 ? pathname : pathname.substring(0, slash));
    if (!base) return undefined;
    const fileName = path.join(base, slash < 0 ? '' : pathname.substring(slash + 1));
    if (!isInside(base, fileName)) return new Response('forbidden\n', {status: 403});
    return isolate(await serveFile(fileName, url));
  }
});

export default nanoBenchPlugin;

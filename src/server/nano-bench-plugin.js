import {open, readFile, readdir, stat} from 'node:fs/promises';
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

const walk = async function* (folder) {
  const entries = await readdir(folder, {withFileTypes: true}).catch(() => []);
  for (const entry of entries) {
    const fileName = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!skipFolder(entry.name)) yield* walk(fileName);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      yield fileName;
    }
  }
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
  for await (const fileName of walk(rootFolder)) {
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
    if (pathname === 'results') return Response.json(await listResults(api.rootFolder));
    const slash = pathname.indexOf('/'),
      base = mounts.get(slash < 0 ? pathname : pathname.substring(0, slash));
    if (!base) return undefined;
    const fileName = path.join(base, slash < 0 ? '' : pathname.substring(slash + 1));
    if (!isInside(base, fileName)) return new Response('forbidden\n', {status: 403});
    return serveFile(fileName, url);
  }
});

export default nanoBenchPlugin;

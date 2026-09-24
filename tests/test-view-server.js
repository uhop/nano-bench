import test from 'tape-six';

import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createTestServer} from 'tape-six/test-server.js';

import {nanoBenchPlugin, listResults} from 'nano-benchmark/server/nano-bench-plugin.js';
import {autoindexPlugin, formatSize} from 'nano-benchmark/server/autoindex.js';

const results = name =>
  JSON.stringify({
    schemaVersion: 1,
    tool: 'nano-benchmark',
    createdAt: '2026-09-24T00:00:00.000Z',
    environment: {runtime: {name: 'node', version: '26.0.0'}},
    params: {alpha: 0.05, samples: 3, bootstrap: 10, seed: 1},
    results: [{name, reps: 1, samples: [1, 2, 3]}]
  });

const makeRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nano-bench-view-'));
  await mkdir(path.join(root, 'runs'));
  await mkdir(path.join(root, 'node_modules', 'pkg'), {recursive: true});
  await mkdir(path.join(root, '.hidden'));
  await mkdir(path.join(root, 'site'));
  await writeFile(path.join(root, 'a.json'), results('a'));
  await writeFile(path.join(root, 'runs', 'b.json'), results('b'));
  await writeFile(path.join(root, 'node_modules', 'pkg', 'c.json'), results('c'));
  await writeFile(path.join(root, '.hidden', 'd.json'), results('d'));
  await writeFile(path.join(root, 'other.json'), '{"schemaVersion": 1, "tool": "else"}');
  await writeFile(path.join(root, 'broken.json'), '{"schemaVersion": 1, "tool": "nano-benchmark",');
  await writeFile(path.join(root, 'site', 'index.html'), '<p>site</p>');
  await writeFile(path.join(root, '.dotfile'), 'x');
  return root;
};

const withServer = async (fn, options = {}) => {
  const root = await makeRoot();
  const server = await createTestServer({
    rootFolder: root,
    port: 0,
    protocol: 'h1',
    remotePlugins: false,
    webAppPath: '/--nano-bench/web-app/',
    log: () => {},
    plugins: [nanoBenchPlugin, api => autoindexPlugin(api, options)]
  });
  try {
    await fn(server.base, root);
  } finally {
    await server.close();
    await rm(root, {recursive: true, force: true});
  }
};

const get = (base, p) => fetch(base + p, {redirect: 'manual'});

test('formatSize()', t => {
  t.equal(formatSize(0), '0 B');
  t.equal(formatSize(1023), '1023 B');
  t.equal(formatSize(1536), '1.5 KB');
  t.equal(formatSize(20 * 1024 * 1024), '20 MB');
});

test('listResults()', async t => {
  const root = await makeRoot();
  try {
    const list = await listResults(root);
    t.deepEqual(
      list.map(e => e.path),
      ['a.json', 'runs/b.json'],
      'results only; node_modules, dot-folders, other tools, and broken files skipped'
    );
    t.deepEqual(list[0].series, ['a']);
    t.equal(list[0].runtime, 'node 26.0.0');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('viewer server', async t => {
  await withServer(async base => {
    let r = await get(base, '/');
    t.equal(r.status, 307, 'the root redirects');
    t.ok(r.headers.get('location').endsWith('/--nano-bench/web-app/'), 'to the viewer');

    r = await get(base, '/--nano-bench/web-app/');
    t.equal(r.status, 200);
    t.ok((await r.text()).includes('<main>'), 'the viewer page');

    r = await get(base, '/--nano-bench/web-app');
    t.equal(r.status, 307, 'a folder without a slash redirects');

    r = await get(base, '/--nano-bench/src/stats.js');
    t.equal(r.status, 200);
    t.ok(r.headers.get('content-type').startsWith('text/javascript'));

    r = await get(base, '/--nano-bench/console-toolkit/alphanumeric/number-formatters.js');
    t.equal(r.status, 200, 'the formatter dependency is served from its own location');

    r = await get(base, '/--nano-bench/web-app/%2e%2e%2fpackage.json');
    t.equal(r.status, 403, 'an encoded escape from a mount is refused');

    r = await get(base, '/--nano-bench/results');
    t.deepEqual(
      (await r.json()).map(e => e.path),
      ['a.json', 'runs/b.json']
    );

    r = await get(base, '/runs/b.json');
    t.equal(r.status, 200, 'results files are served by path');
  });
});

test('autoindex', async t => {
  await withServer(async base => {
    let r = await get(base, '/?list');
    t.equal(r.status, 200);
    let html = await r.text();
    t.ok(html.includes('href="runs/"'), 'folders are listed');
    t.ok(html.includes('href="a.json"'), 'files are listed');
    t.ok(html.includes('/--nano-bench/web-app/?view=a.json'), 'JSON files link to the viewer');
    t.notOk(html.includes('.dotfile'), 'dot-files are hidden');
    t.notOk(html.includes('href="../"'), 'no parent link at the root');
    t.ok(html.indexOf('href="runs/"') < html.indexOf('href="a.json"'), 'folders come before files');

    r = await get(base, '/runs/');
    html = await r.text();
    t.ok(html.includes('href="../"'), 'a parent link below the root');
    t.ok(html.includes('?view=runs/b.json'), 'view links carry the full path, slashes readable');

    r = await get(base, '/site/');
    t.equal(await r.text(), '<p>site</p>', 'a folder with index.html is served as a site');

    r = await get(base, '/missing/');
    t.equal(r.status, 404);
  });

  await withServer(
    async base => {
      const html = await (await get(base, '/?list')).text();
      t.ok(html.includes('.dotfile'), 'showDotFiles lists them');
    },
    {showDotFiles: true}
  );
});

test('nano-bench-view bin', async t => {
  const root = await makeRoot(),
    bin = fileURLToPath(new URL('../bin/nano-bench-view.js', import.meta.url)),
    child = spawn('node', [bin, '--root', root, '--port', '0', path.join(root, 'a.json')], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  try {
    const url = await new Promise((resolve, reject) => {
      let out = '';
      child.stdout.on('data', chunk => {
        out += chunk;
        const match = /viewer:\s+(\S+)/.exec(out);
        if (match) resolve(match[1]);
      });
      child.on('exit', code => reject(new Error(`exited with ${code}: ${out}`)));
    });
    t.ok(url.includes('?view=a.json'), 'positional files become view parameters');
    const r = await fetch(url);
    t.equal(r.status, 200, 'the printed viewer URL is live');
  } finally {
    child.kill('SIGTERM');
    await rm(root, {recursive: true, force: true});
  }
});

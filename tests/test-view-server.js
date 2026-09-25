import test from 'tape-six';

import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createTestServer} from 'tape-six/test-server.js';

import {
  nanoBenchPlugin,
  listBenches,
  listResults,
  saveResults,
  RESULTS_FOLDER
} from 'nano-benchmark/server/nano-bench-plugin.js';
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
  await mkdir(path.join(root, 'bench'));
  await writeFile(path.join(root, 'bench', 'bench-x.js'), 'export default {};');
  await writeFile(path.join(root, 'bench', 'helper.js'), 'export default {};');
  await writeFile(path.join(root, 'runs', 'y.bench.mjs'), 'export default {};');
  await writeFile(
    path.join(root, 'tape6.json'),
    JSON.stringify({importmap: {imports: {lib: '/lib/index.js', '</script>': '/x.js'}}})
  );
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

test('listBenches()', async t => {
  const root = await makeRoot();
  try {
    t.deepEqual(
      (await listBenches(root)).map(e => e.path),
      ['bench/bench-x.js', 'runs/y.bench.mjs'],
      'both naming conventions; other modules skipped'
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('saveResults()', async t => {
  const root = await makeRoot();
  try {
    const first = await saveResults(root, 'my run.json', results('a'));
    t.equal(first, RESULTS_FOLDER + '/my-run.json', 'the name is sanitized');
    t.deepEqual(JSON.parse(await readFile(path.join(root, first), 'utf8')).results[0].name, 'a');
    t.equal(await saveResults(root, 'my run', results('b')), RESULTS_FOLDER + '/my-run-2.json');
    t.equal(
      await saveResults(root, '../../escape', results('c')),
      RESULTS_FOLDER + '/..-..-escape.json',
      'no path separators survive'
    );
    t.equal(await saveResults(root, null, results('d')), RESULTS_FOLDER + '/results.json');
    await t.rejects(saveResults(root, 'x', '{"schemaVersion": 1, "tool": "else", "results": []}'));
    await t.rejects(saveResults(root, 'x', '{'), 'malformed JSON');
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

test('runner routes', async t => {
  await withServer(async (base, root) => {
    let r = await get(base, '/--nano-bench/benches');
    t.deepEqual(
      (await r.json()).map(e => e.path),
      ['bench/bench-x.js', 'runs/y.bench.mjs']
    );

    r = await get(base, '/--nano-bench/meta');
    const meta = await r.json();
    t.equal(meta.name, 'nano-benchmark');
    t.ok(meta.version, 'a version');

    r = await get(base, '/--nano-bench/frame');
    t.equal(r.status, 200);
    t.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
    t.equal(r.headers.get('cross-origin-embedder-policy'), 'require-corp');
    t.equal(r.headers.get('cache-control'), 'no-store');
    const html = await r.text();
    t.ok(html.includes('"lib":"/lib/index.js"'), 'the project import map is inlined');
    t.notOk(html.includes('"</script>"'), 'a closing tag inside the map is escaped');
    t.ok(html.includes('/--nano-bench/web-app/frame.js'), 'the frame script');

    r = await get(base, '/--nano-bench/web-app/app.js');
    t.equal(r.headers.get('cross-origin-embedder-policy'), 'require-corp', 'mounts are isolated');

    r = await get(base, '/--nano-bench/save?name=run');
    t.equal(r.status, 405, 'save takes POST only');
    t.equal(r.headers.get('allow'), 'POST');

    r = await fetch(base + '/--nano-bench/save?name=run', {method: 'POST', body: results('a')});
    t.equal(r.status, 200);
    const {path: saved} = await r.json();
    t.equal(saved, RESULTS_FOLDER + '/run.json');
    t.ok(await readFile(path.join(root, saved), 'utf8'), 'written under the root');

    r = await fetch(base + '/--nano-bench/save', {method: 'POST', body: '{"tool": "else"}'});
    t.equal(r.status, 400, 'not a results file');
    t.ok((await r.text()).includes('not a nano-bench results file'));
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

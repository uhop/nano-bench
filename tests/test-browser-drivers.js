import test from 'tape-six';

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const bin = name => fileURLToPath(new URL(`../bin/${name}.js`, import.meta.url)),
  isNode = !(/** @type {any} */ (globalThis).Deno || /** @type {any} */ (globalThis).Bun);

// the drivers run on Node; each test needs its browser installed, and skips otherwise
const executable = async (load, find) => {
  if (!isNode) return false;
  try {
    return existsSync(await find(await load()));
  } catch {
    return false;
  }
};

const hasChromium = await executable(
    () => import('playwright'),
    playwright => playwright.chromium.executablePath()
  ),
  hasChrome = await executable(
    () => import('puppeteer').then(module => module.default),
    puppeteer => puppeteer.executablePath()
  );

const run = (name, args, cwd) =>
  new Promise(resolve => {
    const child = spawn(process.execPath, [bin(name), ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    child.on('close', code => resolve({code, out}));
  });

const withRoot = async fn => {
  const root = await mkdtemp(path.join(tmpdir(), 'nano-bench-driver-'));
  await writeFile(
    path.join(root, 'bench-sum.js'),
    'export default {\n  loop: n => { let s = 0; for (let i = 0; i < n; ++i) s += i; return s; },\n  twice: n => { let s = 0; for (let i = 0; i < n; ++i) s += 2 * i; return s; }\n};\n'
  );
  try {
    await fn(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
};

const checkRun = async (t, name, browser, expectedFile) =>
  withRoot(async root => {
    const {code, out} = await run(
      name,
      ['bench-sum.js', '-b', browser, '-m', '5', '-s', '5'],
      root
    );
    t.equal(code, 0, out.trim().split('\n').slice(-3).join(' | '));
    t.ok(out.includes('loop') && out.includes('twice'), 'the summary table is printed');
    const saved = path.join(root, 'nano-bench-results', expectedFile),
      results = JSON.parse(await readFile(saved, 'utf8'));
    t.equal(results.results.length, 2, 'both functions saved');
    t.equal(results.results[0].samples.length, 5);
    t.equal(results.environment.browser.crossOriginIsolated, true, 'served from localhost');
  });

test('nano-bench-playwright: chromium', {skip: !hasChromium}, t =>
  checkRun(t, 'nano-bench-playwright', 'chromium', 'bench-sum-chromium.json')
);

test('nano-bench-puppeteer: chrome', {skip: !hasChrome}, t =>
  checkRun(t, 'nano-bench-puppeteer', 'chrome', 'bench-sum-chromium.json')
);

test('driver arguments', {skip: !isNode}, async t => {
  await withRoot(async root => {
    let {code, out} = await run('nano-bench-playwright', ['bench-sum.js', '-b', 'opera'], root);
    t.equal(code, 1);
    t.ok(out.includes('unknown browser: opera'), 'an unknown browser is refused');
    ({code, out} = await run('nano-bench-playwright', [bin('nano-bench')], root));
    t.equal(code, 1);
    t.ok(out.includes('is outside the root folder'), 'a file outside the root is refused');
  });
});

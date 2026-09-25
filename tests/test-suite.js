import test from 'tape-six';

import {spawn} from 'node:child_process';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const run = (name, args) =>
  new Promise((resolve, reject) => {
    const bin = fileURLToPath(new URL(`../bin/${name}.js`, import.meta.url)),
      child = spawn('node', [bin, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({code, out}));
  });

const factory = `export const params = [10, 100];
export default size => {
  const data = Array.from({length: size}, (_, i) => i);
  return {
    loop: n => { let s = 0; for (let k = 0; k < n; ++k) for (let i = 0; i < data.length; ++i) s += data[i]; return s; },
    twice: n => { let s = 0; for (let k = 0; k < n; ++k) for (let i = 0; i < data.length; ++i) s += 2 * data[i]; return s; }
  };
};
`;

test('parameterized files', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nano-bench-params-')),
    bench = path.join(dir, 'bench-scale.js'),
    json = path.join(dir, 'out.json');
  await writeFile(bench, factory);
  try {
    let r = await run('nano-bench', [bench, '-i', '10', '-s', '5', '--json', json]);
    t.equal(r.code, 0, 'nano-bench runs every value');
    t.ok(r.out.includes('Scaling:'), 'the scaling table is printed');
    t.deepEqual(
      (await readdir(dir)).filter(name => name.startsWith('out-')).sort(),
      ['out-10.json', 'out-100.json'],
      'one results file per value'
    );
    const data = JSON.parse(await readFile(path.join(dir, 'out-100.json'), 'utf8'));
    t.equal(data.params.param, 100, 'the value is recorded');

    r = await run('nano-bench', [bench, '-i', '10', '-s', '5', '--params', '7']);
    t.equal(r.code, 0, '--params overrides the file');
    t.ok(r.out.includes('params = 7'));

    await writeFile(bench, 'export default () => ({a: () => {}});\n');
    r = await run('nano-bench', [bench]);
    t.notEqual(r.code, 0, 'a factory without params is refused');

    const io = path.join(dir, 'io-scale.js');
    await writeFile(
      io,
      `export const params = [1, 2];
export default ms => ({a: () => new Promise(resolve => setTimeout(resolve, ms))});
`
    );
    r = await run('nano-bench-io', [io, '-r', '3']);
    t.equal(r.code, 0, 'nano-bench-io runs every value');
    t.ok(r.out.includes('Scaling:'));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('nano-bench-suite', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nano-bench-suite-test-'));
  await writeFile(path.join(dir, 'bench-scale.js'), factory);
  await writeFile(
    path.join(dir, 'bench-pair.js'),
    'export default {a: n => { let s = 0; for (let i = 0; i < n; ++i) s += i; return s; }, b: n => { let s = 0; for (let i = 0; i < n; ++i) s += i * 2; return s; }};\n'
  );
  await writeFile(
    path.join(dir, 'bench-broken.js'),
    "export default {a: () => { throw new Error('boom'); }};\n"
  );
  try {
    let r = await run('nano-bench-suite', [
      path.join(dir, 'bench-pair.js'),
      path.join(dir, 'bench-scale.js'),
      '--passes',
      '2',
      '--',
      '-i',
      '10',
      '-s',
      '5'
    ]);
    t.equal(r.code, 0, 'two files, two passes');
    t.ok(r.out.includes('pass 2 of 2'), 'passes are announced');
    t.ok(r.out.includes('Suite:'), 'the closing table is printed');
    t.ok(r.out.includes('bench-scale.js [100]'), 'a row per parameter value');

    r = await run('nano-bench-suite', [path.join(dir, 'bench-*.js'), '--', '-i', '10', '-s', '5']);
    t.equal(r.code, 1, 'a quoted glob is expanded, and the failing file fails the suite');
    t.ok(r.out.includes('1 run failed'));

    r = await run('nano-bench-suite', [path.join(dir, 'nothing-*.js')]);
    t.notEqual(r.code, 0, 'a pattern with no match is refused');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

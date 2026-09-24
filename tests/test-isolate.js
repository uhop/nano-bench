import test from 'tape-six';

import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {isolationPlan, fastestPerRound} from 'nano-benchmark/bench/isolate.js';

test('isolationPlan()', t => {
  const order = plan => plan.map(({fn, round}) => `${'ABC'[fn]}${round + 1}`).join(' ');
  t.equal(order(isolationPlan(2, 1, 'interleaved')), 'A1 B1', 'one process each');
  t.equal(
    order(isolationPlan(3, 3, 'interleaved')),
    'A1 B1 C1 B2 C2 A2 C3 A3 B3',
    'interleaved rounds rotate the first function'
  );
  t.equal(
    order(isolationPlan(2, 3, 'sequential')),
    'A1 A2 A3 B1 B2 B3',
    'sequential runs each function in turn'
  );
});

test('fastestPerRound()', t => {
  t.deepEqual(
    fastestPerRound([
      [5, 5, 1],
      [3, 4, 2]
    ]),
    [1, 2],
    'B wins two rounds, A one'
  );
  t.deepEqual(fastestPerRound([[1, 1], [2, 2], [3]]), [1, 0, 0], 'only complete rounds count');
});

const run = args =>
  new Promise((resolve, reject) => {
    const bin = fileURLToPath(new URL('../bin/nano-bench.js', import.meta.url)),
      child = spawn('node', [bin, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({code, out}));
  });

test('nano-bench --isolate', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nano-bench-isolate-')),
    bench = path.join(dir, 'bench.js'),
    json = path.join(dir, 'out.json');
  await writeFile(
    bench,
    `let t = 0;
export default {
  a: n => { for (let i = 0; i < n; ++i) t += i; return t; },
  b: n => { for (let i = 0; i < n; ++i) t += i * 2; return t; },
};
`
  );
  try {
    let r = await run([bench, 'a', 'b', '--isolate', '-i', '100', '-s', '4', '--json', json]);
    t.equal(r.code, 0, 'one process per function');
    let data = JSON.parse(await readFile(json, 'utf8'));
    t.equal(data.params.isolate, true);
    t.equal(data.params.repeat, 1);
    t.deepEqual(
      data.results.map(s => s.processSizes),
      [[4], [4]],
      'each process keeps its samples after the first is dropped'
    );
    t.deepEqual(
      data.results.map(s => s.samples.length),
      [4, 4]
    );
    t.notOk(data.significance.unit, 'one process each: the samples are the unit');

    r = await run([
      bench,
      'a',
      'b',
      '--isolate',
      '--repeat',
      '2',
      '-i',
      '100',
      '-s',
      '3',
      '--json',
      json
    ]);
    t.equal(r.code, 0, 'two processes per function');
    data = JSON.parse(await readFile(json, 'utf8'));
    t.deepEqual(
      data.results.map(s => s.processSizes),
      [
        [3, 3],
        [3, 3]
      ]
    );
    t.equal(data.significance.unit, 'process-medians', 'the test runs on per-process medians');
    t.ok(r.out.includes('Fastest median in each round'), 'the direction tally is printed');

    r = await run([bench, 'a', '--repeat', '2', '-i', '100']);
    t.notEqual(r.code, 0, '--repeat without --isolate is refused');

    r = await run([bench, 'a', '--isolate', '-p', '-i', '100']);
    t.notEqual(r.code, 0, '--isolate with --parallel is refused');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

import test from 'tape-six';

import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const run = args =>
  new Promise((resolve, reject) => {
    const bin = fileURLToPath(new URL('../bin/nano-bench-io.js', import.meta.url)),
      child = spawn('node', [bin, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({code, out}));
  });

test('nano-bench-io under load', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nano-bench-load-')),
    bench = path.join(dir, 'bench.js'),
    json = path.join(dir, 'out.json');
  await writeFile(
    bench,
    `const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export default {a: () => sleep(2), b: () => sleep(4)};
`
  );
  try {
    let r = await run([bench, '--in-flight', '3', '--phase', '100', '-t', '400', '--json', json]);
    t.equal(r.code, 0, 'closed loop');
    let data = JSON.parse(await readFile(json, 'utf8'));
    t.deepEqual(data.params.load, {mode: 'closed', inFlight: 3});
    t.equal(data.params.phases, 4, '--budget / --phase phases per function');
    t.equal(data.results[0].phaseSizes.length, 4);
    t.equal(data.significance.unit, 'phase-medians', 'the test runs on per-phase medians');
    t.ok(data.results[0].load.throughput > 0, 'throughput is recorded');
    t.ok(r.out.includes('Load: measured phases'));

    r = await run([bench, '--rate', '100', '--phase', '100', '-t', '200', '--json', json]);
    t.equal(r.code, 0, 'open loop');
    data = JSON.parse(await readFile(json, 'utf8'));
    t.equal(data.params.load.mode, 'open');
    t.equal(data.results[0].load.scheduled, 20, 'ten calls per 100 ms phase, two phases');
    t.equal(data.results[0].serviceSamples.length, data.results[0].samples.length);
    t.ok(
      data.results[0].samples.every((ms, k) => ms >= data.results[0].serviceSamples[k]),
      'latency counts from the intended start'
    );
    t.ok(r.out.includes('cannot reach'), 'two phases per function: the power note');

    r = await run([bench, '--in-flight', '2', '--rate', '5']);
    t.notEqual(r.code, 0, 'the two loops are exclusive');
    r = await run([bench, '--phase', '100']);
    t.notEqual(r.code, 0, '--phase needs a load mode');
    r = await run([bench, '--max-in-flight', '5', '--in-flight', '2']);
    t.notEqual(r.code, 0, '--max-in-flight needs --rate');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

import test from 'tape-six';

import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {runtimeArgs} from 'nano-benchmark/bench/isolate.js';

const bin = fileURLToPath(new URL('../bin/nano-bench-compare.js', import.meta.url)),
  sample = name => fileURLToPath(new URL(`../bench/${name}`, import.meta.url)),
  compare = (...files) =>
    spawnSync(process.execPath, [...runtimeArgs(), bin, '--no-emoji', ...files], {
      encoding: 'utf8'
    });

test('nano-bench-compare: the pairing note', t => {
  let run = compare(sample('bsc-combined.json'));
  t.equal(run.status, 0);
  t.notOk(run.stdout.includes('No shared names'), 'one file is a view, not a pairing');

  run = compare(sample('backticks.json'), sample('strings.json'));
  t.equal(run.status, 0);
  t.ok(
    run.stdout.includes('No shared names'),
    'files without a shared name are pooled, with a note'
  );
});

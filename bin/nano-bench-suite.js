#!/usr/bin/env node

import {glob, mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {program} from 'commander';

import style, {c} from 'console-toolkit/style.js';
import makeTable from 'console-toolkit/table';
import lineTheme from 'console-toolkit/themes/lines/unicode-rounded.js';
import Writer from 'console-toolkit/output/writer.js';

import {readResults, runInherited} from '../src/bench/params.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// everything after `--` goes to every run
const argv = process.argv.slice(2),
  split = argv.indexOf('--'),
  own = split < 0 ? argv : argv.slice(0, split),
  passThrough = split < 0 ? [] : argv.slice(split + 1);

program
  .name('nano-bench-suite')
  .version(pkg.version)
  .description('Run several benchmark files, each in its own process, over one or more passes.')
  .argument('<files...>', 'benchmark files or glob patterns')
  .option('--passes <n>', 'passes over all files', value => parseInt(value), 1)
  .option('--io', 'run nano-bench-io instead of nano-bench')
  .addHelpText('after', '\nOptions after -- go to every run, e.g.: -- -s 200 --gc each')
  .showHelpAfterError('(add --help to see available options)')
  .parse(own, {from: 'user'});

const options = program.opts();
if (!(options.passes >= 1)) program.error('The number of passes must be >= 1');

const files = [];
for (const pattern of program.args) {
  const found = [];
  for await (const file of glob(pattern)) found.push(file);
  if (!found.length) program.error(`No file matches ${pattern}`);
  for (const file of found.sort()) if (!files.includes(file)) files.push(file);
}

const tool = options.io ? 'nano-bench-io' : 'nano-bench',
  script = fileURLToPath(new URL(`./${tool}.js`, import.meta.url)),
  writer = new Writer(),
  tmp = await mkdtemp(path.join(tmpdir(), 'nano-bench-suite-')),
  // rows keyed by file and parameter value: [{key, passes: [{fastest, significant}]}]
  rows = new Map();
let failed = 0;

const byParam = (a, b) =>
  typeof a == 'number' && typeof b == 'number' ? a - b : String(a).localeCompare(String(b));

const record = (key, pass, results) => {
  const series = results.results,
    fastest = series.reduce((best, s) => (s.summary.median < best.summary.median ? s : best));
  if (!rows.has(key)) rows.set(key, []);
  rows.get(key)[pass] = {
    fastest: fastest.name,
    significant: series.length > 1 ? !!results.significance?.different : null
  };
};

try {
  for (let pass = 0; pass < options.passes; ++pass) {
    for (const file of files) {
      await writer.write([
        '',
        c`{{save.bold.bright.cyan}}----- ${file}${
          options.passes > 1 ? ` (pass ${pass + 1} of ${options.passes})` : ''
        } -----{{restore}}`,
        ''
      ]);
      const dir = await mkdtemp(path.join(tmp, 'run-')),
        json = path.join(dir, 'results.json');
      if ((await runInherited(script, [file, ...passThrough, '--json', json])) !== 0) ++failed;
      // a parameterized file leaves one results file per value
      const runs = [];
      for (const name of await readdir(dir)) {
        const results = await readResults(path.join(dir, name));
        if (results?.results?.length) runs.push(results);
      }
      runs.sort((a, b) => byParam(a.params?.param, b.params?.param));
      for (const results of runs) {
        const param = results.params?.param;
        record(param === undefined ? file : `${file} [${param}]`, pass, results);
      }
    }
  }
} finally {
  await rm(tmp, {recursive: true, force: true});
}

if (rows.size) {
  const bold = s => style.bold.text(s),
    tableData = /** @type {any[]} */ ([[bold('file'), bold('fastest'), bold('held')]]);
  for (const [key, passes] of rows) {
    const counts = new Map();
    for (const run of passes) if (run) counts.set(run.fastest, (counts.get(run.fastest) ?? 0) + 1);
    const [leader] = [...counts].sort((a, b) => b[1] - a[1])[0],
      compared = passes.some(run => run && run.significant !== null),
      held = passes.filter(run => run?.fastest === leader && run.significant).length;
    tableData.push([
      key,
      leader,
      {value: compared ? `${held} of ${options.passes}` : '—', align: 'r'}
    ]);
  }
  await writer.write([
    '',
    c`{{save.bold}}Suite:{{restore}} the fastest function per file, and in how many passes it was fastest with a significant difference`,
    ''
  ]);
  await writer.write(makeTable(tableData, lineTheme).toStrings());
}
if (failed) await writer.write(['', `${failed} run${failed > 1 ? 's' : ''} failed`]);

process.exit(failed ? 1 : 0);

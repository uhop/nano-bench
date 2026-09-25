import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {c} from 'console-toolkit/style.js';
import Writer from 'console-toolkit/output/writer.js';

import {runtimeArgs} from './isolate.js';
import {scalingTable} from './render/scaling-table.js';

/**
 * `--params 10,100,1e3` → [10, 100, 1000]; a value that is not a number stays a string.
 * @param {string} list
 * @returns {(number | string)[]}
 */
export const parseParams = list =>
  list
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => (value !== '' && Number.isFinite(Number(value)) ? Number(value) : value));

/**
 * `out.json` → `out-100.json`: one results file per parameter value.
 * @param {string} file
 * @param {unknown} value
 */
export const paramFileName = (file, value) => {
  const ext = path.extname(file),
    tag = String(value).replace(/[^\w.-]+/g, '_');
  return `${file.slice(0, file.length - ext.length)}-${tag}${ext || '.json'}`;
};

// flags whose value the parent replaces for each child
const replaced = new Set(['--json', '--params', '--param-json']);

/**
 * The parent's arguments for one child: `--json`, `--params`, and `--param-json` replaced.
 * @param {string[]} argv
 * @param {{value: unknown, json: string}} child
 * @returns {string[]}
 */
export const childArgv = (argv, {value, json}) => {
  const out = [];
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i],
      eq = arg.indexOf('='),
      flag = eq > 0 ? arg.slice(0, eq) : arg;
    if (!replaced.has(flag)) {
      out.push(arg);
      continue;
    }
    if (eq < 0) ++i;
  }
  out.push('--param-json', JSON.stringify(value), '--json', json);
  return out;
};

/**
 * Runs a script in the running runtime with the terminal shared.
 * @param {string} script
 * @param {string[]} args
 * @returns {Promise<number>} the exit code (1 when killed by a signal)
 */
export const runInherited = (script, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...runtimeArgs(), script, ...args], {stdio: 'inherit'});
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });

/**
 * Reads a results file, or null when the run left none.
 * @param {string} file
 */
export const readResults = async file => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Runs the script once per parameter value, each in its own process, and collects the results.
 * @param {{script: string, argv: string[], values: unknown[], json?: string, onValue?: (value: unknown, index: number) => unknown}} options
 *   `json`: the user's results path, split per value; a temporary directory otherwise
 * @returns {Promise<{failed: number, names: string[], medians: (number | undefined)[][]}>}
 */
export const runParamValues = async ({script, argv, values, json, onValue}) => {
  const tmp = json ? null : await mkdtemp(path.join(tmpdir(), 'nano-bench-params-')),
    runs = [];
  let failed = 0;
  try {
    for (let k = 0; k < values.length; ++k) {
      await onValue?.(values[k], k);
      const file = paramFileName(
        json ?? path.join(/** @type {string} */ (tmp), 'run.json'),
        values[k]
      );
      if ((await runInherited(script, childArgv(argv, {value: values[k], json: file}))) !== 0)
        ++failed;
      runs.push(await readResults(file));
    }
  } finally {
    if (tmp) await rm(tmp, {recursive: true, force: true});
  }
  const names = [];
  for (const run of runs)
    for (const series of run?.results ?? [])
      if (!names.includes(series.name)) names.push(series.name);
  const medians = names.map(name =>
    runs.map(run => run?.results.find(series => series.name === name)?.summary.median)
  );
  return {failed, names, medians};
};

/**
 * Parent mode for a factory export: one child run per value, then the scaling table; exits.
 * @param {{script: string, argv: string[], values: unknown[], json?: string}} options
 */
export const paramsMain = async ({script, argv, values, json}) => {
  const writer = new Writer(),
    {failed, names, medians} = await runParamValues({
      script,
      argv,
      values,
      json,
      onValue: (value, k) =>
        writer.write([
          '',
          c`{{save.bold.bright.cyan}}params = ${String(value)}{{restore}} (${k + 1} of ${values.length})`,
          ''
        ])
    });
  if (names.length) {
    await writer.write([
      '',
      c`{{save.bold}}Scaling:{{restore}} median per call by parameter value`,
      ''
    ]);
    await writer.write(scalingTable(names, values, medians));
  }
  if (failed) await writer.write(['', `${failed} of ${values.length} runs failed`]);
  process.exit(failed ? 1 : 0);
};

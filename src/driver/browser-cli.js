import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile, stat} from 'node:fs/promises';

import {program} from 'commander';
import {CLEAR_EOL} from 'console-toolkit/ansi';

import {progressLine} from '../bench/render/progress.js';
import {runtimeArgs} from '../bench/isolate.js';
import {PREFIX} from '../server/nano-bench-plugin.js';
import {encodeQueryPath, isInside, toPosix} from '../server/files.js';
import {serverInstallHint, startServer} from '../server/start.js';

const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')),
  compareBin = fileURLToPath(new URL('../../bin/nano-bench-compare.js', import.meta.url)),
  toInt = value => parseInt(value);

/**
 * @typedef {object} DriverSpec
 * @property {string} name the command name
 * @property {string} driver the driver package, for messages
 * @property {string[]} browsers the browser names the driver launches
 * @property {() => Promise<any>} load imports the driver package
 * @property {string} installDriver the command that installs the driver
 * @property {(browser: string) => string} installBrowser the command that installs a browser
 * @property {(driver: any, browser: string, options: {headless: boolean}) =>
 *   Promise<{page: any, version: string, close: () => Promise<void>}>} launch
 */

/**
 * Follows one run: the page reports through the exposed nanoBenchDriver function.
 * @returns {Promise<string>} the saved results path, relative to the root
 */
const follow = async (page, url, {timeout, onProgress}) => {
  /** @type {{resolve: (path: string) => void, reject: (error: Error) => void}} */
  let settle;
  const done = new Promise((resolve, reject) => (settle = {resolve, reject}));
  await page.exposeFunction('nanoBenchDriver', event => {
    if (event?.type === 'saved') settle.resolve(event.path);
    else if (event?.type === 'error') settle.reject(new Error(event.message));
    else if (event?.type === 'progress') onProgress(event);
  });
  page.on('close', () => settle.reject(new Error('the page closed before the run ended')));
  await page.goto(url);
  if (!(timeout > 0)) return done;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no results after ${timeout} s`)), timeout * 1000);
  });
  try {
    return await Promise.race([done, expired]);
  } finally {
    clearTimeout(timer);
  }
};

const compare = (file, flags) =>
  new Promise(resolve => {
    const child = spawn(process.execPath, [...runtimeArgs(), compareBin, file, ...flags], {
      stdio: 'inherit'
    });
    child.on('close', code => resolve(code));
    child.on('error', () => resolve(1));
  });

/** @param {DriverSpec} spec */
export const main = async spec => {
  program
    .name(spec.name)
    .version(pkg.version)
    .description(
      `Run a bench file in browsers driven by ${spec.driver}: one iframe per function, ` +
        'interleaved rounds. Results are saved under nano-bench-results/ in the root folder.'
    )
    .argument('<file>', 'bench file to run (must be inside the root folder)')
    .option(
      '-b, --browser <names>',
      `comma-separated browsers: ${spec.browsers.join(', ')}`,
      spec.browsers[0]
    )
    .option('-m, --ms <ms>', 'measurement time in milliseconds', toInt, 50)
    .option('-s, --samples <samples>', 'number of samples', toInt, 100)
    .option('-e, --export <name>', 'name of the export', 'default')
    .option('-r, --root <folder>', 'folder to serve (default: the current folder)')
    .option('--headed', 'show the browser windows')
    .option('--timeout <seconds>', 'give up on a browser after this long (default: never)', toInt)
    .option('-v, --verbose', 'show significance test statistics and critical values')
    .option('--histogram', 'show a distribution histogram per function')
    .option('--no-emoji', 'use ASCII fastest/slowest markers (F/S) instead of emoji')
    .showHelpAfterError('(add --help to see available options)');

  program.parse();

  const options = program.opts(),
    rootFolder = path.resolve(options.root ?? process.cwd()),
    fileName = path.resolve(program.args[0]),
    browsers = String(options.browser)
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);

  for (const browser of browsers) {
    if (!spec.browsers.includes(browser))
      program.error(`unknown browser: ${browser} (expected ${spec.browsers.join(', ')})`);
  }
  if (!(await stat(rootFolder).catch(() => null))?.isDirectory())
    program.error(`root folder not found: ${rootFolder}`);
  if (!(await stat(fileName).catch(() => null))?.isFile())
    program.error(`file not found: ${program.args[0]}`);
  if (!isInside(rootFolder, fileName))
    program.error(`${program.args[0]} is outside the root folder: pass --root`);

  let driver;
  try {
    driver = await spec.load();
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    console.error(
      `${spec.name} drives browsers with ${spec.driver}, which is not installed.\n` +
        `Install it next to nano-benchmark:\n\n  ${spec.installDriver}\n`
    );
    process.exit(1);
  }

  const server = await startServer({rootFolder});
  if (!server) {
    console.error(serverInstallHint(spec.name));
    process.exit(1);
  }

  const url = new URL(PREFIX + 'web-app/', server.base);
  url.search =
    `run=${encodeQueryPath(toPosix(path.relative(rootFolder, fileName)))}` +
    `&ms=${options.ms}&samples=${options.samples}&export=${encodeURIComponent(options.export)}`;

  const flags = [
      ...(options.verbose ? ['--verbose'] : []),
      ...(options.histogram ? ['--histogram'] : []),
      ...(options.emoji ? [] : ['--no-emoji'])
    ],
    tty = process.stdout.isTTY,
    saved = [];
  let failed = false,
    session = null;

  const stop = async () => {
    await session?.close().catch(() => {});
    await server.close();
    process.exit(130);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  for (const browser of browsers) {
    try {
      session = await spec.launch(driver, browser, {headless: !options.headed});
    } catch (error) {
      failed = true;
      console.error(
        `${browser}: could not launch: ${String(error?.message || error).split('\n')[0]}\n` +
          `  To install it: ${spec.installBrowser(browser)}`
      );
      continue;
    }
    console.log(`${browser} ${session.version}`);
    try {
      const resultsPath = await follow(session.page, url.href, {
        timeout: options.timeout,
        onProgress: ({label, value, max}) => {
          if (!tty) return;
          const line =
            value === null ? '  ' + label : progressLine({label, done: value, total: max});
          process.stdout.write('\r' + line + CLEAR_EOL);
        }
      });
      if (tty) process.stdout.write('\r' + CLEAR_EOL);
      saved.push(resultsPath);
      if ((await compare(path.join(rootFolder, resultsPath), flags)) !== 0) failed = true;
    } catch (error) {
      if (tty) process.stdout.write('\r' + CLEAR_EOL);
      failed = true;
      console.error(`${browser}: ${error?.message || error}`);
    } finally {
      await session.close().catch(() => {});
      session = null;
    }
    console.log();
  }

  await server.close();
  if (saved.length) console.log('Saved:\n' + saved.map(p => '  ' + p).join('\n'));
  process.exit(failed ? 1 : 0);
};

#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {readFile, stat} from 'node:fs/promises';

import {program} from 'commander';

import {nanoBenchPlugin, PREFIX} from '../src/server/nano-bench-plugin.js';
import {autoindexPlugin} from '../src/server/autoindex.js';
import {isInside, toPosix} from '../src/server/files.js';

const pkgUrl = new URL('../package.json', import.meta.url),
  pkg = JSON.parse(await readFile(pkgUrl, {encoding: 'utf8'}));

program
  .name('nano-bench-view')
  .version(pkg.version)
  .description(
    'Serve a browser viewer for nano-bench results JSON files found under the root folder.'
  )
  .argument('[files...]', 'results files to open directly (must be inside the root folder)')
  .option(
    '-r, --root <folder>',
    'root folder to serve and search for results (default: the current folder)'
  )
  .option('--host <host>', 'interface to listen on', 'localhost')
  .option('-p, --port <port>', 'port to listen on', value => parseInt(value), 3000)
  .option('--show-dot-files', 'show dot-files in folder listings')
  .option('--trace', 'log every request')
  .addHelpText(
    'after',
    '\nThe server is a development tool: it is not hardened and must not serve the open web.\n' +
      'You are responsible for its security; outside localhost, you are on your own.'
  )
  .showHelpAfterError('(add --help to see available options)');

program.parse();

const options = program.opts(),
  rootFolder = path.resolve(options.root ?? process.cwd());

if (!(await stat(rootFolder).catch(() => null))?.isDirectory())
  program.error(`root folder not found: ${rootFolder}`);

const viewPaths = program.args.map(file => {
  const fileName = path.resolve(file);
  if (!isInside(rootFolder, fileName)) program.error(`${file} is outside the root folder`);
  return toPosix(path.relative(rootFolder, fileName));
});

let createTestServer;
try {
  ({createTestServer} = await import('tape-six/test-server.js'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.error(
    'nano-bench-view serves the viewer with tape-six, which is not installed.\n' +
      'Install it next to nano-benchmark:\n\n  npm install --save-dev tape-six\n'
  );
  process.exit(1);
}

let server;
try {
  server = await createTestServer({
    rootFolder,
    host: options.host,
    port: options.port,
    protocol: 'h1',
    webAppPath: PREFIX + 'web-app/',
    remotePlugins: false,
    trace: options.trace,
    plugins: [nanoBenchPlugin, api => autoindexPlugin(api, {showDotFiles: options.showDotFiles})]
  });
} catch (error) {
  if (error?.code === 'EADDRINUSE')
    program.error(`port ${options.port} is in use — pass --port to pick another`);
  throw error;
}

const appUrl = new URL(PREFIX + 'web-app/', server.base);
for (const p of viewPaths) appUrl.searchParams.append('view', p);

console.log(`nano-bench-view: serving ${rootFolder}`);
console.log(`  viewer:  ${appUrl.href}`);
console.log(`  folders: ${new URL('/?list', server.base).href}`);
if (!['localhost', '127.0.0.1', '::1'].includes(options.host))
  console.warn(
    `warning: listening on ${options.host} exposes this development server beyond this machine.\n` +
      '  It is not hardened for general web serving; you are responsible for its security.'
  );
console.log('Press Ctrl-C to stop.');

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

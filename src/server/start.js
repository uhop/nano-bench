import {nanoBenchPlugin, PREFIX} from './nano-bench-plugin.js';
import {autoindexPlugin} from './autoindex.js';

export const serverInstallHint = command =>
  `${command} serves its pages with tape-six, which is not installed.\n` +
  'Install it next to nano-benchmark:\n\n  npm install --save-dev tape-six\n';

/**
 * Starts tape-six's test server with nano-bench's plugins.
 * @param {{rootFolder: string, host?: string, port?: number, trace?: boolean, showDotFiles?: boolean}} options
 * @returns {Promise<any>} the server, or null when tape-six is not installed
 */
export const startServer = async ({
  rootFolder,
  host = 'localhost',
  port = 0,
  trace = false,
  showDotFiles = false
}) => {
  let createTestServer;
  try {
    ({createTestServer} = await import('tape-six/test-server.js'));
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return null;
  }
  return createTestServer({
    rootFolder,
    host,
    port,
    protocol: 'h1',
    webAppPath: PREFIX + 'web-app/',
    remotePlugins: false,
    trace,
    plugins: [nanoBenchPlugin, api => autoindexPlugin(api, {showDotFiles})]
  });
};

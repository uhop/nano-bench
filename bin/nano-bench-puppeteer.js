#!/usr/bin/env node

import {main} from '../src/driver/browser-cli.js';

await main({
  name: 'nano-bench-puppeteer',
  driver: 'Puppeteer',
  browsers: ['chrome', 'firefox'],
  load: () => import('puppeteer').then(module => module.default),
  installDriver: 'npm install --save-dev puppeteer',
  installBrowser: browser => `npx puppeteer browsers install ${browser}`,
  launch: async (puppeteer, browser, {headless}) => {
    // --no-sandbox: Chromium fails to launch on CI runners without it (as in tape-six-puppeteer)
    const instance = await puppeteer.launch(
      browser === 'chrome' ? {browser, headless, args: ['--no-sandbox']} : {browser, headless}
    );
    return {
      page: await instance.newPage(),
      version: await instance.version(),
      close: () => instance.close()
    };
  }
});

#!/usr/bin/env node

import {main} from '../src/driver/browser-cli.js';

await main({
  name: 'nano-bench-playwright',
  driver: 'Playwright',
  browsers: ['chromium', 'firefox', 'webkit'],
  load: () => import('playwright'),
  installDriver: 'npm install --save-dev playwright && npx playwright install',
  installBrowser: browser => `npx playwright install ${browser}`,
  launch: async (playwright, browser, {headless}) => {
    const instance = await playwright[browser].launch({headless});
    return {
      page: await instance.newPage(),
      version: instance.version(),
      close: () => instance.close()
    };
  }
});

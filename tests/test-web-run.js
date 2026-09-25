import test from 'tape-six';

import {detectBrowser, timerResolution} from '../web-app/run.js';

test('detectBrowser()', t => {
  const chrome =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Safari/537.36',
    edge = chrome + ' Edg/151.0.1.2',
    firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0',
    safari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
    epiphany =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Epiphany/48 Safari/605.1.15';
  t.deepEqual(detectBrowser(chrome), {name: 'chromium', version: '151.0.7922.34'});
  t.deepEqual(detectBrowser(edge), {name: 'edge', version: '151.0.1.2'});
  t.deepEqual(detectBrowser(firefox), {name: 'firefox', version: '153.0'});
  t.deepEqual(detectBrowser(safari), {name: 'webkit', version: '26.1'});
  t.deepEqual(detectBrowser(epiphany), {name: 'webkit', version: '605.1.15'});
  t.deepEqual(detectBrowser('curl/8'), {name: 'browser', version: null});
});

test('timerResolution()', t => {
  const r = timerResolution();
  t.ok(r > 0 && r <= 1, `a positive step of 1 ms or less (${r} ms)`);
});

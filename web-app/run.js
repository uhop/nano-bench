import {bootstrapSummary, mean, stdDev} from '../src/stats.js';
import {computeSignificance} from '../src/bench/significance.js';
import {mulberry32} from '../src/utils/prng.js';
import {isolationWarning} from '../src/bench/results/series.js';
import {escapeXml as esc} from '../src/bench/render/svg-distribution.js';

const FRAME = '/--nano-bench/frame';

// the driver bins (nano-bench-playwright, nano-bench-puppeteer) expose nanoBenchDriver to follow a
// run by push: polling with evaluate would queue tasks on the thread the benchmarks share
export const report = async event => {
  const driver = /** @type {any} */ (globalThis).nanoBenchDriver;
  if (typeof driver == 'function') await driver(event);
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// the smallest step performance.now() takes: 5 µs to 1 ms depending on engine and isolation
export const timerResolution = () => {
  let min = Infinity;
  for (let i = 0; i < 2000; ++i) {
    const a = performance.now();
    let b;
    do b = performance.now();
    while (b === a);
    if (b - a < min) min = b - a;
  }
  return min;
};

export const detectBrowser = ua => {
  const pick = (name, re) => {
    const m = re.exec(ua);
    return m ? {name, version: m[1]} : null;
  };
  return (
    pick('firefox', /Firefox\/([\d.]+)/) ||
    pick('edge', /Edg\/([\d.]+)/) ||
    pick('chromium', /Chrom(?:e|ium)\/([\d.]+)/) ||
    pick('webkit', /Version\/([\d.]+).*Safari/) ||
    pick('webkit', /AppleWebKit\/([\d.]+)/) || {name: 'browser', version: null}
  );
};

const engineOf = name =>
  ({firefox: 'spidermonkey', chromium: 'v8', edge: 'v8', webkit: 'javascriptcore'})[name] ?? null;

class Frames {
  constructor(host) {
    this.host = host;
    this.pending = new Map();
    this.waiters = new Map();
    this.nextId = 0;
    this.onMessage = event => {
      if (event.origin !== location.origin) return;
      const data = event.data || {};
      if (data.type === 'result') {
        const settle = this.pending.get(data.id);
        this.pending.delete(data.id);
        settle?.(data);
        return;
      }
      const waiter = this.waiters.get(event.source);
      waiter?.(data);
    };
    addEventListener('message', this.onMessage);
  }
  open(query) {
    const frame = document.createElement('iframe');
    frame.className = 'bench-frame';
    frame.title = 'benchmark';
    this.host.append(frame);
    // the WindowProxy keeps its identity across the navigation below, and the frame may answer
    // before its load event, so the waiter goes in first
    const ready = new Promise(resolve => this.waiters.set(frame.contentWindow, resolve));
    frame.src = FRAME + '?' + new URLSearchParams(query);
    return {frame, ready};
  }
  ask(frame, request) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, data =>
        data.error ? reject(new Error(data.error)) : resolve(data.value)
      );
      frame.contentWindow.postMessage({...request, id}, location.origin);
    });
  }
  close() {
    removeEventListener('message', this.onMessage);
    this.host.replaceChildren();
  }
}

/**
 * Runs a bench module in the browser: one same-origin iframe per function, interleaved rounds.
 * @param {HTMLElement} main
 * @param {{file: string, url: string, exportName?: string, ms?: number, samples?: number,
 *   bootstrap?: number, alpha?: number, correction?: string, onDone: (results: any, file: string) => unknown}} options
 */
export const runBench = async (main, options) => {
  const {
    file,
    url,
    exportName = 'default',
    ms = 50,
    samples = 100,
    bootstrap = 1000,
    alpha = 0.05,
    correction = 'holm',
    onDone
  } = options;

  main.innerHTML = `<section class="run">
<h2>Running <code>${esc(file)}</code></h2>
<p class="meta run-params">${esc(ms)} ms per sample, ${esc(samples)} samples per function, one iframe per function, interleaved rounds</p>
<div class="run-progress"><nano-bench-progress aria-label="benchmark progress"></nano-bench-progress><span class="label">starting…</span></div>
<section class="warnings" hidden><ul><li></li></ul></section>
<p class="run-notes muted"></p>
<div class="scroll"><table class="summary run-table"><thead><tr><th>Name</th><th class="num">Median so far</th><th class="num">Samples</th><th class="num">Batch</th></tr></thead><tbody></tbody></table></div>
<p><button type="button" class="stop">Stop</button></p>
<div class="frames" aria-hidden="true"></div>
</section>`;

  const bar = /** @type {any} */ (main.querySelector('nano-bench-progress')),
    label = /** @type {HTMLElement} */ (main.querySelector('.run-progress .label')),
    notes = /** @type {HTMLElement} */ (main.querySelector('.run-notes')),
    body = /** @type {HTMLElement} */ (main.querySelector('.run-table tbody')),
    stop = /** @type {HTMLButtonElement} */ (main.querySelector('.stop')),
    frames = new Frames(/** @type {HTMLElement} */ (main.querySelector('.frames')));

  let stopped = false,
    pauses = 0;
  stop.addEventListener('click', () => {
    stopped = true;
    stop.disabled = true;
    stop.textContent = 'Stopping…';
  });

  // ?trace logs each update with the fill's rendered box, for engines we can't run
  const trace = new URLSearchParams(location.search).has('trace'),
    progress = (text, value = null, max = 1) => {
      bar.max = max;
      bar.value = value;
      label.textContent = text;
      report({type: 'progress', label: text, value, max});
      if (!trace) return;
      const box = bar.firstElementChild.getBoundingClientRect(),
        where = value === null ? 'indeterminate' : `${value} of ${max}`;
      console.log(
        `nano-bench ${performance.now().toFixed(1)} ms: ${where}, fill ${box.width.toFixed(1)}x${box.height.toFixed(1)} px: ${text}`
      );
    };

  // a hidden tab clamps timers to 1 s or more and changes the GC window: wait for the tab
  const visible = async () => {
    if (document.visibilityState === 'visible') return;
    ++pauses;
    notes.textContent = `Paused while the tab was hidden (${pauses}×).`;
    await new Promise(resolve => {
      const check = () => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', check);
        resolve(undefined);
      };
      document.addEventListener('visibilitychange', check);
    });
  };

  try {
    const [meta, resolution] = await Promise.all([
      fetch('/--nano-bench/meta').then(r => r.json()),
      Promise.resolve(timerResolution())
    ]);

    const isolation = isolationWarning(
      {crossOriginIsolated: self.crossOriginIsolated, timerResolutionMs: resolution},
      ms
    );
    if (isolation) {
      const box = /** @type {HTMLElement} */ (main.querySelector('.warnings'));
      /** @type {HTMLElement} */ (box.querySelector('li')).textContent = isolation;
      box.hidden = false;
      report({type: 'warning', message: isolation});
    }

    progress('loading the module');
    const lister = frames.open({file: url, export: exportName}),
      listed = await lister.ready;
    if (listed.type === 'error') throw new Error(listed.message);
    const names = listed.names;
    lister.frame.remove();
    if (!names.length) throw new Error(`no functions in the "${exportName}" export`);

    const opened = names.map(name => frames.open({file: url, export: exportName, fn: name})),
      ready = await Promise.all(opened.map(o => o.ready));
    const failed = ready.find(r => r.type === 'error');
    if (failed) throw new Error(`${failed.name}: ${failed.message}`);

    const k = names.length,
      data = names.map(() => /** @type {number[]} */ ([])),
      iterations = new Array(k).fill(0),
      rows = names.map(name => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="name">${esc(name)}</td><td class="num">—</td><td class="num">0</td><td class="num">—</td>`;
        body.append(tr);
        return tr.children;
      });

    // one step per calibration, then one per sample, so the bar never moves backwards
    const steps = k + k * samples;
    for (let i = 0; i < k && !stopped; ++i) {
      progress(`calibrating ${names[i]} (${i + 1} of ${k})`, i, steps);
      await visible();
      iterations[i] = await frames.ask(opened[i].frame, {
        op: 'calibrate',
        threshold: ms,
        minIterations: 1
      });
      rows[i][3].textContent = iterations[i].toLocaleString('en-US');
    }

    const total = k * samples,
      startedAt = performance.now();
    let done = 0;
    for (let round = 0; round < samples && !stopped; ++round) {
      for (let j = 0; j < k && !stopped; ++j) {
        const i = (round + j) % k;
        await visible();
        const time = await frames.ask(opened[i].frame, {op: 'sample', n: iterations[i]});
        data[i].push(time / iterations[i]);
        ++done;
        const left = ((performance.now() - startedAt) / done) * (total - done);
        progress(
          `sampling: round ${round + 1} of ${samples}` +
            (done > k ? ` · about ${Math.max(1, Math.round(left / 1000))} s left` : ''),
          k + done,
          steps
        );
        // the GC window between samples, as in the CLI
        await sleep(5);
      }
      for (let i = 0; i < k; ++i) {
        const sorted = data[i].slice().sort((a, b) => a - b);
        rows[i][1].textContent = `${(sorted[sorted.length >> 1] * 1e6).toFixed(1)} ns`;
        rows[i][2].textContent = String(data[i].length);
      }
    }
    if (data.some(series => series.length < 2)) throw new Error('stopped before enough samples');

    progress('computing statistics');
    await sleep(0);
    const seed = (Math.random() * 2 ** 32) >>> 0,
      browser = detectBrowser(navigator.userAgent),
      stats = data.map((series, i) =>
        bootstrapSummary(series, {
          alpha,
          bootstrap,
          random: mulberry32((seed + Math.imul(i, 0x9e3779b9)) >>> 0)
        })
      ),
      significance = k > 1 ? computeSignificance(data, alpha, correction) : null;

    const results = {
      schemaVersion: 1,
      tool: meta.name,
      toolVersion: meta.version,
      createdAt: new Date().toISOString(),
      source: {file, export: exportName, methods: names},
      environment: {
        runtime: {name: browser.name, version: browser.version, engine: engineOf(browser.name)},
        os: {platform: navigator.platform || null},
        cpu: {model: null, count: navigator.hardwareConcurrency || null},
        browser: {
          userAgent: navigator.userAgent,
          crossOriginIsolated: self.crossOriginIsolated,
          timerResolutionMs: resolution,
          isolation: 'same-origin iframe per function',
          hiddenPauses: pauses,
          stoppedEarly: stopped
        }
      },
      params: {
        ms,
        minIterations: 1,
        samples,
        bootstrap,
        seed,
        alpha,
        correction,
        parallel: false,
        order: 'interleaved'
      },
      results: names.map((name, i) => ({
        name,
        bodyHash: ready[i].bodyHash,
        reps: iterations[i],
        samples: data[i],
        summary: {
          ...stats[i],
          mean: mean(data[i]),
          stdDev: stdDev(data[i]),
          opsPerSec: 1000 / stats[i].median,
          ci: 'bootstrap-percentile'
        }
      })),
      ...(significance ? {significance} : {})
    };
    frames.close();
    await onDone(results, `${file.replace(/^.*\//, '').replace(/\.m?js$/, '')}-${browser.name}`);
  } catch (error) {
    frames.close();
    report({type: 'error', message: String(error?.message || error)});
    main.innerHTML = `<section class="error"><p>${esc(error?.message || error)}</p><p><a href="./">Back to the start page</a></p></section>`;
  }
};

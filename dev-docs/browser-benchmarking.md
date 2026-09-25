# Browser benchmarking &mdash; survey and design

This note prepares the browser runner: the page that runs a bench file in a real browser and
the drivers that automate it. The architecture was decided on 2026-09-20 (vault decisions,
&ldquo;Browser benchmarking: architecture decided&rdquo;), and the server question was settled on
2026-09-24 by the viewer: tape6-server with nano-bench's own plugins
([`browser-viewer.md`](./browser-viewer.md)). What the queue still owed before code is the
browser half of the build-versus-adopt survey, with its three harvests: what to adopt, others'
mistakes, and others' good ideas. The CI and regression tier (Tinybench, mitata, Bencher,
Nyrki&ouml;, CodSpeed, criterion.rs) is covered in tape-six's
`dev-docs/testing-landscape-and-directions.md` &sect; 4.6 and isn't repeated here.

## What was surveyed

Sources were read on 2026-09-24. Facts below cite them, and statements marked _inference_ are mine.

| Tool                                                                         | Where it runs                                                                                 | How it measures                                                                             | Statistics                                                                                                          | Status                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [Tachometer](https://github.com/google/tachometer)                           | real browsers through WebDriver (Chrome, Firefox, Safari, Edge), Selenium for remote machines | a fresh tab for every sample; round-robin across benchmarks; one throw-away warmup run each | mean, Student-t 95% interval; difference of means with df = min(n) &minus; 1 and a delta-method relative difference | archived 2026-09-04                                       |
| [Benchmark.js](https://github.com/bestiejs/benchmark.js)                     | in-page loop                                                                                  | calibrated cycles of a snippet                                                              | mean with relative margin of error                                                                                  | archived 2024-04-14, last release about six years earlier |
| [perf.link](https://github.com/lukejacksonn/perflink)                        | a Web Worker in the page                                                                      | counts runs in a fixed time window, reports operations per second                           | none beyond the count                                                                                               | static site, state in the URL hash                        |
| [jsbench.me](https://github.com/psiho/jsbench-me)                            | the page                                                                                      | Benchmark.js underneath                                                                     | Benchmark.js's                                                                                                      | a UI over Benchmark.js with an AWS backend                |
| [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) | Chrome through Puppeteer or Playwright                                                        | Chrome trace events (script, main-thread work, paint), warmup runs per benchmark type       | weighted geometric mean across benchmarks                                                                           | not checked                                               |
| [mitata](https://github.com/evanwashere/mitata)                              | Node.js, Bun, Deno, engine shells (browsers not documented)                                   | batched samples with warmup                                                                 | average, min and max, p75 and p99, no significance test                                                             | used by Bun and Deno                                      |

Not surveyed, by design: browser profilers (DevTools, Firefox Profiler), which drill into one
run instead of comparing variants, and hosted services (CodSpeed and the like), which the
tape-six note covers.

## What to adopt

Nothing on the measurement side. The candidates that run real browsers are archived
(Tachometer, Benchmark.js) or are playgrounds with their own UI (perf.link, jsbench.me), and
mitata doesn't document browser support. nano-bench's statistics (nonparametric tests, the
median CI and spread, interleaved rounds, the dip and contention checks) are the value layer
and stay. The commodity layers are adopted already: tape-six's driver kit and server for
launching and serving, Playwright and Puppeteer as optional peers for automation.

## Mistakes to avoid

- **Means and t-intervals on timing data.** Tachometer summarizes with the mean and a Student-t
  interval, and computes the relative difference by the delta method. Timing data is skewed
  and often multimodal, which is why nano-bench uses medians and rank tests. The browser runner
  keeps them.
- **Single-owner tools stop.** Benchmark.js, Tachometer, and jsPerf all ended with their
  maintainers. _Inference:_ keep the browser runner thin over maintained parts (the core that
  already runs in browsers, tape-six's kit), so there is little of it to go stale.
- **Coarse timers.** Browsers reduced timer precision after Spectre: Chrome to 100&nbsp;&micro;s
  since version 91 and 5&nbsp;&micro;s when the page is cross-origin isolated; Firefox to 1&nbsp;ms
  by default and 20&nbsp;&micro;s when isolated ([Chrome for Developers](https://developer.chrome.com/blog/cross-origin-isolated-hr-timers),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)). nano-bench's
  50&nbsp;ms batches tolerate 1&nbsp;ms, but the runner page should be served with COOP and COEP
  headers, check `crossOriginIsolated`, and record the effective timer resolution with the
  results.
- **Counting runs in a fixed window.** perf.link reports only operations per second, which
  hides the distribution. Keep the samples.
- **Hidden and headless pages behave differently.** js-framework-benchmark keeps the window
  visible because paint events can be skipped otherwise. Hidden tabs also clamp `setTimeout`
  to 1&nbsp;s or more, which changes nano-bench's GC window mid-run with no sign in the output (vault learnings,
  2026-09-20). Gate sampling on the page being active, for example with time-queues'
  `PageWatcher`, and say so when it pauses.
- **Adaptive sampling that never ends.** Tachometer's auto-sampling can run to its timeout when
  the true difference sits on its threshold. Any adaptive stop needs a cap and a report of why
  it stopped.
- **Stale served files.** js-framework-benchmark warns about stale compressed builds being
  served. The runner's server should send bench files uncached.

## Good ideas to absorb

- **A fresh context per function** (Tachometer opens a new tab per sample). Eugene's own
  practice in tape6 and perf.js is an `<iframe>` per unit, which isolates without page reloads
  and lets the parent keep interleaving: it can ask each function's iframe for one sample in
  turn. See &sect; Isolation with iframes.
- **Round-robin across variants** (Tachometer), which nano-bench already does in-process.
- **Stop on the question, not on precision** (Tachometer's auto-sample conditions): keep
  sampling until the difference between two variants is clearly on one side of a threshold,
  for example &ldquo;faster by at least 5%&rdquo;, with a cap. nano-bench's `--stable` stops on
  one function's CI instead. Filed as a queue item.
- **Comparing package versions** (Tachometer installs several versions of a dependency and serves
  each separately). A before-and-after across releases without editing the bench file.
- **Shareable state in the URL** (perf.link). The viewer's `?view=` links already do this for
  results.
- **Trace events for drill-down** (Tachometer's Chromium traces, js-framework-benchmark's script
  and paint durations), as an opt-in for the Playwright driver.
- **Parameterized benchmarks and explicit GC control** (mitata's `.args()`/`.range()` and its
  `gc('inner')` mode). Not browser-specific, so they are filed as queue items.

## What this means for the browser runner

The runner was built on 2026-09-24 along steps 1&ndash;5; step 6, the drivers, is still open.
The plan as sketched:

1. A run route in the web app (`?run=<bench file>`), served by `nano-bench-view`'s server with
   COOP and COEP headers added by the nano-bench plugin.
2. The page imports the bench file as a module (bare specifiers through the server's import
   map) and runs the core already proven browser-safe: calibration, `benchmarkRounds`, the
   summaries and tests.
3. Sampling pauses while the page isn't active, and the results name every pause.
4. The environment block records the user agent, `crossOriginIsolated`, and a measured timer
   resolution. The contention check can't work there, since browsers expose no CPU time, and
   the results say so.
5. Results are shown by the viewer's renderer and saved through a results plugin on the
   server, as a schema-v1 file that `nano-bench-compare` reads.
6. The Playwright and Puppeteer drivers open that page per browser and collect the saved
   results. Isolation happens inside the page, with iframes.

## Isolation with iframes

Eugene's ruling (2026-09-24): isolate with an `<iframe>` per function, as in tape6 and perf.js,
and avoid automatic page refreshes where possible, while staying open to other forms of
measurement that iframes make possible.

### What each container isolates (measured 2026-09-24)

Two copies of a probe page ran side by side in each container, same-origin and cross-site
(`localhost` against `127.0.0.1`, which are different sites), on a plain server and on one
sending COOP and COEP. Three probes: copy A counted 1&nbsp;ms timer ticks while copy B spun for
400&nbsp;ms (a largest gap near 400&nbsp;ms means one shared thread); B kept 64&nbsp;MB while A
read `performance.memory` (Chromium only, launched with `--enable-precise-memory-info`); and each
copy reported `crossOriginIsolated` and its smallest `performance.now()` step. Engines:
Playwright's Chromium, Firefox, and WebKit builds, plus desktop Firefox 156 on the cross-site
case.

| Container                   | Same-origin                                                                                                                                               | Cross-site                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<iframe>`                  | shares the thread in every engine, and the heap in Chromium (+65.7&nbsp;MB)                                                                               | own process in Chromium with site isolation on (gap 6&ndash;9&nbsp;ms, heap +0) and in desktop Firefox 156 (gap 8&nbsp;ms), but shares the thread in WebKit |
| `<frame>` in a `<frameset>` | same as `<iframe>`                                                                                                                                        | same as `<iframe>`                                                                                                                                          |
| top-level page (a tab)      | own thread in every engine (gap 5&ndash;10&nbsp;ms, heap +0), except Firefox with COOP and COEP, where two same-origin tabs shared a thread (404&nbsp;ms) | own thread in every engine                                                                                                                                  |

What this means:

- A same-origin `<iframe>` isolates the **realm** only: fresh globals and module instances, so
  each function gets its own JIT feedback (_inference_ from separate realms creating separate
  function objects), but one thread, heap, and garbage collector for all. It sits between
  today's in-process mode and `--isolate`, and the parent can interleave by messaging each
  iframe in turn.
- A cross-site `<iframe>` gives **process** isolation, the counterpart of `--isolate`, in
  Chromium and Firefox with site isolation on, but not in WebKit. The server would answer on a
  second site name (for example, `127.0.0.1` beside `localhost`). A different port on the same
  host is the same site.
- Classic frames still work in all three engines and add nothing over iframes.
- **Automation caveats:** Playwright's default Chromium launch doesn't isolate sites. With
  `--site-per-process` it does, which is what desktop Chrome does by default. Playwright's
  Firefox kept cross-site frames on one thread, and with Fission forced on it didn't load them
  at all, so the Firefox result above comes from desktop Firefox 156 driven by a self-running
  page. Under COOP and COEP, a cross-site iframe in Chromium was not itself
  `crossOriginIsolated` (it needs `allow="cross-origin-isolated"` on the `<iframe>`, per the
  spec, not yet tested), and in Playwright's Firefox it didn't load.
- Timer steps: 100&nbsp;&micro;s in Chromium and 1&nbsp;ms in Firefox and WebKit on the plain
  server, and 5&nbsp;&micro;s in Chromium and 20&nbsp;&micro;s in Firefox and WebKit with COOP and
  COEP.

## Cross-origin isolation

Decided 2026-09-24: isolate by default, as proposed at the end of this section. A page is cross-origin isolated when it is served with
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or
`credentialless`), and every iframe it embeds is served with COEP too. `crossOriginIsolated`
then reads `true`. Isolation unlocks precise timers (Chrome 100&nbsp;&micro;s &rarr;
5&nbsp;&micro;s, Firefox 1&nbsp;ms &rarr; 20&nbsp;&micro;s), `SharedArrayBuffer` with
`Atomics.wait`, and `performance.measureUserAgentSpecificMemory()`. The cost here is small:
everything the runner loads comes from our own server, whose plugin can add both headers. A
bench file that fetches from another origin needs CORS or `Cross-Origin-Resource-Policy`, which
`credentialless` mostly waives. Proposed: isolate by default, record `crossOriginIsolated` and
the measured timer resolution with the results, and warn instead of refusing when isolation is
missing. For scale, 1&nbsp;ms of resolution on a 50&nbsp;ms sample is up to &plusmn;2% per sample.

## The runner as built

Built 2026-09-24 (`web-app/run.js`, `web-app/frame.js`, and the plugin's `benches`, `save`,
`frame`, and `meta` routes):

- **Isolation:** a same-origin iframe per function, plus one short-lived iframe that lists the
  functions. Each has its own global object and module instance; they share the thread and the
  heap, as measured in &sect; Isolation with iframes. Cross-site iframes aren't built.
- **Order:** calibration per function, then interleaved rounds with the starting function
  rotated, a 5&nbsp;ms pause between samples, and a wait while the tab is hidden.
- **Cross-origin isolation:** on by default, since the plugin sends COOP and COEP with every
  page it serves. The first runs read `crossOriginIsolated: true` in Chromium, Firefox, and
  Playwright WebKit, with a measured step of 5&nbsp;&micro;s in Chromium and 20&nbsp;&micro;s in
  the other two.
- **Without isolation:** a page opened over plain HTTP from another machine isn't a secure
  context, so browsers ignore COOP and COEP and hide `crypto.subtle`. The runner then uses a
  bundled SHA-256 for the body hash and warns with the measured step. Epiphany 60.5 reported
  `crossOriginIsolated: false` and a 1&nbsp;ms step on 2026-09-24; whether it was a secure
  context is still open.
- **Stale files:** tape-six's static handler sends no caching headers, and an edited bench file
  was picked up on reload in all three engines (measured 2026-09-24). No cache-busting was
  added.
- **Results:** saved to `nano-bench-results/<bench>-<browser>.json` under the root and opened
  in the viewer.

Not built yet: the Playwright and Puppeteer drivers, cross-site iframes, drag and drop, and
pasted snippets. A local file runs from a blob URL, so it can't import relative files.

## Answered questions

Eugene, 2026-09-24:

- **Where bench files come from:** the server's files and local files (a file input, or even
  drag and drop). Pasted snippets can be allowed too, though he expects few people to use them.
- **Isolation:** an `<iframe>` per function, without automatic refreshes if possible. Other
  forms of measurement are open to discussion. See &sect; Isolation with iframes.
- **Cross-origin isolation:** asked for the technical details, then took the recommendation:
  isolate by default, record `crossOriginIsolated` and the timer step, and warn instead of
  refusing. See &sect; Cross-origin isolation.

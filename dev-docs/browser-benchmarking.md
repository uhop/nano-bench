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
| [Benchmark.js](https://github.com/bestiejs/benchmark.js)                     | in-page loop                                                                                  | calibrated cycles of a snippet                                                              | mean with relative margin of error                                                                                  | archived 2024-04-14; last release about six years earlier |
| [perf.link](https://github.com/lukejacksonn/perflink)                        | a Web Worker in the page                                                                      | counts runs in a fixed time window, reports operations per second                           | none beyond the count                                                                                               | static site, state in the URL hash                        |
| [jsbench.me](https://github.com/psiho/jsbench-me)                            | the page                                                                                      | Benchmark.js underneath                                                                     | Benchmark.js's                                                                                                      | a UI over Benchmark.js with an AWS backend                |
| [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) | Chrome through Puppeteer or Playwright                                                        | Chrome trace events (script, main-thread work, paint); warmup runs per benchmark type       | weighted geometric mean across benchmarks                                                                           | not checked                                               |
| [mitata](https://github.com/evanwashere/mitata)                              | Node.js, Bun, Deno, engine shells; browsers not documented                                    | batched samples with warmup                                                                 | average, min and max, p75 and p99; no significance test                                                             | used by Bun and Deno                                      |

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

- **Fresh context per sample or per function** (Tachometer's new tab per sample). In a browser,
  the counterpart of `--isolate` is a fresh page or `BrowserContext` per function, which
  tape-six's driver already creates per task.
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
  `gc('inner')` mode). Not browser-specific; filed as queue items.

## What this means for the browser runner

A sketch, to be confirmed:

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
6. The Playwright and Puppeteer drivers open that page per browser, per function when
   isolated, and collect the saved results.

## Open questions

- Should the run route accept a bench file from the server's root only, or also a pasted
  snippet (the perf.link case)?
- Should isolation in the browser mean a fresh page per function (like `--isolate`) or a fresh
  page per sample (like Tachometer)? The second costs a page load per sample.
- Is Firefox's 1&nbsp;ms default timer acceptable without isolation, given 50&nbsp;ms batches,
  or should the runner refuse to run un-isolated?

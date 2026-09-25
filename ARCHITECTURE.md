# Architecture

`nano-benchmark` is a pure JavaScript (ESM) CLI package for micro-benchmarking code with nonparametric statistics and significance testing. It runs on Node.js (every non-EOL release), Bun, and Deno; no `engines` floor is declared. Runtime dependencies: `commander` (CLI parsing), `console-toolkit` (styled terminal output, tables, charts), and `emoji-regex` + `get-east-asian-width` (so `console-toolkit` measures wide-glyph widths — emoji markers, CJK names — correctly). `tape-six` is an optional peer: `nano-bench-view` serves the browser viewer with its test server and prints an install hint when it is absent.

## Project layout

```
bin/                          # CLI entry points (shipped via npm)
├── nano-bench.js                   # Compare multiple functions with bootstrap CI + significance tests
├── nano-bench-io.js                # Benchmark slow (ms-scale) functions per run — tails, no batching
├── nano-watch.js                   # Continuously benchmark a single function with live streaming stats
├── nano-bench-compare.js           # View/compare saved results JSON — recomputes significance, no measuring
├── nano-bench-view.js              # Serve the browser viewer (tape-six test server + two plugins)
├── nano-bench-playwright.js        # Run a bench file in Playwright browsers (src/driver/browser-cli.js)
└── nano-bench-puppeteer.js         # Run a bench file in Puppeteer browsers (src/driver/browser-cli.js)
web-app/                      # Browser viewer (shipped via npm; plain ES modules, no build)
├── index.html                      # Shell + import map (console-toolkit/ → /--nano-bench/console-toolkit/)
├── app.js                          # Routing (?view=<path>, repeatable; ?run=<path>) + the picker
├── view.js                         # Files, warnings, summary, distribution chart, significance
├── run.js                          # Browser runner: an iframe per function, interleaved rounds
├── frame.js                        # The iframe side: loads one function, answers calibrate/sample
├── components/nano-bench-progress.js  # <nano-bench-progress value max>: the runner's bar, indeterminate without value
├── theme-init.js / theme.js        # Auto / Light / Dark: applied before paint, saved in localStorage
└── theme.css / app.css / autoindex.css
src/                          # Internal source (shipped via npm)
├── index.js                        # Library entry — re-exports the public API
├── bench/
│   ├── runner.js                   # Core engine: findLevel, benchmark, benchmarkSeries, benchmarkRounds, measure, Stats
│   ├── compare.js                  # High-level compare() — measures + significance tests
│   ├── significance.js             # computeSignificance (MW vs KW) + significanceMatrix
│   ├── select-functions.js         # Resolve the [methods…] positional against the export
│   ├── smoke.js                    # smokeRun — each function once (the --smoke pre-flight)
│   ├── macro-runner.js             # collectMacro — one call per run; warmup, prepare/teardown, stop policies
│   ├── command-runner.js           # runCommand (shell spawn, fails on code or signal) + command adapter
│   ├── metrics.js                  # rusageDelta over process.resourceUsage() — portable per-run metrics
│   ├── proc-metrics.js             # Linux /proc/[pid]/{io,status} readings for spawned children
│   ├── outlier-notes.js            # Modified-z slow-side outliers: caching vs interference notes
│   ├── warmup-detect.js            # Windowed MW screen: size the leading slow (warmup) segment
│   ├── contention.js               # CPU contention check: per-sample CPU time / elapsed time
│   ├── isolate.js                  # --isolate: runChild, isolationPlan, fastestPerRound
│   ├── pair-series.js              # planComparison — paired-by-name blocks vs one pooled omnibus
│   ├── histogram.js                # Sample binning: computeHistograms, binCount, percentile
│   ├── render/
│   │   ├── summary-table.js        # The median / CI / spread / ops summary table
│   │   ├── io-summary-table.js     # The macro variant: median / CI / spread + p90/p99 + runs
│   │   ├── metrics-table.js        # System-metric medians per function (--metrics)
│   │   ├── clusters-table.js       # Per-cluster weight / median / CI / spread / range (--clusters)
│   │   ├── smoke-table.js          # The --smoke report (shared by bench & io)
│   │   ├── significance-table.js   # Significance header + N×N matrix (shared by bench & compare)
│   │   ├── histogram-chart.js      # Terminal distribution charts (columns ridgeline / rotated bars)
│   │   ├── progress.js             # Progress bar + line shown under the live tables while measuring
│   │   └── svg-distribution.js     # Viewer chart: small-multiple histograms as an SVG string
│   └── results/
│       ├── build.js                # buildResultsObject — schema v1
│       ├── parse.js                # Validate results JSON text (browser-safe)
│       ├── load.js                 # Read a results file from disk (Node)
│       ├── env-diff.js             # diffEnvironments — comparability banner (browser-safe)
│       ├── environment.js          # captureEnvironment (Node)
│       └── series.js               # buildSeries / resultsWarnings / multimodalityP — shared by compare + viewer
├── driver/
│   └── browser-cli.js              # The driver bins' shared CLI: server, browsers in turn, push events, compare
├── server/                         # nano-bench-view plugins (Node)
│   ├── nano-bench-plugin.js        # /--nano-bench/{web-app,src,console-toolkit}/ + results, benches, save, frame, meta
│   ├── autoindex.js                # HTML folder listings (algorithm from the static-server.mjs gist)
│   ├── start.js                    # startServer: tape-six's test server with both plugins (lazy import)
│   └── files.js                    # MIME table, containment check, escaping
├── stats.js                        # Batch stats: mean, variance, stdDev, skewness, kurtosis, bootstrap, *Summary
├── median.js                       # Fast approximate median (median-of-medians variant)
├── stream-stats.js                 # StatCounter — online/streaming mean, variance, skewness, kurtosis
├── stream-median.js                # MedianCounter — approximate streaming median
├── significance/
│   ├── mwtest.js                   # Mann-Whitney U test (two-sample)
│   ├── kwtest.js                   # Kruskal-Wallis H (k-sample) + Conover-Iman pairwise post-hoc
│   ├── correction.js               # FWER control for the post-hoc pairs (none/Holm/Bonferroni)
│   └── kstest.js                   # Kolmogorov-Smirnov test (two-sample; library-only)
├── stats/                          # Low-level math
│   ├── normal.js / normal-ppf.js   # Normal distribution CDF/PPF
│   ├── beta.js / beta-ppf.js       # Beta distribution CDF/PPF
│   ├── chi-squared-ppf.js          # Chi-squared PPF
│   ├── z.js / z-ppf.js             # Z-score distribution
│   ├── zeta.js                     # Riemann zeta function
│   ├── gamma.js                    # Gamma function (log-gamma)
│   ├── erf.js                      # Error function
│   ├── ppf.js                      # Generic PPF via Runge-Kutta integration
│   ├── quantile.js                 # Quantiles on sorted data (R-7 interpolation)
│   ├── mad.js                      # Median absolute deviation + modified z-score
│   ├── dip.js                      # Unimodality gate: dip-style statistic + seeded bootstrap p-value
│   ├── kde-modes.js                # Gaussian-KDE mode finding; clusters split at density minima
│   └── rank.js                     # Ranking with tie correction
└── utils/
    ├── bsearch.js                  # Binary search
    ├── numeric-asc.js              # Numeric ascending comparator
    ├── prng.js                     # mulberry32 — seeded PRNG for the reproducible bootstrap
    ├── body-hash.js                # sha256(fn.toString()) — per-function comparability hash
    ├── sha256.js                   # FIPS 180-4 SHA-256 — the browser runner's hash without crypto.subtle
    └── rk.js                       # Runge-Kutta ODE solver
bench/                        # Example benchmark + sample results files
├── bench-string-concat.js          # Example: compare string concatenation methods
├── bench-fn-string-concat.js       # Example: compare with wrapper functions
├── bench-async.js                  # Example: asynchronous functions for --parallel N
├── bench-string2-concat.js         # Example: another string comparison
├── bench-substrings.js             # Example: substring extraction methods
├── io-sample.js                    # Example: ms-scale async functions for nano-bench-io
├── io-bimodal.js                   # Example: deterministic fast/slow mix for --clusters
├── io-warmup.js                    # Example: slow first calls for the warmup auto-detection
├── watch-sample.js                 # Example: single function for nano-watch
└── *.json                          # Example saved results for nano-bench-compare and nano-bench-view
skills/                       # AI coding skills (shipped via npm)
├── write-bench/SKILL.md           # How to write nano-bench benchmark files
└── write-watch/SKILL.md           # How to write nano-watch benchmark files
tests/                        # Automated tests (tape-six)
wiki/                         # GitHub wiki (git submodule)
```

## How benchmarking works

### Benchmark file format

Users write a module that default-exports an object of functions. Each function takes `n` (iteration count) and runs the measured code in a loop:

```js
export default {
  variant1: n => {
    for (let i = 0; i < n; ++i) {
      /* code */
    }
  },
  variant2: n => {
    for (let i = 0; i < n; ++i) {
      /* code */
    }
  }
};
```

This design amortizes function-call overhead over `n` iterations, which is critical for micro-benchmarks.

### nano-bench pipeline

1. **Find level** (`findLevel`) — auto-discovers the batch size `n` where a single call takes ≥ threshold ms.
2. **Collect samples** — with `-p N`, each sample is a round of N concurrent calls (`burst` in `runner.js`), through `benchmarkRounds` or `benchmarkSeriesPar` by `--order`, and the test later runs on per-round medians. With `--isolate`, the parent spawns one child per function and repetition (`isolate.js`; the child is `nano-bench --emit-samples -i <n> -s <samples+1>`), drops each child's first sample, and pools the rest; with `--repeat` above 1 the test later runs on per-process medians (`comparisonArrays`). Otherwise, by default `benchmarkRounds` takes one sample of every function per round, rotating which goes first, so drift over the run lands on all functions alike; the table fills in from the first round. `--order sequential` runs `benchmarkSeries` per function in turn; `-p` runs `benchmarkSeriesPar`. Timing data is normalized to ms/iteration. For synchronous functions, each sample also records CPU time / elapsed time (`contention.js`); 10% or more of a function's samples under 0.9 prints a contention warning.
3. **Bootstrap** — `bootstrapSummary` resamples (`bootstrap()` + `getWeightedValue()`) to estimate the median, its percentile confidence interval (`ciLo`/`ciHi`, from the resampled medians), and the spread of the runs (`lo`/`hi`, the mean resampled α/2 and 1−α/2 quantiles), seeded by `--seed` (or an auto-recorded seed) via `mulberry32` for reproducibility.
4. **Significance testing** (`computeSignificance`) — Mann-Whitney U (2 functions) or Kruskal-Wallis H + Conover-Iman pairwise post-hoc (3+ functions); the post-hoc family-wise error rate is controlled by `--correction` (none/Holm/Bonferroni, default Holm).
5. **Output** — styled summary table + significance header/matrix via `console-toolkit`; optional per-function distribution histogram (`--histogram`); optional schema-v1 results file (`--json`). The run then ends with an explicit `process.exit(0)`, so a module holding live handles (servers, watchers) can't keep a finished run alive.

`--smoke` short-circuits the pipeline before calibration: each selected function runs once (`n = 1`), reported ok/failed with a rough duration, and the process exits explicitly — non-zero on any throw/rejection — so a module holding live handles can't hang the pre-flight.

### nano-bench-io pipeline

1. **Collect** (`collectMacro`) — one awaited call per run (`n = 1`, no batching); optional warmup runs discarded, optional module-level `prepare()`/`teardown()` awaited untimed around every run. Stop policy: fixed `--runs`, or the default min-runs + time-budget pair, or `--stable` (bootstrap-median-CI width target, checked every 10 runs) — all capped by `--max-runs`. Unless `--warmup` is explicit, a windowed Mann–Whitney screen then sizes and discards the leading slow (warmup) segment, noted with the count. With `-c`/`--command` the "functions" are adapted shell commands (`command-runner.js`): spawned via the system shell, output discarded, a run failing on non-zero exit or a fatal signal; `--prepare <cmd>` becomes the untimed per-run hook.
2. **Summarize** — the same `bootstrapSummary`, plus p90/p99 (`quantileSorted`, R-7). With `-M`/`--metrics`: per-run rusage deltas taken outside the timed window (module mode) or Linux `/proc/[pid]` polling with last-poll-wins semantics (command mode), rendered as a medians table and persisted into the JSON.
3. **Notes** — modified-z slow-side outliers (`outlier-notes.js`): all in the first runs → caching (suggest `--warmup`); scattered → interference. A coarse-tail note fires below 100 runs. A dip-test gate (`dip.js`, seeded bootstrap p-value) flags multimodal distributions; `--clusters` splits them at KDE density minima (`kde-modes.js`) and reports per-cluster weight/median/CI/range — the mode count is a labeled heuristic.
4. **Significance / output** — same tests, histograms, and JSON as `nano-bench` (`params.mode: "macro"`, `reps: 1`), then the explicit exit.

### nano-bench-compare pipeline

1. **Load** (`loadResults`) — read one or more results JSON files; the raw per-sample arrays are the source of truth.
2. **Recompute** — re-run `bootstrapSummary` (using each run's recorded seed) and `computeSignificance` from the saved samples; the stored summaries are treated as FYI only.
3. **Plan** (`planComparison`) — pair same-named series across files (default), or pool all series into one omnibus (`--pooled`).
4. **Banner** (`diffEnvironments`) — warn on any environment field that differs (CPU, runtime, OS, …), and on `params`/`bodyHash` divergence, so an environment-confounded comparison is never read as clean.
5. **Output** — the same summary + significance renderers as `nano-bench`, one block per comparison; optional `--histogram`.

Steps 2 and 4 live in `src/bench/results/series.js`, so the browser viewer computes the same numbers.

### nano-bench-view

1. **Serve** — `createTestServer` from `tape-six/test-server.js` (lazy import) over `--root`, with `webAppPath` set to `/--nano-bench/web-app/` so `/` redirects to the viewer, remote plugin registration off, and two plugins. `nano-bench-plugin.js` serves `web-app/`, `src/`, and the `console-toolkit` sources from wherever they are installed (resolved with `import.meta.resolve`), so the viewer works when the package is outside the served root. It also answers `/--nano-bench/results`: every JSON file under the root whose first 512 bytes carry `schemaVersion: 1` and `tool: "nano-benchmark"`, skipping dot-folders and `node_modules`. `autoindex.js` lists folders without `index.html`; the root lists only with `/?list`.
2. **View** — `web-app/app.js` loads `?view=` paths from the server (or local files through a file input), `parseResults` validates them, and `view.js` runs the compare pipeline's `buildSeries` / `resultsWarnings` / `planComparison` / `computeSignificance` in the browser. The chart is `computeHistograms` rendered by `svg-distribution.js`: a shared linear axis, a shared log axis (chosen automatically when the pooled 1st–99th percentile range exceeds 20×), or one axis per row.
3. **Run** — `?run=<path>` (or a local file through a blob URL) hands the bench file to `web-app/run.js`. A lister iframe returns the function names, then one same-origin iframe per function loads `/--nano-bench/frame`, which inlines the root's import map and runs `web-app/frame.js`. The parent calibrates each function (`findLevel`) and samples them in interleaved rounds (`benchmark`) over `postMessage`, waiting while the tab is hidden. It then builds a schema-v1 object with `bootstrapSummary` and `computeSignificance`, `POST`s it to `/--nano-bench/save` (written under `nano-bench-results/`, never overwriting), and opens it in the viewer. The plugin sends COOP and COEP with every page, so `performance.now()` steps 5–20 µs.

### Browser drivers

1. **Serve** — `startServer` on a free `localhost` port, so the page is cross-origin isolated.
2. **Drive** — for each requested browser in turn: launch it, `exposeFunction('nanoBenchDriver')`, and open `?run=<file>`. The page pushes `progress`, `warning`, `error`, and `saved` events; the CLI draws the progress line from them.
3. **Report** — each saved file is printed by `nano-bench-compare` in a child process; the exit status is non-zero when any browser failed.

### nano-watch pipeline

1. **Find level** — same as above.
2. **Streaming loop** — repeatedly calls `benchmark()`, feeds results into `StatCounter` (online stats) and `MedianCounter` (streaming median).
3. **Live output** — continuously updates a table showing count, time, mean, stdDev, median, skewness, kurtosis, ops/sec, and memory usage. A bounded run (`--iterations`) ends with an explicit `process.exit(0)` — same live-handles rationale as `nano-bench`.

## Key patterns

- **ESM-only**: All files use `import`/`export`. The package uses `"type": "module"`.
- **No build step**: Source JS is shipped directly. No TypeScript.
- **Nonparametric statistics**: No normal-distribution assumptions. Uses bootstrap resampling (a percentile CI of the median plus a quantile spread), and rank-based significance tests.
- **Online algorithms**: `StatCounter` and `MedianCounter` use constant-memory streaming algorithms for indefinite monitoring.
- **Async-aware**: `benchmark()` and `findLevel()` handle both sync and thenable (async) benchmark functions.

## Module dependency graph (simplified)

```
bin/nano-bench.js ──→ src/bench/runner.js ──→ src/stats.js
                  ──→ src/stats.js              ↑
                  ──→ src/bench/significance.js ──→ src/significance/mwtest.js ──→ src/stats/rank.js
                                                ──→ src/significance/kwtest.js ──→ src/stats/rank.js
                                                                              ──→ src/stats/beta-ppf.js
                                                                              ──→ src/significance/correction.js ──→ src/stats/z-ppf.js
                  ──→ src/bench/histogram.js
                  ──→ src/bench/render/{summary-table,significance-table,histogram-chart}.js
                  ──→ src/bench/results/{build,environment}.js
                  ──→ src/utils/{prng,body-hash}.js

bin/nano-bench-io.js ──→ src/bench/macro-runner.js
                     ──→ src/bench/command-runner.js (the -c/--command adapter)
                     ──→ src/bench/outlier-notes.js ──→ src/stats/{quantile,mad}.js
                     ──→ src/stats.js (bootstrapSummary), src/stats/quantile.js
                     ──→ src/bench/significance.js, render/*, results/* (same as nano-bench)

bin/nano-bench-compare.js ──→ src/bench/results/{load,series}.js
                          ──→ src/bench/pair-series.js
                          ──→ src/bench/significance.js (same tests, recomputed from saved samples)
                          ──→ src/bench/render/* (shared renderers)

bin/nano-bench-view.js ──→ src/server/start.js ──→ tape-six/test-server.js (optional peer, lazy)
                                            ──→ src/server/{nano-bench-plugin,autoindex}.js

bin/nano-bench-{playwright,puppeteer}.js ──→ src/driver/browser-cli.js
    ──→ playwright | puppeteer (optional peers, lazy)
    ──→ src/server/start.js, src/bench/render/progress.js
    ──→ bin/nano-bench-compare.js (child process, one per saved file)

web-app/view.js ──→ src/bench/results/series.js, src/bench/pair-series.js, src/bench/significance.js
                ──→ src/bench/histogram.js, src/bench/render/svg-distribution.js
                ──→ console-toolkit/alphanumeric/number-formatters.js (via the import map)

bin/nano-watch.js ──→ src/bench/runner.js
                  ──→ src/stream-stats.js
                  ──→ src/stream-median.js
```

## Testing

- **Framework**: [tape-six](https://github.com/uhop/tape-six)
- **Run**: `npm test` (also supports Bun and Deno variants)
- **Run single file**: `node tests/test-<name>.js`
- **Test files**: `tests/test-*.js` — automated unit tests
- **Lint**: `npm run lint` (check) / `npm run lint:fix` (auto-fix)

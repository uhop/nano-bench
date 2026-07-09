# Architecture

`nano-benchmark` is a pure JavaScript (ESM) CLI package for micro-benchmarking code with nonparametric statistics and significance testing. It runs on Node.js (every non-EOL release), Bun, and Deno; no `engines` floor is declared. Runtime dependencies: `commander` (CLI parsing), `console-toolkit` (styled terminal output, tables, charts), and `emoji-regex` + `get-east-asian-width` (so `console-toolkit` measures wide-glyph widths — emoji markers, CJK names — correctly).

## Project layout

```
bin/                          # CLI entry points (shipped via npm)
├── nano-bench.js                   # Compare multiple functions with bootstrap CI + significance tests
├── nano-bench-io.js                # Benchmark slow (ms-scale) functions per run — tails, no batching
├── nano-watch.js                   # Continuously benchmark a single function with live streaming stats
└── nano-bench-compare.js           # View/compare saved results JSON — recomputes significance, no measuring
src/                          # Internal source (shipped via npm)
├── index.js                        # Library entry — re-exports the public API
├── bench/
│   ├── runner.js                   # Core engine: findLevel, benchmark, benchmarkSeries, measure, Stats
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
│   ├── pair-series.js              # planComparison — paired-by-name blocks vs one pooled omnibus
│   ├── histogram.js                # Sample binning: computeHistograms, binCount, percentile
│   ├── render/
│   │   ├── summary-table.js        # The median/CI/ops summary table
│   │   ├── io-summary-table.js     # The macro variant: median/CI + p90/p99 + runs
│   │   ├── metrics-table.js        # System-metric medians per function (--metrics)
│   │   ├── clusters-table.js       # Per-cluster weight/median/CI/range (--clusters)
│   │   ├── smoke-table.js          # The --smoke report (shared by bench & io)
│   │   ├── significance-table.js   # Significance header + N×N matrix (shared by bench & compare)
│   │   └── histogram-chart.js      # Terminal distribution charts (columns ridgeline / rotated bars)
│   └── results/
│       ├── build.js                # buildResultsObject — schema v1
│       ├── load.js                 # Read + validate a results file
│       └── environment.js          # captureEnvironment + diffEnvironments (comparability banner)
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
    └── rk.js                       # Runge-Kutta ODE solver
bench/                        # Example benchmark + sample results files
├── bench-string-concat.js          # Example: compare string concatenation methods
├── bench-fn-string-concat.js       # Example: compare with wrapper functions
├── bench-string2-concat.js         # Example: another string comparison
├── bench-substrings.js             # Example: substring extraction methods
├── io-sample.js                    # Example: ms-scale async functions for nano-bench-io
├── io-bimodal.js                   # Example: deterministic fast/slow mix for --clusters
├── io-warmup.js                    # Example: slow first calls for the warmup auto-detection
├── watch-sample.js                 # Example: single function for nano-watch
└── *.json                          # Example saved results for nano-bench-compare
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
2. **Collect samples** (`benchmarkSeries`) — runs the function `nSeries` times, collecting timing data, normalized to ms/iteration.
3. **Bootstrap CI** — `bootstrapSummary` resamples (`bootstrap()` + `getWeightedValue()`) to estimate the median and its percentile confidence interval, seeded by `--seed` (or an auto-recorded seed) via `mulberry32` for reproducibility.
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

### nano-watch pipeline

1. **Find level** — same as above.
2. **Streaming loop** — repeatedly calls `benchmark()`, feeds results into `StatCounter` (online stats) and `MedianCounter` (streaming median).
3. **Live output** — continuously updates a table showing count, time, mean, stdDev, median, skewness, kurtosis, ops/sec, and memory usage. A bounded run (`--iterations`) ends with an explicit `process.exit(0)` — same live-handles rationale as `nano-bench`.

## Key patterns

- **ESM-only**: All files use `import`/`export`. The package uses `"type": "module"`.
- **No build step**: Source JS is shipped directly. No TypeScript.
- **Nonparametric statistics**: No normal-distribution assumptions. Uses bootstrap resampling, quantile-based CI, and rank-based significance tests.
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

bin/nano-bench-compare.js ──→ src/bench/results/{load,environment}.js
                          ──→ src/bench/pair-series.js
                          ──→ src/bench/significance.js (same tests, recomputed from saved samples)
                          ──→ src/bench/render/* (shared renderers)

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

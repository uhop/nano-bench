# Architecture

`nano-benchmark` is a pure JavaScript (ESM) CLI package for micro-benchmarking code with nonparametric statistics and significance testing. It has two runtime dependencies: `commander` (CLI parsing) and `console-toolkit` (styled terminal output).

## Project layout

```
bin/                          # CLI entry points (shipped via npm)
├── nano-bench.js                   # Compare multiple functions with bootstrap CI + significance tests
└── nano-watch.js                   # Continuously benchmark a single function with live streaming stats
src/                          # Internal source (shipped via npm)
├── bench/
│   ├── runner.js                   # Core engine: findLevel, benchmark, benchmarkSeries, measure, Stats
│   └── compare.js                  # High-level compare() — measures + significance tests
├── stats.js                        # Batch stats: mean, variance, stdDev, skewness, kurtosis, bootstrap
├── median.js                       # Fast approximate median (median-of-medians variant)
├── stream-stats.js                 # StatCounter — online/streaming mean, variance, skewness, kurtosis
├── stream-median.js                # MedianCounter — approximate streaming median
├── significance/
│   ├── mwtest.js                   # Mann-Whitney U test (two-sample)
│   ├── kwtest.js                   # Kruskal-Wallis test (k-sample) with post-hoc pairwise tests
│   └── kstest.js                   # Kolmogorov-Smirnov test (two-sample)
├── stats/                          # Low-level math
│   ├── normal.js / normal-ppf.js   # Normal distribution CDF/PPF
│   ├── beta.js / beta-ppf.js       # Beta distribution CDF/PPF
│   ├── chi-squared-ppf.js          # Chi-squared PPF
│   ├── z.js / z-ppf.js             # Z-score distribution
│   ├── zeta.js                     # Riemann zeta function
│   ├── gamma.js                    # Gamma function (log-gamma)
│   ├── erf.js                      # Error function
│   ├── ppf.js                      # Generic PPF via bisection
│   └── rank.js                     # Ranking with tie correction
└── utils/
    ├── bsearch.js                  # Binary search
    └── rk.js                       # Runge-Kutta ODE solver
bench/                        # Example benchmark files
├── bench-string-concat.js          # Example: compare string concatenation methods
├── bench-fn-string-concat.js       # Example: compare with wrapper functions
├── bench-string2-concat.js         # Example: another string comparison
├── bench-substrings.js             # Example: substring extraction methods
└── watch-sample.js                 # Example: single function for nano-watch
tests/                        # Automated tests (tape-six)
manual-tests/                 # Manual/visual test scripts
wiki/                         # GitHub wiki (git submodule)
```

## How benchmarking works

### Benchmark file format

Users write a module that default-exports an object of functions. Each function takes `n` (iteration count) and runs the measured code in a loop:

```js
export default {
  variant1: n => { for (let i = 0; i < n; ++i) { /* code */ } },
  variant2: n => { for (let i = 0; i < n; ++i) { /* code */ } }
};
```

This design amortizes function-call overhead over `n` iterations, which is critical for micro-benchmarks.

### nano-bench pipeline

1. **Find level** (`findLevel`) — auto-discovers the batch size `n` where a single call takes ≥ threshold ms.
2. **Collect samples** (`benchmarkSeries`) — runs the function `nSeries` times, collecting timing data.
3. **Bootstrap CI** — uses `bootstrap()` + `getWeightedValue()` to compute median and confidence interval.
4. **Significance testing** — Mann-Whitney U (2 functions) or Kruskal-Wallis (3+ functions) to determine if differences are statistically significant.
5. **Output** — styled table via `console-toolkit` with timing, ops/sec, and significance matrix.

### nano-watch pipeline

1. **Find level** — same as above.
2. **Streaming loop** — repeatedly calls `benchmark()`, feeds results into `StatCounter` (online stats) and `MedianCounter` (streaming median).
3. **Live output** — continuously updates a table showing count, time, mean, stdDev, median, skewness, kurtosis, ops/sec, and memory usage.

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
                  ──→ src/significance/mwtest.js ──→ src/stats/rank.js
                  ──→ src/significance/kwtest.js ──→ src/stats/rank.js
                                                 ──→ src/stats/beta-ppf.js
                                                 ──→ src/stats/chi-squared-ppf.js

bin/nano-watch.js ──→ src/bench/runner.js
                  ──→ src/stream-stats.js
                  ──→ src/stream-median.js
```

## Testing

- **Framework**: [tape-six](https://github.com/uhop/tape-six)
- **Run**: `npm test` (also supports Bun and Deno variants)
- **Run single file**: `node tests/test-<name>.js`
- **Test files**: `tests/test-*.js` — automated unit tests
- **Manual tests**: `manual-tests/` — visual verification scripts (run individually with `node`)

# nano-benchmark — AI Agent Rules

## Project identity

nano-benchmark is an ESM JavaScript package providing command-line utilities (`nano-bench`, `nano-bench-io`, `nano-watch`, `nano-bench-compare`) for benchmarking code — ns-scale hot loops and ms-scale per-run operations — with proper nonparametric statistics and significance testing. Runs on Node.js, Bun, and Deno. Per the fleet runtime policy it supports every non-EOL Node release (active LTS plus current) with no `engines` floor pinned — don't add one without a feature that requires it, and don't name specific versions in docs. CI runs the suite across the non-EOL Node versions. The `src/` modules (stats, significance tests, streaming counters) are internal — the user-facing surface is the four CLI tools in `bin/`.

## Critical rules

- **ESM-only.** All imports must use `.js` extensions: `import median from './median.js'`.
- **No build step.** Source JS in `src/` and CLI scripts in `bin/` are shipped directly. Do not create build scripts or compiled output.
- **No TypeScript.** No `.ts` files, no `.d.ts` files. This is a pure JS project.
- **Do not modify or delete test expectations** without understanding why they changed.
- **CLI-only project.** The four binaries (`bin/nano-bench.js`, `bin/nano-bench-io.js`, `bin/nano-watch.js`, `bin/nano-bench-compare.js`) are the user-facing interface. The `src/` modules are internal implementation details.

## Code style

- Prettier: 100 char width, single quotes, no bracket spacing, no trailing commas, arrow parens "avoid".
- 2-space indentation (`.editorconfig`).
- Imports at top of file. No dynamic imports unless necessary.
- **No comments that narrate the code.** Don't write a comment that restates _what_ the code does. Allowed, each as the shortest possible marker: JSDoc when requested or required; a reference for a non-trivial algorithm; a non-trivial _decision_ or constraint — _why_ it's this way, including footgun/ordering caveats that have a real reason. The bar is _why_, never _what_. Strip narrating comments opportunistically in files you're already editing.

## Architecture quick reference

- **`bin/nano-bench.js`** — benchmarks multiple functions, compares them with bootstrap CI and significance tests, outputs a styled table. `--json` writes a results file; `--histogram` draws a per-function distribution chart; `--correction` picks the post-hoc multiple-comparison method; `--smoke` runs each function once to validate the module, then exits (non-zero on failure).
- **`bin/nano-bench-io.js`** — benchmarks slow (ms-scale) functions one call per run, no batching: p90/p99 tail percentiles, modified-z outlier notes (caching vs interference), stop policies (`--min-runs`+`--budget` default, `-r` fixed, `--stable` CI-width adaptive), optional module-level `prepare()`/`teardown()` named exports run untimed around every run. `-c`/`--command` benchmarks shell commands instead (whole processes; `--prepare <cmd>` untimed before each run; a run fails on non-zero exit _or_ a fatal signal). `-M`/`--metrics` collects per-run system metrics (module mode: rusage deltas, cross-runtime; command mode: Linux `/proc` polling of the command's process tree, wrapper shell excluded; degrades with a note). Shares the module format, significance tests, histograms, `--json`, and `--smoke` with `nano-bench`.
- **`bin/nano-watch.js`** — continuously benchmarks a single function in streaming mode, showing live stats and memory usage.
- **`bin/nano-bench-compare.js`** — reads results JSON, recomputes significance from the saved samples, and renders view/compare tables with an environment-diff banner; no benchmarking. Pairs same-named series across files (default) or pools all series with `--pooled`. Renders persisted per-run system metrics side by side when files carry them.
- **`src/bench/runner.js`** — core benchmark engine: `findLevel`, `benchmark`, `benchmarkSeries`, `measure`, `Stats`. The orchestrating functions (`findLevel`, `benchmarkSeries`, `benchmarkSeriesPar`, `measure`, `measurePar`) accept an `observe: boolean | string` option that emits User Timing marks at phase boundaries (`nano-bench/<label>/<phase>`).
- **`src/bench/compare.js`** — high-level `compare()` that measures multiple functions and runs significance tests.
- **`src/bench/significance.js`** — `computeSignificance` (dispatches Mann-Whitney for 2 series, Kruskal-Wallis for 3+) and `significanceMatrix`.
- **`src/bench/pair-series.js`** — `planComparison`: partition compared series into paired-by-name blocks, or one pooled omnibus.
- **`src/bench/macro-runner.js`** — `collectMacro`: per-run collection (one awaited call per sample) with warmup discard, per-run `prepare`/`teardown`, and the three stop policies.
- **`src/bench/command-runner.js`** — `runCommand` (shell spawn, output discarded, rejects on non-zero exit or signal, optional `/proc` metrics polling) + `commandFunctions` (adapts commands to benchmark functions for `collectMacro`).
- **`src/bench/metrics.js`** + **`src/bench/proc-metrics.js`** — per-run system metrics: `rusageDelta` over `process.resourceUsage()` (portable) and Linux `/proc/[pid]/{io,status}` readings for spawned children.
- **`src/bench/outlier-notes.js`** — modified-z slow-side outliers classified as caching (first runs) vs interference (scattered).
- **`src/bench/histogram.js`** + **`src/bench/render/`** — sample binning (`computeHistograms`, `binCount`) and the renderers: `summary-table.js`, `significance-table.js`, `histogram-chart.js`.
- **`src/bench/results/`** — JSON results I/O: `build.js` (schema v1 object), `load.js` (read + validate), `environment.js` (`captureEnvironment` / `diffEnvironments`).
- **`src/stats.js`** — batch statistics: `mean`, `variance`, `stdDev`, `skewness`, `kurtosis`, `bootstrap`, `getWeightedValue`, `exactSummary`, `bootstrapSummary`.
- **`src/stream-stats.js`** — `StatCounter` class for online/streaming mean, variance, skewness, kurtosis.
- **`src/stream-median.js`** — `MedianCounter` class for approximate streaming median.
- **`src/significance/`** — `mwtest` (Mann-Whitney U), `kwtest` (Kruskal-Wallis H + Conover-Iman pairwise post-hoc), `correction` (Holm/Bonferroni FWER control over the post-hoc pairs), `kstest` (Kolmogorov-Smirnov, library-only).
- **`src/stats/`** — low-level math: distributions (normal, beta, chi-squared, z), PPF functions, ranking, error function, quantiles (R-7), MAD / modified z-score.
- **`src/utils/`** — helpers: binary search, Runge-Kutta solver, `mulberry32` PRNG (seeded bootstrap), `bodyHash` (`sha256(fn.toString())`).

## Dependencies

- **`commander`** — CLI argument parsing for all four binaries.
- **`console-toolkit`** — styled terminal output, tables, charts, ANSI sequences.
- **`emoji-regex`** + **`get-east-asian-width`** — let `console-toolkit` measure wide-glyph widths faithfully (emoji markers 🐇/🐢, CJK/fullwidth names) so table cells align; without them every wide glyph would measure as 1 column.
- **Dev only:** `tape-six`, `tape-six-proc` for testing; `prettier` for formatting; `typescript` + `@types/node` for the `js-check` step.

## Verification commands

- `npm test` — run all automated tests (tape-six)
- `node tests/test-<name>.js` — run a single test file directly
- `npm run test:bun` — run tests with Bun
- `npm run test:deno` — run tests with Deno
- `npm run lint` — check formatting with Prettier
- `npm run lint:fix` — fix formatting with Prettier
- `npm run js-check` — type-check the JS sources with `tsc` (`checkJs`, no emit)

## File layout

- CLI binaries: `bin/nano-bench.js`, `bin/nano-bench-io.js`, `bin/nano-watch.js`, `bin/nano-bench-compare.js`
- Internal source: `src/` (stats, significance, bench runner, streaming counters, utils)
- Tests: `tests/test-*.js`
- Example benchmarks: `bench/bench-*.js`, `bench/watch-*.js`
- AI coding skills: `skills/write-bench/`, `skills/write-watch/`
- Wiki docs: `wiki/` (git submodule)

## When reading the codebase

- Start with `ARCHITECTURE.md` for the module map and dependency graph.
- The `bin/` scripts are the entry points — read them to understand the full pipeline.
- Wiki markdown files in `wiki/` contain detailed usage docs and concepts.
- `bench/` contains example benchmark files showing the expected input format.

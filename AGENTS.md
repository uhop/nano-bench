# nano-benchmark — AI Agent Rules

## Project identity

nano-benchmark is an ESM JavaScript package providing command-line utilities (`nano-bench`, `nano-watch`) for micro-benchmarking code with proper nonparametric statistics and significance testing. Node.js 20+, Bun, Deno. The `src/` modules (stats, significance tests, streaming counters) are internal — the user-facing surface is the two CLI tools in `bin/`.

## Critical rules

- **ESM-only.** All imports must use `.js` extensions: `import median from './median.js'`.
- **No build step.** Source JS in `src/` and CLI scripts in `bin/` are shipped directly. Do not create build scripts or compiled output.
- **No TypeScript.** No `.ts` files, no `.d.ts` files. This is a pure JS project.
- **Do not modify or delete test expectations** without understanding why they changed.
- **Do not add comments or remove comments** unless explicitly asked.
- **CLI-only project.** The two binaries (`bin/nano-bench.js`, `bin/nano-watch.js`) are the user-facing interface. The `src/` modules are internal implementation details.

## Code style

- Prettier: 100 char width, single quotes, no bracket spacing, no trailing commas, arrow parens "avoid".
- 2-space indentation (`.editorconfig`).
- Imports at top of file. No dynamic imports unless necessary.

## Architecture quick reference

- **`bin/nano-bench.js`** — benchmarks multiple functions, compares them with bootstrap CI and significance tests, outputs a styled table.
- **`bin/nano-watch.js`** — continuously benchmarks a single function in streaming mode, showing live stats and memory usage.
- **`src/bench/runner.js`** — core benchmark engine: `findLevel`, `benchmark`, `benchmarkSeries`, `measure`, `Stats`.
- **`src/bench/compare.js`** — high-level `compare()` that measures multiple functions and runs significance tests.
- **`src/stats.js`** — batch statistics: `mean`, `variance`, `stdDev`, `skewness`, `kurtosis`, `bootstrap`, `getWeightedValue`.
- **`src/stream-stats.js`** — `StatCounter` class for online/streaming mean, variance, skewness, kurtosis.
- **`src/stream-median.js`** — `MedianCounter` class for approximate streaming median.
- **`src/significance/`** — `mwtest` (Mann-Whitney U), `kwtest` (Kruskal-Wallis), `kstest` (Kolmogorov-Smirnov).
- **`src/stats/`** — low-level math: distributions (normal, beta, chi-squared, z), PPF functions, ranking, error function.
- **`src/utils/`** — helpers: binary search, Runge-Kutta solver.

## Dependencies

- **`commander`** — CLI argument parsing for both binaries.
- **`console-toolkit`** — styled terminal output, tables, ANSI sequences.
- **Dev only:** `tape-six`, `tape-six-proc` for testing.

## Verification commands

- `npm test` — run all automated tests (tape-six)
- `node tests/test-<name>.js` — run a single test file directly
- `npm run test:bun` — run tests with Bun
- `npm run test:deno` — run tests with Deno

## File layout

- CLI binaries: `bin/nano-bench.js`, `bin/nano-watch.js`
- Internal source: `src/` (stats, significance, bench runner, streaming counters, utils)
- Tests: `tests/test-*.js`
- Manual tests: `manual-tests/test-*.js`
- Example benchmarks: `bench/bench-*.js`, `bench/watch-*.js`
- Wiki docs: `wiki/` (git submodule)

## When reading the codebase

- Start with `ARCHITECTURE.md` for the module map and dependency graph.
- The `bin/` scripts are the entry points — read them to understand the full pipeline.
- Wiki markdown files in `wiki/` contain detailed usage docs and concepts.
- `bench/` contains example benchmark files showing the expected input format.

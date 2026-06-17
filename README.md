# nano-benchmark [![NPM version][npm-img]][npm-url]

[npm-img]: https://img.shields.io/npm/v/nano-benchmark.svg
[npm-url]: https://npmjs.org/package/nano-benchmark

`nano-benchmark` provides command-line utilities for micro-benchmarking code
with nonparametric statistics and significance testing.

Two utilities are available:

- `nano-watch` &mdash; continuously benchmarks a single function, showing live statistics
  and memory usage.
- `nano-bench` &mdash; benchmarks and compares multiple functions, calculating confidence
  intervals and statistical significance.

Designed for performance tuning of small, fast code snippets used in tight loops.

## Visual samples

### `nano-watch`

![nano-watch](https://github.com/uhop/nano-bench/wiki/images/nano-watch-sample.png)

### `nano-bench`

![nano-bench](https://github.com/uhop/nano-bench/wiki/images/nano-bench-sample.png)

## Installation

```bash
npm install nano-benchmark
```

### Deno and Bun support

Use `--self` to get the script path for [Deno](https://deno.land/) and [Bun](https://bun.sh/):

```bash
npx nano-bench benchmark.js
bun `npx nano-bench --self` benchmark.js
deno run --allow-read --allow-hrtime `npx nano-bench --self` benchmark.js
deno run -A `npx nano-bench --self` benchmark.js
node `npx nano-bench --self` benchmark.js
```

For Deno, `--allow-read` is required and `--allow-hrtime` is recommended.
Use `-A` for convenience in safe environments.

## Documentation

With a global install (`npm install -g nano-benchmark`) both utilities are available by name.
Otherwise, prefix with `npx` (e.g., `npx nano-watch`) or add them to your `package.json` scripts.
Run with `--help` for details on arguments.

Both utilities import a module and benchmark its (default) export.
`nano-bench` expects an object whose properties are the functions to compare.
`nano-watch` accepts the same format or a single function.

Name one or more methods after the file to benchmark just those. A single method
runs as a baseline — its statistics are reported with no significance test (there
is nothing to compare it against in isolation).

Example module for `nano-bench` (`bench-strings-concat.js`):

```js
export default {
  strings: n => {
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      const x = a + '-' + b;
    }
  },
  backticks: n => {
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      const x = `${a}-${b}`;
    }
  },
  join: n => {
    const a = 'a',
      b = 'b';
    for (let i = 0; i < n; ++i) {
      const x = [a, b].join('-');
    }
  }
};
```

Usage:

```bash
npx nano-bench bench-strings-concat.js                 # compare all three
npx nano-bench bench-strings-concat.js strings join    # compare just these two
npx nano-bench bench-strings-concat.js strings         # baseline one (no significance test)
npx nano-watch bench-strings-concat.js backticks
```

See [wiki](https://github.com/uhop/nano-bench/wiki) for more details.

## User Timing API integration

Pass `-o` / `--observe` to `nano-bench` to emit
[User Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing)
marks at calibration and sampling phase boundaries. Marks are written to the
standard performance timeline and are observable via `PerformanceObserver` or
visible in DevTools / `node --inspect` traces &mdash; useful for correlating
benchmark variability with GC pauses, V8 optimization events, etc.

Mark / measure names follow `nano-bench/<function-name>/<phase>`, where phase is
`find-level` (calibration) or `series` / `series-par` (sample collection).

```js
import {PerformanceObserver} from 'node:perf_hooks';

const obs = new PerformanceObserver(list => {
  for (const e of list.getEntries()) {
    console.log(e.name, e.duration.toFixed(2), 'ms');
  }
});
obs.observe({entryTypes: ['measure']});
```

Marks have a small fixed cost per phase (no per-sample overhead), so leaving
`--observe` on does not affect measurement accuracy. Default is off.

Library users can opt in directly: `findLevel` / `benchmarkSeries` /
`benchmarkSeriesPar` / `measure` / `measurePar` all accept an `observe` option
(`boolean | string`) &mdash; `false` / unset for no marks, `true` for the default
label, or a string for a custom label.

## AI agents and contributing

AI agents and AI-assisted developers: read [AGENTS.md](./AGENTS.md) first for project rules
and conventions.

Other useful files:

- [ARCHITECTURE.md](./ARCHITECTURE.md) &mdash; module map, dependency graph, how benchmarking works.
- [CONTRIBUTING.md](./CONTRIBUTING.md) &mdash; development workflow and coding conventions.
- [llms.txt](./llms.txt) &mdash; project summary for LLMs.
- [llms-full.txt](./llms-full.txt) &mdash; detailed CLI reference for LLMs.

## License

BSD 3-Clause License

## Release history

- 1.0.16: _Added User Timing API integration: `--observe` flag._
- 1.0.15: _Updated dependencies._
- 1.0.14: _Fixed Kruskal-Wallis post-hoc (Conover-Iman) pairwise comparison bug: corrected rank variance computation and critical value distribution. Added regression test._
- 1.0.13: _Improved CLI help texts and documentation for brevity and clarity._
- 1.0.12: _Added AI coding skills for writing benchmark files (write-bench, write-watch), shipped via npm. Added findLevel() tests. Expanded test suite._
- 1.0.11: _Fixed MedianCounter.clone() bug, expanded test suite (204 tests), added CodeQL workflow, multi-OS CI matrix, and new Windsurf workflows._
- 1.0.10: _Added Prettier lint scripts, GitHub issue templates, Copilot instructions, and Windsurf workflows._
- 1.0.9: _Updated dependencies._
- 1.0.8: _Updated dependencies._
- 1.0.7: _Updated dependencies._
- 1.0.6: _Updated dependencies._
- 1.0.5: _Updated dependencies._
- 1.0.4: _Updated dependencies + added more tests._
- 1.0.3: _Updated dependencies._
- 1.0.2: _Added the `--self` option._
- 1.0.1: _Added "self" argument to utilities so it can be used with Deno, Bun, etc._
- 1.0.0: _Initial release._

The full release notes are in the wiki: [Release notes](https://github.com/uhop/nano-bench/wiki/Release-notes).

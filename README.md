# nano-benchmark [![NPM version][npm-img]][npm-url]

[npm-img]: https://img.shields.io/npm/v/nano-benchmark.svg
[npm-url]: https://npmjs.org/package/nano-benchmark

`nano-benchmark` provides command-line utilities for micro-benchmarking code
with nonparametric statistics and significance testing.

Five utilities are available:

- `nano-watch` &mdash; continuously benchmarks a single function, showing live statistics
  and memory usage.
- `nano-bench` &mdash; benchmarks and compares multiple functions, calculating confidence
  intervals and statistical significance.
- `nano-bench-io` &mdash; benchmarks slow (ms-scale) functions one call per run &mdash;
  distributions and tail percentiles (p90/p99), no batching.
- `nano-bench-compare` &mdash; views and compares saved results (JSON), recomputing
  significance from the raw samples &mdash; for before/after comparisons across runs.
- `nano-bench-view` &mdash; serves a browser viewer for saved results: distribution plots,
  summary, and significance, with folder listings for browsing a remote machine's files. The
  same page runs bench files in a browser.
- `nano-bench-playwright` and `nano-bench-puppeteer` &mdash; run a bench file in browsers from
  the command line and print the results as `nano-bench` does.

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

### Smoke-testing a module

Before committing to a long collection run, validate the module with `--smoke`:
each selected function is called once (`n = 1`) and reported ok/failed with a
rough duration. The exit code is non-zero if any function throws or rejects,
and the tool exits promptly even if the module holds live handles (servers,
watchers):

```bash
npx nano-bench bench-strings-concat.js --smoke
```

### Statistical significance and correction

For two functions `nano-bench` uses the Mann-Whitney U test; for three or more, the
Kruskal-Wallis H test with a Conover-Iman pairwise post-hoc. Because running many
pairwise comparisons inflates the chance of a false "significant", the post-hoc is
corrected for multiple comparisons by default. Choose the method with
`--correction <none|holm|bonferroni>` (default `holm`, which is uniformly more
powerful than Bonferroni); `none` reproduces an uncorrected post-hoc. For two
functions the effect size is reported next to the verdict (Cliff's &delta; with
a magnitude label, and how often the faster wins a random pair of runs) &mdash;
significance says a difference exists, the effect size says how much. Add `-v` /
`--verbose` to see the test statistic, critical value, and per-comparison &alpha;.

### Distribution histograms

A median and confidence interval can't show multimodality, skew, or outlier tails
(GC pauses, JIT warmup). Pass `--histogram` to draw each function's sample
distribution inline in the terminal, on a shared scale so the shapes are comparable:

```bash
npx nano-bench bench-strings-concat.js --histogram                 # vertical columns
npx nano-bench bench-strings-concat.js --histogram --chart bars    # horizontal bars
npx nano-bench bench-strings-concat.js --histogram --bins 24       # override bin count
```

Use `--no-emoji` for ASCII markers on terminals with unreliable emoji widths.

Without `--histogram`, `nano-bench` still runs a dip test on every function and prints a
warning when its samples look multimodal. That usually means some batches paid a garbage
collection or a slow path and others didn't, so the median describes only the fast clump.
Measure such code with `nano-bench-io`, which times one call per run and reports the tail.

A second warning names a common cause: another program competing for the CPU. For each
sample of a synchronous function, `nano-bench` compares the CPU time its thread used with the
elapsed time; a sample that got less than 90% of it was preempted. When 10% or more of a
function's samples were, the run says so, and the numbers read slow and noisy, often with a
multimodal warning too. Rerun when the machine is quiet. It can't see slowdowns that don't
take the CPU away, such as a busy sibling hyperthread.

Those slowdowns are large. On a 2-core, 4-thread laptop CPU (Intel i3-10110U) with Node.js 26,
two concurrent copies of a CPU-bound benchmark ran 8.5% slower in every run, and the warning
stayed quiet in all of them. Four copies slowed both a CPU-bound and a memory-bound benchmark by
25&ndash;30%, and the warning fired in a quarter to a half of those runs. Run one benchmark at a
time. For the method and the numbers, see
[Parallel benchmark processes](./dev-docs/parallel-processes.md).

Functions measured in one run also share JIT and heap state. To confirm a small difference,
benchmark each variant in its own process and compare the saved runs with
`nano-bench-compare`.

### Measuring in separate processes

Functions measured in one run share a process: its JIT decisions, code layout, and heap, so
one function can change what another measures. In `bench/bench-substrings.js`, the variants
that allocate triggered garbage collections that flattened the shared input string, and
`using index` measured 20% faster beside them than alone. `--isolate` measures each function
in its own process, and `--repeat N` runs N processes per function to show how much a result
varies between processes of the same code (under 1% for that function once its input was
flat):

```bash
npx nano-bench bench-strings-concat.js --isolate              # one process per function
npx nano-bench bench-strings-concat.js --isolate --repeat 5   # five per function
```

The parent calibrates once and gives every process the same batch size, and each process
drops its first sample, which pays for JIT warmup. With `--repeat` above 1, the significance
test compares the per-process medians, and a line reports which function was fastest in each
round of processes. `--order` sets the order the processes start in (interleaved by default).
Each extra process costs roughly its startup (about 0.15 seconds on Node.js) plus its samples.

### Saving and comparing results

Write a run to a JSON file with `--json`, then view or compare saved runs with
`nano-bench-compare`. Comparison **recomputes** significance from the raw samples (no
re-measuring), pairs same-named functions across files by default, and warns when the
runs' environments differ:

```bash
npx nano-bench bench-strings-concat.js --json before.json --label before
# ...change the code...
npx nano-bench bench-strings-concat.js --json after.json --label after

npx nano-bench-compare before.json after.json            # before/after, paired by name
npx nano-bench-compare before.json after.json --pooled   # one omnibus over all series
npx nano-bench-compare after.json                         # just re-render a saved run
```

The seed for the bootstrap is always recorded, so a recompare reproduces the original
intervals exactly. Add `--host` (or `--host-name <name>`) to stamp the machine into the
JSON.

### Viewing results in a browser

`nano-bench-view` starts a local web server over a folder and opens a viewer for the results
JSON files under it. The viewer plots each function's sample distribution next to the summary
and significance tables. It computes the same numbers as `nano-bench-compare`, from the same
saved samples. The server uses [tape-six](https://www.npmjs.com/package/tape-six), an optional
peer dependency, so install it first:

```bash
npm install --save-dev tape-six

npx nano-bench-view                     # list the results under the current folder
npx nano-bench-view after.json          # print a URL that opens this file directly
npx nano-bench-view --host 0.0.0.0      # listen on every interface, not only localhost
```

> [!WARNING]
> The server is a development tool. It isn't hardened and isn't meant for general web serving.
> You are responsible for its security, and outside `localhost` you are on your own. To reach
> a remote machine, prefer an SSH tunnel to the default `localhost` binding over `--host`.

The viewer lists result files found on the server, so it works when the results live on
another machine: run the command there, forward its port over SSH (for example,
`ssh -L 3000:localhost:3000 HOST`), then open the printed URL in a local browser. Folders
without an `index.html` file show a directory listing with links into the viewer. The page
follows the system's light or dark theme, and a switch overrides it.

### Running benchmarks in a browser

The same server runs bench files in the browser. The start page lists the bench files under the
root (`bench/bench-*.js` and `*.bench.js`), and **Open a bench file…** runs a local one. Each
function runs in its own iframe, one sample of each function per round, as in `nano-bench`. The
results are saved to `nano-bench-results/<bench>-<browser>.json` under the root and open in the
viewer, so `nano-bench-compare` can read them too. The page is cross-origin isolated, which
gives `performance.now()` a 5&ndash;20&nbsp;µs step instead of 0.1&ndash;1&nbsp;ms. Browsers grant
isolation only over HTTPS or `localhost`, so open a remote server through an SSH tunnel; otherwise
the run still works, and the results carry a warning with the timer step.

Add `ms` and `samples` to the run URL to change the sample length and count, for example
`/--nano-bench/web-app/?run=bench/bench-sort.js&samples=50`. Keep the tab visible: the runner
pauses while the tab is hidden and records the pauses. A local file can't import other local
files, so bench it from the server when it has relative imports.

To run the same page from the command line, use `nano-bench-playwright` or
`nano-bench-puppeteer`. Each starts the server on `localhost`, runs the file in one browser after
another, prints each browser's tables, and exits with a non-zero status if a browser fails. The
driver is an optional peer dependency, so install it and its browsers first:

```bash
npm install --save-dev tape-six playwright
npx playwright install chromium firefox webkit

npx nano-bench-playwright bench/bench-sort.js                   # Chromium
npx nano-bench-playwright bench/bench-sort.js -b firefox,webkit # one after another
npx nano-bench-puppeteer bench/bench-sort.js -b chrome,firefox  # with Puppeteer
```

Playwright's WebKit is a build of its own, separate from Safari and Epiphany. To measure those
engines, open the page in them.

### Benchmarking slow functions

Batching is right for nanosecond loops but erases the run-to-run distribution of
slow operations. `nano-bench-io` runs each function once per run (`n = 1`) and
reports p90/p99 tails alongside the median and its confidence interval &mdash; for
I/O-bound and other ms-scale code where the tail is the story:

```bash
npx nano-bench-io io-bench.js                # at least 10 runs and 5 s per function
npx nano-bench-io io-bench.js -r 50          # exactly 50 runs
npx nano-bench-io io-bench.js --stable 5     # run until the median CI is within 5%
```

The module format is the same. Optional `prepare()` / `teardown()` named exports
run untimed around every run. Warmup is auto-detected and discarded with a note
(`--warmup N` pins it, `--warmup 0` keeps everything). Slow outliers are
flagged, distinguishing caching (slow first run) from interference (scattered
slow runs).

It also benchmarks whole commands (`-c`), with `--prepare <cmd>` running untimed
before every run &mdash; like hyperfine, but with nonparametric statistics and
tail percentiles:

```bash
npx nano-bench-io -c 'node script.js' 'bun script.js'
```

Add `-M` / `--metrics` for per-run system metrics: CPU, page faults, and context
switches for module functions (any runtime); peak RSS, I/O bytes, and syscall
counts for commands (Linux).

Full documentation is in the **[wiki](https://github.com/uhop/nano-bench/wiki)** &mdash; browse the [index](https://github.com/uhop/nano-bench/wiki/Home), or [search it](https://uhop.github.io/wiki-search/app/?wiki=uhop/nano-bench) by name.

## User Timing API integration

Pass `-o` / `--observe` to `nano-bench` to emit
[User Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing)
marks at calibration and sampling phase boundaries. Marks are written to the
standard performance timeline and are observable via `PerformanceObserver` or
visible in DevTools / `node --inspect` traces &mdash; useful for correlating
benchmark variability with GC pauses, V8 optimization events, etc.

Mark / measure names follow `nano-bench/<function-name>/<phase>`, where phase is
`find-level` (calibration) or `rounds` / `series` / `series-par` (sample collection; `rounds`, the
interleaved default, uses the label `all`).

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
`benchmarkSeriesPar` / `benchmarkRounds` / `measure` / `measurePar` all accept an `observe` option
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

- 1.2.0: _Added `nano-bench-io` for slow (ms-scale) functions and whole commands: per-run collection with p90/p99 tails, system metrics, warmup auto-detection, and multimodal cluster splitting. Added the `--smoke` pre-flight and effect sizes (Cliff's &delta;). Bugfixes._
- 1.1.0: _Added saving to JSON, `nano-bench-compare` for comparing runs distribution histograms, and Holm/Bonferroni multiple-comparison. Also per-function selection and a `findLevel` termination fix._
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

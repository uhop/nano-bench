---
name: write-bench
description: Write a benchmark file for nano-bench (comparing multiple functions). Use when asked to create a benchmark, compare implementations, or measure performance of code variants.
---

# Writing a nano-bench Benchmark File

nano-bench compares multiple implementations of the same operation using nonparametric statistics and significance testing.

## File structure

A benchmark file is an ESM module that default-exports an object of functions. Each function takes `n` (iteration count) and runs the measured code in a `for` loop of `n` iterations.

```js
export default {
  variantA: n => {
    for (let i = 0; i < n; ++i) {
      // code under test
    }
  },
  variantB: n => {
    for (let i = 0; i < n; ++i) {
      // alternative implementation
    }
  }
};
```

## Rules

1. **ESM only.** Use `export default { ... }` — no CommonJS.
2. **Every function takes `n`.** The loop `for (let i = 0; i < n; ++i)` is mandatory — it amortizes function-call overhead, which is critical for micro-benchmarks.
3. **Keep variants equivalent.** Each function must perform the same logical work, in the same shape, so the comparison is fair.
4. **One question per file.** Every variant in a file must differ from the others in exactly one respect, and only the within-file difference is a measurement. To compare along another axis, write another file (see § One question per file).
5. **Move setup outside the loop.** Declare constants and prepare data before the `for` loop (or at module scope) so setup cost is not measured.
6. **File naming convention:** `bench/bench-<descriptive-name>.js`.
7. **Follow project code style:** single quotes, 2-space indent, no trailing commas, arrow parens avoided.

## Preventing dead-code elimination

If the JS engine might optimize away the result, keep it alive:

- Push into an array and return it.
- Assign to a variable declared outside the loop.

```js
export default {
  variantA: n => {
    const x = [];
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(someComputation());
    }
    return x;
  },
  variantB: n => {
    const x = [];
    for (let i = 0; i < n; ++i) {
      x.pop();
      x.push(otherComputation());
    }
    return x;
  }
};
```

Use the `x.pop(); x.push(...)` pattern to keep the array at length ≤ 1 while still preventing elimination.

**Returning the result is not enough when the input is constant.** V8 hoists loop-invariant
work out of the loop even when the result is accumulated and returned: summing reads of one
constant object (`t += o.a + o.b`) measured 528 ps per iteration, one or two CPU cycles, because only
`t += k` stayed in the loop; reading from 1,000 distinct objects measured 4.23 ns. Vary the input per iteration as well, for example by reading from
an array of distinct objects with `data[i % data.length]`. A returned constant is still a
constant. If a variant measures at one or two cycles per iteration, suspect this first.

**Build string inputs flat.** A string built with `+=` or `concat` is a rope in V8, and
indexing into a rope (`s[i]`, `charCodeAt`) is slower until something flattens it, usually a
garbage collection. Then a variant that allocates speeds up the variants measured beside it:
`bench/bench-substrings.js` measured `using index` at 497–527 ns next to two allocating
variants, and at 637–643 ns alone in its own process (`--isolate`), where no collection
flattened its input. Flatten such inputs once at module scope, for example with
`s = JSON.parse(JSON.stringify(s))`; after that both measured 501–527 ns.

## Async functions

Benchmark functions can be async. The tool detects thenables and measures time until resolution.

```js
export default {
  asyncVariantA: async n => {
    for (let i = 0; i < n; ++i) {
      await someAsyncWork();
    }
  },
  asyncVariantB: async n => {
    for (let i = 0; i < n; ++i) {
      await otherAsyncWork();
    }
  }
};
```

Samples are collected one after another by default, which is what you want for comparing implementations. `--parallel` (`-p`) is for a different question: how an asynchronous operation behaves with other operations in flight. It changes what is measured, so don't use it to finish a run faster.

## Named exports

By default the tool uses the `default` export. To use a named export:

```js
export const myBench = {
  a: n => {
    // ...
  },
  b: n => {
    // ...
  }
};
```

Run with: `npx nano-bench -e myBench bench/bench-file.js`

## Module-level initialization

Code that should run once (not measured) goes at module scope:

```js
const data = Array.from({length: 1000}, () => Math.random());

export default {
  sort: n => {
    for (let i = 0; i < n; ++i) {
      data.slice().sort((a, b) => a - b);
    }
  },
  sortReverse: n => {
    for (let i = 0; i < n; ++i) {
      data.slice().sort((a, b) => b - a);
    }
  }
};
```

## Running

```bash
npx nano-bench bench/bench-<name>.js                           # all functions
npx nano-bench bench/bench-<name>.js fnA fnB                   # only these two
npx nano-bench bench/bench-<name>.js fnA                       # baseline: one function, no significance test
npx nano-bench -s 200 -b 2000 -a 0.01 bench/bench-<name>.js    # more samples, tighter CI
npx nano-bench -i 10000 bench/bench-<name>.js                  # fixed iteration count (skip calibration)

# Alternative runtimes
bun `npx nano-bench --self` bench/bench-<name>.js
deno run -A `npx nano-bench --self` bench/bench-<name>.js
```

Name functions after the file to run a subset; omit them to run all. One name is
a **baseline** — its stats are reported with no significance test.

## Choosing options

| Goal                         | Option                                          | Notes                                                                   |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Longer/shorter measurement   | `-m, --ms` (default 50)                         | Time per sample; the batch size is auto-found to fill it.               |
| Fixed iteration count        | `-i, --iterations`                              | Overrides `--ms`, skips calibration. Use for deterministic batch sizes. |
| More precision               | `-s, --samples` (100), `-b, --bootstrap` (1000) | More samples tighten the test; more bootstrap resamples smooth the CI.  |
| Stricter/looser significance | `-a, --alpha` (0.05)                            | 0.01 = 99% CI and a stricter test.                                      |
| Sample order                 | `--order` (interleaved)                         | `sequential` measures each function in turn; interleaved is fairer.     |
| Process isolation            | `--isolate`, `--repeat N`                       | Each function in its own processes; N > 1 tests per-process medians.    |
| Garbage collection           | `--gc once` or `--gc each`                      | A forced collection before sampling or before every sample, untimed.    |
| Async under concurrency      | `-p, --parallel`                                | Starts all samples at once; measures a different thing.                 |
| Multiple-comparison control  | `--correction` (holm)                           | See below.                                                              |
| See the test internals       | `-v, --verbose`                                 | Prints statistic, critical value, per-comparison α.                     |
| Inspect distribution shape   | `--histogram`                                   | See below.                                                              |
| Save / compare runs          | `--json`, then `nano-bench-compare`             | See below.                                                              |
| Pin reproducibility          | `--seed <n>`                                    | Else a seed is auto-generated and recorded.                             |

## One question per file

Don't put every variant you can think of into one file. Write one file per question, each
with variants that differ in exactly one respect, and run them all with a script:

```bash
#!/usr/bin/env bash
# bench/run-all.sh — run every benchmark in its own process.
#   bench/run-all.sh            # one pass
#   bench/run-all.sh 5          # five passes: confirm the directions hold
#   bench/run-all.sh 1 --json   # extra flags go to nano-bench
set -u
cd "$(dirname "$0")/.."
repeats=${1:-1}
[ $# -gt 0 ] && shift
status=0
for pass in $(seq 1 "$repeats"); do
  [ "$repeats" -gt 1 ] && printf '\n===== pass %s of %s =====\n' "$pass" "$repeats"
  for file in bench/bench-*.js; do
    printf '\n----- %s -----\n' "$(basename "$file")"
    npx nano-bench "$file" "$@" || status=1
  done
done
exit $status
```

Wire it as a `bench` script in `package.json` (`"bench": "bench/run-all.sh"`). Separate
processes matter: significance is measured within one process, so a repeat count over
fresh processes is what checks that a direction survives.

## What not to compare

A significance test answers "do these two series differ", never "should these two be
compared". Variants that differ in more than one respect (operand count and structure,
data size and algorithm) differ significantly for reasons the file's name doesn't say.

- **An impossible result means the harness is broken.** If a variant that does strictly more
  work measures faster (a call beating the same code inlined, say), stop and fix the file
  before reading any other number from it.
- **Don't lower `-s` or `-m` below the defaults** to fit more runs into less time. Shortened
  runs produced swings of 22–34% and an impossible result in the measurement arc behind
  this section; the defaults agreed with independent measurements.

## Reading the significance output

With ≥2 functions, a `Significance:` line names the test, α, and (for 3+) the
post-hoc method and correction:

- **2 functions** → Mann-Whitney U (two-sided, tie-corrected).
- **3+ functions** → Kruskal-Wallis H omnibus; if significant, a Conover-Iman
  pairwise post-hoc fills the N×N matrix showing which pairs differ. Fastest is
  marked 🐇, slowest 🐢 (`F`/`S` with `--no-emoji`).

**Significance is within one process.** JIT decisions, code layout, and heap state are
shared by every variant in a run and differ between runs, and the test can't see that. Before
trusting a small difference, measure each function in its own processes with
`--isolate --repeat 5`: the test then compares per-process medians, and a line reports which
function was fastest in each round of processes. A direction that flips between processes is
not a result.

**A multimodal warning** (`⚠ name: distribution looks multimodal`) means the samples form
two or more clumps, usually because some batches paid a garbage collection or a slow path
and others didn't. The median then describes the fast clump only. Measure such code with
`nano-bench-io`, which times one call per run and reports p90 and p99.

**A contention warning** (`⚠ name: N of M samples were preempted`) means another program
took the CPU during the run: those samples got less than 90% of the CPU while they ran. The
numbers are slow and noisy, and multimodal warnings often come with it. Don't read the
result; rerun when the machine is quiet.

## Multiple-comparison correction (`--correction`)

Comparing many functions runs many pairwise tests, which inflates the chance of a
false "significant". The post-hoc is corrected by default:

- `holm` (**default**) — keep it for normal use; uniformly more powerful than Bonferroni.
- `bonferroni` — only if the user explicitly wants the conservative/familiar name.
- `none` — only to reproduce an uncorrected post-hoc (e.g. matching an old run).

Don't disable correction to make a result "look significant" — that defeats its purpose.

## Distribution histograms (`--histogram`)

Use it when a median is surprising, or you suspect multimodality (fast/slow
paths), heavy skew, or outlier tails (GC/JIT). The median+CI line can't show shape;
the histogram can.

```bash
npx nano-bench bench/bench-<name>.js --histogram               # vertical columns (default)
npx nano-bench bench/bench-<name>.js --histogram --chart bars  # horizontal, side by side (good for many functions)
npx nano-bench bench/bench-<name>.js --histogram --bins 24     # override the auto bin count
```

Add `--no-emoji` on terminals with unreliable emoji widths.

## Before/after comparisons (`--json` + `nano-bench-compare`)

To measure whether a change actually helped, save a baseline, change the code, save
a new run, then compare — significance is **recomputed from the saved samples**, no
re-measuring:

```bash
npx nano-bench bench/bench-<name>.js --json before.json --label before
# ...edit the implementation...
npx nano-bench bench/bench-<name>.js --json after.json --label after

npx nano-bench-compare before.json after.json            # before/after, paired by name (default)
npx nano-bench-compare before.json after.json --pooled   # one k-sample omnibus over all series
npx nano-bench-compare after.json                         # just re-render a saved run
```

- **Paired by name (default)** — one before/after test per function name shared across
  the files. This is the right mode for "did `fnA` get faster?". Keep the same function
  **names** across runs so they pair up.
- **`--pooled`** — one omnibus over _all_ series at once. Use only when you want
  "which of these k series differ from which"; for a plain before/after it buries the
  meaningful comparison, so don't use it by default.
- The bootstrap seed is recorded in each file, so a recompare reproduces the original
  intervals exactly. `nano-bench-compare` warns if the runs' environments (CPU, runtime,
  OS) or the function bodies differ — heed it: a delta measured across machines may come from the
  environment instead of the code.
- Add `--host` / `--host-name <name>` to stamp the machine into the JSON (opt-in; the file
  is shareable).

## Complete example

```js
const isPalindromeSlice = s => {
  while (s.length > 1) {
    if (s[0] !== s[s.length - 1]) break;
    s = s.slice(1, -1);
  }
  return s.length <= 1;
};

const isPalindromeIndex = s => {
  let l = 0,
    r = s.length - 1;
  while (l < r) {
    if (s[l] !== s[r]) break;
    ++l;
    --r;
  }
  return l >= r;
};

const sample = 'abcba'.repeat(40);

export default {
  'using slice()': n => {
    for (let i = 0; i < n; ++i) {
      isPalindromeSlice(sample);
    }
  },
  'using index': n => {
    for (let i = 0; i < n; ++i) {
      isPalindromeIndex(sample);
    }
  }
};
```

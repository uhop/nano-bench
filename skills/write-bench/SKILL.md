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
3. **Keep variants equivalent.** Each function must perform the same logical work so the comparison is fair.
4. **Move setup outside the loop.** Declare constants and prepare data before the `for` loop (or at module scope) so setup cost is not measured.
5. **File naming convention:** `bench/bench-<descriptive-name>.js`.
6. **Follow project code style:** single quotes, 2-space indent, no trailing commas, arrow parens avoided.

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

Use `--parallel` (`-p`) when benchmarking async code to collect samples concurrently.

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
| Async benchmarks             | `-p, --parallel`                                | Collect samples concurrently.                                           |
| Multiple-comparison control  | `--correction` (holm)                           | See below.                                                              |
| See the test internals       | `-v, --verbose`                                 | Prints statistic, critical value, per-comparison α.                     |
| Inspect distribution shape   | `--histogram`                                   | See below.                                                              |
| Save / compare runs          | `--json`, then `nano-bench-compare`             | See below.                                                              |
| Pin reproducibility          | `--seed <n>`                                    | Else a seed is auto-generated and recorded.                             |

## Reading the significance output

With ≥2 functions, a `Significance:` line names the test, α, and (for 3+) the
post-hoc method and correction:

- **2 functions** → Mann-Whitney U (two-sided, tie-corrected).
- **3+ functions** → Kruskal-Wallis H omnibus; if significant, a Conover-Iman
  pairwise post-hoc fills the N×N matrix showing which pairs differ. Fastest is
  marked 🐇, slowest 🐢 (`F`/`S` with `--no-emoji`).

## Multiple-comparison correction (`--correction`)

Comparing many functions runs many pairwise tests, which inflates the chance of a
false "significant". The post-hoc is corrected by default:

- `holm` (**default**) — keep it for normal use; uniformly more powerful than Bonferroni.
- `bonferroni` — only if the user explicitly wants the conservative/familiar name.
- `none` — only to reproduce an uncorrected post-hoc (e.g. matching an old run).

Don't disable correction to make a result "look significant" — that defeats its purpose.

## Distribution histograms (`--histogram`)

Reach for this when a median is surprising, or you suspect multimodality (fast/slow
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
- **`--pooled`** — one omnibus over _all_ series at once. Use only when you genuinely want
  "which of these k series differ from which"; for a plain before/after it buries the
  meaningful comparison, so don't reach for it by default.
- The bootstrap seed is recorded in each file, so a recompare reproduces the original
  intervals exactly. `nano-bench-compare` warns if the runs' environments (CPU, runtime,
  OS) or the function bodies differ — heed it: a measured delta across machines may be the
  environment, not the code.
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

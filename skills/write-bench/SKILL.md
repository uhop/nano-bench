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
  a: n => { /* ... */ },
  b: n => { /* ... */ }
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
npx nano-bench bench/bench-<name>.js
npx nano-bench -s 200 -b 2000 -a 0.01 bench/bench-<name>.js   # more samples, tighter CI
npx nano-bench -i 10000 bench/bench-<name>.js                  # fixed iteration count

# Alternative runtimes
bun `npx nano-bench --self` bench/bench-<name>.js
deno run -A `npx nano-bench --self` bench/bench-<name>.js
```

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

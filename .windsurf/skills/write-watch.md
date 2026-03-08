---
description: Write a benchmark file for nano-watch (continuous single-function monitoring). Use when asked to create a watch benchmark, monitor performance over time, or check for memory leaks.
---

# Writing a nano-watch Benchmark File

nano-watch continuously benchmarks a single function, showing live streaming statistics (mean, median, stdDev, skewness, kurtosis) and memory usage. Useful for detecting performance regressions, memory leaks, and GC effects over time.

## File structure — single function

The simplest form is a module that default-exports a single function taking `n`:

```js
export default n => {
  for (let i = 0; i < n; ++i) {
    // code under test
  }
};
```

**File naming convention:** `bench/watch-<descriptive-name>.js`.

## File structure — method from an object

nano-watch can also use a nano-bench-style object export by specifying a method name on the command line:

```bash
npx nano-watch bench/bench-string-concat.js backticks
```

This selects the `backticks` function from the object export. No special file format needed — the same file works for both tools.

## Rules

1. **ESM only.** Use `export default` — no CommonJS.
2. **The function takes `n`.** The `for (let i = 0; i < n; ++i)` loop is mandatory — it amortizes call overhead.
3. **Move setup outside the loop.** Declare constants and prepare data before the loop or at module scope.
4. **Follow project code style:** single quotes, 2-space indent, no trailing commas, arrow parens avoided.

## Preventing dead-code elimination

Same pattern as nano-bench — keep the result alive:

```js
export default n => {
  const x = [];
  for (let i = 0; i < n; ++i) {
    x.pop();
    x.push(someComputation());
  }
  return x;
};
```

## Async functions

```js
export default async n => {
  for (let i = 0; i < n; ++i) {
    await someAsyncWork();
  }
};
```

## Named exports

Use `-e` to select a named export:

```js
export const myWatch = n => {
  for (let i = 0; i < n; ++i) {
    // code under test
  }
};
```

Run with: `npx nano-watch -e myWatch bench/watch-file.js`

## Module-level initialization

Code at module scope runs once and is not measured:

```js
const data = Array.from({length: 10000}, () => Math.random());

export default n => {
  for (let i = 0; i < n; ++i) {
    data.slice().sort((a, b) => a - b);
  }
};
```

## Running

```bash
npx nano-watch bench/watch-<name>.js                          # run indefinitely
npx nano-watch -i 50 bench/watch-<name>.js                    # stop after 50 iterations
npx nano-watch -m 1000 bench/watch-<name>.js                  # 1 second per measurement
npx nano-watch bench/bench-<name>.js methodName                # pick one function from object

# Alternative runtimes
bun `npx nano-watch --self` bench/watch-<name>.js
deno run -A `npx nano-watch --self` bench/watch-<name>.js
```

## Output

nano-watch displays a live-updating table with:

- **Stats row:** iteration count, last time, streaming mean, stdDev, median, skewness, kurtosis.
- **op/s row:** operations per second for time, mean, and median.
- **Memory row:** heapUsed, heapTotal, resident set size (rss).

All statistics use online/streaming algorithms (constant memory) — StatCounter (Welford's algorithm) for moments and MedianCounter (median-of-medians) for approximate median.

Press Ctrl+C to stop. If output is redirected to a file, use `--iterations` to limit the run.

## Complete example

```js
const cache = new Map();

const fibonacci = n => {
  if (n <= 1) return n;
  if (cache.has(n)) return cache.get(n);
  const result = fibonacci(n - 1) + fibonacci(n - 2);
  cache.set(n, result);
  return result;
};

export default n => {
  for (let i = 0; i < n; ++i) {
    cache.clear();
    fibonacci(30);
  }
};
```

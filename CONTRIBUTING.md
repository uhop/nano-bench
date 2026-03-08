# Contributing to nano-benchmark

## Prerequisites

- Node.js 20 or later
- npm

## Setup

```bash
git clone --recursive git@github.com:uhop/nano-bench
cd nano-bench
npm install
```

The `--recursive` flag is needed to clone the wiki submodule under `wiki/`.

## Project structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed module map and dependency graph.

- `bin/` — CLI entry points (`nano-bench`, `nano-watch`)
- `src/` — internal source (stats, significance, bench runner, streaming counters, utils)
- `tests/` — automated tests (`test-*.js`)
- `bench/` — example benchmark files
- `skills/` — AI coding skills (shipped via npm)
- `wiki/` — GitHub wiki (git submodule)

## Development workflow

### Running tests

```bash
npm test                                        # Run all automated tests
node tests/test-<name>.js                       # Run a single test file directly
npm run test:bun                                # Run with Bun
npm run test:deno                               # Run with Deno
```

### Linting

```bash
npm run lint                                    # Check formatting with Prettier
npm run lint:fix                                # Fix formatting with Prettier
```

### Running the CLIs locally

```bash
node bin/nano-bench.js bench/bench-string-concat.js
node bin/nano-watch.js bench/watch-sample.js
```

## Coding conventions

### General

- **ESM-only**: use `import`/`export` with `.js` extensions in all import paths.
- **No build step**: source JS is shipped directly.
- **No TypeScript**: no `.ts` or `.d.ts` files.
- **Formatting**: Prettier — 100 char width, single quotes, no bracket spacing, no trailing commas.
- **Indentation**: 2 spaces.

### Benchmark file format

Benchmark files default-export an object of functions. Each function takes `n` (iteration count):

```js
export default {
  variant1: n => {
    for (let i = 0; i < n; ++i) {
      /* measured code */
    }
  },
  variant2: n => {
    for (let i = 0; i < n; ++i) {
      /* measured code */
    }
  }
};
```

## Adding new features

### New statistical function

1. Add implementation to the appropriate file in `src/`.
2. Add tests to `tests/`.
3. Run `npm test`.

### New significance test

1. Create `src/significance/<name>.js`.
2. Add tests in `tests/`.
3. Run `npm test`.

### New CLI option

1. Add the option to the relevant `bin/` script using `commander`.
2. Update the wiki documentation in `wiki/`.
3. Test manually with example benchmark files in `bench/`.

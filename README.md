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

Both [deno](https://deno.land/) and [bun](https://bun.sh/) are supported.

Use `--self` to get the script path for running with alternative interpreters:

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

Both utilities are available by name with a global install (`npm install -g nano-benchmark`).
Otherwise, prefix with `npx` (e.g., `npx nano-watch`) or use them in the `scripts` section of
your `package.json`.

Utilities are self-documented &mdash; run them with `--help` flag to learn about arguments.

Both utilities import a module and benchmark its (default) export.
`nano-bench` expects an object whose properties are the functions to compare.
`nano-watch` accepts the same format or a single function.

Example of a module for `nano-bench` called `bench-strings-concat.js`:

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
npx nano-bench bench-strings-concat.js
npx nano-watch bench-strings-concat.js backticks
```

See [wiki](https://github.com/uhop/nano-bench/wiki) for more details.

## AI agents and contributing

If you are an AI agent or an AI-assisted developer working on this project, read
[AGENTS.md](./AGENTS.md) first &mdash; it contains the project rules and conventions.

Other useful files:

- [ARCHITECTURE.md](./ARCHITECTURE.md) &mdash; module map, dependency graph, how benchmarking works.
- [CONTRIBUTING.md](./CONTRIBUTING.md) &mdash; development workflow and coding conventions.
- [llms.txt](./llms.txt) &mdash; project summary for LLMs.
- [llms-full.txt](./llms-full.txt) &mdash; detailed CLI reference for LLMs.

## License

BSD 3-Clause License

## Release history

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

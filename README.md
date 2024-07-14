# nano-bench [![NPM version][npm-img]][npm-url]

[npm-img]:      https://img.shields.io/npm/v/nano-bench.svg
[npm-url]:      https://npmjs.org/package/nano-bench

`nano-bench` provides command-line utilities for benchmarking code and related statistical modules.

Two utilities are available:

* `nano-watch` &mdash; provides statistics in a streaming mode continuously running your code,
  watching memory usage and updating the output.
* `nano-bench` &mdash; runs benchmark tests on your code, calculating statistics and
  statistical significance, and presenting them in a tabular format.

The utilities are mostly used to measure performance of your code and compare it with other variants.
It is geared toward benchmarking and performance tuning of a small fast snippets of code, e.g.,
used in tight loops.

## Visual samples

### `nano-watch`

![nano-watch](https://github.com/uhop/nano-bench/wiki/images/nano-watch-sample.png)

### `nano-bench`

![nano-bench](https://github.com/uhop/nano-bench/wiki/images/nano-bench-sample.png)

## Installation

```bash
npm install --save nano-bench
```

### Deno and Bun support

Both [deno](https://deno.land/) and [bun](https://bun.sh/) are supported.

Don't forget to specify the appropriate permissions for Deno to run the benchmark scripts:
`--allow-read` (required) and `--allow-hrtime` (optional but recommended).

## Documentation

Both utilities are available by name if you installed `nano-bench` globally (`npm install -g nano-bench`).
If it is installed as a dependency, you can use utilities by name in the `scripts` section of
your `package.json` file or from the command line by prefixing them with `npx`, e.g., `npx nano-watch`.

Utilities are self-documented &mdash; run them with `--help` flag to learn about arguments.

Both utilities import a module to benchmark using its (default) export.
`nano-bench` assumes that it is an object with functional properties,
which should be benchmarked and compared. `nano-watch` can use the same file format
as `nano-bench` or it can use a single function.

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

The way to use it:

```bash
npx nano-bench bench-strings-concat.js
npx nano-watch bench-strings-concat.js backticks
```

See [wiki](https://github.com/uhop/nano-bench/wiki) for more details.

## License

BSD 3-Clause License

## Release history

- 1.0.0: *Initial release.*

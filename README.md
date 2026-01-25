# nano-benchmark [![NPM version][npm-img]][npm-url]

[npm-img]:      https://img.shields.io/npm/v/nano-benchmark.svg
[npm-url]:      https://npmjs.org/package/nano-benchmark

`nano-benchmark` provides command-line utilities for benchmarking code and related statistical modules.

Two utilities are available:

* `nano-watch` &mdash; provides statistics in a streaming mode continuously running your code,
  watching memory usage and updating the output.
* `nano-bench` &mdash; runs benchmark tests on your code, calculating statistics and
  statistical significance, and presenting them in a tabular format.

The utilities are mostly used to measure performance of your code and compare it with other variants.
It is geared toward benchmarking and performance tuning of small fast snippets of code, e.g.,
used in tight loops.

## Visual samples

### `nano-watch`

![nano-watch](https://github.com/uhop/nano-bench/wiki/images/nano-watch-sample.png)

### `nano-bench`

![nano-bench](https://github.com/uhop/nano-bench/wiki/images/nano-bench-sample.png)

## Installation

```bash
npm install --save nano-benchmark
```

### Deno and Bun support

Both [deno](https://deno.land/) and [bun](https://bun.sh/) are supported.

If you want to run the benchmark in Deno, Bun, etc. you can specify `self` as the `file` argument
or the `--self` option.
In this case the utility will print out its file name to `stdout` and exit. It allows running
the utility with alternative JavaScript interpreters.

Examples with `bash`:

```bash
npx nano-bench benchmark.js
bun `npx nano-bench --self` benchmark.js
deno run --allow-read --allow-hrtime `npx nano-bench --self` benchmark.js
deno run -A `npx nano-bench --self` benchmark.js
node `npx nano-bench --self` benchmark.js
```

Don't forget to specify the appropriate permissions for Deno to run the benchmark scripts:
`--allow-read` (required) and `--allow-hrtime` (optional but recommended). Or consider using
`-A` or `--allow-all` to allow all permissions (used it only in safe environments!).

## Documentation

Both utilities are available by name if you installed `nano-benchmark` globally
(`npm install -g nano-benchmark`).
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

* 1.0.7: *Updated dependencies.*
* 1.0.6: *Updated dependencies.*
* 1.0.5: *Updated dependencies.*
* 1.0.4: *Updated dependencies + added more tests.*
* 1.0.3: *Updated dependencies.*
* 1.0.2: *Added the `--self` option.*
* 1.0.1: *Added "self" argument to utilities so it can be used with Deno, Bun, etc.*
* 1.0.0: *Initial release.*

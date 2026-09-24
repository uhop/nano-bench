# Browser viewer &mdash; `nano-bench-view`

Design and decision record for the browser viewer: tier 3 of
[`json-results-and-compare.md`](./json-results-and-compare.md) &sect; 4 (decision D6), built
2026-09-24 as the first route of the browser web app planned for browser benchmarking. The
run route and the Playwright and Puppeteer drivers come later and share this server and page
shell.

## What it does

`nano-bench-view` serves a web page that reads results JSON files and shows what a terminal
table can't: each function's sample distribution. The page also repeats the summary table,
the comparability warnings, and the significance matrix, computed by the same modules as
`nano-bench-compare`, so the browser and the terminal agree to the last digit.

## Decisions

### Loading is a server-side concern

Results often live on a remote machine reached over SSH, with nothing mounted locally, so a
drag-and-drop area or a file picker in the local browser can't see them. The viewer asks the
server for the list (`/--nano-bench/results`) and fetches files by path. A file input still
covers the same-machine case; files opened that way are read by the browser and never
uploaded.

### Server: tape-six's test server plus two plugins

The server is `createTestServer` from `tape-six/test-server.js`. tape-six is an optional peer
dependency, imported lazily by the bin, which prints an install line when it is absent. Its
plugin registry runs plugins before the static handler, and a handler that returns
`undefined` passes the request on, so both additions are plugins and tape-six needs no change:

- `src/server/nano-bench-plugin.js` owns `/--nano-bench/`. It serves `web-app/`, `src/`, and
  the `console-toolkit` sources from wherever npm installed them (`import.meta.resolve`), so
  the served root can be any project, and a package outside it still works. It also answers
  `/--nano-bench/results`.
- `src/server/autoindex.js` is the directory listing from the `static-server.mjs` gist: folders
  first, then files, sorted by name, dot-files hidden unless `--show-dot-files`, a parent link
  below the root. The page shares the viewer's theme, and JSON files get a **view** link. It
  answers only folder URLs without `index.html`; the root lists only with `/?list`, because
  `/` redirects to the viewer.

**Development only.** The server isn't hardened and isn't meant for general web serving: it
serves every file under the root, with no authentication, to anyone who can reach it. The
user is responsible for its security, and outside `localhost` they are on their own. The
default binding is `localhost`; the README recommends an SSH tunnel for remote machines; and
a non-loopback `--host` prints a warning at startup. The docs, `--help`, and that warning
all say so.

The bin passes every server setting itself (`webAppPath`, `protocol: 'h1'`,
`remotePlugins: false`), so a user configures nothing. One setting leaks through: tape-six
also registers `server.plugins` from the project's `tape6` configuration.

**Why a results endpoint instead of `/--patterns`.** `/--patterns?q=**/*.json` walks
`node_modules` and `.git` before any `!` exclusion applies, and it returns every JSON file.
The endpoint skips dot-folders and `node_modules`, and keeps a file only when its first
512 bytes carry `schemaVersion: 1` and `tool: "nano-benchmark"`.

### The browser imports `src/` directly

No bundle and no copy: the page imports `src/bench/results/series.js`, `pair-series.js`,
`significance.js`, `histogram.js`, and `render/svg-distribution.js`, with an import map for
the one bare specifier they need (`console-toolkit/` for the number formatters). To keep that
possible, the Node-only halves were split off: `parse.js` from `load.js`, and `env-diff.js`
from `environment.js`. The series construction and the warnings moved out of
`bin/nano-bench-compare.js` into `series.js`; the compare output is byte-identical on the
sample files in `bench/` (six invocations checked, including `--pooled -v` and `--clusters
--histogram`).

### Chart: small multiples on one axis

One histogram row per series, all on one time axis, with the median as a line, the
median's CI as a bar on top of it, and the spread as a shaded band. Rows are labeled, so every row uses one color and identity
never depends on hue. A hover target covers each bin's full row height and carries its range
and count.

A shared linear axis fails when series differ by orders of magnitude: `bsc-combined.json`
has two functions near 0.33&nbsp;ns and one near 100&nbsp;ns, and the fast pair collapses into
one column (the same collapse D10 records for the terminal histogram). The axis modes are:

- **Auto** &mdash; logarithmic when the pooled 1st&ndash;99th percentile range spans more
  than 20 times, otherwise linear.
- **Linear** and **Log** &mdash; forced.
- **Per row** &mdash; every series on its own linear axis. When each series is tight and the
  series are far apart, any shared axis puts each row into one or two bins; this mode shows
  each shape, and the note under the chart says that positions no longer compare.

Below 560&nbsp;px of width the labels move above their rows.

### Theme

Auto, Light, and Dark, as on the blog: a classic script in `<head>` applies the saved choice
before first paint, and a segmented control changes it. Colors are CSS custom properties from
the dataviz reference palette, redefined for dark under `prefers-color-scheme` and under
`[data-theme='dark']`.

## Open

- **The interval's name** &mdash; resolved 2026-09-24. The summary's `lo`&ndash;`hi` turned
  out to be the spread of the runs, not the median's confidence interval the docs promised.
  `bootstrapSummary` now also returns `ciLo`&ndash;`ciHi` (the percentile CI of the resampled
  medians), every table shows both, and the chart draws the CI as a bar on the median line
  over the shaded spread.
- **A standalone server package.** The plugin mechanism was enough here. Splitting tape-six's
  server into a generic core plus test plugins would retire the gist and remove the
  tape-six peer; see the 2026-09-24 entry in the vault decisions.
- **Not in the viewer.** Per-run system metrics (`nano-bench-io -M`) and the `--clusters`
  split are terminal-only; the viewer flags multimodality and points at
  `nano-bench-compare --clusters`.

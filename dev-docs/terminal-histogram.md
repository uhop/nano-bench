# Terminal histogram of sample distributions

Status: **implemented (nano-bench, 2026-06-19)** — was queue Priority −1.
Viewer-side, and a sibling to the deferred HTML/SVG viewer
([`json-results-and-compare.md`](./json-results-and-compare.md) § 4, Decision
D6) — same goal (show distribution _shape_) by a lighter, terminal-first means.
The original design below stands; § "As implemented" records what shipped and the
open follow-ups.

## As implemented (2026-06-19, nano-bench only)

Behind `--histogram` on `nano-bench` (compare wiring deferred — the binning module
is shared and ready). Surface: `--histogram` enables it, `--chart columns|bars`
picks orientation (default `columns`), `--bins N` overrides the auto count.

- **Binning** — `src/bench/histogram.js`, pure + unit-tested (`tests/test-histogram.js`).
  **One shared range and bin set across all series** (global range, then each
  counted into it) so shapes are comparable. Range is **percentile-clamped** (p1–p99
  of the pooled samples); the clamp _produces_ the outlier list, surfaced as
  **notes** (count + extent on each side), not a silent overflow bin — and it clamps
  only the _sparse_ tail (>p99), never a dense secondary mode (a 10%-of-samples
  second peak must stay visible, since revealing multimodality is the whole point).
  **Bin count is screen-aware**, not Freedman–Diaconis: `round(samples/3)` bounded to
  `[12, min(48, width)]`, where `width` is the terminal width from console-toolkit's
  `Writer.columns` (no `process.stdout` poking); `--bins N` overrides. FD was the
  first cut but underbinned multi-cluster data — 4 bins for `bench-string-concat` —
  so it was dropped for a count that scales with sample size and fits the screen.
- **Columns** — console-toolkit's `charts/columns/plain` (one solid `▉` per bin, no
  gap; a zero-count bin keeps its slot as a space, so position stays honest). The
  prettier `block-frac` variant (sub-character tops) **drops zero-value bins and
  collapses the chart** — a console-toolkit bug, filed in `projects/console-toolkit`
  queue, so we use `plain`.
- **Layout: ridgeline** — `src/bench/render/histogram-chart.js`. One histogram per
  function, stacked, on a **shared y-scale** (console-toolkit `maxValue`) so a taller
  bar means more mass, and a **shared time axis restacked under each chart** (rendered
  once from the shared range).
- **Median/mean markers** — `▾` median, `▿` mean, placed **above** the chart pointing
  down at their column; the chart then sits directly on its axis. The glyphs double
  as the **legend in the per-function values line** (`name  ▾ median X  ▿ mean Y`).
  When the two coincide they merge to one cell (median wins) — both values remain in
  the legend, and a single marker reads "symmetric, no skew". A marker floating above
  a near-empty bin is the visible mean/median mismatch (skew / mean-in-the-valley).
- **Axis** — a notched baseline via console-toolkit's `turtle` + the **square** line
  theme (`themes/lines/unicode.js`, _not_ rounded), `┌──┬──┐` with **ticks pointing
  down** to lo/mid/hi labels (labels degrade gracefully on narrow charts).
- **Per-function order** — values line (legend) → markers → chart → axis → labels →
  outliers notes → multimodality nudge.
- **Multimodality nudge** — when the mean lands in a sparse bin (`meanSparse`), a
  one-line "mean sits where few samples landed — distribution may be multimodal".
- **`--no-emoji`** swaps the nudge glyph `⚠ → !` (and the significance table's
  🐇/🐢 → `F`/`S`) for terminals with shaky emoji-width handling — see
  [`significance-reporting.md`](./significance-reporting.md) D18.

Motivation and the multimodality framing come from the companion essay "Statistics
for programmers": plot the shape first — the median+CI line can't show
multimodality, skew, or the tail.

### Known limitations (deliberate; for a later pass)

- **Shared _linear_ range collapses when functions differ by orders of magnitude**
  — comparing a 350ps function with a 100ns one crushes each body to a spike. Fine
  for similar-scale comparisons (the common case); a **log-scale axis or
  per-function panels** is the natural follow-up.
- **Bars (`--chart bars`) is basic** — functional but tall/sparse for many bins on
  one function; it's meant for the grouped/stacking case, which is later polish.
- **nano-bench only** — `nano-bench-compare` wiring is a follow-up (the binning
  module is shared, so it's a small one).

## Problem

The summary table reports median / CI / ops/sec but never the _shape_ of a
function's timing distribution. Multimodality, right-skew, and outlier tails (GC
pauses, JIT warmup) are exactly what you want to see when tuning hot code, and a
single median hides all of it. A histogram drawn inline in the terminal fills
that gap without leaving the CLI or pulling in a web viewer / build step.

## Constraints

- CLI-only, no build step (project identity).
- **No new dependency** — `console-toolkit` is already a runtime dep and ships a
  `charts` facility (bar + column charts).
- Consumes the **raw normalized per-sample arrays** already collected in-run
  (ms/iteration — see [`README.md`](./README.md) § "Samples are already
  normalized"). Independent of the JSON-export work (doc 3): it needs no
  persisted file, though it can equally render a reloaded baseline's samples.

## The pre-processing step: binning (the real work)

`console-toolkit`'s charts render **pre-aggregated** bar heights —
`drawChart(data, size, options)` takes a vector of values (counts), not raw
samples. So the histogram computation is _ours_: turn each function's sorted
sample array into a frequency vector before any chart call.

1. **Range.** min/max of the samples (already sorted by the time we hold them,
   via `ensureSorted`). A single GC-spike tail can stretch the range so the body
   collapses into one bin — consider clamping the extreme top percentile (e.g.
   top 0.5%) into an **overflow bin** rather than silently dropping it. (D8.)
2. **Bin count / width.** Candidate rules: fixed `k` (predictable width budget);
   Sturges `⌈log2 n⌉ + 1` (assumes ~normal — poor for right-skewed timing data);
   Freedman–Diaconis `2·IQR·n^(−1/3)` (IQR-based, robust to the outlier tails
   timing data has). Leaning: Freedman–Diaconis default with a `--bins N`
   override, **capped by the available render width** (see sizing). (D8.)
3. **Count.** Tally samples per bin → the `data` vector handed to `drawChart`.

**Shared bin edges across compared functions.** For a multi-function run, the
charts are only comparable if every series uses the _same_ range and bin edges —
per-function auto-ranging makes the bars meaningless side by side. So compute one
global range / bin set across all compared series first, then count each series
into it. This is the difference between "three pretty charts" and "three
comparable charts."

## Rendering: console-toolkit charts

Entry:
`import drawChart from 'console-toolkit/charts/<columns|bars>/<plain|block|frac>[-grouped].js'`,
called `drawChart(data, size, options)`.

- **Variants:** `plain` (full-cell blocks), `block` (block chars), `frac`
  (sub-character "real size" resolution — smoother bars), `-grouped` (multiple
  series per category, i.e. the multi-function case).
- **`size`** is the cross-axis extent: **height in rows** for columns, **length
  in chars** for bars (confirmed by the `tests/manual/test-chart-*-length-*`
  demos — columns pass `10`, bars pass `50`).
- **`options`:** `theme` (array of color states — reuse the comparison table's
  palette so each function keeps a consistent color), border controls (`r`, …).
  Study the demos for the full surface.

## Orientation — a user option, default `columns` (D9)

It is a genuine judgement call that depends on how many series are shown, so
expose it (`--chart columns|bars`, default `columns`):

- **Columns** (vertical, `charts/columns/...`): the classic histogram
  silhouette. Width grows with bin count; height is the `size` arg. The common
  single-distribution case — the default.
- **Bars** (horizontal, `charts/bars/...`): one row per bin; length is the
  `size` arg. Reads better when **stacking many runs side by side** (the
  `-grouped` bar form). Opt-in.

## Sizing & overflow (D10)

- **Columns:** define a **max height** (rows) — fixed (≈8–12) or a fraction of
  terminal height — and a **width** budget. Width = bin count × column width, so
  bin count must be **capped to fit terminal width** (this couples back to D8 —
  render width bounds `k`).
- **Bars:** **length** fits terminal width naturally, but there is **no natural
  screen-height bound** — height is one row per bin, so many bins ⇒ a chart
  taller than the screen. Cap bin count, accept vertical scroll, or paginate.
- **Stacked / side-by-side overflow:** placing several charts horizontally
  (multiple functions) can exceed terminal width. Leaning: detect terminal
  width and fit; fall back to vertical stacking when side-by-side won't fit.

## `nano-watch` (live histogram) — note, not scope

`nano-watch` streams an **unbounded** sample loop, so a live histogram would need
**fixed bins with online counts** (you cannot cheaply re-range a stream),
mirroring the bounded-buffer caution already recorded for observe-mode in the
project decisions. Out of scope for the first cut (which targets `nano-bench`'s
finished per-function arrays); flagged so the binning design does not foreclose
it.

## Decisions

- **D8 — binning rule:** _resolved (2026-06-19):_ one shared, percentile-clamped
  (p1–p99) range and bin set across all series; the clamp produces an **outlier list
  reported as notes** (count + extent each side) rather than a silent overflow bin,
  and clamps only the sparse tail so a dense secondary mode stays visible. Bin
  **count is screen-aware, not Freedman–Diaconis**: `round(samples/3)` bounded to
  `[12, min(48, width)]` (FD underbinned multi-cluster data — 4 bins for
  `bench-string-concat`); `--bins N` overrides (§ As implemented).
- **D9 — orientation:** _resolved (2026-06-19):_ `--chart columns|bars`, default
  `columns`; bars shipped **basic** (the grouped/stacking polish is a follow-up).
- **D10 — sizing / overflow:** _resolved (2026-06-19):_ terminal width from
  console-toolkit's `Writer.columns` (no `process.stdout` poking) bounds the bin
  count; columns a fixed 6-row height; **shared y-scale** across series via
  `maxValue`. Drawn with `charts/columns/plain` (1 solid char per bin; zero bins keep
  their slot) — `block-frac` drops zero bins (console-toolkit bug, filed). The
  shared-_linear_-range collapse for orders-of-magnitude-different functions is a
  known limitation (log / per-panel = follow-up).
- **D17 — comparing shapes across functions:** _resolved (2026-06-19):_ a
  **ridgeline** — per-function histograms stacked on a shared y-scale, each on a copy
  of the shared time axis (`turtle` + square line theme, ticks pointing **down** to
  the labels). **Median (`▾`) / mean (`▿`) markers sit above each chart** pointing
  down, the glyphs doubling as the legend in the values line (`▾ median X ▿ mean Y`);
  coincident markers merge (median wins, both values stay in the legend), and a
  marker over a near-empty bin flags the mean/median mismatch. Plus a **`meanSparse`
  multimodality nudge**. Chosen over a grouped overlay (busier) and per-function
  auto-ranged charts (not comparable).

## Effort / risk

Small–medium, purely additive output — no statistics or measurement change. The
new code is (a) a binning pass (range, bin rule, shared edges across series,
counts), (b) wiring counts + theme into `console-toolkit`'s `charts`, and (c) an
opt-in flag plus orientation / size options. The unknowns are ergonomic (bin
defaults, terminal-fit), best resolved by studying the manual demos at
`~/Open/console-toolkit/tests/manual/test-chart-{columns,bars}-{plain,block,frac}-*.js`.

# Design notes — results export, baselines, and comparison

Design + decision record for the results-export, baseline, comparison, and
histogram work — most of it has **shipped** (each doc carries an "As implemented"
section and/or resolved decisions; the table below tracks what's done vs. still a
follow-up). Each doc states a problem, weighs the options against the project's
constraints, records the decision, and flags anything still open.

## Scope

Three queued features, designed together because they share one data model:

1. [`significance-reporting.md`](./significance-reporting.md) — name the
   statistical test (and its parameters) in the output, so a reader knows _which_
   algorithm produced "the difference is significant."
2. [`single-function-baseline.md`](./single-function-baseline.md) — benchmark a
   single function as a first-class mode, to establish a baseline. No
   significance test in isolation (nothing to compare against yet).
3. [`json-results-and-compare.md`](./json-results-and-compare.md) — export
   results as JSON; reload/compare a saved baseline against a later run,
   recomputing significance; what to persist; a viewer.
   Build plan: [`json-results-implementation-plan.md`](./json-results-implementation-plan.md).

Plus a fourth note — lower priority, independent of the trio above, but reusing
the same sample data model:

- [`terminal-histogram.md`](./terminal-histogram.md) — opt-in terminal histogram
  of each function's sample distribution via `console-toolkit`'s charts. Future /
  optional (queue Priority −1); sibling to the deferred HTML/SVG viewer (D6), same
  goal by a lighter, terminal-first means. Requires binning the raw samples into
  buckets before charting.

## The one principle the whole design rests on

nano-bench's significance tests are **nonparametric and rank-based**:

- 2 functions → **Mann–Whitney U** (normal approximation, tie-corrected) —
  `src/significance/mwtest.js`.
- 3+ functions → **Kruskal–Wallis H** (beta approximation) with **Conover–Iman**
  post-hoc pairwise comparisons — `src/significance/kwtest.js`.

Both are _pure functions of the raw per-sample timing arrays_. They take the
sorted sample vectors and nothing else (`mwtest(sorted1, sorted2, alpha)`,
`kwtest(sortedArrays, alpha)`). They do not need the benchmark process, the
original code, or any live state.

Two consequences define every design decision below:

1. **Raw samples are the source of truth; summary stats are lossy.** Median, CI,
   and ops/sec are _derived_ from the samples. You cannot recover the samples
   from them, and you cannot run a rank test on them. So any JSON we export _must
   persist the raw normalized per-sample array_ if we ever want to recompute
   significance later. Saving only median+CI permanently forecloses comparison.

2. **Cross-run comparison is the same computation as in-run comparison.** Feeding
   `mwtest` two sample arrays that came from two different files, measured a week
   apart, is byte-for-byte the same call as feeding it two arrays from one run.
   The math is environment-blind. That is exactly why it is powerful _and_ why it
   is dangerous: the test will report a "significant" difference that is entirely
   a CPU/runtime/thermal artifact, with no way to know from the numbers alone.
   The metadata we log (CPU, runtime, OS, per-function body hash) exists to
   _guard the comparison_, not to feed the test.

Everything in doc 3 — the schema, the metadata, the warnings, the answer to
"can we save two, run two more, and recompute" — follows from these two facts.

## Samples are already normalized — reuse it

`bin/nano-bench.js` divides every sample by the batch size before stats
(`normalizeSamples`, line 138), so the stored unit is **milliseconds per
iteration**. Two runs with different auto-discovered batch sizes (`reps`) produce
directly comparable sample arrays. The JSON format stores the normalized values;
`reps` is kept only as provenance.

## Decisions (tracked across the design docs)

| #   | Decision                                                         | Doc | Leaning                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Always name the test, or only under a verbose flag?              | 1   | Always (one line)                                                                                                                                                                                                                                        |
| D2  | How much statistic detail in default output (z/H/limit)?         | 1   | Test name + α default; full stats behind `-v`                                                                                                                                                                                                            |
| D3  | Select one method from a multi-fn object — positional or flag?   | 2   | Variadic positional, parity with `nano-watch`                                                                                                                                                                                                            |
| D4  | Produce JSON via flag on `nano-bench`, or a separate concern?    | 3   | `--json <file>` flag                                                                                                                                                                                                                                     |
| D5  | View/compare: flags on `nano-bench`, or a third `bin/`?          | 3   | Resolved: separate `nano-bench-compare` binary (don't mix runner + comparator)                                                                                                                                                                           |
| D6  | Web viewer at all, given "no build step / CLI-only"?             | 3   | CLI re-render first; static inline-SVG HTML viewer deferred to its own future queue item                                                                                                                                                                 |
| D7  | Multiple-comparison correction for many before/after tests?      | 3   | Follow-up (not v1); uncorrected default; opt-in Holm/Bonferroni (non-parametric, dep-valid)                                                                                                                                                              |
| D8  | Histogram binning rule (fixed k / Sturges / Freedman–Diaconis)?  | 4   | Resolved (2026-06-19): screen-aware count `round(samples/3)` bounded `[12, min(48, width)]` (not FD — it underbinned multi-cluster data); `--bins N` overrides; p1–p99 clamp → outlier **notes**, not a silent bin                                       |
| D9  | Default histogram orientation — columns or bars?                 | 4   | Resolved (2026-06-19): `--chart columns\|bars`, default columns; bars shipped basic (grouped/stacking = follow-up)                                                                                                                                       |
| D10 | Histogram sizing / overflow when too wide or too tall?           | 4   | Resolved (2026-06-19): width from console-toolkit `Writer.columns`; columns fixed 6-row height; `charts/columns/plain` (zero bins keep their slot; `block-frac` drops them — c-t bug filed); linear-range collapse for ×-different functions = follow-up |
| D11 | Hostname in results — always-on, or opt-in?                      | 3   | Resolved: opt-in; `-H, --host` (boolean) = `os.hostname()`, `--host-name <name>` = string                                                                                                                                                                |
| D12 | Provenance hash — bench-file hash, or per-function body hash?    | 3   | Resolved: per-result `bodyHash` = `sha256(fn.toString())`; file hash dropped                                                                                                                                                                             |
| D13 | `label` — mandatory/autogenerated, or optional annotation?       | 3   | Resolved: optional `--label`; run id = file path (positional-index fallback); display only                                                                                                                                                               |
| D14 | Reproducible bootstrap CIs — record an RNG seed?                 | 3   | Resolved: always record `params.seed` (auto if no `--seed`); `mulberry32`, CLI-only seeding                                                                                                                                                              |
| D15 | Compare significance — pool all series, or pair by name?         | 3   | Resolved (2026-06-19): paired-by-name default (one test per shared name); `--pooled` for the k-sample omnibus; degrade to pooled when no name is shared                                                                                                  |
| D16 | Significance-table glyph widths — hack, or real measurement?     | 1   | Resolved (2026-06-19): real emoji placed directly; declare `emoji-regex` + `get-east-asian-width` deps so console-toolkit measures faithfully; `\t1` placeholder hack dropped                                                                            |
| D17 | Histogram — how to compare distribution shapes across functions? | 4   | Resolved (2026-06-19): ridgeline (stacked, shared y-scale, shared down-tick axis under each); `▾`median/`▿`mean markers above each chart, glyphs double as the values-line legend, coincident merge; `meanSparse` multimodality nudge                    |
| D18 | Fastest/slowest markers — emoji, or terminal-proof ASCII?        | 1   | Resolved (2026-06-19): default 🐇/🐢; `--no-emoji` → `F`/`S` (+ `!` nudge) for non-conformant emoji-width terminals; marker column auto-sizes (1 col ASCII, 2 emoji)                                                                                     |

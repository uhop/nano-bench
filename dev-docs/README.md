# Design notes — results export, baselines, and comparison

Pure design. No code is implemented from these docs yet; they exist to be
iterated on before any feature work starts. Each doc states a problem, analyzes
options against the project's constraints, recommends a direction, and lists the
decisions still open.

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
   The metadata we log (CPU, runtime, OS, file hash) exists to _guard the
   comparison_, not to feed the test.

Everything in doc 3 — the schema, the metadata, the warnings, the answer to
"can we save two, run two more, and recompute" — follows from these two facts.

## Samples are already normalized — reuse it

`bin/nano-bench.js` divides every sample by the batch size before stats
(`normalizeSamples`, line 138), so the stored unit is **milliseconds per
iteration**. Two runs with different auto-discovered batch sizes (`reps`) produce
directly comparable sample arrays. The JSON format stores the normalized values;
`reps` is kept only as provenance.

## Open decisions (tracked across the design docs)

| #   | Decision                                                        | Doc | Leaning                                                                                     |
| --- | --------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------- |
| D1  | Always name the test, or only under a verbose flag?             | 1   | Always (one line)                                                                           |
| D2  | How much statistic detail in default output (z/H/limit)?        | 1   | Test name + α default; full stats behind `-v`                                               |
| D3  | Select one method from a multi-fn object — positional or flag?  | 2   | Variadic positional, parity with `nano-watch`                                               |
| D4  | Produce JSON via flag on `nano-bench`, or a separate concern?   | 3   | `--json <file>` flag                                                                        |
| D5  | View/compare: flags on `nano-bench`, or a third `bin/`?         | 3   | Flags first; third bin only if the arg model gets ugly                                      |
| D6  | Web viewer at all, given "no build step / CLI-only"?            | 3   | CLI re-render first; static inline-SVG HTML viewer deferred to its own future queue item    |
| D7  | Multiple-comparison correction for many before/after tests?     | 3   | Document; offer Holm as opt-in                                                              |
| D8  | Histogram binning rule (fixed k / Sturges / Freedman–Diaconis)? | 4   | Freedman–Diaconis default + `--bins N`; cap to render width; clamp outliers to overflow bin |
| D9  | Default histogram orientation — columns or bars?                | 4   | `--chart` option, default columns; opt-in bars for stacking many runs                       |
| D10 | Histogram sizing / overflow when too wide or too tall?          | 4   | Fit terminal width; cap bins to width; columns max height; side-by-side → vertical stack    |

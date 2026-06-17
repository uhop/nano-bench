# Benchmark a single function (baseline mode)

Status: **design**. Queue item 2. Producer side of the baseline/compare feature
in [`json-results-and-compare.md`](./json-results-and-compare.md).

## Problem

The user wants to benchmark _one_ function to establish a baseline, with no
significance test (there is nothing to compare it against in isolation). Two
sub-problems hide here:

1. **Is the single-function case even supported?** Partly, by accident.
2. **Can you pick one function out of a multi-function file** without editing the
   file? No.

## What works today

`nano-bench` does **not** require two functions. It collects every function on
the selected export object (`bin/nano-bench.js:103`), errors only when there are
zero (`names.length < 1`, line 104), and runs the significance block only when
more than one result exists (`if (results.length > 1)`, line 294). So a file that
default-exports a single function already measures cleanly and prints median / CI
/ ops/sec with no significance section.

That behavior is currently **implicit and undocumented** — it falls out of the
guards rather than being a designed mode. Two gaps:

- It is not documented or tested as a supported path, so it can regress silently.
- There is no way to benchmark _one_ function from a file that exports _several_.
  `nano-watch` has a `[method]` positional for exactly this (`bin/nano-watch.js:47,77`);
  `nano-bench` has no equivalent — it's all-or-nothing on the export object.

## Design

### 1. Make single-function a documented, tested, first-class mode

- Document: "give `nano-bench` a file exporting one function (or select one with
  the method argument) to measure a single baseline; no significance test is run
  for a single series."
- Add a test asserting the single-function path produces stats and **omits** the
  significance section (today it does, but nothing locks it in).
- Confirm the output reads as a clean baseline. In the single-series case the
  significance block is already skipped — verify it never prints "not
  statistically significant" for n=1 (it doesn't, because the block is guarded,
  but the test should pin this).

### 2. Method selection — parity with `nano-watch` (Decision D3)

Allow selecting a subset of functions from a multi-function export so you can
baseline just one without editing the bench file.

Option A — **variadic positional** (recommended):

```
nano-bench bench/strings.js               # all functions (today's behavior)
nano-bench bench/strings.js plus          # just `plus` → single baseline
nano-bench bench/strings.js plus template # compare only these two
```

Mirrors `nano-watch`'s positional `[method]`, extended to accept more than one
name so the same flag also narrows a comparison. When exactly one name resolves,
it's a baseline (no significance); when ≥2 resolve, it's the normal comparison.

Option B — `--only a,b` / `--method a` flag. More explicit, less natural; breaks
the positional symmetry with `nano-watch`. Rejected unless variadic positionals
clash with the existing `<file>` argument grammar in commander (they shouldn't —
`argument('[methods...]')` after the required `<file>` is standard).

Edge cases to specify:

- A requested method name that isn't a function on the object → clear error
  listing the available names (reuse the message style at line 104).
- `--export` still selects _which object_; method names select _within_ it.
  Document the two-level addressing (export → method), same model as
  `nano-watch`.

### 3. "Baseline" is the unit that feeds compare

A single-function run is the natural thing to save as a baseline JSON (doc 3).
Important clarification for the docs, because the user wrote "obviously, no
statistical significance calculations":

- **In isolation**, a single series has nothing to test against → no
  significance, correct.
- **The saved samples are not wasted.** Because the rank tests consume raw
  samples (see [`README.md`](./README.md) § the one principle), a baseline JSON
  of function `A` can later be compared against a _new_ run of `A` with a full
  Mann–Whitney test — recomputed offline from the two saved sample arrays. So
  "no significance now" does not mean "no significance ever"; it means
  significance is deferred to the moment a second series exists to compare.

This is the bridge to doc 3: item 2 produces baselines; item 3 consumes them.

## Decisions

- **D3 — selection mechanism:** variadic positional `[methods...]`, parity with
  `nano-watch`, doubling as a comparison narrower.

**As implemented (2026-06-16):** the variadic `[methods...]` positional ships.
Name resolution + validation is extracted to `src/bench/select-functions.js`
(pure: returns the requested subset in requested order, all functions when none
are named, or throws — an unknown name lists the available functions). That
helper is unit-tested in `tests/test-select-functions.js` — the route to a real
test for part (c), since `bin/` has no unit harness. The single-series →
no-significance behaviour is unchanged: it still falls out of the
`results.length > 1` guard, so naming one method (or a one-function file) prints
stats with no significance section.

## Effort / risk

Small–medium. The measurement path is unchanged; the work is (a) a positional
argument + name resolution/validation, (b) docs, (c) a test pinning the
single-series no-significance behavior. No statistics change.

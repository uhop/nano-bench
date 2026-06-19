# Report which significance algorithm was used

Status: **design**. Queue item 1. Smallest of the three; no data-model impact.

## Problem

When `nano-bench` finds a significant difference it prints:

```
The difference is statistically significant:
<matrix table>
```

and otherwise:

```
The difference is not statistically significant.
```

(`bin/nano-bench.js:294-357`.) Neither line names the test that ran, the
statistic, the threshold, or α (α is shown once near the top as
"Confidence interval: 95%", but never tied to the significance verdict). A
reader cannot tell whether they are looking at a t-test, a bootstrap test, or —
what actually runs — a rank test, nor with what parameters. For a tool whose
whole pitch is "proper nonparametric statistics," the method should be legible
in the output, not just the source.

## What actually runs today

| Functions compared | Test                                                                            | Implementation                                              | Returns                                                    |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| exactly 2          | **Mann–Whitney U**, normal approximation, two-sided, tie-corrected              | `src/significance/mwtest.js`                                | `{value: z, alpha, limit: zc, different}`                  |
| 3 or more          | **Kruskal–Wallis H**, beta approximation for the null distribution of H         | `src/significance/kwtest.js` (`kwtest`)                     | `{value: H, alpha, limit: Hc, different, groupDifference}` |
| 3+ post-hoc        | **Conover–Iman** pairwise (Fisher's LSD on ranks), `t(N-k)` approximated by `z` | `src/significance/kwtest.js` (the `groupDifference` matrix) | boolean matrix                                             |

The confidence interval shown per row is a **bootstrap percentile** CI of the
median (`getBootstrapStats`, `bin/nano-bench.js:131`), or a direct weighted
quantile when bootstrap is disabled (`getStats`, line 123). `α` sets both the CI
width (`alpha/2 .. 1-alpha/2`) and the significance threshold.

Note: a **Kolmogorov–Smirnov** two-sample test exists and is exported
(`src/significance/kstest.js`, re-exported from `src/index.js`) but is **not**
wired into the CLI or `compare()`. Worth a one-line mention in docs so users
know it's available via the library API; not part of this change.

## Design

Make the method legible without turning the output into a stats dump.

### Default output (always shown)

Add a single line naming the test and its parameters wherever the verdict is
printed — significant _or not_. The user's framing was "show what algorithm was
used, **if it is not mentioned**" → so the fix is: always mention it.

Sketch (2 functions):

```
Significance: Mann–Whitney U test (two-sided, tie-corrected), α = 0.05
The difference is statistically significant:
<matrix>
```

Sketch (3+ functions):

```
Significance: Kruskal–Wallis H test, α = 0.05; post-hoc: Conover–Iman pairwise
The difference is statistically significant:
<matrix>
```

And in the negative case:

```
Significance: Mann–Whitney U test (two-sided, tie-corrected), α = 0.05
The difference is not statistically significant.
```

The header block (line 160-184) should likewise label the CI method, e.g.
"95% bootstrap percentile CI of the median (1000 resamples)" instead of the bare
"Confidence interval: 95%". This ties the already-printed bootstrap count to the
CI it produces.

### Verbose output (`-v` / `--verbose`, opt-in) — Decision D2

Under a verbose flag, print the actual statistic and critical value the test
already computes and returns but currently discards:

- MW: `U-statistic z = -3.42, |z| > z_crit = 1.96 → reject H₀`
- KW: `H = 14.7 > H_crit (β-approx) = 7.81 → reject H₀`, then the post-hoc
  threshold `C·√(1/nᵢ+1/nⱼ)` per pair.

These values are already in the return objects (`value`, `limit`); the CLI just
throws them away today (`bin/nano-bench.js:299,306` destructure only
`different`/`groupDifference`). No new computation — only plumbing into the
report.

**As implemented (2026-06-16):** the flag is `-v`, not `-V` — `-V` is
commander's built-in `--version` shortcut. The headline statistic + critical
value ship for both tests (`z`/`z_crit` for MW, `H`/`H_crit` for KW), and for KW
the Conover–Iman post-hoc threshold `C·√(1/nᵢ+1/nⱼ)` is shown too: `kwtest` now
returns its critical constant `C` (a minimal additive return-shape change), and
the CLI resolves the per-pair threshold — equal sample sizes across functions,
so one value covers every pair.

## Decisions

- **D1 — always vs. verbose-only naming:** _always_ show the one-line method
  name (cheap, directly answers the request). Reserve numeric detail for `-v`.
- **D2 — how much detail by default:** test name + α only. Statistic values
  (z, H, critical values) behind `-v`.
- **D16 — glyph widths in the significance table (fixed 2026-06-19):** render the
  fastest/slowest markers (🐇/🐢) as real emoji placed directly in the cell, and let
  `console-toolkit` measure widths — no placeholder or spacing hack.
  `console-toolkit` imports `emoji-regex` and `get-east-asian-width` _softly_
  (optional, squelched if absent), so with neither in the dependency tree every wide
  glyph measures as 1 column — emoji markers (and East-Asian function names) then
  overflow their cell and shift the rest of the row. Fix: declare **both** as direct
  nano-bench dependencies so measurement is always faithful (emoji → 2 cols; CJK /
  fullwidth / Hangul → 2). This retired the prior `\t1`/`\t2`
  tab-placeholder-then-`replace` hack in the now-shared renderer
  (`src/bench/render/significance-table.js`), which aligned only by accident of how
  the table counted a tab. The defect surfaced in `nano-bench-compare`; plain
  `nano-bench` had masked it because the placeholder happened to reserve the 2
  columns the emoji needs.

## Effort / risk

Small. Output/wording only; no engine or data-model change. The names and α are
deterministic from the branch already taken at `bin/nano-bench.js:298`/`305`.
Watch the table-rendering width (console-toolkit) when adding header lines, and
keep the new strings out of the JSON path (doc 3 stores the test identity as a
structured field, not this prose). Glyph-width correctness for the marker emoji
and wide (East-Asian) names is settled by D16 — real measurement via deps, no
spacing hacks.

## Cross-references

- The same test-identity strings should be reused by the JSON `significance`
  block and the compare renderer — see
  [`json-results-and-compare.md`](./json-results-and-compare.md) so we name the
  test in exactly one place.

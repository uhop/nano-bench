# JSON results, baselines, comparison, and a viewer

Status: **design**. Queue item 3 — the largest, and the reason items 1 and 2
exist. Read [`README.md`](./README.md) first; this doc assumes its two
principles (raw samples are the source of truth; cross-run comparison is the same
computation as in-run comparison).

The user's open questions, answered in order at the end:

- Export results as JSON — what shape?
- A viewer for those?
- Save a baseline, run a different version/implementation, compare before/after.
  - What to save in the JSON?
  - Log CPU type? Hash of the test file? Anything else?
  - Can we save two benchmarks, run two more, and compare _recomputing_
    significance?

## Tooling split — two binaries, one job each

The producer and the comparator are **separate binaries**, deliberately not one
tool with modes:

- **`nano-bench`** runs benchmarks. Its only new surface is `--json <file>`
  (write results) plus two annotations on the produced file (`--label`,
  `--host`). It never reads results back.
- **`nano-bench-compare`** only reads results JSON: render one file, or compare
  several (recompute significance across the selected series, diff the
  environments, warn on mismatch). It never runs a benchmark — structurally it is
  `nano-bench` minus the measure path, reusing the same table + significance
  renderer.

This resolves **D5** in favour of a third binary (the doc previously leaned
"flags on `nano-bench`"): a runner and a comparator are different purposes, and
keeping them apart avoids an arg model where the positional is sometimes a bench
file and sometimes a JSON file. There is intentionally **no** "run fresh and
compare against a baseline in one command" mode — that would re-merge the two
purposes.

## 1. What to persist (and what not to)

### Persist the raw normalized samples — non-negotiable

Significance is a pure function of the per-sample arrays (`mwtest`/`kwtest`). If
the JSON does not contain the raw normalized per-iteration times, significance
can never be recomputed from it — only re-measured by re-running the code, which
defeats the point of a saved baseline. So **the sample array is the irreplaceable
payload**; everything else is either derived (regenerable) or metadata.

Store samples at **full float precision** (no rounding) so a recomputed bootstrap
CI and rank test reproduce the original exactly — with the recorded `params.seed`
the bootstrap CI is exact too, not just the deterministic rank test (D14). Unit:
**milliseconds per iteration** — the value already produced by `normalizeSamples`
(`bin/nano-bench.js:138`). 100 samples × a few functions is a few KB; inline JSON
is fine, no external blob store needed.

### Persist derived summaries too — but as FYI only

Store `median`, `lo`, `hi`, `mean`, `stdDev`, `opsPerSec` alongside the samples —
but treat them as **FYI only, not authoritative**. The tools **always recompute**
from the raw samples (seeded bootstrap for `median` / `lo` / `hi`, exact for
`mean` / `stdDev`); the stored summary is there for a quick human glance at the
JSON and for external tools that don't want to recompute. Be precise about what
`median` / `lo` / `hi` are: the **seeded-bootstrap** estimates the run displayed
(mean of bootstrapped percentiles — `getBootstrapStats` overwrites the exact order
statistics at `bin/nano-bench.js:292`), reproducible exactly from `params.seed` +
`params.bootstrap` (D14), not from the samples alone.

### Proposed schema (`schemaVersion: 1`)

```json
{
  "schemaVersion": 1,
  "tool": "nano-benchmark",
  "toolVersion": "1.0.16",
  "createdAt": "2026-06-03T12:00:00.000Z",
  "label": "baseline-v1",

  "source": {
    "file": "bench/bench-string-concat.js",
    "export": "default",
    "methods": ["plus", "template"]
  },

  "environment": {
    "host": "nuke",
    "runtime": {"name": "node", "version": "22.11.0", "engine": "v8 12.4"},
    "os": {"platform": "linux", "release": "7.0.0", "arch": "x64"},
    "cpu": {"model": "AMD Ryzen 9 …", "count": 16, "speedMHz": 3600},
    "totalmemMB": 64000
  },

  "params": {
    "ms": 50,
    "minIterations": 1,
    "samples": 100,
    "bootstrap": 1000,
    "seed": 12345,
    "alpha": 0.05,
    "parallel": false
  },

  "results": [
    {
      "name": "plus",
      "bodyHash": "sha256:9c2b…",
      "reps": 100000,
      "samples": [0.000123, 0.000125, "… 100 values …"],
      "summary": {
        "median": 0.000124,
        "lo": 0.000119,
        "hi": 0.000131,
        "mean": 0.000126,
        "stdDev": 0.0000044,
        "opsPerSec": 8064516,
        "ci": "bootstrap-percentile"
      }
    }
  ],

  "significance": {
    "test": "mann-whitney-u",
    "value": -3.42,
    "alpha": 0.05,
    "limit": -1.959,
    "different": true
  }
}
```

Field rationale:

- `schemaVersion` — lets future viewers migrate; bump on any breaking change.
  `tool` / `toolVersion` are stamped from `package.json` at write time (the
  `1.0.16` shown is illustrative), not hard-coded.
- `label` — **optional** free-form annotation, set with `--label <text>`, never
  autogenerated. It is purely a display handle: when viewing or comparing,
  `nano-bench-compare` identifies a run by the file path you pass (a positional
  index `#1` / `#2` as a last resort if two share a basename); `label`, when
  present, overrides that display string. So you only
  reach for it when you want a name independent of the filename (e.g. several
  files produced on one machine). We deliberately do **not** auto-capture a VCS
  revision — nano-bench is used outside git too; a user who wants the SHA recorded
  passes it as the label.
- `source` — the bench file, the export inspected, and the method names actually
  measured (a run can measure a selected subset, not every export).
- `results[].bodyHash` — `sha256` of `fn.toString()` for the measured function:
  the per-function comparability guard (§ 2). Replaces the file-level hash an
  earlier draft proposed.
- `environment.host` — **optional**, opt-in only (§ 2, § 5); a machine identifier,
  omitted unless `--host` / `--host-name` is passed.
- `environment.*` (the rest) — comparability guards, **not** test inputs (§ 2).
- `params.seed` — the bootstrap RNG seed, **always recorded**: the `--seed <n>`
  value if given, otherwise an auto-generated 32-bit seed
  (`(Math.random() * 2**32) >>> 0`). So every saved run is exactly reproducible
  from its samples without having to remember to ask; `--seed` only matters when
  you want to _pin_ a specific value.
- `significance` — the _result_ of the in-run test, mirroring exactly what the
  test functions return (so producer and `nano-bench-compare` can share one
  serializer). For 2 functions, `mwtest` → `{test: "mann-whitney-u", value: z,
alpha, limit, different}` — **no `matrix`**; the 2×2 grid is a render-time
  convenience built in the bin, derivable from `different`. For 3+, `kwtest` →
  `{test: "kruskal-wallis", value: H, alpha, limit, different}` plus
  `groupDifference` (the post-hoc boolean matrix) and `C` (the Conover–Iman
  constant, for verbose). Same structured identity that
  [`significance-reporting.md`](./significance-reporting.md) uses; present only when
  ≥2 series were measured. `significance.alpha` echoes `params.alpha` (the in-run
  test used the run's α); on recompute, `nano-bench-compare` defaults to the file's
  α, overridable with `--alpha` (§ 3).

### What NOT to store

- Don't store ANSI-styled table strings — store data, render on read.
- Don't store only median+CI without samples — that's the one lossy mistake that
  forecloses everything in § 3.
- Don't auto-capture git (or any VCS) state — nano-bench runs fine outside a
  repo; the `label` covers "which version" without the assumption.
- Don't auto-capture the hostname — it can identify a person or org and the JSON
  is shareable, so `host` is opt-in (§ 5), default absent.

## 2. Metadata — why log CPU / runtime / OS / function hash

None of it feeds the statistics. All of it answers one question the numbers
cannot: **is this comparison even valid?** The rank tests will compute a verdict
for any two arrays; the metadata is what tells a human (and the compare tool)
whether that verdict means "the code changed" or "the machine changed."

- **CPU model / speed** — the dominant confound. The same code on two CPUs
  differs more than most optimizations you'd test. Compare across CPU models and
  any "significant" result is suspect.
- **Runtime + engine version** — V8/JSC/Bun optimizer changes move micro-bench
  numbers materially across versions. Log `name`, `version`, and engine.
- **OS / arch** — allocator, scheduler, syscall costs differ.
- **Total memory (`totalmemMB`)** — a coarse machine descriptor; differing RAM can
  correlate with allocator / GC behaviour. Provenance, not a hard confound.
- **Function-body hash (`results[].bodyHash`)** — `sha256(fn.toString())` per
  measured function, the precise answer to "did _this_ function change between two
  runs?" It is strictly better than the file-level hash an earlier draft proposed,
  which had _both_ failure modes: it flips when you edit or add an _unrelated_
  function in the same file (false "different"), and it stays put when the real
  subject is an _imported_ module the bench file only calls (false "same"). The
  body hash narrows both. Two blind spots remain — the compare tool must not
  over-trust it in turn:
  - **Closures** — `toString()` is source text, not captured values; a factory
    `make(n)` whose bodies differ only by a closed-over `n` hashes identically.
    (This is the one thing a _file_ hash caught that `bodyHash` misses:
    module-scope fixtures/constants a function closes over.)
  - **Imported implementations** — a wrapper `() => lib.foo(x)` doesn't change
    when `lib.foo` does. Closing that would mean hashing the resolved module
    graph; out of scope. So `bodyHash` improves per-function provenance, and the
    imported-implementation case is simply left open.
  - `toString()` is verbatim source per ES2018, so the same source hashes
    identically across V8/JSC/SpiderMonkey; reformatting or comment edits flip it,
    which is acceptable. Bound/native functions yield `[native code]` — irrelevant
    for user bench functions.
- **Host (`environment.host`, optional)** — when recorded, a provenance marker and
  extra _context_ in the diff banner; not itself a hard confound trigger
  (CPU / runtime / OS already capture the real confounds). Opt-in for
  privacy (§ 5).

A useful consequence of per-function hashing: when `nano-bench-compare` lines up
two same-name series whose `bodyHash` is **identical**, any measured difference is
by definition environment/noise, not code; when it **differs**, the code changed
and the difference may be real. A file-level hash could never make that per-series
statement.

**The compare tool's job (§ 3) is to diff this metadata and warn**, loudly above
the results, so an environment-confounded comparison is never read as a clean one.
The rule: **diff every `environment` property and warn on any mismatch, with
`host` the sole exclusion** — `host` is shown as provenance/context but never
triggers a warning. `seed` / `label` / `createdAt` aren't environment and aren't
diffed (they vary by design); parameter disagreements (`alpha` / `samples` /
`bootstrap`) are warned separately (§ 3).

## 3. Compare + recompute significance

> "Can we save two benchmarks, do two more, and compare recomputing the
> statistical significance?"

**Yes — exactly, and at no cost.** This is the property the whole design is built
to exploit. A saved run holds the raw sample arrays. Recomputing significance is
just calling the _existing_ `mwtest`/`kwtest` on the chosen arrays. No re-running,
no live process, no approximation beyond what an in-run test already does. The
math does not care that the arrays came from different files at different times —
which is the power, and (via § 2) the hazard.

### Comparison modes

Given baseline `B = {A, …}` and a new run `N = {A', …}`:

1. **Paired same-name before/after** (the common case): `B.A` vs `N.A` as an
   independent two-sample Mann–Whitney; one test per shared name. Answers "did
   `A` get faster between versions?" These are _independent_ samples (run i of
   `A` and run i of `A'` are unrelated), so Mann–Whitney is correct — **not**
   Wilcoxon signed-rank, which assumes matched pairs.
2. **Pooled k-sample**: throw `{B.A, B.B, N.A, N.B}` into Kruskal–Wallis for one
   omnibus + Conover–Iman post-hoc matrix across all four series. Answers "which
   of these differ from which."
3. **Arbitrary selection**: pick any subset of named series from any set of JSON
   files and compare them. Mode 1 and 2 are conveniences over this.

All three are thin layers over the unchanged significance functions. The renderer
is the _same_ significance table `nano-bench` builds (`bin/nano-bench.js:310`),
shared with `nano-bench-compare` once it is lifted out of `bin/` (see Effort), plus
a metadata-diff banner.

### Identity, matching, and the recompute α

- **A run is identified by the file path** passed to `nano-bench-compare`
  (`abc.json`, `def.json`); `--label` overrides the display string. The comparator
  only consumes files given as positionals, so a path is always available.
- **Series within a run are identified by `name`**, and compare joins
  **same-named series across files** — that is the intended operation:
  `abc.json:ghi` vs `def.json:ghi` compares two implementations of `ghi`. The path
  disambiguates the runs; matching by `name` is the feature, not a hazard.
- **When a `name` appears in more than one compared file**, the table and post-hoc
  matrix **qualify each series by its source** (`abc/ghi`, `def/ghi`) so the
  comparison is unambiguous.
- **`bodyHash` is informational, not a match gate.** Per same-named pair the banner
  reports identical body (⇒ any delta is environment/noise) vs differing body (⇒
  code changed, the delta may be real). It never silently blocks or forces a
  pairing.
- **The recompute defaults to the file's recorded α** (`params.alpha` — the
  **baseline / first file's** when comparing several), overridable with `--alpha`
  on `nano-bench-compare`. So by default a recompute reproduces the in-run verdict
  and CI rather than silently re-deciding at a different threshold. Warn when the
  source files disagree on α / `samples` / `bootstrap` (a confound, surfaced in the
  banner); `--alpha` then sets one explicit threshold for the whole recompute.

### Statistical caveats to document

- **Independent, not paired** → Mann–Whitney, not Wilcoxon (above).
- **Multiple comparisons** (Decision D7, **follow-up — not v1**): running many
  before/after tests inflates family-wise error. Kruskal–Wallis gates its post-hoc
  behind the omnibus, but that post-hoc is Fisher's LSD (no multiplicity correction
  beyond the gate) and independent paired tests have none. v1 ships uncorrected and
  documented; a later opt-in correction must stay non-parametric (Holm preferred) —
  see D7.
- **Normalization** — only valid because samples are per-iteration normalized; a
  future raw-sample mode would have to renormalize before comparing.
- **Environment confound** — restated from § 2; the banner is the mitigation.
- **Bootstrap CI is RNG-dependent** — but every run records its seed in
  `params.seed` (the `--seed <n>` value, or an auto-generated one), so
  `nano-bench-compare` recomputing a CI from the saved samples reproduces it
  exactly. Two _fresh_ runs still differ (different seeds and different samples);
  it's the recompute that's pinned. The rank _test_ is deterministic regardless;
  only the CI wiggles — and the recorded seed removes even that on recompute.

## 4. A viewer (Decision D6)

The project identity is "CLI-only, no build step" (`AGENTS.md`) — now three
binaries, still no build step and no new deps. A heavy web viewer fights that.
Tiered plan, lightest first:

1. **Render a saved file** — `nano-bench-compare results.json` reads one file and
   prints the median/CI/ops table without benchmarking — **recomputing** the stats
   from the raw samples (deterministic via `params.seed`), not trusting the stored
   FYI summary. Reuses the lifted renderer; zero new deps.
2. **Compare** — `nano-bench-compare base.json new.json [more.json …]` renders a
   before/after (or k-way) table with deltas + recomputed significance (§ 3) + the
   environment-diff banner (§ 2). The deltas come free from the in-run renderer's
   existing `compareDifference` (percentage / ratio + "faster" / "slower"), reused
   via the lift. Also zero new deps. Tiers 1 and 2 are the same binary — one file
   vs. many.
3. **Static HTML viewer (deferred — filed as its own future queue item)** — a
   single self-contained `.html` the user opens locally and drops a results JSON
   onto, plotting the sample _distributions_ (histogram / violin) as **inline SVG
   generated from the JSON**. A terminal table can't show distribution shape;
   this fills that gap. No build step, no charting dependency — hand-written
   vanilla JS emitting SVG markup. Explicitly **not** part of this round; kept
   here only so the schema stays forward-compatible (the raw samples it needs are
   already persisted by § 1).

Recommendation: ship `nano-bench-compare` (tiers 1–2) now. Tier 3 is tracked
separately in the queue as future work; the only thing the present design owes it
is keeping raw samples in the schema (which § 1 already mandates).

## 5. CLI surface (Decisions D4, D5)

Producer — `nano-bench`, alongside a normal run:

```
nano-bench bench/strings.js --json out.json               # write results JSON
nano-bench bench/strings.js plus template --json out.json --label after-opt
nano-bench bench/strings.js --json out.json --host           # record os.hostname()
nano-bench bench/strings.js --json out.json --host-name nuke # record a custom name
nano-bench bench/strings.js --json out.json --seed 12345     # pin the seed (else auto-recorded)
```

- `--json <file>` — write results to a file (Decision D4). **No stdout streaming**
  (`--json -`): a normal run already writes the styled table + progress to stdout,
  so streaming JSON there would corrupt it. A quiet/pipeable mode can be added later
  via a separate `--no-display` flag (suppress table + progress) — orthogonal, not
  needed now.
- `[methods…]` — the existing variadic positional (feature 2); the saved file
  records whichever subset was measured.
- `--label <text>` — optional display annotation (§ 1).
- `-H, --host` — boolean, opt-in, records `os.hostname()`; default absent.
  `--host-name <name>` records a chosen string instead (a stable codename, or a
  pseudonym when the real hostname is sensitive). Two flags rather than one
  optional-argument `--host [name]` on purpose: an optional-arg `--host` sitting
  before the bench-file positional makes commander greedily eat the filename as its
  value (verified on commander@15), so the required `<file>` goes missing. A boolean
  never consumes a token and `--host-name` always takes one, so the arg model stays
  unambiguous regardless of order. If both are given, `--host-name` (the explicit
  string) takes precedence.
- `--seed <n>` — pin the bootstrap RNG seed (32-bit integer). Optional: when
  omitted, a seed is auto-generated and still recorded in `params.seed`, so every
  saved run is reproducible regardless (§ 1). Pass it only to force a specific
  value — e.g. to share one resample stream across runs.

Consumer — `nano-bench-compare`, reads JSON only, never benchmarks:

```
nano-bench-compare results.json                  # render one
nano-bench-compare base.json new.json            # before/after compare
nano-bench-compare a.json b.json c.json …        # k-way compare
```

The arg model is clean because the split is clean (Decision D5): the runner owns
the bench-file positional, the comparator owns JSON positionals; neither overloads
the other. `nano-bench-compare --alpha <n>` overrides the recorded α for the
recompute (default: the baseline file's α — § 3). A future `--select <name…>` can
pick a subset of named series across the given files (§ 3 mode 3), but the default
— compare all shared names — covers the common case.

## Direct answers to the user's questions

- **Export as JSON — shape?** § 1 schema. The mandatory part is the raw
  normalized per-sample arrays; everything else is derived or metadata.
- **A viewer?** § 4 — `nano-bench-compare` renders one file or compares many (no
  new deps); a static HTML viewer with inline-SVG distribution plots is deferred
  and filed as its own future queue item.
- **What to save?** Raw samples (required) + derived summaries (convenience) +
  source/env/params metadata + a per-function `bodyHash` (§ 1).
- **Log CPU type? Hash of test file? Anything else?** CPU model/speed, runtime +
  engine version, OS/arch, total memory — yes, as _comparability guards_, not
  test inputs (§ 2). For "did the code change?", a **per-function `bodyHash`**
  (`sha256(fn.toString())`) beats a file hash, which both false-positives
  (unrelated edits in the same file) and false-negatives (imported code) — so the
  file hash is dropped. Optionally a `host` (opt-in). The `label` carries intent
  for the "which version" question.
- **Save two, run two more, recompute significance?** Yes, exactly, for free —
  the rank tests are pure functions of the saved sample arrays, so comparison is
  just re-calling `mwtest`/`kwtest` on the chosen series (§ 3), with the only new
  risk being environment confound, mitigated by the metadata banner.

## Decisions

(D1–D3 belong to docs 1–2 and D8–D10 to the histogram doc; the full cross-doc set
lives in the shared [`README.md`](./README.md) decision table.)

- **D4** — produce JSON via `--json <file>` on `nano-bench` (file only — no `-`
  /stdout, which would collide with the styled run output; a future `--no-display`
  flag could re-enable streaming), with optional `--label` / `--host` annotations;
  the measured method subset is recorded.
- **D5** — _resolved:_ view/compare live in a separate `nano-bench-compare`
  binary, not flags on `nano-bench`. Rationale: a runner and a comparator are
  distinct purposes; keeping them apart also keeps each arg model clean
  (bench-file positional vs. JSON positionals). No combined run-and-compare mode.
- **D6** — `nano-bench-compare` (render + compare) first; static inline-SVG HTML
  viewer deferred to its own future queue item.
- **D7** — _follow-up (not v1):_ v1 ships uncorrected pairwise, documented. Any
  later correction must stay within the non-parametric policy. **Holm (preferred)
  and Bonferroni qualify** — distribution-free FWER procedures acting on the α /
  p-values, assuming nothing about the data, valid under the _dependence_ of
  shared-group pairwise comparisons (Holm is uniformly more powerful). **Avoid
  Šidák-type** corrections (assume independent comparisons — violated here).
  Mechanically just a corrected α fed to the existing `zPpf` / critical-value path
  — no new distributional machinery.
- **D11** — _resolved:_ `host` is opt-in, default absent — `-H, --host` (boolean)
  records `os.hostname()`, `--host-name <name>` records a chosen string. Two flags,
  not an optional-arg `--host [name]`, so commander can't eat the bench-file
  positional. If both are given, `--host-name` (the explicit string) takes
  precedence. Privacy (the JSON is shareable) + provenance; banner _context_, not a
  hard confound.
- **D12** — _resolved:_ persist a per-function `bodyHash` (`sha256(fn.toString())`)
  as the comparability guard; drop the file-level hash (both false-positive and
  false-negative). Blind spots (closures, imported implementations) documented.
- **D13** — _resolved:_ `label` is an optional display annotation set by
  `--label`; `nano-bench-compare` identifies runs by the file path given (a
  positional index as last resort), and `label` overrides that string only. Not
  autogenerated, not mandatory.
- **D14** — _resolved:_ the bootstrap RNG seed is **always recorded** in
  `params.seed` so every saved run is exactly reproducible — `--seed <n>` (32-bit
  integer) pins a value, otherwise the CLI auto-generates one
  (`(Math.random() * 2**32) >>> 0`) **before any bootstrap draw** and records it.
  PRNG is **`mulberry32`** in a new `src/utils/prng.js` — a ~6-line inline generator
  returning `[0, 1)`, a drop-in for the `Math.random` at `src/stats.js:110`.
  Plumbing: `bootstrap` gains an optional `random = Math.random` param — the default
  keeps the library API and existing tests unchanged, so only the CLI seeds.
  **Per-series seeding:** each series gets its own stream from a seed derived off the
  run seed by its index — `mulberry32((seed + Math.imul(i, 0x9E3779B9)) >>> 0)` (a
  golden-ratio stride, so adjacent series decorrelate). That one per-series instance
  is shared across the series' three `bootstrap()` calls (median → lo → hi) so they
  draw _distinct_ resamples. Each series' CI thus depends only on its own samples +
  its derived seed + `bootstrap` count + its median→lo→hi order — **not** on the
  other series or any run-wide order, so `nano-bench-compare` reproduces any single
  series' CI in isolation (no whole-file replay). (Footgun worth a short code marker:
  leaving a `bootstrap()` call on the default `Math.random` silently breaks
  reproducibility.) Reproducibility contract: same samples + run `seed` + series
  index + `bootstrap` count + median→lo→hi order → identical CI.
  Cross-runtime determinism holds because the draw indices are bit-identical
  (`mulberry32` uses only `Math.imul` / `>>>`) **and** the summary math is pure
  IEEE-754 (`+ − × ÷`, `sqrt`, `floor`) — introducing an engine-divergent
  transcendental (`Math.pow` / `log`) into a bootstrap statistic would void it. No
  new dependency (`Math.random` isn't seedable, and is used only to source the auto
  seed); `sfc32` / `xoshiro128**` are drop-in swaps behind the same `random()`
  interface if more quality is ever wanted.

## Effort / risk

Medium–large, but the statistics are entirely reused — no new tests to validate
mathematically. The work is I/O and plumbing:

- **Refactor first:** split sample-acquisition from result-rendering in
  `bin/nano-bench.js`. The table renderer and the 2-function matrix fabrication
  (`bin/nano-bench.js:~310`) are inline in the bin today; lift them into `src/`
  (the same "move `bin/` logic into `src/` for reuse + testability" pattern the
  significance/baseline work used) so both `nano-bench` and `nano-bench-compare`
  share one renderer and one significance serializer.
- Serialize/deserialize the schema; capture metadata (`node:os`, `node:process`,
  `fn.toString()` hashing).
- `mulberry32` (`src/utils/prng.js`) threaded into `bootstrap` (seed from `--seed`
  or auto-generated and recorded — see D14).
- The new `nano-bench-compare` binary: arg parsing, series matching + display
  qualification (§ 3), the metadata-diff banner, reusing the unchanged
  `mwtest` / `kwtest` + the lifted renderer.

Portability snags to scope: cross-runtime `os` / `process` capture (Node vs Bun vs
Deno, incl. `os.hostname()`), and especially **engine-version detection**, which
has no uniform API — Node `process.versions.v8`, Deno `Deno.version.v8`, Bun
differs — so `runtime.engine` must degrade to `null` (banner noting "engine
unknown") rather than assume a field that drives the confound warning.

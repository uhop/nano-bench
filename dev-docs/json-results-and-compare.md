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
  - Can we save two benchmarks, run two more, and compare *recomputing*
    significance?

## 1. What to persist (and what not to)

### Persist the raw normalized samples — non-negotiable

Significance is a pure function of the per-sample arrays (`mwtest`/`kwtest`). If
the JSON does not contain the raw normalized per-iteration times, significance
can never be recomputed from it — only re-measured by re-running the code, which
defeats the point of a saved baseline. So **the sample array is the irreplaceable
payload**; everything else is either derived (regenerable) or metadata.

Store samples at **full float precision** (no rounding) so a recomputed bootstrap
CI and rank test reproduce the original exactly (modulo bootstrap RNG). Unit:
**milliseconds per iteration** — the value already produced by `normalizeSamples`
(`bin/nano-bench.js:138`). 100 samples × a few functions is a few KB; inline JSON
is fine, no external blob store needed.

### Persist derived summaries too — for cheap viewing

A viewer that only wants to *show* a saved run shouldn't have to re-bootstrap.
Store `median`, `lo`, `hi`, `mean`, `stdDev`, `opsPerSec` alongside the samples.
They are redundant with the samples (and a recompute can ignore them), but they
make a read-only render free.

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
    "methods": ["plus", "template"],
    "fileHash": "sha256:1f3a…"
  },

  "environment": {
    "runtime": { "name": "node", "version": "22.11.0", "engine": "v8 12.4" },
    "os": { "platform": "linux", "release": "7.0.0", "arch": "x64" },
    "cpu": { "model": "AMD Ryzen 9 …", "count": 16, "speedMHz": 3600 },
    "loadavg": [0.3, 0.4, 0.5],
    "totalmemMB": 64000
  },

  "params": {
    "ms": 50, "minIterations": 1, "samples": 100,
    "bootstrap": 1000, "alpha": 0.05, "parallel": false,
    "unit": "ms-per-iteration"
  },

  "results": [
    {
      "name": "plus",
      "reps": 100000,
      "samples": [0.000123, 0.000125, "… 100 values …"],
      "summary": {
        "median": 0.000124, "lo": 0.000119, "hi": 0.000131,
        "mean": 0.000126, "stdDev": 0.0000044, "opsPerSec": 8064516,
        "ci": "bootstrap-percentile"
      }
    }
  ],

  "significance": {
    "test": "mann-whitney-u",
    "alpha": 0.05,
    "statistic": -3.42,
    "limit": -1.959,
    "different": true,
    "matrix": [[false, true], [true, false]]
  }
}
```

Field rationale:

- `schemaVersion` — lets future viewers migrate; bump on any breaking change.
- `label` — free-form human tag ("before-opt", "after-opt", a version string, or
  a commit SHA *if the user happens to use git*). This is the **primary** way a
  person says *which* run is which when comparing, and it assumes nothing about
  the environment. nano-bench is used outside git too, so we deliberately do
  **not** auto-capture a VCS revision — a user who wants the SHA recorded simply
  passes it as the label.
- `source.fileHash` — `sha256` of the bench file bytes. Dual purpose: provenance,
  and a guard against accidentally comparing against a stale baseline of a
  *different* file. Note the limitation under § metadata.
- `environment.*` — comparability guards, **not** test inputs (see § metadata).
- `params.unit` — names the sample unit explicitly so a future change can't
  silently reinterpret old files.
- `significance` — the *result* of the in-run test, with the structured test
  identity that [`significance-reporting.md`](./significance-reporting.md) also
  uses. Present only when ≥2 series were measured (a single baseline omits it).

### What NOT to store

- Don't store ANSI-styled table strings — store data, render on read.
- Don't store only median+CI without samples — that's the one lossy mistake that
  forecloses everything in § 3.
- Don't auto-capture git (or any VCS) state — nano-bench runs fine outside a
  repo; the `label` covers "which version" without the assumption.

## 2. Metadata — why log CPU / runtime / OS / hash

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
- **`loadavg` / free memory** — a loaded machine inflates variance and shifts the
  median; worth recording so an anomalous baseline can be explained.
- **Bench-file hash** — answers "are we benchmarking the same harness?" Its
  limitation: if the code under test is an *imported module* (not inlined in the
  bench file), the file hash is unchanged while the real subject changed. That is
  precisely the "v1 vs v2 implementation" case. So the hash is necessary but not
  sufficient — the `label` carries the real "which version" answer (a user on git
  can put the SHA there; one who isn't can use a version number or free-form tag).
  Document this explicitly so users don't over-trust the hash.

**The compare tool's job (doc § 3) is to diff this metadata and warn** when CPU,
runtime, OS, or hash differ between the runs being compared — loudly, above the
results, so an environment-confounded comparison is never read as a clean one.

## 3. Compare + recompute significance

> "Can we save two benchmarks, do two more, and compare recomputing the
> statistical significance?"

**Yes — exactly, and at no cost.** This is the property the whole design is built
to exploit. A saved run holds the raw sample arrays. Recomputing significance is
just calling the *existing* `mwtest`/`kwtest` on the chosen arrays. No re-running,
no live process, no approximation beyond what an in-run test already does. The
math does not care that the arrays came from different files at different times —
which is the power, and (via § 2) the hazard.

### Comparison modes

Given baseline `B = {A, …}` and a new run `N = {A', …}`:

1. **Paired same-name before/after** (the common case): `B.A` vs `N.A` as an
   independent two-sample Mann–Whitney; one test per shared name. Answers "did
   `A` get faster between versions?" These are *independent* samples (run i of
   `A` and run i of `A'` are unrelated), so Mann–Whitney is correct — **not**
   Wilcoxon signed-rank, which assumes matched pairs.
2. **Pooled k-sample**: throw `{B.A, B.B, N.A, N.B}` into Kruskal–Wallis for one
   omnibus + Conover–Iman post-hoc matrix across all four series. Answers "which
   of these differ from which."
3. **Arbitrary selection**: pick any subset of named series from any set of JSON
   files and compare them. Mode 1 and 2 are conveniences over this.

All three are thin layers over the unchanged significance functions. The renderer
is the *same* significance table the CLI already builds (`bin/nano-bench.js:310`),
plus a metadata-diff banner.

### Statistical caveats to document

- **Independent, not paired** → Mann–Whitney, not Wilcoxon (above).
- **Multiple comparisons** (Decision D7): running many before/after tests inflates
  family-wise error. Kruskal–Wallis gates its post-hoc behind the omnibus, but
  the post-hoc itself is Fisher's LSD (no multiplicity correction beyond the
  gate), and independent paired tests have none. For k functions compared
  pairwise, offer an opt-in Holm (or Bonferroni) adjustment on the α; document the
  default as uncorrected so users aren't surprised.
- **Normalization** — only valid because samples are per-iteration normalized; a
  future raw-sample mode would have to renormalize before comparing.
- **Environment confound** — restated from § 2; the banner is the mitigation.
- **Bootstrap CI is RNG-dependent** — recomputed CIs differ slightly run to run
  unless seeded. Optional: record/accept a seed for reproducible CIs. The rank
  *test* is deterministic; only the CI wiggles.

## 4. A viewer (Decision D6)

The project identity is "CLI-only, no build step, two runtime deps" (`AGENTS.md`).
A heavy web viewer fights that. Tiered plan, lightest first:

1. **CLI re-render** — `nano-bench --view results.json` reads a saved file and
   prints the existing median/CI/ops table without benchmarking. Reuses the
   current renderer; zero new deps. Ship this first.
2. **CLI compare view** — `nano-bench --compare base.json [new.json]` renders a
   before/after table with deltas + recomputed significance (§ 3) + the
   environment-diff banner (§ 2). Also zero new deps.
3. **Static HTML viewer (deferred — filed as its own future queue item)** — a
   single self-contained `.html` the user opens locally and drops a results JSON
   onto, plotting the sample *distributions* (histogram / violin) as **inline SVG
   generated from the JSON**. A terminal table can't show distribution shape;
   this fills that gap. No build step, no charting dependency — hand-written
   vanilla JS emitting SVG markup. Explicitly **not** part of this round; kept
   here only so the schema stays forward-compatible (the raw samples it needs are
   already persisted by § 1).

Recommendation: do 1 and 2 now. Tier 3 is tracked separately in the queue as
future work; the only thing the present design owes it is keeping raw samples in
the schema (which § 1 already mandates).

## 5. CLI surface (Decisions D4, D5)

Producer (on `nano-bench`, alongside a normal run):

```
nano-bench bench/strings.js --json out.json          # write results JSON
nano-bench bench/strings.js --json - > out.json       # to stdout
nano-bench bench/strings.js --json out.json --label after-opt
```

Consumers — two open shapes:

- **Flags on `nano-bench`** (Decision D5, leaning): `--view <file>`,
  `--compare <baseline> [current]`. Branch early before the file-import/measure
  path. Pro: one binary, discoverable. Con: complicates the arg model — `--view`
  takes a JSON, the positional normally takes a *bench* file.
- **A third `bin/`** (`nano-bench-compare`): matches the existing
  "several small binaries" pattern (`nano-bench` + `nano-watch`). Cleaner arg
  model, more `package.json#bin` surface. Reach for this only if the flag
  approach makes the `<file>` positional ambiguous.

Resolve D5 once the flag-vs-positional ambiguity is prototyped on paper; don't
add a binary preemptively.

## Direct answers to the user's questions

- **Export as JSON — shape?** § 1 schema. The mandatory part is the raw
  normalized per-sample arrays; everything else is derived or metadata.
- **A viewer?** § 4 — CLI re-render + compare first (no new deps); a static HTML
  viewer with inline-SVG distribution plots is deferred and filed as its own
  future queue item.
- **What to save?** Raw samples (required) + derived summaries (convenience) +
  source/env/params metadata (§ 1).
- **Log CPU type? Hash of test file? Anything else?** Yes to all, as
  *comparability guards*, not test inputs (§ 2): CPU model/speed, runtime +
  engine version, OS/arch, loadavg/memory, bench-file `sha256`, plus a `label`
  for the real "which version" signal (a file hash misses changes in imported
  code under test; we don't assume git, so the label carries the version).
- **Save two, run two more, recompute significance?** Yes, exactly, for free —
  the rank tests are pure functions of the saved sample arrays, so comparison is
  just re-calling `mwtest`/`kwtest` on the chosen series (§ 3), with the only new
  risk being environment confound, mitigated by the metadata banner.

## Decisions

- **D4** — produce JSON via `--json <file>` (`-` = stdout) on `nano-bench`.
- **D5** — view/compare as flags first; third binary only if the arg model
  demands it.
- **D6** — CLI re-render + compare first; static inline-SVG HTML viewer deferred
  to its own future queue item.
- **D7** — default to uncorrected pairwise; offer opt-in Holm for many
  comparisons; document clearly.

## Effort / risk

Medium–large, but the statistics are entirely reused — no new tests to validate
mathematically. The work is I/O and plumbing: serialize/deserialize, capture
metadata (`node:os`, `node:process`, file hashing), a metadata-diff banner, and
routing the loaded sample arrays back into the unchanged `mwtest`/`kwtest` +
existing renderer. Cross-runtime metadata capture (Node vs Bun vs Deno
`os`/`process` APIs) is the one portability snag to scope.

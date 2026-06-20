# Implementation plan — JSON results, baselines & `nano-bench-compare`

Build plan for [`json-results-and-compare.md`](./json-results-and-compare.md)
(the settled design). File-by-file, in dependency order, with a test plan and
per-phase verification gates.

**v1 scope:** JSON producer (`--json`), `nano-bench-compare` (view + compare),
`bodyHash`, always-recorded seed, `--label` / `--host` / `--host-name` /
`--alpha`. **Out of scope** (deferred): multiple-comparison correction (D7),
`--no-display`, `--select`, the HTML viewer.

> **As built (status):** shipped 2026-06-17 across these phases. Two deviations
> from the plan below: (1) no separate `bench/render/compare-table.js` was
> created — `nano-bench-compare` reuses `summary-table.js` + `significance-table.js`
> directly (the `writeSignificance` renderer), so the comparison table is the
> shared renderer, not a new module; (2) the deferred `--correction` (D7) and the
> `--pooled` compare mode (D15) landed in later passes (2026-06-19/20), and
> `--histogram` was added to `nano-bench-compare` too. Treat the module names and
> `renderSignificance`/`renderXxx` function names below as the plan's working
> labels; the shipped exports are `writeSignificance` / `summaryTable` /
> `computeSignificance`.

## Module layout (new = ＋, changed = ～)

```
src/
  stats.js                            ～ bootstrap() + optional `random`; + exactSummary / bootstrapSummary (lifted)
  utils/prng.js                       ＋ mulberry32
  utils/body-hash.js                  ＋ bodyHash(fn) → "sha256:…"
  bench/significance.js               ＋ computeSignificance + significanceMatrix (lifted; bench/compare.js refactored onto it)
  bench/results/environment.js        ＋ captureEnvironment / diffEnvironments
  bench/results/build.js              ＋ buildResultsObject (schema v1 assembly)
  bench/results/load.js               ＋ loadResults (parse + schemaVersion check)
  bench/render/summary-table.js       ＋ per-function median/CI/ops table (lifted)
  bench/render/significance-table.js  ＋ "Significance:" line + verbose + matrix table (lifted)
  bench/render/compare-table.js       ＋ before/after + k-way table (new)
bin/
  nano-bench.js                       ～ rewired to the lifted modules; + --json/--label/--host/--host-name/--seed
  nano-bench-compare.js               ＋ new binary
package.json                          ～ bin += nano-bench-compare
AGENTS.md                             ～ "two binaries" → three
```

Placement follows the existing split: `src/bench/` is `bin/`-supporting code
(joining `runner.js` / `select-functions.js` / `compare.js`); `src/stats.js` and
`src/stats/` stay statistical; `src/utils/` is general. So `results/` and `render/`
nest under `bench/`; the summary helpers fold into `src/stats.js` (composition of
its own primitives); the significance selector lands in `src/bench/significance.js`,
which `bench/compare.js` is refactored to share.

`console-toolkit`'s `compareDifference` (already a dep, `bin/nano-bench.js:14`) is
**reused** for deltas, not lifted. Everything under `src/` is already importable
via the `./*` export; add genuinely-public symbols to `src/index.js` if we want
them in the library surface (`mulberry32`, `bootstrapSummary`,
`computeSignificance`, `buildResultsObject`, `captureEnvironment`, `bodyHash`).

## Phase 1 — Refactor (decouple acquisition from rendering; **no behaviour change**)

The riskiest phase: lift the shared logic out of `bin/` so both binaries use it,
proving identical output for `nano-bench`. Gate on a byte-identical CLI smoke
diff before/after.

1. **`src/stats.js` ～** — `bootstrap(fn, data, n = 1000, random = Math.random)`;
   the resample line uses `random()`. Default preserves today's behaviour and the
   existing API/tests.
2. **`src/stats.js` ～ (extend)** — lift `getStats`/`getBootstrapStats`
   (`bin:131-144`) here as general summary helpers (they compose the file's own
   `bootstrap` / `mean` / `getWeightedValue`), parameterized off module-level
   `options`:
   - `exactSummary(samples, {alpha})` → `{median, lo, hi}`.
   - `bootstrapSummary(samples, {alpha, bootstrap, random})` → `{median, lo, hi}`,
     calling `bootstrap(…, random)` ×3 (median→lo→hi) sharing the **one** `random`.
   - `mean` / `stdDev` for the JSON `summary` are already here; `opsPerSec` is
     `1000 / median`, computed at build time.
3. **`src/bench/significance.js` ＋** — lift the test selection + matrix
   fabrication (`bin:302-318`). `src/bench/compare.js` **already** selects
   mwtest/kwtest and `bin/` duplicates it inline — refactor both onto this shared
   helper (de-dups the current divergence):
   - `computeSignificance(seriesArrays, alpha)` → normalized
     `{test, value, alpha, limit, different, groupDifference?, C?}` (mirrors the
     test returns — this is exactly the JSON `significance` block; **no** `matrix`).
   - `significanceMatrix(result, k)` → boolean grid for the renderer (fabricates the
     2×2 for the pair case from `different`).
4. **`src/bench/render/summary-table.js` ＋** — lift `makeTableData`/`report`
   (`bin:197-245`) to `summaryTable({names, stats, iterations})` → strings, plus
   `summaryHeader({alpha, bootstrap, samples, ms|iterations})`. The live updater in
   `bin` wraps `summaryTable` with partial `stats`; the final static table is the
   shared one.
5. **`src/bench/render/significance-table.js` ＋** — lift `bin:320-398` to
   `renderSignificance({result, stats, names, alpha, verbose})` → strings (the
   `Significance:` line, verbose z/H/C lines, the comparison matrix table with
   `compareDifference` deltas + faster/slower + 🐇/🐢).
6. **`bin/nano-bench.js` ～** — rewire to call the five modules above; delete the
   inlined copies. No new flags yet.

**Gate:** `npm test` + `js-check` + `prettier --check`, and a CLI smoke
(`node bin/nano-bench.js bench/<x>.js …`) producing output byte-identical to a
pre-refactor capture (2- and 3-function runs, `--verbose`, single-function
baseline).

## Phase 2 — Seed (always recorded, per-series)

7. **`src/utils/prng.js` ＋** — `mulberry32(seed)` → `() => [0,1)`, default + named
   export.
8. **`bin/nano-bench.js` ～** — add `--seed <n>` (`toInt`). Compute
   `seed = (options.seed ?? Math.random() * 2**32) >>> 0` **before** the benchmark
   loop and record it. Per D14, **seed each series independently**:
   `bootstrapSummary(samplesᵢ, {…, random: mulberry32((seed + Math.imul(i, 0x9E3779B9)) >>> 0)})`,
   where `i` is the series' index in `results`. The per-series instance is shared
   across that series' median→lo→hi calls. So each series' CI reproduces in
   isolation from `(run seed, series index, its samples, bootstrap count)` — no
   whole-file replay.

**Gate:** two runs with the same `--seed` over the same samples reproduce the same
CI (unit test on `bootstrapSummary`).

## Phase 3 — Producer (`--json`)

9. **`src/utils/body-hash.js` ＋** — `bodyHash(fn)` → `"sha256:" + sha256hex(fn.toString())`
   via `node:crypto` (`createHash`, available on Node/Bun/Deno).
10. **`src/bench/results/environment.js` ＋** —
    - `captureEnvironment({host, hostName})` → `{host?, runtime{name,version,engine}, os{platform,release,arch}, cpu{model,count,speedMHz}, totalmemMB}` from `node:os` + `node:process`. `host` only when `--host` (→ `os.hostname()`) or `--host-name` (→ string; wins). Engine: `process.versions.v8` / `Deno.version?.v8` / Bun best-effort → `null` when unknown.
    - `diffEnvironments(envs[])` → differing property paths, **excluding `host`** (for the banner).
11. **`src/bench/results/build.js` ＋** — `buildResultsObject({pkg, label, source, environment, params, series, significance})` → schema v1 (`schemaVersion`, `tool`=pkg.name, `toolVersion`=pkg.version, `createdAt`=`new Date().toISOString()`, …). `series[i] = {name, bodyHash, reps, samples, summary}`. `significance` omitted when <2 series.
12. **`bin/nano-bench.js` ～** — add `--json <file>` (file only), `--label <text>`, `-H/--host`, `--host-name <name>`. After the run: assemble `source` (`args[0]` / `options.export` / `names`), `params` (ms|iterations, minIterations, samples, bootstrap, seed, alpha, parallel), per-series `{samples=results[i], reps=iterations[i], summary=bootstrapSummary + mean/stdDev + opsPerSec, bodyHash(fns[names[i]])}`, and the `computeSignificance` result; write via `buildResultsObject`.

**Gate:** CLI writes JSON; a test reads it back through `loadResults` and checks shape + that `significance` is absent for a single-function run.

## Phase 4 — `nano-bench-compare`

13. **`package.json` ～** — `bin["nano-bench-compare"] = "./bin/nano-bench-compare.js"`.
14. **`src/bench/results/load.js` ＋** — `loadResults(path)` → `JSON.parse` + assert `schemaVersion === 1` (clear error otherwise).
15. **`src/bench/render/compare-table.js` ＋** — before/after + k-way table: selected series (qualified `file/name` on collision) + recomputed summaries + significance, reusing `summaryTable` / `renderSignificance` / `compareDifference`.
16. **`bin/nano-bench-compare.js` ＋** — commander CLI: `<files...>` (1+), `--alpha <n>` (default = baseline/first file's `params.alpha`), `-v/--verbose`.
    - Load files; pick α; collect series by `name` across files (qualify on collision); **always recompute** each series' summary from its samples via `bootstrapSummary(…, mulberry32((file.params.seed + Math.imul(j, 0x9E3779B9)) >>> 0))`, where `j` is the series' index in its source file (per-series seed, D14 — reproduces in isolation, no whole-file replay); for ≥2 series recompute significance via `computeSignificance(selected, α)`.
    - Emit the env-diff banner (`diffEnvironments`, host excluded) + param-disagreement warning (`alpha`/`samples`/`bootstrap`) **above** the table.
    - No `node:`-import of bench files, no measure path.

**Gate:** produce two JSONs with `nano-bench`, compare them; identical-α recompute reproduces each run's stored verdict; `--alpha` override recomputes CIs/verdict.

## Phase 5 — wiring, cross-runtime, docs

17. **`src/index.js` ～** — export the public symbols (above) if desired.
18. **Cross-runtime test** — `mulberry32` + `bootstrapSummary` give a bit-identical CI for a known seed/samples on Node/Bun/Deno (pins the D14 claim).
19. **`AGENTS.md` ～** — "two binaries" → three; mention `nano-bench-compare`.
20. **Release docs (deferred to publish, per `/ai-docs-update`)** — README, `llms.txt` / `llms-full.txt`, wiki: `--json`, the compare binary, the new flags.

## Test plan

| Test file                        | Covers                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `tests/test-prng.js` ＋          | mulberry32: known-seed→known-sequence vector, range `[0,1)`, determinism                 |
| `tests/test-summary.js` ＋       | exact vs bootstrap summary; seeded reproducibility; call-order                           |
| `tests/test-significance.js` ～  | `computeSignificance` normalized shape (MW no-matrix, KW + `groupDifference` + `C`)      |
| `tests/test-body-hash.js` ＋     | stable hash for fixed source; flips on body change; `sha256:` prefix                     |
| `tests/test-environment.js` ＋   | `diffEnvironments` (host excluded, nested props); capture shape; host omitted by default |
| `tests/test-results-build.js` ＋ | schema assembly; required fields; significance omitted for 1 series; optional host       |
| `tests/test-results-load.js` ＋  | build→load round-trip; `schemaVersion` mismatch errors                                   |
| cross-runtime smoke              | identical recomputed CI Node/Bun/Deno                                                    |

Binaries have no unit harness (per project learnings) — the route to coverage is
the pure `src/` modules above, plus CLI smoke runs. `prettier` + `js-check` clean,
cross-runtime `npm test` green at each gate.

## Resolved

- **Per-series seeding (D14).** Each series is seeded independently
  (`mulberry32((seed + Math.imul(i, 0x9E3779B9)) >>> 0)`, golden-ratio stride) so its
  CI reproduces in isolation — no whole-file replay. Folded into D14 in the design
  doc.

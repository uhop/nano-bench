# Design note — macro-benchmarking, system/I/O metrics, cluster analysis

Design + decision record for three related directions that extend nano-bench
past its current tight-hot-loop focus. Status: **research + proposal, 2026-07-06**
— nothing shipped; this note states the problems, weighs options against the
project's constraints, and records leanings. Companion to the existing
[`json-results-and-compare.md`](./json-results-and-compare.md) (shares the sample
data model) and the vault queue item "ms-scale I/O collection mode."

External facts here were gathered and adversarially verified in a focused
research pass (2026-07-06); primary sources are cited inline.

## Scope

Three directions, designed together because they share the nonparametric sample
model and, ultimately, the same statistics kernel:

- **(A) Macro-benchmarking slow whole processes** — a modest number of repeated
  runs (tens, not millions) of a slow command/process, instead of batching a
  hot loop to defeat timer resolution.
- **(B) System + I/O metrics per run** — richer per-run accounting (CPU, memory,
  file/network I/O, faults) for lightweight profiling, not just wall-clock.
- **(C) Cluster analysis** — separate a multimodal distribution (fast-path vs
  slow-path, cache hit vs miss) into its modes and report each apart.

## The principle still holds — and it's the differentiation

nano-bench's [one principle](./README.md#the-one-principle-the-whole-design-rests-on)
— nonparametric, rank-based, raw-samples-as-truth — is not just preserved here;
for the macro path it is the **competitive edge**. The reference macro-benchmark
tools all report _parametric_ summaries only:

- **hyperfine** (the reference tool) reports mean ± a CI on the mean, plus
  stddev/min/median/max — **no percentiles, no nonparametric inference**
  ([github.com/sharkdp/hyperfine](https://github.com/sharkdp/hyperfine)).
- **multitime** attaches a parametric t/z CI to the **mean only** (median is a
  bare point); **cmdperf** reports min/max/mean/median/stddev, no percentiles
  ([multitime](https://github.com/ltratt/multitime),
  [cmdperf](https://github.com/miklosn/cmdperf)).

So a whole-process benchmarker that reports \*\*bootstrap median CI + p90/p99 tails

- Mann–Whitney U between two commands\** — nano-bench's existing engine, pointed
  at tens of process runs — occupies a niche none of them fill. This is the same
  argument the blog *200ms ± 500ms\* makes: process latency is skewed and
  long-tailed, so mean ± stddev is the wrong summary, and the tail is the story.

## (A) Macro-benchmarking slow processes

**Problem.** `findLevel` batches a function until one call takes ≥ threshold ms —
the right move at ns/µs scale to defeat timer resolution. At ms/s scale a single
whole-process run is directly measurable (batch = 1), batching would erase the
per-run distribution, and the interesting quantity is the run-to-run spread and
tail, not the mean of a million iterations.

**Prior art (verified).** hyperfine is the model to learn from:

- **Run count:** adaptive — at least 10 runs _and_ at least 3 s of measurement,
  no upper limit, `-r/--runs` forces an exact count. cmdperf/multitime use a
  fixed N. **None** use a variance- or CI-driven adaptive stop.
- **Warmup:** `-w/--warmup N` runs before measurement to fill (disk) caches.
- **Per-run setup:** `-p/--prepare CMD` runs before _each_ timed run — the
  canonical cold-cache recipe (`sync; echo 3 | sudo tee /proc/sys/vm/drop_caches`).
- **Outlier detection:** modified z-scores, with distinct warnings for caching
  (first run slower) vs interference from other programs — lightweight, portable.

**Design leanings.**

- A macro mode (a `--process`/`--macro` flag on `nano-bench`, or a `nano-bench-io`
  sibling — see the queue item) that runs a spawned command tens of times.
- **Warmup + per-run prepare/teardown hooks**, matching hyperfine's warm-vs-cold
  distinction. In-process benchmark modules get `warmup()`/`prepare()`/`teardown()`
  exports; a spawned command gets `--warmup N` and `--prepare CMD`.
- **Run-count policy:** support fixed N _and_ a time budget _and_ — the novel
  option none of the prior art has — an **adaptive stop on median-CI width**
  (keep running until the bootstrap CI on the median is tight enough or a cap is
  hit). This is the nonparametric analogue of criterion's adaptive sampling.
- Reuse the existing engine wholesale: normalized samples → bootstrap median CI +
  percentiles + MW U / Kruskal–Wallis across commands. Add modified-z outlier
  **notes** (caching vs interference), consistent with the histogram's p1–p99
  outlier-note precedent (D8).

## (B) System + I/O metrics per run

**Problem.** For a slow process, wall-clock alone is a thin signal. Memory, page
faults, context switches, and especially file/network I/O are what a developer
profiling a slow process needs. The constraint: collect as much as possible
**without tracing and without elevated privilege**, cross-runtime.

**What's portable (verified).**

- **`getrusage` via `process.resourceUsage()`** — uniform across Node, Bun
  (`Bun.spawn().resourceUsage()`), and Deno: CPU user/sys time, `ru_maxrss` peak
  memory, page faults, voluntary/involuntary context switches. Read from the
  child's own kernel accounting — no tracing, no privilege
  ([getrusage(2)](https://man7.org/linux/man-pages/man2/getrusage.2.html)).
  **Caveats:** many fields are zeroed/unmaintained on Linux; Node marks IPC/swap
  and fine-grained memory unsupported everywhere, and context switches / major
  faults unsupported on Windows; **`ru_maxrss` units differ — KiB on Linux, bytes
  on macOS** — so the collector must normalize.
- **Linux `/proc/[pid]/io`** separates **logical** I/O (`rchar`/`wchar` — bytes
  passed to `read()`/`write()`, including page-cache hits and buffered writes)
  from **physical** I/O (`read_bytes`/`write_bytes` — bytes moved at the block
  layer), plus `syscr`/`syscw` syscall counts
  ([proc_pid_io(5)](https://man7.org/linux/man-pages/man5/proc_pid_io.5.html)).
  Linux-only, ptrace-gated — readable for a child we spawn.
- **Network-specific bytes are _not_ available** from a process's own counters —
  that needs eBPF/dtrace tracing, which is out of the zero-privilege scope. The
  portable proxy is syscall counts (`syscr`/`syscw`).

**Design leanings — a tiered collector that degrades per platform.**

- **Tier 1 (portable, always):** `process.resourceUsage()` — CPU, `ru_maxrss`
  (unit-normalized), page faults, context switches. Cross-runtime.
- **Tier 2 (Linux):** `/proc/[pid]/io` logical + physical bytes and syscall
  counts, when spawning a child on Linux. (macOS approximation: `rusage_info`
  `RUSAGE_INFO_V*` `ri_diskio_bytesread/written` via libproc — open item.)
- **Tier 3 (out of scope):** anything needing strace/dtrace/eBPF — document
  "run your tracer alongside" rather than build it in.
- Report per-run and as a distribution (a slow run's `ru_maxrss` tail matters as
  much as its time); persist into the JSON results so `nano-bench-compare` can
  diff memory/I/O across runs the same way it diffs timing.

## (C) Cluster analysis — separating multimodal distributions

**Problem.** Process/latency distributions are often multimodal (fast path vs
slow path, cache hit vs miss). A single median then lies the same way a mean does
— the blog's 90/10 cache is two populations wearing one number. The histogram
work (D17's `meanSparse` multimodality nudge) already _hints_ at this; clustering
makes it explicit and reports each mode apart.

**Verified, dependency-light approach.**

- **Gate first with Hartigan's dip test** — a nonparametric unimodality test
  (dip statistic = min over unimodal CDFs of the max distance to the empirical
  CDF, calibrated against the uniform)
  ([Hartigan & Hartigan 1985](https://projecteuclid.org/journals/annals-of-statistics/volume-13/issue-1/The-Dip-Test-of-Unimodality/10.1214/aos/1176346577.full)).
  If unimodal, report a single distribution; only split if the dip test says so.
- **Pick the modes with X-means** (auto-K over `[Kmin, Kmax]` by alternating
  K-means and centroid-splitting, keeping the best BIC/AIC) — small and pure-JS-
  friendly for 1-D data
  ([Pelleg & Moore](https://www.semanticscholar.org/paper/d7d385f45c096082812deb1623e5af2c2915b4a9)),
  or KDE mode-finding.
- **Caveat (verified):** BIC/AIC recover the true mode count only asymptotically
  and only under i.i.d.-Gaussian assumptions that benchmark latencies (skewed,
  heavy-tailed, autocorrelated) **violate**
  ([scikit-learn mixture](https://scikit-learn.org/stable/modules/mixture.html)).
  So treat the mode count as a **heuristic**: report per-cluster nonparametric
  stats (median, CI, percentiles) and cluster weights (the fast-path/slow-path
  split as a %), and let the user confirm rather than asserting "there are 2
  modes." This matches the project's habit of outlier _notes_ over silent
  decisions.
- Feeds the deferred HTML/SVG viewer (queue Priority −1) and the ridgeline
  histogram: per-cluster overlays are the natural visualization.

## Open items (from the research pass; resolve before building the affected part)

- **Coordinated omission** (Gil Tene): a closed-loop macro benchmark that waits
  for each run under-samples the tail during slow periods. For tens-of-runs whole
  processes this is less acute than for high-rate load testing, but a note in the
  output (or an open-loop option) is worth it.
- **Streaming quantiles for unbounded per-op I/O:** **t-digest** (mergeable,
  accurate at extreme quantiles, no fixed range) looks the better fit than
  HdrHistogram (fixed value range) for the per-operation tail case, but confirm
  against the current sample-array model before adding a sketch at all.
- **Steady-state / warmup detection:** the changepoint/CV-based method from
  Kalibera & Jones, _Rigorous benchmarking in reasonable time_, for auto-discarding
  JIT/TCP/HPACK warmup in a small number of slow runs.
- **Effect sizes — shipped 2026-07-08** for the Mann–Whitney pair case: A12 derived from the U rank sums in `mwtest` (zero extra computation), δ = 2·A12 − 1, rendered with Romano magnitude labels wherever the shared significance renderer runs (all three binaries), persisted in the JSON `significance` object. Still open: a pairwise δ matrix for the Kruskal–Wallis post-hoc. Original note: Cliff's delta / Vargha–Delaney A12 (nonparametric, pair
  naturally with MW U) to report _how much_ faster beyond significance; MAD-based
  robust outliers; lag-1 autocorrelation to check run independence. All small
  pure-JS additions.
- **Profiling exports:** emit folded stacks (flamegraph), V8 `--cpu-prof`, or
  Chrome trace JSON for a spawned child, so downstream tools can profile.
  Cross-runtime capture differs (Node `--cpu-prof`, Deno `--v8-flags`, Bun).

## Decisions

| #   | Decision                                                        | Leaning                                                                                                      |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DM1 | Macro mode: flag on `nano-bench`, or a `nano-bench-io` sibling? | Sibling `nano-bench-io` sharing the stats engine (per the queue item) — keeps the hot-loop runner clean      |
| DM2 | Run-count policy for slow processes                             | Support fixed N + time budget + **adaptive-on-median-CI-width** (the novel option); default time-budgeted    |
| DM3 | Warmup / per-run setup                                          | Adopt hyperfine's split: `--warmup N` (pre-runs) + `--prepare`/`teardown` hooks (per-run reset)              |
| DM4 | Summary statistics for the macro path                           | Nonparametric — bootstrap median CI + p90/p99 tails + MW U/KW — **not** mean±stddev (the differentiation)    |
| DM5 | Outlier handling                                                | Modified-z-score **notes** (caching vs interference), never silent trimming — consistent with D8             |
| DM6 | System-metric collection scope                                  | Tiered: Tier 1 rusage (portable), Tier 2 Linux `/proc/pid/io`, Tier 3 tracing out of scope; degrade + note   |
| DM7 | `ru_maxrss` unit normalization                                  | Normalize KiB(Linux)/bytes(macOS) to bytes at collection; document per-field platform support                |
| DM8 | Multimodal handling                                             | Dip-test gate → X-means/KDE modes → per-cluster nonparametric stats + weights; mode count is a **heuristic** |
| DM9 | Where the new statistics live                                   | In the shared stats kernel (see below), not duplicated — both nano-bench and tape-six consume them           |

### Resolutions (2026-07-08, with Eugene)

- **v1 target — in-process modules first.** Same benchmark-module format
  (functions consume `n`, called with `n = 1`, awaited); the engine already
  lands on batch = 1 at ms scale, so v1 is per-run collection policy +
  reporting. Spawned commands (the hyperfine niche, `--prepare CMD`, and the
  (B) child metrics) are v2.
- **DM1 — sibling binary `nano-bench-io` in this package** (fourth bin, the
  `nano-bench-compare` model), sharing `src/` wholesale.
- **DM2 — default run policy: time budget + min runs** — keep running while
  `runs < --min-runs` (10) _or_ `elapsed < --budget` (5000 ms), per function.
  `-r/--runs N` forces an exact count; `--stable <pct>` is the adaptive stop
  (run until the bootstrap CI on the median is ≤ pct% of the median, checked
  periodically after min-runs; `--max-runs` caps both adaptive and default
  modes).
- **DM9 — new statistics live in-repo** under `src/stats/` (quantiles, MAD /
  modified z); kernel extraction happens when the tape-six `t.bench` work is
  scheduled.
- v1 surface: optional module-level `prepare()` / `teardown()` **named
  exports** awaited untimed around every run (cold-state resets); `--warmup N`
  discarded runs; p90/p99 tails with a coarse-tail note on small N; modified-z
  outlier notes (caching vs interference, slow side only); significance,
  histograms, `--json`, and `--smoke` reused from the engine.
- **v2 shipped the same day: spawned commands via `-c`/`--command`** on the
  same binary — each command is adapted to a benchmark function
  (`() => runCommand(cmd)`, `spawn(…, {shell: true, stdio: 'ignore'})`), so
  the collector, stop policies, stats, notes, `--smoke`, and JSON reuse is
  total. `--prepare <cmd>` runs untimed before every run (the cold-cache
  recipe); a child that exits non-zero **or dies by a signal** fails the run
  (`close` reports `(code, signal)` — checking only `code` would count a
  SIGKILL as success). Series are named by the command string; `bodyHash` is
  the sha256 of the command text; the JSON records `source: {commands}`.
  Child output is discarded (hyperfine's default) — it would garble the live
  table and skew timing. Still deferred: the concurrency dimension,
  Kalibera–Jones steady-state detection, effect sizes; the (B) child metrics
  are now unlockable.

### (B) v1 resolutions (2026-07-08, with Eugene)

- **Scope: both modes, tiered.** Module mode = Tier 1 per-run
  `process.resourceUsage()` deltas (verified working on Node, Bun, and Deno),
  taken outside the timed window via `collectMacro`'s `metricsBefore`/`After`
  hooks. Command mode = Tier 2 Linux `/proc/[pid]/{io,status}` polling
  (5 ms, last successful poll wins — up to one interval of trailing activity
  can be missed, negligible for genuinely slow processes; very short commands
  may yield no reading, noted). Degrades with a note elsewhere.
- **Correction to the research pass:** Node exposes **no child rusage**
  (`spawn`/`spawnSync` return no resource usage; `Bun.spawn().resourceUsage()`
  has no Node/Deno equivalent) — the "uniform across runtimes" Tier-1 claim
  holds for _self_ accounting only, which is why command-mode metrics are
  /proc-based.
- **Surfacing: opt-in `-M`/`--metrics`** (the `--observe` precedent) —
  collects, prints a medians table, persists raw per-run readings into the
  JSON (`series[].metrics`, `params.metrics` names the collector).
- **Compare integration — shipped same day** (was deferred): when loaded
  files carry `series[].metrics`, `nano-bench-compare` renders per-kind
  metric-medians tables after the summary, series side by side with
  file-tagged labels (the same view timing gets) — one table per collector
  kind, majority guard applied per series, non-carrying series absent.
- **Same-day correction (Eugene's catch):** the first cut polled `child.pid`
  — but that is the wrapper shell (`/bin/sh -c …`), and dash _forks_ the
  command rather than exec'ing it in this spawn context, so every command's
  "metrics" were dash's startup footprint (2 MB rss, 4,260 B rchar,
  identical across commands). Fixed: readings come from the wrapper's
  **descendants** only (`/proc/[pid]/task/[pid]/children` walked
  recursively; io summed, peakRSS maxed); the wrapper's own readings never
  pass as the command's, so a command faster than the poll now yields _no_
  reading and the missing-metrics note — honest — instead of the shell's
  numbers. Pinned by a regression test (a 100 KB-writing child must show
  `logicalWrite ≥ 100000` and node-scale RSS).
- **Adaptive poll backoff (same day, Eugene's call):** instead of a fixed
  5 ms interval (or a `--poll` knob), the poller runs every 1 ms for the
  command's first 100 ms, then 5 ms, then 25 ms past 3 s — dense where short
  commands live, cheap for long runs, no user decision; a fixed `interval`
  option remains as an internal override should a `--poll` flag ever be
  wanted. Measured floor: a command whose own life is ~1–2 ms (bun
  `--version` behind the shell fork) still evades even 1 ms polling
  (~1 catch in 20) — so a metric captured in **under half the runs** is
  reported blank + note rather than as a fake median of a few lucky
  snapshots. True sub-5 ms accounting stays with the queued Tier-3
  (`wait4`/pidfd) follow-up.

### (C) v1 resolutions (2026-07-08, with Eugene)

- **Surface: auto note + `--clusters` flag** on `nano-bench-io` and
  `nano-bench-compare` (classic `nano-bench` excluded by physics — batching
  averages each sample over n iterations, smoothing multimodality away). The
  dip gate runs always; a flagged distribution gets a note suggesting
  `--clusters`; the flag prints the per-cluster breakdown. With `--clusters`
  on a unimodal function, a confirming note prints instead.
- **Mode finder: KDE** (Gaussian kernel, Silverman bandwidth, 256-point
  grid); clusters split at the density minima between local maxima. X-means
  rejected per the BIC caveat above. When the dip fires but KDE finds one
  mode (heavy skew), a note says so.
- **Report: weight + median/CI + range** per cluster (tail percentiles of a
  small cluster would be noise dressed as precision). Mode count labeled a
  heuristic in the output itself.
- **Dip implementation note:** `src/stats/dip.js` computes a dip-style
  statistic — min over mode positions of the half-gap to the nearest
  convex-then-concave CDF (AS 217's per-segment deviation formulas; a lower
  bound of the classical dip where the two halves conflict at the mode). The
  p-value comes from a seeded bootstrap of the SAME statistic under the
  uniform null, so the calibration stays honest regardless. Property-tested:
  exact 1/(2n) on evenly spaced data, ~0.25 on tight bimodal, honest p-values
  both ways. n is capped at 500 (random subsample) to bound the O(n²) worst
  case; B = 200 bootstrap rounds.
- Histogram per-cluster overlays and the HTML viewer integration remain with
  the Priority −1 viewer item.

## Synergy: the shared statistics kernel

Every new statistic here — bootstrap median CI (already have), MW U (already
have), percentiles, **Cliff's delta / A12, Hartigan's dip test, X-means, t-digest,
MAD** — belongs in the pure-JS statistics core. The tape-six directions doc
(`tape-six/dev-docs/testing-landscape-and-directions.md` §5) proposes **extracting
that core into a standalone package both nano-bench and tape-six vendor as a git
submodule** (the `deep6` model), which also lets tape-six get `t.bench` and
run-history analytics with no npm dependency. These clustering/effect-size/sketch
additions are kernel work that _both_ projects consume — one more reason the
extraction pays off. Coordinate the kernel API when this and the tape-six
`t.bench`/history work are scheduled together.

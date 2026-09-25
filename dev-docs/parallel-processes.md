# Parallel benchmark processes &mdash; measured

nano-bench exposes no option to run benchmarks in parallel. The 2026-09-20 architecture decision
rested that on reasoning about this machine: hyperthread pairing, all-core versus single-core
turbo, a shared L3 cache and memory bandwidth, and a 15&nbsp;W power budget all push in one
direction, so more samples don't average them out. This note measures how large the effect is.

## Setup

- **Machine:** Intel Core i3-10110U, 2 cores and 4 threads, 2.1&nbsp;GHz base, 4.1&nbsp;GHz
  maximum turbo, 4&nbsp;MB L3, 15&nbsp;W. Load average 0.41 before the run.
- **Runtime:** Node.js 26.9.0, `nano-bench` with default settings and `-s 100`.
- **Workloads,** one question per file, each a single function:
  - `cpu.js` &mdash; an xorshift loop that stays in registers and L1. It is sensitive to a busy
    sibling hyperthread and to the turbo budget.
  - `mem.js` &mdash; pointer chasing through a random cycle over 32&nbsp;MB, 8 times the L3. Each
    step is a cache miss the prefetcher can't predict, about 150&nbsp;ns. It is sensitive to the
    shared L3 and to memory bandwidth.
- **Conditions:** each workload alone, as 2 concurrent copies, and as 4, which fills every
  hardware thread. The copies are identical `nano-bench` processes started together.
- **Repetitions:** 5 of each condition, with the condition order rotated per repetition so
  drift over the session doesn't land on one condition.

The scripts are in [`experiments/parallel-processes/`](./experiments/parallel-processes/).
`run.sh` runs the conditions and `summarize.mjs` prints the table below. To reproduce the
experiment, run the following from the repository root:

```bash
OUT=$(mktemp -d)
dev-docs/experiments/parallel-processes/run.sh "$OUT" 5
node dev-docs/experiments/parallel-processes/summarize.mjs "$OUT"
```

## Results

Measured 2026-09-24, 30 of 30 runs completed. _Copies_ is the number of per-copy medians;
_above every alone_ counts the copies whose median is above the slowest median of the runs
alone; _preempted_ is the share of samples that nano-bench's contention check flagged;
_warned_ counts the copies that printed the contention warning (10% or more samples
preempted).

| Workload | Copies at once | Medians |    Median | Range            | Against alone | Above every alone | Preempted | Warned   |
| -------- | -------------: | ------: | --------: | ---------------- | ------------: | ----------------: | --------: | -------- |
| cpu      |              1 |       5 |   1.57 ns | 1.56–1.58 ns     |  1.000&times; |           &ndash; |      0.2% | 0 of 5   |
| cpu      |              2 |      10 |   1.70 ns | 1.70–1.70 ns     |  1.085&times; |          10 of 10 |      0.0% | 0 of 10  |
| cpu      |              4 |      20 |   1.95 ns | 1.57–2.02 ns     |  1.245&times; |          18 of 20 |      5.2% | 5 of 20  |
| mem      |              1 |       5 | 145.06 ns | 127.25–150.10 ns |  1.000&times; |           &ndash; |      0.0% | 0 of 5   |
| mem      |              2 |      10 | 146.90 ns | 141.34–148.50 ns |  1.013&times; |           0 of 10 |      0.2% | 0 of 10  |
| mem      |              4 |      20 | 188.15 ns | 144.19–192.80 ns |  1.297&times; |          18 of 20 |     10.1% | 10 of 20 |

## Findings

Measured, from the table:

- **Two copies slow a CPU-bound loop by 8.5%, in every run.** All 10 copy medians sit above all
  5 medians alone, a distribution-free separation.
- **Four copies slow both workloads by 25&ndash;30%.** Of 20 copies, 18 sit above every run alone,
  for each workload.
- **Two copies of the memory-bound chase show no separable effect.** The medians alone range
  over 15%, from 127 to 150&nbsp;ns, so an effect below that size can't be read from 5 runs.
- **The contention warning misses most of it.** It never fired with 2 copies, and it fired in 5
  and 10 of 20 runs with 4 copies, while 18 of 20 were slower in both. The check sees a sample
  that lost the CPU. It can't see a sample that kept the CPU and ran slower on it.

Hypotheses that this experiment doesn't test:

- **The 8.5% at 2 copies is the turbo budget.** With both physical cores busy, the package runs
  at a lower all-core turbo than a single busy core gets. What would confirm it: the busy cores'
  clock during each condition, for example with `turbostat` (root). A first version of `run.sh`
  averaged the clock in `/proc/cpuinfo` over all four logical CPUs, idle ones included, so it
  couldn't show a busy core's turbo; that column was dropped.
- **The jump at 4 copies is hyperthread sharing.** With 4 copies on 4 threads, two copies share
  each physical core's execution units, and for the memory-bound chase its L3 and memory
  bandwidth too. The 2 of 20 copies at their solo speed would be copies that ran while their
  sibling was idle, for example at the start or end of a staggered run.

## What it means

- **No parallel option, confirmed by measurement.** On this machine, running benchmarks side by
  side changes their medians by 8&ndash;30% depending on how many run and what they do, which is
  larger than most effects a benchmark sets out to measure. None of it averages out: each
  condition moved the whole distribution.
- **A quiet contention warning doesn't mean the run had the machine to itself.** The README says to run one benchmark at a time on a quiet machine.

## Limits

One machine, one runtime, one session, 5 repetitions. The numbers are properties of a 2-core,
15&nbsp;W laptop part. A desktop with more cores than copies would show a smaller effect at 2
copies, and the 4-copy effect depends on whether the scheduler places copies on sibling threads.

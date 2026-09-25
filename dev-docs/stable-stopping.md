# Stopping on a stable CI &mdash; measured

`nano-bench-io --stable <pct>` runs until the bootstrap CI on the median is at most `pct`% of
the median. It checks every 10 runs. Until 2026-09-24 it started checking at the 10-run floor
and stopped at the first check that passed. A run on `bench/io-sample.js --stable 10` stopped at
10 runs with a CI of 9.7%, which raised the question this note answers: does the CI reported at
the stop contain the true median as often as a 95% CI says it should?

## Method

The question is about a stopping rule, so it is answered by simulation over real runs:

1. Collect a population of about 1,000 runs per function with `nano-bench-io --runs 1000`.
2. Replay `--stable` thousands of times: draw runs from the population with replacement, and
   check the CI width every 10 runs from the floor, with the same `bootstrapSummary` call the
   CLI makes (α = 0.05, 1,000 resamples, one seed for every check of a run).
3. At the stop, record the number of runs, whether the reported CI contains the population
   median (coverage), and the relative error of the reported median.
4. As a control, compute the same CI at a fixed 10, 30, and 100 runs with no stopping rule.

Populations, collected on 2026-09-24 on an Intel i3-10110U with Node.js 26.9:

- `io-sample/fast` and `io-sample/slow` &mdash; `bench/io-sample.js`: timers of 8&ndash;12&nbsp;ms and
  12&ndash;20&nbsp;ms with uniform jitter.
- `io-bimodal/mixed` &mdash; `bench/io-bimodal.js`: a 75/25 mix of 8&nbsp;ms and 30&nbsp;ms calls.
- `read-json/readJson` &mdash; reading and parsing this repository's `package-lock.json`, about
  0.17&nbsp;ms.

Each row below is 400 trials, so a coverage figure carries about &plusmn;1.5 points of sampling
error. The simulation caps a run at 300 draws, below the CLI's 1,000, to bound its cost; the
share of capped runs is reported. The scripts are in
[`experiments/stable-floor/`](./experiments/stable-floor/). To reproduce the experiment, run
the following from the repository root; the `io-sample` rows take about an hour:

```bash
OUT=$(mktemp -d)
dev-docs/experiments/stable-floor/collect.sh "$OUT"
node dev-docs/experiments/stable-floor/simulate.mjs "$OUT/read-json.json" --trials 400
node dev-docs/experiments/stable-floor/simulate.mjs "$OUT/io-sample.json" --series fast --trials 400
```

## Results

Coverage at the stop, with the control first. _Floor 10_ is the rule before this note; _floor 30

- two checks_ is the rule after it.

| Population, target    | Fixed 10 / 30 / 100 runs | Floor 10 | Floor 30 | Two checks | Floor 30 + two checks |
| --------------------- | ------------------------ | -------: | -------: | ---------: | --------------------: |
| `io-sample/fast`, 10% | 94.5 / 93.3 / 94.3%      |    82.5% |    83.5% |      89.0% |                 89.8% |
| `io-sample/slow`, 10% | 95.3 / 93.0 / 94.0%      |    91.5% |    91.5% |      94.5% |                 94.5% |
| `read-json`, 5%       | 93.3 / 92.8 / 96.3%      |    88.8% |    94.3% |      93.5% |                 94.8% |
| `read-json`, 10%      | 93.3 / 92.8 / 96.3%      |    94.0% |    95.0% |      92.5% |                 94.8% |
| `io-bimodal`, 5%      | 92.3 / 94.0 / 96.8%      |    93.3% |    95.3% |      94.5% |                 95.5% |
| `io-bimodal`, 10%     | 92.3 / 94.0 / 96.8%      |    93.8% |    95.8% |      95.0% |                 96.0% |

Median number of runs at the stop, floor 10 against floor 30 + two checks: 30 against 40 for
`read-json` at 10%, 50 against 70 at 5%, 20 against 40 for `io-bimodal`, 80 against 110 for
`io-sample/fast` at 10%, and 80 against 100 for `io-sample/slow`.

At the 5% target, 70&ndash;82% of the `io-sample` runs reached the 300-draw cap, so those rows
(coverage 91&ndash;95% for every rule) describe the cap more than the rule and are left out of the
table.

## Findings

Measured:

- **The CI is sound at a fixed size, and stopping on it loses coverage.** The control covers
  92&ndash;97%, while the first passing check from 10 runs covered as little as 82.5%.
- **Floor 30 + two checks is the best or tied for best in every row,** with a worst case of 89.8%
  and the rest at 94.5&ndash;96.0%. Each part alone fails somewhere: floor 30 leaves
  `io-sample/fast` at 83.5%, and two checks alone leaves `read-json` at 10% at 92.5%.
- **It costs 10&ndash;30 more runs at the median.**
- **No rule restores 95% on `io-sample/fast` at 10%.** The residual is about 5 points.
- **A small floor is risky on multimodal data.** At a fixed 10 runs, the `io-bimodal` median
  landed in the slow mode often enough for a 90th-percentile error of 84.7%. `--stable` avoided
  it only because the CI is wide in that case.

A hypothesis this experiment doesn't test: the loss comes from optional stopping. A check passes when the
drawn runs happen to cluster, so the rule selects runs whose CI is narrower than their spread
warrants. It is strongest when the target sits near the width the data usually gives, as with
`io-sample/fast` at 10%. Coarse timer values are ruled out as the cause: that population has 420
distinct values.

## Decision

Eugene, 2026-09-25: floor 30 + two checks. With `--stable`, `--min-runs` defaults to 30, and the
CI must pass its target at two checks in a row. An explicit `--min-runs` still applies. The
results file records `params.stableChecks: 2`.

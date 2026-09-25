#!/usr/bin/env bash
# Runs each workload alone, as 2 concurrent copies, and as 4, REPS times each, rotating the
# condition order per repetition. Writes one results JSON and one log per copy.
# Usage: run.sh OUT_DIR [REPS]
out=${1:?usage: run.sh OUT_DIR [REPS]}
reps=${2:-5}
here=$(dirname "$(readlink -f "$0")")
bin=$(readlink -f "$here/../../../bin/nano-bench.js")
command mkdir -p "$out" || exit 1

conditions=(1 2 4)
planned=0
done_runs=0
for workload in cpu mem; do
  for ((rep = 1; rep <= reps; ++rep)); do
    for ((j = 0; j < ${#conditions[@]}; ++j)); do
      k=${conditions[$(((rep + j) % ${#conditions[@]}))]}
      planned=$((planned + 1))
      tag="$workload-k$k-r$rep"
      pids=()
      for ((c = 1; c <= k; ++c)); do
        node "$bin" "$here/$workload.js" -s 100 --json "$out/$tag-c$c.json" > "$out/$tag-c$c.log" 2>&1 &
        pids+=($!)
      done
      ok=1
      for pid in "${pids[@]}"; do wait "$pid" || ok=0; done
      if ((ok)); then
        done_runs=$((done_runs + 1))
        echo "ok $tag"
      else
        echo "FAILED $tag"
      fi
    done
  done
done
echo "runs: $done_runs of $planned"

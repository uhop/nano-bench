#!/usr/bin/env bash
# Collects 1,000 runs of each population with nano-bench-io, one process per file.
# Usage: collect.sh OUT_DIR
out=${1:?usage: collect.sh OUT_DIR}
here=$(dirname "$(readlink -f "$0")")
root=$(readlink -f "$here/../../..")
command mkdir -p "$out" || exit 1
planned=0
collected=0
for pair in "io-sample:$root/bench/io-sample.js" "io-bimodal:$root/bench/io-bimodal.js" "read-json:$here/read-json.js"; do
  name=${pair%%:*}
  file=${pair#*:}
  planned=$((planned + 1))
  if node "$root/bin/nano-bench-io.js" "$file" --runs 1000 --json "$out/$name.json" > "$out/$name.log" 2>&1; then
    collected=$((collected + 1))
    echo "ok $name"
  else
    echo "FAILED $name"
  fi
done
echo "populations: $collected of $planned"

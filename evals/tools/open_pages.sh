#!/usr/bin/env bash
# Opens every evals/pages/*.html in Safari, one at a time, long enough for one capture poll.
# Run it in a second Terminal tab while `rewind capture --print` runs in the first.
# Do not click into other windows while it runs: capture reads whatever is frontmost.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
wait=${1:-9}
for page in "$root"/evals/pages/*.html; do
  echo "opening $(basename "$page")"
  open -a Safari "$page"
  sleep "$wait"
done
echo "done: now check the first tab printed 'new #N' once per page, then press Ctrl-C there."

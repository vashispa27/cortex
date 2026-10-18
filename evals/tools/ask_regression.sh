#!/usr/bin/env bash
# Behaviour-preservation check for `rewind ask`.
#   evals/tools/ask_regression.sh <binary-before> <binary-after>
# Ingests evals/corpus with the BEFORE binary into a temp state dir, copies it, asks the
# questions in ask_check_questions.txt with each binary against its own copy, and compares
# the output byte for byte. Uses temp dirs only; never touches the real state directory.
set -euo pipefail
before=${1:?before binary}; after=${2:?after binary}
root=$(cd "$(dirname "$0")/../.." && pwd)
: "${REWIND_MODEL_DIR:=$(ls -d ~/.cache/huggingface/hub/models--minishlab--potion-base-32M/snapshots/* | head -1)}"
export REWIND_MODEL_DIR
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
REWIND_STATE_DIR="$tmp/base" "$before" ingest-fixtures --corpus "$root/evals/corpus" >/dev/null
cp -R "$tmp/base" "$tmp/b"; cp -R "$tmp/base" "$tmp/a"
for side in b a; do
  bin=$before; [ "$side" = a ] && bin=$after
  : > "$tmp/$side.txt"
  while IFS= read -r q; do
    echo "### $q" >> "$tmp/$side.txt"
    REWIND_STATE_DIR="$tmp/$side" "$bin" ask "$q" >> "$tmp/$side.txt" 2>&1
  done < "$root/evals/tools/ask_check_questions.txt"
done
if cmp "$tmp/b.txt" "$tmp/a.txt"; then
  echo "ask output byte-identical ($(wc -l < "$tmp/b.txt") lines, sha256 $(shasum -a 256 "$tmp/b.txt" | cut -c1-16))"
else
  diff "$tmp/b.txt" "$tmp/a.txt" | head -40; exit 1
fi

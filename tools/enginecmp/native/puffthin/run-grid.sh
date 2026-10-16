#!/usr/bin/env bash
# native/puffthin/run-grid.sh <bthin 실행 파일> <출력 폴더> — grid.txt 의 설정을 차례로(무거운 프로세스 1개) 돌려 <이름>-<두께>.jsonl 로 쓴다.
#   다 돌면: node native/puffthin/tojson.mjs <출력 폴더>  → data/cmp-r36B.json.gz → node cmpsum.mjs … r36B
set -euo pipefail
BIN=${1:?bthin}; OUT=${2:?출력 폴더}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
grep -v '^#' "$HERE/grid.txt" | while IFS=';' read -r name preset tune extra h; do
  [ -z "$name" ] && continue
  f="$OUT/$name-$h.jsonl"
  [ -s "$f" ] && { echo "있음: $f"; continue; }
  # shellcheck disable=SC2086
  PUFF_DISC_H=$h nice "$BIN" --name "$name" --preset "$preset" --tune "$tune" $extra > "$f"
  echo "$name $h"
done

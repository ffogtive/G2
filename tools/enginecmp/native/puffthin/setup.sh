#!/usr/bin/env bash
# native/puffthin/setup.sh <scratch_dir> — 앱 엔진(native/puff_sim: Rapier 0.36 + 게임 바람 Rust 이식)으로 B(쏜 뒤)를 얇은 딱지로 재는 실험판을 만든다.
#   저장소의 native/puff_sim 은 건드리지 않는다: src 를 <scratch_dir> 로 복사 → DISC_H(상수 0.11)만 실행 때 PUFF_DISC_H 로 읽게 고침 → bthin 실행기 추가.
#   빌드(오프라인, 의존성은 ~/.cargo 캐시, -j2 약 1분):
#     CARGO_TARGET_DIR=<scratch_dir>/target cargo build --release --offline -j2 --manifest-path <scratch_dir>/Cargo.toml
#   실행: PUFF_DISC_H=0.055 <scratch_dir>/target/release/bthin --name X --preset web --tune "contactHz=120,contactZeta=20"   (또는 run-grid.sh)
set -euo pipefail
OUT=${1:?scratch 폴더}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../.." && pwd)
mkdir -p "$OUT/src/bin"
cp "$REPO/native/puff_sim/Cargo.lock" "$OUT/"
cp "$REPO"/native/puff_sim/src/{ffi.rs,lib.rs,rng.rs,rules.rs,table.rs,tune.rs} "$OUT/src/"
cp "$HERE/Cargo.toml" "$OUT/Cargo.toml"
cp "$HERE/bthin.rs" "$OUT/src/bin/bthin.rs"
python3 - "$OUT/src/table.rs" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf8').read()
old = 'pub const DISC_H: f64 = 0.11;'
assert old in s, 'puff_sim table.rs 에 DISC_H 상수가 없다 — 이식이 바뀌었으면 이 스크립트를 고칠 것'
s = s.replace(old, '''/// enginecmp 실험판: 두께를 실행 때 PUFF_DISC_H 로 (기본 0.11 = 원본과 같음)
pub fn disc_h() -> f64 {
    static H: std::sync::OnceLock<f64> = std::sync::OnceLock::new();
    *H.get_or_init(|| std::env::var("PUFF_DISC_H").ok().and_then(|v| v.parse().ok()).unwrap_or(0.11))
}''', 1)
s = re.sub(r'\bDISC_H\b', 'disc_h()', s)
open(p, 'w', encoding='utf8').write(s)
PY
echo "만듦: $OUT (puff_sim $(git -C "$REPO" log -1 --format=%h -- native/puff_sim/src) 기준)"

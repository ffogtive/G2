#!/usr/bin/env bash
# build-ios.sh — 맥에서 iOS 용 정적 라이브러리 → PuffSim.xcframework (기기 arm64 + 시뮬레이터 arm64/x86_64)
#   사용: native/puff_sim/scripts/build-ios.sh        → native/puff_sim/dist/PuffSim.xcframework
#   필요: Xcode(xcodebuild, lipo), rustup. 이 컨테이너(리눅스)에서는 못 돈다.
#   Xcode 연결은 native/puff_sim/ios/PuffSim.xcconfig 머리말 참고 (-force_load + Strip Style 'Non-Global').
set -euo pipefail
cd "$(dirname "$0")/.."
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)
rustup target add "${TARGETS[@]}"
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-13.0}"
for t in "${TARGETS[@]}"; do
  # 라이브러리만, 정적만 (cdylib·bin 은 iOS 에 필요 없음)
  cargo rustc --release --lib --target "$t" --crate-type staticlib
done
OUT=dist
rm -rf "$OUT/PuffSim.xcframework" "$OUT/sim" "$OUT/include"
mkdir -p "$OUT/sim" "$OUT/include"
lipo -create target/aarch64-apple-ios-sim/release/libpuff_sim.a target/x86_64-apple-ios/release/libpuff_sim.a -output "$OUT/sim/libpuff_sim.a"
cp include/puff_sim.h "$OUT/include/"
cat > "$OUT/include/module.modulemap" <<'MM'
module PuffSim {
  header "puff_sim.h"
  export *
}
MM
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libpuff_sim.a -headers "$OUT/include" \
  -library "$OUT/sim/libpuff_sim.a" -headers "$OUT/include" \
  -output "$OUT/PuffSim.xcframework"
echo "→ $(pwd)/$OUT/PuffSim.xcframework"
# 심볼이 다 들어 있는지 (dart:ffi 는 DynamicLibrary.process() 로 이름을 찾는다)
nm -gU target/aarch64-apple-ios/release/libpuff_sim.a 2>/dev/null | grep -c " _puff_" | xargs echo "기기 슬라이스 puff_* 심볼 수:"

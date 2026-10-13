#!/usr/bin/env bash
# build-ios.sh — (맥에서) Rust 딱지 물리를 iOS 정적 라이브러리로 굽고, Runner 에 링크하는 설정을 켠다.
#
#   native/puff_sim/scripts/build-ios.sh                 # 아이폰(arm64) + 시뮬레이터(arm64 + x86_64)
#   native/puff_sim/scripts/build-ios.sh --device-only   # 아이폰만(실기기 120Hz 측정이면 이것으로 충분, 약 1.5분)
#   native/puff_sim/scripts/build-ios.sh --xcframework   # 덤으로 dist/ios/PuffSim.xcframework (다른 Xcode 프로젝트에 넣을 때)
#   native/puff_sim/scripts/build-ios.sh --off           # 링크 끄기(dist/ios 지움) → 앱이 예전 그대로(웹뷰 게임 + 데모는 녹화 재생)
#
# 결과
#   dist/ios/device/libpuff_sim.a                    아이폰(arm64)
#   dist/ios/sim/libpuff_sim.a                       시뮬레이터(arm64 + x86_64, lipo 한 덩어리)
#   dist/ios/link.xcconfig                           ← app/ios/Flutter/{Debug,Release}.xcconfig 가 '#include?' 로 읽는다(있을 때만).
#                                                      안에서 native/puff_sim/ios/PuffSim.xcconfig(-force_load + Strip Style) 를 켠다.
# Xcode 화면에서 손댈 것 없음: 이 스크립트 → flutter run. 자세한 순서·확인법은 docs/app/native-spike.md
# 필요: Xcode(xcrun·lipo), rustup(https://rustup.rs). 리눅스에서도 staticlib 까지는 만들어진다(링크·서명만 맥).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT=dist/ios
DEVICE=1 SIM=1 XCF=0
for a in "$@"; do
  case "$a" in
    --device-only) SIM=0 ;;
    --sim-only) DEVICE=0 ;;
    --xcframework) XCF=1 ;;
    --off) rm -rf "$OUT"; echo "Rust 물리 링크 끔 ($ROOT/$OUT 지움)"; exit 0 ;;
    *) echo "모르는 인자: $a"; exit 2 ;;
  esac
done
command -v cargo >/dev/null || { echo "cargo 가 없다 → rustup 설치: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"; exit 1; }
# 앱 최소 iOS(16.4)보다 낮으면 된다. 너무 높으면 'built for newer iOS version' 경고
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-13.0}"

TARGETS=()
[[ $DEVICE == 1 ]] && TARGETS+=(aarch64-apple-ios)
[[ $SIM == 1 ]] && TARGETS+=(aarch64-apple-ios-sim x86_64-apple-ios)
rustup target add "${TARGETS[@]}"
rustup component add llvm-tools
TOOLS="$(rustc --print sysroot)/lib/rustlib/$(rustc -vV | sed -n 's/host: //p')/bin"

# 임베디드 비트코드 벗기기 — rust-std 에 미리 컴파일돼 들어 있는 compiler_builtins 오브젝트(약 50개)에는 __LLVM,__bitcode 섹션
# (Rust 의 LLVM, 지금 22)이 붙어 있다. LLVM 계열 도구는 이런 오브젝트를 'IR' 로 읽어서, Rust 보다 낡은 LLVM 을 쓰는 도구
# (Xcode 의 lipo·ld 가 부르는 libLTO 등)가 'Unknown attribute kind' 로 넘어질 수 있다(리눅스 llvm-lipo 18 로 재현).
# → Rust 와 같은 LLVM 의 llvm-objcopy 로 오브젝트마다 그 섹션만 지우고 llvm-ar 로 원래 순서대로 다시 묶는다(기계어는 그대로).
strip_bitcode() { # $1 = 입력 .a, $2 = 출력 .a
  local in out w
  in="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  mkdir -p "$(dirname "$2")"
  out="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
  w=$(mktemp -d)
  (
    cd "$w"
    "$TOOLS/llvm-ar" x "$in"
    if [[ $("$TOOLS/llvm-ar" t "$in" | sort | uniq -d | wc -l | tr -d ' ') != 0 ]]; then
      echo "  (멤버 이름이 겹쳐 벗기기를 건너뜀)"
      cp "$in" "$out"
      exit 0
    fi
    for o in *.o; do "$TOOLS/llvm-objcopy" --remove-section=__LLVM,__bitcode --remove-section=__LLVM,__cmdline "$o"; done
    rm -f "$out"
    # shellcheck disable=SC2046
    "$TOOLS/llvm-ar" --format=darwin rcs "$out" $("$TOOLS/llvm-ar" t "$in")
  )
  rm -rf "$w"
}

for t in "${TARGETS[@]}"; do
  echo "── cargo: $t"
  # 라이브러리만, 정적만(cdylib·bin 은 iOS 에 필요 없음). 필요한 시스템 라이브러리 = -lSystem -lc -lm (iOS 기본 링크에 이미 있음)
  cargo rustc --release --lib --target "$t" --crate-type staticlib
done

mkdir -p "$OUT"
if [[ $DEVICE == 1 ]]; then
  strip_bitcode target/aarch64-apple-ios/release/libpuff_sim.a "$OUT/device/libpuff_sim.a"
fi
if [[ $SIM == 1 ]]; then
  strip_bitcode target/aarch64-apple-ios-sim/release/libpuff_sim.a "$OUT/sim/arm64.a"
  strip_bitcode target/x86_64-apple-ios/release/libpuff_sim.a "$OUT/sim/x86_64.a"
  lipo -create "$OUT/sim/arm64.a" "$OUT/sim/x86_64.a" -output "$OUT/sim/libpuff_sim.a"
  rm -f "$OUT/sim/arm64.a" "$OUT/sim/x86_64.a"
fi
if [[ $XCF == 1 && $DEVICE == 1 && $SIM == 1 ]]; then
  rm -rf "$OUT/PuffSim.xcframework" "$OUT/include"
  mkdir -p "$OUT/include"
  cp include/puff_sim.h "$OUT/include/"
  printf 'module PuffSim {\n  header "puff_sim.h"\n  export *\n}\n' > "$OUT/include/module.modulemap"
  xcodebuild -create-xcframework \
    -library "$OUT/device/libpuff_sim.a" -headers "$OUT/include" \
    -library "$OUT/sim/libpuff_sim.a" -headers "$OUT/include" \
    -output "$OUT/PuffSim.xcframework"
fi

# 링크 켜기: Runner 의 Debug/Release(=Profile) xcconfig 가 '#include?' 로 이 파일을 찾는다.
# 만든 SDK 만 적는다 — 아이폰만 구웠으면 시뮬레이터 빌드는 링크 없이(데모 = 녹화 재생) 그대로 된다
{
  echo "// 생성됨: native/puff_sim/scripts/build-ios.sh $(date '+%Y-%m-%d %H:%M') — 지우면(--off) Rust 물리 링크가 꺼진다"
  [[ -f "$OUT/device/libpuff_sim.a" ]] &&
    echo 'PUFF_SIM_LDFLAGS[sdk=iphoneos*] = -force_load "$(PUFF_SIM_ROOT)/dist/ios/device/libpuff_sim.a"'
  [[ -f "$OUT/sim/libpuff_sim.a" ]] &&
    echo 'PUFF_SIM_LDFLAGS[sdk=iphonesimulator*] = -force_load "$(PUFF_SIM_ROOT)/dist/ios/sim/libpuff_sim.a"'
  echo '#include "../../ios/PuffSim.xcconfig"'
} > "$OUT/link.xcconfig"

# 심볼 확인 (dart:ffi 는 DynamicLibrary.process() 로 이름을 찾는다 — 헤더의 함수 수와 같아야 한다)
want=$(grep -o 'puff_[a-z_0-9]*(' include/puff_sim.h | sort -u | wc -l | tr -d ' ')
for a in "$OUT/device/libpuff_sim.a" "$OUT/sim/libpuff_sim.a"; do
  [[ -f $a ]] || continue
  got=$(nm -gU "$a" 2>/dev/null | grep -c ' T _puff_' || true)
  echo "$a: puff_* 심볼 $got / 헤더 $want · $(lipo -info "$a" 2>&1 | sed 's/.*: //')"
  [[ $got -ge $want ]] || { echo "심볼이 모자란다 — 빌드 실패로 본다"; exit 1; }
done
echo "→ 링크 켜짐: $ROOT/$OUT/link.xcconfig"
echo "   다음: cd app && flutter run --profile -t lib/native/demo_main.dart -d <아이폰>   (docs/app/native-spike.md)"

#!/usr/bin/env bash
# JoltPhysics.js 1.1.0 (Jolt v5.6.0) 를 CROSS_PLATFORM_DETERMINISTIC=ON 으로 다시 빌드 → vendor/jolt-physics-1.1.0-cpd.wasm-compat.js(.gz)
# 필요: git, cmake, ninja, python3(3.10+), 인터넷(emsdk 6.0.2 ≈ 300 MB). 약 3분(-j2) + 내려받기.
# npm 배포본은 CPD 꺼짐이라 네이티브와 비트가 갈라진다(26스텝째, hashcmp.mjs). 1.1.0 CMake 는 CPD 를 켜도 바인딩(glue.cpp)에
# define 을 안 넘겨 런타임에 'Mismatching define JPH_CROSS_PLATFORM_DETERMINISTIC' 로 멈춘다 → joltjs-cpd-glue.patch 로 고침.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HERE/../build/cpd-wasm}"
mkdir -p "$WORK" && cd "$WORK"
[ -d emsdk ] || git clone --depth 1 https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install 6.0.2 && ./emsdk activate 6.0.2) >/dev/null
# shellcheck disable=SC1091
source emsdk/emsdk_env.sh >/dev/null
[ -d jolt ] || git clone -q --depth 1 --branch v5.6.0 https://github.com/jrouwe/JoltPhysics jolt
[ -d joltjs ] || { git clone -q --depth 1 --branch 1.1.0 https://github.com/jrouwe/JoltPhysics.js joltjs && (cd joltjs && patch -p1 < "$HERE/joltjs-cpd-glue.patch"); }
cd joltjs
cmake -B Build/CPD/ST -G Ninja -DPYTHON="$(command -v python3)" -DCMAKE_BUILD_TYPE=Distribution -DBUILD_WASM_COMPAT_ONLY=ON \
  -DCROSS_PLATFORM_DETERMINISTIC=ON -DFETCHCONTENT_SOURCE_DIR_JOLTPHYSICS="$WORK/jolt"
cmake --build Build/CPD/ST -j"${JOBS:-2}"
mkdir -p "$HERE/../vendor"
cp dist/jolt-physics.wasm-compat.js "$HERE/../vendor/jolt-physics-1.1.0-cpd.wasm-compat.js"
gzip -9 -c dist/jolt-physics.wasm-compat.js > "$HERE/../vendor/jolt-physics-1.1.0-cpd.wasm-compat.js.gz"
echo "OK → vendor/jolt-physics-1.1.0-cpd.wasm-compat.js (JOLT_FLAVOUR=cpd 로 씀)"

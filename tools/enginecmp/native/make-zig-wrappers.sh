#!/usr/bin/env bash
# zig(0.13, pip 'ziglang' 휠에 들어 있음)로 aarch64-linux-musl 교차 컴파일러 감싸개를 만든다 → aarch64-zig.cmake 의 ZIG_WRAP_DIR
#   python3 -m pip download --no-deps --only-binary=:all: --platform manylinux_2_12_x86_64 ziglang==0.13.0 -d /tmp/zigdl
#   python3 -I -m zipfile -e /tmp/zigdl/ziglang-0.13.0-*.whl /tmp/zig && chmod +x /tmp/zig/ziglang/zig
#   bash native/make-zig-wrappers.sh /tmp/zig/ziglang/zig build/zigwrap
#   cmake -S native/jolt-bench -B build/jolt-zig-arm64 -G Ninja -DCMAKE_TOOLCHAIN_FILE=$PWD/native/jolt-bench/aarch64-zig.cmake \
#         -DZIG_WRAP_DIR=$PWD/build/zigwrap -DJOLT_SRC=/tmp/jolt -DCMAKE_BUILD_TYPE=Distribution
#   ninja -C build/jolt-zig-arm64 -j2 joltbench && qemu-aarch64-static build/jolt-zig-arm64/joltbench ...
# 처음 한 번은 zig 가 musl·libc++ 를 대상용으로 빌드해 몇 분 걸린다(캐시됨).
set -euo pipefail
ZIG="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; OUT="$2"
mkdir -p "$OUT"
for t in cc:"cc -target aarch64-linux-musl" cxx:"c++ -target aarch64-linux-musl" ar:ar ranlib:ranlib; do
  name="zig${t%%:*}"; args="${t#*:}"
  printf '#!/bin/sh\nexec "%s" %s "$@"\n' "$ZIG" "$args" > "$OUT/$name"; chmod +x "$OUT/$name"
done
echo "OK → $OUT/{zigcc,zigcxx,zigar,zigranlib}"

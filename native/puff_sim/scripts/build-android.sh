#!/usr/bin/env bash
# build-android.sh — 안드로이드 .so (arm64-v8a, armeabi-v7a, x86_64) → app/android/app/src/main/jniLibs/<abi>/libpuff_sim.so
#   필요: Android NDK (ANDROID_NDK_HOME), cargo install cargo-ndk
#   Dart: DynamicLibrary.open('libpuff_sim.so')
set -euo pipefail
cd "$(dirname "$0")/.."
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../../app/android/app/src/main/jniLibs build --release --lib
ls -la ../../app/android/app/src/main/jniLibs/*/libpuff_sim.so

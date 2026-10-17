#!/usr/bin/env bash
# 네이티브 데모를 '실제 앱'으로 이 컨테이너(맥·GPU 없음)에서 돌려 보는 길: 리눅스 데스크톱(GTK) + Impeller(OpenGLES, Mesa 소프트웨어)
# + Flutter GPU + Rust 물리(.so, dart:ffi) → Xvfb 화면을 찍는다. 웹 확인(web_check.mjs)은 dart:ffi 가 없어 녹화 재생만 되지만
# 이건 iOS 와 같은 코드 경로(LiveSim → Rust → applyFrame)를 그대로 돈다.
#   app/tool/linux_check.sh [출력 폴더] [초=75]
# 필요: libgtk-3-dev clang cmake ninja pkg-config xvfb imagemagick, cargo. (apt-get install -y libgtk-3-dev xvfb imagemagick)
# ⚠ FPS 는 소프트웨어 GL 이라 2 안팎 — 의미 없다. 보는 것: 장면 · 실물리 날아감 · 판정 줄의 해시가
#   test/native_sim_ffi_test.dart '리눅스 데스크톱 … 해시 재현'(26ac3929b178c298)과 같은가(화면 시계와 무관한 결정성).
# app/ 에 linux 폴더를 만들지 않으려고 임시 폴더에 복사해 `flutter create --platforms linux` 한다(web_check.mjs 와 같은 방식).
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP/.." && pwd)"
OUT="${1:-${TMPDIR:-/tmp}/puff-native-linuxcheck}"
SECS="${2:-75}"
FLUTTER="${FLUTTER:-$(command -v flutter || echo /opt/flutter-sdk/flutter/bin/flutter)}"
mkdir -p "$OUT"
(cd "$ROOT/native/puff_sim" && cargo build --release --lib)
W=$(mktemp -d "${TMPDIR:-/tmp}/puff-native-linux-XXXX")
echo "작업 폴더 $W"
tar -C "$APP" --exclude=./assets/www -cf - lib assets pubspec.yaml pubspec.lock analysis_options.yaml | tar -C "$W" -xf -
mkdir -p "$W/assets/www" && echo '<html></html>' > "$W/assets/www/index.html"
sed -i "s#path: ../native/puff_sim/dart#path: $ROOT/native/puff_sim/dart#" "$W/pubspec.yaml"
"$FLUTTER" config --enable-linux-desktop >/dev/null
(cd "$W" && "$FLUTTER" create . --platforms linux --project-name puff >/dev/null &&
  "$FLUTTER" build linux -t lib/native/demo_main.dart --profile --dart-define=NATIVE_BENCH=true)
cat > "$W/run.sh" <<RUN
#!/usr/bin/env bash
export LD_LIBRARY_PATH="$ROOT/native/puff_sim/target/release"
# Impeller + Flutter GPU 켜기(iOS 는 Info.plist FLTEnableFlutterGPU, 안드로이드는 Manifest meta-data 로 켜 둠)
export FLUTTER_ENGINE_SWITCHES=2 FLUTTER_ENGINE_SWITCH_1=enable-impeller=true FLUTTER_ENGINE_SWITCH_2=enable-flutter-gpu=true
"$W/build/linux/x64/profile/bundle/puff" > "$OUT/app.log" 2>&1 &
PID=\$!
for t in \$(seq 15 15 $SECS); do
  sleep 15
  import -window root "$OUT/shot-\$t.png"
  kill -0 \$PID 2>/dev/null || { echo "앱이 \${t}초 전에 끝남 — $OUT/app.log"; break; }
done
kill \$PID 2>/dev/null || true
RUN
chmod +x "$W/run.sh"
xvfb-run -a -s "-screen 0 1280x800x24" "$W/run.sh"
grep -E "Impeller|Exception|Error" "$OUT/app.log" | head -5 || true
ls "$OUT"/shot-*.png
echo "끝. 화면 위 HUD '물리 Rust …' 줄과 아래 판정 줄(스텝 · 뒤집힘 · 원 밖 · 해시)을 볼 것"

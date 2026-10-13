#!/bin/bash
# mac-build-install.command — 맥에서 실행: G2(PUFF!) Flutter 앱을 개발 서명으로 빌드 → 아이폰에 설치 → 실행.
# 재윤님 가이드(claude-code-iphone-deployment.md) 5절 템플릿을 Flutter 용으로 맞춤. 값은 같은 폴더의 iphone-deploy.env 에서 읽는다(레포에 기기 ID 를 넣지 않음).
# 실행: bash mac-build-install.command   (SSH 서명 오류 errSecInternalComponent 면: open -a Terminal mac-build-install.command)
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/iphone-deploy.env"   # TEAM_ID, IPHONE_ID, BUNDLE_ID(com.ffogtive.puff)
: "${TEAM_ID:?}" "${IPHONE_ID:?}" "${BUNDLE_ID:?}"
APP_DIR="$HERE/app"                # deploy-from-server.sh 가 보낸 Flutter 프로젝트(app/ 사본)
DERIVED="$HERE/.local/iphone-deploy"
RUN="${DEPLOY_RUN:-$HERE/.local/deploy-runs/$(date +%Y%m%d-%H%M%S)-$$}"
mkdir -p "$HERE/.local" "$RUN"
LOCK="$HERE/.local/iphone-deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then echo '다른 배포가 도는 중인지 확인하세요(잠금을 자동 삭제하지 않음).' >&2; exit 1; fi
finish() { r=$?; printf '%s\n' "$r" > "$RUN/exit-code"; rmdir "$LOCK"; }
trap finish EXIT
printf '실행 기록: %s\n' "$RUN"
export PATH="$HOME/flutter/bin:$HOME/development/flutter/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v flutter >/dev/null || { echo 'flutter 가 PATH 에 없습니다' >&2; exit 2; }
test -f "$APP_DIR/assets/www/index.html" || { echo '게임 에셋이 없습니다(서버에서 npm run app:www 필요)' >&2; exit 3; }
cd "$APP_DIR"
{ flutter --version; xcodebuild -version; } > "$RUN/versions.txt" 2>&1
flutter pub get > "$RUN/pub.log" 2>&1
flutter build ios --release --config-only > "$RUN/config.log" 2>&1   # Generated.xcconfig 등 준비
# Release(실제 속도, 홈 화면에서 다시 열 수 있음) + 개발 서명(자동). 기기용 generic 빌드
xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  build > "$RUN/build.log" 2>&1
APP="$DERIVED/Build/Products/Release-iphoneos/Runner.app"
test -d "$APP"
codesign --verify --deep --strict "$APP"
ACTUAL=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")
[ "$ACTUAL" = "$BUNDLE_ID" ] || { echo "Bundle ID 다름($ACTUAL) — 설치 중단" >&2; exit 4; }
xcrun devicectl device install app --device "$IPHONE_ID" "$APP" --json-output "$RUN/install.json" > "$RUN/install.log" 2>&1
xcrun devicectl device process launch --device "$IPHONE_ID" --terminate-existing "$BUNDLE_ID" --json-output "$RUN/launch.json" > "$RUN/launch.log" 2>&1 || echo '설치는 됐고 실행만 실패(잠금 화면일 수 있음)' | tee "$RUN/launch-note.txt"
echo '빌드·설치(·실행) 명령 성공. 게임 기능 확인은 따로.'

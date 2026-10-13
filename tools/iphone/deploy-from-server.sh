#!/bin/bash
# deploy-from-server.sh — 재윤님 개발 서버(맥으로 SSH 되는 곳)에서 실행: 최신 브랜치 → 게임 에셋 빌드 → 맥으로 app/ 전송 → 맥에서 서명 빌드·아이폰 설치·실행 → 결과 회수.
# 가이드 0절 '기존 SSH 서버' 경로. 설정: ~/.config/puff/iphone-deploy.env (레포에 넣지 않음)
#   APPLE_BUILD_SSH=apple-build-mac     # ~/.ssh/config 별칭(가이드 1절) 또는 user@host
#   MAC_DIR=/Users/<USER>/Deploy/G2      # G2 전용 배포 폴더(다른 앱과 분리)
#   TEAM_ID=...  IPHONE_ID=...  BUNDLE_ID=com.ffogtive.puff
#   BRANCH=claude/ddakji-game-design-unrfmr
set -euo pipefail
CFG="${PUFF_DEPLOY_ENV:-$HOME/.config/puff/iphone-deploy.env}"
# shellcheck disable=SC1090
source "$CFG"
: "${APPLE_BUILD_SSH:?}" "${MAC_DIR:?}" "${TEAM_ID:?}" "${IPHONE_ID:?}" "${BUNDLE_ID:?}"
BRANCH="${BRANCH:-claude/ddakji-game-design-unrfmr}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$REPO/docs/app/deploy-receipts/$STAMP"; mkdir -p "$OUT"
cd "$REPO"
git fetch origin "$BRANCH" && git checkout "$BRANCH" && git pull --ff-only origin "$BRANCH"
COMMIT=$(git rev-parse --short HEAD); echo "커밋 $COMMIT" | tee "$OUT/commit.txt"
npm install --no-audit --no-fund > "$OUT/npm.log" 2>&1
npm run app:www > "$OUT/app-www.log" 2>&1
if command -v flutter >/dev/null; then (cd app && flutter pub get && flutter analyze && flutter test) > "$OUT/flutter-check.log" 2>&1; fi
# 보낼 것: app/(빌드 산출물 제외) + 맥 스크립트 + 설정(기기 ID 등, 비밀 아님)
TAR=$(mktemp /tmp/puff-app-XXXX.tar)
# app/pubspec.yaml 이 ../native/puff_sim/dart 를 path 의존으로 쓴다 → 같은 상대 경로로 함께 보낸다(코덱스 리뷰)
tar -C "$REPO" --exclude 'app/build' --exclude 'app/.dart_tool' --exclude 'app/ios/Pods' \
  --exclude 'native/puff_sim/target' --exclude 'native/puff_sim/dist' --exclude 'native/puff_sim/dart/.dart_tool' \
  -cf "$TAR" app native/puff_sim tools/iphone/mac-build-install.command
ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "mkdir -p '$MAC_DIR/incoming' && rm -rf '$MAC_DIR/incoming/'*"
scp -q "$TAR" "$APPLE_BUILD_SSH:$MAC_DIR/incoming/src.tar"
scp -q "$CFG" "$APPLE_BUILD_SSH:$MAC_DIR/iphone-deploy.env"
ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "set -e; cd '$MAC_DIR/incoming' && tar -xf src.tar && rm -rf '$MAC_DIR/app' && mv app '$MAC_DIR/app' && mkdir -p '$MAC_DIR/native' && rm -rf '$MAC_DIR/native/puff_sim.new' && mv native/puff_sim '$MAC_DIR/native/puff_sim.new' && { [ -d '$MAC_DIR/native/puff_sim/target' ] && mv '$MAC_DIR/native/puff_sim/target' '$MAC_DIR/native/puff_sim.new/target' || true; } && rm -rf '$MAC_DIR/native/puff_sim' && mv '$MAC_DIR/native/puff_sim.new' '$MAC_DIR/native/puff_sim' && cp tools/iphone/mac-build-install.command '$MAC_DIR/' && chmod 700 '$MAC_DIR/mac-build-install.command'"
rm -f "$TAR"
RUN="$MAC_DIR/.local/deploy-runs/$STAMP"
set +e
ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "DEPLOY_RUN='$RUN' bash '$MAC_DIR/mac-build-install.command'" > "$OUT/mac.log" 2>&1
rc=$?
set -e
if [ $rc -ne 0 ] && ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "grep -q errSecInternalComponent '$RUN/build.log' 2>/dev/null"; then
  echo 'SSH 세션 서명 실패(errSecInternalComponent) → 맥 로그인 세션의 터미널로 다시(가이드 6절)' | tee -a "$OUT/mac.log"
  RUN="$MAC_DIR/.local/deploy-runs/$STAMP-gui"
  ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "printf 'export DEPLOY_RUN=%q\n' '$RUN' > '$MAC_DIR/.gui-run.env'; cat > '$MAC_DIR/gui-run.command' <<'G'
#!/bin/bash
source \"\$(dirname \"\$0\")/.gui-run.env\"; bash \"\$(dirname \"\$0\")/mac-build-install.command\"
G
chmod 700 '$MAC_DIR/gui-run.command'; open -a Terminal '$MAC_DIR/gui-run.command'"
  for i in $(seq 1 120); do sleep 10; ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "test -f '$RUN/exit-code'" && break; done
  rc=$(ssh -o BatchMode=yes "$APPLE_BUILD_SSH" "cat '$RUN/exit-code' 2>/dev/null || echo 99")
fi
scp -q -r "$APPLE_BUILD_SSH:$RUN" "$OUT/mac-run" 2>/dev/null || true
echo "결과: exit=$rc 커밋=$COMMIT 기록=$OUT" | tee "$OUT/summary.txt"
exit "$rc"

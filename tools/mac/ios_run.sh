#!/bin/bash
# ios_run.sh — 맥에서 한 줄: G2(PUFF!) Flutter 앱(app/) → 개발 서명 Release 빌드 → 페어링된 아이폰에 설치·실행.
# 뼈대는 G3 tools/mac/ios_run.sh(재윤님 맥에서 쓰는 중) 그대로: xcodebuild generic/platform=iOS 자동 서명, codesign·Bundle ID
# 확인, devicectl 설치·실행, 실행마다 폴더 하나, mkdir 잠금, 기존 앱은 절대 지우지 않음. Godot 부분만 Flutter 로 바꿨다.
#
# 가설: (미검증, 맥·실기기) Xcode 에 Apple ID 로 한 번 로그인하고 아이폰을 페어링해 두면 이 명령 하나로 PUFF! 가 아이폰에
#       뜬다. 첫 실행만 Flutter 3.47.5 를 ~/.puff/flutter 에 받는다(약 0.8 GB, 5~15분).
#
# 사용: bash tools/mac/ios_run.sh [옵션]       (항상 Release — Flutter Debug 는 디버거 없이 아이폰에서 다시 못 연다)
#   --no-rust          네이티브 데모용 Rust 물리를 굽지 않는다(링크 끔 → 데모만 녹화 재생, 웹 게임은 그대로).
#                      rustup 이 있으면 기본으로 굽고, 그 빌드가 Xcode 에서 실패하면 저절로 끄고 한 번 더 빌드한다
#   --clean            DerivedData·app/build 를 지우고 새로 빌드(아이폰의 앱·데이터는 건드리지 않음)
#   --device <id>      기기 UDID / CoreDevice 식별자 / 이름 (기본: 페어링된 아이폰 1대)
#   --launch-only      설치된 앱만 다시 실행 ('신뢰하지 않는 개발자'를 신뢰한 뒤 등)
#   --check            사전 점검만: Xcode, 기기, 개발자 모드, Team ID, Flutter, python3 — 빌드·설치·묻기·저장을 하지 않는다
#                      (점검 기록만 .local/deploy-runs/ 에 남는다)
#   --yes              묻지 않는다(자동 실행용). Team·기기를 못 정하면 목록을 찍고 실패
#   -h, --help
# 덮어쓰기(레포에 저장하지 않음): 환경 변수 PUFF_TEAM_ID, PUFF_DEVICE_ID, FLUTTER(SDK 폴더 또는 .../bin/flutter),
#   또는 ~/.config/puff/iphone-deploy.env(chmod 600)의 TEAM_ID= / IPHONE_ID= / FLUTTER= 줄(~ 와 $HOME 은 펼친다).
#   대화로 고른 Team 은 여기 저장. 팀이 여럿이면 유료 팀 하나 → 그것, G3(~/.lane1/deploy.env)와 같은 팀 → 그것, 아니면 묻는다.
# 결과물: <레포>/.local/ (gitignore, 700): iphone-deploy/(DerivedData), deploy-runs/<시각>-<pid>/(build.log, install.json,
#   launch.json, procs.json, receipt.txt, errors-masked.txt, exit-code …), iphone-deploy.lock(도는 동안만).
#   도움을 청할 때 보낼 것 = receipt.txt + errors-masked.txt(식별자 가림). build.log·devices.json 원문에는 Team ID·UDID 가 있다.
# 종료: 0 실행 8초 뒤에도 떠 있음 | 2 사용법 | 3 환경 | 4 빌드 | 5 기기 | 6 설치 | 7 실행 실패·확인 불가 | 9 잠금 | 130 Ctrl-C.
set -euo pipefail
# `umask 077` 을 전체에 걸지 않는다(가이드 5절은 건다): 앱 번들 파일이 보통 권한이어야 설치 뒤에도 읽힌다.
# 대신 .local 폴더 자체를 700 으로(DerivedData 의 embedded.mobileprovision 에 Team ID·등록 기기 UDID 가 있다), env 파일은 600.
# export 된 CDPATH 가 있으면 `cd 상대경로` 가 경로를 한 번 더 찍어 SCRIPT_DIR 이 두 줄이 된다(bash 3.2·5.2 실측)
unset CDPATH

PUFF_LOG_TAG=ios_run
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=tools/mac/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

BUNDLE_ID=$PUFF_BUNDLE_ID
WORKSPACE="$PUFF_APP/ios/Runner.xcworkspace"
SCHEME=Runner
PRODUCT=Runner.app
CONFIG=Release
XCODE_MIN=16.0      # devicectl JSON + iOS 18 SDK (Flutter 3.47 최소 15, 권장 16 — flutter_tools macos/xcode.dart)
IOS_DEVICE_MIN=17.0 # Xcode 27 개발 실행 지원 = iOS 17 이상 (앱 최소는 16.4, project.pbxproj)
PLISTBUDDY=${PLISTBUDDY:-/usr/libexec/PlistBuddy}

LOCAL_DIR="$PUFF_ROOT/.local"
DERIVED="$LOCAL_DIR/iphone-deploy"
LOCK="$LOCAL_DIR/iphone-deploy.lock"
ENV_FILE=$PUFF_ENV_FILE
FLUTTER_DEST="$PUFF_HOME/flutter/$PUFF_FLUTTER_VERSION"
RUST_SH="$PUFF_ROOT/native/puff_sim/scripts/build-ios.sh"

CLEAN=0 NO_RUST=0 LAUNCH_ONLY=0 CHECK_ONLY=0 DEVICE_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --clean) CLEAN=1 ;;
    --no-rust) NO_RUST=1 ;;
    --device)
      [ $# -ge 2 ] || die 2 "--device 뒤에 값이 필요합니다 (UDID·식별자·이름 — xcrun devicectl list devices)"
      DEVICE_ARG=$2
      shift
      ;;
    --device=*) DEVICE_ARG=${1#--device=} ;;
    --launch-only) LAUNCH_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    --yes) PUFF_YES=1 ;;
    -h | --help)
      awk 'NR > 1 && /^set -euo/ {exit} NR > 1' "$0"
      exit 0
      ;;
    *) die 2 "모르는 옵션: $1 (--help 참고)" ;;
  esac
  shift
done
export PUFF_YES=${PUFF_YES:-0}

is_macos || die 3 "ios_run.sh 는 맥에서만 돈다(Xcode·devicectl 필요). 이 컴퓨터: $(uname -s 2>/dev/null || echo '?')." \
  "리눅스(컨테이너)에서 할 수 있는 확인: cd app && flutter analyze && flutter test   ·   가짜 맥 흐름 시험: bash tools/mac/selftest.sh" \
  "맥으로 SSH 되는 서버면: bash tools/iphone/deploy-from-server.sh (docs/app/iphone-deploy.md)"

# 다른 Flutter 의 FLUTTER_ROOT 가 환경에 남아 있으면 Xcode 빌드 스크립트가 헷갈릴 수 있다 → 이 실행에서만 지운다
unset FLUTTER_ROOT

# ---------------------------------------------------------------------------------------------------------------
# 실행 폴더 + 잠금 (가이드 5절). 잠금은 그것을 만든 실행만 지운다.
RUN_DIR="$LOCAL_DIR/deploy-runs/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$LOCAL_DIR" "$RUN_DIR"
chmod 700 "$LOCAL_DIR" "$LOCAL_DIR/deploy-runs" "$RUN_DIR"
if ! mkdir "$LOCK" 2>/dev/null; then
  printf '9\n' >"$RUN_DIR/exit-code"
  die 9 "다른 배포가 $(rel "$LOCK") 를 잡고 있다 — 아직 도는지 확인:" \
    "cat $(shpath "$LOCK")/owner; ps -p <pid>" \
    "그 프로세스가 없을 때만: rm -f $(shpath "$LOCK")/owner && rmdir $(shpath "$LOCK")   (이 스크립트는 잠금을 대신 지우지 않는다)"
fi
printf 'pid=%s started=%s run=%s\n' "$$" "$(date '+%Y-%m-%d %H:%M:%S')" "$RUN_DIR" >"$LOCK/owner"

BUILD_RESULT="not run" INSTALL_RESULT="not run" LAUNCH_RESULT="not run" RUST_RESULT="not run"
ASSETS_RESULT="not run" FLUTTER_DESC="?" RUNNING="not checked" GIT_SNAPSHOT=0 TRACKED_RESULT="not checked"
TEAM_ID="" TEAM_KIND="?" DEVICE_ID="?" DEVICE_NAME="?" DEVICE_MODEL="?" DEVICE_CD="" TUNNEL_DOWN=0
FLUTTER_TMP="" # Flutter 를 받는 중인 임시 폴더 — 끊겨도(Ctrl-C 포함) EXIT 트랩이 지운다

# ---------------------------------------------------------------------------------------------------------------
# 추적 파일 지킴이: 빌드가 git 이 추적하는 파일을 바꾸면 다음 `git pull --ff-only`(한 줄 명령의 앞부분)가 막힐 수 있다.
# 시작할 때 찍어 두고(git_snapshot) 끝날 때(성공·실패 모두) 비교해 경고 + 정확한 복구 명령을 찍는다.
in_git() { git -C "$PUFF_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; }
git_tracked_changes() { git -C "$PUFF_ROOT" -c core.quotePath=false diff --name-only HEAD -- 2>/dev/null || true; }
git_untracked() { git -C "$PUFF_ROOT" -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null || true; }
quote_paths() { # 줄마다 경로 → 셸에 그대로 붙여 넣을 수 있게 (printf %q)
  local p
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    printf ' %q' "$p"
  done
}
# Xcode 화면 Signing & Capabilities 에서 Team 을 고르면 공개 추적 파일 project.pbxproj 에 `DEVELOPMENT_TEAM = <원문>;` 이 들어간다
PBXPROJ_REL="app/ios/Runner.xcodeproj/project.pbxproj"
pbxproj_team_warn() { # <바뀐 추적 파일 목록 파일>
  if grep -qxF "$PBXPROJ_REL" "$1" 2>/dev/null; then
    warn "$PBXPROJ_REL 이 바뀌어 있다 — Xcode 에서 Team 을 골랐다면 Team ID 원문이 들어 있다(공개 레포): 커밋·푸시 금지."
  fi
}
git_snapshot() {
  in_git || return 0
  git_tracked_changes >"$RUN_DIR/git-tracked.before"
  git_untracked >"$RUN_DIR/git-untracked.before"
  GIT_SNAPSHOT=1
  if [ -s "$RUN_DIR/git-tracked.before" ]; then
    warn "실행 전부터 바뀐 추적 파일이 있다 — 다음 git pull --ff-only 가 막힐 수 있다:"
    sed 's/^/        /' "$RUN_DIR/git-tracked.before" >&2
    pbxproj_team_warn "$RUN_DIR/git-tracked.before"
    hint "직접 고친 게 아니면 되돌리기: cd $(shpath "$PUFF_ROOT") && git checkout --$(quote_paths <"$RUN_DIR/git-tracked.before")"
  fi
}
GIT_CHECKED=0
git_check_after() { # 한 번만(요약 앞에서, 또는 die 로 끝날 때 EXIT 트랩에서)
  [ "$GIT_SNAPSHOT" = 1 ] && [ "$GIT_CHECKED" = 0 ] || return 0
  GIT_CHECKED=1
  git_tracked_changes >"$RUN_DIR/git-tracked.after"
  git_untracked >"$RUN_DIR/git-untracked.after"
  local new_tracked new_untracked f
  for f in tracked untracked; do
    sort "$RUN_DIR/git-$f.before" >"$RUN_DIR/git-$f.before.sorted" || true
    sort "$RUN_DIR/git-$f.after" >"$RUN_DIR/git-$f.after.sorted" || true
  done
  new_tracked=$(comm -13 "$RUN_DIR/git-tracked.before.sorted" "$RUN_DIR/git-tracked.after.sorted" || true)
  new_untracked=$(comm -13 "$RUN_DIR/git-untracked.before.sorted" "$RUN_DIR/git-untracked.after.sorted" || true)
  TRACKED_RESULT="unchanged"
  if [ -n "$new_tracked" ]; then
    TRACKED_RESULT="CHANGED: $(printf '%s\n' "$new_tracked" | tr '\n' ' ')"
    warn "이 실행이 git 추적 파일을 바꿨다 → 다음 git pull --ff-only 가 실패할 수 있다:"
    printf '%s\n' "$new_tracked" | sed 's/^/        /' >&2
    printf '%s\n' "$new_tracked" >"$RUN_DIR/git-tracked.new"
    pbxproj_team_warn "$RUN_DIR/git-tracked.new"
    hint "되돌리기(이 실행이 만든 변경만): cd $(shpath "$PUFF_ROOT") && git checkout --$(printf '%s\n' "$new_tracked" | quote_paths)" \
      "그리고 이 줄과 $(rel "$RUN_DIR")/receipt.txt 를 보내 주세요(스크립트를 고쳐야 하는 경우)."
  fi
  if [ -n "$new_untracked" ]; then
    [ -n "$new_tracked" ] || TRACKED_RESULT="unchanged (새 파일 $(printf '%s\n' "$new_untracked" | grep -c .)개)"
    warn "git 이 모르는 새 파일이 생겼다(보통 무해 — 같은 경로가 나중 커밋에 들어오면 pull 이 막힌다):"
    printf '%s\n' "$new_untracked" | sed 's/^/        /' >&2
    hint "지워도 되면: cd $(shpath "$PUFF_ROOT") && rm -f --$(printf '%s\n' "$new_untracked" | quote_paths)"
  fi
}

finish_deploy() {
  local rc=$?
  trap - INT TERM
  [ -z "$FLUTTER_TMP" ] || rm -rf "$FLUTTER_TMP" || true
  printf '%s\n' "$rc" >"$RUN_DIR/exit-code"
  git_check_after || true
  rm -f "$LOCK/owner"
  rmdir "$LOCK" 2>/dev/null || true
  {
    printf 'exit=%s\nconfig=%s\nbuild=%s\ninstall=%s\nlaunch=%s\nrunning=%s\nassets=%s\nrust=%s\nflutter=%s\n' \
      "$rc" "$CONFIG" "$BUILD_RESULT" "$INSTALL_RESULT" "$LAUNCH_RESULT" "$RUNNING" "$ASSETS_RESULT" "$RUST_RESULT" \
      "$FLUTTER_DESC"
    printf 'team_type=%s\ntracked_files=%s\nstages=%s\n' "$TEAM_KIND" "$TRACKED_RESULT" "$PUFF_STAGE_TIMES"
    printf 'git=%s%s\nbundle=%s\n' "$(git -C "$PUFF_ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')" \
      "$(git -C "$PUFF_ROOT" diff --quiet HEAD 2>/dev/null || echo '+dirty')" "$BUNDLE_ID"
  } >"$RUN_DIR/receipt.txt" 2>/dev/null || true
  case "$rc" in
    0 | 2) ;;
    130 | 143) warn "중단됨(exit $rc). 다시: bash tools/mac/ios_run.sh   (받던 Flutter 는 처음부터 다시 받는다)" || true ;;
    *)
      hint "도움을 청할 때 보낼 것: $(rel "$RUN_DIR")/receipt.txt$([ ! -s "$RUN_DIR/errors-masked.txt" ] || printf ' 와 errors-masked.txt') (식별자 가림)" \
        "build.log·devices.json·launch.json 원문에는 Team ID·UDID 가 있다 — 통째로 붙여 넣지 말 것" || true
      ;;
  esac
}
trap finish_deploy EXIT
# Ctrl-C·종료 신호: 트랩이 없으면 EXIT 트랩이 $?=0 을 받아 영수증에 exit=0(성공처럼)이 남는다(bash 3.2.39·5.2 실측)
trap 'exit 130' INT
trap 'exit 143' TERM
log "실행 기록: $(rel "$RUN_DIR")"
T_START=$SECONDS

# ---------------------------------------------------------------------------------------------------------------
# ~/.config/puff/iphone-deploy.env: KEY=VALUE 줄만 읽는다(source 하지 않음). 환경 변수가 파일보다 우선.
env_file_get() { # <키> -> 값 또는 빈 문자열 ('export KEY=' 줄도 읽음, 따옴표·CR 벗김). 어떤 경우에도 실패로 끝나지 않는다
  [ -f "$ENV_FILE" ] || return 0
  sed -n -e "s/^[[:space:]]*export[[:space:]][[:space:]]*$1=//p" -e "s/^[[:space:]]*$1=//p" "$ENV_FILE" 2>/dev/null |
    tail -n 1 | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}
env_file_set() { # <키> <값>
  mkdir -p "$(dirname "$ENV_FILE")"
  chmod 700 "$(dirname "$ENV_FILE")" 2>/dev/null || true
  local tmp="$ENV_FILE.tmp.$$"
  : >"$tmp"
  if [ -f "$ENV_FILE" ]; then grep -v "^[[:space:]]*$1=" "$ENV_FILE" >"$tmp" || true; fi
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}
# env 파일은 source 하지 않으니 셸 습관대로 적은 `FLUTTER=~/development/flutter` 의 ~ 가 펼쳐지지 않는다 → 여기서 펼친다
# shellcheck disable=SC2016,SC2088 # '$HOME'·'~/' 은 글자 그대로 맞춰 보는 것
expand_home() {
  case "$1" in
    '~' | '$HOME' | '${HOME}') printf '%s' "$HOME" ;;
    '~/'* | '$HOME/'* | '${HOME}/'*) printf '%s/%s' "$HOME" "${1#*/}" ;;
    *) printf '%s' "$1" ;;
  esac
}
if [ -f "$ENV_FILE" ]; then
  if [ -z "$(find "$ENV_FILE" -maxdepth 0 -perm 600 2>/dev/null)" ]; then
    if [ "$CHECK_ONLY" = 1 ]; then
      warn "$(rel "$ENV_FILE") 권한이 600 이 아니다 — 보통 실행이 고친다(--check 는 바꾸지 않음)"
    else
      warn "$(rel "$ENV_FILE") 권한이 600 이 아니다 — 고침"
      chmod 600 "$ENV_FILE"
    fi
  fi
  [ -n "${PUFF_TEAM_ID:-}" ] || PUFF_TEAM_ID=$(env_file_get TEAM_ID)
  [ -n "${PUFF_DEVICE_ID:-}" ] || PUFF_DEVICE_ID=$(env_file_get IPHONE_ID)
  [ -n "${FLUTTER:-}" ] || FLUTTER=$(env_file_get FLUTTER)
fi
FLUTTER=$(expand_home "${FLUTTER:-}")
[ -z "$DEVICE_ARG" ] || PUFF_DEVICE_ID=$DEVICE_ARG

is_number() { case "$1" in "" | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
mask() { # 붙여 넣은 로그에 식별자가 남지 않게: AB******YZ
  local s=$1 n=${#1}
  if [ "$n" -le 4 ]; then printf '****'; else printf '%s%s%s' "${s:0:2}" "******" "${s:n-2:2}"; fi
}

# 도구 로그(xcodebuild·devicectl)의 오류 줄에는 Team ID·UDID·인증서 실명·기기 이름·홈 경로가 원문으로 있다.
# 화면에 찍거나 errors-masked.txt 에 남기기 전에 가린다: 아는 값(Team·기기 UDID·CoreDevice 식별자)은 AB******YZ,
# 따옴표 안 기기 이름, 'Apple Development: <이름> (<개인 ID>)', UDID·UUID 꼴, 'team "<10자>"', 이메일, $HOME → ~.
MASK_PY='
import re, sys
home, team, dev, cd, name = (sys.argv[1:] + [""] * 5)[:5]
def m(s):
    return s[:2] + "******" + s[-2:] if len(s) > 4 else "****"
t = sys.stdin.buffer.read().decode("utf-8", "replace")
for v in sorted({team, dev, cd} - {"", "?"}, key=len, reverse=True):
    if len(v) > 4:
        t = t.replace(v, m(v))
if name and name != "?":
    for q in ("\"%s\"", "\x27%s\x27", "\u201c%s\u201d", "\u2018%s\u2019"):
        t = t.replace(q % name, q % "<기기 이름>")
if home not in ("", "/"):
    t = t.replace(home.rstrip("/") + "/", "~/")
t = re.sub(r"((?:Apple|iPhone|iOS|Mac) (?:Development|Distribution|Developer)): [^\"\x27\n]*", r"\1: <가림>", t)
t = re.sub(r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b", lambda x: m(x.group(0)), t)
t = re.sub(r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b", lambda x: m(x.group(0)), t)
t = re.sub(r"([Tt]eam(?:\s*[Ii][Dd](?:entifier)?)?[\s:=\"\x27(]{1,4})([A-Z0-9]{10})\b", lambda x: x.group(1) + m(x.group(2)), t)
t = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", "<이메일>", t)
sys.stdout.write(t)
'
mask_stream() {
  python3 -I -c "$MASK_PY" "$HOME" "$TEAM_ID" "$DEVICE_ID" "$DEVICE_CD" "$DEVICE_NAME" 2>/dev/null ||
    printf '(가리기 실패 — 원문 로그는 붙여 넣지 말고 receipt.txt 만 보내 주세요)\n'
}

# tail_errors <로그> [n]: 실패한 도구 로그에서 쓸모 있는 부분을 가려서 화면과 errors-masked.txt 에.
tail_errors() {
  local n=${2:-25} out=""
  if grep -qE 'error:|ERROR|failed|FAILED|Error' "$1" 2>/dev/null; then
    out=$(grep -E 'error:|ERROR|failed|FAILED|Error' "$1" | tail -n "$n" | mask_stream || true)
  else
    out=$(tail -n "$n" "$1" 2>/dev/null | mask_stream || true)
  fi
  printf '%s\n' "$out" >&2
  { printf '== %s\n%s\n' "${1##*/}" "$out"; } >>"$RUN_DIR/errors-masked.txt" 2>/dev/null || true
}

# ---------------------------------------------------------------------------------------------------------------
check_xcode() {
  if ! have xcodebuild || ! have xcrun; then
    die 3 "Xcode 가 없다. App Store 에서 Xcode 를 설치하고 한 번 연 뒤:" \
      "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && sudo xcodebuild -runFirstLaunch"
  fi
  local dev ver
  dev=$(xcode-select -p 2>/dev/null || true)
  case "$dev" in
    "" | *CommandLineTools*)
      die 3 "xcode-select 가 Xcode 가 아니라 '${dev:-없음}'(Command Line Tools)을 가리킨다:" \
        "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
      ;;
  esac
  # 출력을 다 읽고(awk 조기 exit 없음 → SIGPIPE 없음), xcodebuild 가 0 이 아닌 값을 내도 조용히 죽지 않게(G3 실제 맥 사례)
  local ver_out
  ver_out=$(xcodebuild -version 2>&1 || true)
  ver=$(printf '%s\n' "$ver_out" | awk '/^Xcode / && v == "" {v = $2} END {print v}' || true)
  [ -n "$ver" ] || die 3 "xcodebuild -version 실패: $(printf '%s' "$ver_out" | head -n 2 | tr '\n' ' ' || true)" \
    "라이선스 미동의? sudo xcodebuild -license accept   ·   첫 실행 준비: sudo xcodebuild -runFirstLaunch"
  version_ge "$ver" "$XCODE_MIN" || die 3 "Xcode $ver 는 너무 오래됐다(필요 >= $XCODE_MIN, 예상 27.x). App Store 에서 업데이트."
  if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
    die 3 "Xcode 첫 실행 준비가 남았다: sudo xcodebuild -runFirstLaunch   (그리고 sudo xcodebuild -license accept)"
  fi
  xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1 || die 3 "iOS 플랫폼 지원이 설치돼 있지 않다:" \
    "xcodebuild -downloadPlatform iOS   (또는 Xcode > Settings > Components > iOS > Get)"
  xcrun --find devicectl >/dev/null 2>&1 || die 3 "xcrun devicectl 을 쓸 수 없다(Xcode 15+ 필요; 선택된 것: $dev)"
  # /usr/bin/python3 는 Command Line Tools 가 없으면 설치 창만 띄우는 껍데기일 수 있다 → 실제로 돌려 본다
  python3 -I -c 'import json' >/dev/null 2>&1 || die 3 "python3 가 돌지 않는다(Xcode 의 명령행 도구에 들어 있다: xcode-select --install)"
  ok "Xcode $ver ($dev)"
  if [ -n "${SSH_CONNECTION:-}" ]; then
    warn "SSH 로 실행 중: codesign 이 errSecInternalComponent 로 실패할 수 있다(키체인이 GUI 세션에 묶임)."
    hint "그러면 맥 화면의 로그인된 Terminal 에서 같은 명령을 다시 실행 (docs/app/iphone-deploy.md, 가이드 6절)."
  fi
}

# ---------------------------------------------------------------------------------------------------------------
# Flutter 3.47.5 고정. 다른 버전 flutter 는 PATH 에 있어도 쓰지 않는다(pub 풀이·pubspec.lock 이 달라짐).
# 찾는 순서: FLUTTER(환경/env 파일) → ~/.puff/flutter/3.47.5 → PATH 의 flutter → ~/flutter → ~/development/flutter → fvm.
# 판정 = SDK 폴더의 `git rev-parse HEAD` 가 고정 리비전과 같은가(받거나 내려받지 않고 바로 앎).
FLUTTER_ROOT_DIR="" FLUTTER_BIN=""
flutter_root_of() { # <SDK 폴더 또는 bin/flutter 경로> -> SDK 폴더(아니면 빈 문자열)
  local p=$1
  [ -n "$p" ] || return 0
  if [ -f "$p" ]; then
    p=$(python3 -I -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$p" 2>/dev/null || true)
    [ -n "$p" ] || return 0
    p=$(dirname "$(dirname "$p")")
  fi
  if [ -d "$p" ] && [ -x "$p/bin/flutter" ]; then
    (cd "$p" && pwd -P)
  fi
  return 0
}
flutter_rev_of() { git -C "$1" rev-parse HEAD 2>/dev/null || true; }

ensure_flutter() {
  local c root rev seen="|"
  if [ -n "${FLUTTER:-}" ] && [ -z "$(flutter_root_of "$FLUTTER")" ]; then
    warn "FLUTTER=$(rel "$FLUTTER") 는 Flutter SDK 폴더가 아니다(bin/flutter 없음) — 건너뜀. SDK 폴더나 …/bin/flutter 경로로 적는다"
  fi
  for c in "${FLUTTER:-}" "$FLUTTER_DEST" "$(command -v flutter 2>/dev/null || true)" "$HOME/flutter" \
    "$HOME/development/flutter" "$HOME/fvm/versions/$PUFF_FLUTTER_VERSION"; do
    root=$(flutter_root_of "$c")
    [ -n "$root" ] || continue
    case "$seen" in *"|$root|"*) continue ;; esac
    seen="$seen$root|"
    rev=$(flutter_rev_of "$root")
    if [ "$rev" = "$PUFF_FLUTTER_REVISION" ]; then
      FLUTTER_ROOT_DIR=$root
      FLUTTER_BIN="$root/bin/flutter"
      ok "Flutter $PUFF_FLUTTER_VERSION ($(rel "$root"))"
      return 0
    fi
    if [ -n "${FLUTTER:-}" ] && [ "$c" = "$FLUTTER" ]; then
      warn "FLUTTER=$(rel "$c") 는 리비전 ${rev:-?} — $PUFF_FLUTTER_VERSION(${PUFF_FLUTTER_REVISION:0:12}…)이 아니라 건너뜀"
    else
      log "건너뜀: $(rel "$root") (리비전 ${rev:-?}, 필요 $PUFF_FLUTTER_VERSION)"
    fi
  done
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "Flutter $PUFF_FLUTTER_VERSION 이 없다 — 보통 실행이 $(rel "$FLUTTER_DEST") 에 받는다" \
      "(git 약 240 MB + 첫 실행 때 Dart SDK·iOS 엔진 약 0.6 GB, 5~15분, 한 번만)"
    return 0
  fi
  have git || die 3 "git 이 없다: xcode-select --install"
  mkdir -p "$(dirname "$FLUTTER_DEST")"
  # 예전 실행이 받다가 끊긴 임시 폴더(그 프로세스가 더는 없는 것만) 치우기 — 수백 MB 씩 쌓이지 않게
  local old pid
  for old in "$FLUTTER_DEST".tmp.*; do
    [ -d "$old" ] || continue
    pid=${old##*.tmp.}
    if is_number "$pid" && ! kill -0 "$pid" 2>/dev/null; then
      log "받다 끊긴 임시 폴더 지움: $(rel "$old")"
      rm -rf "$old"
    fi
  done
  FLUTTER_TMP="$FLUTTER_DEST.tmp.$$"
  rm -rf "$FLUTTER_TMP"
  log "첫 실행: Flutter $PUFF_FLUTTER_VERSION 받기 5~15분 + 첫 빌드 몇 분 — 화면이 한동안 멈춰 보여도 도는 중이다(한 번만)."
  log "Flutter $PUFF_FLUTTER_VERSION 받는 중 → $(rel "$FLUTTER_DEST") (git 약 240 MB)"
  # 진행 표시(git --progress)는 화면에, 같은 내용은 로그에
  if ! git clone --progress --depth 1 --branch "$PUFF_FLUTTER_VERSION" -c advice.detachedHead=false \
    "$PUFF_FLUTTER_GIT_URL" "$FLUTTER_TMP" 2>&1 </dev/null | tee "$RUN_DIR/flutter-clone.log" >&2; then
    tail_errors "$RUN_DIR/flutter-clone.log" 8
    rm -rf "$FLUTTER_TMP"
    FLUTTER_TMP=""
    die 3 "Flutter 받기 실패: $PUFF_FLUTTER_GIT_URL (네트워크·프록시 확인 후 다시)" \
      "또는 Flutter $PUFF_FLUTTER_VERSION 을 직접 설치하고 FLUTTER=<SDK 폴더> 로 알려 주기"
  fi
  rev=$(flutter_rev_of "$FLUTTER_TMP")
  if [ "$rev" != "$PUFF_FLUTTER_REVISION" ]; then
    rm -rf "$FLUTTER_TMP"
    FLUTTER_TMP=""
    die 3 "받은 Flutter 리비전이 다르다(${rev:-?}, 필요 $PUFF_FLUTTER_REVISION) — 쓰지 않는다." \
      "미러(PUFF_FLUTTER_GIT_URL)를 썼다면 원본 https://github.com/flutter/flutter.git 으로 다시"
  fi
  # 리비전이 안 맞는 예전 설치(이 스크립트가 관리하는 폴더)만 바꿔 끼운다
  rm -rf "$FLUTTER_DEST"
  mv "$FLUTTER_TMP" "$FLUTTER_DEST"
  FLUTTER_TMP=""
  FLUTTER_ROOT_DIR=$(cd "$FLUTTER_DEST" && pwd -P)
  FLUTTER_BIN="$FLUTTER_ROOT_DIR/bin/flutter"
  ok "Flutter $PUFF_FLUTTER_VERSION 받음 → $(rel "$FLUTTER_DEST") (리비전 확인됨)"
}

# 첫 실행 준비(처음이면 Dart SDK 를 받고 도구를 굽는다) + 버전 이중 확인 + iOS 엔진 아티팩트.
flutter_prepare() {
  log "Flutter 준비 (처음이면 Dart SDK 약 220 MB + 도구 빌드, 1~3분 — 진행 보기: tail -f $(shpath "$RUN_DIR/flutter-version.log"))…"
  if ! "$FLUTTER_BIN" --version --machine </dev/null >"$RUN_DIR/flutter-version.json" 2>"$RUN_DIR/flutter-version.log"; then
    tail_errors "$RUN_DIR/flutter-version.log" 12
    die 3 "flutter --version 실패 (로그: $(rel "$RUN_DIR/flutter-version.log")) — 네트워크 확인 후 다시"
  fi
  local fv fr
  fv=$(sed -n 's/.*"frameworkVersion": *"\([^"]*\)".*/\1/p' "$RUN_DIR/flutter-version.json" | head -n 1 || true)
  fr=$(sed -n 's/.*"frameworkRevision": *"\([0-9a-f]*\)".*/\1/p' "$RUN_DIR/flutter-version.json" | head -n 1 || true)
  [ "$fr" = "$PUFF_FLUTTER_REVISION" ] || die 3 "flutter 가 리비전 '${fr:-?}' 를 보고한다(필요 $PUFF_FLUTTER_REVISION)" \
    "로그: $(rel "$RUN_DIR/flutter-version.json")"
  [ "$fv" = "$PUFF_FLUTTER_VERSION" ] || warn "flutter 가 버전 '${fv:-?}' 를 보고한다(리비전은 맞음, 필요 $PUFF_FLUTTER_VERSION)"
  FLUTTER_DESC="$PUFF_FLUTTER_VERSION (${PUFF_FLUTTER_REVISION:0:10})"
  log "iOS 엔진 아티팩트 확인 (처음이면 약 0.3 GB — 진행 보기: tail -f $(shpath "$RUN_DIR/flutter-precache.log"))…"
  if ! "$FLUTTER_BIN" precache --ios </dev/null >"$RUN_DIR/flutter-precache.log" 2>&1; then
    tail_errors "$RUN_DIR/flutter-precache.log" 12
    die 3 "flutter precache --ios 실패 (로그: $(rel "$RUN_DIR/flutter-precache.log")) — 네트워크 확인 후 다시"
  fi
  ok "Flutter 준비됨: $FLUTTER_DESC"
}

# ---------------------------------------------------------------------------------------------------------------
# Team ID. "Apple Development: 이름 (XXXXXXXXXX)" 의 괄호 안은 개인 ID 이지 Team ID 가 아니다. Team = 인증서 subject 의 OU
# (Apple DTS, developer.apple.com/forums/thread/802517 — G3 SIGNING.md).
# 후보 팀은 줄마다 "<TeamID>\t<팀 이름>\t<paid|free|?>". 이름·유료/무료는 고를 때 화면에만 보이고 어디에도 저장하지 않는다.
# (1) Xcode 계정 목록 — `defaults export com.apple.dt.Xcode -` 의 plist 에서 teamID·teamName·isFreeProvisioningTeam 이 든
#     dict 를 모두 줍는다(키 위치는 Xcode 판마다 다름: IDEProvisioningTeams / IDEProvisioningTeamByIdentifier — 미검증, 구조 무관하게 탐색)
# (2) 키체인 'Apple Development' 인증서 — subject 의 OU=Team ID, O=팀 이름(유료/무료는 모름)
TEAMS_PY='
import plistlib, sys
try:
    data = plistlib.loads(sys.stdin.buffer.read())
except Exception:
    sys.exit(0)
seen = {}
def kind_of(o, name):
    free = o.get("isFreeProvisioningTeam")
    if str(o.get("teamType", "")).lower() == "personal" or name.endswith("(Personal Team)"):
        return "free"
    if free is None:
        return "?"
    return "free" if str(free).lower() in ("1", "true", "yes") else "paid"
def walk(o):
    if isinstance(o, dict):
        t = o.get("teamID")
        if isinstance(t, str) and len(t) == 10 and t.isalnum():
            name = " ".join(str(o.get("teamName") or "?").split())
            k = kind_of(o, name)
            if t not in seen or (seen[t][1] == "?" and k != "?"):
                seen[t] = (name, k)
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(data)
for t, (n, k) in seen.items():
    print("%s\t%s\t%s" % (t, n, k))
'
detect_teams() { # -> 후보 TSV (같은 팀이 여러 줄일 수 있음 — team_candidates 가 합친다)
  defaults export com.apple.dt.Xcode - 2>/dev/null | python3 -I -c "$TEAMS_PY" 2>/dev/null || true
  local names name subj ou org
  names=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | sort -u || true)
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    subj=$(security find-certificate -c "$name" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || true)
    ou=$(printf '%s\n' "$subj" | sed -n 's/.*OU[[:space:]]*=[[:space:]]*\([A-Z0-9]\{10\}\).*/\1/p' | head -n 1 || true)
    [ -n "$ou" ] || continue
    # O= 꼴: OpenSSL 3 `O = "A, Inc."` / `, O = A,` · LibreSSL(맥) `/O=A, Inc./`
    org=$(printf '%s\n' "$subj" | sed -n 's/.*[/,][[:space:]]*O[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)
    [ -n "$org" ] || org=$(printf '%s\n' "$subj" | sed -n 's/.*\/O=\([^/]*\).*/\1/p' | head -n 1 || true)
    [ -n "$org" ] || org=$(printf '%s\n' "$subj" | sed -n 's/.*,[[:space:]]*O[[:space:]]*=[[:space:]]*\([^,]*\).*/\1/p' | head -n 1 || true)
    printf '%s\t%s\t?\n' "$ou" "$(printf '%s' "${org:-?}" | tr '\t' ' ')"
  done <<EOF
$names
EOF
}
team_candidates() { # 팀마다 한 줄(먼저 나온 Xcode 정보 우선), 유료 → 모름 → 무료 순
  detect_teams | awk -F '\t' 'length($1) == 10 && !($1 in s) {s[$1] = 1; r = ($3 == "paid") ? 0 : (($3 == "?") ? 1 : 2); print r "\t" $0}' |
    sort -s -n -k1,1 | cut -f2- || true
}
kind_label() {
  case "$1" in
    paid) printf '유료' ;;
    free) printf '무료 Personal Team — 7일 만료' ;;
    *) printf '유료/무료 모름' ;;
  esac
}
print_teams() { # <후보 TSV> — 가린 ID + 팀 이름 + 유료/무료 (화면에만)
  printf '%s\n' "$1" | while IFS="$(printf '\t')" read -r t n k; do
    [ -n "$t" ] || continue
    printf '%s  %s (%s)\n' "$(mask "$t")" "$n" "$(kind_label "$k")"
  done | awk '{printf "      %d) %s\n", NR, $0}' >&2
}
valid_team() { case "$1" in [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) return 0 ;; *) return 1 ;; esac; }

resolve_team() {
  local cands count paid npaid nunknown g3=""
  cands=$(team_candidates)
  count=$(printf '%s' "$cands" | grep -c . || true)
  if [ -n "${PUFF_TEAM_ID:-}" ]; then
    TEAM_ID=$PUFF_TEAM_ID
    log "Team ID: PUFF_TEAM_ID / env 파일에서 $(mask "$TEAM_ID")"
  elif [ "$count" = 1 ]; then
    TEAM_ID=$(printf '%s\n' "$cands" | cut -f1)
    ok "Team ID 자동 감지: $(mask "$TEAM_ID")"
  elif [ "$count" -gt 1 ]; then
    paid=$(printf '%s\n' "$cands" | awk -F '\t' '$3 == "paid"')
    npaid=$(printf '%s' "$paid" | grep -c . || true)
    nunknown=$(printf '%s\n' "$cands" | awk -F '\t' '$3 == "?"' | grep -c . || true)
    # G3(lane1) 가 대화로 골라 저장해 둔 팀 — 같은 맥·같은 아이폰에서 이미 설치해 본 팀
    if [ -f "$HOME/.lane1/deploy.env" ]; then
      g3=$(sed -n 's/^[[:space:]]*LANE1_TEAM_ID=["'\'']\{0,1\}\([A-Z0-9]\{10\}\).*/\1/p' "$HOME/.lane1/deploy.env" 2>/dev/null |
        tail -n 1 || true)
    fi
    # grep -c 는 끝까지 읽는다(-q 처럼 일찍 끝나면 pipefail 에서 앞 명령의 SIGPIPE 가 실패로 보일 수 있음)
    if [ -n "$g3" ] && [ "$(printf '%s\n' "$cands" | cut -f1 | grep -cxF "$g3" || true)" = 0 ]; then g3=""; fi
    log "개발 팀이 여럿이다:"
    print_teams "$cands"
    if [ "$npaid" = 1 ] && [ "$nunknown" = 0 ]; then
      TEAM_ID=$(printf '%s\n' "$paid" | cut -f1)
      ok "유료 팀이 하나뿐 → $(mask "$TEAM_ID") (무료 Personal Team 은 뺌)"
    elif [ -n "$g3" ]; then
      TEAM_ID=$g3
      if [ "$CHECK_ONLY" = 0 ] && ask "G3(~/.lane1/deploy.env)와 같은 팀 $(mask "$g3") 을 쓸까요? [Y/n]"; then
        case "$REPLY" in [nN]*) TEAM_ID="" ;; esac
      fi
      [ -z "$TEAM_ID" ] || ok "G3 와 같은 팀: $(mask "$TEAM_ID")"
    fi
    if [ -z "$TEAM_ID" ]; then
      if [ "$CHECK_ONLY" = 1 ]; then
        warn "팀이 여럿이다 — 보통 실행이 번호로 묻는다(--check 는 묻지도 저장하지도 않음)"
        return 0
      fi
      ask "어느 팀? (번호)" || die 3 "팀이 여럿이다: PUFF_TEAM_ID(또는 $(rel "$ENV_FILE") 의 TEAM_ID=)를 정하고 다시"
      is_number "$REPLY" || die 2 "번호가 아니다: '$(mask "$REPLY")'"
      TEAM_ID=$(printf '%s\n' "$cands" | sed -n "${REPLY}p" | cut -f1)
      [ -n "$TEAM_ID" ] || die 2 "$REPLY 번 팀이 없다"
      env_file_set TEAM_ID "$TEAM_ID"
      ok "Team ID $(mask "$TEAM_ID") 를 $(rel "$ENV_FILE") 에 저장 (chmod 600) — 바꾸려면 그 줄을 지우고 다시"
    fi
  else
    warn "키체인에 'Apple Development' 서명 인증서가 아직 없다."
    hint "한 번 로그인: Xcode > Settings > Apple Accounts > + (tools/mac/SIGNING.md 2단계)." \
      "Team ID(10자): Xcode > Settings > Apple Accounts > 팀, 또는 developer.apple.com/account > Membership."
    if [ "$CHECK_ONLY" = 1 ]; then
      warn "Team ID 를 못 정했다 — 위대로 로그인하거나 보통 실행에서 직접 입력(--check 는 묻지 않음)"
      return 0
    fi
    ask "Team ID (10자)?" || die 3 "Team ID 없음: PUFF_TEAM_ID 를 정하거나 Xcode 에 로그인 (tools/mac/SIGNING.md)"
    TEAM_ID=$(printf '%s' "$REPLY" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
    # 형식을 먼저 본다: 틀린 값을 저장하면 다음 실행부터 묻지 않고 계속 실패한다
    valid_team "$TEAM_ID" || die 3 "Team ID 는 대문자·숫자 10자다(입력 '$(mask "$TEAM_ID")', 저장하지 않음) — 다시 실행해 입력"
    env_file_set TEAM_ID "$TEAM_ID"
    ok "Team ID $(mask "$TEAM_ID") 를 $(rel "$ENV_FILE") 에 저장 (chmod 600)"
  fi
  valid_team "$TEAM_ID" ||
    die 3 "Team ID '$(mask "$TEAM_ID")' 가 대문자·숫자 10자가 아니다 (PUFF_TEAM_ID / $(rel "$ENV_FILE") 의 TEAM_ID= 줄 확인)"
  TEAM_KIND=$(printf '%s\n' "$cands" | awk -F '\t' -v t="$TEAM_ID" '$1 == t && k == "" {k = $3} END {print k}')
  TEAM_KIND=${TEAM_KIND:-?}
  if [ "$TEAM_KIND" = free ]; then
    warn "고른 팀 $(mask "$TEAM_ID") 은 무료 Personal Team 이다: 7일마다 다시 설치, 기기당 개발 앱 3개."
    hint "유료 팀이 있으면: $(shpath "$ENV_FILE") 의 TEAM_ID= 줄을 지우고 다시 (또는 PUFF_TEAM_ID=<유료 팀>)"
  fi
}
team_hint() { # 빌드가 서명 문제로 실패했을 때
  printf '고른 팀 %s(%s)이 틀렸으면 %s 의 TEAM_ID= 줄을 지우고 다시 (또는 PUFF_TEAM_ID=<팀> bash tools/mac/ios_run.sh)' \
    "$(mask "$TEAM_ID")" "$(kind_label "$TEAM_KIND")" "$(shpath "$ENV_FILE")"
}

# ---------------------------------------------------------------------------------------------------------------
# 기기: xcrun devicectl list devices --json-output. Xcode 27(JSON v5)은 필드를 "properties" 로 옮기고
# hardwareProperties/deviceProperties/connectionProperties 를 폐기 예정으로 했다 — 두 모양 다 읽는다 (G3 와 같음).
DEVICES_PY='
import json, sys
def find(o, key):
    if isinstance(o, dict):
        if key in o and not isinstance(o[key], (dict, list)):
            return o[key]
        for v in o.values():
            r = find(v, key)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find(v, key)
            if r is not None:
                return r
    return None
def find_dict_with(o, keys):
    if isinstance(o, dict):
        if all(k in o for k in keys):
            return o
        for v in o.values():
            r = find_dict_with(v, keys)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find_dict_with(v, keys)
            if r is not None:
                return r
    return None
def device_name(dev):
    n = (dev.get("deviceProperties") or {}).get("name")
    if n:
        return n
    for keys in (("name", "osVersionNumber"), ("name", "developerModeStatus"), ("deviceName",)):
        o = find_dict_with(dev.get("properties", dev), keys)
        if o is not None:
            return o.get("name", o.get("deviceName"))
    return "?"
def get(dev, path, key):
    o = dev
    for p in path:
        o = o.get(p) if isinstance(o, dict) else None
    if o is not None and not isinstance(o, (dict, list)):
        return o
    r = find(dev.get("properties", {}), key)
    return r if r is not None else find(dev, key)
data = json.load(open(sys.argv[1]))
for d in data.get("result", {}).get("devices", []):
    plat = str(get(d, ["hardwareProperties", "platform"], "platform") or "")
    if plat.lower() not in ("ios", "ipados"):
        continue
    if str(get(d, ["hardwareProperties", "reality"], "reality") or "physical") != "physical":
        continue
    udid = get(d, ["hardwareProperties", "udid"], "udid") or ""
    row = [
        str(udid or d.get("identifier", "")),
        str(device_name(d) or "?").replace("\t", " "),
        str(get(d, ["hardwareProperties", "marketingName"], "marketingName") or "?"),
        str(get(d, ["hardwareProperties", "deviceType"], "deviceType") or "?"),
        str(get(d, ["connectionProperties", "pairingState"], "pairingState") or "?"),
        str(get(d, ["deviceProperties", "developerModeStatus"], "developerModeStatus") or "?"),
        str(get(d, ["connectionProperties", "transportType"], "transportType") or "?"),
        str(get(d, ["connectionProperties", "tunnelState"], "tunnelState") or "?"),
        str(get(d, ["deviceProperties", "osVersionNumber"], "osVersionNumber") or "?"),
        str(d.get("identifier", "")),
    ]
    print("\t".join(row))
'

list_devices() { # -> $RUN_DIR/devices.tsv
  xcrun devicectl list devices --json-output "$RUN_DIR/devices.json" >"$RUN_DIR/devices.log" 2>&1 ||
    die 5 "xcrun devicectl list devices 실패 ($(rel "$RUN_DIR/devices.log") 참고)"
  python3 -I -c "$DEVICES_PY" "$RUN_DIR/devices.json" >"$RUN_DIR/devices.tsv" ||
    die 5 "devicectl JSON 을 못 읽었다 ($(rel "$RUN_DIR/devices.json")); --device <UDID> 로 지정"
}

print_devices() { # 식별자는 가려서 찍는다
  awk -F '\t' '{id=$1; if (length(id) > 4) id=substr(id,1,2) "******" substr(id,length(id)-1);
    printf "      %d) %s  %s (%s)  pairing=%s devmode=%s link=%s/%s iOS %s\n", NR, id, $2, $3, $5, $6, $7, $8, $9}' "$1" >&2
}

resolve_device() {
  list_devices
  local tsv="$RUN_DIR/devices.tsv" pick="$RUN_DIR/device.row" n
  if [ -n "${PUFF_DEVICE_ID:-}" ]; then
    awk -F '\t' -v id="$PUFF_DEVICE_ID" '$1 == id || $10 == id || $2 == id' "$tsv" | head -n 1 >"$pick" || true
    if [ ! -s "$pick" ]; then
      warn "기기 '$(mask "$PUFF_DEVICE_ID")' 가 devicectl 목록에 없다; 주어진 값 그대로 쓴다"
      print_devices "$tsv"
      DEVICE_ID=$PUFF_DEVICE_ID DEVICE_NAME="?" DEVICE_MODEL="?" DEVICE_DEVMODE="?" DEVICE_OS="?" DEVICE_PAIRING="?"
      return 0
    fi
  else
    awk -F '\t' '$5 == "paired" && $4 == "iPhone"' "$tsv" >"$RUN_DIR/devices.cand"
    [ -s "$RUN_DIR/devices.cand" ] || awk -F '\t' '$5 == "paired"' "$tsv" >"$RUN_DIR/devices.cand"
    n=$(grep -c . "$RUN_DIR/devices.cand" || true)
    if [ "$n" = 0 ]; then
      [ ! -s "$tsv" ] || {
        log "아직 페어링 안 된 기기:"
        print_devices "$tsv"
      }
      die 5 "페어링된 아이폰이 없다. 케이블로 연결 → 잠금 해제 → '이 컴퓨터 신뢰'," \
        "그다음 Xcode > Open Developer Tool > Device Hub 에서 Pair (tools/mac/SIGNING.md 3단계)."
    elif [ "$n" = 1 ]; then
      cp "$RUN_DIR/devices.cand" "$pick"
    else
      log "페어링된 기기가 여럿이다:"
      print_devices "$RUN_DIR/devices.cand"
      ask "어느 기기? (번호)" || die 5 "기기가 여럿이다: --device <UDID> 또는 PUFF_DEVICE_ID 로 지정"
      is_number "$REPLY" || die 2 "번호가 아니다: '$(mask "$REPLY")'"
      sed -n "${REPLY}p" "$RUN_DIR/devices.cand" >"$pick"
      [ -s "$pick" ] || die 2 "$REPLY 번 기기가 없다"
    fi
  fi
  local _type transport tunnel
  IFS=$'\t' read -r DEVICE_ID DEVICE_NAME DEVICE_MODEL _type DEVICE_PAIRING DEVICE_DEVMODE transport tunnel DEVICE_OS DEVICE_CD <"$pick"
  # 기기 이름('OO의 iPhone')은 보통 실명이라 고를 때 목록에만 보이고, 진행 줄에는 모델명만 찍는다
  ok "기기: $DEVICE_MODEL ($(mask "$DEVICE_ID")), iOS $DEVICE_OS, pairing=$DEVICE_PAIRING, 개발자 모드=$DEVICE_DEVMODE"
  case "$DEVICE_DEVMODE" in
    enabled) ;;
    disabled)
      die 5 "아이폰의 개발자 모드가 꺼져 있다. 아이폰: 설정 > 개인정보 보호 및 보안 > 개발자 모드 > 켬 > 재시동," \
        "재시동 뒤 '켜기' + 기기 암호. 그다음 다시 실행 (tools/mac/SIGNING.md 4단계)."
      ;;
    *) warn "개발자 모드 상태를 못 읽었다('$DEVICE_DEVMODE'); 설치가 실패하면 설정 > 개인정보 보호 및 보안 > 개발자 모드 확인" ;;
  esac
  if [ "$tunnel" = "unavailable" ]; then
    TUNNEL_DOWN=1
    warn "devicectl 이 아이폰을 지금 닿지 않는 기기(unavailable, link=$transport)로 본다 — 몇 분 빌드한 뒤 설치에서 실패할 수 있다."
    if [ "$CHECK_ONLY" = 0 ] && [ "$LAUNCH_ONLY" = 0 ] && ask "아이폰을 케이블로 연결하고 잠금을 푼 뒤 Enter (그대로 계속해도 된다)"; then
      log "계속 — 설치 단계에서 다시 연결한다"
    fi
  fi
  if [ "$DEVICE_OS" != "?" ] && ! version_ge "$DEVICE_OS" "$IOS_DEVICE_MIN"; then
    warn "iOS $DEVICE_OS < $IOS_DEVICE_MIN: Xcode 27 은 iOS 17 이상 기기만 개발 실행을 지원한다(앱 최소 16.4) — 아이폰 업데이트."
  fi
}

# ---------------------------------------------------------------------------------------------------------------
# 게임 에셋: dist/puff.html(git 에 들어 있음) + mockup/app/bridge.js → app/assets/www/index.html(gitignore).
# node 가 있으면 tools/app-www.mjs, 없으면 같은 바이트를 내는 tools/app-www.py. npm install·npm run build 는 하지 않는다
# (dist/puff.html 은 추적 파일 — 맥에서 다시 빌드하면 다음 git pull 이 막힌다).
build_assets() {
  local out="$PUFF_APP/assets/www/index.html" dist_c src_c tool
  [ -f "$PUFF_ROOT/dist/puff.html" ] || die 4 "dist/puff.html 이 없다(레포에 들어 있어야 한다) — git status 확인"
  if in_git; then
    dist_c=$(git -C "$PUFF_ROOT" log -1 --format=%H -- dist/puff.html 2>/dev/null || true)
    src_c=$(git -C "$PUFF_ROOT" log -1 --format=%H -- mockup tools/build.mjs package.json package-lock.json \
      ':(exclude)mockup/app' 2>/dev/null || true)
    if [ -n "$dist_c" ] && [ -n "$src_c" ] && ! git -C "$PUFF_ROOT" merge-base --is-ancestor "$src_c" "$dist_c" 2>/dev/null; then
      warn "dist/puff.html 이 게임 소스보다 앞선 커밋이다 — 이 설치에는 그 전 게임이 들어간다."
      hint "클라우드 세션에 'npm run build 후 dist 커밋'을 부탁하고 다시 실행(맥에서 빌드하면 추적 파일이 바뀐다)."
    fi
  fi
  if have node && node -e 'process.exit(+process.versions.node.split(".")[0] >= 16 ? 0 : 1)' >/dev/null 2>&1; then
    tool="node $(node --version 2>/dev/null || echo '?')"
    (cd "$PUFF_ROOT" && node tools/app-www.mjs) </dev/null >"$RUN_DIR/app-www.log" 2>&1 || {
      tail_errors "$RUN_DIR/app-www.log" 20
      die 4 "tools/app-www.mjs 실패"
    }
  else
    tool="python3"
    (cd "$PUFF_ROOT" && python3 -I tools/app-www.py) </dev/null >"$RUN_DIR/app-www.log" 2>&1 || {
      tail_errors "$RUN_DIR/app-www.log" 20
      die 4 "tools/app-www.py 실패"
    }
  fi
  [ -s "$out" ] || die 4 "$(rel "$out") 이 만들어지지 않았다 (로그: $(rel "$RUN_DIR/app-www.log"))"
  grep -q 'PuffHaptic' "$out" || die 4 "$(rel "$out") 에 다리 코드(PuffHaptic)가 없다 — dist/puff.html 에 <body> 가 있는지 확인"
  local sha
  sha=$(sha256_of "$out")
  ASSETS_RESULT="ok ($tool, sha256 ${sha:0:16})"
  ok "게임 에셋: $(rel "$out") ($(($(wc -c <"$out") / 1024)) KB, $tool)"
}

# 네이티브 데모용 Rust 물리(선택). 실패해도 계속: 링크를 끄면(--off) 웹뷰 게임은 그대로, 데모만 녹화 재생.
build_rust() {
  if [ -d "$HOME/.cargo/bin" ]; then PATH="$HOME/.cargo/bin:$PATH"; fi
  if [ "$NO_RUST" = 1 ]; then
    bash "$RUST_SH" --off >"$RUN_DIR/rust-ios.log" 2>&1 || true
    RUST_RESULT="off (--no-rust)"
    log "Rust 물리: 끔 (--no-rust)"
  elif have cargo && have rustup; then
    log "Rust 물리: 아이폰(arm64) 정적 라이브러리 굽는 중 (처음 약 2분)…"
    if bash "$RUST_SH" --device-only </dev/null >"$RUN_DIR/rust-ios.log" 2>&1; then
      RUST_RESULT="on (아이폰 arm64 정적 링크)"
      ok "Rust 물리: 켬"
    else
      tail_errors "$RUN_DIR/rust-ios.log" 8
      bash "$RUST_SH" --off >>"$RUN_DIR/rust-ios.log" 2>&1 || true
      RUST_RESULT="off (빌드 실패 — rust-ios.log)"
      warn "Rust 물리 빌드 실패 → 링크를 끄고 계속(웹 게임 무관, 네이티브 데모만 녹화 재생). 로그: $(rel "$RUN_DIR/rust-ios.log")"
    fi
  else
    bash "$RUST_SH" --off >"$RUN_DIR/rust-ios.log" 2>&1 || true
    RUST_RESULT="off (cargo/rustup 없음)"
    log "Rust 물리: cargo/rustup 이 없어 끔(웹 게임 무관, 네이티브 데모만 녹화 재생). 켜려면 https://rustup.rs"
  fi
}

# Flutter 쪽 Xcode 준비: pub get(lock 그대로) + build ios --config-only(Generated.xcconfig, SPM 플러그인 패키지).
# SPM 은 app/pubspec.yaml 의 flutter: config: enable-swift-package-manager: true 로 이 프로젝트에서만 켠다.
# (flutter_tools flutter_features_config.dart: pubspec > 전역 `flutter config` > 환경 변수 FLUTTER_SWIFT_PACKAGE_MANAGER.
#  환경 변수는 가장 약해서 맥 전역 설정이 꺼 두었으면 못 이긴다. 꺼진 채로 돌면 ios/Podfile 이 생기고
#  추적 파일 ios/Flutter/{Debug,Release}.xcconfig 에 Pods #include 가 들어간다 — cocoapods.dart addPodsDependencyToFlutterXcconfig)
flutter_config() {
  grep -q 'enable-swift-package-manager: true' "$PUFF_APP/pubspec.yaml" ||
    warn "app/pubspec.yaml 에 'flutter: config: enable-swift-package-manager: true' 가 없다 — 맥 전역 설정이 SPM 을 끄면 추적 파일이 바뀐다"
  export PATH="$FLUTTER_ROOT_DIR/bin:$PATH"
  # --enforce-lockfile: pubspec.lock(추적 파일)을 절대 고치지 않고, 안 맞으면 실패한다
  if ! (cd "$PUFF_APP" && "$FLUTTER_BIN" pub get --enforce-lockfile) </dev/null >"$RUN_DIR/pub.log" 2>&1; then
    tail_errors "$RUN_DIR/pub.log" 15
    die 4 "flutter pub get --enforce-lockfile 실패 (로그: $(rel "$RUN_DIR/pub.log"))" \
      "pubspec.lock 이 pubspec.yaml 과 안 맞으면 클라우드에서 lock 을 다시 커밋해야 한다(맥에서 lock 을 고치면 다음 git pull 이 막힘)."
  fi
  # --no-codesign: config-only 에는 서명이 필요 없다. 켜 두면 Flutter 가 인증서를 대화로 묻고 전역 설정(ios-signing-cert)에 저장할 수 있다
  if ! (cd "$PUFF_APP" && "$FLUTTER_BIN" build ios --release --config-only --no-codesign) </dev/null \
    >"$RUN_DIR/config.log" 2>&1; then
    tail_errors "$RUN_DIR/config.log" 20
    die 4 "flutter build ios --config-only 실패 (로그: $(rel "$RUN_DIR/config.log"))"
  fi
  local gen="$PUFF_APP/ios/Flutter/Generated.xcconfig" got
  [ -s "$gen" ] || die 4 "$(rel "$gen") 이 만들어지지 않았다 (로그: $(rel "$RUN_DIR/config.log"))"
  got=$(sed -n 's/^FLUTTER_ROOT=//p' "$gen" | head -n 1 || true)
  [ "$got" = "$FLUTTER_ROOT_DIR" ] ||
    warn "Generated.xcconfig 의 FLUTTER_ROOT='$(rel "$got")' — 이 실행의 Flutter($(rel "$FLUTTER_ROOT_DIR"))와 다르다. 빌드가 다른 Flutter 를 쓸 수 있다"
  if [ -e "$PUFF_APP/ios/Podfile" ]; then
    warn "app/ios/Podfile 이 생겼다 — Swift Package Manager 가 꺼진 채로 돈 것 같다(CocoaPods 경로는 이 레포에서 안 씀)."
    hint "로그: $(rel "$RUN_DIR/pub.log"), $(rel "$RUN_DIR/config.log")"
  fi
  ok "Xcode 준비: Generated.xcconfig + Swift 패키지 (pubspec.lock 그대로)"
}

# ---------------------------------------------------------------------------------------------------------------
launch_app() {
  LAUNCH_RESULT="failed"
  rm -f "$RUN_DIR/launch.json"
  if xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing "$BUNDLE_ID" \
    --json-output "$RUN_DIR/launch.json" >"$RUN_DIR/launch.log" 2>&1; then
    LAUNCH_RESULT="ok"
    ok "실행: $BUNDLE_ID (아이폰 $DEVICE_MODEL)"
    return 0
  fi
  tail_errors "$RUN_DIR/launch.log" 12
  if grep -qiE 'trust|untrusted|not been explicitly trusted|invalid code signature|profile' "$RUN_DIR/launch.log"; then
    warn "아이폰이 아직 이 개발자를 신뢰하지 않는다(첫 설치에서 흔함)."
    hint "아이폰: 설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > 'Apple Development: <Apple ID>' > 신뢰 > 신뢰." \
      "그다음: bash tools/mac/ios_run.sh --launch-only   (또는 앱 아이콘을 누른다)"
  elif grep -qiE 'locked|passcode' "$RUN_DIR/launch.log"; then
    hint "아이폰 잠금을 풀고: bash tools/mac/ios_run.sh --launch-only"
  else
    hint "자세히: $(rel "$RUN_DIR/launch.log"), $(rel "$RUN_DIR/launch.json")"
  fi
  return 1
}

# `devicectl … launch` 가 0 이어도 프로세스를 띄웠을 뿐이다: dyld 오류·첫 프레임 크래시도 0 으로 끝난다(G3 리뷰).
# 기다렸다가 프로세스 목록에서 **이번 실행의 pid**(launch.json)를 찾는다. 다른 Flutter 앱도 Runner.app 이라 이름만으로는 약하다.
PROCS_PY='
import json, sys
def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            for x in walk(v):
                yield x
    elif isinstance(o, list):
        for v in o:
            for x in walk(v):
                yield x
def load(p):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None
procs, launch, install, bundle = load(sys.argv[1]), load(sys.argv[2]), load(sys.argv[3]), sys.argv[4]
if procs is None:
    print("unknown")
    sys.exit(0)
running = [d for d in walk(procs) if "processIdentifier" in d]
def exe(d):
    return str(d.get("executable") or "")
if not running:
    # 키 이름이 예상(runningProcesses[].processIdentifier/executable)과 다르면 G3 처럼 글자로만 찾는다
    with open(sys.argv[1]) as f:
        raw = f.read()
    print(("yes" if "/Runner.app/Runner" in raw else "no") + " name")
    sys.exit(0)
pid = None
for d in walk(launch) if launch is not None else []:
    if "processIdentifier" in d:
        pid = d.get("processIdentifier")
        break
url = None
for d in walk(install) if install is not None else []:
    if d.get("bundleID") == bundle and d.get("installationURL"):
        url = str(d["installationURL"]).rstrip("/") + "/"
        break
if pid is not None:
    hit = any(d.get("processIdentifier") == pid and (not exe(d) or exe(d).endswith("/Runner.app/Runner")) for d in running)
    print(("yes" if hit else "no") + " pid")
elif url:
    print(("yes" if any(exe(d).startswith(url) for d in running) else "no") + " path")
else:
    print(("yes" if any(exe(d).endswith("/Runner.app/Runner") for d in running) else "no") + " name")
'
LAUNCH_WAIT=${PUFF_LAUNCH_WAIT:-8}
verify_running() {
  log "${LAUNCH_WAIT}초 기다린 뒤 $PRODUCT 가 아직 떠 있는지 확인…"
  sleep "$LAUNCH_WAIT"
  local verdict how
  if xcrun devicectl device info processes --device "$DEVICE_ID" --json-output "$RUN_DIR/procs.json" \
    >"$RUN_DIR/procs.log" 2>&1; then
    verdict=$(python3 -I -c "$PROCS_PY" "$RUN_DIR/procs.json" "$RUN_DIR/launch.json" "$RUN_DIR/install.json" \
      "$BUNDLE_ID" 2>>"$RUN_DIR/procs.log" || echo unknown)
  else
    verdict="unknown"
  fi
  how=${verdict#* }
  case "$verdict" in
    yes*)
      RUNNING="yes ($how)"
      LAUNCH_RESULT="ok (${LAUNCH_WAIT}초 뒤에도 떠 있음)"
      ok "${LAUNCH_WAIT}초 뒤에도 떠 있다 (확인 방법: $how)"
      [ "$how" != name ] || warn "pid·설치 경로를 못 읽어 이름(Runner.app)으로만 확인했다 — 다른 Flutter 앱일 수도 있으니 화면 확인"
      ;;
    no*)
      RUNNING="no"
      LAUNCH_RESULT="failed (${LAUNCH_WAIT}초 안에 꺼짐)"
      warn "실행 ${LAUNCH_WAIT}초 뒤 $PRODUCT 가 없다: 시작하다 죽었거나 스스로 꺼졌다."
      hint "크래시 기록: Xcode > Window > Devices and Simulators > (이 아이폰) > View Device Logs (Runner)," \
        "또는 콘솔 보며 실행: docs/app/ios-local.md 「직접 하기」(flutter run --release)."
      return 1
      ;;
    *)
      # 프로세스 목록을 못 읽었으면 성공 영수증을 쓰지 않는다(G3 코덱스 리뷰) → 종료 7
      RUNNING="unknown"
      LAUNCH_RESULT="unverified (프로세스 목록을 못 읽음)"
      warn "$PRODUCT 가 떠 있는지 확인하지 못했다: devicectl 프로세스 목록 실패."
      hint "자세히: $(rel "$RUN_DIR/procs.log"). 케이블·잠금 해제 확인 후: bash tools/mac/ios_run.sh --launch-only"
      return 1
      ;;
  esac
  return 0
}

summary() {
  local total=$((SECONDS - T_START))
  git_check_after || true
  printf '\n%s== 결과%s (%s, %s)\n' "$_C_BLD" "$_C_OFF" "$CONFIG" "$BUNDLE_ID"
  printf '  빌드     : %s\n  설치     : %s\n  실행     : %s\n  떠 있음  : %s\n' "$BUILD_RESULT" "$INSTALL_RESULT" \
    "$LAUNCH_RESULT" "$RUNNING"
  printf '  기능 확인: 재윤님 확인 필요 (홈 화면이 뜨는지, 불 때 소리·햅틱, 60fps 근처 — docs/app/ios-local.md)\n'
  printf '  에셋 %s · Rust %s · Flutter %s\n' "$ASSETS_RESULT" "$RUST_RESULT" "$FLUTTER_DESC"
  [ -z "$TEAM_ID" ] || printf '  팀       : %s (%s)\n' "$(mask "$TEAM_ID")" "$(kind_label "$TEAM_KIND")"
  printf '  추적 파일: %s\n' "$TRACKED_RESULT"
  printf '  걸린 시간: %s초  단계: %s\n' "$total" "$PUFF_STAGE_TIMES"
  printf '  기록     : %s (receipt.txt·errors-masked.txt 에는 식별자 없음)\n' "$(rel "$RUN_DIR")"
}

# ===============================================================================================================
stage_begin "점검 (Xcode·기기·Team·Flutter)"
check_xcode
resolve_device
if [ "$LAUNCH_ONLY" = 1 ]; then
  stage_end
  stage_begin "실행"
  if ! launch_app || ! verify_running; then
    summary
    exit 7
  fi
  stage_end
  summary
  exit 0
fi
resolve_team
ensure_flutter
[ -f "$WORKSPACE/contents.xcworkspacedata" ] || die 3 "$(rel "$WORKSPACE") 가 없다 — 레포가 온전한지 확인(git status)"
if [ "$NO_RUST" = 0 ] && { [ -x "$HOME/.cargo/bin/rustup" ] || have rustup; }; then
  log "Rust: rustup 있음 → 네이티브 데모 물리도 굽는다(약 2분 더, 빼려면 --no-rust; Xcode 빌드가 실패하면 저절로 끄고 다시)"
fi
have node || log "node 없음 → 게임 에셋은 python3 로 만든다(같은 바이트)"
stage_end
if [ "$CHECK_ONLY" = 1 ]; then
  if in_git && [ -n "$(git_tracked_changes)" ]; then
    warn "바뀐 추적 파일이 있다(다음 git pull --ff-only 가 막힐 수 있음): $(git_tracked_changes | tr '\n' ' ')"
    git_tracked_changes >"$RUN_DIR/git-tracked.check"
    pbxproj_team_warn "$RUN_DIR/git-tracked.check"
  fi
  ok "사전 점검 통과 (--check): 빌드·설치·저장은 하지 않았다 (점검 기록: $(rel "$RUN_DIR"))"
  exit 0
fi

git_snapshot
if [ "$CLEAN" = 1 ]; then
  log "clean: $(rel "$DERIVED") $(rel "$PUFF_APP/build")"
  rm -rf "$DERIVED" "$PUFF_APP/build"
fi

stage_begin "flutter 준비 (첫 실행이면 내려받기)"
flutter_prepare
stage_end

stage_begin "에셋 (dist/puff.html + 앱 다리 코드)"
build_assets
stage_end

stage_begin "rust 물리 (선택)"
build_rust
stage_end

stage_begin "xcode준비 (flutter pub get + build ios --config-only)"
flutter_config
stage_end

# ---------------------------------------------------------------------------------------------------------------
# PRODUCT_BUNDLE_IDENTIFIER 는 명령줄로 넘기지 않는다: 명령줄 빌드 설정은 Swift 패키지 대상까지 덮어써서
# webview_flutter_wkwebview 의 리소스 번들까지 com.ffogtive.puff 가 된다. 값은 project.pbxproj 에 이미 있고, 빌드 뒤 아래에서 확인한다.
BUILD_DEST='generic/platform=iOS'
xcode_build() { # -destination $BUILD_DEST
  log "xcodebuild -destination $(printf '%s' "$BUILD_DEST" | sed 's/^id=.*/id=<이 아이폰>/') — 진행 보기: tail -f $(shpath "$RUN_DIR/build.log")"
  xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration "$CONFIG" \
    -destination "$BUILD_DEST" -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
    build </dev/null >"$RUN_DIR/build.log" 2>&1
}
signing_failure() { # 서명·계정 문제면 Rust 를 끄고 다시 빌드해도 소용없다
  grep -qiE "errSecInternalComponent|No Account|requires a development team|No signing certificate|cannot be registered to your development team|App ID limit" \
    "$RUN_DIR/build.log"
}
rust_is_on() { case "$RUST_RESULT" in on*) return 0 ;; *) return 1 ;; esac; }
# generic 빌드 → (프로파일에 이 아이폰이 없으면) 기기 지정 빌드 → (Rust 를 켠 빌드면) Rust 끄고 한 번 더
build_app() {
  BUILD_DEST='generic/platform=iOS'
  if xcode_build; then
    BUILD_RESULT="ok"
    return 0
  fi
  if grep -qiE "doesn.t include the currently selected device|no devices|not registered|No profiles for" "$RUN_DIR/build.log" &&
    [ "$DEVICE_ID" != "?" ]; then
    warn "프로비저닝 프로파일에 이 아이폰이 없다 — 기기 지정(id=) 빌드로 한 번 더(기기 등록)"
    cp "$RUN_DIR/build.log" "$RUN_DIR/build.generic.log"
    BUILD_DEST="id=$DEVICE_ID"
    if xcode_build; then
      BUILD_RESULT="ok (기기 지정 빌드)"
      return 0
    fi
  fi
  # Rust 정적 링크(-force_load·STRIP_STYLE, 맥 미검증)는 데모용 선택 기능 — 그것 때문에 웹 게임 설치까지 막히지 않게
  if rust_is_on && ! signing_failure; then
    cp "$RUN_DIR/build.log" "$RUN_DIR/build.rust-on.log"
    warn "Rust 물리를 링크한 빌드가 실패했다 → 링크를 끄고 한 번 더(웹 게임 무관, 데모만 녹화 재생). 로그: $(rel "$RUN_DIR/build.rust-on.log")"
    bash "$RUST_SH" --off >>"$RUN_DIR/rust-ios.log" 2>&1 || true
    RUST_RESULT="off (Rust 링크 빌드 실패 → 끄고 다시 — build.rust-on.log)"
    if xcode_build; then
      BUILD_RESULT="ok (Rust 끄고 다시)"
      return 0
    fi
  fi
  BUILD_RESULT="failed"
  return 1
}
build_failed_die() {
  tail_errors "$RUN_DIR/build.log"
  local rust_note="Rust 링크는 꺼져 있었다"
  case "$RUST_RESULT" in
    *끄고*) rust_note="Rust 링크를 끄고 다시 해 봤는데도 실패 — 원인은 Rust 가 아니다" ;;
    on*) rust_note="Rust 링크가 켜져 있었다 — --no-rust 로도 해 본다" ;;
  esac
  local xcode_note="Xcode 화면에서 Team 을 고르면 $PBXPROJ_REL 에 Team ID 원문이 들어간다 → 끝나면 git checkout -- $PBXPROJ_REL (커밋 금지)"
  if grep -q errSecInternalComponent "$RUN_DIR/build.log"; then
    die 4 "codesign 이 errSecInternalComponent 로 실패: 이 세션에서 키체인을 못 쓴다." \
      "SSH 말고 맥 화면의 로그인된 Terminal 에서 다시 실행하고, 키체인 창에 로그인 암호 → '항상 허용'." \
      "암호를 명령줄에 넣지 않는다 (docs/app/iphone-deploy.md, 가이드 6절)."
  elif grep -qiE "cannot be registered to your development team" "$RUN_DIR/build.log"; then
    die 4 "Bundle ID $BUNDLE_ID 가 다른 팀에 이미 등록돼 있다 — 고른 팀이 그 팀이 아니다." "$(team_hint)" \
      "Bundle ID 는 바꾸지 않는다(진행 저장이 따로 논다)."
  elif grep -qiE "No Account|requires a development team|No signing certificate|sign in" "$RUN_DIR/build.log"; then
    die 4 "서명 준비가 안 됐다: Xcode > Settings > Apple Accounts > + (로그인) 후 다시 (tools/mac/SIGNING.md 2단계)." \
      "$(team_hint)"
  elif grep -qiE "maximum App ID limit|App ID limit" "$RUN_DIR/build.log"; then
    die 4 "무료 Personal Team 한도(7일에 App ID 10개). Bundle ID $BUNDLE_ID 를 유지하고 기다리거나 안 쓰는 개발 앱 정리." \
      "$(team_hint)"
  elif grep -qE "linker command failed" "$RUN_DIR/build.log"; then
    die 4 "링크 단계에서 실패 (가린 오류: $(rel "$RUN_DIR/errors-masked.txt"))." \
      "$rust_note. 다시: bash tools/mac/ios_run.sh --clean --no-rust"
  elif grep -qE "PhaseScriptExecution failed|Failed to package" "$RUN_DIR/build.log"; then
    # 이 프로젝트의 스크립트 단계는 전부 Flutter 것(Run Script·Thin Binary·scheme prepare) — 성공한 로그에도
    # xcode_backend.sh 명령 줄은 찍히므로 그 이름이 아니라 '실패' 줄로 가른다
    die 4 "Flutter 빌드 단계(xcode_backend.sh)에서 실패 (가린 오류: $(rel "$RUN_DIR/errors-masked.txt"))." \
      "다시 해 보기: bash tools/mac/ios_run.sh --clean   ($rust_note)"
  else
    die 4 "xcodebuild 실패 (가린 오류: $(rel "$RUN_DIR/errors-masked.txt"))." \
      "다시 해 보기: bash tools/mac/ios_run.sh --clean   ($rust_note)" \
      "그래도 안 되면 Xcode 로 원인 보기: open app/ios/Runner.xcworkspace → 아이폰 선택 → Run(⌘R)." "$xcode_note"
  fi
}
verify_app() { # 서명·Bundle ID 확인 — 틀리면 설치하지 않는다
  APP="$DERIVED/Build/Products/$CONFIG-iphoneos/$PRODUCT"
  test -d "$APP" || die 4 "빌드된 앱이 없다: $(rel "$APP")"
  codesign --verify --deep --strict "$APP" >"$RUN_DIR/codesign.log" 2>&1 || {
    BUILD_RESULT="failed (codesign verify)"
    tail_errors "$RUN_DIR/codesign.log" 12
    die 4 "codesign --verify --deep --strict 실패: $(rel "$APP")"
  }
  ACTUAL_ID=$("$PLISTBUDDY" -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null || true)
  if [ "$ACTUAL_ID" != "$BUNDLE_ID" ]; then
    BUILD_RESULT="failed (bundle id '$ACTUAL_ID')"
    die 4 "앱 Bundle ID 가 '$ACTUAL_ID' 다(필요 '$BUNDLE_ID') — 다른 앱을 덮어쓸 수 있어 설치하지 않는다."
  fi
  ok "빌드: $(rel "$APP") (서명됨, $BUNDLE_ID)"
}
install_app() {
  if xcrun devicectl device install app --device "$DEVICE_ID" "$APP" \
    --json-output "$RUN_DIR/install.json" >"$RUN_DIR/install.log" 2>&1; then
    INSTALL_RESULT="ok"
    ok "설치: 아이폰 $DEVICE_MODEL"
    return 0
  fi
  INSTALL_RESULT="failed"
  return 1
}
profile_install_error() { grep -qiE 'provisioning profile|0xe8008015|0xe800801c' "$RUN_DIR/install.log"; }

stage_begin "xcodebuild ($CONFIG, generic/platform=iOS, 자동 서명)"
log "macOS 가 'codesign' 에 로그인 키체인 암호를 물을 수 있다 — Mac 로그인 암호 입력 후 '항상 허용'. 첫 빌드는 몇 분 걸린다."
build_app || build_failed_die
verify_app
stage_end

# ---------------------------------------------------------------------------------------------------------------
stage_begin "설치 (devicectl; 기존 앱과 데이터는 그대로)"
if ! install_app && profile_install_error && [ "$DEVICE_ID" != "?" ] && [ "$BUILD_DEST" != "id=$DEVICE_ID" ]; then
  # generic 빌드는 팀에 이미 등록된 기기들로만 프로파일을 만든다 → 이 아이폰이 빠졌으면 빌드는 되고 설치만 실패한다
  tail_errors "$RUN_DIR/install.log" 6
  warn "설치 프로파일에 이 아이폰이 없는 것 같다 → 기기 지정(id=) 빌드로 이 아이폰을 팀에 등록하고 한 번 더"
  cp "$RUN_DIR/install.log" "$RUN_DIR/install.generic.log"
  cp "$RUN_DIR/build.log" "$RUN_DIR/build.generic.log"
  BUILD_DEST="id=$DEVICE_ID"
  build_ok=1
  xcode_build || build_ok=0
  if [ "$build_ok" = 0 ]; then
    BUILD_RESULT="failed (설치 실패 뒤 기기 지정 빌드)"
    build_failed_die
  fi
  BUILD_RESULT="ok (설치 실패 → 기기 지정 빌드)"
  verify_app
  if install_app; then INSTALL_RESULT="ok (기기 등록 후 다시)"; fi
fi
if [ "$INSTALL_RESULT" = failed ]; then
  tail_errors "$RUN_DIR/install.log" 12
  if grep -qiE 'developer mode' "$RUN_DIR/install.log"; then
    hint "개발자 모드 켜기: 설정 > 개인정보 보호 및 보안 > 개발자 모드 (tools/mac/SIGNING.md 4단계)"
  elif grep -qiE 'locked|passcode' "$RUN_DIR/install.log"; then
    hint "아이폰 잠금을 풀고 다시: bash tools/mac/ios_run.sh   (빌드는 캐시로 빨라진다)"
  elif profile_install_error; then
    hint "기기 지정 빌드로도 프로파일에 이 아이폰이 없다: Xcode > Settings > Apple Accounts 에서 팀 확인 후 다시." \
      "$(team_hint)"
  else
    [ "$TUNNEL_DOWN" = 0 ] || hint "시작할 때부터 devicectl 이 아이폰에 닿지 못했다(unavailable)."
    hint "아이폰을 케이블로 연결하고 잠금을 푼 뒤 다시: bash tools/mac/ios_run.sh   (빌드는 캐시로 빨라진다)" \
      "그래도 안 되면 Xcode > Open Developer Tool > Device Hub 에서 아이폰이 연결됨으로 보이는지 확인 (tools/mac/SIGNING.md 3단계)."
  fi
  summary
  exit 6
fi
stage_end

stage_begin "실행"
if ! launch_app || ! verify_running; then
  stage_end
  summary
  exit 7
fi
stage_end
summary

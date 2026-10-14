# shellcheck shell=bash disable=SC2034  # 라이브러리: 변수는 이 파일을 source 하는 스크립트가 쓴다
# tools/mac/lib/common.sh — ios_run.sh 가 쓰는 공용 함수 (G3 tools/mac/lib/common.sh 를 G2·Flutter 용으로 옮김).
#
# macOS 기본 bash(3.2)용으로 쓴다: 연관 배열·mapfile·${x,,} 금지, 비어 있을 수 있는 배열은 ${arr[@]+"${arr[@]}"} 로 편다
# (bash < 4.4 는 `set -u` 에서 빈 배열 "${arr[@]}" 를 unbound 로 본다). BSD 도구: `sed -i` 없음, `timeout` 없음,
# `readlink -f` 없음, sha512sum 대신 `shasum`.

# 고정값 (CLAUDE.md '앱' 절: 컨테이너·맥이 같은 Flutter 로 pub/lock 을 푼다)
PUFF_FLUTTER_VERSION="3.47.5"
PUFF_FLUTTER_REVISION="6a19cca56475dbfba1478ee68d7bd0c2ef891da1" # 태그 3.47.5 = 이 커밋 (git ls-remote 로 확인, 2026-10-14)
# 미러로 바꿔도 된다: 받은 뒤 위 리비전과 다르면 쓰지 않는다
PUFF_FLUTTER_GIT_URL=${PUFF_FLUTTER_GIT_URL:-"https://github.com/flutter/flutter.git"}
PUFF_BUNDLE_ID="com.ffogtive.puff" # app/ios/Runner.xcodeproj/project.pbxproj 의 PRODUCT_BUNDLE_IDENTIFIER (바꾸지 말 것)

PUFF_ROOT=${PUFF_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}
PUFF_APP="$PUFF_ROOT/app"
PUFF_HOME=${PUFF_HOME:-"$HOME/.puff"}                                         # Flutter 설치 등(레포 밖)
PUFF_ENV_FILE=${PUFF_ENV_FILE:-"$HOME/.config/puff/iphone-deploy.env"} # Team·기기 값(레포 밖, chmod 600)

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  _C_RED=$'\033[31m' _C_YEL=$'\033[33m' _C_GRN=$'\033[32m' _C_BLD=$'\033[1m' _C_OFF=$'\033[0m'
else
  _C_RED='' _C_YEL='' _C_GRN='' _C_BLD='' _C_OFF=''
fi

log() { printf '%s[%s]%s %s\n' "$_C_BLD" "${PUFF_LOG_TAG:-puff}" "$_C_OFF" "$*"; }
ok() { printf '%s[%s] ✅%s %s\n' "$_C_GRN" "${PUFF_LOG_TAG:-puff}" "$_C_OFF" "$*"; }
warn() { printf '%s[%s] ⚠️  %s%s\n' "$_C_YEL" "${PUFF_LOG_TAG:-puff}" "$*" "$_C_OFF" >&2; }
# die <종료 코드> <메시지> [이어지는 안내 줄...]: 할 일을 담은 메시지 하나(뒤 인자는 들여쓴 안내 줄)를 찍고 끝낸다.
# 코드: 2 사용법, 3 환경, 4 빌드, 5 기기 (ios_run.sh 가 6 설치, 7 실행, 9 잠금을 더한다).
# `set -euo pipefail` 에서 막지 않은 명령이 실패하면 아무 말 없이 끝난다(G3 실제 맥에서 '== preflight' 직후 멈춤).
# 대신 파일·줄·명령을 찍는다. errtrace(-E)가 함수·서브셸에도 트랩을 물려준다. die/exit 로 끝나면 ERR 는 안 걸린다.
puff_on_err() {
  printf '%s[%s] ❌ 예상 못 한 실패 (exit %s) %s:%s: %s%s\n' "$_C_RED" "${PUFF_LOG_TAG:-puff}" "$1" \
    "${3##*/}" "$2" "$4" "$_C_OFF" >&2
  printf '      → 이 줄을 그대로 보내 주세요 (식별자 없음 — docs/app/iphone-deploy.md 「맥에서 한 줄」).\n' >&2
}
set -E
trap 'puff_on_err $? $LINENO "${BASH_SOURCE[0]:-?}" "$BASH_COMMAND"' ERR

die() {
  local code=$1
  shift
  printf '%s[%s] ❌ %s%s\n' "$_C_RED" "${PUFF_LOG_TAG:-puff}" "${1:-}" "$_C_OFF" >&2
  [ $# -le 1 ] || {
    shift
    hint "$@"
  }
  exit "$code"
}
# hint <줄...>: warn/die 뒤에 붙는 들여쓴 안내(stderr).
hint() {
  local line
  for line in "$@"; do printf '      %s\n' "$line" >&2; done
}

have() { command -v "$1" >/dev/null 2>&1; }
is_macos() { [ "$(uname -s 2>/dev/null || true)" = "Darwin" ]; }

# version_ge <a> <b>: 점으로 나눈 버전 a >= b 이면 참 (숫자 비교, 빠진 자리 = 0).
version_ge() {
  local a=$1 b=$2 i x y
  local IFS=.
  # shellcheck disable=SC2206
  local -a av=($a) bv=($b)
  for i in 0 1 2 3; do
    x=${av[$i]:-0}
    y=${bv[$i]:-0}
    x=${x%%[!0-9]*}
    y=${y%%[!0-9]*}
    x=${x:-0}
    y=${y:-0}
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 0
}

# sha256_of <파일> (에셋이 node 경로와 python3 경로에서 같은지 영수증에 남길 때)
sha256_of() {
  if have shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif have sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf '?'
  fi
}

# 단계 타이머: stage_begin <이름>; ...; stage_end  -> PUFF_STAGE_TIMES 에 "이름=N초" 를 쌓는다.
PUFF_STAGE_TIMES=""
_stage_label=""
_stage_t0=0
stage_begin() {
  _stage_label=$1
  _stage_t0=$SECONDS
  printf '\n%s== %s%s\n' "$_C_BLD" "$1" "$_C_OFF"
}
stage_end() {
  local dt=$((SECONDS - _stage_t0))
  PUFF_STAGE_TIMES="${PUFF_STAGE_TIMES}${_stage_label%% *}=${dt}s "
}

# ask <질문> -> REPLY (대화형이 아니거나 PUFF_YES=1 이면 묻지 않고 실패).
ask() {
  REPLY=""
  if [ "${PUFF_YES:-0}" = 1 ] || [ ! -t 0 ]; then
    return 1
  fi
  printf '%s[%s] ❓ %s%s ' "$_C_YEL" "${PUFF_LOG_TAG:-puff}" "$1" "$_C_OFF"
  read -r REPLY || REPLY=""
  return 0
}

# rel <경로>: 메시지용. 레포 안이면 ${PUFF_ROOT} 기준 상대 경로, 홈 아래면 ~/… — 붙여 넣은 출력에 맥 사용자 이름
# (/Users/<이름>)이 남지 않게.
rel() {
  case "$1" in
    "$PUFF_ROOT"/*) printf '%s' "${1#"$PUFF_ROOT"/}" ;;
    "$HOME"/*) printf '%s/%s' '~' "${1#"$HOME"/}" ;;
    *) printf '%s' "$1" ;;
  esac
}
# shpath <경로>: 안내 명령에 넣을 경로(셸에 그대로 붙여 넣어도 되게). 홈 아래면 ~/<printf %q>, 아니면 printf %q.
shpath() {
  case "$1" in
    "$HOME") printf '%s' '~' ;;
    "$HOME"/*) printf '%s/%q' '~' "${1#"$HOME"/}" ;;
    *) printf '%q' "$1" ;;
  esac
}

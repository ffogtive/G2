#!/bin/bash
# shellcheck disable=SC2015,SC2016,SC2012,SC2088  # pass() 는 늘 0 이라 A && pass || fail 이 안전 · 가짜 본문·찾는 글자는 일부러 작은따옴표 · 실행 폴더는 ls -t 로 최신만 · "~/…" 는 펼치면 안 됨
# fake-mac.sh — 리눅스(컨테이너)에서 '가짜 맥'으로 tools/mac/ios_run.sh 를 처음부터 끝까지 돌려 흐름을 시험한다.
#
# 가설: (확인 방법) 맥에서만 도는 도구(uname·sw_vers·xcode-select·xcodebuild·xcrun devicectl·security·openssl(LibreSSL)·
#   defaults·codesign·PlistBuddy·git clone·flutter·cargo/rustup·nm·lipo)를 fakes/ 의 가짜로 PATH 앞에 두고 fixtures/ 의
#   실제 모양 출력(devicectl JSON Xcode 16·27 꼴, 인증서, Xcode 계정 plist, xcodebuild 오류 로그, flutter --version)을 주면,
#   진짜 맥 없이도 분기·종료 코드·안내·영수증·추적 파일·식별자 가림을 모두 확인할 수 있다.
#   진짜 Xcode 빌드·서명·아이폰 설치·화면은 여기서 시험할 수 없다(미검증 — docs/app/iphone-deploy.md).
#
# 사용: bash tools/mac/test/fake-mac.sh                       (약 1~2분, 네트워크 없음)
#   MACLAND=<폴더>   맥 사용자 공간으로 한 번 더: bash 3.2.57(Apple bash-144)·awk 20200816·BSD sed/grep/cut/comm
#                    — 먼저 bash tools/mac/test/build-macland.sh <폴더> (Apple 공개 소스로 빌드, 약 2분)
#   MAC_BASH=<bash>  ios_run.sh 와 그 안의 `bash …` 를 이 bash 로(MACLAND 를 주면 저절로 그 bash)
#   MAC_PYTHON=<python3.9>  맥 기본 python3(3.9) 대신 쓸 것 (예: $(uv python find 3.9))
#   MAC_ZSH=<zsh>    찍힌 복구 명령을 재윤님 Terminal 처럼 zsh 로 붙여 넣어 본다(기본: PATH 의 zsh, 없으면 bash)
#   REAL_FLUTTER=<flutter git 원본>  + 진짜 Flutter 3.47.5 얕은 clone → 리비전·--version·precache·pub get(진짜, 약 3분)
#   KEEP=1           임시 폴더를 남긴다(출력: <임시>/out/<시나리오>.txt·.receipt·.fake.log)
# 구성: fakes/      가짜 명령(PATH 앞) — sdk/flutter 는 가짜 SDK 마다 복사, rust/ 는 ~/.cargo/bin 에 넣을 때만
#       fixtures/   devicectl/ xcode/ certs/ flutter/ — 식별자는 모두 가짜 값(Team ABCDE12345 등)
set -euo pipefail
unset CDPATH # export 된 CDPATH 면 `cd 상대경로` 가 경로를 두 번 찍는다
SRC=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SRC/../../.." && pwd)
W=$(mktemp -d "${TMPDIR:-/tmp}/puff-fakemac.XXXXXX")
if [ "${KEEP:-0}" = 1 ]; then echo "임시 폴더: $W"; else trap 'rm -rf "$W"' EXIT; fi
# fakes·fixtures 를 임시 폴더로 복사해 쓴다(실행 비트를 잃은 checkout 에서도 돌고, 시험 중 레포 사본과 섞이지 않게)
T="$W/kit"
mkdir -p "$T"
cp -R "$SRC/fakes" "$SRC/fixtures" "$T/"
chmod +x "$T/fakes/"* "$T/fakes/sdk/"* "$T/fakes/rust/"*
FAKES="$T/fakes"
MACLAND=${MACLAND:-}
if [ -n "$MACLAND" ]; then
  [ -x "$MACLAND/bin/bash" ] || {
    echo "MACLAND=$MACLAND 에 bin/bash 가 없다 — 먼저: bash tools/mac/test/build-macland.sh $MACLAND"
    exit 2
  }
  MAC_BASH=${MAC_BASH:-$MACLAND/bin/bash}
fi
RUN_BASH=${MAC_BASH:-bash}
PASTE_SH=${MAC_ZSH:-$(command -v zsh 2>/dev/null || true)}
paste_run() { # <명령> [HOME]: 안내로 찍힌 명령을 Terminal(맥 기본 zsh)에 붙여 넣은 것처럼 실행
  if [ -n "$PASTE_SH" ]; then env HOME="${2:-$HOME}" "$PASTE_SH" -f -c "$1"; else env HOME="${2:-$HOME}" bash -c "$1"; fi
}
REV=6a19cca56475dbfba1478ee68d7bd0c2ef891da1
# fixtures 와 같은 가짜 식별자 (출력·영수증에 원문으로 나오면 안 되는 것들)
TEAM=ABCDE12345 TEAM2=QWERT67890
UDID=00008110-000A1B2C3D4E5F60 CD=8A3B1C2D-0F1E-4D5C-9B8A-7F6E5D4C3B2A
UDID2=00008120-000F9E8D7C6B5A40 CD2=1F2E3D4C-5B6A-4978-8695-A4B3C2D1E0F9
NAME="Tester’s iPhone" PERSONAL=ZZZZZZZZZZ PERSONAL2=YYYYYYYYYY ECID=1234567890123456 SERIAL=F2LXY0ZZZZ01 EMAIL=tester@example.com
PASS=0 FAIL=0 NSCEN=0
pass() { PASS=$((PASS + 1)); printf '  ✅ %s\n' "$*"; }
fail() { FAIL=$((FAIL + 1)); printf '  ❌ %s\n' "$*"; }

# ---------------------------------------------------------------------------------------------------------------
# 0) 이식성 정적 검사 — 실행되지 않은 분기의 bash 4 문법·GNU 전용 옵션·GNU 정규식도 잡는다.
#    (MACLAND 의 BSD sed/grep 도 glibc 정규식 위라서 BRE 의 \+ \? \| 를 받아 준다 → 여기서 막는다)
echo "== 0. 이식성 정적 검사 (bash 3.2 · BSD 도구)"
lint() { # <파일...>: 파이썬 문자열 블록(…_PY=' … ')과 주석 줄을 빼고 찾는다
  local f bad=0 hits
  for f in "$@"; do
    hits=$(awk -v q="'" '$0 ~ ("^[A-Z_]+_PY=" q "$") {py = 1; next} py && $0 == q {py = 0; next} !py && !/^[[:space:]]*#/ {print FNR ": " $0}' "$f" |
      grep -nE -e '(^|[^[:alnum:]_])(declare|local|typeset) -[a-zA-Z]*[Ang]' \
        -e '(^|[^[:alnum:]_])(mapfile|readarray|coproc)([^[:alnum:]_]|$)' \
        -e '\$\{[A-Za-z_][A-Za-z0-9_]*(,,?|\^\^?)\}' -e '\$\{[A-Za-z_][A-Za-z0-9_]*@[QEPAaKk]\}' \
        -e '\|&' -e '&>>' -e ';;&' -e '\$\{[A-Za-z_][A-Za-z0-9_]*\[-[0-9]+\]\}' -e '(^|[[:space:]])\[\[? -v ' \
        -e '\{[a-z_]+\}[<>]' -e '(^|[^[:alnum:]_])read -[a-zA-Z]*[Ni]' -e '\$BASHPID' -e '\$EPOCH(SECONDS|REALTIME)' \
        -e 'shopt -s (globstar|lastpipe|autocd)' -e 'wait -n' \
        -e '(^|[^[:alnum:]_])sed( -[a-zA-Z]+)* -i' -e '(^|[^[:alnum:]_])grep( -[a-zA-Z]+)* -[a-zA-Z]*P' \
        -e 'readlink -f' -e '(^|[^[:alnum:]_])date( -[a-zA-Z]+)* -d ' -e 'stat -c' -e '-printf' -e 'xargs -r' \
        -e '(^|[;&|(][[:space:]]*|^[[:space:]]*)(timeout|tac|numfmt) ' \
        -e '(sed|grep)[^|]*\\[+?|sSwWbB<>]' -e "(sed|grep)[^|]*'[^']*\\\\[tn]" || true)
    if [ -n "$hits" ]; then
      bad=1
      printf '%s\n' "$hits" | sed "s|^|    ${f#"$ROOT"/}:|"
    fi
  done
  return $bad
}
if lint "$ROOT/tools/mac/ios_run.sh" "$ROOT/tools/mac/lib/common.sh" "$ROOT/native/puff_sim/scripts/build-ios.sh"; then
  pass "lint: ios_run.sh·common.sh·build-ios.sh 에 bash 4·GNU 전용 꼴 없음"
else
  fail "lint: 위 줄이 bash 3.2 / BSD 에서 다르게 돈다"
fi
# 음성 대조: 검사가 실제로 잡는가
printf 'x=${a,,}\nsed -i "s/a/b/" f\necho a | grep -P x\nsed "s/a\\+/b/"\nmapfile -t L <f\n' >"$W/lint-neg.sh"
n=$(lint "$W/lint-neg.sh" 2>/dev/null | grep -c . || true)
[ "$n" -ge 5 ] && pass "lint 음성 대조: 일부러 넣은 5줄을 잡음 ($n)" || fail "lint 음성 대조: $n 줄만 잡음"
if command -v shellcheck >/dev/null 2>&1; then
  fk="${SRC#"$ROOT"/}/fakes" # source= 주석이 레포 루트 기준이라 루트에서 돌린다
  if (cd "$ROOT" && shellcheck -x tools/mac/ios_run.sh tools/mac/lib/common.sh "${SRC#"$ROOT"/}/fake-mac.sh" \
    "${SRC#"$ROOT"/}/build-macland.sh" "$fk/uname" "$fk/sw_vers" "$fk/xcode-select" "$fk/security" "$fk/openssl" "$fk/defaults" \
    "$fk/codesign" "$fk/git" "$fk/nm" "$fk/lipo" "$fk/xcodebuild" "$fk/sdk/flutter" "$fk/rust/cargo" "$fk/rust/rustup" \
    "$fk/rust/rustc" "$fk/rust/llvm-ar" "$fk/rust/llvm-objcopy") >"$W/shellcheck.txt" 2>&1; then
    pass "shellcheck -x: 경고 0"
  else
    fail "shellcheck: $(grep -c '^In ' "$W/shellcheck.txt") 곳"
    head -30 "$W/shellcheck.txt"
  fi
fi
# 커밋 가능성: fakes·fixtures 중 gitignore 에 걸려 커밋에서 빠지는 파일이 없어야 한다(*.log 규칙에 걸렸던 적 있음)
ign=$(git -C "$ROOT" ls-files -o -i --exclude-standard -- "${SRC#"$ROOT"/}" || true)
[ -z "$ign" ] && pass "fakes·fixtures 가 gitignore 에 안 걸림(커밋에 다 들어감)" || fail "gitignore 에 걸린 시험 파일: $ign"
for f in "$ROOT/tools/mac/ios_run.sh" "$ROOT/tools/mac/lib/common.sh" "$ROOT/native/puff_sim/scripts/build-ios.sh"; do
  "$RUN_BASH" -n "$f" && pass "$("$RUN_BASH" -c 'echo bash ${BASH_VERSION%%(*}') -n ${f#"$ROOT"/}" || fail "문법 오류: $f"
done

# ---------------------------------------------------------------------------------------------------------------
# 1) 레포 임시 clone + 지금 작업 트리의 바뀐/새 파일을 얹어 커밋(시작 상태 = 깨끗한 트리)
git clone -q "$ROOT" "$W/repo"
(cd "$ROOT" && git ls-files -m -o --exclude-standard -z) | while IFS= read -r -d '' f; do
  [ -e "$ROOT/$f" ] || continue # 지운 파일(-m 에도 나온다)은 아래 -d 가 처리
  mkdir -p "$W/repo/$(dirname "$f")"
  cp -p "$ROOT/$f" "$W/repo/$f"
done
(cd "$ROOT" && git ls-files -d -z) | while IFS= read -r -d '' f; do rm -f "$W/repo/$f"; done
git -C "$W/repo" add -A
git -C "$W/repo" -c user.name=fakemac -c user.email=fakemac@example.invalid commit -qm 'fake-mac: 작업 트리' || true
R="$W/repo"
commit_r() { git -C "$R" -c user.name=fakemac -c user.email=fakemac@example.invalid commit -qam "$1"; }

# ---------------------------------------------------------------------------------------------------------------
# 2) 가짜 맥 환경: $W/bin(이번 실행만의 심: bash·python3) + fakes/ + (MACLAND/bin) + /usr/bin:/bin
mkdir -p "$W/bin" "$W/home" "$W/state" "$W/nodebin" "$W/pybroken" "$W/othersdk-bin"
LOG="$W/fake.log"
: >"$LOG"
make_sdk() { # <폴더> <리비전>: 가짜 Flutter SDK (bin/flutter + .git/HEAD)
  mkdir -p "$1/bin"
  cp "$FAKES/sdk/flutter" "$1/bin/flutter"
  chmod +x "$1/bin/flutter"
  git init -q "$1"
  echo "$2" >"$1/.git/HEAD"
}
make_sdk "$W/sdk" "$REV"
make_sdk "$W/othersdk" 0b591f2c8278ab1c6ec0b72fc3a6cd8f1e2b1c09 # PATH 에만 있는 다른 버전(3.44.2)
ln -s "$W/othersdk/bin/flutter" "$W/othersdk-bin/flutter"
ln -s "$(command -v node)" "$W/nodebin/node"
# Command Line Tools 가 없는 맥의 /usr/bin/python3 껍데기(설치 창만 띄우고 실패)
printf '#!/bin/sh\necho "xcode-select: note: No developer tools were found, requesting install." >&2\nexit 1\n' >"$W/pybroken/python3"
if [ -n "${MAC_BASH:-}" ]; then # 스크립트 안의 `bash …`(build-ios.sh 등)도 같은 bash 로
  printf '#!/bin/sh\nexec %s "$@"\n' "$MAC_BASH" >"$W/bin/bash"
fi
if [ -n "${MAC_PYTHON:-}" ]; then
  printf '#!/bin/sh\nexec %s "$@"\n' "$MAC_PYTHON" >"$W/bin/python3"
fi
chmod +x "$W/bin/"* "$W/pybroken/python3" 2>/dev/null || true
PATH_BASE="$W/bin:$FAKES${MACLAND:+:$MACLAND/bin}:/usr/bin:/bin"
echo "== 가짜 맥: bash $("$RUN_BASH" -c 'echo $BASH_VERSION') · python $(PATH=$PATH_BASE python3 -c 'import sys; print(sys.version.split()[0])')" \
  "· awk: $(PATH=$PATH_BASE awk --version 2>&1 | head -n 1) · grep: $(PATH=$PATH_BASE grep --version 2>&1 | head -n 1)"
rust_kit() { # 가짜 rustup 도구 모음을 가짜 홈에 (진짜 build-ios.sh 가 돈다)
  local sys="$W/home/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/aarch64-apple-darwin/bin"
  mkdir -p "$W/home/.cargo/bin" "$sys"
  cp "$FAKES/rust/cargo" "$FAKES/rust/rustup" "$FAKES/rust/rustc" "$W/home/.cargo/bin/"
  cp "$FAKES/rust/llvm-ar" "$FAKES/rust/llvm-objcopy" "$sys/"
}

# ---------------------------------------------------------------------------------------------------------------
# 3) 시나리오 실행기
OUT="$W/out"
mkdir -p "$OUT"
# run <이름> <기대 종료 코드> [VAR=값 ...] -- [ios_run.sh 인자 ...]
#   MODE=rel  레포 폴더에서 상대 경로(bash tools/mac/ios_run.sh — 한 줄 명령과 같은 꼴)로 부른다
#   MODE=pty  가짜 터미널(script)로 부르고 INPUT 을 키보드 입력으로 준다(대화형 묻기 시험, 색 켜짐)
#   MODE=int  INT_AFTER(파일 또는 출력 글자)가 보이면 프로세스 그룹에 SIGINT(Ctrl-C)를 보낸다
SCEN_LIST=""
run() {
  local name=$1 want=$2 rc=0
  shift 2
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : >"$LOG"
  NSCEN=$((NSCEN + 1))
  local pass_env=() v
  for v in HTTPS_PROXY HTTP_PROXY NO_PROXY https_proxy http_proxy no_proxy SSL_CERT_FILE CURL_CA_BUNDLE \
    GIT_SSL_CAINFO NODE_EXTRA_CA_CERTS REQUESTS_CA_BUNDLE; do # 네트워크 쓰는 진짜 Flutter 경로용(가짜 시나리오는 안 씀)
    [ -z "${!v:-}" ] || pass_env+=("$v=${!v}")
  done
  local color=(NO_COLOR=1)
  [ "${MODE:-}" != pty ] || color=()
  local cmd=(env -i ${pass_env[@]+"${pass_env[@]}"} HOME="$W/home" PATH="$PATH_BASE" LANG=C.UTF-8 TERM=xterm-256color
    ${color[@]+"${color[@]}"} PLISTBUDDY="$FAKES/PlistBuddy" PUFF_LAUNCH_WAIT=0 FAKE_LOG="$LOG" FAKE_KIT="$T" FAKE_STATE="$W/state"
    FAKE_UDID="$UDID" FAKE_DEVICE_NAME="$NAME" FLUTTER="$W/sdk" ${envs[@]+"${envs[@]}"} "$RUN_BASH")
  case "${MODE:-}" in
    rel) (cd "$R" && "${cmd[@]}" tools/mac/ios_run.sh "$@") </dev/null >"$OUT/$name.txt" 2>&1 || rc=$? ;;
    pty)
      printf '%s\n' "${INPUT:-}" | script -qec "$(printf '%q ' "${cmd[@]}" "$R/tools/mac/ios_run.sh" "$@")" /dev/null \
        >"$OUT/$name.txt" 2>&1 || rc=$?
      ;;
    int)
      rc=$(python3 -I - "$OUT/$name.txt" "$INT_AFTER" "${cmd[@]}" "$R/tools/mac/ios_run.sh" "$@" <<'PY'
import os, signal, subprocess, sys, time
out, marker, argv = sys.argv[1], sys.argv[2], sys.argv[3:]
with open(out, "wb") as f:
    p = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
    t0 = time.time()
    while time.time() - t0 < 60 and p.poll() is None:
        if os.path.exists(marker) or marker.encode() in open(out, "rb").read():
            break
        time.sleep(0.1)
    time.sleep(0.3)
    if p.poll() is None:
        os.killpg(p.pid, signal.SIGINT)
    rc = p.wait()
print(128 - rc if rc < 0 else rc)
PY
      )
      ;;
    *) "${cmd[@]}" "$R/tools/mac/ios_run.sh" "$@" </dev/null >"$OUT/$name.txt" 2>&1 || rc=$? ;;
  esac
  cp "$LOG" "$OUT/$name.fake.log"
  SCEN_LIST="$SCEN_LIST$name=$rc/$want "
  if [ "$rc" = "$want" ]; then pass "$name: 종료 $rc"; else
    fail "$name: 종료 $rc (기대 $want)"
    tail -n 15 "$OUT/$name.txt" | sed 's/^/        /'
  fi
  # 어떤 시나리오든: 예상 못 한 실패(ERR 트랩) 줄이 없어야 한다 — die 로 안내하지 못하고 넘어진 것
  if grep -qF '예상 못 한 실패' "$OUT/$name.txt"; then fail "$name: ERR 트랩 — $(grep -F '예상 못 한 실패' "$OUT/$name.txt" | head -n 1)"; fi
}
has() { if grep -qF -- "$3" "$OUT/$1.$2"; then pass "$1: '$3'"; else fail "$1: '$3' 없음 ($2)"; fi; }
hasnt() { if grep -qF -- "$3" "$OUT/$1.$2"; then fail "$1: '$3' 이 있으면 안 됨 ($2)"; else pass "$1: '$3' 없음"; fi; }
receipt() { # 가장 최근 실행의 receipt.txt (+ 둘째 인자: 그 실행 폴더의 다른 파일 → $OUT/<이름>.<파일>)
  local d
  # sed -n 1p 는 끝까지 읽는다 — `| head -n 1` 이면 실행 폴더가 100개를 넘을 때 ls 가 SIGPIPE → pipefail+set -e 로 하네스가 141 로 죽었다
  d=$(ls -td "$R/.local/deploy-runs"/*/ 2>/dev/null | sed -n 1p)
  cp "${d}receipt.txt" "$OUT/$1.receipt" 2>/dev/null || : >"$OUT/$1.receipt"
  [ -z "${2:-}" ] || cp "${d}$2" "$OUT/$1.$2" 2>/dev/null || : >"$OUT/$1.$2"
}
clean_tree() { # 추적 파일이 그대로이고 gitignore 안 된 새 파일도 없는가
  local s
  s=$(git -C "$R" status --porcelain)
  if [ -z "$s" ]; then pass "$1: git status 깨끗"; else fail "$1: git status 더러움: $s"; fi
}
unlocked() { [ ! -d "$R/.local/iphone-deploy.lock" ] && pass "$1: 잠금 풀림" || fail "$1: 잠금이 남음"; }

echo
echo "== 1. 맥 아님 · 도움말 · 사용법"
env -i HOME="$W/home" PATH=/usr/bin:/bin LANG=C.UTF-8 NO_COLOR=1 "$RUN_BASH" "$R/tools/mac/ios_run.sh" >"$OUT/linux.txt" 2>&1 && rc=0 || rc=$?
if [ "$rc" = 3 ]; then pass "linux: 종료 3"; else fail "linux: 종료 $rc (기대 3)"; fi
has linux txt "맥에서만"
[ ! -e "$R/.local" ] && pass "linux: .local 을 만들지 않음" || fail "linux: .local 이 생김"
run help 0 -- --help
has help txt "사용: bash tools/mac/ios_run.sh"
hasnt help txt "set -euo"
run usage 2 -- --bogus
has usage txt "모르는 옵션"
run usage_device 2 -- --device

echo
echo "== 2. 사전 점검 (--check) · Xcode 준비"
run check 0 -- --check
has check txt "사전 점검 통과"
hasnt check fake.log "xcodebuild -workspace"
hasnt check fake.log "pub get"
hasnt check fake.log "device install"
[ ! -e "$R/app/assets/www/index.html" ] && pass "check: 에셋을 만들지 않음" || fail "check: 에셋이 생김"
has check txt "AB******45"
has check txt "기기: iPhone 15"
has check txt "빌드·설치·저장은 하지 않았다"
[ "$(stat -c %a "$R/.local")" = 700 ] && pass "check: .local 권한 700" || fail "check: .local 권한 $(stat -c %a "$R/.local")"
# 한 줄 명령처럼 레포 폴더에서 상대 경로로 + export 된 CDPATH (예전엔 SCRIPT_DIR 이 두 줄 → common.sh 못 찾음)
MODE=rel run cdpath 0 "CDPATH=.:$W" -- --check
has cdpath txt "사전 점검 통과"
run xcode_old 3 FAKE_XCODE_VERSION=15.4 -- --check
has xcode_old txt "Xcode 15.4 는 너무 오래됐다"
receipt xcode_old
has xcode_old receipt "xcode=15.4"
has xcode_old receipt "ios=?" # 기기를 보기 전에 끝남 — set -u 에서도 영수증이 써진다
run xcode_clt 3 FAKE_XCODE_SELECT=clt -- --check
has xcode_clt txt "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
run xcode_first 3 FAKE_FIRST_LAUNCH=needed -- --check
has xcode_first txt "runFirstLaunch"
run ios_sdk 3 FAKE_IOS_SDK=missing -- --check
has ios_sdk txt "xcodebuild -downloadPlatform iOS"
run python_stub 3 "PATH=$W/pybroken:$PATH_BASE" -- --check
has python_stub txt "python3 가 돌지 않는다"
run ssh 0 SSH_CONNECTION="10.0.0.2 50000 10.0.0.3 22" -- --check
has ssh txt "SSH 로 실행 중"

echo
echo "== 3. 정상: 팀 1 · 기기 1 → 빌드 → 서명 확인 → 설치 → 실행 → 8초 뒤 떠 있음"
run full_x16 0 -- --yes
receipt full_x16 errors-masked.txt
has full_x16 receipt "exit=0"
has full_x16 receipt "build=ok"
has full_x16 receipt "install=ok"
has full_x16 receipt "running=yes (pid)"
has full_x16 receipt "assets=ok (python3"
has full_x16 receipt "rust=off (cargo/rustup 없음)"
has full_x16 receipt "tracked_files=unchanged"
has full_x16 receipt "flutter=3.47.5"
has full_x16 receipt "config=Release"
has full_x16 receipt "xcode=27.0"
has full_x16 receipt "macos=26.1"
has full_x16 receipt "ios=26.6"
has full_x16 receipt "device=iPhone 15"
has full_x16 fake.log "pub get --enforce-lockfile"
has full_x16 fake.log "build ios --release --config-only --no-codesign"
has full_x16 fake.log "DEVELOPMENT_TEAM=$TEAM CODE_SIGN_STYLE=Automatic"
has full_x16 fake.log "-destination generic/platform=iOS"
has full_x16 fake.log "-configuration Release"
has full_x16 fake.log "-allowProvisioningUpdates -allowProvisioningDeviceRegistration"
hasnt full_x16 fake.log "PRODUCT_BUNDLE_IDENTIFIER"
has full_x16 fake.log "--device $UDID --terminate-existing com.ffogtive.puff"
has full_x16 fake.log "codesign --verify --deep --strict"
has full_x16 fake.log "flutter[$W/sdk] assemble" # Xcode 의 Run Script 가 고정 Flutter 로 돈다(Generated.xcconfig FLUTTER_ROOT)
hasnt full_x16 fake.log "uninstall"
has full_x16 txt "기능 확인: 재윤님 확인 필요"
has full_x16 txt "기기: iPhone 15"
hasnt full_x16 txt "Tester" # 기기 이름(보통 실명)은 진행 줄에 안 찍는다
hasnt full_x16 txt "$W/home"
has full_x16 receipt "team_type=?"
[ ! -s "$OUT/full_x16.errors-masked.txt" ] && pass "full_x16: 성공이면 errors-masked.txt 없음" || fail "full_x16: errors-masked.txt 가 있음"
clean_tree full_x16
unlocked full_x16
[ "$(stat -c %a "$R/.local")" = 700 ] && pass "full_x16: .local 700 (embedded.mobileprovision 에 Team·UDID)" || fail "full_x16: .local 권한"
grep -qF "$TEAM" "$R/.local/iphone-deploy/Build/Products/Release-iphoneos/Runner.app/embedded.mobileprovision" &&
  pass "full_x16: (가짜) 프로파일에 Team 원문 — .local 밖으로 안 나감" || fail "full_x16: 가짜 프로파일 이상"
SHA_PY=$(sha256sum "$R/app/assets/www/index.html" | awk '{print $1}')

rm -f "$R/app/assets/www/index.html"
run full_node 0 "PATH=$W/nodebin:$PATH_BASE" -- --yes
receipt full_node
has full_node receipt "assets=ok (node v"
SHA_NODE=$(sha256sum "$R/app/assets/www/index.html" | awk '{print $1}')
if [ "$SHA_PY" = "$SHA_NODE" ]; then pass "에셋 node == python3 (sha256 ${SHA_NODE:0:16})"; else fail "에셋 node($SHA_NODE) != python3($SHA_PY)"; fi
mkdir -p "$W/ref/dist" "$W/ref/mockup/app" # 작업 트리의 입력으로 npm 경로(app-www.mjs)를 따로 돌려 비교 — 작업 트리는 건드리지 않는다
cp "$ROOT/dist/puff.html" "$W/ref/dist/"
cp "$ROOT/mockup/app/bridge.js" "$W/ref/mockup/app/"
SHA_REF=$(cd "$W/ref" && node "$ROOT/tools/app-www.mjs" >/dev/null 2>&1; sha256sum app/assets/www/index.html | awk '{print $1}')
if [ "$SHA_REF" = "$SHA_NODE" ]; then pass "에셋 = 작업 트리 npm 경로와 같음"; else fail "에셋이 작업 트리 결과($SHA_REF)와 다름"; fi
[ -n "${MAC_PYTHON:-}" ] && has full_x16 receipt "sha256 ${SHA_NODE:0:16}" # 맥 python 3.9 로 만든 것도 같은 바이트

run full_x27 0 FAKE_DEVICES=x27-one -- --yes
has full_x27 txt "기기: iPhone 16"
has full_x27 txt "iOS 27.0.1"
receipt full_x27 devices.tsv
has full_x27 devices.tsv "$NAME" # Xcode 27 꼴에서도 이름을 읽는다(고를 때 목록용)
hasnt full_x27 devices.tsv "Apple Watch" # 시계(watchOS)는 거른다
has full_x27 fake.log "--device $UDID "
run full_x27_flat 0 FAKE_DEVICES=x27-flat -- --yes
receipt full_x27_flat devices.tsv
has full_x27_flat devices.tsv "$NAME"
has full_x27_flat txt "개발자 모드=enabled"

echo
echo "== 4. 기기"
run nodevice 5 FAKE_DEVICES=empty -- --yes
has nodevice txt "페어링된 아이폰이 없다"
run unpaired 5 FAKE_DEVICES=x16-unpaired -- --yes
has unpaired txt "아직 페어링 안 된 기기"
has unpaired txt "Device Hub 에서 Pair"
run devmode 5 FAKE_DEVICES=x16-devmode-off -- --yes
has devmode txt "개발자 모드가 꺼져 있다"
hasnt devmode fake.log "xcodebuild -workspace"
run two_ambiguous 5 FAKE_DEVICES=x16-two -- --yes
has two_ambiguous txt "기기가 여럿이다"
has two_ambiguous txt "00******60"
run two_pick 0 FAKE_DEVICES=x16-two -- --yes --device "$UDID2"
has two_pick fake.log "--device $UDID2"
has two_pick txt "기기: iPhone 16 Pro"
run two_pick_eq 0 FAKE_DEVICES=x16-two -- --yes "--device=$UDID2"
has two_pick_eq fake.log "--device $UDID2"
run two_pick_name 0 FAKE_DEVICES=x16-two -- --yes --device "Second iPhone"
has two_pick_name fake.log "--device $UDID2"
run two_env 0 FAKE_DEVICES=x16-two "PUFF_DEVICE_ID=$CD2" -- --yes # CoreDevice 식별자로도 고른다
has two_env fake.log "--device $UDID2"
run device_unknown 6 -- --yes --device 00008999-000000000000BEEF
has device_unknown txt "devicectl 목록에 없다"
has device_unknown txt "케이블로 연결하고 잠금을 푼 뒤 다시"
run unavail 0 FAKE_DEVICES=x16-unavailable -- --yes
has unavail txt "닿지 않는 기기"
run unavail_gone 6 FAKE_DEVICES=x16-unavailable FAKE_INSTALL=gone -- --yes
has unavail_gone txt "케이블로 연결하고 잠금을 푼 뒤 다시"
has unavail_gone txt "시작할 때부터 devicectl 이 아이폰에 닿지 못했다"
run old_ios 0 FAKE_DEVICES=x16-old-ios -- --yes
has old_ios txt "iOS 16.7.10 < 17.0"

echo
echo "== 5. 개발 팀"
run teams_ambiguous 3 FAKE_TEAMS=two -- --yes
has teams_ambiguous txt "AB******45  Test Co, Inc. (유료/무료 모름)" # LibreSSL 꼴 subject 의 O= (쉼표 든 이름)
has teams_ambiguous txt "QW******90  Other Person (유료/무료 모름)"
run teams_ossl3 3 FAKE_TEAMS=two FAKE_OPENSSL=openssl3 -- --yes # Homebrew openssl@3 가 PATH 앞인 맥
has teams_ossl3 txt "AB******45  Test Co, Inc. (유료/무료 모름)"
has teams_ossl3 txt "QW******90  Other Person (유료/무료 모름)"
run teams_paidfree 0 FAKE_TEAMS=two FAKE_DEFAULTS=paid-free -- --yes
has teams_paidfree txt "Test Co, Inc. (유료)"
has teams_paidfree txt "(무료 Personal Team"
has teams_paidfree txt "유료 팀이 하나뿐"
has teams_paidfree fake.log "DEVELOPMENT_TEAM=$TEAM"
receipt teams_paidfree
has teams_paidfree receipt "team_type=paid"
run teams_twopaid 3 FAKE_DEFAULTS=two-paid -- --yes # 키체인엔 1개지만 Xcode 계정엔 유료 팀 2개 → 못 고름
has teams_twopaid txt "Other Co (유료)"
run teams_freeonly 0 FAKE_TEAMS=none FAKE_DEFAULTS=free-only -- --yes
has teams_freeonly txt "무료 Personal Team 이다: 7일마다"
receipt teams_freeonly
has teams_freeonly receipt "team_type=free"
run teams_noaccounts 0 FAKE_DEFAULTS=no-accounts -- --yes # Xcode 설정은 있는데 계정 없음 → 키체인 인증서로
has teams_noaccounts fake.log "DEVELOPMENT_TEAM=$TEAM"
mkdir -p "$W/home/.lane1"
printf 'LANE1_TEAM_ID=%s\n' "$TEAM2" >"$W/home/.lane1/deploy.env"
run teams_g3 0 FAKE_TEAMS=two -- --yes
has teams_g3 txt "G3 와 같은 팀"
has teams_g3 fake.log "DEVELOPMENT_TEAM=$TEAM2"
rm -rf "$W/home/.lane1"
run teams_check 0 FAKE_TEAMS=two -- --check
has teams_check txt "묻지도 저장하지도 않음"
[ ! -e "$W/home/.config/puff/iphone-deploy.env" ] && pass "teams_check: env 파일을 만들지 않음" || fail "teams_check: env 파일이 생김"
# 대화형(가짜 터미널): 번호로 고르면 저장 / 인증서가 없으면 Team ID 입력(정리 후 형식 검사 → 저장), 틀리면 저장 안 함
if command -v script >/dev/null 2>&1; then
  MODE=pty INPUT=1 run teams_pick 0 FAKE_TEAMS=two -- # 목록 1번 = Other Person(이름순)
  has teams_pick fake.log "DEVELOPMENT_TEAM=$TEAM2"
  grep -qx "TEAM_ID=$TEAM2" "$W/home/.config/puff/iphone-deploy.env" && pass "teams_pick: 고른 팀 저장" || fail "teams_pick: 저장 안 됨"
  [ "$(stat -c %a "$W/home/.config/puff/iphone-deploy.env")" = 600 ] && pass "teams_pick: env 파일 600" || fail "teams_pick: env 권한"
  rm -f "$W/home/.config/puff/iphone-deploy.env"
  MODE=pty INPUT="abcde 12345" run team_typed 0 FAKE_TEAMS=none --
  has team_typed fake.log "DEVELOPMENT_TEAM=$TEAM"
  grep -qx "TEAM_ID=$TEAM" "$W/home/.config/puff/iphone-deploy.env" && pass "team_typed: 대문자·공백 정리 후 저장" || fail "team_typed: 저장 안 됨"
  rm -f "$W/home/.config/puff/iphone-deploy.env"
  MODE=pty INPUT="me@example.com" run team_typed_bad 3 FAKE_TEAMS=none --
  has team_typed_bad txt "저장하지 않음"
  [ ! -e "$W/home/.config/puff/iphone-deploy.env" ] && pass "team_typed_bad: 틀린 값을 저장하지 않음" || fail "team_typed_bad: 저장됨"
  MODE=pty INPUT=2 run device_pick 0 FAKE_DEVICES=x16-two --
  has device_pick fake.log "--device $UDID2"
  MODE=pty INPUT="" run unavail_pty 0 FAKE_DEVICES=x16-unavailable -- # 닿지 않는 기기 → 연결하고 Enter → 계속
  has unavail_pty txt "잠금을 푼 뒤 Enter"
  has unavail_pty txt "설치 단계에서 다시 연결한다"
  # 첫 빌드 몇 분 사이 아이폰이 잠김 → 설치·실행이 '잠김'으로 실패 → 잠금을 풀고 Enter → 빌드 없이 한 번 더 (대화형만)
  rm -f "$W/state/once-"*
  MODE=pty INPUT="" run launch_locked_pty 0 FAKE_LAUNCH=locked_once --
  has launch_locked_pty txt "아이폰 잠금을 푼 뒤 Enter"
  receipt launch_locked_pty
  has launch_locked_pty receipt "running=yes (pid)"
  rm -f "$W/state/once-"*
  MODE=pty INPUT="" run install_locked_pty 0 FAKE_INSTALL=locked_once --
  has install_locked_pty txt "설치를 한 번 더 한다"
  receipt install_locked_pty
  has install_locked_pty receipt "install=ok (잠금 해제 후 다시)"
  [ "$(grep -c 'xcodebuild -workspace' "$OUT/install_locked_pty.fake.log")" = 1 ] && pass "install_locked_pty: 다시 빌드하지 않음" ||
    fail "install_locked_pty: xcodebuild 가 한 번이 아님"
  rm -f "$W/state/once-"*
  MODE=pty INPUT=0 run device_pick_zero 2 FAKE_DEVICES=x16-two -- # 0 → sed '0p' 오류(ERR 트랩)가 아니라 사용법 오류 2
  has device_pick_zero txt "번호가 아니다"
  mkdir -p "$W/home/.lane1"
  printf 'LANE1_TEAM_ID="%s"\n' "$TEAM2" >"$W/home/.lane1/deploy.env"
  MODE=pty INPUT="n
2" run teams_g3_no 0 FAKE_TEAMS=two -- # G3 팀을 쓸까요? n → 번호 2(Test Co) → 저장
  has teams_g3_no txt "G3(~/.lane1/deploy.env)와 같은 팀 QW******90 을 쓸까요?"
  has teams_g3_no fake.log "DEVELOPMENT_TEAM=$TEAM"
  grep -qx "TEAM_ID=$TEAM" "$W/home/.config/puff/iphone-deploy.env" && pass "teams_g3_no: 고른 팀 저장" || fail "teams_g3_no: 저장 안 됨"
  rm -rf "$W/home/.lane1" "$W/home/.config/puff/iphone-deploy.env"
else
  echo "  (script 없음 — 대화형 시험 건너뜀)"
fi
run team_none_yes 3 FAKE_TEAMS=none -- --yes
has team_none_yes txt "Team ID 없음"
run team_none_check 0 FAKE_TEAMS=none -- --check
has team_none_check txt "--check 는 묻지 않음"
run teams_env 0 FAKE_TEAMS=two "PUFF_TEAM_ID=$TEAM2" -- --yes
has teams_env fake.log "DEVELOPMENT_TEAM=$TEAM2"
run team_env_bad 3 "PUFF_TEAM_ID=abc" -- --yes
has team_env_bad txt "대문자·숫자 10자가 아니다"
mkdir -p "$W/home/.config/puff"
printf 'export TEAM_ID="%s"\r\n' "$TEAM2" >"$W/home/.config/puff/iphone-deploy.env" # export·따옴표·CRLF
chmod 644 "$W/home/.config/puff/iphone-deploy.env"
run teams_envfile 0 FAKE_TEAMS=two -- --yes
has teams_envfile txt "권한이 600 이 아니다"
has teams_envfile txt "~/.config/puff/iphone-deploy.env" # 맥 사용자 이름이 든 절대 경로 대신 ~
has teams_envfile fake.log "DEVELOPMENT_TEAM=$TEAM2"
[ "$(stat -c %a "$W/home/.config/puff/iphone-deploy.env")" = 600 ] && pass "env 파일 600 으로 고침" || fail "env 파일 권한 그대로"
rm -f "$W/home/.config/puff/iphone-deploy.env"

echo
echo "== 6. Flutter 3.47.5 확보"
run noflutter_check 0 FLUTTER= -- --check
has noflutter_check txt "Flutter 3.47.5 이 없다"
hasnt noflutter_check fake.log "git clone"
run flutter_clone 0 FLUTTER= FAKE_GIT_CLONE=good -- --yes
has flutter_clone txt "받음 → ~/.puff/flutter/3.47.5 (리비전 확인됨)"
has flutter_clone txt "첫 실행: Flutter 3.47.5 받기"
has flutter_clone fake.log "git clone --progress --depth 1 --branch 3.47.5"
has flutter_clone fake.log "flutter[$W/home/.puff/flutter/3.47.5] build ios"
has flutter_clone fake.log "flutter[$W/home/.puff/flutter/3.47.5] assemble"
receipt flutter_clone flutter-version.log
has flutter_clone flutter-version.log "Downloading Darwin arm64 Dart SDK"
run flutter_reuse 0 FLUTTER= -- --yes # 두 번째 실행: 받은 것을 그대로
hasnt flutter_reuse fake.log "git clone"
has flutter_reuse txt "✅ Flutter 3.47.5 (~/.puff/flutter/3.47.5)"
rm -rf "$W/home/.puff"
# PATH 에 다른 버전(3.44.2) flutter 만 있음 → 건너뛰고 받는다. 다른 버전은 한 번도 실행하지 않는다
run flutter_path_other 0 FLUTTER= FAKE_GIT_CLONE=good "PATH=$W/othersdk-bin:$PATH_BASE" -- --yes
has flutter_path_other txt "건너뜀: $W/othersdk (리비전 0b591f2c8278ab1c6ec0b72fc3a6cd8f1e2b1c09, 필요 3.47.5)"
hasnt flutter_path_other fake.log "flutter[$W/othersdk]"
has flutter_path_other fake.log "flutter[$W/home/.puff/flutter/3.47.5] assemble"
rm -rf "$W/home/.puff"
run flutter_path_other_check 0 FLUTTER= "PATH=$W/othersdk-bin:$PATH_BASE" -- --check
has flutter_path_other_check txt "Flutter 3.47.5 이 없다"
run flutter_clone_fail 3 FLUTTER= FAKE_GIT_CLONE=fail -- --yes
has flutter_clone_fail txt "Flutter 받기 실패"
has flutter_clone_fail txt "Could not resolve host"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5"* 2>/dev/null)" ] && pass "flutter_clone_fail: 반쯤 받은 폴더 없음" || fail "flutter_clone_fail: 폴더가 남음"
mkdir -p "$W/home/.puff/flutter/3.47.5.tmp.999999" # 예전 실행이 받다 끊긴 임시 폴더(그 pid 는 없음)
run flutter_badrev 3 FLUTTER= FAKE_GIT_CLONE=badrev -- --yes
has flutter_badrev txt "리비전이 다르다"
has flutter_badrev txt "받다 끊긴 임시 폴더 지움"
[ ! -e "$W/home/.puff/flutter/3.47.5" ] && pass "flutter_badrev: 설치 폴더를 만들지 않음" || fail "flutter_badrev: 잘못된 Flutter 가 설치됨"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5.tmp."* 2>/dev/null)" ] && pass "flutter_badrev: 임시 폴더 없음" || fail "flutter_badrev: 임시 폴더가 남음"
# Flutter 를 받는 중에 Ctrl-C → 130, 받던 임시 폴더를 지운다
MODE=int INT_AFTER="$W/clone.mark" run sigint_clone 130 FLUTTER= FAKE_GIT_CLONE=slow "FAKE_GIT_SLOW=$W/clone.mark" -- --yes
[ -e "$W/clone.mark" ] && pass "sigint_clone: clone 이 끝난 뒤 끊음" || fail "sigint_clone: clone 전에 끊김"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5"* 2>/dev/null)" ] && pass "sigint_clone: 받던 임시 폴더 지움" || fail "sigint_clone: 임시 폴더가 남음"
unlocked sigint_clone
# 진짜 git 으로 같은 명령줄(cd + 상대 이름, --branch 태그, -c 위치): 태그 3.47.5 를 단 로컬 저장소 → 받기는 되고 리비전이 달라 3
git init -q "$W/localflutter"
mkdir -p "$W/localflutter/bin"
cp "$FAKES/sdk/flutter" "$W/localflutter/bin/flutter"
git -C "$W/localflutter" add -A
git -C "$W/localflutter" -c user.name=t -c user.email=t@example.invalid commit -qm local
git -C "$W/localflutter" tag 3.47.5
run flutter_clone_realgit 3 FLUTTER= "PUFF_FLUTTER_GIT_URL=$W/localflutter" -- --yes
has flutter_clone_realgit txt "Cloning into '3.47.5.tmp."
has flutter_clone_realgit txt "리비전이 다르다"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5"* 2>/dev/null)" ] && pass "flutter_clone_realgit: 남은 폴더 없음" || fail "flutter_clone_realgit: 폴더가 남음"
run wrongflutter_env 3 "FLUTTER=$W/othersdk" FAKE_GIT_CLONE=badrev -- --yes
has wrongflutter_env txt "FLUTTER=$W/othersdk 는 리비전 0b591f2c8278ab1c6ec0b72fc3a6cd8f1e2b1c09"
hasnt wrongflutter_env fake.log "flutter[$W/othersdk]"
run flutter_report_other 3 FAKE_FLUTTER_REPORT=3.44.2 -- --yes # git 은 맞는데 도구가 다른 리비전을 보고
has flutter_report_other txt "리비전 '0b591f2c8278ab1c6ec0b72fc3a6cd8f1e2b1c09' 를 보고한다"
run flutter_notag 0 FAKE_FLUTTER_REPORT=notag -- --yes # 태그 없는 clone → 버전 0.0.0-unknown (리비전은 맞음)
has flutter_notag txt "버전 '0.0.0-unknown'"
run flutter_shallow 0 FAKE_FLUTTER_REPORT=shallow -- --yes # 얕은 clone 은 채널 [user-branch] — 경고 없음
hasnt flutter_shallow txt "버전 '"
run precache_fail 3 FAKE_PRECACHE=fail -- --yes
has precache_fail txt "flutter precache --ios 실패"
# env 파일의 FLUTTER=~/… 는 source 하지 않아도 펼친다 / SDK 가 아닌 경로는 말없이 넘기지 않는다
mkdir -p "$W/home/.config/puff"
ln -sfn "$W/sdk" "$W/home/sdklink"
printf 'FLUTTER=~/sdklink\n' >"$W/home/.config/puff/iphone-deploy.env"
chmod 600 "$W/home/.config/puff/iphone-deploy.env"
run flutter_tilde 0 FLUTTER= -- --check
has flutter_tilde txt "✅ Flutter 3.47.5 ("
hasnt flutter_tilde txt "Flutter 3.47.5 이 없다"
printf 'FLUTTER=$HOME/nope\n' >"$W/home/.config/puff/iphone-deploy.env"
run flutter_bad_env 0 FLUTTER= -- --check
has flutter_bad_env txt "FLUTTER=~/nope 는 Flutter SDK 폴더가 아니다"
rm -f "$W/home/.config/puff/iphone-deploy.env" "$W/home/sdklink"

echo
echo "== 7. 빌드 (xcodebuild · pub · SPM)"
run noprofile 0 FAKE_BUILD=noprofile_then_ok -- --yes
receipt noprofile
has noprofile receipt "build=ok (기기 지정 빌드)"
has noprofile fake.log "-destination id=$UDID"
has noprofile txt "id=<이 아이폰>"
run noprofile_always 4 FAKE_BUILD=noprofile -- --yes
has noprofile_always fake.log "-destination id=$UDID"
has noprofile_always txt "xcodebuild 실패"
run signfail 4 FAKE_BUILD=signfail -- --yes
has signfail txt "errSecInternalComponent"
has signfail txt "로그인된 Terminal"
hasnt signfail fake.log "-destination id=" # 서명 문제는 기기 지정 빌드로 다시 하지 않는다
# 실패 로그의 식별자: 화면·errors-masked.txt 에는 가려서, 안내는 receipt + errors-masked 만 보내라고
run noaccount 4 FAKE_BUILD=noaccount -- --yes
receipt noaccount errors-masked.txt
for f in txt errors-masked.txt; do
  hasnt noaccount "$f" "$TEAM"
  hasnt noaccount "$f" "$UDID"
  hasnt noaccount "$f" "$PERSONAL"
  hasnt noaccount "$f" "$EMAIL"
  hasnt noaccount "$f" "Tester"
  hasnt noaccount "$f" "$W/home"
done
has noaccount errors-masked.txt "No Account for Team \"AB******45\""
has noaccount errors-masked.txt "\"<기기 이름>\" (identifier 00******60)"
has noaccount txt "TEAM_ID= 줄을 지우고"
has noaccount txt "errors-masked.txt (식별자 가림)"
# Apple ID 세션 만료: 계정 안내로 가르고, 기기 지정(id=) 빌드로 헛되이 한 번 더 하지 않는다
run session_expired 4 FAKE_BUILD=session_expired -- --yes
has session_expired txt "만료됐으면 다시 로그인"
hasnt session_expired fake.log "-destination id="
run appid_taken 4 FAKE_BUILD=appid_taken -- --yes
has appid_taken txt "다른 팀에 이미 등록돼 있다"
run script_fail 4 FAKE_BUILD=script_fail -- --yes
has script_fail txt "Flutter 빌드 단계(xcode_backend.sh)에서 실패"
run compile_fail 4 FAKE_BUILD=compile_fail -- --yes
has compile_fail txt "xcodebuild 실패"
hasnt compile_fail txt "서명 준비가 안 됐다" # 'design in'·'sign in' 같은 글자로 계정 문제로 잘못 가르지 않는다
has compile_fail txt "git checkout -- app/ios/Runner.xcodeproj/project.pbxproj (커밋 금지)"
run wrongid 4 FAKE_BUILD=wrongid -- --yes
has wrongid txt "설치하지 않는다"
hasnt wrongid fake.log "device install"
run codesign_bad 4 FAKE_CODESIGN=bad -- --yes
has codesign_bad txt "codesign --verify --deep --strict 실패"
hasnt codesign_bad fake.log "device install"
run pub_lockfail 4 FAKE_PUB=lockfail -- --yes
has pub_lockfail txt "pubspec.lock 이 pubspec.yaml 과 안 맞으면"
clean_tree pub_lockfail
# 맥 전역 `flutter config --no-enable-swift-package-manager` 여도 pubspec 설정이 이긴다 → Podfile·추적 파일 변경 없음
run spm_global_off 0 FAKE_GLOBAL_SPM=off -- --yes
hasnt spm_global_off txt "Podfile 이 생겼다"
[ ! -e "$R/app/ios/Podfile" ] && pass "spm_global_off: Podfile 없음" || fail "spm_global_off: Podfile 이 생김"
clean_tree spm_global_off
# 음성 대조: pubspec 설정을 빼면(예전 상태) 같은 맥에서 Podfile + 추적 xcconfig 변경 → 경고와 복구 명령
grep -v -e 'enable-swift-package-manager: true' -e '^  config:$' "$R/app/pubspec.yaml" >"$W/pubspec.tmp" && cp "$W/pubspec.tmp" "$R/app/pubspec.yaml"
commit_r 'fake-mac: pubspec SPM 설정 뺌'
run spm_nopubspec 0 FAKE_GLOBAL_SPM=off -- --yes
has spm_nopubspec txt "enable-swift-package-manager: true' 가 없다"
has spm_nopubspec txt "app/ios/Podfile 이 생겼다"
has spm_nopubspec txt "이 실행이 git 추적 파일을 바꿨다"
has spm_nopubspec txt "app/ios/Flutter/Debug.xcconfig"
rm -f "$R/app/ios/Podfile"
git -C "$R" checkout -q -- app/ios/Flutter
git -C "$R" reset -q --hard HEAD~1
clean_tree spm_restore
run package_resolved 0 FAKE_PACKAGE_RESOLVED=1 -- --yes
has package_resolved txt "git 이 모르는 새 파일이 생겼다"
has package_resolved txt "app/ios/Runner.xcworkspace/xcshareddata/swiftpm/Package.resolved"
receipt package_resolved
has package_resolved receipt "tracked_files=unchanged (새 파일 1개)"
rm -rf "$R/app/ios/Runner.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$R/app/build/stale"
run clean 0 -- --yes --clean
[ ! -e "$R/app/build/stale" ] && pass "clean: app/build 지움" || fail "clean: app/build 가 남음"
has clean txt "clean: .local/iphone-deploy app/build"

echo
echo "== 8. 설치 · 실행"
run install_fail 6 FAKE_INSTALL=fail -- --yes
has install_fail txt "케이블로 연결하고 잠금을 푼 뒤 다시"
hasnt install_fail txt "설치를 한 번 더 한다" # --yes(묻지 않음)에서는 기다리지 않는다
receipt install_fail
has install_fail receipt "install=failed"
# 팀의 다른 기기로만 만든 프로파일: generic 빌드는 되고 설치만 실패 → id= 빌드(기기 등록) 후 다시 설치
run install_noprofile 0 FAKE_INSTALL=noprofile_generic -- --yes
receipt install_noprofile
has install_noprofile receipt "install=ok (기기 등록 후 다시)"
has install_noprofile receipt "build=ok (설치 실패 → 기기 지정 빌드)"
has install_noprofile fake.log "-destination id=$UDID"
run untrusted 7 FAKE_LAUNCH=untrusted -- --yes
has untrusted txt "VPN 및 기기 관리"
has untrusted txt "bash tools/mac/ios_run.sh --launch-only"
run launch_only 0 -- --launch-only # 아이폰에서 신뢰한 뒤
hasnt launch_only fake.log "xcodebuild -workspace"
hasnt launch_only fake.log "device install"
receipt launch_only
has launch_only receipt "running=yes (pid)"
run launch_only_untrusted 7 FAKE_LAUNCH=untrusted -- --launch-only
has launch_only_untrusted txt "VPN 및 기기 관리"
run launch_locked 7 FAKE_LAUNCH=locked -- --launch-only
has launch_locked txt "아이폰 잠금을 풀고"
hasnt launch_locked txt "한 번 더 실행한다" # 터미널이 아니면 기다리지 않는다
mv "$W/state/installed" "$W/state/installed.bak" 2>/dev/null || : >"$W/state/installed.bak"
run launch_only_missing 7 -- --launch-only # 아직 한 번도 설치하지 않은 아이폰
has launch_only_missing txt "설치돼 있지 않은 것 같다"
mv "$W/state/installed.bak" "$W/state/installed"
run notrunning 7 FAKE_RUNNING=no -- --yes
has notrunning txt "꺼졌다"
run procs_fail 7 FAKE_RUNNING=fail -- --yes
receipt procs_fail
has procs_fail receipt "running=unknown"
run nokeys 0 FAKE_RUNNING=nokeys -- --yes
receipt nokeys
has nokeys receipt "running=yes (name)"
has nokeys txt "이름(Runner.app)으로만 확인했다"
run other_runner 7 FAKE_RUNNING=other -- --yes
has other_runner txt "꺼졌다"
# Ctrl-C: 영수증에 exit=0 이 아니라 130, 잠금 풀림
MODE=int INT_AFTER="기다린 뒤" run sigint 130 PUFF_LAUNCH_WAIT=30 -- --yes
receipt sigint
has sigint receipt "exit=130"
has sigint txt "중단됨"
unlocked sigint

echo
echo "== 9. 잠금 · 추적 파일 지킴이"
mkdir -p "$R/.local/iphone-deploy.lock"
run locked 9 -- --yes
has locked txt "잠금을 대신 지우지 않는다"
[ -d "$R/.local/iphone-deploy.lock" ] && pass "locked: 남의 잠금을 지우지 않음" || fail "locked: 잠금이 사라짐"
rmdir "$R/.local/iphone-deploy.lock"
# 레포가 홈 아래면 복구 명령의 경로는 ~/… (맥 사용자 이름이 안 찍힘) — 그대로 붙여 넣어도 돈다
run pub_touch_home 0 FAKE_PUB_TOUCH=1 "HOME=$W" -- --yes
has pub_touch_home txt "cd ~/repo && git checkout -- app/ios/Flutter/Release.xcconfig"
fix=$(sed -n "s/.*되돌리기(이 실행이 만든 변경만): //p" "$OUT/pub_touch_home.txt" | head -n 1)
if [ -n "$fix" ] && paste_run "$fix" "$W" && [ -z "$(git -C "$R" status --porcelain)" ]; then pass "pub_touch_home: ~ 복구 명령이 통함 (${PASTE_SH:-bash})"; else fail "pub_touch_home: 복구 실패: $fix"; fi
rm -rf "$W/.config" "$W/.puff" # HOME=$W 로 돈 흔적
run pub_touch 0 FAKE_PUB_TOUCH=1 -- --yes
receipt pub_touch
has pub_touch txt "이 실행이 git 추적 파일을 바꿨다"
has pub_touch txt "git checkout -- app/ios/Flutter/Release.xcconfig"
has pub_touch receipt "tracked_files=CHANGED: app/ios/Flutter/Release.xcconfig"
# 찍힌 복구 명령을 그대로 실행 → 깨끗해져야 한다
fix=$(sed -n "s/.*되돌리기(이 실행이 만든 변경만): //p" "$OUT/pub_touch.txt" | head -n 1)
if [ -n "$fix" ] && paste_run "$fix" && [ -z "$(git -C "$R" status --porcelain)" ]; then pass "pub_touch: 복구 명령이 통함 (${PASTE_SH:-bash})"; else fail "pub_touch: 복구 명령 실패: $fix"; fi
# 실행 전부터 더러우면 앞에서 경고 (그 변경은 '이 실행이 바꿈'으로 세지 않는다)
echo "// 사용자 수정" >>"$R/app/ios/Flutter/Debug.xcconfig"
run predirty 0 -- --yes
has predirty txt "실행 전부터 바뀐 추적 파일"
hasnt predirty txt "이 실행이 git 추적 파일을 바꿨다"
git -C "$R" checkout -q -- app/ios/Flutter/Debug.xcconfig
# Xcode 화면에서 Team 을 고른 흔적(pbxproj 에 DEVELOPMENT_TEAM) → 공개 레포 경고
sed "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = $TEAM;/" "$R/app/ios/Runner.xcodeproj/project.pbxproj" >"$W/pbx.tmp"
cp "$W/pbx.tmp" "$R/app/ios/Runner.xcodeproj/project.pbxproj"
run pbxproj_team 0 -- --check
has pbxproj_team txt "Team ID 원문이 들어 있다(공개 레포): 커밋·푸시 금지"
git -C "$R" checkout -q -- app/ios/Runner.xcodeproj/project.pbxproj
clean_tree 추적파일
# 레포 경로에 공백·한글(~/내 프로젝트/G2 같은 곳): 빌드·설치가 되고, 찍힌 복구 명령(printf %q)을 그대로 실행해도 통한다
R_MAIN=$R
R="$W/내 프로젝트/G2"
mkdir -p "$W/내 프로젝트"
git clone -q "$R_MAIN" "$R"
run space_full 0 -- --yes
receipt space_full
has space_full receipt "install=ok"
has space_full fake.log "-workspace $R/app/ios/Runner.xcworkspace"
run space_touch 0 FAKE_PUB_TOUCH=1 -- --yes
fix=$(sed -n "s/.*되돌리기(이 실행이 만든 변경만): //p" "$OUT/space_touch.txt" | head -n 1)
if [ -n "$fix" ] && paste_run "$fix" && [ -z "$(git -C "$R" status --porcelain)" ]; then pass "space_touch: 공백·한글 경로 복구 명령이 통함 (${PASTE_SH:-bash})"; else fail "space_touch: 복구 실패: $fix"; fi
R=$R_MAIN

echo
echo "== 9c. 문서(docs/app/iphone-deploy.md)의 한 줄 명령을 그대로 ${PASTE_SH:+zsh }붙여 넣기 — GitHub 대신 로컬 bare 저장소(url.insteadOf)"
ONE=$(sed -n '/^## 맥에서 한 줄/,$p' "$ROOT/docs/app/iphone-deploy.md" | grep -m 1 '^cd ~ && ')
BR=$(printf '%s\n' "$ONE" | sed -n 's/.*git checkout \([^ ]*\) &&.*/\1/p')
URL=$(printf '%s\n' "$ONE" | sed -n 's/.*git clone \([^ ;]*\);.*/\1/p')
if [ -z "$ONE" ] || [ -z "$BR" ] || [ -z "$URL" ]; then
  fail "한 줄 명령을 문서에서 못 찾음"
else
  pass "문서의 한 줄: 브랜치 $BR · $URL"
  git clone -q --bare "$R" "$W/G2.git"
  git -C "$W/G2.git" update-ref "refs/heads/$BR" HEAD
  git -C "$W/G2.git" update-ref refs/heads/main "$(git -C "$R" rev-list --max-parents=0 HEAD | tail -n 1)"
  git -C "$W/G2.git" symbolic-ref HEAD refs/heads/main # 기본 브랜치는 다른 것 — 한 줄이 브랜치를 바꿔야 한다
  ZH="$W/zhome"
  mkdir -p "$ZH"
  git config --file "$ZH/.gitconfig" "url.$W/G2.git.insteadOf" "$URL"
  one() { # <이름> <기대 종료>: 한 줄을 그대로 실행 (가짜 맥 PATH, 새 홈)
    local rc=0 sh=(bash)
    [ -z "$PASTE_SH" ] || sh=("$PASTE_SH" -f)
    env -i HOME="$ZH" PATH="$PATH_BASE" LANG=C.UTF-8 TERM=xterm-256color NO_COLOR=1 PLISTBUDDY="$FAKES/PlistBuddy" \
      PUFF_LAUNCH_WAIT=0 FAKE_LOG="$LOG" FAKE_KIT="$T" FAKE_STATE="$W/state" FAKE_UDID="$UDID" FAKE_DEVICE_NAME="$NAME" \
      FLUTTER="$W/sdk" "${sh[@]}" -c "$ONE" </dev/null >"$OUT/$1.txt" 2>&1 || rc=$?
    NSCEN=$((NSCEN + 1))
    SCEN_LIST="$SCEN_LIST$1=$rc/$2 "
    if [ "$rc" = "$2" ]; then pass "$1: 종료 $rc"; else
      fail "$1: 종료 $rc (기대 $2)"
      tail -n 15 "$OUT/$1.txt" | sed 's/^/        /'
    fi
  }
  one oneliner_first 0
  has oneliner_first txt "Cloning into 'G2'"
  has oneliner_first txt "떠 있음  : yes (pid)"
  [ "$(git -C "$ZH/G2" rev-parse --abbrev-ref HEAD)" = "$BR" ] && pass "oneliner_first: 브랜치 $BR" || fail "oneliner_first: 브랜치가 다름"
  one oneliner_again 0 # 두 번째: 이미 있음 → fetch·checkout·pull 후 다시 (.local 이 pull 을 막지 않음)
  hasnt oneliner_again txt "Cloning into"
  # 원격에 새 커밋 → fast-forward
  git clone -q "$W/G2.git" "$W/upstream" && git -C "$W/upstream" checkout -q "$BR"
  echo "- 원격 갱신 시험" >>"$W/upstream/docs/app/ios-local.md"
  git -C "$W/upstream" -c user.name=up -c user.email=up@example.invalid commit -qam "원격: 새 커밋"
  git -C "$W/upstream" push -q origin "$BR"
  one oneliner_ff 0
  [ "$(git -C "$ZH/G2" rev-parse HEAD)" = "$(git -C "$W/upstream" rev-parse HEAD)" ] && pass "oneliner_ff: 새 커밋까지 받음" || fail "oneliner_ff: 갱신 안 됨"
  [ -z "$(git -C "$ZH/G2" status --porcelain)" ] && pass "oneliner_ff: ~/G2 깨끗" || fail "oneliner_ff: ~/G2 더러움"
  # 맥에서 같은 파일을 고친 상태 + 원격도 그 파일을 바꿈 → git 단계에서 멈춤(스크립트 전) → 문서의 복구(stash) → 다시 됨
  echo "// 맥에서 고침" >>"$ZH/G2/docs/app/ios-local.md"
  echo "- 원격 두 번째" >>"$W/upstream/docs/app/ios-local.md"
  git -C "$W/upstream" -c user.name=up -c user.email=up@example.invalid commit -qam "원격: 두 번째"
  git -C "$W/upstream" push -q origin "$BR"
  one oneliner_conflict 1
  has oneliner_conflict txt "would be overwritten by merge"
  hasnt oneliner_conflict txt "[ios_run]"
  fix=$(sed -n '/^## 맥에서 한 줄/,$p' "$ROOT/docs/app/iphone-deploy.md" | grep -m 1 '^cd ~/G2 && git stash -u')
  if [ -n "$fix" ] && paste_run "$fix" "$ZH" >/dev/null 2>&1; then pass "문서의 복구 줄: $fix"; else fail "문서의 복구 줄 실패: $fix"; fi
  one oneliner_after_stash 0
fi

echo
echo "== 10. Rust 물리(선택) — 진짜 build-ios.sh + 가짜 cargo/rustup/rustc/llvm-ar/nm/lipo"
rust_kit
run rust_on 0 -- --yes
receipt rust_on
has rust_on receipt "rust=on"
has rust_on receipt "build=ok"
has rust_on fake.log "cargo rustc --release --lib --target aarch64-apple-ios --crate-type staticlib"
has rust_on fake.log "fake: Rust 링크 켜짐 (link.xcconfig)"
hasnt rust_on fake.log "aarch64-apple-ios-sim" # --device-only
[ -f "$R/native/puff_sim/dist/ios/link.xcconfig" ] && pass "rust_on: link.xcconfig 생김(gitignore)" || fail "rust_on: link.xcconfig 없음"
clean_tree rust_on
run rust_link 0 FAKE_BUILD=rustlink -- --yes
receipt rust_link
has rust_link receipt "rust=off (Rust 링크 빌드 실패"
has rust_link receipt "build=ok (Rust 끄고 다시)"
has rust_link txt "링크를 끄고 한 번 더"
[ ! -e "$R/native/puff_sim/dist/ios/link.xcconfig" ] && pass "rust_link: 링크 설정 지움" || fail "rust_link: 링크 설정이 남음"
run rust_link_nofix 4 FAKE_BUILD=compile_fail -- --yes # Rust 를 꺼도 안 되면 원인은 Rust 가 아니라고
has rust_link_nofix txt "원인은 Rust 가 아니다"
run rust_fail 0 FAKE_RUST=fail -- --yes
receipt rust_fail
has rust_fail receipt "rust=off (빌드 실패"
[ ! -e "$R/native/puff_sim/dist/ios/link.xcconfig" ] && pass "rust_fail: 링크 설정 없음(--off)" || fail "rust_fail: 링크 설정이 남음"
run no_rust 0 -- --yes --no-rust
receipt no_rust
has no_rust receipt "rust=off (--no-rust)"
hasnt no_rust fake.log "cargo rustc"
rm -rf "$W/home/.cargo" "$W/home/.rustup"
clean_tree rust

# ---------------------------------------------------------------------------------------------------------------
echo
echo "== 11. 식별자 전수 검사 (화면 출력 $NSCEN 개 + 모든 실행의 receipt.txt·errors-masked.txt)"
# 화면: Team·UDID·CoreDevice ID·개인 ID·ECID·일련번호·이메일·홈 경로 원문 금지. 기기 이름·팀 이름은 '고를 때 목록'에만.
ids_bad=""
for f in "$OUT"/*.txt; do
  n=$(basename "$f" .txt)
  case "$n" in *.errors-masked) continue ;; esac
  for v in "$TEAM" "$TEAM2" "$UDID" "$UDID2" "$CD" "$CD2" "$PERSONAL" "$PERSONAL2" "$ECID" "$SERIAL" "$EMAIL" "$W/home/" "$W/zhome/"; do
    if grep -qF -- "$v" "$f"; then ids_bad="$ids_bad $n:$v"; fi
  done
  case "$n" in
    two_ambiguous | unpaired | device_unknown | device_pick | device_pick_zero) ;; # 기기 목록을 보여 주며 고르게 하는 화면
    *) grep -qF -- "$NAME" "$f" && ids_bad="$ids_bad $n:<기기 이름>" ;;
  esac
done
nrec=0
for f in "$R"/.local/deploy-runs/*/receipt.txt "$R"/.local/deploy-runs/*/errors-masked.txt \
  "$W"/zhome/G2/.local/deploy-runs/*/receipt.txt "$W"/zhome/G2/.local/deploy-runs/*/errors-masked.txt; do
  [ -f "$f" ] || continue
  nrec=$((nrec + 1))
  for v in "$TEAM" "$TEAM2" "$UDID" "$UDID2" "$CD" "$CD2" "$PERSONAL" "$PERSONAL2" "$ECID" "$SERIAL" "$EMAIL" "$W/home/" "$NAME" \
    "Test Co" "Other Person" "Test Person"; do
    if grep -qF -- "$v" "$f"; then ids_bad="$ids_bad ${f#"$R"/.local/deploy-runs/}:$v"; fi
  done
done
if [ -z "$ids_bad" ]; then pass "식별자 원문 0건 (화면 $NSCEN·영수증/가린 오류 $nrec 파일)"; else fail "식별자 원문:$ids_bad"; fi
# 반대로: 원문은 .local(700) 안의 원본 로그에만 있다(지어낸 검사가 아님을 확인)
grep -rlF "$TEAM" "$R/.local/deploy-runs" >/dev/null && pass "원문은 .local/deploy-runs 원본 로그에만 (build.log 등)" || fail "원본 로그에도 원문이 없다 — 검사가 헛돈다"
# 레포 안(.git·.local·시험 fixtures 제외) 어디에도 원문이 없다 — 빌드가 공개 레포 파일에 식별자를 쓰지 않음
leak=$(grep -rlF -e "$TEAM" -e "$TEAM2" -e "$UDID" -e "$UDID2" "$R" --exclude-dir=.git --exclude-dir=.local --exclude-dir=test 2>/dev/null || true)
[ -z "$leak" ] && pass "레포 파일(무시된 것 포함)에 식별자 없음" || fail "레포에 식별자: $leak"
[ "$(find "$R/.local" -maxdepth 0 -perm 700 | wc -l)" = 1 ] && pass ".local 권한 700" || fail ".local 권한이 700 이 아님"
# 통과한 시나리오에도 숨은 도구 오류(bash 3.2·BSD 도구·python 의 경고)가 섞이면 안 된다 — 화면 + 실행별 도구 로그
TOOL_ERR='^(awk|sed|grep|cut|comm|tr|sort|find|bash|python3?):|illegal (option|byte)|unbound variable|command not found|syntax error|Traceback|invalid option|bad substitution|integer expression'
terr=$(grep -lE "$TOOL_ERR" "$OUT"/*.txt "$R"/.local/deploy-runs/*/*.log 2>/dev/null | grep -v '/usage' || true)
[ -z "$terr" ] && pass "숨은 도구 오류 0건 (화면·도구 로그)" || fail "도구 오류 문구: $terr"
clean_tree 마지막

# ---------------------------------------------------------------------------------------------------------------
# 12) app-www.py == app-www.mjs (까다로운 입력): 대소문자 </SCRIPT, 'ſ'(U+017F, 파이썬 re.I 만 s 로 봄), BOM, CRLF,
#     이모지(UTF-16 길이), <body> 두 번, '$&' 치환 패턴 — 바이트가 같아야 한다 (python 은 MAC_PYTHON 이 있으면 그것)
echo
echo "== 12. app-www.py 와 app-www.mjs 바이트 비교 (까다로운 입력)"
PY=${MAC_PYTHON:-python3}
if command -v node >/dev/null 2>&1; then
  for case in a b; do
    for impl in node py; do
      d="$W/www-$case-$impl"
      mkdir -p "$d/mockup/app" "$d/dist"
      if [ "$case" = a ]; then
        printf '\xef\xbb\xbfconst a = "</script>"; const b = "</SCRIPT >"; const c = "</ſcript>"; // $& $1 $$\r\nwindow.PuffHaptic;\r\n' >"$d/mockup/app/bridge.js"
        printf '<!doctype html>\r\n<html><head></head><body>\r\n<p>딱지 🎯 $& $1</p><body>두 번째</body></html>\r\n' >"$d/dist/puff.html"
      else
        cp "$ROOT/mockup/app/bridge.js" "$d/mockup/app/bridge.js"
        printf '<html><BODY class="x">대문자 body 는 안 바뀜</BODY></html>' >"$d/dist/puff.html"
      fi
      if [ "$impl" = node ]; then (cd "$d" && node "$ROOT/tools/app-www.mjs" >/dev/null); else (cd "$d" && "$PY" -I "$ROOT/tools/app-www.py" >/dev/null); fi
    done
    a1=$(sha256sum "$W/www-$case-node/app/assets/www/index.html" | awk '{print $1}')
    a2=$(sha256sum "$W/www-$case-py/app/assets/www/index.html" | awk '{print $1}')
    if [ "$a1" = "$a2" ]; then pass "입력 $case: 같음 (${a1:0:16}, $("$PY" -c 'import sys; print("python", sys.version.split()[0])'))"; else fail "입력 $case: 다름 node=$a1 py=$a2"; fi
  done
  m1=$(cd "$W/www-a-node" && node "$ROOT/tools/app-www.mjs")
  m2=$(cd "$W/www-a-py" && "$PY" -I "$ROOT/tools/app-www.py")
  if [ "$m1" = "$m2" ]; then pass "크기 표시도 같음: $m1"; else fail "크기 표시 다름: '$m1' / '$m2'"; fi
else
  echo "  (node 없음 — 건너뜀)"
fi

# ---------------------------------------------------------------------------------------------------------------
if [ -n "${REAL_FLUTTER:-}" ]; then
  echo
  echo "== 13. 실제 Flutter 3.47.5 받기 경로 (원본: $REAL_FLUTTER)"
  # HOME 을 가짜로 바꾸므로 전역 git 설정(프록시 인증 방식 등)이 안 읽힌다 → 필요한 것만 환경으로 넘긴다.
  # 가짜 git 은 FAKE_GIT_CLONE 이 없으면 진짜 git 으로 넘긴다
  run real_flutter 4 FLUTTER= "PUFF_FLUTTER_GIT_URL=$REAL_FLUTTER" "PUB_CACHE=${PUB_CACHE:-$HOME/.pub-cache}" \
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.proxyAuthMethod "GIT_CONFIG_VALUE_0=$(git config --global http.proxyAuthMethod || echo anyauth)" -- --yes
  has real_flutter txt "받음 →"
  has real_flutter txt "리비전 확인됨"
  has real_flutter txt "Flutter 준비됨: 3.47.5"
  has real_flutter txt "flutter build ios --config-only 실패"
  receipt real_flutter
  clean_tree real_flutter
fi

echo
echo "시나리오 $NSCEN 개 (종료/기대): $SCEN_LIST" | fold -s -w 160
echo "결과: 통과 $PASS · 실패 $FAIL   (bash $("$RUN_BASH" -c 'echo ${BASH_VERSION%%(*}')${MACLAND:+ + MACLAND}${MAC_PYTHON:+ + python $("$MAC_PYTHON" -c 'import sys; print(sys.version.split()[0])')}; 출력: $OUT$([ "${KEEP:-0}" = 1 ] || echo ' — KEEP=1 이면 남김'))"
[ "$FAIL" = 0 ]

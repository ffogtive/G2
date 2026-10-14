#!/bin/bash
# shellcheck disable=SC2015,SC2016,SC2012,SC2088  # pass() 는 늘 0 이라 A && pass || fail 이 안전 · 가짜 스크립트 본문은 일부러 작은따옴표 · 실행 폴더는 ls -t 로 최신만 · 찾는 글자 "~/…" 는 펼치면 안 됨
# selftest.sh — 리눅스(컨테이너)에서 '가짜 맥'으로 tools/mac/ios_run.sh 흐름을 시험한다.
#   uname·xcodebuild·xcrun(devicectl)·security·codesign·PlistBuddy·flutter 를 흉내 내는 가짜 명령을 PATH 앞에 두고,
#   레포의 임시 clone(지금 작업 트리 반영)에서 시나리오마다 종료 코드·메시지·영수증·추적 파일을 확인한다.
#   진짜 Xcode 빌드·서명·아이폰 설치는 여기서 시험할 수 없다(미검증) — 흐름·분기·안전장치만 본다.
# 사용: bash tools/mac/selftest.sh                       (약 1분, 네트워크 없음)
#       SELFTEST_REAL_FLUTTER=<flutter git 원본> bash tools/mac/selftest.sh
#         + 실제 Flutter 3.47.5 얕은 clone → 리비전 확인 → flutter --version·precache·pub get(진짜) → build ios 는 리눅스라 실패(4)
#           예) SELFTEST_REAL_FLUTTER=https://github.com/flutter/flutter.git  (네트워크, 약 2~3분: clone + Dart SDK)
#       SELFTEST_BASH=<bash 3.2 실행 파일>  맥 기본 bash(3.2)로 ios_run.sh 를 돌린다(안쪽 `bash` 호출도 같은 것으로)
#       KEEP=1 이면 임시 폴더를 남긴다.
set -euo pipefail
unset CDPATH # export 된 CDPATH 면 `cd 상대경로` 가 경로를 두 번 찍는다
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
W=$(mktemp -d "${TMPDIR:-/tmp}/puff-selftest.XXXXXX")
if [ "${KEEP:-0}" = 1 ]; then echo "임시 폴더: $W"; else trap 'rm -rf "$W"' EXIT; fi
REV=6a19cca56475dbfba1478ee68d7bd0c2ef891da1
UDID=00008110-000A1B2C3D4E5F60 UDID2=00008120-000F9E8D7C6B5A40 TEAM=ABCDE12345 TEAM2=QWERT67890
PASS=0 FAIL=0
pass() { PASS=$((PASS + 1)); printf '  ✅ %s\n' "$*"; }
fail() { FAIL=$((FAIL + 1)); printf '  ❌ %s\n' "$*"; }

# ---------------------------------------------------------------------------------------------------------------
# 1) 레포 임시 clone + 지금 작업 트리의 바뀐/새 파일을 얹어 커밋(시작 상태 = 깨끗한 트리)
git clone -q "$ROOT" "$W/repo"
(cd "$ROOT" && git ls-files -m -o --exclude-standard -z) | while IFS= read -r -d '' f; do
  mkdir -p "$W/repo/$(dirname "$f")"
  cp -p "$ROOT/$f" "$W/repo/$f"
done
(cd "$ROOT" && git ls-files -d -z) | while IFS= read -r -d '' f; do rm -f "$W/repo/$f"; done
git -C "$W/repo" add -A
git -C "$W/repo" -c user.name=selftest -c user.email=selftest@example.invalid commit -qm 'selftest: 작업 트리' || true
R="$W/repo"

# ---------------------------------------------------------------------------------------------------------------
# 2) 가짜 맥 도구
mkdir -p "$W/bin" "$W/home" "$W/sdk/bin" "$W/nodebin"
LOG="$W/fake.log"
: >"$LOG"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/k1.pem" -out "$W/cert1.pem" -days 2 \
  -subj "/UID=ZZZZZZZZZZ/CN=Apple Development: Test Person (ZZZZZZZZZZ)/OU=$TEAM/O=Test/C=US" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/k2.pem" -out "$W/cert2.pem" -days 2 \
  -subj "/UID=YYYYYYYYYY/CN=Apple Development: Other Team (YYYYYYYYYY)/OU=$TEAM2/O=Other/C=US" >/dev/null 2>&1

cat >"$W/bin/uname" <<'EOF'
#!/bin/sh
# ios_run.sh 가 물을 때만 Darwin. 진짜 flutter(bin/flutter 의 uname)에는 리눅스 그대로(SELFTEST_REAL_FLUTTER 경로)
if tr '\0' ' ' </proc/$PPID/cmdline 2>/dev/null | grep -q 'tools/mac/ios_run.sh'; then
  case "${1:-}" in -m) echo arm64 ;; -r) echo 25.0.0 ;; *) echo Darwin ;; esac
else
  exec /usr/bin/uname "$@"
fi
EOF
cat >"$W/bin/xcode-select" <<'EOF'
#!/bin/sh
echo /Applications/Xcode.app/Contents/Developer
EOF
# Xcode 계정 팀 목록(defaults export 의 plist) — 유료 팀 + 무료 Personal Team (키 위치는 IDEProvisioningTeamByIdentifier 꼴)
cat >"$W/xcode-defaults.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>IDEProvisioningTeamByIdentifier</key><dict><key>0A1B2C3D-0000-4000-8000-000000000000</key><array>
<dict><key>isFreeProvisioningTeam</key><false/><key>teamID</key><string>$TEAM</string><key>teamName</key><string>Test Co</string><key>teamType</key><string>Company</string></dict>
<dict><key>isFreeProvisioningTeam</key><true/><key>teamID</key><string>$TEAM2</string><key>teamName</key><string>Other Person</string><key>teamType</key><string>Personal</string></dict>
</array></dict></dict></plist>
EOF
cat >"$W/bin/defaults" <<EOF
#!/bin/sh
if [ "\$1" = export ] && [ "\${FAKE_DEFAULTS:-}" = paidfree ]; then cat "$W/xcode-defaults.plist"; exit 0; fi
exit 1
EOF
# git: 그대로 넘기되, FAKE_GIT_SLOW=<표시 파일> 이면 clone 뒤 멈춰 있다(Ctrl-C 시험)
cat >"$W/bin/git" <<'EOF'
#!/bin/sh
/usr/bin/git "$@"
rc=$?
if [ "${1:-}" = clone ] && [ -n "${FAKE_GIT_SLOW:-}" ]; then echo cloned >"$FAKE_GIT_SLOW"; sleep 30; fi
exit $rc
EOF
cat >"$W/bin/codesign" <<'EOF'
#!/bin/sh
echo "codesign $*" >>"$FAKE_LOG"
[ "${FAKE_CODESIGN:-ok}" = ok ] || { echo "Runner.app: invalid signature"; exit 1; }
EOF
cat >"$W/bin/plistbuddy" <<'EOF'
#!/bin/sh
# PlistBuddy -c 'Print :CFBundleIdentifier' <Info.plist> — 가짜 Info.plist 는 'CFBundleIdentifier=<값>' 한 줄
sed -n 's/^CFBundleIdentifier=//p' "$3"
EOF
cat >"$W/bin/security" <<EOF
#!/bin/sh
case "\$1" in
  find-identity)
    [ "\${FAKE_TEAMS:-one}" = none ] && { echo '     0 valid identities found'; exit 0; }
    echo '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Apple Development: Test Person (ZZZZZZZZZZ)"'
    [ "\${FAKE_TEAMS:-one}" = two ] && echo '  2) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Apple Development: Other Team (YYYYYYYYYY)"'
    echo '     N valid identities found' ;;
  find-certificate)
    case "\$3" in *Other*) cat "$W/cert2.pem" ;; *) cat "$W/cert1.pem" ;; esac ;;
esac
EOF
cat >"$W/bin/xcodebuild" <<'EOF'
#!/bin/bash
echo "xcodebuild $*" >>"$FAKE_LOG"
case "${1:-}" in
  -version) printf 'Xcode 27.0\nBuild version 27A5218a\n'; exit 0 ;;
  -checkFirstLaunchStatus) exit 0 ;;
esac
dd="" cfg="" dest="" team=""
while [ $# -gt 0 ]; do
  case "$1" in
    -derivedDataPath) dd=$2; shift ;;
    -configuration) cfg=$2; shift ;;
    -destination) dest=$2; shift ;;
    DEVELOPMENT_TEAM=*) team=${1#DEVELOPMENT_TEAM=} ;;
  esac
  shift
done
echo "$dest" >"$FAKE_LOG.dest" # 가짜 설치가 '어떤 빌드였나'를 본다
gen="$FAKE_REPO/app/ios/Flutter/Generated.xcconfig"
[ -f "$gen" ] || { echo "error: Generated.xcconfig 없음 (flutter build ios --config-only 먼저)"; exit 65; }
case "${FAKE_BUILD:-ok}" in
  noprofile_then_ok)
    case "$dest" in generic/*) echo "error: No profiles for 'com.ffogtive.puff' were found"; exit 65 ;; esac ;;
  signfail) echo "error: errSecInternalComponent"; echo "** BUILD FAILED **"; exit 65 ;;
  noaccount) # 실제 xcodebuild 처럼 식별자가 원문으로 든 오류 줄들
    echo "Build settings from command line:"
    echo "    DEVELOPMENT_TEAM = $team"
    echo "error: No Account for Team \"$team\". Add a new account in Accounts settings."
    echo "    Signing Identity:     \"Apple Development: Test Person (ZZZZZZZZZZ)\""
    echo "error: Provisioning profile doesn't include the currently selected device \"Test iPhone\" (identifier $FAKE_UDID)."
    echo "error: account tester@example.com at $HOME/Library/Developer"
    echo "** BUILD FAILED **"; exit 65 ;;
  rustlink) # Rust 링크 설정이 있으면 링크 실패(맥 미검증 경로 흉내)
    if [ -f "$FAKE_REPO/native/puff_sim/dist/ios/link.xcconfig" ]; then
      echo "ld: warning: object file (libpuff_sim.a) was built for newer iOS version"
      echo "clang: error: linker command failed with exit code 1 (use -v to see invocation)"
      echo "** BUILD FAILED **"; exit 65
    fi ;;
esac
app="$dd/Build/Products/$cfg-iphoneos/Runner.app"
mkdir -p "$app"
if [ "${FAKE_BUILD:-ok}" = wrongid ]; then id=com.example.other; else id=com.ffogtive.puff; fi
echo "CFBundleIdentifier=$id" >"$app/Info.plist"
echo "** BUILD SUCCEEDED **"
EOF
cat >"$W/bin/xcrun" <<'EOF'
#!/bin/bash
echo "xcrun $*" >>"$FAKE_LOG"
out=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do [ "${args[$i]}" = --json-output ] && out=${args[$((i + 1))]}; done
case "$*" in
  "--sdk iphoneos --show-sdk-path") echo /fake/iPhoneOS.sdk; exit 0 ;;
  "--find devicectl") echo /fake/devicectl; exit 0 ;;
  "devicectl list devices"*)
    dev() { # <udid> <name> <devmode> <pairing> [tunnel]
      printf '{"identifier":"CD-%s","hardwareProperties":{"platform":"iOS","reality":"physical","udid":"%s","deviceType":"iPhone","marketingName":"iPhone 15"},"deviceProperties":{"name":"%s","developerModeStatus":"%s","osVersionNumber":"27.0"},"connectionProperties":{"pairingState":"%s","transportType":"wired","tunnelState":"%s"}}' "$1" "$1" "$2" "$3" "$4" "${5:-connected}"
    }
    dev5() { # Xcode 27 (JSON v5) 모양: properties 아래로
      printf '{"identifier":"CD-%s","properties":{"hardware":{"platform":"iOS","reality":"physical","udid":"%s","deviceType":"iPhone","marketingName":"iPhone 16"},"device":{"name":"%s","developerModeStatus":"%s","osVersionNumber":"27.1"},"connection":{"pairingState":"%s","transportType":"wired","tunnelState":"connected"}}}' "$1" "$1" "$2" "$3" "$4"
    }
    case "${FAKE_DEVICES:-one}" in
      one) list=$(dev "$FAKE_UDID" "Test iPhone" enabled paired) ;;
      unavail) list=$(dev "$FAKE_UDID" "Test iPhone" enabled paired unavailable) ;;
      v5) list=$(dev5 "$FAKE_UDID" "Test iPhone" enabled paired) ;;
      devmode_off) list=$(dev "$FAKE_UDID" "Test iPhone" disabled paired) ;;
      none) list=$(dev "$FAKE_UDID" "Test iPhone" enabled unpaired) ;;
      two) list="$(dev "$FAKE_UDID" "Test iPhone" enabled paired),$(dev "$FAKE_UDID2" "Second iPhone" enabled paired)" ;;
    esac
    printf '{"info":{"outcome":"success"},"result":{"devices":[%s]}}\n' "$list" >"$out"
    exit 0 ;;
  "devicectl device install app"*)
    case "${FAKE_INSTALL:-ok}" in
      ok) ;;
      noprofile_generic) # 팀의 다른 기기로만 만든 프로파일(generic 빌드) → 이 아이폰엔 설치 실패, id= 빌드면 성공
        case "$(cat "$FAKE_LOG.dest" 2>/dev/null)" in generic/*)
          echo "ERROR: Failed to install the app on the device. (0xe8008015) A valid provisioning profile for this executable was not found."; exit 1 ;;
        esac ;;
      gone) echo "ERROR: Unable to connect to the device. The device may be disconnected."; exit 1 ;;
      *) echo "ERROR: The device is locked (0xe800000b)"; exit 1 ;;
    esac
    printf '{"result":{"installedApplications":[{"bundleID":"com.ffogtive.puff","installationURL":"file:///private/var/containers/Bundle/Application/AAAA/Runner.app/"}]}}\n' >"$out"
    exit 0 ;;
  "devicectl device process launch"*)
    [ "${FAKE_LAUNCH:-ok}" = ok ] || { echo "ERROR: The application could not be launched because it has an invalid code signature, inadequate entitlements or its profile has not been explicitly trusted by the user."; exit 1; }
    printf '{"result":{"process":{"executable":"file:///private/var/containers/Bundle/Application/AAAA/Runner.app/Runner","processIdentifier":4242}}}\n' >"$out"
    exit 0 ;;
  "devicectl device info processes"*)
    sb='{"executable":"file:///System/Library/CoreServices/SpringBoard.app/SpringBoard","processIdentifier":34}'
    case "${FAKE_RUNNING:-yes}" in
      yes) p="$sb,{\"executable\":\"file:///private/var/containers/Bundle/Application/AAAA/Runner.app/Runner\",\"processIdentifier\":4242}" ;;
      no) p="$sb" ;;
      other) p="$sb,{\"executable\":\"file:///private/var/containers/Bundle/Application/BBBB/Runner.app/Runner\",\"processIdentifier\":777}" ;;
      fail) echo "ERROR: tunnel not available"; exit 1 ;;
      nokeys) # 키 이름이 다른 JSON(가상의 다음 Xcode) → 글자 검색으로 물러남
        printf '{"result":{"procs":[{"path":"/private/var/containers/Bundle/Application/AAAA/Runner.app/Runner"}]}}\n' >"$out"
        exit 0 ;;
    esac
    printf '{"result":{"runningProcesses":[%s]}}\n' "$p" >"$out"
    exit 0 ;;
esac
echo "fake xcrun: 모르는 호출 $*" >&2
exit 1
EOF
# 가짜 Flutter SDK: bin/flutter + .git/HEAD = 고정 리비전(ios_run.sh 는 `git rev-parse HEAD` 로 판정)
git init -q "$W/sdk"
echo "$REV" >"$W/sdk/.git/HEAD"
cat >"$W/sdk/bin/flutter" <<'EOF'
#!/bin/bash
echo "flutter $* (cwd=$PWD)" >>"$FAKE_LOG"
root=$(cd "$(dirname "$0")/.." && pwd -P)
case "$*" in
  "--version --machine")
    printf '{\n  "frameworkVersion": "3.47.5",\n  "channel": "[user-branch]",\n  "frameworkRevision": "%s",\n  "flutterRoot": "%s"\n}\n' "$FAKE_REV" "$root" ;;
  "precache --ios") echo "Already up-to-date." ;;
  "pub get --enforce-lockfile")
    [ -f pubspec.lock ] || { echo "pubspec.lock 없음"; exit 1; }
    # SPM 이 꺼진 맥 흉내: CocoaPods 가 추적 파일 Release.xcconfig 에 include 를 넣는다
    [ "${FAKE_PUB_TOUCH:-0}" = 1 ] && printf '#include? "Pods/Target Support Files/Pods-Runner/Pods-Runner.release.xcconfig"\n' >>ios/Flutter/Release.xcconfig
    echo "Got dependencies!" ;;
  "build ios --release --config-only --no-codesign")
    printf '// generated\nFLUTTER_ROOT=%s\nFLUTTER_APPLICATION_PATH=%s\n' "$root" "$PWD" >ios/Flutter/Generated.xcconfig ;;
  *) echo "fake flutter: 모르는 호출 $*" >&2; exit 64 ;;
esac
EOF
ln -s "$(command -v node)" "$W/nodebin/node"
if [ -n "${SELFTEST_BASH:-}" ]; then # 스크립트 안의 `bash …`(build-ios.sh 등)도 같은 bash 로
  printf '#!/bin/sh\nexec %s "$@"\n' "$SELFTEST_BASH" >"$W/bin/bash"
  echo "bash: $("$SELFTEST_BASH" -c 'echo $BASH_VERSION')"
fi
chmod +x "$W/bin/"* "$W/sdk/bin/flutter"

# ---------------------------------------------------------------------------------------------------------------
# 3) 시나리오 실행기
OUT="$W/out"
mkdir -p "$OUT"
# run <이름> <기대 종료 코드> [VAR=값 ...] -- [ios_run.sh 인자 ...]
#   MODE=rel  레포 폴더에서 상대 경로(bash tools/mac/ios_run.sh — 한 줄 명령과 같은 꼴)로 부른다
#   MODE=pty  가짜 터미널(script)로 부르고 INPUT 을 키보드 입력으로 준다(대화형 묻기 시험)
#   MODE=int  INT_AFTER(파일 또는 출력 글자)가 보이면 프로세스 그룹에 SIGINT(Ctrl-C)를 보낸다
run() {
  local name=$1 want=$2 rc=0
  shift 2
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : >"$LOG"
  local pass_env=() v
  for v in HTTPS_PROXY HTTP_PROXY NO_PROXY https_proxy http_proxy no_proxy SSL_CERT_FILE CURL_CA_BUNDLE \
    GIT_SSL_CAINFO NODE_EXTRA_CA_CERTS REQUESTS_CA_BUNDLE; do # 네트워크 쓰는 진짜 Flutter 경로용(가짜 시나리오는 안 씀)
    [ -z "${!v:-}" ] || pass_env+=("$v=${!v}")
  done
  local cmd=(env -i ${pass_env[@]+"${pass_env[@]}"} HOME="$W/home" PATH="$W/bin:/usr/bin:/bin" LANG=C.UTF-8 NO_COLOR=1 TERM=dumb
    PLISTBUDDY="$W/bin/plistbuddy" PUFF_LAUNCH_WAIT=0 FAKE_LOG="$LOG" FAKE_REPO="$R" FAKE_REV="$REV"
    FAKE_UDID="$UDID" FAKE_UDID2="$UDID2" FLUTTER="$W/sdk" ${envs[@]+"${envs[@]}"} "${SELFTEST_BASH:-bash}")
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
  if [ "$rc" = "$want" ]; then pass "$name: 종료 $rc"; else
    fail "$name: 종료 $rc (기대 $want)"
    tail -n 15 "$OUT/$name.txt" | sed 's/^/        /'
  fi
}
has() { if grep -qF -- "$3" "$OUT/$1.$2"; then pass "$1: '$3'"; else fail "$1: '$3' 없음 ($2)"; fi; }
hasnt() { if grep -qF -- "$3" "$OUT/$1.$2"; then fail "$1: '$3' 이 있으면 안 됨 ($2)"; else pass "$1: '$3' 없음"; fi; }
receipt() { # 가장 최근 실행의 receipt.txt (+ 둘째 인자: 그 실행 폴더의 다른 파일 → $OUT/<이름>.<파일>)
  local d
  d=$(ls -td "$R/.local/deploy-runs"/*/ 2>/dev/null | head -n 1)
  cp "${d}receipt.txt" "$OUT/$1.receipt" 2>/dev/null || : >"$OUT/$1.receipt"
  [ -z "${2:-}" ] || cp "${d}$2" "$OUT/$1.$2" 2>/dev/null || : >"$OUT/$1.$2"
}
clean_tree() { # 추적 파일이 그대로인가(.local/·app/assets/www 등은 gitignore)
  local s
  s=$(git -C "$R" status --porcelain)
  if [ -z "$s" ]; then pass "$1: git status 깨끗"; else fail "$1: git status 더러움: $s"; fi
}

echo "== 가짜 맥 시나리오 (레포 사본: $R)"
# 리눅스 그대로(가짜 uname 없음) → 맥 전용 안내 + 3
env -i HOME="$W/home" PATH=/usr/bin:/bin LANG=C.UTF-8 NO_COLOR=1 "${SELFTEST_BASH:-bash}" "$R/tools/mac/ios_run.sh" >"$OUT/linux.txt" 2>&1 && rc=0 || rc=$?
if [ "$rc" = 3 ]; then pass "linux: 종료 3"; else fail "linux: 종료 $rc (기대 3)"; fi
has linux txt "맥에서만"
run help 0 -- --help
has help txt "사용: bash tools/mac/ios_run.sh"
run usage 2 -- --bogus

run check 0 -- --check
has check txt "사전 점검 통과"
hasnt check fake.log "xcodebuild -workspace"
hasnt check fake.log "pub get"
[ ! -e "$R/app/assets/www/index.html" ] && pass "check: 에셋을 만들지 않음" || fail "check: 에셋이 생김"
has check txt "AB******45"
hasnt check txt "$TEAM"
hasnt check txt "$UDID"
has check txt "빌드·설치·저장은 하지 않았다"
# 한 줄 명령처럼 레포 폴더에서 상대 경로로 + export 된 CDPATH (예전엔 SCRIPT_DIR 이 두 줄 → common.sh 못 찾음)
MODE=rel run cdpath 0 "CDPATH=.:$W" -- --check
has cdpath txt "사전 점검 통과"

run full_py 0 -- --yes
receipt full_py
has full_py receipt "build=ok"
has full_py receipt "install=ok"
has full_py receipt "running=yes (pid)"
has full_py receipt "assets=ok (python3"
has full_py receipt "rust=off (cargo/rustup 없음)"
has full_py receipt "tracked_files=unchanged"
has full_py receipt "flutter=3.47.5"
hasnt full_py receipt "$UDID"
hasnt full_py receipt "$TEAM"
hasnt full_py txt "$UDID"
hasnt full_py txt "$TEAM"
has full_py fake.log "pub get --enforce-lockfile"
has full_py fake.log "build ios --release --config-only --no-codesign"
has full_py fake.log "DEVELOPMENT_TEAM=$TEAM"
has full_py fake.log "-destination generic/platform=iOS"
has full_py fake.log "-configuration Release"
has full_py fake.log "-allowProvisioningUpdates -allowProvisioningDeviceRegistration"
hasnt full_py fake.log "PRODUCT_BUNDLE_IDENTIFIER"
has full_py fake.log "--terminate-existing com.ffogtive.puff"
hasnt full_py fake.log "uninstall"
has full_py txt "기능 확인: 재윤님 확인 필요"
has full_py txt "기기: iPhone 15"
hasnt full_py txt "Test iPhone" # 기기 이름(보통 실명)은 진행 줄에 안 찍는다
hasnt full_py txt "$W/home"
has full_py receipt "team_type=?"
clean_tree full_py
[ ! -d "$R/.local/iphone-deploy.lock" ] && pass "full_py: 잠금 풀림" || fail "full_py: 잠금이 남음"
SHA_PY=$(sha256sum "$R/app/assets/www/index.html" | awk '{print $1}')

rm -f "$R/app/assets/www/index.html"
run full_node 0 "PATH=$W/bin:$W/nodebin:/usr/bin:/bin" -- --yes
receipt full_node
has full_node receipt "assets=ok (node v"
SHA_NODE=$(sha256sum "$R/app/assets/www/index.html" | awk '{print $1}')
if [ "$SHA_PY" = "$SHA_NODE" ]; then pass "에셋 node == python3 (sha256 ${SHA_NODE:0:16})"; else fail "에셋 node($SHA_NODE) != python3($SHA_PY)"; fi
mkdir -p "$W/ref/dist" "$W/ref/mockup/app" # 작업 트리의 입력으로 npm 경로(app-www.mjs)를 따로 돌려 비교 — 작업 트리는 건드리지 않는다
cp "$ROOT/dist/puff.html" "$W/ref/dist/"
cp "$ROOT/mockup/app/bridge.js" "$W/ref/mockup/app/"
SHA_REF=$(cd "$W/ref" && node "$ROOT/tools/app-www.mjs" >/dev/null 2>&1; sha256sum app/assets/www/index.html | awk '{print $1}')
if [ "$SHA_REF" = "$SHA_NODE" ]; then pass "에셋 = 작업 트리 npm 경로와 같음"; else fail "에셋이 작업 트리 결과($SHA_REF)와 다름"; fi

run v5 0 FAKE_DEVICES=v5 -- --yes
has v5 txt "iPhone 16"
receipt v5 devices.tsv
has v5 devices.tsv "Test iPhone" # v5 모양에서도 이름을 읽는다(고를 때 목록용)
run launch_only 0 -- --launch-only
hasnt launch_only fake.log "xcodebuild -workspace"
run devmode 5 FAKE_DEVICES=devmode_off -- --yes
has devmode txt "개발자 모드가 꺼져 있다"
run nodevice 5 FAKE_DEVICES=none -- --yes
has nodevice txt "페어링된 아이폰이 없다"
run two_ambiguous 5 FAKE_DEVICES=two -- --yes
run two_pick 0 FAKE_DEVICES=two -- --yes --device "$UDID2"
has two_pick fake.log "--device $UDID2"
run teams_ambiguous 3 FAKE_TEAMS=two -- --yes
has teams_ambiguous txt "AB******45  Test (유료/무료 모름)" # 가린 ID + 인증서 O= 팀 이름
has teams_ambiguous txt "QW******90  Other"
hasnt teams_ambiguous txt "$TEAM"
run teams_paidfree 0 FAKE_TEAMS=two FAKE_DEFAULTS=paidfree -- --yes
has teams_paidfree txt "Test Co (유료)"
has teams_paidfree txt "Other Person (무료 Personal Team"
has teams_paidfree txt "유료 팀이 하나뿐"
has teams_paidfree fake.log "DEVELOPMENT_TEAM=$TEAM"
receipt teams_paidfree
has teams_paidfree receipt "team_type=paid"
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
  MODE=pty INPUT=1 run teams_pick 0 FAKE_TEAMS=two --
  has teams_pick fake.log "DEVELOPMENT_TEAM=$TEAM2"
  grep -qx "TEAM_ID=$TEAM2" "$W/home/.config/puff/iphone-deploy.env" && pass "teams_pick: 고른 팀 저장" || fail "teams_pick: 저장 안 됨"
  rm -f "$W/home/.config/puff/iphone-deploy.env"
  MODE=pty INPUT="abcde 12345" run team_typed 0 FAKE_TEAMS=none --
  has team_typed fake.log "DEVELOPMENT_TEAM=$TEAM"
  grep -qx "TEAM_ID=$TEAM" "$W/home/.config/puff/iphone-deploy.env" && pass "team_typed: 대문자·공백 정리 후 저장" || fail "team_typed: 저장 안 됨"
  rm -f "$W/home/.config/puff/iphone-deploy.env"
  MODE=pty INPUT="me@example.com" run team_typed_bad 3 FAKE_TEAMS=none --
  has team_typed_bad txt "저장하지 않음"
  [ ! -e "$W/home/.config/puff/iphone-deploy.env" ] && pass "team_typed_bad: 틀린 값을 저장하지 않음" || fail "team_typed_bad: 저장됨"
else
  echo "  (script 없음 — 대화형 시험 건너뜀)"
fi
run team_none_check 0 FAKE_TEAMS=none -- --check
has team_none_check txt "--check 는 묻지 않음"
run teams_env 0 FAKE_TEAMS=two "PUFF_TEAM_ID=$TEAM2" -- --yes
has teams_env fake.log "DEVELOPMENT_TEAM=$TEAM2"
mkdir -p "$W/home/.config/puff"
printf 'TEAM_ID="%s"\n' "$TEAM2" >"$W/home/.config/puff/iphone-deploy.env"
chmod 644 "$W/home/.config/puff/iphone-deploy.env"
run teams_envfile 0 FAKE_TEAMS=two -- --yes
has teams_envfile txt "권한이 600 이 아니다"
has teams_envfile txt "~/.config/puff/iphone-deploy.env" # 맥 사용자 이름이 든 절대 경로 대신 ~
has teams_envfile fake.log "DEVELOPMENT_TEAM=$TEAM2"
[ "$(stat -c %a "$W/home/.config/puff/iphone-deploy.env")" = 600 ] && pass "env 파일 600 으로 고침" || fail "env 파일 권한 그대로"
rm -f "$W/home/.config/puff/iphone-deploy.env"

run noprofile 0 FAKE_BUILD=noprofile_then_ok -- --yes
receipt noprofile
has noprofile receipt "build=ok (기기 지정 빌드)"
has noprofile fake.log "-destination id=$UDID"
run signfail 4 FAKE_BUILD=signfail -- --yes
has signfail txt "errSecInternalComponent"
# 실패 로그의 식별자: 화면·errors-masked.txt 에는 가려서, 안내는 receipt + errors-masked 만 보내라고
run noaccount 4 FAKE_BUILD=noaccount -- --yes
receipt noaccount errors-masked.txt
for f in txt errors-masked.txt; do
  hasnt noaccount "$f" "$TEAM"
  hasnt noaccount "$f" "$UDID"
  hasnt noaccount "$f" "ZZZZZZZZZZ"
  hasnt noaccount "$f" "tester@example.com"
  hasnt noaccount "$f" "Test iPhone"
  hasnt noaccount "$f" "$W/home"
done
has noaccount errors-masked.txt "No Account for Team \"AB******45\""
has noaccount txt "TEAM_ID= 줄을 지우고"
has noaccount txt "errors-masked.txt (식별자 가림)"
# 팀의 다른 기기로만 만든 프로파일: generic 빌드는 되고 설치만 실패 → id= 빌드(기기 등록) 후 다시 설치
run install_noprofile 0 FAKE_INSTALL=noprofile_generic -- --yes
receipt install_noprofile
has install_noprofile receipt "install=ok (기기 등록 후 다시)"
has install_noprofile receipt "build=ok (설치 실패 → 기기 지정 빌드)"
has install_noprofile fake.log "-destination id=$UDID"
run unavail 0 FAKE_DEVICES=unavail -- --yes
has unavail txt "닿지 않는 기기"
run unavail_gone 6 FAKE_DEVICES=unavail FAKE_INSTALL=gone -- --yes
has unavail_gone txt "케이블로 연결하고 잠금을 푼 뒤 다시"
has unavail_gone txt "시작할 때부터 devicectl 이 아이폰에 닿지 못했다"
# Ctrl-C: 영수증에 exit=0 이 아니라 130, 잠금 풀림
MODE=int INT_AFTER="기다린 뒤" run sigint 130 PUFF_LAUNCH_WAIT=30 -- --yes
receipt sigint
has sigint receipt "exit=130"
has sigint txt "중단됨"
[ ! -d "$R/.local/iphone-deploy.lock" ] && pass "sigint: 잠금 풀림" || fail "sigint: 잠금이 남음"
run wrongid 4 FAKE_BUILD=wrongid -- --yes
has wrongid txt "설치하지 않는다"
hasnt wrongid fake.log "device install"
run codesign_bad 4 FAKE_CODESIGN=bad -- --yes
run install_fail 6 FAKE_INSTALL=fail -- --yes
has install_fail txt "잠금을 풀고"
run untrusted 7 FAKE_LAUNCH=untrusted -- --yes
has untrusted txt "VPN 및 기기 관리"
run notrunning 7 FAKE_RUNNING=no -- --yes
run procs_fail 7 FAKE_RUNNING=fail -- --yes
receipt procs_fail
has procs_fail receipt "running=unknown"
run nokeys 0 FAKE_RUNNING=nokeys -- --yes
receipt nokeys
has nokeys receipt "running=yes (name)"
has nokeys txt "이름(Runner.app)으로만 확인했다"
run other_runner 7 FAKE_RUNNING=other -- --yes
has other_runner txt "꺼졌다"

mkdir -p "$R/.local/iphone-deploy.lock"
run locked 9 -- --yes
has locked txt "잠금을 대신 지우지 않는다"
[ -d "$R/.local/iphone-deploy.lock" ] && pass "locked: 남의 잠금을 지우지 않음" || fail "locked: 잠금이 사라짐"
rmdir "$R/.local/iphone-deploy.lock"

# 레포가 홈 아래면 복구 명령의 경로는 ~/… (맥 사용자 이름이 안 찍힘) — 그대로 붙여 넣어도 돈다
run pub_touch_home 0 FAKE_PUB_TOUCH=1 "HOME=$W" -- --yes
has pub_touch_home txt "cd ~/repo && git checkout -- app/ios/Flutter/Release.xcconfig"
fix=$(sed -n "s/.*되돌리기(이 실행이 만든 변경만): //p" "$OUT/pub_touch_home.txt" | head -n 1)
if [ -n "$fix" ] && HOME="$W" bash -c "$fix" && [ -z "$(git -C "$R" status --porcelain)" ]; then pass "pub_touch_home: ~ 복구 명령이 통함"; else fail "pub_touch_home: 복구 실패: $fix"; fi
run pub_touch 0 FAKE_PUB_TOUCH=1 -- --yes
receipt pub_touch
has pub_touch txt "이 실행이 git 추적 파일을 바꿨다"
has pub_touch txt "git checkout -- app/ios/Flutter/Release.xcconfig"
has pub_touch receipt "tracked_files=CHANGED: app/ios/Flutter/Release.xcconfig"
# 찍힌 복구 명령을 그대로 실행 → 깨끗해져야 한다
fix=$(sed -n "s/.*되돌리기(이 실행이 만든 변경만): //p" "$OUT/pub_touch.txt" | head -n 1)
if [ -n "$fix" ] && (eval "$fix") && [ -z "$(git -C "$R" status --porcelain)" ]; then pass "pub_touch: 복구 명령이 통함"; else fail "pub_touch: 복구 명령 실패: $fix"; fi
# 실행 전부터 더러우면 앞에서 경고
echo "// 사용자 수정" >>"$R/app/ios/Flutter/Debug.xcconfig"
run predirty 0 -- --yes
has predirty txt "실행 전부터 바뀐 추적 파일"
hasnt predirty txt "이 실행이 git 추적 파일을 바꿨다"
git -C "$R" checkout -q -- app/ios/Flutter/Debug.xcconfig

# Rust: cargo·rustup 이 있지만 빌드가 실패 → 링크 끄고 계속(0)
mkdir -p "$W/home/.cargo/bin" "$R/native/puff_sim/dist/ios"
printf '// 이전 링크\n' >"$R/native/puff_sim/dist/ios/link.xcconfig"
printf '#!/bin/sh\necho "fake $0 $*"; exit 1\n' >"$W/home/.cargo/bin/cargo"
cp "$W/home/.cargo/bin/cargo" "$W/home/.cargo/bin/rustup"
chmod +x "$W/home/.cargo/bin/"*
run rust_fail 0 -- --yes
receipt rust_fail
has rust_fail receipt "rust=off (빌드 실패"
[ ! -e "$R/native/puff_sim/dist/ios/link.xcconfig" ] && pass "rust_fail: 낡은 링크 설정 지움(--off)" || fail "rust_fail: 링크 설정이 남음"
run no_rust 0 -- --yes --no-rust
receipt no_rust
has no_rust receipt "rust=off (--no-rust)"
# Rust 빌드는 되는데 Xcode 링크에서 실패(맥 미검증 경로) → 링크를 끄고 한 번 더 → 웹 게임은 설치된다
cat >"$R/native/puff_sim/scripts/build-ios.sh" <<'EOF'
#!/bin/bash
# selftest 가짜: --device-only 면 링크 설정을 만들고, --off 면 지운다
d="$(cd "$(dirname "$0")/.." && pwd)/dist/ios"
case "${1:-}" in
  --off) rm -rf "$d"; echo off ;;
  --device-only) mkdir -p "$d"; echo '// 가짜 링크' >"$d/link.xcconfig"; echo built ;;
esac
EOF
git -C "$R" -c user.name=selftest -c user.email=selftest@example.invalid commit -qam 'selftest: 가짜 build-ios.sh'
printf '#!/bin/sh\necho "fake $0 $*"\n' >"$W/home/.cargo/bin/cargo"
cp "$W/home/.cargo/bin/cargo" "$W/home/.cargo/bin/rustup"
chmod +x "$W/home/.cargo/bin/"*
run rust_on 0 -- --yes
receipt rust_on
has rust_on receipt "rust=on"
has rust_on receipt "build=ok"
run rust_link 0 FAKE_BUILD=rustlink -- --yes
receipt rust_link
has rust_link receipt "rust=off (Rust 링크 빌드 실패"
has rust_link receipt "build=ok (Rust 끄고 다시)"
has rust_link txt "링크를 끄고 한 번 더"
[ ! -e "$R/native/puff_sim/dist/ios/link.xcconfig" ] && pass "rust_link: 링크 설정 지움" || fail "rust_link: 링크 설정이 남음"
git -C "$R" reset -q --hard HEAD~1
rm -rf "$W/home/.cargo"
clean_tree rust

# Flutter: 없음(--check) / 고정 리비전이 아닌 원본에서 받으면 거부
run noflutter_check 0 FLUTTER= -- --check
has noflutter_check txt "Flutter 3.47.5 이 없다"
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
git init -q "$W/badflutter"
mkdir -p "$W/badflutter/bin"
cp "$W/sdk/bin/flutter" "$W/badflutter/bin/flutter"
git -C "$W/badflutter" add -A
git -C "$W/badflutter" -c user.name=t -c user.email=t@example.invalid commit -qm bad
git -C "$W/badflutter" tag 3.47.5
mkdir -p "$W/home/.puff/flutter/3.47.5.tmp.999999" # 예전 실행이 받다 끊긴 임시 폴더(그 pid 는 없음)
run badrev 3 FLUTTER= "PUFF_FLUTTER_GIT_URL=$W/badflutter" -- --yes
has badrev txt "리비전이 다르다"
has badrev txt "받다 끊긴 임시 폴더 지움"
[ ! -e "$W/home/.puff/flutter/3.47.5" ] && pass "badrev: 설치 폴더를 만들지 않음" || fail "badrev: 잘못된 Flutter 가 설치됨"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5.tmp."* 2>/dev/null)" ] && pass "badrev: 임시 폴더 없음" || fail "badrev: 임시 폴더가 남음"
# Flutter 를 받는 중에 Ctrl-C → 130, 받던 임시 폴더를 지운다
MODE=int INT_AFTER="$W/clone.mark" run sigint_clone 130 FLUTTER= "PUFF_FLUTTER_GIT_URL=$W/badflutter" "FAKE_GIT_SLOW=$W/clone.mark" -- --yes
[ -e "$W/clone.mark" ] && pass "sigint_clone: clone 이 끝난 뒤 끊음" || fail "sigint_clone: clone 전에 끊김"
[ -z "$(ls -d "$W/home/.puff/flutter/3.47.5.tmp."* 2>/dev/null)" ] && pass "sigint_clone: 받던 임시 폴더 지움" || fail "sigint_clone: 임시 폴더가 남음"
run wrongflutter_env 3 "FLUTTER=$W/badflutter" "PUFF_FLUTTER_GIT_URL=$W/badflutter" -- --yes
has wrongflutter_env txt "건너뜀"

clean_tree 마지막

# ---------------------------------------------------------------------------------------------------------------
# 4) app-www.py == app-www.mjs (까다로운 입력): 대소문자 </SCRIPT, 'ſ'(U+017F, 파이썬 re.I 만 s 로 봄), BOM, CRLF,
#    이모지(UTF-16 길이), <body> 두 번, '$&' 치환 패턴 — 바이트가 같아야 한다
echo "== app-www.py 와 app-www.mjs 바이트 비교 (까다로운 입력)"
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
      if [ "$impl" = node ]; then (cd "$d" && node "$ROOT/tools/app-www.mjs" >/dev/null); else (cd "$d" && python3 -I "$ROOT/tools/app-www.py" >/dev/null); fi
    done
    a1=$(sha256sum "$W/www-$case-node/app/assets/www/index.html" | awk '{print $1}')
    a2=$(sha256sum "$W/www-$case-py/app/assets/www/index.html" | awk '{print $1}')
    if [ "$a1" = "$a2" ]; then pass "입력 $case: 같음 (${a1:0:16})"; else fail "입력 $case: 다름 node=$a1 py=$a2"; fi
  done
  m1=$(cd "$W/www-a-node" && node "$ROOT/tools/app-www.mjs")
  m2=$(cd "$W/www-a-py" && python3 -I "$ROOT/tools/app-www.py")
  if [ "$m1" = "$m2" ]; then pass "크기 표시도 같음: $m1"; else fail "크기 표시 다름: '$m1' / '$m2'"; fi
else
  echo "  (node 없음 — 건너뜀)"
fi

# ---------------------------------------------------------------------------------------------------------------
if [ -n "${SELFTEST_REAL_FLUTTER:-}" ]; then
  echo "== 실제 Flutter 3.47.5 받기 경로 (원본: $SELFTEST_REAL_FLUTTER)"
  # HOME 을 가짜로 바꾸므로 전역 git 설정(프록시 인증 방식 등)이 안 읽힌다 → 필요한 것만 환경으로 넘긴다
  run real_flutter 4 FLUTTER= "PUFF_FLUTTER_GIT_URL=$SELFTEST_REAL_FLUTTER" "PUB_CACHE=${PUB_CACHE:-$HOME/.pub-cache}" \
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.proxyAuthMethod "GIT_CONFIG_VALUE_0=$(git config --global http.proxyAuthMethod || echo anyauth)" -- --yes
  has real_flutter txt "받음 →"
  has real_flutter txt "리비전 확인됨"
  has real_flutter txt "Flutter 준비됨: 3.47.5"
  has real_flutter txt "flutter build ios --config-only 실패"
  receipt real_flutter
  clean_tree real_flutter
fi

echo
echo "결과: 통과 $PASS · 실패 $FAIL   (출력: $OUT$([ "${KEEP:-0}" = 1 ] || echo ' — KEEP=1 이면 남김'))"
[ "$FAIL" = 0 ]

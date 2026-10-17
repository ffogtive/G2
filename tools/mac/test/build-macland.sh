#!/bin/bash
# shellcheck disable=SC2016 # bash -c '…' 안의 $ 는 빌드한 bash 가 풀 것
# build-macland.sh — 리눅스에서 '맥 사용자 공간' 일부를 Apple 공개 소스(github.com/apple-oss-distributions)로 빌드한다.
#   bash 3.2.57 (태그 bash-144 = 요즘 macOS 의 /bin/bash), awk 20200816 (awk-40 = /usr/bin/awk),
#   BSD sed·grep(2.6.0-FreeBSD)·cut·comm (text_cmds-199). fake-mac.sh 가 MACLAND=<폴더> 로 쓴다(시험 전용, 레포 밖에 만든다).
# 사용: bash tools/mac/test/build-macland.sh [폴더]     (기본 /tmp/puff-macland — 약 2~3분, gcc·make·git 필요)
#
# 맥 전용 헤더·함수는 아래 호환 파일로 메운다 — 동작이 바뀌는 곳이 없게 고른 것만:
#   xlocale.h → locale.h · EBADEXEC(맥 errno) → ENOEXEC · fmtcheck(3) → 받은 형식 그대로(bash·awk 는 스스로 파싱한
#   지정자 하나만 넘기므로 BSD libc 도 그대로 돌려준다) · __collate_lookup_l → 글자 = 1차 가중치([[=x=]] 에만 쓰임)
#   · fgetln/warnc/errc/getprogname → glibc 로 · REG_ENHANCED(sed -H 에만) → 0 · capsicum → 없음.
# 남는 차이(검증 못 함): 정규식 엔진은 glibc 것이다 — 맥(TRE)과 달리 BRE 의 \+ \? \| 를 연산자로 받는다.
#   그래서 fake-mac.sh 가 따로 '이식성 정적 검사'로 그런 패턴을 막는다. tr·sort·find·head·wc·date 는 GNU 그대로.
set -euo pipefail
unset CDPATH
DEST=${1:-${MACLAND:-/tmp/puff-macland}}
BASH_TAG=bash-144 AWK_TAG=awk-40 TEXT_TAG=text_cmds-199
STAMP="$BASH_TAG $AWK_TAG $TEXT_TAG v1"
if [ -x "$DEST/bin/bash" ] && [ "$(cat "$DEST/VERSIONS" 2>/dev/null || true)" = "$STAMP" ]; then
  echo "이미 있음: $DEST ($STAMP)"
  exit 0
fi
for t in gcc make git; do command -v "$t" >/dev/null || {
  echo "$t 가 없다"
  exit 3
}; done
mkdir -p "$DEST/bin" "$DEST/src" "$DEST/compat/sys"
C="$DEST/compat"

# ---------------------------------------------------------------------------------------------------------------
# 호환 파일
printf '#include <locale.h>\n' >"$C/xlocale.h"
cat >"$C/bash_compat.h" <<'EOF'
#include <errno.h>
#ifndef EBADEXEC
#define EBADEXEC ENOEXEC
#endif
static inline const char *fmtcheck(const char *fmt, const char *def) { (void)def; return fmt; }
EOF
cat >"$C/bsd_compat.h" <<'EOF'
#define _GNU_SOURCE 1
#include <errno.h>
#include <locale.h>
#include <wchar.h>
#include <wctype.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <limits.h>
#include <stdio.h>
#include <err.h>
#include <getopt.h>
#include <stdbool.h>
#include <sys/cdefs.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mman.h>
#ifndef __FBSDID
#define __FBSDID(s) struct __hack
#endif
#ifndef __used
#define __used __attribute__((used))
#endif
#ifndef __dead2
#define __dead2 __attribute__((__noreturn__))
#endif
#ifndef __unused
#define __unused __attribute__((unused))
#endif
#ifndef __printflike
#define __printflike(a, b) __attribute__((format(printf, a, b)))
#endif
#ifndef __unreachable
#define __unreachable() __builtin_unreachable()
#endif
#ifndef nitems
#define nitems(x) (sizeof((x)) / sizeof((x)[0]))
#endif
#ifndef __DECONST
#define __DECONST(type, var) ((type)(uintptr_t)(const void *)(var))
#endif
#ifndef REG_ENHANCED
#define REG_ENHANCED 0
#endif
#ifndef OFF_MAX
#define OFF_MAX ((off_t)(~(1ULL << 63)))
#endif
#ifndef MAP_NOCORE
#define MAP_NOCORE 0
#endif
#ifndef MAP_NOSYNC
#define MAP_NOSYNC 0
#endif
typedef wchar_t __darwin_wchar_t;
const char *fmtcheck(const char *, const char *);
void __collate_lookup_l(wchar_t *, int *, int *, int *, locale_t);
char *fgetln(FILE *, size_t *);
void warnc(int, const char *, ...);
void errc(int, int, const char *, ...) __attribute__((__noreturn__));
const char *getprogname(void);
size_t strlcpy(char *, const char *, size_t);
size_t strlcat(char *, const char *, size_t);
EOF
cat >"$C/bsd_compat.c" <<'EOF'
#define _GNU_SOURCE 1
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <errno.h>
#include <err.h>
#include <wchar.h>
#include <locale.h>
#include <sys/types.h>
const char *fmtcheck(const char *fmt, const char *def) { (void)def; return fmt; }
void __collate_lookup_l(wchar_t *t, int *len, int *prim, int *sec, locale_t l) { (void)l; *len = 1; *prim = (int)*t; *sec = 0; }
char *fgetln(FILE *fp, size_t *len) { static char *buf; static size_t cap; ssize_t n = getline(&buf, &cap, fp); if (n < 0) return NULL; *len = (size_t)n; return buf; }
void warnc(int code, const char *fmt, ...) { va_list ap; va_start(ap, fmt); errno = code; vwarn(fmt, ap); va_end(ap); }
void errc(int ev, int code, const char *fmt, ...) { va_list ap; va_start(ap, fmt); errno = code; verr(ev, fmt, ap); }
extern char *program_invocation_short_name;
const char *getprogname(void) { return program_invocation_short_name; }
EOF

fetch() { # <저장소> <태그>
  [ -d "$DEST/src/$1/.git" ] && return 0
  echo "== 받기: apple-oss-distributions/$1 ($2)"
  git clone -q --depth 1 -c advice.detachedHead=false --branch "$2" "https://github.com/apple-oss-distributions/$1.git" "$DEST/src/$1"
}
fetch bash "$BASH_TAG"
fetch awk "$AWK_TAG"
fetch text_cmds "$TEXT_TAG"

# ---------------------------------------------------------------------------------------------------------------
echo "== bash 3.2.57 빌드 (약 2분)"
B="$DEST/build-bash"
rm -rf "$B"
cp -R "$DEST/src/bash/bash-3.2" "$B"
BCFLAGS="-O1 -g0 -std=gnu99 -fcommon -I$C -include $C/bash_compat.h -Wno-implicit-function-declaration -Wno-implicit-int"
BCFLAGS="$BCFLAGS -Wno-int-conversion -Wno-incompatible-pointer-types -Wno-return-mismatch"
(cd "$B" && CFLAGS="$BCFLAGS" ./configure --prefix="$DEST" --without-bash-malloc --disable-nls >configure.log 2>&1) ||
  { tail -20 "$B/configure.log"; exit 4; }
# -j1: 병렬이면 lib/readline 이 histexpand.o 를 두 번 만들다 경쟁한다
(cd "$B" && make -j1 CFLAGS="$BCFLAGS" >make.log 2>&1 && make install >install.log 2>&1) ||
  { grep -E ': error|Error [0-9]|undefined reference' "$B/make.log" | head -20; exit 4; }

TCFLAGS="-O1 -w -I$C -include $C/bsd_compat.h"
echo "== awk (awk-40 = 20200816)"
# shellcheck disable=SC2086 # TCFLAGS 는 일부러 낱말로 나눈다
(cd "$DEST/src/awk/src" && gcc $TCFLAGS -o "$DEST/bin/awk" b.c main.c parse.c proctab.c tran.c lib.c run.c lex.c awkgram.tab.c \
  "$C/bsd_compat.c" -lm)
for t in sed grep cut comm; do
  echo "== $t (text_cmds-199)"
  # shellcheck disable=SC2086
  (cd "$DEST/src/text_cmds/$t" && gcc $TCFLAGS -DWITHOUT_BZIP2 -DWITHOUT_LZMA -DWITHOUT_GZIP -DWITHOUT_FASTMATCH \
    -o "$DEST/bin/$t" ./*.c "$C/bsd_compat.c")
done

# ---------------------------------------------------------------------------------------------------------------
# 확인: 맥과 같은 판인가 + 맥답게 구는가
v=$("$DEST/bin/bash" -c 'echo "$BASH_VERSION"')
[ "${v%%(*}" = 3.2.57 ] || { echo "bash 판이 다르다: $v"; exit 4; }
"$DEST/bin/bash" -c 'set -u; a=(); echo "${a[@]}"' >/dev/null 2>&1 && { echo "bash 3.2 의 빈 배열 set -u 오류가 재현되지 않는다"; exit 4; }
[ "$("$DEST/bin/awk" --version)" = "awk version 20200816" ] || { echo "awk 판이 다르다"; exit 4; }
"$DEST/bin/grep" --version 2>&1 | grep -q 'BSD grep' || { echo "grep 이 BSD grep 이 아니다"; exit 4; }
"$DEST/bin/sed" --version >/dev/null 2>&1 && { echo "sed 가 GNU 처럼 --version 을 받는다"; exit 4; }
[ "$(printf 'a\tb\n' | "$DEST/bin/awk" -F '\t' '{printf "%d) %s\n", NR, $2}')" = "1) b" ] || { echo "awk printf 이상"; exit 4; }
printf '%s\n' "$STAMP" >"$DEST/VERSIONS"
echo "완료: $DEST/bin → bash $v · $("$DEST/bin/awk" --version) · $("$DEST/bin/grep" --version 2>&1 | head -n 1) · BSD sed·cut·comm"

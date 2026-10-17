#!/bin/bash
# gemini-video.sh — (맥에서) 제미나이에게 YouTube 딱지 영상을 분석시키고, 결과를 파일로 남기고 클립보드에 복사한다.
# 왜: 클라우드 세션은 YouTube 가 막혀 있어 영상을 못 본다. 제미나이는 YouTube 링크를 자기 서버에서 직접 연다.
# 사용: bash tools/mac/gemini-video.sh [YouTube URL ...]     (URL 을 안 주면 재윤님이 보낸 두 영상)
#   인증(둘 중 하나, 키는 화면·파일·인자에 찍지 않는다):
#     1) GEMINI_API_KEY 환경 변수(또는 ~/.gemini/.env 의 GEMINI_API_KEY=) → REST 로 영상 자체를 넣어 분석(가장 정확)
#     2) gemini CLI(구글 로그인 등) → gemini -p 로 분석(CLI 가 링크를 어떻게 여는지에 따라 정확도가 다를 수 있음)
#   모델: GEMINI_MODEL(없으면 키로 모델 목록을 보고 가장 새 'gemini-<판>-pro' 를, 없으면 flash 를 고름). 결과: .local/video-analysis-<시각>.md + 클립보드(pbcopy)
set -euo pipefail
unset CDPATH
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
if [ $# -gt 0 ]; then URLS=("$@"); else URLS=("https://www.youtube.com/watch?v=fyj0Xfa8T6k" "https://www.youtube.com/watch?v=GhKrc62b_Xw"); fi
MODEL=${GEMINI_MODEL:-}
API_BASE=${GEMINI_API_BASE:-https://generativelanguage.googleapis.com}
mkdir -p "$ROOT/.local"
OUT="$ROOT/.local/video-analysis-$(date +%Y%m%d-%H%M%S).md"

read -r -d '' PROMPT <<'P' || true
당신은 놀이 동작 분석가다. 아래 영상(들)은 1990년대 한국 '동그란 종이 딱지 불어먹기'(같은 수를 걸고 쌓은 원기둥 더미를 입으로 불어 뒤집힌 만큼 가져가는 놀이) 관련이다.
게임으로 재현하려고 한다. 영상마다 다음을 **본 것(관찰)** 과 **추정** 을 구분해서, 가능한 한 타임스탬프(mm:ss)와 함께 한국어로 자세히 적어라.
1. 판: 더미를 놓은 곳(바닥·책상·땅, 평평한가, 가장자리인가), 딱지 종류·크기·두께(얇은 종이인지), 더미 장수와 높이, 매 판 다시 쌓는지.
2. 자세: 부는 사람의 몸·머리 위치, 입 높이(더미 밑부분·중간·위와 비교), 더미와의 거리, 손으로 무엇을 하는지.
3. 숨: 짧게 '퍽/파' 인지 길게 '푸~/후~' 인지, 길이(초), 세기, 소리, 여러 번 나눠 부는지, 숨을 모으는 동작.
4. 고개·얼굴 움직임(가장 중요): 부는 동안 얼굴 각도가 어떻게 바뀌는지 — 아래에서 위로 들어 올리는지, 포물선을 그리는지, 시작·끝 각도(대략 도), 속도, 언제 시작하는지(숨 시작과의 순서), 반동(튕기듯 올리는 동작) 여부.
5. 딱지 반응: 어디부터 들리는지(맨 아래·중간·위·가장자리), 한 장씩인지 덩어리째인지, 날아가는 궤적(포물선·옆으로 미끄러짐), 들썩였다 되돌아오는 흔들림(반동)이 있는지, 몇 장 넘어갔는지, 뒤집힘 판정.
6. 규칙: 몇 장씩 거는지, 순서, 뒤집힌 것만 가져가는지, 반만 뒤집힘·서 있는 딱지 처리, 원·선 같은 경계가 있는지.
7. 잘하는 사람과 못하는 사람의 차이(있다면): 자세·숨·고개 움직임·타이밍.
8. 게임 기획자에게 주는 핵심 한 줄 요약 3개.
영상에 딱지 불기가 아닌 다른 놀이(딱지치기 등)만 나오면 그렇다고 분명히 말하라. 모르는 것은 모른다고.
P

body_json() { # REST 요청 본문: 프롬프트 + 영상들(file_data)
  python3 - "$PROMPT" "${URLS[@]}" <<'PY'
import json, sys
prompt, urls = sys.argv[1], sys.argv[2:]
parts = [{"text": prompt}] + [{"file_data": {"file_uri": u}} for u in urls]
print(json.dumps({"contents": [{"role": "user", "parts": parts}], "generationConfig": {"temperature": 0.2}}))
PY
}

KEY=${GEMINI_API_KEY:-}
if [ -z "$KEY" ] && [ -f "$HOME/.gemini/.env" ]; then
  KEY=$(sed -n 's/^[[:space:]]*GEMINI_API_KEY=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$HOME/.gemini/.env" | tail -n 1 || true)
fi

if [ -n "$KEY" ]; then
  if [ -z "$MODEL" ]; then
    MODEL=$(printf 'header = "x-goog-api-key: %s"\n' "$KEY" | curl -sS -m 30 -K - "$API_BASE/v1beta/models?pageSize=200" 2>/dev/null | python3 -c '
import json, re, sys
try: ms = json.load(sys.stdin).get("models", [])
except Exception: ms = []
def ver(n):
    m = re.match(r"models/gemini-([0-9]+(?:\.[0-9]+)?)-(pro|flash)(-preview)?$", n)
    return (m.group(2) == "pro", float(m.group(1)), m.group(3) is None) if m else None
c = [(ver(m["name"]), m["name"]) for m in ms if "generateContent" in m.get("supportedGenerationMethods", []) and ver(m["name"])]
print(max(c)[1].split("/", 1)[1] if c else "gemini-2.5-pro")
' || echo gemini-2.5-pro)
  fi
  echo "[gemini] REST($MODEL)로 영상 ${#URLS[@]}개 분석 중… (영상 길이에 따라 1~3분)"
  RESP="$ROOT/.local/video-analysis-resp.json"
  # 키는 헤더로만(명령줄·URL 에 안 남게 curl 설정 파일을 표준 입력으로)
  if ! printf 'header = "x-goog-api-key: %s"\n' "$KEY" | curl -sS --fail-with-body -m 600 -K - \
      -H 'Content-Type: application/json' -X POST \
      "$API_BASE/v1beta/models/$MODEL:generateContent" --data-binary @<(body_json) -o "$RESP"; then
    echo "[gemini] ❌ 요청 실패 — 응답 앞부분:" >&2
    head -c 800 "$RESP" >&2 2>/dev/null || true; echo >&2
    echo "      모델 이름이 틀렸으면: GEMINI_MODEL=gemini-2.5-flash bash tools/mac/gemini-video.sh" >&2
    exit 4
  fi
  python3 - "$RESP" "$OUT" "$MODEL" "${URLS[@]}" <<'PY'
import json, sys
resp, out, model, urls = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
d = json.load(open(resp))
texts = []
for c in d.get("candidates", []):
    for p in (c.get("content") or {}).get("parts", []):
        if "text" in p: texts.append(p["text"])
body = "\n".join(texts).strip() or ("(빈 응답) " + json.dumps(d, ensure_ascii=False)[:2000])
open(out, "w").write(f"# 제미나이 영상 분석 ({model}, REST)\n\n영상: " + " · ".join(urls) + "\n\n" + body + "\n")
PY
elif command -v gemini >/dev/null 2>&1; then
  echo "[gemini] gemini CLI 로 분석 중… (영상 ${#URLS[@]}개)"
  { printf '# 제미나이 영상 분석 (gemini CLI)\n\n영상: %s\n\n' "${URLS[*]}"; gemini -p "$PROMPT

분석할 영상 링크: ${URLS[*]}" ; } > "$OUT"
else
  echo "[gemini] ❌ GEMINI_API_KEY 도 gemini CLI 도 없다." >&2
  echo "      설치: npm i -g @google/gemini-cli && gemini   (처음 한 번 로그인) 또는 GEMINI_API_KEY 를 셸에 설정" >&2
  exit 3
fi

if command -v pbcopy >/dev/null 2>&1; then pbcopy < "$OUT" && COPIED=" — 클립보드에 복사됨(그대로 붙여 넣기)"; else COPIED=""; fi
echo "[gemini] ✅ 결과: ${OUT#"$ROOT"/}$COPIED"
echo "----------------------------------------"
cat "$OUT"

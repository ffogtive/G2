# G2 — PUFF! (딱지 불어먹기 아케이드)

## 🧭 가설 먼저 (모든 작업 0단계 — 재윤님 상시 지시)

**리서치·기획·목업·디버깅을 시작할 때 응답과 문서 맨 앞에 최전방 가설을 1~2줄로 먼저 쓴다.** 본문보다 위.

```
**가설**: <무엇이 핵심/원인이라고 보는가> → <그래서 무엇을 할 것인가 / 무엇을 보면 판가름 나는가>
```

- 목적은 **조기 차단**: 재윤님이 가설 한 줄만 보고 틀린 방향을 바로 끊을 수 있게. 가설 없이 본문만 따라가면 산으로 간다.
- 확인 전 `(미검증)`, 실측/출처로 확정되면 `(확인됨)`.
- 틀리면 즉시 `**가설 수정**:` 으로 다시 박고 왜 틀렸는지 한 줄. 조용히 방향만 바꾸지 말 것.
- 긴 작업은 단계마다 다시 박는다. 산출 문서(리포트·GDD·BLOCKERS·PR 본문)도 맨 위에 `## 🧭 핵심 가설` 섹션.

## 프로젝트 한 줄

1990년대 한국 '동그란 딱지 불어먹기'(같은 수를 걸고 쌓은 더미를 입으로 "퍽" 불어 뒤집힌 만큼 가져감)를
남녀노소·글로벌 아케이드로. 톤앤매너 목표: Clash of Clans / Royal Kingdom / Angry Birds.

## 구조

```
docs/research/   리서치 리포트 (출처·검증 결과 포함)
docs/design/     GDD (게임 기획서)
docs/BLOCKERS.md 막힌 것 / 확인 필요한 결정 메모
mockup/src/      목업 소스 (ES 모듈)
  sim.js    물리(Rapier). 렌더러 독립 → Node 에서 튜닝/테스트 가능
  rules.js  숨 규칙(더미 양 비례 정답 숨, 약함=들썩·초록=최대·셈=돌풍) + 숨 주머니(꽉·버팀·콜록) — 게임과 봇이 공유
  levels.js 레벨 1~10,000 생성 규칙(10판 톱니, 50판 동네) + levels-cal.json(봇 보정표)
  creatures.js 수집 테마 시안(동물 크리처 × 시즌 의상 9+1)
  art.js    딱지 앞/뒷면 캐릭터 아트 절차 생성 (외부 이미지 0)
  main.js   three.js 장면·입력·연출·매치 흐름 (분필 원, 엄지 멈춤 눈금)
  face.js   부는 얼굴(시안 B '뽀뽀 입') + 숨 주머니 고리
  audio.js  WebAudio 합성 효과음 / mic.js 마이크 불기 감지
  store.js  내 딱지 보관함(localStorage) / i18n.js 한·영
mockup/index.html  UI 마크업 + CSS (빌드 템플릿)
tools/build.mjs    → dist/puff.html (오프라인 단일 파일), dist/puff-artifact.html (claude.ai 아티팩트용)
tools/tune.mjs     바람 물리 파라미터 자동 탐색
tools/powercurve.mjs  숨 비율 → 뒤집힌 장수/원 밖 장수 곡선 (숨 규칙 바꾸면 필수)
tools/physics-spike.mjs  물리 안정성/분포 측정
tools/botlib.mjs / levelbot.mjs / calibrate.mjs  물리 봇 레벨 클리어율 측정·난이도 손잡이 자동 보정
tools/artifact-check.mjs  아티팩트(공개) 버전 부팅 재현 — 게시 전에 반드시 실행
tools/sims/coreloop/      기획 에이전트의 매치 시뮬레이션(선공 이점 등)
```

## 명령

```bash
npm install
npm run build        # dist/puff.html 생성 → 브라우저로 더블클릭 실행
PW=$(npm root -g)/playwright node tools/artifact-check.mjs   # 공개 버전 부팅 확인 (게시 전 필수)
node tools/levelbot.mjs 1 60 16 learner                      # 레벨 클리어율 측정
LIST=4,9 node tools/calibrate.mjs 0 0 20 out.json            # 특정 레벨 재보정
node tools/tune.mjs 140   # 물리 재튜닝(수 분)
```

## 물리에서 배운 것 (실측, 2026-10-12)

- Rapier 기본 `erp` 로는 쌓인 얇은 원판이 영원히 떨린다 → `erp = 0.2` 에서 20장 완전 정지.
- convexHull 원판은 폭주, `cylinder` 가 안정.
- 바람 모델은 "바람 쪽 가장자리를 들어 올리는 임펄스 + 약한 전진" 근사. 세게 불수록 계속 많이 뒤집히는(단조) 성질이라
  옛 규칙(과파워 = 조준 흔들림 + 파워 상한)으로는 **빨강이 초록보다 더 넘어갔다** (재윤님 3차 피드백, `tools/powercurve.mjs` 로 확인).
- 3차 개편(`rules.js resolveShot` + `sim.js` blast): 숨 비율(정답 대비) → 약함 0.6↓ = 들썩만(≈0장), 초록 0.78~1.0 = 최대 고원,
  1.0↑ = **돌풍**(들기↓ 밀기↑) → 딱지가 **분필 원(r=3.2) 밖**으로 날아가 무효. 1.05 −10%, 1.1 −25%, 1.2↑ ≈0장. 물리 바닥 = 책상 크기.
  숨 규칙을 바꾸면 반드시 `node tools/powercurve.mjs 8` 로 곡선을 다시 재고 레벨을 재보정(`calibrate.mjs`).
- 조준 높이별 분포: 맨 위 = 안정(4~10장), 가운데 = 대박 아니면 꽝(0~16장), 아래 = 헛방.
- `pkill -f` 패턴이 자기 셸 커맨드라인에도 들어 있으면 자기 자신을 죽인다. PID 로 죽일 것.

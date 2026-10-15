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
- **재윤님께 보이는 글은 항상 한국어**(재윤님 10차 "갑자기 영어로 말하지마"). 컨텍스트 압축·스톱 훅 직후 첫 응답에서 특히 조심.

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
  rules.js  숨 규칙(더미 양 비례 정답 숨, 약함=들썩·초록=최대·셈=돌풍) + 숨 주머니(꽉·버팀·콜록) — 게임과 봇이 공유. 숨 풍선(balloonCost 등)은 넣었지만 아직 게임 미연결
  levels.js 레벨 1~10,000 생성 규칙(10판 톱니, 50판 동네) + levels-cal.json(봇 보정표)
  creatures.js 수집 테마 시안(동물 크리처 × 시즌 의상 9+1)
  art.js    딱지 앞/뒷면 캐릭터 아트 절차 생성 (외부 이미지 0)
  main.js   three.js 장면·입력·연출·매치 흐름 (분필 원, 엄지 멈춤 눈금, 1인칭 볼·입술, 손가락 시범, 방금 숨 카드)
  face.js   부는 얼굴(시안 B '뽀뽀 입') + 숨 주머니 고리
  cues.js   공략 단서 계산(숨 물결 = sweetHiFor 역함수, 2~4장째 창, 원인 분류) — 렌더러 독립
  audio.js  WebAudio 합성 효과음(앱에서는 navigator.audioSession 'playback' = 무음 모드에서도 소리, 끄면 'auto') / mic.js 마이크 불기 감지(켤 때 세션 'auto')
  diag.js   ⚙ '소리·진동 시험'(삑·푸·진동 3단 + AudioContext·audioSession·햅틱 ACK 표) — 실기기 원인 판가름용
  store.js  내 딱지 보관함(localStorage) / i18n.js 한·영
  turn.js   PvP 한 턴: ShotRun(새 월드·턴별 시드·스텝 판정 → 30Hz 궤적·post·해시), TrackPlayer/Chunker(13B 코덱), BeatClock, 꼭두각시 월드 — 렌더러 독립
  net.js    PvP 네트워크 한 겹: Net 인터페이스(아티팩트 db·room·user 모양) + LocalNet(같은 브라우저 두 탭, 상한을 실제처럼 강제)
            + ArtifactNet(claude.use('db'|'room'|'user') 어댑터: 크기 계량·일시 오류 재시도·끝난 방/구독 다시 잇기). resolveNet() = 없으면 null → PvP 버튼 숨김
  pvp.js    친선 대결 규칙(3판·판마다 선공 교대·가위바위보 커밋-리빌·문서 경로·샷 문서로 상태 다시 계산)
mockup/index.html  UI 마크업 + CSS (빌드 템플릿)
tools/build.mjs    → dist/puff.html (오프라인 단일 파일), dist/puff-artifact.html (claude.ai 아티팩트용)
tools/tune.mjs     바람 물리 파라미터 자동 탐색
tools/powercurve.mjs  숨 비율 → 뒤집힌 장수/원 밖 장수 곡선 (숨 규칙 바꾸면 필수)
tools/stackpower.mjs  장수별 물리 세기 → 뒤집힘 비율 (1장 0.75 정점 등)
tools/aimmap.mjs   조준 지점(좌우×높이) → 장수·옆 이동·구르기·회전·원 밖 지도 (바람 모델 바꾸면 필수)
tools/atlas.mjs / fromtop.mjs  공략 지도(장수×높이×좌우×세기) / 위에서 몇 장째가 최고인가
tools/goldenside.mjs  황금 딱지가 조준에 따라 어디로 떨어지나 (★칸 판)
tools/cuecheck.mjs    공략 단서가 규칙·실측과 맞는지 (단서·숨 규칙 바꾸면 필수)
tools/physics-spike.mjs  물리 안정성/분포 측정
tools/sweepmap.mjs · sweepcheck.mjs · coresweep/  고개 쓸기(푸어억) 코어 측정·재검증·모델 민감도(sens)·숨 풍선(econ)·엄지 인식기(gesture)·손 잡음 시험(gestnoise)·실물 3판 보정(ownclips: calreport / calreport2·choose2·verdict2, 원자료 data/own/calib·calib2, docs/research/06 §5·§7), 원자료 coresweep/data/ (docs/design/core-sweep.md §3.8). sim.js 바꾸면 `node tools/sweepmap.mjs verify` 필수(simsweep ≡ sim.js)
native/puff_v2/ + scripts/flatfloor.mjs  정직 엔진(3D 제트) 평평한 바닥 게이트(run·report, 원자료 data/flatfloor/ → docs/research/v2-flatfloor.md). 고치면 `CARGO_TARGET_DIR=../puff_sim/target cargo test --release --offline`
tools/balloon-check.mjs  rules.js 숨 풍선(BALLOON·balloonCost·balloonStep) ≡ coresweep/econ.mjs 'new' 비트 대조(비용 격자·3판 DP) + econ gate 네 판정 (풍선 식·econ 바꾸면 필수, 1초)
tools/botlib.mjs / levelbot.mjs / calibrate.mjs  물리 봇 레벨 클리어율 측정·난이도 손잡이 자동 보정
tools/artifact-check.mjs  아티팩트(공개) 버전 부팅 재현 — 게시 전에 반드시 실행. claude 없음·use()=null·보기 전용 → PvP 숨김 / 가짜 호스트 → 'VS 친구'·방 만들기
tools/fake-claude.js · artifact-host.mjs  가짜 claude.ai 호스트(LocalNet 위에 db·room·user 모양) · 아티팩트 빌드 감싸기·CDN→node_modules (시험 전용)
tools/pvpsync.mjs  PvP 네트워크 없는 게이트: 궤적 크기·재생 끝=post·새 월드 재시뮬·판정 분포 (sim·rules·turn 바꾸면 필수)
tools/pvp-check.mjs  PvP 두 탭 3판 완주: 턴별 해시 100%·뒤 검증·검증 기록(E10)·상한 위반 0·콘솔 오류 0 (main.js PvP·net·pvp·turn 바꾸면 필수). NET=artifact = 아티팩트 빌드 + 가짜 호스트
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
node tools/pvpsync.mjs 40 8                                  # PvP 턴 기록 게이트(약 6분, PVP_D=0 이면 (d) 생략)
PW=$(npm root -g)/playwright node tools/pvp-check.mjs 5      # PvP 두 탭 게이트(약 4~6분). 변형: RELOAD=b(재접속) DROP=3(조각 빠짐→db) CLOCK=3(자동 헛숨) LAG=60
NET=artifact PW=$(npm root -g)/playwright node tools/pvp-check.mjs 5   # 같은 게이트를 아티팩트 빌드(ArtifactNet)로 — 게시 전 필수
# 손으로 두 탭: dist/puff.html?pvplocal 을 두 창으로 → 홈 'PvP (두 탭)' → 방 만들기 / 코드 참가. ?pvpbot 이면 자동으로 둔다
# 아티팩트 PvP: 게시 때 capabilities 선언 필요(docs/design/items-pvp.md §2.1 선언 JSON). 홈 'VS 친구' → 6자 코드. 같은 계정 두 탭 시험 = 로비 제목 5번 탭(개발 토글)
```

## 앱 (Flutter, iOS·Android) — 재윤님: '플로터로 만들어'

- `app/` = Flutter 껍데기(`com.ffogtive.puff`). 게임 본체는 웹 빌드 한 파일을 **앱 안 로컬 서버(127.0.0.1:47821) + 웹뷰**로 연다. 물리·PvP 동기는 웹 코드 그대로.
- `npm run app:www` = 게임 빌드 → `tools/app-www.mjs`(dist/puff.html + `mockup/app/bridge.js` 다리 코드 → `app/assets/www/index.html`)
- 앱 쪽 검증: `cd app && flutter analyze && flutter test`. 다리 코드(소리 세션·햅틱 ACK·진단)는 `npm run app:www && PW=$(npm root -g)/playwright node tools/app-bridge-check.mjs`. iOS 빌드·설치는 맥에서만 — **`docs/app/ios-local.md`**
- 웹 진동(navigator.vibrate)은 iOS 웹뷰에 없다 → 다리 코드가 Flutter 채널 `PuffHaptic` 로 보내 햅틱으로
- **B 시제품(네이티브 경기 장면, 웹뷰 없이)**: `native/puff_sim/`(Rust rapier3d 0.36 물리 + C ABI, README) + `app/lib/native/`(flutter_scene 장면 + `live_sim.dart` 경기 루프, dart:ffi).
  기본은 언제나 웹뷰 게임. 데모 = `-t lib/native/demo_main.dart` · `--dart-define=NATIVE_DEMO=true` · 노치 옆 1.5초 누르기 (`NATIVE_BENCH=true` = 손 안 대고 벤치)
  - 숨 해석은 Dart(`rules.dart resolveShot`)가 하고 Rust 엔 세기·돌풍·조준점만. 초월함수는 `detmath.dart`(순수 Dart fdlibm) — dart:math 를 쓰면 기기마다 마지막 비트가 달라 PvP 해시가 갈라진다(리눅스에서 log 6%·cos 3%)
  - 물리·규칙을 바꾸면: `cargo test --release` → `target/release/puff_parity shots > app/test/fixtures/sim_cli_shots.json` → `cd app && flutter test` (리눅스 .so 로 Dart 경기 루프 = CLI 비트 대조)
  - iOS 링크는 맥에서 `native/puff_sim/scripts/build-ios.sh` 를 돌렸을 때만 켜진다(`#include?`). 순서·확인·문제 해결 = `docs/app/native-spike.md`. 실제 앱을 이 컨테이너에서 보려면 `app/tool/linux_check.sh`(리눅스 데스크톱 + Impeller + Xvfb)
- **아이폰 개발 설치는 `docs/app/iphone-deploy.md`**(재윤님 가이드 'claude-code-iphone-deployment.md' 의 G2 판)
  - **맥에서 한 줄(추천, G3 와 같은 방식)**: `bash tools/mac/ios_run.sh` — 재윤님께 줄 한 줄 명령은 iphone-deploy.md 맨 위. 1회 준비 `tools/mac/SIGNING.md`, Flutter 3.47.5 는 없으면 `~/.puff/flutter` 에 자동 설치, 기록 `.local/deploy-runs/`. 고치면 `bash tools/mac/test/fake-mac.sh`(가짜 맥, 리눅스에서 돔 — `MACLAND=` 로 bash 3.2.57·BSD 도구, `tools/mac/test/build-macland.sh`)
  - 0절로 현재 환경을 판별한다. 맥 로컬이면 직접, 맥 SSH가 되는 서버면 `tools/iphone/deploy-from-server.sh`, 맥에 닿지 못하는 클라우드면 설치하지 말고 '설치 준비 미완료'로 보고한다(클라우드는 `[iphone-deploy]` 커밋으로 서버 세션에 넘긴다)
  - Bundle ID `com.ffogtive.puff`(SJYTodo 값 금지), 맥 폴더는 G2 전용, 기기·Team 값은 `~/.config/puff/iphone-deploy.env`(레포 밖)
  - 테스트 → 기기용 서명 빌드 → 서명·Bundle ID 확인 → devicectl 설치 → 실행 → 기능 확인. 각 성공을 따로 보고한다. 키·비밀번호·토큰은 출력하거나 요구하지 않는다. 기존 앱을 삭제하지 않는다

## 물리에서 배운 것 (실측, 2026-10-12)

- Rapier 기본 `erp` 로는 쌓인 얇은 원판이 영원히 떨린다 → `erp = 0.2` 에서 20장 완전 정지.
- convexHull 원판은 폭주, `cylinder` 가 안정.
- 바람 모델은 "바람 쪽 가장자리를 들어 올리는 임펄스 + 약한 전진" 근사. 세게 불수록 계속 많이 뒤집히는(단조) 성질이라
  옛 규칙(과파워 = 조준 흔들림 + 파워 상한)으로는 **빨강이 초록보다 더 넘어갔다** (재윤님 3차 피드백, `tools/powercurve.mjs` 로 확인).
- 3차 개편(`rules.js resolveShot` + `sim.js` blast): 숨 비율(정답 대비) → 약함 0.6↓ = 들썩만(≈0장), 초록 0.78~1.0 = 최대 고원,
  1.0↑ = **돌풍**(들기↓ 밀기↑) → 딱지가 **분필 원(r=3.2) 밖**으로 날아가 무효. 1.05 −10%, 1.1 −25%, 1.2↑ ≈0장. 물리 바닥 = 책상 크기.
  숨 규칙을 바꾸면 반드시 `node tools/powercurve.mjs 8` 로 곡선을 다시 재고 레벨을 재보정(`calibrate.mjs`).
- 조준 높이별 분포: 맨 위 = 안정(4~10장), 가운데 = 대박 아니면 꽝(0~16장), 아래 = 헛방.
- 4차(좌우 조준): 바람 힘은 '입에서 가장 가까운 테두리'가 아니라 **제트 축이 실제로 닿는 테두리**에 줘야 좌우가 의미 있다
  (옛 모델은 lat 0.8 에도 힘 받는 점이 12° 만 이동 → 옆을 불면 손해만). `node tools/aimmap.mjs` 로 옆 이동·구르기·회전·장수를 잰다.
  게임(main.js shotGeometry)·봇(botlib)·측정 도구는 같은 기하(표적 = 곡면 위 c − D·√(1−lat²) + side·lat)를 써야 한다.
- 공략 세 줄(실측): 높이 = 위에서 3장째(2~4) / 숨 = 초록 / 좌우 = 가운데, 옆은 방향용(옆+센 숨 = 최악). 측정 도구(+x 바람)는 세계축 쏠림이 있으니 좌우 공평성은 게임 방향(−z)으로 잴 것.
- 1장은 초록 숨 물리 세기 0.95 면 로켓처럼 솟아 동전 던지기(25%) → `rules.physSweetFor`: 1장만 0.75(70%). 장수별 최적 세기는 `tools/stackpower.mjs` 방식으로 잰다.
- `pkill -f`/`pgrep -f` 패턴이 자기 셸 커맨드라인에도 들어 있으면 자기 자신을 죽이거나(pkill) 대기 루프가 안 끝난다(pgrep). PID 로 다루거나 `ps -eo args | grep -v grep | grep -q "node tools/..."` 처럼 node 접두로 거를 것.

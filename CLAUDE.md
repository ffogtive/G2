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
- **재윤님께 보이는 글은 존댓말**(재윤님 14차 "존대로 해"). 응답·보고·PR 본문 모두.
- **큰 작업은 짧게 끊어 미리보기를 먼저**(재윤님 14차 "조금씩 끊어가"). 한 번에 끝까지 가지 말고, 볼 수 있는 조각(스크린샷·빌드)을 먼저 드리고 다음으로.

## 프로젝트 한 줄

1990년대 한국 '동그란 딱지 불어먹기'(같은 수를 걸고 쌓은 더미를 입으로 "퍽" 불어 뒤집힌 만큼 가져감)를
남녀노소·글로벌 아케이드로. 톤앤매너 목표: Clash of Clans / Royal Kingdom / Angry Birds.

## 구조

```
docs/research/   리서치 리포트 (출처·검증 결과 포함)
docs/design/     GDD (게임 기획서)
docs/design/ui-system.md  UI 체계 단일 출처: 단추(세 색 · 못 누르는 상태 넷 · 크기)·숫자 글자·쓸기 결과 카드 한 길·결과 연출 시각 — 값은 mockup/index.html `:root` 토큰 한 곳(바꾸면 표도), 연출 시각은 main.js `SW_RV`. 화면 바꾸면 sweepplay (12g)
docs/BLOCKERS.md 막힌 것 / 확인 필요한 결정 메모
mockup/src/      목업 소스 (ES 모듈)
  sim.js    물리(Rapier). 렌더러 독립 → Node 에서 튜닝/테스트 가능
  rules.js  숨 규칙(더미 양 비례 정답 숨, 약함=들썩·초록=최대·셈=돌풍) + 숨 주머니(꽉·버팀·콜록) — 게임과 봇이 공유. 숨 풍선(balloonCost 등)은 넣었지만 아직 게임 미연결
  levels.js 레벨 1~10,000 생성 규칙(10판 톱니, 50판 동네) + levels-cal.json(봇 보정표)
  creatures.js 수집 테마 시안(동물 크리처 × 시즌 의상 9+1)
  art.js    딱지 앞/뒷면 캐릭터 아트 절차 생성 (외부 이미지 0)
  paper.js  딱지의 '보이는' 종이 몸(두꺼운 도화지, 재윤님): 보이는 두께 0.055 = 물리 DISC_H 0.11 의 절반 · 아래 면 쪽으로 0.0155 · **받침에 닿게 위아래로 옮기는 배치**(판이 있으면 매 프레임, 높이 순 · 받침과 6° 안이면 나란히 눕힘(물리에서 ≤3°) · 기대 누운 장 피벗 · 두 번째 받침 쪽 처짐 · 책상 밑 금지) → 보이는 더미는 물리보다 0.07~0.18 u 낮다. 그래서 화면 조준 표시(누른 곳·표적 고리·소매·금 띠·숨 물결)는 `paper.visY`/`physY` 대응표를 거친다(물리 조준·lidCount·해시 무변화 — 물리 높이에 3D 표시를 새로 그리면 visY 필수). 쓸기 연습판 그림(영점 점·띠·곡선·화살표·바람 자국·리본·옆모습 창·시점·카드 미니 기둥)은 main.js `swVisFn`(= visY · 꼭대기 위 기울기 1 · 숨 동안 숨 시작 표를 얼림), 큰 영점 창 누른 곳 → s 는 `swPhysY` → sOfH, 옆모습 창 딱지 단면 = 3D 메시 그대로. 착지 휘청·살짝 통(위에 얹힌 장 없을 때만)·무광 재질·희귀도 색 마분지 옆면. 판에서 빠지면 `paper.release`, 다시 쌓기 트윈 목표 = `paper.restPositions`. 모은 더미·홈 탑은 pileY(i). 1판 '아랫장에 기대 휨'은 틀렸음(core-sweep §7 1번)
  main.js   three.js 장면·입력·연출·매치 흐름 (분필 원, 엄지 멈춤 눈금, 1인칭 볼·입술, 손가락 시범, 방금 숨 카드)
  face.js   부는 얼굴(시안 B '뽀뽀 입') + 숨 주머니 고리
  cues.js   공략 단서 계산(숨 물결 = sweetHiFor 역함수, 2~4장째 창, 원인 분류) — 렌더러 독립
  audio.js  WebAudio 합성 효과음(앱에서는 navigator.audioSession 'playback' = 무음 모드에서도 소리, 끄면 'auto') / mic.js 마이크 불기 감지(켤 때 세션 'auto')
  diag.js   ⚙ '소리·진동 시험'(삑·푸·진동 ③-1 생성기(옛 게임 길)·③-2 엔진·③-3 Core·③-4 지금 게임 길 + AudioContext·audioSession·햅틱 ACK 표 · '게임 진동 기록'·'게임 진동 길' 단추 · ④ 게임처럼 O/X) — 실기기 원인 판가름용(BLOCKERS G4)
  store.js  내 딱지 보관함(localStorage) / i18n.js 한·영
  turn.js   PvP 한 턴: ShotRun(새 월드·턴별 시드·스텝 판정 → 30Hz 궤적·post·해시), TrackPlayer/Chunker(13B 코덱), BeatClock, 꼭두각시 월드 — 렌더러 독립
  net.js    PvP 네트워크 한 겹: Net 인터페이스(아티팩트 db·room·user 모양) + LocalNet(같은 브라우저 두 탭, 상한을 실제처럼 강제)
            + ArtifactNet(claude.use('db'|'room'|'user') 어댑터: 크기 계량·일시 오류 재시도·끝난 방/구독 다시 잇기). resolveNet() = 없으면 null → PvP 버튼 숨김
  pvp.js    친선 대결 규칙(3판·판마다 선공 교대·가위바위보 커밋-리빌·문서 경로·샷 문서로 상태 다시 계산)
  sweep.js  고개 쓸기(푸어억) 렌더러 독립 부분: 측정 식(sweepmap·sweepcheck 그대로)·엄지 인식기 Gesture(gesture.mjs + slowCancel 40)·SweepCtl(plan·thumb·puck·flick·zero) + 기본 문법 D '세 박자'(GD 절, 2026-10-17 · 숫자 = 보류 시드 확인 `sweepgd report`: ① 실제 더미 위 고리 톡(영점 = meterAt('s')) ② 부채꼴 바늘 톡(각도 gdMeterAt('th') 0→45→0°, 10° 이상 스트라이크 · 볼 < 10 = 헛스윙 gdSwing · 아슬 칸 없음) ③ 아래로 당긴 만큼 숨(qOfPull 0.6→1.25, q > 1 = gdArm 돌풍) → SweepCtl 'zero' · 판정 = 책상 밖 OUT DESK·deskOut·judgeDesk(게임·Node 공용, D 숨만 — C·B·A 는 분필 원) · gdZone·gdTone·gdChip·gdTipH · gdShot ≡ zeroShot(q ≤ 1 · θ ≥ 10; θ < 10 → θ 0) · 숨의 문법은 main.js ctlG 하나로 가름(D 도 'zero' 조종기) · ⚙ `?swg=d` · **비교 토글**(⚙ D 두 줄 · feel.gdQ·gdOut · `?gdq=normal|hard&gdout=desk|r5`): gdMode·gdKey·gdCfg(기본 = GD 객체 그대로)·GD_COMBO(조합별 칸·peak = sweepgd report 측정) · 숨 어려움 = 돌풍 (q − 1)/0.25 · 아웃 반지름 5 = judgeDesk(t, { out: 'r5' })·deskOut(d, out)(GD_RING 5, 게임·Node 공용 한 함수 · 판에 점선 원 main.js buildGdRing) · gdZone/gdChip/gdBlast/gdArm/gdShot 이 mode 를 받음 · 카드 조합 글·기록 mode) · **① 가이드 띠**(재윤님: 색 띠는 튜토리얼·아이템 때만 — 더미 위 띠·◀·초록 박자음 = 첫 3숨 또는 ⚙ D '가이드 띠: 처음만|늘' feel.gdGuide·`?gdguide=always`(가이드 아이템 자리), 평상시 = 흰 고리 + 주황 영점 점 '영점 · 바람 시작' · 기록 guide, 그림만) + 문법 C '영점 조준'(⚙ · `?swg=c` · GC 절: GC 값·a0Of·hOfS/sOfH·meterAt 삼각파 눈금(영점은 꼭대기 출발)·thOfRise·GC_LINES·gcChip(띠 안 = 영점 칩 없음 · 약한 숨 + 아래 모서리 = qWeak)·SweepCtl 'zero' = sweepgc GcCtl 비트 동일·zeroShot = ① 옆모습 곡선 기둥에서 영점 톡(탭 값 = 사건 시각 − 화면 지연 16 ms) ② 아래 당김 = 숨 · 위 밀기 = 쓸기 각 → 놓기 ③ 위 절반 10° + 0.15 s 에 자동 쓸기) · 문법 B '놓고 쓸기'(GB 값·gbD·gbChip·GestureB·Flick·flickShot, ⚙ · `?swg=b`) · 옛 문법 A '누른 채 쓸기'(⚙ · `?swg=a`) 비교용 · C 눈금 ⚙ 영점(기본)·각도·세기·끔 `?swm=s|th|q|off` · 빠르기 `?swmt=1.6|1.2|1.0` — 솔로 '쓸기 연습판' 전용(⚙ 조작 깃발 core · 홈 '쓸기 연습' 40·30장 · `?core=sweep` · `#p40` · `#p30`), PvP 해시 밖(ShotRun 이 prog·kind 거부). 화면·코치·옆모습 창은 main.js '고개 쓸기 연습판' 절(core-sweep §4.1·§9 4번, BLOCKERS G13)
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
tools/jetlagcheck.mjs  솔로 시험 토글 '실험: 바람 도달 시간'(⚙ 맨 위 스위치 4개 · 주소 ?jetlag=0.02&airfx=1&hscut=1&airlog=1, 기본 끔 · 값은 0.02 만 · PvP·마이크는 늘 끔, 06 §8.11) 이식 대조: sim.js 숨 인자 jetLag ≡ simsweep tune.jetLag(게임 경로 1~22장 + 방향·wind·테이프·입 높이·restack 변형, 매 스텝 비트 동일)·0 ≡ v1·ShotRun 거부 + 음성 대조(늘 돎: 한쪽만 jetLag ×1.0001 → (a)·(a2)·(b) 같음 0, 0.0001 ≢ v1 — 하나라도 같으면 틀림; `BLUNT=1e-3` = 무딘 비교 시험, 음성 대조가 하나라도 못 잡아야 맞음), 약 30초. sim.js·simsweep 바꾸면 필수. PvP 쪽 확인 = `EXPFEEL=1 pvp-check`(저장값 켬 → 대결 해시 100%·흔적 0)
tools/feelclock.mjs  06 §8.11 손맛 실측 표: 지금 mockup 의 계측 사본(임시 폴더 · main.js 훅 자리가 정확히 1번 아니면 곧바로 멈춤, 그 밖의 main.js 변경은 check 가 결과로 잡음)을 Playwright 가짜 시계(rAF 16 ms)로 돌려 놓기 → 단서·멈칫·슬로모·보이는 첫 움직임 ms. 첫 인자 필수(없거나 모르면 exit 2): `PW=… node tools/feelclock.mjs run`(약 15분, 원자료 coresweep/data/feel/ 다시 씀 + 표) · `check`(다시 재서 판정 = 커밋본과 report 출력 글자 대조, 참고 = 샷 모든 필드·meta) · `report`(원자료로 표·프레임 맞춤만, 1초, mockup 해시 다르면 경고). main.js 실험 토글·멈칫·슬로모·단서 시각이나 paper.js 종이 배치(받침과 나란히 눕힘이 첫 움직임을 숨김)를 바꾸면 check → 다르면 run 하고 §8.11 표 갱신. '보이는 첫 움직임'은 그려진 딱지(메시)로 잰다 — 게임 화면 수치(main.js expVisFrame)도 같음
tools/sweepgame.mjs  쓸기 이식 대조(+ 문법 D 절: DESK ≡ sim.js · GD 숫자 = `sweepgd report --json` 13개 버팀 · gdShot ≡ zeroShot · 돌풍 인라인 참조 · judgeDesk 독립 식 + 경계 장(책상·반지름 5) · main.js 정적 검사('zero' 직접 비교 ctlG 밖 0건 · 자체 책상·원 식 0건 + 검사기 음성 대조) · ref 에 gd 4칸(볼 포함) + D 비교 토글: 기본 조합 = 커밋 d2ebb42 주입 4칸 해시·칩(REF_GD_BEFORE) · 어려움 ≡ sweepgd armShot 'b' · 반지름 5 판정 = 독립 식 = sweepgd 줄 · GD_COMBO = report 4 조합 × 13개 버팀 · ref gdm = 조합마다 같은 칸): parity(sim.js blowProg ≡ simsweep 매 스텝 비트 + 고전 blow·blowLip) · chk(chk601 원자료 줄 대조) · ctl(엄지 표·따라가기·떼기 잠금·gesture.js ≡ gesture.mjs + 문법 B: GB ≡ sweepgb 고른 값·칩 · 휙 인식기 · GestureB(옆 흐름) · flick ≡ plan 비트 · 손 휙 = planShot · flickShot = 원자료 data/gb 줄 · gbChip ≡ chipOf) + 문법 C: GC ≡ sweepgc 상수 · a0Of 비트 · zero prog ≡ GcCtl prog 비트 · zeroShot ≡ gcShot·원자료 줄 · 눈금·엄지 식 표 · GC_LINES ≡ `sweepgc lines --json` · gcChip ≡ chipOf) · ref(주입 칸 Node 기준 + C 4칸 = gcShot 대조 + D 4칸(볼 포함), `--json` = { plan, gb, gc, gd, gdm }) · base(게임 고정 숨 기준선 보고). sim.js·sweep.js 바꾸면 parity·ctl 필수
tools/sweepplay.mjs  쓸기 연습판 브라우저 게이트(D (12): 설정·주입 4칸(볼 포함) = Node gdShot(책상)·인트로 동안 분필 원 숨김·손 경로 ① 톡 → ② 톡 → ③ 당겼다 놓기 = Node(되돌려 놓기 = 취소 · 시스템 취소 따로 · 오른쪽 단추 무시 · 다시 연 박자 '잠깐…')·배치 교차 0·같은 페이지 D → 홈 → C 분필 원·HUD 홈 왕복 4번 Rapier 월드 남음 0·레벨 분필 원 · (12e) 비교 토글: ⚙ 두 줄·저장·다시 열기·주소 · 조합마다 페이지 하나 주입 1칸 = Node gdShot(mode)·카드 조합 글·넓은 원은 반지름 5 만 · C 는 ?swg=c 로 · 가짜 시계 · `?norender` = 그리기만 끔, `window.__renderOnce` = 한 번 그림 · 눈금 탭 시각은 처리기 시각 `window.__sweepEvTs = false`): 주입 A 5칸·B 3칸 = Node 해시 · A(`?swg=a`) 합성 엄지·시범 툭 열림·넛지·취소·퍽 · B(10) 놓기만·한 획(🔁)·꽉 한 획 + 옆 흐름·놓고 0/0.3/0.6/1.0 s 휙 = Node·두 번째 휙·늦은 휙 창·'잠깐…'·머무는 손가락·탭·코치 말 순서·⚙ 문법 단추 · C(11, `?swg=c`) ⚙ 4+4+3 단추·저장·다시 열기·주입 4칸·영점 눈금(확대·준비 무시·꼭대기 출발 표본·띠 가운데 탭 − 16 ms·축소 뒤 '영점 다시')·시범 꽉·화살표 16°·한 획 = Node zeroShot·자동 쓸기·취소·영점 다시·띠/코치 숨 세기(문법별)·끌기(창 밖 톡 무시)·화면 끝 덧말·각도/세기 눈금(밀기·당김 무시·콜록 없음·눈금별 코치)·중간에 홈 · 보상 없음 · 레벨·일일 고전 · 실험 지연 무시 · 콘솔 오류 0, 약 6분. main.js 쓸기·frame 바꾸면 필수
tools/sweepgc.mjs  문법 C '영점 조준' Node 측정(게임 물리 그대로, 새 힘 0): self(α0 0 · θ 24 ≡ G.flickShot) · geo · run pilot·auto·map·held·floor(자동 시작 규칙 · s × q × θ 지도 · 보류 시드 · 바닥 모델 4개 — 바닥은 정직하게 못 잼 → 게임은 기둥만) · choose · same(원자료 비트 재현) · report · lines [--json](원인 칩 줄 = sweep.js GC_LINES) · chips(칩 근거: 손잡이를 지배 값으로 옮기면 더 넘기나 — 30·40장 map ≥ 75%·held ≥ 70%·높은 영점 zHigh ≥ 80% 판정), 원자료 coresweep/data/gc/ (core-sweep §4.1). sweep.js GC·칩 바꾸면 lines·chips·`sweepgame ctl` 필수
tools/sweepgb.mjs  문법 B '놓고 쓸기' Node 측정(게임 물리 그대로): self(기록 훅 ≡ planShot) · run sweep·grid·held·cue(휙 시각 산·D(q)·쓸기 속도/폭·단서 + 반응·기준선) · same(원자료 비트 재현) · report(⑩ 원인 칩 chipOf 포함), 원자료 coresweep/data/gb/ (core-sweep §4.1). sweep.js GB·칩 바꾸면 report·`sweepgame ctl` 필수
tools/sweepgd.mjs  문법 D '세 박자' Node 측정(게임 함수 그대로 G.gdShot·judgeDesk·gdZone·gdChip — 판정 식 다시 안 씀, 새 힘 0): self(gdShot ≡ zeroShot(q ≤ 1) · 돌풍 꼴 · 볼 ≡ θ 0 · 손잡이 샷 ≡ gdShot, 약 30초) · list · run held·knob·classic(보류 시드 40장 413~424 · 30장 613~624 한 손잡이 줄 + 칩 칸 · 숨 손잡이 (a)/(b)/(b2) · 고전 powercurve 경로 원 대 책상 = G15) · report [--json](줄 표 · 잠정 비교 = 게임 gdZone 칸 ↔ 측정 갈래 · 칩 근거 · G15 · 손잡이 초록 px · **비교 토글 4 조합**(같은 월드 책상 flip · 반지름 5 flipR × 숨 'a'·'b' → 조합마다 문턱 맞추기 · peak · 칩 · 돌풍 절벽 px, json combos)) · same(원자료 비트 재현 — 줄에 flipR·outR·ringR), 원자료 coresweep/data/gd/ (core-sweep §4.1 D, BLOCKERS G15). sweep.js GD 숫자·칩 바꾸면 `sweepgd report`(바꿈 0)·`sweepgame ctl` 필수 — 칩·칸이 줄에 기록되니 GD 를 옮기면 held·knob 다시 돌려 묶음(물리 칸은 비트 같아야)
tools/coresweep/react3.mjs  제트 도달 지연 회차(jetLag, 06 §8 — 판정 통과·물리 채택 아님, 솔로 시험 토글 있음 06 §8.11 → 채택은 재윤님 손맛 결정 G12): self3·list·run·choose3·verdict3·report, 단계·시드·동결을 코드가 강제(커밋된 choice3.json 없으면 평가·가드 거부), 원자료 coresweep/data/react3/. simsweep·ownclips·sweepmap·rules·sim 바꾸면 `node tools/coresweep/react3.mjs self3` 필수
native/puff_v2/ + scripts/flatfloor.mjs  정직 엔진(3D 제트) 평평한 바닥 게이트(run·report, 원자료 data/flatfloor/ → docs/research/v2-flatfloor.md). 고치면 `CARGO_TARGET_DIR=../puff_sim/target cargo test --release --offline`
tools/papercheck.mjs  종이 딱지 그림 게이트(진짜 paper.js · sim.js, 브라우저 없음, 약 30초): pile(가만히 쌓인 2~40장 × 5시드 이웃 장 테두리 36방향 최대 틈 ≤ 0.035 · 묻힌 장 0 · 얹힌 장 들림 0 · visY 대응표) · shot(쏜 뒤 6~22장 × 24판, 보이는 판 SDF: 뜬 장 ≤ 2% · 책상 밑 0, 빈 틈 받침 쌍은 참고) · THICK=1 = 예전 두꺼운 그림 기준선. paper.js·sim.js 바꾸면 필수
tools/paperphys.mjs  종이 딱지 물리 선택지(탄성 e 딱지+책상·밀도·공기 감쇠·정직한 가벼움) 측정만 — self·list·run drop|pile|game|sweep·report(DETAIL=1 장수별), 원자료 coresweep/data/paper/ (게임 기본값 무변경, core-sweep §7)
tools/enginecmp/ + docs/research/07-physics-engine-compare.md  물리 엔진 비교 Rapier ↔ Jolt(딱지를 물리까지 종이처럼 얇게 할 때만 필요한 결정, 재윤님 결정 BLOCKERS G14): 엔진 독립 어댑터(`adapters/` createWorld · PRESETS, 권고 프리셋 `jolt-fair-rsleep`) · 게임 바람 이식(`adapters/wind.mjs`, Rapier 0.12 위에서 sim.js 와 48/48 비트 동일) · 쌓기 A(더미가 서나)·쏜 뒤 B(5초 안 멈추나)·결정성 C(웹 WASM = x86 = ARM 해시)·속도 D · 공정성 점검 `audit/` · 네이티브 벤치·기기 간 해시(`native/`, `hashcmp.mjs`). Jolt 는 자체 빌드한 CPD(CROSS_PLATFORM_DETERMINISTIC) JoltPhysics.js 1.1.0(Jolt 5.6) WASM = `vendor/jolt-physics-1.1.0-cpd.wasm-compat.js.gz`(MIT, 처음 쓸 때 풀림, 다시 빌드 `native/build-jolt-cpd-wasm.sh` + `joltjs-cpd-glue.patch`) — 저장소 package.json 에 아무것도 안 넣음(npm Jolt·Rapier 0.21 은 스크래치에 깔고 `JOLT_NPM`·`RAPIER_PATH`). 명령(`cd tools/enginecmp`): `nice node compare.mjs anchor 10,20,30,40 1-12`(바람 이식 ≡ sim.js) · `nice node compare.mjs stack|shot|simshot|det|speed <태그> <설정들> [--hs 0.055] [--seeds …]` · `node audit/frontier.mjs 0.055`(엔진별 '서기 × 멈춤' 앞선 줄) · `node audit/cmphash.mjs <다시 돈 것> <원자료>` · `node cmpsum.mjs …` → data/cmp-summary.md, 원자료 data/cmp-*.json.gz(7,539판). 무거운 프로세스 1개씩(4코어). 결론: 물리까지 얇게 → Jolt(CPD), 보이는 것만 → Rapier 유지(지금). 게임 코드는 안 바꿈
tools/balloon-check.mjs  rules.js 숨 풍선(BALLOON·balloonCost·balloonStep) ≡ coresweep/econ.mjs 'new' 비트 대조(비용 격자·3판 DP) + econ gate 네 판정 (풍선 식·econ 바꾸면 필수, 1초)
tools/botlib.mjs / levelbot.mjs / calibrate.mjs  물리 봇 레벨 클리어율 측정·난이도 손잡이 자동 보정
tools/artifact-check.mjs  아티팩트(공개) 버전 부팅 재현 — 게시 전에 반드시 실행. claude 없음·use()=null·보기 전용 → PvP 숨김 / 가짜 호스트 → 'VS 친구'·방 만들기
tools/fake-claude.js · artifact-host.mjs  가짜 claude.ai 호스트(LocalNet 위에 db·room·user 모양) · 아티팩트 빌드 감싸기·CDN→node_modules (시험 전용)
tools/pvpsync.mjs  PvP 네트워크 없는 게이트: 궤적 크기·재생 끝=post·새 월드 재시뮬·판정 분포 (sim·rules·turn 바꾸면 필수)
tools/pvp-check.mjs  PvP 두 탭 3판 완주: 턴별 해시 100%·뒤 검증·검증 기록(E10)·상한 위반 0·콘솔 오류 0 (main.js PvP·net·pvp·turn 바꾸면 필수). NET=artifact = 아티팩트 빌드 + 가짜 호스트 · EXPFEEL=1 / QX= = 솔로 실험 토글을 켠 채(대결에 안 새는지)
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
  - 게임 진동 = 다리 `g:<route>:<id>:<ms>` → iOS 는 Core Haptics(tapLight·tapMedium·tapHeavy) 먼저 → 생성기 → 엔진(BLOCKERS G4). '게임 진동 길'(⚙ 소리·진동 시험, localStorage `puff.hapRoute` core|view, **끔은 이번 실행만**) · 예열 `w:` · Swift 엔진은 버리지 않고 멈춤 뒤 start() 만
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

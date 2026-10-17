// tools/coresweep/react3.mjs — 06 §8 제트 도달 지연(jetLag) 회차: 반응 시각만.
//   재윤님 2026-10-15 '4. 진행' → 새 사전 등록. 사전 등록 = 이 머리 주석 + 코드 + 시범 원자료(data/react3/pilot3.jsonl.gz). sel3 전에 커밋한다.
//   코드가 순서를 강제한다: sel3·eval3·gcore3·gsmall3 를 돌리는 run · choose3 · verdict3 는 FROZEN3(이 파일·simsweep·ownclips·sweepmap·rules·sim)이
//   HEAD 와 바이트까지 같을 때만 돈다. eval3·gcore3·gsmall3 는 커밋된(HEAD 와 바이트 동일) choice3.json 이 있어야 작업이 생긴다(list 도 거부).
//
// 🧭 가설(미검증): jetLag(바람이 입에서 더미까지 가는 시간, 화면 s/u. 물리 속도가 아니라 '실효 손잡이')를 넣으면 반응 시각(첫 움직임·위¼ 10°)만
//   실물 3판 쪽으로 옮겨진다. 20/30/40장 코어(튕김·위부터 벗겨짐)와 1~12장 작은 더미(게임 Table.blow 경로)는 v1 자리에 남는다.
//   → 판가름 = 새 보류 시드 473~496 의 S-T2(절대 오차 상한)와 가드 G-a·G-b. 해석 조건 S-T3(같은 크기 상수 지연 귀무 N0 보다 나은가)을 결과 이름에 늘 붙인다.
// 가설 수정(돌리기 전, 비판 반영 2026-10-15): '통과 = 더 정확한 물리'가 아니다. 설계 줄에서 도달 뒤 반응(첫 움직임 − 바람 도달 2.6/0.0/5.2 ms,
//   위¼ 10° − 첫 움직임 7.8/7.8/13.0 ms)은 jetLag 0~0.03 모두 v1 과 같다. 그래서 주 지표는 '손잡이가 정한 도달 시각 + v1 의 고정 반응'을 읽는다.
//   물리를 안 바꾼 귀무 'v1 + 상수 9스텝(23.4 ms)'도 E 10.4 · Emax 15.7 ms 다. 그래서:
//   (1) S-T1(v1 대비 개선)과 G-c(첨부3 굳지 않음)는 v1 이 세 판 모두 일찍 반응하고 jetLag 가 들기를 줄이지 않아 사실상 떨어질 수 없다 → '배관 점검'이라 부른다.
//   (2) 상수 지연 귀무 N0 와 구별되는지(S-T3)를 사전 등록하고 결과 이름에 늘 적는다. (3) '4 m/s' 는 중심 규칙에 따라 정해지는 실효 값이다(■ 1).
//   (4) 게임의 주 장수(레벨 3~22장)와 숨 규칙 구간(약함·돌풍)을 문턱 있는 보고 줄 R-mid·R-rule 로 더한다(재윤님이 정한 가드 범위 1~12 는 그대로).
//   밝힘: 0.02 근처가 맞는다는 것은 1차(cal401, 같은 3판)에서 이미 봤다. 새 시드는 시드 견고성만 시험한다. 그래서 주 지표 통과는 거의 예정돼 있다(■ 7).
//
// ■ 1. 바꾸는 것: simsweep.js 연구 손잡이 jetLag (tune 으로만 · TUNE 에 없음 · mockup/src/sim.js 안 바꿈)
//   - 뜻: 지금 딱지에 닿는 공기는 '그 딱지까지 제트 축 거리 a × jetLag' 전에 입에서 나온 공기다.
//     0.02 화면 s/u = 실물 6.23 ms / 25 mm ≈ 4.0 m/s 는 '실효' 값이다(어림·측정 아님, 아래 중심 규칙 몫 때문에 규칙에 따라 달라짐).
//   - prog 경로(1차부터, 그대로): 딱지마다 prog(t − a·jetLag) 의 입 자리·제트 방향·세기.
//   - 상수 자세 경로(이번에 더함 = 게임이 쏘는 Table.blow: 기본 blow(눈높이) · blowLip(책상 입, mouthY)):
//     자세가 늘 같으니 늦는 것은 세기뿐이다. 딱지마다 te = t − max(0, a)·jetLag 로
//       te < 0 → 그 딱지는 건너뜀(아직 공기 없음, 0 충격도 안 줌)
//       0 ≤ te < puffDuration → v1 봉투 sin(π·te / puffDuration)
//       te ≥ puffDuration → 세기 0(끝난 숨. v1 은 이 구간의 봉투를 평가한 적이 없다)
//     숨은 puffDuration + 12·jetLag 까지 이어진다(prog 와 같은 꼬리 = 축 거리 12 u 의 마지막 공기까지).
//     잠든 8차 blowTable(반사 바람)은 미지원: 직선 축 거리가 반사 경로 길이가 아니다 → jetLag 와 함께면 throw(self3 b).
//   - a = 숨 시작 자세 기준 제트 축 위 '딱지 중심'까지 거리(prog 경로와 같은 규칙). 맞은 점이 아니라 중심을 쓰는 까닭:
//     (1) prog 경로와 같은 뜻이다. 그래서 1차 수치(위¼ 10° 46.7/36.4/41.4 ms)를 그대로 이어받고,
//         blowLip + 지연 ≡ 같은 입·각의 상수 prog(봉투 끝 뒤 0) + 지연이 비트 동일하다(self3 b 9/9).
//     (2) 맞은 점은 자세에 따라 정해진다(prog 는 지연된 자세). 중심은 순환 없이 정의된다.
//   - 중심 규칙의 대가(밝힘): 기둥의 장들은 중심이 맞은 점보다 약 1 u 멀어서 모든 장에 거의 같은 +1 u × jetLag 가 더해진다.
//     손잡이가 하나라 이 상수 몫을 기울기와 따로 흡수하지 못하고, 그 몫은 고른 값을 낮추는 쪽으로 치우친다.
//     설계 줄: 두 손잡이(jetLag + 상수 c) 최선 = 0.03 − 5스텝(E 4.8) ↔ 한 손잡이 0.02(E 6.5). 맞은 점 규칙이었다면 고른 값은 0.03(≈ 2.7 m/s) 쪽이었을 것이다(어림).
//     맞은 점 규칙 변형은 이번에 재지 않는다(simsweep 을 더 바꿔야 함). 게임 화면 지연은 두 규칙이 비슷하다(어림: 0.02 × 3.6 u ≈ 72 ms · 0.03 × 2.6 u ≈ 78 ms 화면).
//   - 키가 없거나 0 이면 새 분기를 전부 건너뜀(비트 동일). 점검:
//     sweepmap verify 9/9 · ownclips self 6/6 · self2 6/6 · calreport2 출력 = 커밋된 calreport2.txt(바이트 동일) · calreport(cal401·eval413·pilot3) 출력 = HEAD 판과 같음
//     · 고치기 전(HEAD) simsweep 과 84/84(설계 시드 361~363: prog 3판 jetLag 0~0.03·1차 쿠션 칸 45, 코어 튕김 15, 상수 자세 jetLag 없음/0 24, 레포 밖 1회 점검)
//     · 설계 원자료 다시 돌리기 바이트 동일(작은 더미 720 · 첨부3 30 · 코어 튕김 72) · self3 (a)~(g) · git diff mockup/src/sim.js 비어 있음.
//   - ownclips.mjs 변경: shotO(job, obs) 에 읽기만 하는 관찰자 자리(obs?.start · obs?.step · r.rx)만. obs 없으면 옛 줄과 바이트 동일(self 6/6, self3 d).
//
// ■ 2. 주 지표 = 반응 시각만 (첨부 1·2·3, ownclips 'r' 재생 그대로)
//   - 옮김: 사전 등록 칸 flat 제트 · q 0.85 · 15장 · cal 1 · spec {kin 'r', P = K = B = 판}(1·2차와 같음).
//     시각 원점 = 숨 시작(영상 onset 프레임 = prog t 0). 실물 시각도 숨 시작 기준이다(06 §2).
//   - 첫 움직임 FM: 숨 시작 뒤 어떤 딱지든 테두리 점(위·아래 면 × 16 방향)이 숨 시작 때 자리에서 '옆모습 평면'(세로 y · 부는 축 z)으로
//     0.03 u 이상 움직인 첫 스텝. 영상 판독(06 §1·§2: 고정 옆 카메라, 프레임 차분)과 맞춘 점:
//     (i) 프레임 차분은 더미 어디든 처음 바뀐 곳을 잡는다 → 모든 딱지·모든 테두리 점(들림과 미끄러짐 모두)
//     (ii) 옆 카메라는 깊이(x) 이동을 못 본다 → y·z 평면만
//     (iii) 0.03 u ≈ 2 px(D 125~135 px → 1 u ≈ 63~68 px)
//     1 px(0.015 u)를 안 쓰는 까닭: 정착한 v1 더미는 숨 없이도 기어간다(settle 은 속도 < 0.06 u/s 에서 멈춤).
//       설계 시드 '숨 없음' 대조(15장 30시드, 2 s): 1 px 는 29/30 시드가 12스텝(31 ms)부터 넘는다 = 공기가 아니라 기어감을 잰다.
//       2 px 는 3/30 시드가 41스텝(106 ms) 이후에만 넘고, 4 px 는 0/30 이다. 후보들의 첫 움직임은 모두 20스텝 안이다.
//     민감도(보고만): 1 px · 4 px · 위¼ +1°(숨 시작 대비).
//   - 위¼ 10° T10: ownclips quarters() 와 같은 식(쌓은 순서 위 ¼ = 15장 중 위 3장의 '그림 아래' 기준 기울기 평균)이 10° 에 닿은 첫 스텝.
//     ownclips 는 2스텝마다 재지만 여기는 매 스텝 잰다(self3 d: 매 스텝 값 ≤ 2스텝 표본 ≤ +1스텝).
//   - 저장: 관찰자 rx 에 정수 스텝(fm·fm1·fm4·t10·t1·arr, 안 일어남 = −1 → 분석에서 ∞) + q3max(°).
//     toFixed 반올림을 안 쓴다(2차 F2 경계 문제: t10 이 toFixed(3) 으로 저장돼 52.03 ms 가 됨).
//     ms 는 보고 때만 = k × (1/120 화면 s) ÷ 3.21 × 1000 = k × 2.596 ms(영상 1프레임 4.17 ms 보다 촘촘).
//   - 실물(06 §2, 숨 시작 뒤 ms): FM 40 / 24(판독 23~25) / 18 · T10 52 / 42(약) / 32. 실물 오름(T10 − FM) 12 / 18 / 14.
//   - E = 여섯 칸(세 판 × FM·T10) |시드 중앙값(ms) − 실물| 의 평균. Emax = 여섯 칸 중 최대.
//     ΔE(A − B) 짝 붓스트랩: 같은 시드 표본(복원 추출 2,000회, mulberry32 20261015)으로 두 줄의 중앙값·E 를 함께 다시 계산, 95% 백분위.
//     ∞(안 일어난 칸)가 끼면 구간을 계산하지 않고 그 조건은 실패로 적는다(이름에 '안 일어난 칸 ∞').
//   - 귀무 N0 = v1 의 시각 + c 스텝(세 판·두 시각 모두 같은 c, c ∈ 0~30 정수 = 0~78 ms). 물리를 안 바꾸고 시계만 옮긴 줄이다(06 §6 소리·영상 동기 오차와 같은 꼴).
//     c 는 sel3 에서 jetLag 와 같은 규칙(E 최소, 0.1 ms 반올림, 같으면 작은 c)으로 고르고 choice3.json 에 함께 커밋한다.
//
// ■ 3. 격자·시드·단계 (허용 시드 밖이면 jobs3 가 throw · 일꾼 ≤ 2)
//   - 격자 jetLag ∈ {0(= v1, 키를 아예 안 넘김), 0.01, 0.015, 0.02, 0.025, 0.03}. 후보는 0 을 뺀 5개.
//   - 소진(어떤 단계도 못 씀, assertSeeds3): 401~460 · 601~612 · 901~912. 설계 361~390(probe3, 이미 봄). 시범 391~393(pilot3, 구현 점검만).
//   - 새 블록: 고르기 sel3 461~472(12) · 평가(보류) eval3 473~496(24) · 코어 가드 gcore3 625~636(12) · 게임 경로 가드 gsmall3 641~664(24).
//     제안된 코어 가드 621~632 에서 621~624 를 뺐다. vf/*601(20/30/45장)·f2/econ601(2~45장) v1 원자료와 겹친다.
//   - 거부하는 환경 변수: SEEDS · CHOICE · JSTAR · WEAK_ZERO · WEAK_FLOOR · WEAK_EXP · BLAST_SPAN(rules.js 숨 규칙 env 손잡이). KEYS 는 이어 돌리기용(완전성 단언이 빠진 줄을 잡음).
//   - 단계(샷 수 · 2 일꾼 어림):
//     pilot3 195(약 1분) → [사전 등록 커밋] → sel3 216(약 20초) → choose3 → [choice3.json 커밋] → eval3 432(약 1분)
//     · gcore3 1,512(약 8분) · gsmall3 15,264(약 25분) → verdict3 → [verdict3.json 커밋]
//     pilot3 = 391~393 격자 × 3판 54 + 391 v1·0.02 의 코어 12(relfix q0.85 h0.5·튕김) · 게임 1~22장 78(조준 0.82 옆 0, eye·low) · 숨 규칙 24(4·12·18장 × 비율 4)
//       + 1차 시범 재실행 27(calib/pilot3 'pilot|v1'·'jl0.02|tc3|cf0.15'·'jl0.02|tc8|cf0.15' 와 같은 job).
//       bitcheck3 p: 재실행 27/27 + pilot3|j0 ≡ 1차 v1 9/9(rx·key·spec·tune 뺀 모든 필드). prog 경로 jetLag 가 1차 그대로인지 소진 시드 없이 확인한다.
//     gsmall3 = 시드마다·v1 과 J* 마다 게임 1~22장 234(eye 22장 · low 6~22장 × 조준 6) + 숨 규칙 84(2~22장 × 비율 4)
//     시범 뒤 동결: 격자·TOL·식·시드·판정 코드. 이후에는 비트 점검을 되살리는 버그 수정만 허용(고치면 그 커밋 뒤에 돌림 — FROZEN3 단언).
//   - eval3 은 격자 6값을 모두 돌린다(용량-반응·판 하나 빼기·두 손잡이 보고). 판정은 v1·J*·N0 줄만 쓴다.
//
// ■ 4. 고르는 규칙(choose3, sel3 12시드만 · 배율 3.21)
//   - J*: 후보 5개 중 E(12시드 중앙값)가 가장 작은 값(0.1 ms 로 반올림해 비교). 같으면 작은 jetLag(v1 에 가까운 쪽).
//   - N0 의 c: 같은 시드·같은 규칙으로 E(v1 + c) 최소, c ∈ 0~30, 같으면 작은 c.
//   - 가드는 고르기에 안 쓴다. 가드는 고른 값 하나만 잰다. 가드가 깨지면 다시 고르지 않고 실패다.
//   - choice3.json 이 이미 있고 다르면 choose3 가 throw(다시 고르기 금지). 배율 2.9·3.6 에서 고를 값은 bySlow 에 적기만 한다.
//
// ■ 5. 판정(verdict3, 커밋된 choice3.json 의 J*·c). 'SUCCESS' 라는 이름은 안 쓴다.
//   판정(앱 시험 토글 단계로 가는가) = S-T1(배관) ∧ S-T2 ∧ G-a ∧ G-b ∧ G-c(배관).
//   - S-T1(배관 점검) 개선 방향: eval3 24시드 ΔE(v1 − J*) 95% 짝 구간 하한 > 0. v1 이 세 판 모두 일찍 반응하므로 어떤 지연이든 거의 통과한다.
//   - S-T2 절대 오차: E(J*) ≤ 10 ms(영상 약 2.4프레임) ∧ Emax(J*) ≤ 20 ms(약 5프레임). v1 은 설계 시드에서 24.7 / 39.0 ms.
//     '이 문턱이 격자 안에서 가른다(0.03 이 떨어짐)'는 배율 3.21 에서만 맞다(배율 3.6 이면 0.03 도 E 7.3 으로 통과, ■ 9).
//   - G-a 코어(gcore3 625~636, 20/30/40장, ownclips gate 와 같은 job = sweepcheck v|relfix 4×5 + 튕김 regCell, J* 대 v1 같은 시드):
//       a1 튕김 원 안 뒤집힘 평균비 J*/v1 ≥ 0.9(10% 넘게 잃으면 깨짐)
//       a2 튕김 ÷ 최선 고정(최선 고정은 조건마다 같은 시드에서 고름 = 1·2차 정의) J* ≥ v1 − 0.2
//       a3 위부터 벗겨짐 비율(21샷 × 12시드 = 252샷) J* ≥ v1 − 0.10. 30·40장만, 20장은 보고만.
//          정의 = 어디든 넘김 ≥ 1 ∧ 책상 밖 0 ∧ 위 반 > 아래 반 ∧ 맨 아래 장 최대 상승 < 0.5 u
//          (06 §7.7 gate2 정의. 커밋된 eval413 v1 40장에서 71%, 위/아래 반 17.1/4.9장 — 문서 값과 같음)
//   - G-b 작은 더미(gsmall3 641~664, 1~12장, 게임 경로 shotG, J* 대 v1 같은 (장수, 시드, 조준) 짝):
//       shotG = turn.js fire() 기하(정규 방향 −z, 곡면 위 c − D·√(1−lat²) + side·lat) · 초록 숨(정답 × 0.89 → resolveShot 이 물리 세기 PS)
//         · 조준 높이 꼭대기 × 0.6/0.82/0.95 × 옆 0/0.4 · 자세 eye(blow 기본) 1~12장 + low(blowLip, mouthY 0.15) 6~12장
//         · PvP stepJudge·judgeResult 판정(원 안 그림 위). v1 은 mockup/src/sim.js 와 비트 동일(self3 e).
//       묶음(eye 1~4·5~8·9~12, low 6~8·9~12)마다:
//         b1 원 안 뒤집힘 평균 J* ≥ 0.9 × v1 · b2 책상 밖 비율(장당) J* ≤ v1 + 1%p · b3 원 밖 비율(장당, 책상 밖 포함) J* ≤ v1 + 3%p
//   - G-c(배관 점검) 첨부3 굳지 않음: eval3 J* 첨부3 위¼ 최대 기울기(매 스텝) 시드 중앙값 ≥ 10°(2차 F1 의 반대). jetLag 는 들기를 줄이지 않아 사실상 떨어질 수 없다.
//   - 완전성(판정 전 단언, 아니면 throw): eval3 v1·J* × 3판 × 정확히 473~496 · gcore3 장수·jetLag 마다 21 job × 정확히 625~636
//     · gsmall3 묶음마다 (장수 × 조준 6 × 정확히 641~664) 줄이 v1·J* 둘 다 있고 짝이 맞음(1~12 · 13~22 · 숨 규칙 모두).
//   - 문턱은 '깨짐'의 크기로 정했다(튕김 10% 손실, 튕김 우위 0.2, 벗겨짐 10%p, 작은 더미 10% 손실, 책상 밖 1%p, 원 밖 3%p).
//     설계 시드 붓스트랩에서 잡음만으로 문턱을 넘을 확률은 ■ 9 에 적었다(가장 큰 것: a2 40장 약 1.4%).
//   - 가드는 점 추정 문턱이다(구간 판정 아님). '깨짐 없음'을 증명하지 않는다. 문턱 근처 결과도 그대로 적는다.
//   해석 조건(판정을 안 바꿈, 결과 이름에 늘 붙음):
//   - S-T3 상수 지연과 구별: eval3 같은 시드 짝 붓스트랩 ΔE(N0 − J*) 95% 하한 > 0. O 면 '도달 시각이 축 거리에 비례한다'는 손잡이의 모양이
//     같은 수의 손잡이(상수 c 하나)보다 실물 3판에 더 맞는다. X 면 이 회차의 반응 시각 개선은 '시계를 c 만큼 늦춘 것'과 구별되지 않는다.
//   보고 문턱 줄(문턱은 G-b 와 같음, 판정 밖 — 재윤님이 정한 가드 범위 1~12 를 넓히지 않으려고. 결과 이름과 G12 메모에 O/X 로 늘 적음):
//   - R-mid 게임 13~22장(레벨 3~22장 중 30판 뒤 대부분, levels.js): eye·low × 13~17·18~22 네 묶음, 조준·숨·판정은 G-b 와 같음.
//   - R-rule 숨 규칙 구간: 눈높이 · 조준 0.82 · 옆 0 · 비율 0.6(약함)·1.05·1.1·1.2(돌풍) × 2~12·13~22장 여덟 묶음.
//       b1 만 허용 손실 = max(10%, 0.25장/샷)(약함·센 돌풍은 v1 이 샷당 0.3~1.3장이라 비만 쓰면 잡음, ■ 9). b2·b3 는 G-b 와 같음.
//       돌풍의 조준 흔들림 난수 = mulberry32((시드 × 7919) ^ (장수 × 104729) ^ round(비율 × 1000)) → J*·v1 짝이 같은 흔들림.
//
// ■ 6. 보고만(판정을 안 바꿈)
//   - 세 판 순서(FM·T10 1 > 2 > 3) · 15장 장수(어디든 그림 위) · 용량-반응(eval3 격자 6값)
//   - 첫 움직임 민감도(1 px·4 px·위¼ +1°) · 바람 도달 스텝(arr = 처음 세기 > 0)
//   - 도달 뒤 반응: 판마다 시드 중앙 (FM − 도달) · (T10 − FM) — 실물 오름 12/18/14 ms 와 나란히(역학이 안 바뀜을 숫자로)
//   - 실물 백분위: 칸마다 실물 값이 시뮬 시드 분포의 몇 번째인지(실물은 판마다 n = 1)
//   - 판 하나 빼기: 남은 두 판 4칸으로 jetLag(후보 5)와 귀무 c 를 각각 고르고 뺀 판 2칸 평균 오차를 예측
//   - 두 손잡이(jetLag + 상수 c ∈ −10~30)의 최선 — 중심 규칙 상수 몫의 크기
//   - 배율 민감도: SLOW 2.9 / 3.21 / 3.6 에서 v1·J*·N0 의 E, 그리고 sel3 에서 그 배율로 골랐을 값(choice3.bySlow)
//   - 게임 경로 화면 지연(작은 더미 첫 움직임, 화면 ms) · 코어 21샷 평균·책상 밖 · 20장 벗겨짐
//
// ■ 7. 사전 예측(설계 시드 361~390 탐침 + 붓스트랩 흉내. 같은 시드 풀이라 낙관 쪽)
//   - 파이프라인 흉내(설계 풀에서 고르기 12 · 평가 24 시드 복원 추출 300회): J* 0.02 72% · 0.025 28% · c 9 66% · 8 34%.
//   - S-T1(배관) 100% · S-T2 99.7% · S-T3 100%(설계 0.02: ΔE(N0 − J*) 3.9 [3.0, 4.3] ms, 0.025: 3.8 [2.5, 4.0]).
//   - 가장 큰 오차는 첨부3 첫 움직임(0.02 에서 실물보다 약 +10 ms 느림).
//   - 순서는 실패(흉내 FM 4%, T10 0%). 첨부3 은 입이 꼭대기 위(1.42 H)라 v1 에서도 위¼ 반응이 가장 늦다(v1 20.8 ms).
//     jetLag 는 세 판에 거리만큼 비슷한 지연을 더하므로 이 순서를 고치지 못한다.
//   - 도달 뒤 반응은 v1 그대로(FM − 도달 2.6/0.0/5.2 · T10 − FM 7.8/7.8/13.0 ms, 실물 오름 12/18/14) — 역학은 못 고친다.
//   - 가드 통과 약 97%(가장 큰 위험 = a2 40장 최선 고정 고르기 잡음). 코어·작은 더미는 v1 과 거의 같다(■ 9).
//   - 합쳐서 판정 통과 약 90~97%. 15장(보고만): 첨부1 약 7장(v1 6.2), 다 넘김 아님 — 장수 문제는 그대로.
//   - R-mid(보고 문턱) 깃발 약 0%(설계 묶음 비 0.99~1.01. 다만 장수별로는 눈높이 22장 · 옆 0 이 0.923 — 묶음 평균이 가림, 장수별 최저 비를 보고).
//     R-rule(보고 문턱) 깃발 약 55%(0.02 면 43% · 0.025 면 87%, 설계 붓스트랩 24시드). 거의 모두 비율 1.2 · 2~12장의 원 밖 증가다
//     (설계 48.6% → 51.5%(0.02, +2.9%p) · 52.3%(0.025, +3.7%p), 문턱 +3%p). 돌풍에서 날아가는 딱지가 봉투를 늘려 받는 몫으로 본다(미검증).
//   - 게임 경로 화면 지연: 첫 움직임 v1 25 ms → 0.02 100 ms(화면, +75 ms ≈ 실물 23 ms), 0.03 133 ms.
//
// ■ 8. 통과·실패 뒤 할 일
//   - 판정 통과 + S-T3 O: 이름 = "반응 시각 통과 · 가드 유지(물리 채택 아님) | 해석 S-T3 … O | 보고 문턱 …". 다음은 앱에 jetLag 켜고 끄는 시험 토글
//     (기본 끔, sim.js 기본값 그대로). 재윤님이 손맛(입–더미에서 화면 약 75 ms 더 늦게 들림)을 보고 게임 물리에 넣을지 정한다(BLOCKERS G12).
//   - 판정 통과 + S-T3 X: 토글은 '지연 손맛 시험'으로만 만든다. 반응 시각 개선이 상수 지연과 구별되지 않으므로 jetLag 를 물리 근거로 적지 않고,
//     넣기로 하면 상수 지연(더 단순)과 함께 재윤님께 고르게 한다.
//   - 보고 문턱 R-mid·R-rule X: 판정은 그대로. G12 메모에 '어느 구간이 깨지는지'를 적고, 게임 물리에 넣기 전에 그 구간(레벨 보정·powercurve)을 따로 계획한다.
//   - 넣기로 하면 sim.js·PvP 해시(simVersion)·네이티브(Rust) 대조·레벨 보정(calibrate)·숨 곡선(powercurve)을 따로 계획한다.
//   - S-T2 실패: 1차의 '반응 시각을 옮긴다'가 시드에 견고하지 않다 → 토글을 만들지 않고 06 §8 에 기록.
//   - 가드(G-a·G-b) 실패: 반응 시각은 옮기지만 게임 물리를 깬다 → 토글을 만들지 않고 어디가 깨졌는지 기록(재윤님 결정 사항).
//   - 어느 쪽이든 같은 3판으로 jetLag 를 다시 고르는 다음 회차는 재윤님 결정 없이 열지 않는다. 461~496·625~636·641~664 는 이 회차 뒤 소진.
//
// ■ 9. 설계 시드 탐침 (361~390, 문턱 정하기만 — 이 수치로 판정하지 않음)
//   원자료 data/react3/probe3_take·core·small·mid·rule .jsonl.gz (540 · 2,268 · 10,260 · 10,800 · 7,560샷). 지금 코드로 일부(첨부3 30 · 코어 튕김 72 · 작은 더미 720)를
//   다시 돌려 줄마다 바이트 동일. 다시 보기 = report / dry3 (아래 ■ 11).
//   반응 시각(3판 × 30시드, 실물 ms, 시드 중앙값 · 첫 움직임/위¼ 10° · 실물 40/52 · 24/42 · 18/32):
//     jetLag   첨부1        첨부2        첨부3        E     최대   ΔE(v1−칸) [95%]      ΔE(N0−칸) [95%]   첨부3 위¼ 최대  15장(보고만)
//     0(v1)    5.2/13.0     2.6/10.4     7.8/20.8     24.7  39.0   —                    —                 145°            6.2/8.7/1.2
//     0.01     20.8/28.6    15.6/23.4    20.8/31.2    12.2  23.4   12.5 [10.4, 13.4]    −1.8 [−2.2, −0.4]  139°            5.8/8.7/1.3
//     0.015    28.6/36.3    20.8/28.6    23.4/36.3     8.9  15.7   15.8 [13.4, 16.9]     1.5 [1.5, 2.4]    137°            7.1/8.5/1.0
//     0.02     36.3/44.1    26.0/33.7    28.6/38.9     6.5  10.6   18.2 [14.9, 19.3]     3.9 [3.0, 4.3]    135°            7.2/8.7/1.0
//     0.025    44.1/51.9    31.2/38.9    31.2/44.1     6.6  13.2   18.1 [13.8, 19.2]     3.8 [2.5, 4.0]    139°            6.5/8.6/1.1
//     0.03     51.9/57.1    36.3/44.1    36.3/48.0    11.0  18.3   13.7 [9.0, 15.2]     −0.5 [−2.5, 0.1]  132°            5.6/8.1/1.0
//     N0 v1+9  28.6/36.3    26.0/33.7    31.2/44.1    10.4  15.7   (귀무, 30시드에서 E 최소 c = 9스텝 = 23.4 ms)
//     0.02 민감도: 1 px 36.3/26.0/26.0 · 4 px 38.9/28.6/31.2 · 위¼ +1° 38.9/28.6/31.2 · 바람 도달 33.7/26.0/23.4 ms(문턱을 바꿔도 ±1스텝)
//     도달 뒤 반응(모든 jetLag 같음): FM − 도달 2.6/0.0/5.2 · T10 − FM 7.8/7.8/13.0 ms (실물 오름 12/18/14)
//     판 하나 빼기(뺀 판 2칸 평균 오차): 1번 jetLag 0.015 13.5 · N0 +5 23.9 | 2번 0.02 5.1 · +5 13.5 | 3번 0.025 12.6 · +13 23.0 ms
//     두 손잡이 최선: 0.03 − 5스텝 E 4.8 · 배율 2.9: 고를 값 0.02(E 6.2, 0.03 E 15.9) · 배율 3.6: 고를 값 0.025(E 5.8, 0.03 E 7.3 = S-T2 통과)
//     실물 백분위(0.02, 361~384): 1번 100%/100% · 2번 0%/100% · 3번 0%/0% — 시드 퍼짐이 오차보다 좁다(실물이 분포 밖)
//   코어(361~372, 12시드, v1 → 0.02 / 0.03): 튕김 원 안 · 튕김 ÷ 최선 고정 · 위부터 벗겨짐
//     20장 14.3 → 14.6 / 14.4장(비 1.02 [0.98, 1.05]) · 0.93 → 1.04 / 1.02 · 58% → 57% / 56%
//     30장 20.7 → 20.4 / 20.0장(비 0.99 [0.96, 1.01]) · 1.09 → 1.15 / 1.11 · 67% → 65% / 65%
//     40장 25.3 → 25.0 / 25.3장(비 0.99 [0.96, 1.01]) · 1.38 → 1.35 / 1.35 · 75% → 73% / 73%
//     잡음만으로 문턱을 넘을 확률(시드 붓스트랩 4,000회, 0.02): a1 0% · a2 20/30/40장 0/0/1.4% · a3 0%
//   작은 더미(30시드 × 조준 6, v1 → 0.02 / 0.03): 원 안 비 0.99~1.00 · 책상 밖 ≤ 0.2%(변화 ≤ 0.1%p) · 원 밖 변화 ≤ +0.6 / +0.8%p
//     eye 1~4 1.83 → 1.82 / 1.82장 · 5~8 4.23 → 4.17 / 4.21 · 9~12 6.01 → 5.98 / 5.97 · low 6~8 3.95 → 3.93 / 3.91 · 9~12 5.19 → 5.15 / 5.15
//     첫 움직임(화면 ms): eye 1~4 42 → 108 / 150 · 나머지 25 → 100 / 133
//   게임 13~22장(R-mid, 30시드 × 조준 6, v1 → 0.02 / 0.025): 원 안 비 0.99~1.01 · 책상 밖 ≤ 0.2% · 원 밖 변화 ≤ +0.5%p(모두 O)
//     eye 13~17 6.67 → 6.70 / 6.65 · 18~22 5.55 → 5.50 / 5.50 · low 13~17 5.58 → 5.58 / 5.59 · 18~22 5.19 → 5.20 / 5.16장
//     장수별(보고만, 옆 0 만): 눈높이 22장 0.923(0.02) · 0.946(0.025) — 비판 검토가 본 값과 같음. 조준 6 전체로는 22장 0.976.
//     첫 움직임(화면): 25 → 100 / 117 ms
//   숨 규칙(R-rule, 30시드, 눈높이 · 조준 0.82 · 옆 0, v1 → 0.02 / 0.025): 원 안 · 원 밖(장당)
//     0.6  2~12 0.79 → 0.80 / 0.82 · 0.4% → 0.4 / 0.3%   13~22 0.32 → 0.29 / 0.31 · 1.7% → 1.8 / 1.8%
//     1.05 2~12 4.20 → 4.26 / 4.23 · 11.0% → 10.4 / 10.7% 13~22 6.03 → 6.18 / 6.14 · 14.3% → 14.5 / 14.4%
//     1.1  2~12 3.66 → 3.58 / 3.66 · 14.5% → 15.6 / 15.4% 13~22 4.76 → 4.76 / 4.78 · 20.3% → 21.1 / 21.2%
//     1.2  2~12 0.57 → 0.59 / 0.58 · 48.6% → 51.5 / 52.3%(X) 13~22 1.24 → 1.34 / 1.33 · 36.0% → 37.8 / 38.7%
//     R-rule b1 의 절대 바닥(0.25장)은 이 탐침을 본 뒤 정했다(밝힘): 10% 비만 쓰면 0.6 · 13~22(v1 0.32장)에서 잡음만으로 45% 깃발.
//     바닥을 넣은 뒤 남는 깃발은 비율 1.2 · 2~12 원 밖(진짜 이동)뿐이다. G-b·R-mid 의 b1 은 그대로(0.9 비).
//   배관 점검 dry3(위 설계 줄을 그대로 choose3·verdict3 에 넣음, 판정 아님): 고를 값 0.02 · c 8(361~372) · 0.02 통과(E 6.5 · 최대 10.6, 가드 모두 O, S-T3 O 4.1 [3.2, 4.5])
//     · 0.03 은 S-T2 실패(E 11.0 > 10)·S-T3 X(−0.3 [−2.7, 0.3]) → 배율 3.21 에서는 절대 오차 문턱이 격자 안에서 실제로 가른다.
//
// ■ 10. 위험·밝힘
//   - 같은 3판(n = 1씩)에서 1차가 0.02 를 이미 봤다 → 주 지표 통과는 거의 예정돼 있다(■ 7). 실물 근거가 아니라 시드 견고성이다.
//   - 통과는 '더 정확한 물리'가 아니다(가설 수정). 도달 뒤 반응·오르는 속도(FM → 10° 시드 중앙 7.8/7.8/13.0 ms, 실물 12/18/14)는 안 바뀐다.
//     S-T3 O 여도 말할 수 있는 것은 '축 거리 비례 지연이 상수 지연보다 3판에 더 맞다'까지다.
//   - 실물 시각은 판독 합의값(±1프레임 4.2 ms)이다. 2번 FM 은 23~25, T10 은 '약'. 소리·영상 동기 오차(06 §6)는 모든 시각에 같은 Δ 로 들어갈 수 있다 — 바로 N0 의 꼴이다.
//   - 실물은 판마다 n = 1 인데 E 는 시드 중앙값과 비교한다. 설계 줄에서는 시드 퍼짐이 오차보다 좁아 실물 값이 대부분 시뮬 분포 밖이다(백분위 보고).
//   - 배율 SLOW 3.21 은 D 4~6 cm 때문에 2.9~3.6(±10%)이다. 고른 값(J*·'4 m/s')과 '0.03 이 떨어진다'는 배율에 따라 바뀐다(■ 9, 배율 민감도 보고).
//   - 4 m/s 는 중심 규칙 몫(+1 u)이 섞인 '실효' 값이다. 맞은 점 규칙 변형은 재지 않았다. 실제 숨 제트 속도와 대조하지 않았다(미검증).
//   - 얼린 경로 근사: prog 경로는 a 를 '받는 순간의 자세(o0·d0)'로 잰다. 입이 움직이는 판(1번 입술 앞으로 0.9 D, 3번 0.57 D까지)에서는
//     공기를 내보낸 자세 기준 축 거리와 최대 약 0.5 u(0.02 에서 실물 약 3 ms, 비판 검토 어림·미검증) 다르다. 게임(상수 자세)에는 이 오차가 없다 → 3판에서 고른 값이 게임으로 옮겨질 때 작은 편향.
//   - 멀어지는 딱지의 봉투 늘림: te = t − a·jetLag 라서 축 방향으로 v 로 멀어지는 딱지는 봉투를 1/(1 − v·jetLag) 배로 늘려 받는다(상대 속도에 따른 감소 없음).
//     v1 힘의 시간 적분이 달라진다. 돌풍(날아가는 딱지)에서 가장 크다 → R-rule 로 본다.
//   - jetLag 는 숨 꼬리를 12·jetLag 늘린다(0.02 → 화면 0.24 s). 게임 판정 시각·PvP 궤적 길이·돌풍 텀블 난수 소비 순서(도달 전 건너뜀·꼬리)가 달라진다.
//     토글 단계에서 PvP 해시·네이티브(Rust) 대조를 따로 한다.
//   - 코어 가드는 sweepmap 'c' 문법(prog 경로)이다. 게임 경로(상수 자세)는 1~12장(G-b)과 13~22장(R-mid, 판정 밖)만 본다. 23~40장 게임 샷은 안 잰다.
//   - 가드는 점 추정이다(12·24시드). '깨짐 없음'을 증명하지 않는다.
//
// ■ 11. 명령 (D = tools/coresweep/data/react3, CPU 4코어 공유 → 일꾼 2)
//   node tools/coresweep/react3.mjs self3                           자체 점검 (a)~(g), 약 10초. 먼저 sweepmap verify · ownclips self · self2
//   STAGES=<단계> node tools/coresweep/react3.mjs list               단계마다 샷 수(돌리기 전 라우팅 확인. eval3·gcore3·gsmall3 는 커밋된 choice3 없으면 거부)
//   STAGES=probe3 PARTS=take|core|small|mid|rule LAGS=0,0.02 node tools/coresweep/react3.mjs run <out.jsonl> 2   설계 시드만
//   STAGES=pilot3 … run $D/pilot3.jsonl 2 → node tools/coresweep/react3.mjs bitcheck3 $D/pilot3.jsonl (커밋본은 .gz, 읽기는 둘 다 됨)
//   (사전 등록 커밋 뒤) STAGES=sel3 … run $D/sel3.jsonl 2 → node tools/coresweep/react3.mjs choose3 $D/sel3.jsonl → $D/choice3.json(커밋)
//   (choice3 커밋 뒤) STAGES=eval3 … run $D/eval3.jsonl 2 · STAGES=gcore3 … run $D/gcore3.jsonl 2 · STAGES=gsmall3 … run $D/gsmall3.jsonl 2
//   node tools/coresweep/react3.mjs verdict3 $D/eval3.jsonl,$D/gcore3.jsonl,$D/gsmall3.jsonl → $D/verdict3.json(커밋)
//   node tools/coresweep/react3.mjs report <파일들>                  표(3판 시각·N0·도달 뒤 반응·코어·게임 경로·숨 규칙·시범 점검)
//   node tools/coresweep/react3.mjs dry3 <probe3 파일들>             배관 점검: 설계 시드 줄로 choose3·verdict3 흉내(판정 아님)
//   환경: KEYS(그 키만, 이어 돌리기) · PARTS·LAGS(probe3 만) · SEEDS·CHOICE·JSTAR·WEAK_ZERO·WEAK_FLOOR·WEAK_EXP·BLAST_SPAN 는 거부
//
// ■ 12. 시범(pilot3, 391~393, 구현 점검만 — 판정·고르기에 안 씀)
//   시범은 구현 점검만 한다. 시드 391~393 은 사전 등록에 시범으로 적었고 판정·고르기에 안 쓴다. 원자료 data/react3/pilot3.jsonl.gz(195샷)
//   · 출력 사본 data/react3/pilot3_report.txt.
//   - bitcheck3: 1차 시범 재실행 27/27 바이트 동일 · pilot3|j0 ≡ 1차 v1 9/9 → prog 경로 jetLag·쿠션이 1차 그대로.
//   - pilotCheck: 샷 195(take 54 · core 12 · game 78 · rule 24 · r1 27) · rx/x 의 NaN·null·∞ 0 · 3판 첫 움직임/10° 안 일어남 0
//     · 첫 움직임이 바람 도달보다 이른 샷 0 · 숨 규칙 돌풍 표시 어긋남 0/24.
//   - 고친 버그 없음. 시범 뒤 코드 변경은 이 머리 주석의 글뿐이다(시범 전에 R-rule b1 바닥·장수별 최저 비 보고를 넣고 시범을 돌림).
//   - 시범 줄의 가드·보고 문턱 O/X 는 시드 1개(N 1~5)라 뜻이 없다(구현 경로가 끝까지 도는지만 봄).
//   - dry3(설계 다섯 파일): 0.02 통과 · S-T3 O · R-mid O · R-rule O(설계 30시드 점 추정, 24시드 흉내에서는 43% X) · 0.03 은 S-T2 실패·S-T3 X.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import * as SW from './simsweep.js';
import { shotO } from './ownclips.mjs';
import { regCell } from '../sweepmap.mjs';
import * as Rules from '../../mockup/src/rules.js';

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────── 사전 등록 상수 ─────────────────────────
export const SLOW = 3.21; // 화면 s = 실물 s × 3.21 (v1 중력 38, 프루드)
export const SLOWS = Object.freeze([2.9, 3.21, 3.6]); // 배율 민감도(보고만): 06 §1 D 4~6 cm → 2.9~3.6
export const DT = SW.TUNE.dt; // 물리 1스텝 = 1/120 화면 s = 실물 2.596 ms
export const msOf = (k, slow = SLOW) => (k * DT * 1000) / slow; // 스텝 수(정수) → 실물 ms. 저장은 언제나 정수 스텝
export const REAL = Object.freeze({ fm: { 1: 40, 2: 24, 3: 18 }, t10: { 1: 52, 2: 42, 3: 32 } }); // 06 §2 (숨 시작 뒤 실물 ms, 2번 첫 움직임 23~25 → 24)
export const GRID3 = Object.freeze([0, 0.01, 0.015, 0.02, 0.025, 0.03]); // jetLag(화면 s/u). 0 = v1(키를 아예 안 넘김)
export const CAND3 = GRID3.filter((x) => x > 0);
export const NULL_C = Object.freeze(R(0, 30)); // 귀무 N0 = v1 시각 + c 스텝(정수 0~30 = 실물 0~78 ms, 세 판·두 시각 모두 같은 c). sel3 에서 같은 'E 최소' 규칙으로 고름
export const FM_D = Object.freeze([0.015, 0.03, 0.06]); // 첫 움직임 문턱(u, 화면 옆모습 평면 변위): 1 px · 2 px(주) · 4 px (영상 D 125~135 px → 1 u ≈ 65 px)
export const FM_MAIN = 1;
export const TOL = Object.freeze({ // 판정 문턱(설계 시드 361~390 탐침 뒤 고정, 근거는 머리 주석 ■ 5·9)
  E: 10, // S-T2 세 판 × 두 시각 평균 절대 오차 상한(ms, 영상 약 2.4프레임)
  Emax: 20, // S-T2 여섯 칸 하나하나의 절대 오차 상한(ms, 약 5프레임)
  flick: 0.9, // G-a1 튕김 원 안 장수 평균비(J*/v1) 하한 = 10% 넘게 잃으면 깨짐
  sweep: 0.2, // G-a2 튕김 ÷ 최선 고정 비의 v1 대비 하락 상한
  peel: 0.10, // G-a3 위부터 벗겨짐 비율 하락 상한(30·40장, 10%p)
  smallFlip: 0.9, // G-b1 · R-mid · R-rule 원 안 뒤집힘 평균비(J*/v1) 하한
  smallOff: 0.01, // G-b2 · R-mid · R-rule 책상 밖 비율(장당) 증가 상한(1%p)
  smallOut: 0.03, // G-b3 · R-mid · R-rule 원 밖 비율(장당, 책상 밖 포함) 증가 상한(3%p)
  q3: 10, // G-c(배관) 첨부3 위¼ 최대 기울기 시드 중앙 하한(°)
  ruleFlipAbs: 0.25, // R-rule b1 만: 허용 손실 = max(10%, 0.25장/샷). 약함·센 돌풍은 v1 이 샷당 0.3~1.3장이라 10% 비만 쓰면 잡음(설계 붓스트랩: 0.6·13~22 에서 잡음만으로 45% 깃발)
});
// 시드 (단계마다 허용 집합 밖이면 jobs3 가 throw. SEEDS 덮어쓰기 금지)
export const SEEDS3 = Object.freeze({
  probe3: R(361, 390), // 설계(문턱 정하기만, 이미 봄)
  pilot3: R(391, 393), // 구현 점검(판정·고르기에 안 씀). 1차 시범 줄(calib/pilot3) 재실행 = 바이트 대조
  sel3: R(461, 472), // 고르기 12
  eval3: R(473, 496), // 평가(보류) 24
  gcore3: R(625, 636), // 코어 가드 12 (621~624 는 vf/*601 v1 코어 원자료와 겹쳐서 피함)
  gsmall3: R(641, 664), // 작은 더미 가드 24 (+ 보고 문턱 줄: 게임 13~22장 · 숨 규칙)
});
export const STAGE3 = Object.keys(SEEDS3);
const BURNED = (s) => (s >= 401 && s <= 460) || (s >= 601 && s <= 612) || (s >= 901 && s <= 912);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DATA3 = new URL('./data/react3/', import.meta.url);
export const CHOICE3_REL = 'tools/coresweep/data/react3/choice3.json';
const CHOICE3 = new URL('choice3.json', DATA3), VERDICT3 = new URL('verdict3.json', DATA3);
// 사전 등록 동결: sel3 이후 단계(run)·choose3·verdict3 는 이 파일들이 HEAD 와 바이트까지 같을 때만 돈다
export const FROZEN3 = Object.freeze(['tools/coresweep/react3.mjs', 'tools/coresweep/simsweep.js', 'tools/coresweep/ownclips.mjs', 'tools/sweepmap.mjs', 'mockup/src/rules.js', 'mockup/src/sim.js']);
// 샷을 바꿀 수 있는 환경 변수(시드·고른 값·숨 규칙 rules.js 의 env 손잡이)는 모두 거부
const ENV_BAN = Object.freeze(['SEEDS', 'CHOICE', 'JSTAR', 'WEAK_ZERO', 'WEAK_FLOOR', 'WEAK_EXP', 'BLAST_SPAN']);
const RUN_FREE = new Set(['probe3', 'pilot3']); // 사전 등록 커밋 전에도 돌 수 있는 단계(설계·구현 점검)

// ───────────────────────── 커밋 단언 (git) ─────────────────────────
const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
// rel(저장소 기준 경로)의 HEAD 내용이 buf 와 바이트까지 같은가(HEAD 에 없으면 false)
export function headSame(rel, buf) { let h; try { h = git(['show', `HEAD:${rel}`]); } catch { return false; } return Buffer.compare(h, buf) === 0; }
export function assertCommitted3(rel) {
  const f = ROOT + rel;
  if (!existsSync(f)) throw new Error(`react3: ${rel} 없음`);
  if (!headSame(rel, readFileSync(f))) throw new Error(`react3: ${rel} 이 HEAD 에 커밋돼 있지 않거나 커밋 뒤 바뀜 — 사전 등록·고른 값은 커밋된 그대로만 쓴다`);
  return true;
}
export const assertFrozen3 = () => { for (const rel of FROZEN3) assertCommitted3(rel); return true; };
function envGuard3() { for (const k of ENV_BAN) if (process.env[k] !== undefined) throw new Error(`react3: 환경 변수 ${k} 거부(시드·고른 값·숨 규칙은 사전 등록 고정)`); }

// ───────────────────────── 관찰자 (읽기만, 매 스텝, 정수 스텝 저장) ─────────────────────────
function rot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}
const UP = { x: 0, y: 1, z: 0 };
const NRIM = 16;
// 테두리 점(몸 좌표): 위·아래 면 × 16 방향
const rimPts = () => { const P = [], h = SW.DISC_H / 2; for (let j = 0; j < NRIM; j++) { const a = (2 * Math.PI * j) / NRIM; for (const s of [-h, h]) P.push({ x: Math.cos(a) * SW.DISC_R, y: s, z: Math.sin(a) * SW.DISC_R }); } return P; };
// 첫 움직임 = 어떤 딱지의 테두리 점이 숨 시작 자리에서 옆모습 평면(세로 y · 부는 축 z, 깊이 x 는 영상에 안 보임)으로 FM_D 이상 움직인 첫 스텝
// 위¼ 10° = ownclips quarters() 와 같은 식(쌓은 순서 위 ¼ 장의 '그림 아래' 기준 기울기 평균)이 10° 에 닿은 첫 스텝(ownclips 는 2스텝마다 → 여기는 매 스텝)
export function reactObs() {
  let live, ref, qi, qc, q3s, RIM;
  const o = { fm: FM_D.map(() => -1), t10: -1, t1: -1, arr: -1, q3max: 0 };
  const pos = (d) => { const p = d.body.translation(), q = d.body.rotation(); return RIM.map((v) => { const r = rot(q, v); return [p.y + r.y, p.z + r.z]; }); };
  const q3 = () => { let s = 0; for (let k = 0; k < live.length; k++) if (qi[k] === 3) { const u = rot(live[k].body.rotation(), UP); s += Math.acos(Math.max(-1, Math.min(1, -u.y))); } return s / Math.max(1, qc) / D2R; };
  return {
    start(t) {
      RIM = rimPts();
      live = t.liveDiscs();
      const n = live.length;
      ref = live.map(pos);
      qi = live.map((_, k) => Math.min(3, Math.floor((4 * k) / n)));
      qc = qi.filter((v) => v === 3).length;
      q3s = q3();
    },
    step(t, k) {
      if (o.arr < 0 && t.lastHits && t.lastHits.some((h) => h.s > 0)) o.arr = k; // 바람(세기 > 0)이 처음 어떤 딱지에 닿은 스텝
      if (o.fm[o.fm.length - 1] < 0) {
        let m = 0;
        for (let i = 0; i < live.length; i++) { if (live[i].off) continue; const P = pos(live[i]), Q = ref[i]; for (let j = 0; j < P.length; j++) { const v = Math.hypot(P[j][0] - Q[j][0], P[j][1] - Q[j][1]); if (v > m) m = v; } }
        for (let j = 0; j < FM_D.length; j++) if (o.fm[j] < 0 && m >= FM_D[j]) o.fm[j] = k;
      }
      const Q = q3();
      if (Q > o.q3max) o.q3max = Q;
      if (o.t10 < 0 && Q >= 10) o.t10 = k;
      if (o.t1 < 0 && Q - q3s >= 1) o.t1 = k;
    },
    done() { return { fm: o.fm[FM_MAIN], fm1: o.fm[0], fm4: o.fm[2], t10: o.t10, t1: o.t1, arr: o.arr, q3max: +o.q3max.toFixed(2) }; },
  };
}

// ───────────────────────── 게임 샷 (작은 더미 가드: main.js·turn.js·botlib 와 같은 Table.blow 경로) ─────────────────────────
// 표적 = turn.js fire() 기하(정규 방향 −z, 곡면 위 c − D·√(1−lat²) + side·lat), 숨 = 정답 × ratio → resolveShot 이 물리 세기 PS·돌풍 blast 로
//   (가드 = 초록 가운데 0.89, 숨 규칙 보고 줄 = 0.6 약함 · 1.05/1.1/1.2 돌풍),
// 자세 eye = mouthY 안 넘김(기본 blow) · low = mouthY LIP_MIN(blowLip, 6장↑). 판정 = PvP stepJudge·judgeResult(게임 규칙: 원 안 그림 위)
export const GREEN_MID = 0.89;
export const AIM_H = Object.freeze([0.6, 0.82, 0.95]); // 꼭대기 대비 조준 높이(0.82 = botlib learner 평균)
export const AIM_LAT = Object.freeze([0, 0.4]);
export const RULE_R = Object.freeze([0.6, 1.05, 1.1, 1.2]); // 숨 규칙 보고 줄(R-rule): 약함 · 돌풍 −10% · −25% · ≈0장 (CLAUDE.md 3차 개편)
export const RULE_N = Object.freeze(R(2, 22));
// 돌풍(비율 > 1)만 resolveShot 의 조준 흔들림 난수를 쓴다 → (시드, 장수, 비율)로 정한 mulberry32 (J*·v1 같은 짝이 같은 흔들림)
const shotRng = (job) => rng32((Math.imul(job.seed, 7919) ^ Math.imul(job.n, 104729) ^ Math.round(job.ratio * 1000)) >>> 0);
export function shotG(job, obs, Mo = SW) {
  if (Mo.setDiscH) Mo.setDiscH(0.11); // mockup/src/sim.js 는 DISC_H 0.11 고정(setDiscH 없음)
  const t = new Mo.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle();
  const n = t.liveDiscs().length, top = t.columnTop();
  const ratio = job.ratio ?? GREEN_MID;
  const rng = ratio > 1 ? shotRng(job) : () => { throw new Error('초록·약한 숨은 난수를 안 씀'); };
  const s = Rules.resolveShot({ h: top * job.hf, lat: job.lat, power: Rules.sweetHiFor(n) * ratio }, n, top, rng, 1);
  const D = { x: 0, z: -1 }, side = { x: -D.z, z: D.x }, c = t.pileCenter();
  const lat = clamp(s.lat || 0, -0.95 * SW.DISC_R, 0.95 * SW.DISC_R), back = Math.sqrt(SW.DISC_R * SW.DISC_R - lat * lat);
  const aim = { x: c.x - D.x * back + side.x * lat, y: s.h, z: c.z - D.z * back + side.z * lat };
  t.blow({ aim, dir: { x: D.x, z: D.z }, power: s.power, blast: s.blast || 0, ...(job.pose === 'low' ? { mouthY: Rules.mouthYFor('low') } : {}) });
  obs?.start(t);
  const j = { n: 0, quiet: 0 };
  let k = 0, puffSteps = 0;
  for (;;) { if (t.puff) puffSteps++; t.step(); k++; obs?.step(t, k); if (t.stepJudge(j)) break; }
  const { flipped, outs } = t.judgeResult();
  const r = { n: job.n, seed: job.seed, flip: flipped.length, out: outs.length, off: t.liveDiscs().filter((d) => d.off).length, steps: k, puffSteps, power: s.power };
  if (job.ratio != null) Object.assign(r, { ratio, blast: +(s.blast || 0).toFixed(4), aimH: +s.h.toFixed(4), aimLat: +lat.toFixed(4) }); // 숨 규칙 줄만(초록 가드 줄은 옛 줄과 바이트 동일)
  if (obs) r.rx = obs.done();
  return r;
}

// ───────────────────────── 작업 ─────────────────────────
const lagTag = (L) => `j${L}`;
const tuneOf = (L) => (L > 0 ? { jetLag: L } : null); // 0 = v1: 키를 아예 안 넘김
const takeJob = (st, L, ci, s) => ({ key: `${st}|${lagTag(L)}|T${ci}`, kind: 'take', n: 15, seed: s, q: 0.85, cal: 1, ...(tuneOf(L) ? { tune: tuneOf(L) } : {}), spec: { kin: 'r', P: ci, K: ci, B: ci, jet: 'flat' } });
const P6G = { kind: 'pueok', D: 0.6 };
function coreJobs(st, L, n, s, only) { // ownclips calJobs 'gate' 와 같은 job(sweepcheck v|relfix 4×5 + 튕김 regCell)
  const J = [], T0 = tuneOf(L) ? { tune: tuneOf(L) } : {}, rc = regCell(n);
  for (const qq of [0.7, 0.85, 0.93, 1.0]) for (const h of [0.3, 0.4, 0.5, 0.6, 0.8]) if (!only || only === `relfix|q${qq}|h${h}`) J.push({ key: `${st}|${lagTag(L)}|core|relfix|q${qq}|h${h}`, kind: 'core', n, seed: s, q: qq, kin: 'c', sweep: {}, breath: { kind: 'rel', D: +h.toFixed(4), off: 0.04 }, ...T0 });
  if (!only || only === 'flick') J.push({ key: `${st}|${lagTag(L)}|core|flick`, kind: 'core', n, seed: s, q: rc.q, kin: 'c', sweep: rc.sweep, breath: P6G, ...T0 });
  return J;
}
function smallJobs(st, L, n, s, aims = null) {
  const J = [], T0 = tuneOf(L) ? { tune: tuneOf(L) } : {};
  for (const pose of ['eye', 'low']) {
    if (pose === 'low' && n < Rules.LOW_POSE_MIN_N) continue;
    for (const hf of AIM_H) for (const lat of AIM_LAT) if (!aims || aims.some((a) => a[0] === hf && a[1] === lat)) J.push({ key: `${st}|${lagTag(L)}|game|${pose}|h${hf}|l${lat}`, kind: 'game', n, seed: s, pose, hf, lat, ...T0 });
  }
  return J;
}
function ruleJobs(st, L, n, s) { // 숨 규칙 보고 줄: 눈높이 · 조준 0.82 · 옆 0 · 비율 RULE_R
  const T0 = tuneOf(L) ? { tune: tuneOf(L) } : {};
  return RULE_R.map((rt) => ({ key: `${st}|${lagTag(L)}|rule|r${rt}|eye|h0.82|l0`, kind: 'game', n, seed: s, pose: 'eye', hf: 0.82, lat: 0, ratio: rt, ...T0 }));
}
// 1차 시범(data/own/calib/pilot3.jsonl.gz 'pilot|<tag>|T{ci}', 391~393)과 같은 job → bitcheck3 p 가 rx·key 뺀 모든 필드를 바이트로 대조
export const PILOT1 = Object.freeze([['v1', null], ['jl0.02|tc3|cf0.15', { jetLag: 0.02, tableCushion: 3, cushionFar: 0.15 }], ['jl0.02|tc8|cf0.15', { jetLag: 0.02, tableCushion: 8, cushionFar: 0.15 }]]);
// 고른 값: 커밋된(HEAD 와 바이트 동일) data/react3/choice3.json 만. 없거나 커밋 전·커밋 뒤 바뀜·환경 변수 덮어쓰기 = throw
export function readChoice3() {
  if (process.env.CHOICE || process.env.JSTAR) throw new Error('react3: 고른 값은 커밋된 data/react3/choice3.json 만 읽음(덮어쓰기 금지)');
  if (!existsSync(CHOICE3)) throw new Error(`${CHOICE3_REL} 없음 — sel3 → choose3 → 커밋을 먼저`);
  assertCommitted3(CHOICE3_REL);
  const C = JSON.parse(readFileSync(CHOICE3, 'utf8'));
  if (!CAND3.includes(C.jetLag)) throw new Error(`choice3.json 의 jetLag ${C.jetLag} 이 사전 등록 후보 밖`);
  if (!NULL_C.includes(C.nullC)) throw new Error(`choice3.json 의 nullC ${C.nullC} 이 사전 등록 범위(0~30스텝) 밖`);
  return C;
}
// 시드 단언: 단계마다 허용 집합 밖·소진 시드(401~460·601~612·901~912)면 throw
export function assertSeeds3(J) {
  for (const j of J) {
    const sg = j.key.split('|')[0];
    if (BURNED(j.seed)) throw new Error(`react3: 소진 시드 ${j.seed}(401~460·601~612·901~912) — ${j.key}`);
    if (!SEEDS3[sg] || !SEEDS3[sg].includes(j.seed)) throw new Error(`react3: 단계 ${sg} 에 허용되지 않은 시드 ${j.seed} — ${j.key}`);
  }
  return true;
}
// 단계 → 작업(문지기 없음, 안에서만 씀). Lstar = 고른 jetLag(eval3·gcore3·gsmall3 만 씀, jobs3 가 커밋된 choice3 에서 읽어 넘김)
function buildJobs3(st, Lstar, opt = {}) {
  const J = [];
  const parts = new Set((opt.parts || process.env.PARTS || 'take,core,small').split(','));
  if (st.has('probe3')) { // 설계 시드만: 문턱을 정하기 위한 탐침(이미 본 시드). mid·rule 은 PARTS 로 따로
    const lags = (opt.lags || process.env.LAGS || GRID3.join(',')).split(',').map(Number);
    for (const L of lags) if (!GRID3.includes(L)) throw new Error(`probe3: 격자 밖 jetLag ${L}`);
    for (const s of SEEDS3.probe3) for (const L of lags) {
      if (parts.has('take')) for (const ci of [1, 2, 3]) J.push(takeJob('probe3', L, ci, s));
      if (parts.has('core') && s <= 372) for (const n of [40, 30, 20]) J.push(...coreJobs('probe3', L, n, s));
      if (parts.has('small')) for (const n of R(1, 12)) J.push(...smallJobs('probe3', L, n, s));
      if (parts.has('mid')) for (const n of R(13, 22)) J.push(...smallJobs('probe3', L, n, s));
      if (parts.has('rule')) for (const n of RULE_N) J.push(...ruleJobs('probe3', L, n, s));
    }
  }
  if (st.has('pilot3')) { // 구현 점검: 391~393 격자 × 3판 54 + 코어 12 + 작은 더미 38 + 게임 13~22장 40 + 숨 규칙 24 + 1차 시범 재실행 27
    for (const s of SEEDS3.pilot3) for (const L of GRID3) for (const ci of [1, 2, 3]) J.push(takeJob('pilot3', L, ci, s));
    for (const L of [0, 0.02]) {
      for (const n of [40, 30, 20]) J.push(...coreJobs('pilot3', L, n, 391, 'relfix|q0.85|h0.5'), ...coreJobs('pilot3', L, n, 391, 'flick'));
      for (const n of R(1, 22)) J.push(...smallJobs('pilot3', L, n, 391, [[0.82, 0]]));
      for (const n of [4, 12, 18]) J.push(...ruleJobs('pilot3', L, n, 391));
    }
    for (const s of SEEDS3.pilot3) for (const [tag, tune] of PILOT1) for (const ci of [1, 2, 3]) J.push({ key: `pilot3|r1|${tag}|T${ci}`, kind: 'take', n: 15, seed: s, q: 0.85, cal: 1, ...(tune ? { tune } : {}), spec: { kin: 'r', P: ci, K: ci, B: ci, jet: 'flat' } });
  }
  if (st.has('sel3')) for (const s of SEEDS3.sel3) for (const L of GRID3) for (const ci of [1, 2, 3]) J.push(takeJob('sel3', L, ci, s));
  if (st.has('eval3')) for (const s of SEEDS3.eval3) for (const L of GRID3) for (const ci of [1, 2, 3]) J.push(takeJob('eval3', L, ci, s)); // 판정은 v1 과 J* 줄만, 나머지는 용량-반응·판 하나 빼기 보고
  if (st.has('gcore3') || st.has('gsmall3')) {
    if (!CAND3.includes(Lstar)) throw new Error(`react3: 가드 단계에 고른 값 없음(${Lstar})`);
    const Ls = [0, Lstar];
    if (st.has('gcore3')) for (const s of SEEDS3.gcore3) for (const L of Ls) for (const n of [40, 30, 20]) J.push(...coreJobs('gcore3', L, n, s));
    if (st.has('gsmall3')) for (const s of SEEDS3.gsmall3) for (const L of Ls) {
      for (const n of R(1, 22)) J.push(...smallJobs('gsmall3', L, n, s)); // 1~12 = G-b(판정) · 13~22 = R-mid(보고 문턱)
      for (const n of RULE_N) J.push(...ruleJobs('gsmall3', L, n, s)); // R-rule(보고 문턱)
    }
  }
  return J;
}
// 문지기: 환경 변수 거부 · 모르는 단계 거부 · eval3·gcore3·gsmall3 는 커밋된 choice3.json 이 있어야(평가 시드를 본 뒤 고르는 길을 막음) · 시드 단언
export function jobs3(stages, opt = {}) {
  envGuard3();
  const st = new Set(stages);
  for (const x of st) if (!STAGE3.includes(x)) throw new Error(`react3: 모르는 단계 '${x}' (${STAGE3.join(',')})`);
  const Lstar = ['eval3', 'gcore3', 'gsmall3'].some((x) => st.has(x)) ? readChoice3().jetLag : null;
  const J = buildJobs3(st, Lstar, opt);
  assertSeeds3(J);
  return J;
}

// ───────────────────────── 돌리기 (일꾼 ≤ 2) ─────────────────────────
function runOne(job) {
  const obs = reactObs();
  const r = job.kind === 'game' ? shotG(job, obs) : shotO(job, obs);
  return { ...r, key: job.key, ...(job.tune ? { tune: job.tune } : {}) };
}
async function runJobs(jobs, of, W) {
  W = Math.min(2, Math.max(1, W | 0));
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const keep = process.env.KEYS ? new RegExp(process.env.KEYS) : null;
  const todo = jobs.filter((j) => !done.has(tag(j)) && (!keep || keep.test(j.key))).sort((a, b) => b.n - a.n);
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  if (!todo.length) return;
  mkdirSync(dirname(of), { recursive: true });
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { react3Worker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 500 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ───────────────────────── 분석 ─────────────────────────
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
export const readRows = (files) => files.split(',').filter(Boolean).flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const kv = (k) => (k > 0 ? k : Infinity); // 스텝(−1 = 안 일어남 → ∞)
const sameSet = (a, b) => { if (a.length !== b.length) return false; const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q); return x.every((v, i) => v === y[i]); };
export function median(a) { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; }
// 줄 → G[stage|lag][ci] = Map(seed → row)
function groupTakes(rows) {
  const G = new Map();
  for (const r of rows) {
    const m = r.key.match(/^([a-z0-9]+)\|j([0-9.]+)\|T([123])$/);
    if (!m) continue;
    const g = `${m[1]}|${m[2]}`;
    if (!G.has(g)) G.set(g, { 1: new Map(), 2: new Map(), 3: new Map() });
    const M = G.get(g)[+m[3]];
    if (M.has(r.seed) && JSON.stringify(M.get(r.seed)) !== JSON.stringify(r)) throw new Error(`같은 줄이 다름: ${r.key} ${r.seed}`);
    M.set(r.seed, r);
  }
  return G;
}
// 시드 목록 seeds(같은 순서·중복 허용 = 붓스트랩)에서 판마다 중앙값(스텝) → 오차(ms).
//   shift = 귀무 N0 의 상수 지연(스텝, 세 판·두 시각 모두에 더함) · slow = 배율(민감도 보고만)
export function timingOn(g, seeds, { field = 'fm', shift = 0, slow = SLOW } = {}) {
  const o = {};
  for (const ci of [1, 2, 3]) {
    const rows = seeds.map((s) => { const r = g[ci].get(s); if (!r) throw new Error(`첨부${ci} 시드 ${s} 줄 없음`); return r; });
    o[ci] = { fm: median(rows.map((r) => kv(r.rx[field]))) + shift, t10: median(rows.map((r) => kv(r.rx.t10))) + shift, q3: median(rows.map((r) => r.rx.q3max)), any: mean(rows.map((r) => r.x.any)) };
  }
  const err = []; for (const ci of [1, 2, 3]) { err.push(Math.abs(msOf(o[ci].fm, slow) - REAL.fm[ci]), Math.abs(msOf(o[ci].t10, slow) - REAL.t10[ci])); }
  o.E = mean(err); o.Emax = Math.max(...err); o.err = err;
  o.Efm = mean([err[0], err[2], err[4]]); o.Et10 = mean([err[1], err[3], err[5]]);
  o.ordFm = o[1].fm > o[2].fm && o[2].fm > o[3].fm; o.ordT10 = o[1].t10 > o[2].t10 && o[2].t10 > o[3].t10;
  return o;
}
const seedsOf = (g) => { const s = [...g[1].keys()].filter((x) => g[2].has(x) && g[3].has(x)).sort((a, b) => a - b); return s; };
// 짝 붓스트랩: 같은 시드 표본을 두 줄에 함께 → ΔE = E(A) − E(B) (+ = B 가 나음). oA·oB = timingOn 옵션(귀무 shift 등)
//   ∞(안 일어난 칸)이 끼면 finite = false 로 돌려줌(정렬이 깨지는 NaN 을 피함) → 판정은 실패로 적는다
export function pairedE(gA, gB, seeds, { B = 2000, oA = {}, oB = {} } = {}) {
  const R0 = rng32(20261015), d = [];
  for (let b = 0; b < B; b++) { const sm = seeds.map(() => seeds[Math.floor(R0() * seeds.length)]); d.push(timingOn(gA, sm, oA).E - timingOn(gB, sm, oB).E); }
  const d0 = timingOn(gA, seeds, oA).E - timingOn(gB, seeds, oB).E;
  if (!Number.isFinite(d0) || !d.every(Number.isFinite)) return { d: d0, lo: NaN, hi: NaN, finite: false };
  d.sort((x, y) => x - y);
  return { d: d0, lo: d[Math.floor(0.025 * B)], hi: d[Math.floor(0.975 * B)], finite: true };
}
// 귀무 N0 고르기: c ∈ NULL_C 중 E(v1 + c) 최소(0.1 ms 반올림, 같으면 작은 c)
export function bestShift(gv, seeds, slow = SLOW) {
  let b = null;
  for (const c of NULL_C) { const E = timingOn(gv, seeds, { shift: c, slow }).E; if (!b || Math.round(E * 10) < Math.round(b.E * 10)) b = { c, E }; }
  return b;
}
// jetLag 고르기(choose3 규칙): 후보 중 E 최소(0.1 ms 반올림, 같으면 작은 jetLag)
function bestLag(G, stage, seeds, slow = SLOW, cells = null) {
  let b = null;
  for (const L of CAND3) { const g = G.get(`${stage}|${L}`); if (!g) return null; const o = timingOn(g, seeds, { slow }), E = cells ? mean(cells.map((i) => o.err[i])) : o.E; if (!b || Math.round(E * 10) < Math.round(b.E * 10)) b = { L, E, o }; }
  return b;
}
// 도달 뒤 반응(보고만): 판마다 시드 중앙 (첫 움직임 − 바람 도달) · (위¼ 10° − 첫 움직임) 실물 ms. 실물 오름 = 10° − 첫 = 12/18/14 ms
function riseOn(g, seeds) {
  const d = (a, b) => { const x = kv(a), y = kv(b); return Number.isFinite(x) && Number.isFinite(y) ? x - y : Infinity; };
  return Object.fromEntries([1, 2, 3].map((ci) => { const rs = seeds.map((s) => g[ci].get(s)); return [ci, { fmArr: msOf(median(rs.map((r) => d(r.rx.fm, r.rx.arr)))), rise: msOf(median(rs.map((r) => d(r.rx.t10, r.rx.fm)))), arr: msOf(median(rs.map((r) => kv(r.rx.arr)))) }]; }));
}
// 실물 값이 시뮬 시드 분포의 몇 번째 백분위인가(보고만): (시뮬 < 실물 + ½·같음) / N. 실물은 판마다 n = 1 이라 중앙값 비교만으로는 퍼짐이 안 보인다
function pctOn(g, seeds, shift = 0) {
  const P = (ms, real) => (ms.filter((v) => v < real).length + 0.5 * ms.filter((v) => v === real).length) / ms.length;
  return Object.fromEntries([1, 2, 3].map((ci) => { const rs = seeds.map((s) => g[ci].get(s)); return [ci, { fm: P(rs.map((r) => msOf(kv(r.rx.fm) + shift)), REAL.fm[ci]), t10: P(rs.map((r) => msOf(kv(r.rx.t10) + shift)), REAL.t10[ci]) }]; }));
}
// 판 하나 빼기(보고만): 남은 두 판 4칸 평균 오차로 jetLag(후보 5)·귀무 c(0~30)를 고르고 뺀 판 2칸 평균 오차를 예측
function lotoOn(G, stage, seeds) {
  const gv = G.get(`${stage}|0`);
  if (!gv || CAND3.some((L) => !G.get(`${stage}|${L}`))) return null;
  const idx = (ci) => [2 * (ci - 1), 2 * (ci - 1) + 1];
  return [1, 2, 3].map((h) => {
    const fit = [1, 2, 3].filter((x) => x !== h).flatMap(idx), held = idx(h);
    const bl = bestLag(G, stage, seeds, SLOW, fit);
    let bc = null;
    for (const c of NULL_C) { const o = timingOn(gv, seeds, { shift: c }), E = mean(fit.map((i) => o.err[i])); if (!bc || Math.round(E * 10) < Math.round(bc.E * 10)) bc = { c, E, o }; }
    return { h, L: bl.L, heldL: mean(held.map((i) => bl.o.err[i])), c: bc.c, heldC: mean(held.map((i) => bc.o.err[i])) };
  });
}
// 두 손잡이(보고만): jetLag(격자 6) + 상수 c(−10~30 스텝)의 최선 — 중심 규칙의 상수 몫이 고른 jetLag 를 얼마나 끌어내리는지
function twoKnobOn(G, stage, seeds) {
  let b = null;
  for (const L of GRID3) { const g = G.get(`${stage}|${L}`); if (!g) return null; for (let c = -10; c <= 30; c++) { const E = timingOn(g, seeds, { shift: c }).E; if (!b || Math.round(E * 10) < Math.round(b.E * 10)) b = { L, c, E }; } }
  return b;
}
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '∞');
const pc = (v) => `${(100 * v).toFixed(0)}%`;
function timingLine(tag, o) {
  const c = (ci) => `${f1(msOf(o[ci].fm))}/${f1(msOf(o[ci].t10))}`;
  return `  ${tag.padEnd(16)} 첫 움직임/위¼ 10° (ms) 1 ${c(1)} · 2 ${c(2)} · 3 ${c(3)} | E ${f1(o.E)} (첫 ${f1(o.Efm)} · 10° ${f1(o.Et10)}) 최대 ${f1(o.Emax)} | 순서 첫 ${o.ordFm ? 'O' : 'X'} 10° ${o.ordT10 ? 'O' : 'X'} | 첨부3 위¼ 최대 중앙 ${f1(o[3].q3)}° | 15장(보고만) ${o[1].any.toFixed(1)}/${o[2].any.toFixed(1)}/${o[3].any.toFixed(1)}`;
}
const riseLine = (tag, r) => `  ${tag.padEnd(16)} 도달 ${[1, 2, 3].map((ci) => f1(r[ci].arr)).join('/')} · 첫 − 도달 ${[1, 2, 3].map((ci) => f1(r[ci].fmArr)).join('/')} · 10° − 첫 ${[1, 2, 3].map((ci) => f1(r[ci].rise)).join('/')} ms (실물 10° − 첫 12/18/14)`;
const pctLine = (tag, p) => `  ${tag.padEnd(16)} 실물 백분위(첫/10°) ${[1, 2, 3].map((ci) => `${ci}: ${pc(p[ci].fm)}/${pc(p[ci].t10)}`).join(' · ')}`;
function timingReport(G, stage) {
  const keys = [...G.keys()].filter((k) => k.startsWith(`${stage}|`)).sort((a, b) => +a.split('|')[1] - +b.split('|')[1]);
  if (!keys.length) return;
  console.log(`\n-- ${stage} 반응 시각 (실물 ms, 시드 중앙값, 첫 움직임 = 옆모습 테두리 변위 ${FM_D[FM_MAIN]} u, 실물 첫 40/24/18 · 10° 52/42/32)`);
  const g0 = G.get(`${stage}|0`);
  const se0 = g0 ? seedsOf(g0) : null;
  for (const k of keys) {
    const g = G.get(k), se = seedsOf(g), o = timingOn(g, se);
    let extra = '';
    if (g0 && k !== `${stage}|0`) { const p = pairedE(g0, g, se.filter((s) => se0.includes(s))); extra = ` | ΔE(v1−칸) ${f1(p.d)} [${f1(p.lo)}, ${f1(p.hi)}]`; }
    console.log(timingLine(`jetLag ${k.split('|')[1]} (${se.length})`, o) + extra);
  }
  if (g0) { // 귀무 N0 = v1 + c (이 시드들에서 고른 c — 설계·보고용. 판정의 c 는 sel3 에서 고른 choice3.json 값)
    const b = bestShift(g0, se0), o = timingOn(g0, se0, { shift: b.c });
    console.log(timingLine(`귀무 v1+${b.c}스텝`, o) + ` | (c = 이 시드들에서 E 최소, ${f1(msOf(b.c))} ms)`);
    for (const k of keys.filter((x) => x !== `${stage}|0`)) { const g = G.get(k), se = seedsOf(g).filter((s) => se0.includes(s)), p = pairedE(g0, g, se, { oA: { shift: b.c } }); console.log(`   ΔE(귀무 − jetLag ${k.split('|')[1]}) ${f1(p.d)} [${f1(p.lo)}, ${f1(p.hi)}] ms`); }
    const tk = twoKnobOn(G, stage, se0); if (tk) console.log(`   두 손잡이 최선(보고만): jetLag ${tk.L} + 상수 ${tk.c}스텝 → E ${f1(tk.E)} ms`);
    const lo = lotoOn(G, stage, se0); if (lo) console.log(`   판 하나 빼기(남은 두 판으로 고름 → 뺀 판 2칸 평균 오차 ms): ${lo.map((x) => `${x.h}번 jetLag ${x.L} ${f1(x.heldL)} · 귀무 +${x.c} ${f1(x.heldC)}`).join(' | ')}`);
    for (const sl of SLOWS.filter((x) => x !== SLOW)) { const bl = bestLag(G, stage, se0, sl), bs = bestShift(g0, se0, sl); if (bl) console.log(`   배율 ${sl}: 고를 값 ${bl.L} (E ${f1(bl.E)}) · 0.02 E ${f1(G.get(`${stage}|0.02`) ? timingOn(G.get(`${stage}|0.02`), se0, { slow: sl }).E : NaN)} · 0.03 E ${f1(G.get(`${stage}|0.03`) ? timingOn(G.get(`${stage}|0.03`), se0, { slow: sl }).E : NaN)} · 귀무 +${bs.c} E ${f1(bs.E)}`); }
  }
  console.log('   민감도(첫 움직임 문턱 1 px · 4 px · 위¼ +1°)와 바람 도달(첫 세기 > 0 스텝):');
  for (const k of keys) {
    const g = G.get(k), se = seedsOf(g), med = (ci, f) => msOf(median(se.map((s) => kv(g[ci].get(s).rx[f]))));
    console.log(`  jetLag ${k.split('|')[1].padEnd(6)} ${[1, 2, 3].map((ci) => `${ci}: 1px ${f1(med(ci, 'fm1'))} 4px ${f1(med(ci, 'fm4'))} +1° ${f1(med(ci, 't1'))} 도달 ${f1(med(ci, 'arr'))}`).join(' · ')}`);
  }
  console.log('   도달 뒤 반응(시드 중앙):');
  for (const k of keys) { const g = G.get(k); console.log(riseLine(`jetLag ${k.split('|')[1]}`, riseOn(g, seedsOf(g)))); }
}
// 코어 가드: n → lag → key → Map(seed → row)
function groupCore(rows, stage) {
  const G = new Map();
  for (const r of rows) {
    const m = r.key.match(/^([a-z0-9]+)\|j([0-9.]+)\|core\|(.*)$/);
    if (!m || m[1] !== stage) continue;
    const k = `${r.n}|${m[2]}`;
    if (!G.has(k)) G.set(k, new Map());
    const K = G.get(k);
    if (!K.has(m[3])) K.set(m[3], new Map());
    K.get(m[3]).set(r.seed, r);
  }
  return G;
}
export const peel = (r) => r.x.any >= 1 && r.x.off === 0 && r.x.anyTop > r.x.anyBot && r.x.botRise < 0.5; // 위부터 벗겨짐(06 §7.7 gate2 정의)
function pairRatio(A, B) { // B/A 평균비 + 짝 붓스트랩(sweepmap pairedRatio)
  const s = [...A.keys()].filter((x) => B.has(x)).sort((a, b) => a - b);
  const R0 = rng32(20261014), xs = s.map((x) => A.get(x)), ys = s.map((x) => B.get(x)), n = s.length, out = [];
  for (let b = 0; b < 2000; b++) { let sx = 0, sy = 0; for (let i = 0; i < n; i++) { const j = Math.floor(R0() * n); sx += xs[j]; sy += ys[j]; } out.push(sx > 0 ? sy / sx : Infinity); }
  out.sort((a, b) => a - b);
  const mx = mean(xs), my = mean(ys);
  return { r: mx > 0 ? my / mx : Infinity, lo: out[50], hi: out[1949], mx, my, n };
}
// want = 정확히 있어야 할 시드(판정·dry3). 있으면 장수·jetLag 마다 21 job(relfix 20 + 튕김) × want 시드가 정확히 있어야 하고 아니면 throw
export function coreCalc(rows, stage, L, want = null) {
  const G = groupCore(rows, stage), res = {};
  for (const n of [20, 30, 40]) {
    const c = {};
    for (const lg of [0, L]) {
      const K = G.get(`${n}|${lg}`);
      if (want) {
        if (!K || K.size !== 21 || !K.has('flick')) throw new Error(`${stage} 코어 ${n}장 jetLag ${lg}: job ${K ? K.size : 0}/21`);
        for (const [k, M] of K) if (!sameSet([...M.keys()], want)) throw new Error(`${stage} 코어 ${n}장 jetLag ${lg} ${k}: 시드 ${M.size}/${want.length}`);
      }
      if (!K || !K.get('flick')) continue;
      const flips = (k) => new Map([...K.get(k)].map(([s, r]) => [s, r.flip]));
      const fixKs = [...K.keys()].filter((k) => k.startsWith('relfix|'));
      const best = fixKs.sort((a, b) => mean([...K.get(b).values()].map((r) => r.flip)) - mean([...K.get(a).values()].map((r) => r.flip)))[0];
      const all = [...K.values()].flatMap((m) => [...m.values()]);
      c[lg] = { flick: flips('flick'), best, bestM: mean([...K.get(best).values()].map((r) => r.flip)), sw: pairRatio(flips(best), flips('flick')), peel: mean(all.map((r) => (peel(r) ? 1 : 0))), N: all.length, allFlip: mean(all.map((r) => r.flip)), off: mean(all.map((r) => r.x.off)) };
    }
    if (!c[0] || !c[L]) continue;
    const fr = pairRatio(c[0].flick, c[L].flick);
    res[n] = { v1: c[0], cell: c[L], flickR: fr, a1: fr.r >= TOL.flick, a2: c[L].sw.r >= c[0].sw.r - TOL.sweep, a3: n === 20 ? null : c[L].peel >= c[0].peel - TOL.peel };
  }
  return res;
}
function coreReport(rows, stage, L) {
  const res = coreCalc(rows, stage, L);
  if (!Object.keys(res).length) return;
  console.log(`\n-- ${stage} 코어 가드 (jetLag ${L} 대 v1, 같은 시드): 튕김 원 안 · 튕김 ÷ 최선 고정(같은 시드에서 고름) · 위부터 벗겨짐(21샷 × 시드)`);
  for (const n of [20, 30, 40]) {
    const x = res[n]; if (!x) continue;
    const sw = (c) => `${c.sw.r.toFixed(2)} [${c.sw.lo.toFixed(2)}, ${c.sw.hi.toFixed(2)}]`;
    console.log(`  ${n}장 튕김 ${x.v1.flick.size ? mean([...x.v1.flick.values()]).toFixed(1) : '-'} → ${mean([...x.cell.flick.values()]).toFixed(1)}장 (비 ${x.flickR.r.toFixed(2)} [${x.flickR.lo.toFixed(2)}, ${x.flickR.hi.toFixed(2)}]) ${x.a1 ? '통과' : '실패'} · 최선 고정 v1 ${x.v1.best} ${x.v1.bestM.toFixed(1)} / 칸 ${x.cell.best} ${x.cell.bestM.toFixed(1)} · 튕김÷고정 v1 ${sw(x.v1)} → 칸 ${sw(x.cell)} ${x.a2 ? '통과' : '실패'} · 벗겨짐 ${(100 * x.v1.peel).toFixed(0)}% → ${(100 * x.cell.peel).toFixed(0)}% ${x.a3 === null ? '(보고만)' : x.a3 ? '통과' : '실패'} · 21샷 평균 ${x.v1.allFlip.toFixed(1)} → ${x.cell.allFlip.toFixed(1)} · 책상 밖 ${x.v1.off.toFixed(2)} → ${x.cell.off.toFixed(2)} · N${x.cell.N}`);
  }
}
// 게임 경로 묶음: 1~12 = G-b(판정) · 13~22 = R-mid(보고 문턱)
const BANDS = Object.freeze([[1, 4], [5, 8], [9, 12], [13, 17], [18, 22]]);
const JUDGED = (band) => band[1] <= 12;
const nIn = (band, pose) => R(band[0], band[1]).filter((n) => pose !== 'low' || n >= Rules.LOW_POSE_MIN_N);
const AIMS = AIM_H.length * AIM_LAT.length;
// 같은 (n, seed, 조준) 짝으로 J* 대 v1 세 조건(b1 원 안비 · b2 책상 밖 · b3 원 밖)
function bandStats(A, B, ks, extra, flipAbs = 0) { // flipAbs > 0 = b1 허용 손실 max(10%, flipAbs 장) (R-rule 만)
  const sum = (M, f) => ks.reduce((s, k) => s + f(M.get(k)), 0), discs = sum(A, (r) => r.n);
  const v = { flip: sum(A, (r) => r.flip) / ks.length, off: sum(A, (r) => r.off) / discs, out: sum(A, (r) => r.out) / discs };
  const c = { flip: sum(B, (r) => r.flip) / ks.length, off: sum(B, (r) => r.off) / discs, out: sum(B, (r) => r.out) / discs };
  const fm = (M) => msOf(median(ks.map((k) => kv(M.get(k).rx.fm)))) * SLOW; // 화면 ms
  const b1 = c.flip >= v.flip - Math.max((1 - TOL.smallFlip) * v.flip, flipAbs), b2 = c.off <= v.off + TOL.smallOff, b3 = c.out <= v.out + TOL.smallOut;
  // 보고만: 묶음 안 장수별 원 안 평균비의 최저(묶음 평균이 한 장수의 하락을 가릴 수 있어서)
  const byN = new Map(); for (const k of ks) { const n = A.get(k).n; if (!byN.has(n)) byN.set(n, [0, 0]); const x = byN.get(n); x[0] += A.get(k).flip; x[1] += B.get(k).flip; }
  const minN = [...byN].map(([n, [a, b]]) => ({ n, r: a > 0 ? b / a : b > 0 ? Infinity : 1 })).sort((p, q) => p.r - q.r)[0];
  return { ...extra, N: ks.length, v1: v, cell: c, b1, b2, b3, ok: b1 && b2 && b3, fmScreen: [fm(A), fm(B)], minN };
}
// need: 'all' = 모든 묶음이 정확히 있어야(판정) · 'judged' = 1~12 묶음만 반드시, 13~22 는 둘 다 있으면 정확히(dry3) · null = 있는 것만(보고)
export function smallCalc(rows, stage, L, want = null, need = null) {
  const by = new Map(); // pose|band|lag → Map(n|seed|aim → row)
  for (const r of rows) {
    const m = r.key.match(/^([a-z0-9]+)\|j([0-9.]+)\|game\|(eye|low)\|(.*)$/);
    if (!m || m[1] !== stage) continue;
    const b = BANDS.findIndex(([a, z]) => r.n >= a && r.n <= z);
    const k = `${m[3]}|${b}|${m[2]}`;
    if (!by.has(k)) by.set(k, new Map());
    by.get(k).set(`${r.n}|${r.seed}|${m[4]}`, r);
  }
  const res = [];
  for (const pose of ['eye', 'low']) for (let b = 0; b < BANDS.length; b++) {
    const ns = nIn(BANDS[b], pose);
    if (!ns.length) continue;
    const A = by.get(`${pose}|${b}|0`), B = by.get(`${pose}|${b}|${L}`);
    const strict = want && (need === 'all' || (need === 'judged' && (JUDGED(BANDS[b]) || (A && B))));
    if (strict) {
      const exp = ns.length * AIMS * want.length, tag = `${stage} 게임 ${pose} ${BANDS[b].join('~')}장`;
      for (const [nm, M] of [['v1', A], [`jetLag ${L}`, B]]) {
        if (!M || M.size !== exp) throw new Error(`${tag} ${nm}: 줄 ${M ? M.size : 0}/${exp}`);
        for (const k of M.keys()) { const [n, s] = k.split('|').map(Number); if (!ns.includes(n) || !want.includes(s)) throw new Error(`${tag} ${nm}: 허용 밖 줄 ${k}`); }
      }
      for (const k of A.keys()) if (!B.has(k)) throw new Error(`${tag}: 짝 없음 ${k}`);
    }
    if (!A || !B) continue;
    const ks = [...A.keys()].filter((k) => B.has(k));
    res.push(bandStats(A, B, ks, { pose, band: [ns[0], ns[ns.length - 1]], judged: JUDGED(BANDS[b]) }));
  }
  return res;
}
const RULE_BANDS = Object.freeze([[2, 12], [13, 22]]);
// 숨 규칙 보고 줄(R-rule): 비율 × 묶음(2~12 · 13~22), 눈높이 · 조준 0.82 · 옆 0. need 'all' = 정확히 있어야(판정 때)
export function ruleCalc(rows, stage, L, want = null, need = null) {
  const by = new Map();
  for (const r of rows) {
    const m = r.key.match(/^([a-z0-9]+)\|j([0-9.]+)\|rule\|r([0-9.]+)\|/);
    if (!m || m[1] !== stage) continue;
    const b = RULE_BANDS.findIndex(([a, z]) => r.n >= a && r.n <= z);
    const k = `${m[3]}|${b}|${m[2]}`;
    if (!by.has(k)) by.set(k, new Map());
    by.get(k).set(`${r.n}|${r.seed}`, r);
  }
  const res = [];
  for (const rt of RULE_R) for (let b = 0; b < RULE_BANDS.length; b++) {
    const A = by.get(`${rt}|${b}|0`), B = by.get(`${rt}|${b}|${L}`);
    if (want && need === 'all') {
      const exp = (RULE_BANDS[b][1] - RULE_BANDS[b][0] + 1) * want.length, tag = `${stage} 숨 규칙 ${rt} ${RULE_BANDS[b].join('~')}장`;
      for (const [nm, M] of [['v1', A], [`jetLag ${L}`, B]]) {
        if (!M || M.size !== exp) throw new Error(`${tag} ${nm}: 줄 ${M ? M.size : 0}/${exp}`);
        for (const k of M.keys()) if (!want.includes(+k.split('|')[1])) throw new Error(`${tag} ${nm}: 허용 밖 줄 ${k}`);
      }
      for (const k of A.keys()) if (!B.has(k)) throw new Error(`${tag}: 짝 없음 ${k}`);
    }
    if (!A || !B) continue;
    res.push(bandStats(A, B, [...A.keys()].filter((k) => B.has(k)), { ratio: rt, band: RULE_BANDS[b] }, TOL.ruleFlipAbs));
  }
  return res;
}
const pp = (v) => `${(100 * v).toFixed(1)}%`;
const bandLine = (x, head) => `  ${head} 원 안 ${x.v1.flip.toFixed(2)} → ${x.cell.flip.toFixed(2)}장 ${x.b1 ? 'O' : 'X'} · 책상 밖(장당) ${pp(x.v1.off)} → ${pp(x.cell.off)} ${x.b2 ? 'O' : 'X'} · 원 밖(장당) ${pp(x.v1.out)} → ${pp(x.cell.out)} ${x.b3 ? 'O' : 'X'} · 첫 움직임(화면) ${x.fmScreen[0].toFixed(0)} → ${x.fmScreen[1].toFixed(0)} ms · 장수별 최저 비 ${x.minN.n}장 ${Number.isFinite(x.minN.r) ? x.minN.r.toFixed(2) : '∞'}(보고만) · N${x.N}`;
function smallReport(rows, stage, L) {
  const res = smallCalc(rows, stage, L), rule = ruleCalc(rows, stage, L);
  if (res.length) {
    console.log(`\n-- ${stage} 게임 경로 (Table.blow, 초록 숨 ${GREEN_MID}, 조준 높이 ${AIM_H.join('/')} × 옆 ${AIM_LAT.join('/')}, jetLag ${L} 대 v1): 1~12장 = G-b 판정 · 13~22장 = R-mid 보고 문턱`);
    for (const x of res) console.log(bandLine(x, `${x.judged ? 'G-b ' : 'R-mid'} ${x.pose.padEnd(3)} ${x.band.join('~')}장`));
  }
  if (rule.length) {
    console.log(`\n-- ${stage} 숨 규칙 R-rule 보고 문턱 (눈높이 · 조준 0.82 · 옆 0, 비율 ${RULE_R.join('/')}, jetLag ${L} 대 v1)`);
    for (const x of rule) console.log(bandLine(x, `비율 ${String(x.ratio).padEnd(4)} ${x.band.join('~')}장`));
  }
}
function report3(files) {
  const rows = readRows(files);
  const G = groupTakes(rows);
  for (const st of STAGE3) timingReport(G, st);
  const lagsOf = (st, part) => [...new Set(rows.filter((r) => r.key.startsWith(`${st}|`) && r.key.includes(part)).map((r) => +r.key.split('|')[1].slice(1)))].filter((x) => x > 0).sort((a, b) => a - b);
  for (const st of ['probe3', 'pilot3', 'gcore3']) if (rows.some((r) => r.key.startsWith(`${st}|`) && r.key.includes('|core|'))) for (const l of st === 'gcore3' ? [readChoice3().jetLag] : lagsOf(st, '|core|')) coreReport(rows, st, l);
  for (const st of ['probe3', 'pilot3', 'gsmall3']) if (rows.some((r) => r.key.startsWith(`${st}|`) && (r.key.includes('|game|') || r.key.includes('|rule|')))) {
    for (const l of st === 'gsmall3' ? [readChoice3().jetLag] : [...new Set([...lagsOf(st, '|game|'), ...lagsOf(st, '|rule|')])].sort((a, b) => a - b)) smallReport(rows, st, l);
  }
  if (rows.some((r) => r.key.startsWith('pilot3|'))) pilotCheck(rows.filter((r) => r.key.startsWith('pilot3|')));
}

// ───────────────────────── 시범 점검 · 고르기 · 판정 ─────────────────────────
function pilotCheck(P) {
  let bad = 0;
  const walk = (v) => { if (v === null || (typeof v === 'number' && !Number.isFinite(v))) bad++; else if (typeof v === 'object') for (const w of Object.values(v)) walk(w); };
  for (const r of P) { walk(r.rx); if (r.x) walk(r.x); }
  const cnt = {}; for (const r of P) { const k = r.key.split('|')[2] === 'core' || r.key.split('|')[2] === 'game' || r.key.split('|')[2] === 'rule' ? r.key.split('|')[2] : r.key.split('|')[1] === 'r1' ? 'r1' : 'take'; cnt[k] = (cnt[k] || 0) + 1; }
  const neg = P.filter((r) => /\|T[123]$/.test(r.key) && (r.rx.fm < 0 || r.rx.t10 < 0)).length;
  const order = P.filter((r) => r.rx.fm > 0 && r.rx.arr > 0 && r.rx.fm < r.rx.arr).length; // 바람이 닿기 전 첫 움직임 = 잡음 또는 버그
  const gust = P.filter((r) => r.key.includes('|rule|')), gustBad = gust.filter((r) => (r.ratio > 1) !== (r.blast > 0)).length;
  console.log(`\n-- pilot3 점검: 샷 ${P.length} (${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(' · ')}) · rx/x 의 NaN·null·∞ ${bad} · 3판 첫 움직임/10° 안 일어남 ${neg} · 첫 움직임이 바람 도달보다 이른 샷 ${order} · 숨 규칙 줄 돌풍 표시 어긋남 ${gustBad}/${gust.length} · 책상 밖 최대 ${Math.max(...P.map((r) => (r.x ? r.x.off : r.off)))}장`);
}
// 고르기(사전 등록): sel3(461~472) 12시드 중앙값 E 가 가장 작은 후보(0.1 ms 로 반올림해 비교), 같으면 jetLag 가 작은 쪽(v1 에 가까운 쪽). v1 은 후보 아님
//   + 귀무 N0 의 c: 같은 시드·같은 규칙으로 E(v1 + c) 최소(c ∈ 0~30 스텝, 같으면 작은 c). 배율 2.9·3.6 에서 고를 값은 보고만
// opt 는 dry3(설계 시드 줄로 배관 점검)만 쓴다. 실제 고르기는 opt 없이 sel3·461~472
export function choose3(files, { stage = 'sel3', seeds = SEEDS3.sel3 } = {}) {
  const G = groupTakes(readRows(files));
  const tab = [];
  for (const L of GRID3) {
    const g = G.get(`${stage}|${L}`);
    if (!g) throw new Error(`${stage} jetLag ${L} 줄 없음`);
    for (const ci of [1, 2, 3]) { const ks = [...g[ci].keys()].filter((x) => seeds.includes(x)); if (!sameSet(ks, seeds)) throw new Error(`${stage} jetLag ${L} 첨부${ci}: 시드 ${ks.length}/${seeds.length}`); }
    const o = timingOn(g, seeds);
    tab.push({ jetLag: L, E: +o.E.toFixed(3), Emax: +o.Emax.toFixed(3), Efm: +o.Efm.toFixed(3), Et10: +o.Et10.toFixed(3), medSteps: Object.fromEntries([1, 2, 3].map((ci) => [ci, { fm: o[ci].fm, t10: o[ci].t10 }])), q3: o[3].q3, ordFm: o.ordFm, ordT10: o.ordT10 });
  }
  if (tab.some((x) => !Number.isFinite(x.E))) throw new Error(`${stage}: 안 일어난 칸(∞)이 있는 줄 — 고르기 불가`);
  const bl = bestLag(G, stage, seeds), nb = bestShift(G.get(`${stage}|0`), seeds);
  const bySlow = Object.fromEntries(SLOWS.map((sl) => { const b = bestLag(G, stage, seeds, sl), n = bestShift(G.get(`${stage}|0`), seeds, sl); return [sl, { jetLag: b.L, E: +b.E.toFixed(3), nullC: n.c, nullE: +n.E.toFixed(3) }]; }));
  return {
    jetLag: bl.L, nullC: nb.c, nullE: +nb.E.toFixed(3),
    rule: `${stage} ${seeds[0]}~${seeds[seeds.length - 1]} ${seeds.length}시드 중앙값 E(세 판 × 첫 움직임·위¼ 10° 평균 절대 오차, 실물 ms, 배율 ${SLOW}) 최소, 0.1 ms 반올림 동률이면 작은 jetLag. v1(0) 은 후보 아님`,
    nullRule: `귀무 N0 = v1 시각 + c 스텝(세 판·두 시각 모두), 같은 시드·같은 E 최소 규칙, c ∈ 0~30, 동률이면 작은 c`,
    seeds: `${seeds[0]}~${seeds[seeds.length - 1]}`, table: tab, bySlow,
  };
}
function choose3Cmd(files) {
  assertFrozen3();
  const C = choose3(files);
  for (const x of C.table) console.log(`  jetLag ${String(x.jetLag).padEnd(6)} E ${x.E.toFixed(1)} (첫 ${x.Efm.toFixed(1)} · 10° ${x.Et10.toFixed(1)}) 최대 ${x.Emax.toFixed(1)} ms${x.jetLag === C.jetLag ? '  ★' : ''}`);
  console.log(`  귀무 N0 = v1 + ${C.nullC}스텝(${f1(msOf(C.nullC))} ms) E ${C.nullE.toFixed(1)} · 배율 민감도(보고만) ${SLOWS.map((sl) => `${sl}: ${C.bySlow[sl].jetLag}/+${C.bySlow[sl].nullC}`).join(' · ')}`);
  const txt = JSON.stringify(C, null, 1) + '\n';
  if (existsSync(CHOICE3) && readFileSync(CHOICE3, 'utf8') !== txt) throw new Error(`${CHOICE3_REL} 가 이미 있고 다름 — 다시 고르기 금지(사전 등록)`);
  mkdirSync(fileURLToPath(DATA3), { recursive: true });
  writeFileSync(CHOICE3, txt);
  console.log(`  → ${fileURLToPath(CHOICE3)} (eval3·gcore3·gsmall3 전에 커밋 — 커밋 전에는 그 단계들이 거부됨)`);
}
// 판정(사전 등록): eval3(473~496) 반응 시각 + gcore3(625~636) + gsmall3(641~664). 문턱 = TOL(동결)
//   판정(토글 단계로 가는가) = S-T1(배관) ∧ S-T2 ∧ G-a ∧ G-b ∧ G-c(배관). 해석 S-T3(상수 지연과 구별)·보고 문턱 R-mid·R-rule 은 이름에 늘 붙임
// opt 는 dry3 만 쓴다(설계 시드 줄, 단계 이름 probe3, dry = 보고 줄이 없으면 건너뜀). 실제 판정은 opt 없이 커밋된 choice3.json · eval3 · gcore3 · gsmall3
export function verdict3(files, opt = {}) {
  const rows = readRows(files), C = opt.choice || readChoice3(), L = C.jetLag, c = C.nullC;
  const st = opt.stage || { t: 'eval3', c: 'gcore3', s: 'gsmall3' }, want = opt.seeds || SEEDS3.eval3, wantC = opt.seedsC || SEEDS3.gcore3, wantS = opt.seedsS || SEEDS3.gsmall3;
  const G = groupTakes(rows), gv = G.get(`${st.t}|0`), gc = G.get(`${st.t}|${L}`);
  if (!gv || !gc) throw new Error(`${st.t} v1·J* 줄 없음`);
  for (const [nm, g] of [['v1', gv], [`jetLag ${L}`, gc]]) for (const ci of [1, 2, 3]) { const ks = [...g[ci].keys()].filter((s) => !opt.dry || want.includes(s)); if (!sameSet(ks, want)) throw new Error(`${st.t} ${nm} 첨부${ci}: 시드 ${ks.length}/${want.length}(정확히 ${want[0]}~${want[want.length - 1]})`); }
  const se = want;
  const ov = timingOn(gv, se), oc = timingOn(gc, se), on = timingOn(gv, se, { shift: c });
  const p = pairedE(gv, gc, se), p3 = pairedE(gv, gc, se, { oA: { shift: c } });
  const T1 = p.finite && p.lo > 0, T2 = oc.E <= TOL.E && oc.Emax <= TOL.Emax, T3 = p3.finite && p3.lo > 0;
  const core = coreCalc(rows, st.c, L, wantC);
  if ([20, 30, 40].some((n) => !core[n])) throw new Error(`${st.c} 줄 부족`);
  const small = smallCalc(rows, st.s, L, wantS, opt.dry ? 'judged' : 'all'), rule = ruleCalc(rows, st.s, L, wantS, opt.dry ? null : 'all');
  const judged = small.filter((x) => x.judged), mid = small.filter((x) => !x.judged);
  if (judged.length !== 5) throw new Error(`${st.s} G-b 묶음 ${judged.length}/5 (eye 1~4·5~8·9~12, low 6~8·9~12)`);
  if (!opt.dry && mid.length !== 4) throw new Error(`${st.s} R-mid 묶음 ${mid.length}/4 (eye·low 13~17·18~22)`);
  if (!opt.dry && rule.length !== RULE_R.length * RULE_BANDS.length) throw new Error(`${st.s} R-rule 묶음 ${rule.length}/${RULE_R.length * RULE_BANDS.length}`);
  const Ga = [20, 30, 40].every((n) => core[n].a1 && core[n].a2 && core[n].a3 !== false);
  const Gb = judged.every((x) => x.ok);
  const Gc = oc[3].q3 >= TOL.q3;
  const Rmid = mid.length ? mid.every((x) => x.ok) : null, Rrule = rule.length ? rule.every((x) => x.ok) : null;
  const pass = T1 && T2 && Ga && Gb && Gc;
  const ox = (v) => (v === null ? '없음' : v ? 'O' : 'X');
  const tail = ` | 해석 S-T3 상수 지연(v1 + ${c}스텝)과 구별 ${ox(T3)}${p3.finite ? '' : '(계산 불가: 안 일어난 칸 ∞)'} | 보고 문턱: 게임 13~22장 ${ox(Rmid)} · 숨 규칙 ${ox(Rrule)}`;
  const fails = [!T1 && (p.finite ? 'S-T1(배관) 개선 구간' : 'S-T1(배관) 계산 불가(안 일어난 칸 ∞)'), !T2 && (Number.isFinite(oc.E) ? 'S-T2 절대 오차' : 'S-T2 절대 오차(안 일어난 칸 ∞)'), !Ga && 'G-a 코어', !Gb && 'G-b 작은 더미', !Gc && 'G-c(배관) 첨부3 굳음'].filter(Boolean);
  const ms = (o) => Object.fromEntries([1, 2, 3].map((ci) => [ci, { fm: +msOf(o[ci].fm).toFixed(2), t10: +msOf(o[ci].t10).toFixed(2), fmSteps: o[ci].fm, t10Steps: o[ci].t10 }]));
  const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : String(v));
  const dose = GRID3.filter((x) => G.get(`${st.t}|${x}`)).map((x) => { const g = G.get(`${st.t}|${x}`), ks = want.filter((s) => [1, 2, 3].every((ci) => g[ci].has(s))); return ks.length === want.length ? { jetLag: x, E: r3(timingOn(g, ks).E), Emax: r3(timingOn(g, ks).Emax) } : { jetLag: x, missing: want.length - ks.length }; });
  const slow = Object.fromEntries(SLOWS.map((sl) => [sl, { v1: r3(timingOn(gv, se, { slow: sl }).E), cell: r3(timingOn(gc, se, { slow: sl }).E), null: r3(timingOn(gv, se, { shift: c, slow: sl }).E), Emax: r3(timingOn(gc, se, { slow: sl }).Emax), chosenOnSel: C.bySlow?.[sl] ?? null }]));
  const bandOut = (x) => ({ ...(x.pose ? { pose: x.pose } : { ratio: x.ratio }), band: x.band, N: x.N, v1: x.v1, cell: x.cell, b1: x.b1, b2: x.b2, b3: x.b3, ok: x.ok, fmScreenMs: x.fmScreen.map((v) => +v.toFixed(1)), minN: { n: x.minN.n, r: Number.isFinite(x.minN.r) ? +x.minN.r.toFixed(4) : String(x.minN.r) } });
  return {
    jetLag: L, nullC: c, pass, name: (pass ? '반응 시각 통과 · 가드 유지(물리 채택 아님 — 앱 시험 토글로 손맛 확인 단계)' : `실패: ${fails.join(' · ')}`) + tail,
    main: { T1, T2, dE: { d: r3(p.d), lo: r3(p.lo), hi: r3(p.hi), finite: p.finite }, E: { v1: r3(ov.E), cell: r3(oc.E), null: r3(on.E) }, Emax: { v1: r3(ov.Emax), cell: r3(oc.Emax), null: r3(on.Emax) }, ms: { v1: ms(ov), cell: ms(oc), null: ms(on) }, real: REAL, order: { fm: oc.ordFm, t10: oc.ordT10 } },
    interp: { T3, dE3: { d: r3(p3.d), lo: r3(p3.lo), hi: r3(p3.hi), finite: p3.finite }, rule: 'S-T3: eval3 같은 시드 짝 붓스트랩 E(N0 = v1 + nullC) − E(J*) 95% 하한 > 0' },
    guards: {
      a: Object.fromEntries([20, 30, 40].map((n) => { const x = core[n]; return [n, { flick: { v1: +mean([...x.v1.flick.values()]).toFixed(3), cell: +mean([...x.cell.flick.values()]).toFixed(3), r: +x.flickR.r.toFixed(4), ok: x.a1 }, sweep: { v1: +x.v1.sw.r.toFixed(4), cell: +x.cell.sw.r.toFixed(4), ok: x.a2 }, peel: { v1: +x.v1.peel.toFixed(4), cell: +x.cell.peel.toFixed(4), ok: x.a3 } }]; })),
      b: judged.map(bandOut),
      c: { q3med: +oc[3].q3.toFixed(2), ok: Gc },
    },
    reportGates: { mid: { ok: Rmid, bands: mid.map(bandOut) }, rule: { ok: Rrule, bands: rule.map(bandOut) } },
    report: {
      any15: { v1: [1, 2, 3].map((ci) => +ov[ci].any.toFixed(3)), cell: [1, 2, 3].map((ci) => +oc[ci].any.toFixed(3)) },
      rise: { v1: riseOn(gv, se), cell: riseOn(gc, se), realRise: { 1: 12, 2: 18, 3: 14 } },
      pct: { v1: pctOn(gv, se), cell: pctOn(gc, se), null: pctOn(gv, se, c) },
      loto: lotoOn(G, st.t, se), twoKnob: twoKnobOn(G, st.t, se), slow, dose,
    },
    tol: TOL, seeds: opt.dry ? { dry: `${want[0]}~${want[want.length - 1]}` } : { eval3: '473~496', gcore3: '625~636', gsmall3: '641~664' },
  };
}
function printVerdict(V) {
  const f = (v) => (typeof v === 'number' ? v.toFixed(1) : v);
  console.log(`\n== 판정 (jetLag ${V.jetLag}, 귀무 v1 + ${V.nullC}스텝): ${V.pass ? '통과' : '실패'} — ${V.name}`);
  console.log(`   S-T1(배관) ΔE(v1 − 칸) ${f(V.main.dE.d)} [${f(V.main.dE.lo)}, ${f(V.main.dE.hi)}] ms ${V.main.T1 ? '통과' : '실패'} · S-T2 E ${f(V.main.E.cell)} ≤ ${TOL.E} ∧ 최대 ${f(V.main.Emax.cell)} ≤ ${TOL.Emax} ${V.main.T2 ? '통과' : '실패'} (v1 E ${f(V.main.E.v1)} · 최대 ${f(V.main.Emax.v1)})`);
  console.log(`   해석 S-T3 ΔE(귀무 − 칸) ${f(V.interp.dE3.d)} [${f(V.interp.dE3.lo)}, ${f(V.interp.dE3.hi)}] ms ${V.interp.T3 ? 'O' : 'X'} (귀무 E ${f(V.main.E.null)} · 최대 ${f(V.main.Emax.null)})`);
  console.log(`   G-a 코어 ${[20, 30, 40].map((n) => `${n}장 ${V.guards.a[n].flick.ok && V.guards.a[n].sweep.ok && V.guards.a[n].peel.ok !== false ? 'O' : 'X'}(튕김비 ${V.guards.a[n].flick.r.toFixed(2)} · 튕김÷고정 ${V.guards.a[n].sweep.v1.toFixed(2)}→${V.guards.a[n].sweep.cell.toFixed(2)} · 벗겨짐 ${(100 * V.guards.a[n].peel.v1).toFixed(0)}→${(100 * V.guards.a[n].peel.cell).toFixed(0)}%)`).join(' ')}`);
  console.log(`   G-b 작은 더미 ${V.guards.b.filter((x) => x.ok).length}/${V.guards.b.length} · G-c(배관) 첨부3 위¼ 최대 중앙 ${V.guards.c.q3med}° ${V.guards.c.ok ? 'O' : 'X'} · 순서(보고만) 첫 ${V.main.order.fm ? 'O' : 'X'} 10° ${V.main.order.t10 ? 'O' : 'X'} · 15장(보고만) v1 ${V.report.any15.v1.map((v) => v.toFixed(1)).join('/')} → ${V.report.any15.cell.map((v) => v.toFixed(1)).join('/')}`);
  const bl = (b) => `${b.pose ?? `비율 ${b.ratio}`} ${b.band.join('~')}장 ${b.ok ? 'O' : 'X'}(${b.v1.flip.toFixed(2)}→${b.cell.flip.toFixed(2)} · 원 밖 ${pp(b.v1.out)}→${pp(b.cell.out)})`;
  console.log(`   보고 문턱 R-mid ${V.reportGates.mid.ok === null ? '없음' : V.reportGates.mid.bands.map(bl).join(' ')}`);
  console.log(`   보고 문턱 R-rule ${V.reportGates.rule.ok === null ? '없음' : V.reportGates.rule.bands.map(bl).join(' ')}`);
  const r = V.report;
  console.log(`   도달 뒤 반응(보고만, ms) 첫 − 도달 v1 ${[1, 2, 3].map((ci) => f1(r.rise.v1[ci].fmArr)).join('/')} → 칸 ${[1, 2, 3].map((ci) => f1(r.rise.cell[ci].fmArr)).join('/')} · 10° − 첫 v1 ${[1, 2, 3].map((ci) => f1(r.rise.v1[ci].rise)).join('/')} → 칸 ${[1, 2, 3].map((ci) => f1(r.rise.cell[ci].rise)).join('/')} (실물 12/18/14)`);
  console.log(`   실물 백분위(첫/10°, 보고만) 칸 ${[1, 2, 3].map((ci) => `${pc(r.pct.cell[ci].fm)}/${pc(r.pct.cell[ci].t10)}`).join(' · ')} · 귀무 ${[1, 2, 3].map((ci) => `${pc(r.pct.null[ci].fm)}/${pc(r.pct.null[ci].t10)}`).join(' · ')}`);
  if (r.loto) console.log(`   판 하나 빼기(보고만, 뺀 판 2칸 평균 오차 ms) ${r.loto.map((x) => `${x.h}번 jetLag ${x.L} ${f1(x.heldL)} · 귀무 +${x.c} ${f1(x.heldC)}`).join(' | ')}`);
  if (r.twoKnob) console.log(`   두 손잡이(보고만) jetLag ${r.twoKnob.L} + 상수 ${r.twoKnob.c}스텝 → E ${f1(r.twoKnob.E)}`);
  console.log(`   배율 민감도(보고만) ${SLOWS.map((sl) => `${sl}: v1 ${f(r.slow[sl].v1)} · 칸 ${f(r.slow[sl].cell)}(최대 ${f(r.slow[sl].Emax)}) · 귀무 ${f(r.slow[sl].null)}${r.slow[sl].chosenOnSel ? ` · 고르기 시드에서 고를 값 ${r.slow[sl].chosenOnSel.jetLag}/+${r.slow[sl].chosenOnSel.nullC}` : ''}`).join(' | ')}`);
  console.log(`   용량-반응(보고만) ${r.dose.map((x) => (x.missing ? `${x.jetLag}: 줄 ${x.missing}개 없음` : `${x.jetLag}: E ${f(x.E)}`)).join(' · ')}`);
}
// 배관 점검(설계 시드 줄만, 판정 아님): probe3 줄로 choose3(361~372) · verdict3(3판 361~384 24시드 · 코어 361~372 · 게임 361~390)를 그대로 돌려 본다
function dry3(files) {
  const C = choose3(files, { stage: 'probe3', seeds: R(361, 372) });
  console.log(`dry3 (설계 시드, 판정 아님) 고를 값 ${C.jetLag} · 귀무 +${C.nullC}스텝 · ${C.table.map((x) => `${x.jetLag}: E ${x.E.toFixed(1)}`).join(' · ')} · 배율 ${SLOWS.map((sl) => `${sl}→${C.bySlow[sl].jetLag}/+${C.bySlow[sl].nullC}`).join(' ')}`);
  for (const L of [C.jetLag, 0.02, 0.025, 0.03].filter((x, i, a) => a.indexOf(x) === i)) {
    try { printVerdict(verdict3(files, { choice: { ...C, jetLag: L }, stage: { t: 'probe3', c: 'probe3', s: 'probe3' }, seeds: R(361, 384), seedsC: R(361, 372), seedsS: R(361, 390), dry: true })); } catch (e) { console.log(`  jetLag ${L}: ${e.message}`); }
  }
}
function verdict3Cmd(files) {
  assertFrozen3();
  const V = verdict3(files);
  printVerdict(V);
  mkdirSync(fileURLToPath(DATA3), { recursive: true });
  writeFileSync(VERDICT3, JSON.stringify(V, null, 1) + '\n');
  console.log(`   → ${fileURLToPath(VERDICT3)}`);
}
// 비트 점검 p: pilot3 의 1차 시범 재실행 줄(r1) ≡ data/own/calib/pilot3.jsonl.gz (key·spec·tune·rx 뺀 모든 필드) — prog 경로 jetLag·쿠션이 그대로인지
export function bitcheck3(oursF, refF = fileURLToPath(new URL('./data/own/calib/pilot3.jsonl.gz', import.meta.url))) {
  const strip = ({ key, spec, meta, tune, rx, ...o }) => JSON.stringify(o);
  const ref = new Map(readRows(refF).map((r) => [`${r.key.replace(/^pilot\|/, '')}|${r.seed}`, strip(r)]));
  const ours = readRows(oursF).filter((r) => r.key.startsWith('pilot3|r1|'));
  let same = 0;
  for (const r of ours) if (ref.get(`${r.key.replace(/^pilot3\|r1\|/, '')}|${r.seed}`) === strip(r)) same++; else console.log('  다름', r.key, r.seed);
  const v1 = readRows(oursF).filter((r) => /^pilot3\|j0\|T[123]$/.test(r.key)); // 같은 v1 샷이 r1|v1 과도 같아야(관찰자·키 무관)
  let sv = 0; for (const r of v1) if (ref.get(`v1|${r.key.slice(-2)}|${r.seed}`) === strip(r)) sv++;
  const ok = ours.length === 27 && same === 27 && v1.length === 9 && sv === 9;
  console.log(`비트 점검 p: 1차 시범 재실행 ${same}/${ours.length} (기대 27) · pilot3|j0 ≡ 1차 v1 ${sv}/${v1.length} (기대 9) → ${ok ? '맞음' : '틀림'}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

// ───────────────────────── 자체 점검 self3 (샷 몇 개, 1분 안) ─────────────────────────
async function self3() {
  await SW.initPhysics();
  const V1 = await import('../../mockup/src/sim.js');
  await V1.initPhysics();
  const snap = (t) => t.liveDiscs().flatMap((d) => { const p = d.body.translation(), q = d.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; });
  const eq = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const out = [];
  const mk = (Mo, n, s, tune) => { if (Mo.setDiscH) Mo.setDiscH(0.11); const t = new Mo.Table(s * 7907 + n, tune); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(); return t; };
  // (a) jetLag 0 · 키 없음 · {} 는 같은 샷(상수 자세 eye/low, prog 3판)
  { let ok = 0, tot = 0;
    for (const [n, s] of [[3, 361], [12, 362], [20, 363]]) for (const low of [false, true]) {
      const run = (tune) => { const t = mk(SW, n, s, tune), c = t.pileCenter(); t.blow({ aim: { x: c.x, y: t.columnTop() * 0.8, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.95, ...(low ? { mouthY: 0.15 } : {}) }); t.runUntilSettled(); return snap(t); };
      const a = run(undefined), b = run({}), c = run({ jetLag: 0 }); tot++; if (eq(a, b) && eq(a, c)) ok++;
    }
    for (const ci of [1, 2, 3]) { const j = takeJob('probe3', 0, ci, 364), a = JSON.stringify(shotO(j)), b = JSON.stringify(shotO({ ...j, tune: { jetLag: 0 } })); tot++; if (a === b) ok++; }
    out.push(['(a) jetLag 0 ≡ 키 없음 ≡ {}', ok, tot]); }
  // (b) 상수 자세 지연의 뜻 = prog 경로의 뜻: blowLip + jetLag ≡ 같은 입·각 상수 prog(env 끝 뒤 0) + jetLag (최종 자세 비트 동일)
  { let ok = 0, tot = 0;
    for (const L of [0.01, 0.02, 0.03]) for (const [n, s] of [[5, 361], [12, 362], [20, 363]]) {
      const a = mk(SW, n, s, { jetLag: L }), b = mk(SW, n, s, { jetLag: L }), c = a.pileCenter(), T = b.T;
      const g = a.blowLip({ aim: { x: c.x, y: 0.3, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.9, mouthY: 0.5 });
      b.blowProg({ power: 0.9, dur: T.puffDuration, prog: (t) => ({ o: g.M, phi: g.phi, ux: 0, uz: -1, env: t < T.puffDuration ? Math.sin(Math.min(1, t / T.puffDuration) * Math.PI) : 0 }) });
      a.runUntilSettled(); b.runUntilSettled(); tot++; if (eq(snap(a), snap(b))) ok++;
    }
    // blowTable(반사 바람)은 축 거리가 반사 경로 길이가 아니라 미지원 → jetLag 와 함께면 throw
    { const thr = (tune) => { const t = mk(SW, 8, 361, tune), c = t.pileCenter(); try { t.blow({ aim: { x: c.x, y: 0, z: c.z + 1.2 }, dir: { x: 0, z: -1 }, power: 0.9, tableScoop: { s: 0.5 } }); for (let k = 0; k < 5; k++) t.step(); return false; } catch { return true; } };
      tot++; if (thr({ jetLag: 0.02 }) && !thr({})) ok++; }
    out.push(['(b) blowLip+지연 ≡ 상수 prog+지연 · blowTable+지연 거부', ok, tot]); }
  // (c) 공기가 닿기 전에는 아무 일도 없다: 기본 blow + 지연, 첫 바람(처리된 딱지) 전 스텝까지 = 숨 없이 같은 수만큼 돈 쌍둥이 / 숨 길이 = puffDuration + 12·jetLag
  { let ok = 0, tot = 0;
    for (const L of [0.02, 0.03]) for (const [n, s] of [[1, 365], [6, 366], [12, 367]]) {
      const a = mk(SW, n, s, { jetLag: L }), b = mk(SW, n, s, { jetLag: L }), c = a.pileCenter();
      a.blow({ aim: { x: c.x, y: a.columnTop() * 0.8, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.95 });
      let k = 0, first = -1, puffN = 0, pre = true;
      while (a.puff || k < 2) { if (a.puff) puffN++; a.step(); k++; if (first < 0 && a.lastHits && a.lastHits.length) first = k; if (first < 0) { b.step(); if (!eq(snap(a), snap(b))) pre = false; } }
      let tt = 0, want = 0; while (tt < a.T.puffDuration + L * 12) { want++; tt += a.T.dt; }
      tot++; if (pre && first > 1 && puffN === want) ok++; else console.log('  (c) 실패', L, n, { pre, first, puffN, want });
    }
    out.push(['(c) 도달 전 무변화 · 숨 길이', ok, tot]); }
  // (d) 관찰자는 읽기만: shotO/shotG 결과(rx 빼고) 같음 + 매 스텝 위¼ 10° ≤ ownclips 2스텝 표본 ≤ +1스텝
  { let ok = 0, tot = 0;
    for (const L of [0, 0.02]) for (const ci of [1, 2, 3]) {
      const j = takeJob('probe3', L, ci, 368), a = shotO(j), b = shotO(j, reactObs()), { rx, ...b0 } = b;
      const k10 = Math.round(a.x.on.t10 / DT);
      tot++; if (JSON.stringify(a) === JSON.stringify(b0) && rx.t10 > 0 && rx.t10 <= k10 && k10 <= rx.t10 + 1 && rx.fm > 0) ok++; else console.log('  (d) 실패', j.key, rx, a.x.on.t10);
    }
    for (const L of [0, 0.02]) for (const pose of ['eye', 'low']) { const j = { key: 'x', kind: 'game', n: 8, seed: 369, pose, hf: 0.82, lat: 0, ...(L ? { tune: { jetLag: L } } : {}) }; const a = shotG(j), { rx, ...b0 } = shotG(j, reactObs()); tot++; if (JSON.stringify(a) === JSON.stringify(b0) && rx) ok++; }
    for (const L of [0, 0.02]) { const j = { key: 'x', kind: 'game', n: 14, seed: 369, pose: 'eye', hf: 0.82, lat: 0, ratio: 1.1, ...(L ? { tune: { jetLag: L } } : {}) }; const a = shotG(j), { rx, ...b0 } = shotG(j, reactObs()); tot++; if (JSON.stringify(a) === JSON.stringify(b0) && rx && a.blast > 0) ok++; }
    out.push(['(d) 관찰자 읽기만 · 10° 표본 일치', ok, tot]); }
  // (e) 게임 경로 v1: simsweep ≡ mockup/src/sim.js (같은 shotG 를 두 물리로) — 초록 1~12 · 13~22 · 숨 규칙(약함·돌풍 = 조준 흔들림 난수까지)
  { let ok = 0, tot = 0;
    const J = [];
    for (const [n, s] of [[1, 370], [4, 371], [9, 372], [17, 370]]) for (const pose of ['eye', 'low']) if (pose === 'eye' || n >= Rules.LOW_POSE_MIN_N) J.push({ key: 'x', kind: 'game', n, seed: s, pose, hf: 0.82, lat: 0.4 });
    for (const [n, rt] of [[4, 0.6], [9, 1.1], [20, 1.2]]) J.push({ key: 'x', kind: 'game', n, seed: 371, pose: 'eye', hf: 0.82, lat: 0, ratio: rt });
    for (const j of J) { const a = shotG(j, null, SW), b = shotG(j, null, V1); tot++; if (JSON.stringify(a) === JSON.stringify(b)) ok++; else console.log('  (e) 실패', j.n, j.pose, j.ratio); }
    out.push(['(e) 게임 경로 v1 simsweep ≡ sim.js', ok, tot]); }
  // (f) 라우팅·시드·커밋 단언
  { const t = (f) => { try { f(); return false; } catch { return true; } };
    const cnt = (st, o) => buildJobs3(new Set([st]), 0.02, o).length;
    const blocks = Object.entries(SEEDS3), disjoint = blocks.every(([a, A], i) => blocks.every(([b, B], k) => k <= i || !A.some((x) => B.includes(x))));
    const fresh = blocks.every(([, A]) => !A.some(BURNED));
    const envRefused = ENV_BAN.every((k) => { const e0 = process.env[k]; process.env[k] = '1'; const r = t(() => jobs3(['sel3'])); if (e0 === undefined) delete process.env[k]; else process.env[k] = e0; return r; });
    const counts = cnt('sel3') === 216 && cnt('eval3') === 432 && cnt('pilot3') === 195 && cnt('probe3', { parts: 'take' }) === 540 && cnt('gcore3') === 1512 && cnt('gsmall3') === 15264;
    const seedAsserts = t(() => jobs3(['nope'])) && t(() => assertSeeds3([{ key: 'sel3|j0|T1', seed: 401 }])) && t(() => assertSeeds3([{ key: 'eval3|j0|T1', seed: 461 }])) && t(() => assertSeeds3([{ key: 'gcore3|j0|core|flick', seed: 601 }])) && t(() => assertSeeds3([{ key: 'gsmall3|j0|game|eye|h0.82|l0', seed: 625 }])) && t(() => assertSeeds3([{ key: 'probe3|j0|T1', seed: 905 }]));
    const head = git(['show', 'HEAD:package.json']);
    const helper = headSame('package.json', head) && !headSame('package.json', Buffer.concat([head, Buffer.from(' ')])) && !headSame('tools/coresweep/data/react3/__없음.json', Buffer.from('{}')) && t(() => assertCommitted3('tools/coresweep/data/react3/__없음.json'));
    let gate, gateNm;
    if (!existsSync(CHOICE3)) { // 고르기 전: 없으면 거부 → 커밋 안 된 choice3 도 거부(임시 파일, 끝나면 지움)
      const none = t(() => jobs3(['eval3'])) && t(() => jobs3(['gcore3'])) && t(() => jobs3(['gsmall3'])) && t(() => jobs3(['sel3', 'eval3'])) && !t(() => jobs3(['sel3']));
      let unc = false;
      writeFileSync(CHOICE3, JSON.stringify({ jetLag: 0.02, nullC: 9 }) + '\n');
      try { unc = t(() => jobs3(['eval3'])) && t(() => jobs3(['gcore3'])) && t(() => jobs3(['gsmall3'])) && t(() => readChoice3()); } finally { unlinkSync(CHOICE3); }
      gate = none && unc; gateNm = 'choice3 없음·커밋 안 됨 → eval3·gcore3·gsmall3 거부';
    } else if (headSame(CHOICE3_REL, readFileSync(CHOICE3))) { // 커밋된 뒤: 그대로 돈다 + CHOICE 덮어쓰기 거부
      const e0 = process.env.CHOICE; process.env.CHOICE = '0.03'; const envC = t(() => readChoice3()); if (e0 === undefined) delete process.env.CHOICE; else process.env.CHOICE = e0;
      gate = envC && jobs3(['eval3']).length === 432 && jobs3(['gcore3']).length === 1512 && jobs3(['gsmall3']).length === 15264; gateNm = '커밋된 choice3 → 가드 단계 샷 수 · CHOICE 거부';
    } else { gate = t(() => jobs3(['eval3'])) && t(() => readChoice3()); gateNm = 'choice3 있으나 커밋 안 됨/바뀜 → 거부'; }
    const r = disjoint && fresh && envRefused && counts && seedAsserts && helper && gate;
    if (!r) console.log('  (f) 실패', { disjoint, fresh, envRefused, counts, seedAsserts, helper, gate });
    let frozen; try { frozen = assertFrozen3(); } catch { frozen = false; }
    out.push([`(f) 라우팅·시드·커밋 단언(블록 서로소·소진 없음·환경 변수 거부·샷 수·git 단언·${gateNm}) [정보: 사전 등록 파일 동결 ${frozen ? '예' : '아니오(커밋 전)'}]`, r ? 1 : 0, 1]); }
  // (g) 판정 완전성·∞ 처리: 설계 원자료(커밋됨)로 dry 판정은 돌고, 시드가 하나라도 모자라면 throw · 안 일어난 칸(−1)이면 짝 구간 finite = false
  { const t = (f) => { try { f(); return false; } catch { return true; } };
    const P = ['take', 'core', 'small'].map((x) => fileURLToPath(new URL(`probe3_${x}.jsonl.gz`, DATA3)));
    let r = false;
    if (P.every(existsSync)) {
      const F = P.join(','), base = { choice: { jetLag: 0.02, nullC: 9 }, stage: { t: 'probe3', c: 'probe3', s: 'probe3' }, seeds: R(361, 384), seedsC: R(361, 372), seedsS: R(361, 390), dry: true };
      const okRun = !t(() => verdict3(F, base));
      const short = t(() => verdict3(F, { ...base, seedsC: R(361, 373) })) && t(() => verdict3(F, { ...base, seeds: R(361, 391) })) && t(() => verdict3(F, { ...base, seedsS: R(361, 391) }));
      const mkG = (fm) => { const g = { 1: new Map(), 2: new Map(), 3: new Map() }; for (const ci of [1, 2, 3]) for (const s of [1, 2, 3]) g[ci].set(s, { rx: { fm, t10: fm < 0 ? -1 : fm + 3, q3max: 50 }, x: { any: 0 } }); return g; };
      const inf = pairedE(mkG(5), mkG(-1), [1, 2, 3], { B: 50 });
      r = okRun && short && inf.finite === false && Number.isNaN(inf.lo);
      if (!r) console.log('  (g) 실패', { okRun, short, inf });
    }
    out.push(['(g) 판정 완전성(시드 모자라면 throw)·안 일어난 칸 ∞ → 구간 계산 불가', r ? 1 : 0, 1]); }
  let all = true;
  for (const [nm, ok, tot] of out) { console.log(`  ${nm}: ${ok}/${tot}`); if (ok !== tot) all = false; }
  console.log(`self3 ${all ? '맞음' : '틀림'} (먼저 sweepmap verify 9/9 · ownclips self 6/6 · self2)`);
  if (!all) process.exitCode = 1;
}

// ───────────────────────── 진입 ─────────────────────────
if (!isMainThread && workerData?.react3Worker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage(runOne(job)); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [cmd, ...a] = process.argv.slice(2);
  const stages = (process.env.STAGES || '').split(',').filter(Boolean);
  if (cmd === 'list') { const J = jobs3(stages); const c = {}; for (const j of J) { const k = j.key.split('|').slice(0, 2).join('|') + '|' + (j.key.split('|')[2] === 'rule' ? 'rule' : j.kind); c[k] = (c[k] || 0) + 1; } console.log(J.length, c); }
  else if (cmd === 'run') {
    if (!a[0]) throw new Error('run <out.jsonl> [W ≤ 2]');
    if (stages.some((x) => !RUN_FREE.has(x))) assertFrozen3(); // sel3 이후 = 사전 등록 커밋 뒤에만(코드·물리·규칙이 HEAD 와 같을 때)
    const J = jobs3(stages);
    await SW.initPhysics();
    await runJobs(J, a[0], +(a[1] || 2));
    report3(a[0]);
  } else if (cmd === 'report') report3(a[0]);
  else if (cmd === 'self3') await self3();
  else if (cmd === 'choose3') choose3Cmd(a[0]);
  else if (cmd === 'verdict3') verdict3Cmd(a[0]);
  else if (cmd === 'bitcheck3') bitcheck3(a[0], a[1]);
  else if (cmd === 'dry3') dry3(a[0]);
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

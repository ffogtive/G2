// tools/coresweep/ownclips.mjs — 재윤님이 직접 찍은 슬로모션 3개(2026-10-15)를 v1 게임 물리에 옮겨 같은 시드 짝으로 잰다.
//   첨부 1 IMG_6063 = 다 넘김(약 15/15) · 첨부 2 IMG_6062 = 위 일부(약 3/15) · 첨부 3 IMG_6064 = 0장(0/14).
//   물리 = simsweep.js(≡ mockup/src/sim.js, 손잡이 하나도 안 바꿈 — `node tools/sweepmap.mjs verify` 9/9 그대로). 설계서: docs/design/core-sweep.md
//
// 🧭 가설(측정 전, 미검증): 세 판을 가르는 것은 입 높이보다 '숨이 들린 더미를 세로 너머까지 받쳐 주는 시간'이다
//   (강한 숨 길이 · 들린 뒤에도 이어지는 숨 · 입이 오르기 시작하는 때). v1 이 실측 동작으로 다 넘김 > 위 일부 > 0장 순서를 내는지가 판가름이다.
//
// 실측값 = 영상 판독 2회(판독 A + 검산 B) 합의값. 얼굴이 담긴 프레임은 레포에 없다(스크래치에만). 시간: 아이폰 슬로 8배(240 fps,
//   조명 120 Hz 깜빡임·소리 대역·중력 포물선 세 근거) → 영상 1프레임 = 실물 4.17 ms. v1 화면 초 = 실물 초 × 3.21(v1 중력 38, 프루드).
//   → 영상 1프레임 = 화면 0.01338 s.
// 옮김 규칙(v1 단위 1 u = 25 mm = 딱지 반지름, 지름 D = 2 u):
//   - 장수 15(실물 14~15, ±2 는 N 이웃 칸). v1 15장 정착 높이 0.80 u = 0.40 D (실물 0.38·0.45·0.48 D).
//   - 입 높이(세로)는 '실물 더미 높이 H 의 몇 배'로 옮긴다: ym = (입 높이/H) × 그 샷 더미 꼭대기 top0. 입술의 세로 이동도 같은 배율(÷H × top0).
//   - 거리(가로)는 지름 D 로 옮긴다: L = (입술 앞끝 ~ 더미 가까운 가장자리)/D × 2 u. 입술의 가로 이동도 같은 배율.
//   - 숨 봉투 = 실측 소리 dB 매듭을 env = 10^((dB − REF)/40) 로(난류 소리 ∝ 속도^8, 힘 ∝ 속도² 가정, 미검증). REF = −24.4 dB(첨부 1·2 강한 숨 고원).
//     끝은 측정대로: 첨부 1·3 = 급차단(그 뒤 꼬리는 방 울림으로 보고 0), 첨부 2 = 7프레임에 걸쳐 잦아듦. 봉투는 q 에 곱해질 뿐이다(이득 계수 아님).
//     주의: dB 는 아이폰 자동 이득 기준 상대값이라 영상 사이 세기 비교는 약하다 → q 이웃 칸과 'norm'(영상마다 고원 = 1) 칸으로 본다.
//   - 고개: (1) 'r' 재생 = 실측 입술 경로(세계 좌표, 더미가 날아가도 입은 실측대로)·실측 고개 각을 그대로 따라간다.
//            제트 방향 4가지(사전 등록 1순위 = flat):
//              flat   수평 제트(v1 코어와 같은 가정. 입 높이만 실측)
//              face   얼굴 방향(눈→입술 선 각 − 15°: 똑바로 볼 때 그 선이 15° 앞으로 기운다고 가정, ±8°). 책상은 바람을 막지도 꺾지도 않는다(v1 그대로)
//              mirror face + 책상 거울 반사(축이 더미보다 먼저 책상에 닿으면 입을 책상 밑 거울 자리로, 위로 꺾인 제트 · 반사 손실 0.8 = v1 8차 reflLoss)
//              wall   face + 책상 따라 흐름(축이 먼저 책상에 닿으면 책상 높이 0.15 u 수평 제트로 · 자유 경로 길이는 그대로 · 손실 0.8)
//         (2) 'c' 문법 = v1 고개 쓸기 프리셋 {A, w, t0}: 입이 목 축 둘레로 오르고 제트가 함께 위로 꺾인다(sweepmap poseAt 'c').
//             t0 = 입술이 실제로 오르기 시작한 때 − 숨 시작, A = v1 입 상승이 실측 입술 상승(÷H × top0)과 같아지는 각, w = A ÷ 실측 상승 시간.
//   - 판정: v1 게임 판정(분필 원 r 3.2 안, faceUp > 0.2) 'flip' 과 함께, 실물 놀이에는 원이 없으므로 '어디든 그림이 위' flipAny(책상 밖 'off' 제외)를 주 지표로 쓴다.
//     결과 분류: 다 넘김 = flipAny ≥ 0.8·N, 0장 = flipAny ≤ 1, 그 사이 = 일부. '위 일부' = 일부이면서 넘어간 장이 쌓은 순서 위 절반에서 더 많음.
//   - 제트 도달 지연 jd (STAGES=jd, 2026-10-15 돌리기 전 사전 등록):
//       가설(미검증): v1 에 없는 '입 → 더미' 제트 도달 지연을 세 판에 같은 양의 Δ 로 넣으면 첨부1 > 첨부2 > 첨부3 순서가 나온다.
//       구현 = 힘 경로만: 숨 봉투 env(t) → env(t − Δ) (t < Δ 이면 0), 숨 길이 dur → dur + Δ. 입술 경로·고개 각·제트 방향은 실측 시각 그대로(자세는 안 옮김).
//       값: Δ_실물 ∈ {0, 10, 20, 30, 40} ms (화면 = × 3.21), 옮김 = 사전 등록 칸 flat q 0.85 + 민감도 q 0.7·1.0, 시드 401~424, 15장.
//       판정(주) = flat q 0.85 에서 1−2, 2−3 같은 시드 짝 차 95% 부트스트랩 구간이 둘 다 0 위. 보조 = 첨부1 다 넘김(≥0.8N)·15/15 비율(윌슨 95%),
//       첨부2 '위 일부'·첨부3 0장 비율, 위쪽 10° 시각(숨 시작 뒤, 실물 52/42/32 ms). 다중 비교: Δ 5 × q 3 = 15칸, 주 판정은 q 0.85 다섯 칸.
//       진단(판정 아님): Δ 31.25 ms(= 7.5프레임)는 옛 이웃 's-7.5'(자세를 7.5프레임 앞당김)와 시간 원점만 다른 같은 샷이다
//       (u = t − Δ 로 바꾸면 자세(u + Δ)·봉투(u) 가 s-7.5 와 같다. 다른 것: 힘 전에 12스텝 더 쉼, 스텝 위상 0.04 스텝) → 통계로 같아야 한다.
//   - 물리 보정 (STAGES=cal → choose → ho,rob,sk,gate · 2026-10-15 재윤님 '더 이상 촬영 못 함' → 실물 3판이 기준. 돌리기 전 사전 등록):
//       가설(미검증): v1 에 손잡이 3개(simsweep.js, 안 넘기면 비트 동일)를 더하면 같은 옮김(flat, q 0.85)으로 세 판을 함께 낸다.
//         jetLag (화면 s/u) 제트 수송 지연(얼린 경로: 자세·세기 모두 a·jetLag 전의 것) · tableCushion (배) 책상 쿠션 들기 · cushionFar (u) 공중 쿠션 감쇠(로켓 방지)
//       격자(거침, 4×4×4 = 64칸): jetLag {0, 0.01, 0.02, 0.03} · tableCushion {0, 1, 3, 8} · cushionFar {0(끔), 1.0, 0.4, 0.15}
//         (시범 391~393 세 번 뒤 고정: 쿠션을 '한 장 배수' → '기둥에 나눔' → '닿을 때 최대 exp(−틈/길이)' 로 고침(한 장만 밀면 빠져나가 39 u 로켓), tableCushion 범위 {0,2,6,15} → {0,1,3,8})
//       고르기 시드 401~412(12) · 평가(보류) 시드 413~436(24) · 시범(구현 점검만, 고르기·평가 밖) 391~393
//       목표(무차원, 어디든 그림 위 = flipAny):
//         P1 첨부1 ≥ 13/15 인 시드 ≥ 60% · P2 첨부2 1~5장 이면서 위 절반에서 더 많이(anyTop > anyBot) 인 시드 ≥ 60% · P3 첨부3 ≤ 1장 인 시드 ≥ 70%
//         S(시각·모양, 보조, 시드 중앙값): S1~3 판마다 위¼ 10° 가 실물 32~52 ms · S4 첨부1 맨 아래 장 이륙(가장 낮은 점 > 0.05 u)이 시드 ≥ 50% 이고 중앙값 54~85 ms
//           · S5 첨부1 맨 아래 장 최대 상승 중앙값(이륙한 시드) ≤ 1.5 u · S6 첨부1 착지(책상 위 딱지 평균 앞 이동) 4~8 u (= 2~4 D)
//       고르는 규칙(사전): (a) 맞춘 P 수 최대 → (b) min(P1−0.6, P2−0.6, P3−0.7) 최대 → (c) 맞춘 S 수 최대 → (d) v1 에서 가까운 칸(격자 번호 합 최소)
//       견고성(평가 시드): 손잡이 하나씩 ×0.9·×1.1, 실측 입력을 판 하나씩 거리 ±0.15 D(±0.3 u)·입 높이 ±0.2 H·고개 시각 ±10 ms(±2.4프레임)
//         → 순서(1−2·2−3 같은 시드 짝 차 95% 구간 > 0)가 모두 살아야 '견고'
//       실력 구조(sk, 첨부1 기하·평가 시드): 입술 상승 시작 숨 시작 +0/+40/+85(실측)/+130 ms × 숨 길이 100/200/310(실측) ms(급차단)
//         산 = +85 이 +0·+130 보다 많고(같은 시드 짝 차 95% > 0), +0 은 '위 일부', 숨 100 ms 는 ≤ 1장 ≥ 70%
//       코어 게이트(gate): sweepcheck 의 v|relfix(4×5) ÷ v|flick, 20·30·40장, 시드 601~612, v1 과 보정 칸
//
// 명령 (CPU 4코어 공유: 기본 2 일꾼. 15장 한 샷 약 0.2~0.4 s)
//   node tools/coresweep/ownclips.mjs self                      shotO ≡ sweepmap shot() (표준 숨·쓸기 6샷, 모든 필드 비트 동일) + 봉투 점검
//   node tools/coresweep/ownclips.mjs list                      단계별 샷 수
//   node tools/coresweep/ownclips.mjs run <out.jsonl> [W=2]     전 단계(이어 돌리기 가능). STAGES=ref,r,rn,c,fx,n 로 거르기 · STAGES=pb = 보조 탐침(기본 밖)
//                                                              STAGES=jd = 제트 도달 지연(기본 밖, 1,152샷 — Δ 0 은 'r' 기본 키와 같은 샷)
//   node tools/coresweep/ownclips.mjs report <out.jsonl[.gz][,…]>
//   물리 보정: STAGES=cal … run cal.jsonl → choose cal.jsonl(사전 등록 규칙 1칸) → CALF=cal.jsonl STAGES=ho,rob,sk[,gate] … run eval.jsonl
//             (GATEV1=40 = v1 게이트 줄은 40장만 돌리고 20·30장은 data/vf/chk601 의 v|relfix·v|flick 을 key 'gate|v1|…' 로 바꿔 씀, 비트 동일 확인)
//             node tools/coresweep/ownclips.mjs calreport <cal·eval·gate 파일들> · STAGES=pilot = 시범 391~393(구현 점검)
//             원자료 tools/coresweep/data/own/calib/ (cal401 · eval413 · gate_v1_from_chk601 · pilot3 = 지금 코드 / pilot1·2 = 고치기 전 쿠션 식이라 지금 코드로는 재현 안 됨, 기록용)
//   node tools/coresweep/ownclips.mjs path <clip> [jet]          한 영상의 옮긴 입·제트·봉투 시계열(화면 초) — 옮김 점검용
// 환경: SEEDS=401-424(기본) · KEYS=정규식(그 키만)
// 원자료: tools/coresweep/data/own/own401.jsonl.gz (기본 단계 4,776샷, 2 일꾼 약 9분) · probe401.jsonl.gz (STAGES=pb 96샷)
//         · jd401.jsonl.gz (STAGES=jd 1,152샷)
//   다시 보기: node tools/coresweep/ownclips.mjs report tools/coresweep/data/own/own401.jsonl.gz,tools/coresweep/data/own/probe401.jsonl.gz,tools/coresweep/data/own/jd401.jsonl.gz
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as SW from './simsweep.js';
import { shot, breathOf, alphaOf, poseAt, causeOf, GEO, regCell, pairedRatio, index, pairOf } from '../sweepmap.mjs';

const D2R = Math.PI / 180;
const FR = (1 / 240) * 3.21; // 화면 초 / 영상 프레임
const REF_DB = -24.4;
const FACE_OFF = 15; // 눈→입술 선의 중립 기울기(°, 가정)
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
const readRows = (files) => files.split(',').flatMap((f) => (existsSync(f) ? readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []));

// ───────────────────────── 실측 (px = 1080×1920 full 프레임, x 오른쪽 = 부는 쪽, y 아래) ─────────────────────────
// lips [프레임, x, y] (입 벌어진 곳/입술 앞끝; 첨부 3 의 y 는 아랫입술 중심) · pitch [프레임, 눈→입술 선 각°(+ = 얼굴 듦, 중립 오프셋 안 뺌)]
// dB [프레임, 프레임 RMS dB] — 마지막 [프레임, null] = 숨 끝(그 직전 매듭에서 env 를 직선으로 0 까지)
// ymf = 시작 입 높이 / 더미 높이 H, L0 = 시작 거리(u), plateau = 강한 숨 고원 dB(전력 평균)
export const CLIPS = {
  1: {
    name: 'IMG_6063 첨부1 다 넘김', real: { N: 15, flip: 15 }, onset: 126.5, Dpx: 135, Hpx: 52, ymf: 0.8, L0: 3.9, plateau: -24.4,
    // 입술 상승 시작 147(= 이륙), 끝 182 · 기울기 시작 136 · 이륙 147
    rise: [147, 182], tilt: 136,
    lips: [[120, 186, 1097], [126, 186, 1097], [136, 189, 1097], [146, 198, 1100], [147, 204, 1099], [150, 212, 1088], [152, 222, 1076], [154, 238, 1062], [156, 262, 1048], [158, 280, 1036], [160, 285, 1025], [162, 295, 1009], [164, 301, 997], [166, 303, 983], [168, 307, 974], [170, 305, 963], [174, 306, 946], [176, 303, 941], [182, 297, 930], [190, 292, 934], [200, 292, 940], [220, 292, 933]],
    pitch: [[100, -27], [120, -27], [124, -25], [126, -24], [130, -22.6], [134, -21], [137, -20.5], [140, -19.5], [142, -19], [145, -18], [146, -17.4], [147, -16], [148, -15], [150, -14.5], [152, -11], [154, -7], [156, 0], [158, 4], [160, 8], [162, 12], [164, 15], [166, 18], [168, 21], [170, 24], [172, 25], [174, 28], [176, 29.5], [178, 31], [180, 31.5], [182, 32.5], [186, 33.5], [190, 34], [198, 35], [220, 36.5]],
    dB: [[126.5, -60], [127, -31], [128, -29.3], [130, -22.9], [132, -23.3], [134, -26.4], [135, -22.3], [136, -24], [138, -24.9], [140, -22.3], [142, -25.4], [143, -22.7], [145, -28.1], [146, -24.4], [147, -27.3], [148, -29.3], [150, -29.7], [152, -31.2], [154, -31.8], [156, -33.2], [158, -38.5], [160, -34.6], [162, -37.2], [164, -36.5], [166, -37.9], [168, -37.7], [170, -38.5], [172, -34.1], [174, -37.9], [176, -39.6], [178, -37.8], [180, -38.1], [182, -38.1], [184, -39.3], [186, -35.2], [188, -35.4], [190, -36.1], [192, -34.9], [194, -33.2], [195, -31.5], [197, -28.5], [198, -30.3], [200, -30.2], [201, -36.5], [202, null]],
  },
  2: {
    name: 'IMG_6062 첨부2 위 일부', real: { N: 15, flip: 3 }, onset: 257, Dpx: 125, Hpx: 56, ymf: 0.6, L0: 2.75, plateau: -24.4,
    rise: [263, 310], tilt: 263,
    lips: [[250, 226, 1097], [256, 227, 1097], [258, 228, 1097], [260, 230, 1097], [262, 233, 1097], [263, 236, 1096], [264, 241, 1094], [266, 251, 1088], [268, 262, 1080], [270, 272, 1070], [272, 282, 1059], [274, 291, 1048], [276, 300, 1034], [278, 308, 1018], [280, 316, 1000], [282, 322, 983], [284, 327, 967], [286, 331, 949], [288, 333, 935], [292, 331, 906], [294, 328, 893], [296, 324, 881], [300, 316, 863], [304, 309, 849], [306, 305, 845], [310, 299, 840], [317, 293, 842], [320, 291, 846], [324, 291, 853], [330, 291, 865], [346, 290, 895]],
    // 판독 A 는 중립 15° 를 뺀 값 → 여기는 다시 더해 원값(첨부 1·3 과 같은 정의). 검산 B: 256 −18°, 316 +41° 와 맞음
    pitch: [[250, -20.6], [256, -19.8], [258, -19.3], [260, -18.3], [261, -17.9], [262, -17], [263, -16], [264, -14.5], [266, -11.4], [268, -8.4], [270, -5.5], [272, -2.6], [274, 0.6], [276, 4], [278, 7.4], [280, 11.3], [282, 14.8], [284, 18.3], [286, 21.9], [288, 24.7], [292, 29.6], [294, 31.7], [296, 33.5], [300, 36.4], [304, 39], [306, 39.7], [310, 41.1], [317, 42.3], [324, 42.4], [334, 42], [346, 41.5]],
    dB: [[256.5, -55], [257, -32.6], [258, -28.7], [260, -25], [261, -20.2], [262, -27.3], [263, -23.8], [264, -22.7], [266, -23.9], [268, -21], [270, -25], [272, -27.3], [274, -25], [276, -27.4], [278, -29.9], [280, -28.2], [282, -31.4], [284, -37.4], [286, -34.5], [288, -34.7], [292, -39.6], [294, -35.8], [296, -37.4], [300, -38.5], [304, -35.1], [306, -33.2], [310, -34.7], [317, -39.5], [320, -47.5], [324, null]],
  },
  3: {
    name: 'IMG_6064 첨부3 0장', real: { N: 14, flip: 0 }, onset: 399.3, Dpx: 129, Hpx: 62, ymf: 1.42, L0: 2.67, plateau: -28.9,
    rise: [406, 436], tilt: 403.5,
    lips: [[380, 324, 1108], [390, 339, 1120], [394, 348, 1124], [396, 357, 1124], [398, 366, 1127], [399, 374, 1127], [400, 385, 1125], [402, 388, 1127], [404, 413, 1124], [406, 423, 1119], [408, 423, 1116], [410, 430, 1112], [412, 443, 1105], [414, 455, 1096], [416, 460, 1092], [418, 463, 1083], [420, 468, 1073], [422, 473, 1065], [423, 473, 1061], [424, 474, 1058], [426, 475, 1053], [428, 476, 1049], [430, 475, 1047], [436, 474, 1043], [440, 472, 1044], [448, 467, 1050], [460, 456, 1059]],
    pitch: [[380, -24], [390, -22.3], [394, -20.7], [396, -18.9], [398, -17.3], [399, -16.2], [400, -14.4], [402, -12.1], [404, -9.9], [405, -8.5], [406, -6.5], [408, -4.8], [410, -2.9], [412, 0.5], [414, 2.4], [416, 6.3], [418, 7.2], [420, 9.5], [422, 10.9], [423, 11.9], [424, 12.6], [426, 13.7], [428, 14.5], [430, 14.9], [436, 17.1], [440, 17.5], [448, 16.8], [460, 14.4]],
    dB: [[399, -54], [399.3, -45], [399.5, -37.5], [400, -31.8], [402, -29.3], [404, -26.9], [405, -27.3], [405.5, -25.6], [406, -31.8], [407, -27.8], [408, -29.8], [410, -28.9], [411.5, -31], [412, -33.9], [414, -34.9], [416, -35.1], [418, -34.8], [420, -34.4], [422, -34], [422.6, -35], [423, null]],
  },
};

function lerpK(K, f) {
  if (f <= K[0][0]) return K[0].slice(1);
  for (let i = 1; i < K.length; i++) if (f <= K[i][0]) { const a = K[i - 1], b = K[i], u = (f - a[0]) / (b[0] - a[0]); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * u); }
  return K[K.length - 1].slice(1);
}

// 실측 숨 봉투. exp = dB→세기 지수(40: 힘 ∝ 소리^(1/4)), norm = 영상마다 강한 숨 고원 = 1(세기 차이를 빼고 모양만)
export function breathMeas(ci, { exp = 40, norm = false } = {}) {
  const C = CLIPS[ci], K = C.dB, last = K[K.length - 1][0], ref = norm ? C.plateau : REF_DB;
  const lin = (db) => Math.pow(10, (db - ref) / exp);
  return {
    dur: (last - C.onset) * FR,
    env: (t) => {
      const f = C.onset + t / FR;
      if (f >= last) return 0;
      if (f <= K[0][0]) return lin(K[0][1]);
      for (let i = 1; i < K.length; i++) if (f <= K[i][0]) {
        const a = K[i - 1], b = K[i], u = (f - a[0]) / (b[0] - a[0]);
        return b[1] === null ? lin(a[1]) * (1 - u) : lin(a[1] + (b[1] - a[1]) * u);
      }
      return 0;
    },
  };
}

// v1 'c' 입 상승이 dy(u) 가 되는 고개 각(°)
const riseC = (a) => { const r = a * D2R; return -GEO.PY * Math.cos(r) + GEO.PZ * Math.sin(r) + GEO.PY; };
const angleForRise = (dy) => { let lo = 0, hi = 89; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (riseC(m) > dy) hi = m; else lo = m; } return (lo + hi) / 2; };
// 실측 → v1 문법 {A, w, t0} (top0 = 그 샷 더미 꼭대기)
export function grammarOf(ci, top0) {
  const C = CLIPS[ci];
  const [f0, f1] = C.rise;
  const y0 = lerpK(C.lips, f0)[1], y1 = Math.min(...C.lips.filter((p) => p[0] >= f0 && p[0] <= f1 + 10).map((p) => p[2]));
  const A = angleForRise(((y0 - y1) / C.Hpx) * top0);
  const T = (f1 - f0) * FR;
  return { A: +A.toFixed(2), w: +(A / T).toFixed(1), t0: +((f0 - C.onset) * FR).toFixed(4) };
}

// ───────────────────────── 입·제트 프로그램 ─────────────────────────
// spec: { kin:'r'|'c', P, K, B (영상 번호), jet, shift(프레임, + = 고개가 숨보다 늦게), dL(u), dyf(× top0), exp, norm, breath:{kind..}(c 문법 rel 용), sweep(c), A0 }
function makeProgO(table, top0, spec) {
  const c = table.pileCenter();
  const zf = c.z + 1;
  const P = CLIPS[spec.P ?? spec.K];
  const ym = (P.ymf + (spec.dyf || 0)) * top0;
  const L = P.L0 + (spec.dL || 0);
  const br0 = spec.breath ? breathOf(spec.breath.kind, spec.breath.D, spec.breath.off) : breathMeas(spec.B ?? spec.K, { exp: spec.exp || 40, norm: !!spec.norm });
  // 제트 도달 지연 jd(실물 ms): 힘(숨 봉투)만 Δ 늦게 더미에 닿는다. 자세(입술 경로·고개 각·제트 방향)는 실측 시각 그대로 — 아래 prog 의 fk·al(t) 는 안 건드림.
  // jd 없음/0 이면 br = br0 (같은 객체 → 옛 샷과 비트 동일)
  const dS = ((spec.jd || 0) / 1000) * 3.21;
  let br = dS > 0 ? { dur: br0.dur + dS, env: (t) => (t < dS ? 0 : br0.env(t - dS)) } : br0;
  if (spec.cut) { const cS = (spec.cut / 1000) * 3.21, b1 = br; if (cS < b1.dur) br = { dur: cS, env: (t) => (t < cS ? b1.env(t) : 0) }; } // 실력 구조: 숨을 cut ms(실물)에서 급차단
  if (spec.kin === 'c') {
    const geo = { ...GEO, ym, L };
    const M0 = { x: c.x, y: ym, z: zf + L };
    const al = alphaOf(spec.sweep || {});
    return { br, prog: (t) => { const p = poseAt(al(t), 'c', geo, M0); return { o: p.o, phi: p.phi, ux: 0, uz: -1, env: br.env(t) }; } };
  }
  const K = CLIPS[spec.K];
  const [x0, y0] = lerpK(K.lips, K.onset);
  const su = 2 / K.Dpx, sv = top0 / K.Hpx;
  const jet = spec.jet || 'flat';
  return {
    br,
    prog: (t) => {
      const fk = K.onset + t / FR - (spec.shift || 0);
      const [x, y] = lerpK(K.lips, fk);
      const h = ym + (y0 - y) * sv;
      const dist = L - (x - x0) * su;
      let o = { x: c.x, y: h, z: zf + dist }, phi = 0, env = br.env(t);
      if (jet !== 'flat') {
        const pf = (lerpK(K.pitch, fk)[0] - FACE_OFF) * D2R;
        phi = pf;
        if ((jet === 'mirror' || jet === 'wall') && pf < -1e-3) {
          const sImp = h / Math.tan(-pf); // 입에서 책상에 닿는 곳까지 수평 거리
          if (sImp < dist) {
            env *= 0.8;
            if (jet === 'mirror') { o = { x: c.x, y: -h, z: zf + dist }; phi = -pf; }
            else { const free = h / Math.sin(-pf); o = { x: c.x, y: SW.TUNE.lipMinY, z: zf + (dist - sImp) + free }; phi = 0; }
          }
        }
      }
      return { o, phi, ux: 0, uz: -1, env };
    },
  };
}

function rot(q, v) { // sweepmap.mjs rot() 와 같은 식
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// ───────────────────────── 한 샷 (sweepmap shot() 과 같은 코드 + 프로그램 주입 + 읽기 전용 기록) ─────────────────────────
// job = sweepmap job 그대로(표준) 또는 { n, seed, q, spec } (옮김)
export function shotO(job) {
  SW.setDiscH(job.H || 0.11);
  const t = new SW.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(job.settleSteps || 600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const zf = c0.z + 1;
  let br, prog;
  if (job.spec) ({ br, prog } = makeProgO(t, top0, job.spec));
  else {
    br = breathOf(job.breath.kind, job.breath.D, job.breath.off);
    const geo = { ...GEO, ...(job.geo || {}) };
    const M0 = { x: c0.x, y: geo.ym, z: zf + geo.L };
    const al = alphaOf(job.sweep || {});
    if ((job.kin || 'c') !== 'c') throw new Error('표준 job 은 kin c 만');
    prog = (tt) => { const p = poseAt(al(tt), 'c', geo, M0); return { o: p.o, phi: p.phi, ux: 0, uz: -1, env: br.env(tt) }; };
  }
  t.blowProg({ prog, power: job.q, dur: br.dur });
  const live = t.liveDiscs();
  const bottom = live[0];
  const half = Math.floor(job.n / 2);
  let maxTiltBottom = 0, tLift = -1;
  let maxTB = 0, maxTT = 0, endTB = 0, tTop = -1, ttAtTop = -1;
  const halves = () => {
    let tb = 0, tt = 0;
    live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
    return [tb / Math.max(1, half) / D2R, tt / Math.max(1, job.n - half) / D2R];
  };
  const qi = live.map((_, k) => Math.min(3, Math.floor((4 * k) / job.n)));
  const qc = [0, 0, 0, 0]; for (const v of qi) qc[v]++;
  const quarters = () => {
    const s = [0, 0, 0, 0];
    live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); s[qi[k]] += Math.acos(Math.max(-1, Math.min(1, -u.y))); });
    return s.map((v, j) => v / Math.max(1, qc[j]) / D2R);
  };
  const on = { b10: -1, t10: -1, lo: -1 }; // lo = 맨 아래 장 이륙(가장 낮은 점 > 0.05 u) 시각
  const qmax = [0, 0, 0, 0];
  const y0b = bottom.body.translation().y;
  let botRise = 0, maxDisc = 0;
  const dtS = t.T.dt;
  const maxSteps = Math.ceil((job.maxSec || 8) / dtS);
  let i = 0, capped = 1, below = false;
  for (; i < maxSteps; i++) {
    const P = t.puff;
    let crossed = false;
    if (P && P.t > 0 && tTop < 0 && P.d && P.d.z < -1e-6) { const s = (zf - P.o.z) / P.d.z; if (P.o.y + s * P.d.y <= top0) below = true; else if (below) crossed = true; }
    t.step();
    const up = rot(bottom.body.rotation(), { x: 0, y: 1, z: 0 });
    const tilt = Math.acos(Math.min(1, Math.abs(up.y)));
    if (tilt > maxTiltBottom) maxTiltBottom = tilt;
    if (tLift < 0 && tilt > 5 * D2R) tLift = (i + 1) * dtS;
    if (crossed || i % 3 === 0) {
      const [tb, tt] = halves();
      if (tb > maxTB) maxTB = tb;
      if (tt > maxTT) maxTT = tt;
      endTB = tb;
      if (crossed) { tTop = (i + 1) * dtS; ttAtTop = tt; }
    }
    // ── 추가 기록(읽기만) ──
    if (i % 2 === 1) {
      const tn = (i + 1) * dtS, Q = quarters();
      for (let j = 0; j < 4; j++) if (Q[j] > qmax[j]) qmax[j] = Q[j];
      if (on.b10 < 0 && Q[0] >= 10) on.b10 = tn;
      if (on.t10 < 0 && Q[3] >= 10) on.t10 = tn;
      if (!bottom.off) botRise = Math.max(botRise, bottom.body.translation().y - y0b);
      if (on.lo < 0 && !bottom.off) { const ub = rot(bottom.body.rotation(), { x: 0, y: 1, z: 0 }), cb = Math.min(1, Math.abs(ub.y)); if (bottom.body.translation().y - (Math.sqrt(1 - cb * cb) + (SW.DISC_H / 2) * cb) > 0.05) on.lo = tn; }
      for (const d of live) if (!d.off) { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))) / D2R; if (a > maxDisc) maxDisc = a; }
    }
    if (!t.puff && i > 30 && t.isSettled()) { capped = 0; break; }
  }
  endTB = halves()[0];
  const flippedSet = new Set(t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d)).map((d) => d.id));
  const outs = t.liveDiscs().filter((d) => !t.inCircle(d)).length;
  const flip42 = t.liveDiscs().filter((d) => { if (d.off || t.faceUp(d) <= 0.2) return false; const p = d.body.translation(); return Math.hypot(p.x, p.z) <= 4.2; }).length;
  let flipBottom = 0, flipTop = 0, lean = 0;
  const zs = [];
  for (const d of t.liveDiscs()) {
    if (flippedSet.has(d.id)) { if (d.id < half) flipBottom++; else flipTop++; }
    const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 });
    if (Math.abs(u.y) < 0.9 && Math.abs(u.y) > 0.2) lean++;
    zs.push(d.body.translation().z - c0.z);
  }
  zs.sort((a, b) => a - b);
  const r = {
    n: job.n, seed: job.seed, flip: flippedSet.size, flip42, out: outs, flipBottom, flipTop, lean,
    fan: zs.length ? +(zs[zs.length - 1] - zs[0]).toFixed(3) : 0,
    fwd: zs.length ? +(-zs[Math.floor(zs.length / 2)]).toFixed(3) : 0,
    whole: flippedSet.size >= 0.7 * job.n ? 1 : 0,
    tilt0: +(maxTiltBottom / D2R).toFixed(1), tLift: +tLift.toFixed(3), top0: +top0.toFixed(3), steps: i, capped,
    maxTB: +maxTB.toFixed(1), endTB: +endTB.toFixed(1), maxTT: +maxTT.toFixed(1), tTop: +tTop.toFixed(3), ttAtTop: +ttAtTop.toFixed(1),
  };
  r.cause = causeOf(r);
  // 추가 필드 (shot() 에는 없음): 원 무관 뒤집힘(책상 위), 쌓은 순서 위/아래 절반별, 책상 밖, 4분의 1 최대 기울기·10° 시각, 맨 아래 장 최대 상승(u), 한 장 최대 기울기
  const onDesk = t.liveDiscs().filter((d) => !d.off);
  const fa = onDesk.filter((d) => t.faceUp(d) > 0.2);
  r.x = {
    any: fa.length, anyTop: fa.filter((d) => d.id >= half).length, anyBot: fa.filter((d) => d.id < half).length, off: job.n - onDesk.length,
    qmax: qmax.map((v) => +v.toFixed(1)), on: { b10: +on.b10.toFixed(3), t10: +on.t10.toFixed(3), ...(job.cal ? { lo: +on.lo.toFixed(3) } : {}) }, botRise: +botRise.toFixed(3), maxDisc: +maxDisc.toFixed(1),
    dist: +mean(onDesk.map((d) => -(d.body.translation().z - c0.z))).toFixed(2),
  };
  return r;
}

// ───────────────────────── 작업 ─────────────────────────
const SEEDS = () => { const [a, b] = (process.env.SEEDS || '401-424').split('-').map(Number); return R(a, b ?? a); };
const QS = [0.7, 0.85, 1.0];
const JETS = ['flat', 'face', 'mirror', 'wall'];
const lvl = (ci) => Math.pow(10, (CLIPS[ci].plateau - REF_DB) / 40); // 고원 세기비(첨부 3 = 0.77)
const rkey = (s, q) => `r|${s.jet}|P${s.P}K${s.K}B${s.B}|q${q}${s.shift ? `|s${s.shift}` : ''}${s.dL ? `|dL${s.dL}` : ''}${s.dyf ? `|dy${s.dyf}` : ''}${s.norm ? '|norm' : ''}${s.exp && s.exp !== 40 ? `|e${s.exp}` : ''}${s.jd ? `|j${s.jd}` : ''}`;
export const JD = [0, 10, 20, 30, 40]; // 제트 도달 지연 사전 등록 값(실물 ms)
const JD_EQ = 31.25; // 진단: 7.5프레임 × 4.1667 ms = 옛 이웃 's-7.5' 와 수식상 같은 샷
function pileTop(n, seed) { SW.setDiscH(0.11); const t = new SW.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t.columnTop(); }

export function makeJobs() {
  const J = [], st = new Set((process.env.STAGES || 'ref,r,rn,c,fx,n').split(','));
  if (['cal', 'pilot', 'ho', 'rob', 'sk', 'gate'].some((x) => st.has(x))) return calJobs(st); // 물리 보정 단계는 따로(시드 고정)
  const push = (key, n, s, q, extra) => J.push({ key, n, seed: s, q, ...extra });
  for (const s of SEEDS()) {
    const n = 15;
    if (st.has('ref')) { // v1 기본 기하(입 0.5 u·10 cm)에서 15장 참고: 게임 문법 고정 격자 + 코어 튕김
      for (const q of QS) for (const D of [0.3, 0.45, 0.6, 1.0]) push(`ref|fix|q${q}|D${D}`, n, s, q, { breath: { kind: 'rel', D, off: 0.04 }, kin: 'c', sweep: {} });
      const rc = regCell(n);
      push('ref|core', n, s, rc.q, { breath: { kind: 'pueok', D: 0.6 }, kin: 'c', sweep: rc.sweep });
    }
    for (const ci of [1, 2, 3]) {
      const base = { kin: 'r', P: ci, K: ci, B: ci };
      if (st.has('r')) for (const jet of JETS) for (const q of QS) { const sp = { ...base, jet }; push(rkey(sp, q), n, s, q, { spec: sp }); }
      if (st.has('rn')) for (const jet of ['flat', 'wall']) { // 이웃: 고개 시각 ±0.1 s(±7.5 프레임), 거리 ±1 u(±0.5 D), 입 높이 ±0.25·꼭대기, 영상마다 고원 = 1, dB 지수 25
        for (const sp of [{ shift: 7.5 }, { shift: -7.5 }, { dL: 1 }, { dL: -1 }, { dyf: 0.25 }, { dyf: -0.25 }, { norm: true }, { exp: 25 }]) { const s2 = { ...base, jet, ...sp }; push(rkey(s2, 0.85), n, s, 0.85, { spec: s2 }); }
      }
      if (st.has('fx')) for (const jet of ['flat', 'wall']) for (const P of [1, 2, 3]) for (const K of [1, 2, 3]) for (const B of [1, 2, 3]) { // 요인 맞바꾸기 27칸
        const sp = { kin: 'r', P, K, B, jet }; push(rkey(sp, 0.85), n, s, 0.85, { spec: sp });
      }
      if (st.has('c')) { // v1 문법 {A, w, t0} 로 옮김 (A·w 는 그 샷 꼭대기로 계산)
        const g = grammarOf(ci, pileTop(n, s));
        const C = CLIPS[ci], q0 = +(0.85 * lvl(ci)).toFixed(3);
        const relB = ci === 2 ? { kind: 'rel', D: +((317 - C.onset) * FR).toFixed(4), off: 0.094 } : { kind: 'rel', D: +(((ci === 1 ? 201 : 423) - C.onset) * FR).toFixed(4), off: 0.04 };
        const cs = (tag, q, sp) => push(`c|${ci}|${tag}`, n, s, q, { spec: { kin: 'c', P: ci, B: ci, ...sp }, meta: g });
        cs('base', 0.85, { sweep: g });
        cs('rel', q0, { sweep: g, breath: relB });
        cs('A0', 0.85, { sweep: {} });
        cs('q-', 0.85 * 0.85, { sweep: g }); cs('q+', +(0.85 * 1.15).toFixed(4), { sweep: g });
        cs('t-', 0.85, { sweep: { ...g, t0: Math.max(0, +(g.t0 - 0.1).toFixed(4)) } }); cs('t+', 0.85, { sweep: { ...g, t0: +(g.t0 + 0.1).toFixed(4) } });
        cs('L-', 0.85, { sweep: g, dL: -1 }); cs('L+', 0.85, { sweep: g, dL: 1 });
        cs('y-', 0.85, { sweep: g, dyf: -0.25 }); cs('y+', 0.85, { sweep: g, dyf: 0.25 });
        cs('A8', 0.85, { sweep: { ...g, A: 8 } }); // v1 코어처럼 꼭대기 근처까지만
      }
      if (st.has('pb') && ci === 1) { // 보조 탐침(기본 단계 밖, STAGES=pb): 첨부1 문법 t0 = 0(고개 각이 숨 전부터 들렸다는 해석) · 측정 오차 안 조합(입 −0.25·꼭대기, 첨부1 고개 늦게 / 2·3 일찍)
        const g = grammarOf(1, pileTop(n, s));
        push('c|1|t0z', n, s, 0.85, { spec: { kin: 'c', P: 1, B: 1, sweep: { ...g, t0: 0 } }, meta: g });
        for (const [k, sh] of [[1, 7.5], [2, -7.5], [3, -7.5]]) { const sp = { kin: 'r', P: k, K: k, B: k, jet: 'flat', dyf: -0.25, shift: sh }; push(`r|flat|P${k}K${k}B${k}|q0.85|dy-0.25|s${sh}`, n, s, 0.85, { spec: sp }); }
      }
      if (st.has('jd')) { // 제트 도달 지연(기본 단계 밖, STAGES=jd): 세 판 같은 Δ, 힘만 늦게. Δ 0 = 'r' 기본 키 그대로(다시 돌리면 own401 줄과 비트 동일해야 함)
        for (const q of QS) for (const jd of JD) { const sp = { ...base, jet: 'flat', ...(jd ? { jd } : {}) }; push(rkey(sp, q), n, s, q, { spec: sp }); }
        const sp = { ...base, jet: 'flat', jd: JD_EQ }; push(rkey(sp, 0.85), n, s, 0.85, { spec: sp }); // 진단: ≡ 'rn' s-7.5
      }
      if (st.has('n')) for (const nn of [13, 17]) {
        for (const jet of ['flat', 'wall']) { const sp = { ...base, jet }; J.push({ key: rkey(sp, 0.85), n: nn, seed: s, q: 0.85, spec: sp }); }
        const g = grammarOf(ci, pileTop(nn, s));
        J.push({ key: `c|${ci}|base`, n: nn, seed: s, q: 0.85, spec: { kin: 'c', P: ci, B: ci, sweep: g }, meta: g });
      }
    }
  }
  // 같은 (키, n, 시드) 중복 제거 (fx 대각선 = r 기본)
  const seen = new Set();
  return J.filter((j) => { const k = `${j.key}|${j.n}|${j.seed}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ───────────────────────── 물리 보정 (STAGES=cal|ho|rob|sk|gate, 맨 위 사전 등록) ─────────────────────────
export const CAL_GRID = { jetLag: [0, 0.01, 0.02, 0.03], tableCushion: [0, 1, 3, 8], cushionFar: [0, 1.0, 0.4, 0.15] };
const KN = ['jetLag', 'tableCushion', 'cushionFar'];
const tuneOf = (s) => Object.fromEntries(KN.filter((k) => s[k]).map((k) => [k, s[k]]));
const ctag = (s) => (KN.every((k) => !s[k]) ? 'v1' : `jl${s.jetLag || 0}|tc${s.tableCushion || 0}|cf${s.cushionFar || 0}`);
const MS = 1000 / 3.21; // 화면 s → 실물 ms
const FRMS = 1000 / 240; // 영상 1프레임 = 실물 ms
const med = (a) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : NaN; };
// 판마다 목표 지표 (rows = 그 판 시드 줄들)
function takeStats(ci, rows) {
  const n = rows.length;
  const hit = rows.filter((r) => (ci === 1 ? r.x.any >= 13 : ci === 2 ? r.x.any >= 1 && r.x.any <= 5 && r.x.anyTop > r.x.anyBot : r.x.any <= 1)).length;
  const lo = rows.map((r) => (r.x.on.lo > 0 ? r.x.on.lo * MS : NaN));
  return {
    n, rate: hit / n, hit, any: mean(rows.map((r) => r.x.any)), t10: med(rows.map((r) => (r.x.on.t10 > 0 ? r.x.on.t10 * MS : NaN))),
    pLo: lo.filter(Number.isFinite).length / n, lo: med(lo), rise: med(rows.filter((r) => r.x.on.lo > 0).map((r) => r.x.botRise)), dist: med(rows.map((r) => r.x.dist)),
    top: mean(rows.map((r) => r.x.anyTop)), bot: mean(rows.map((r) => r.x.anyBot)), maxRise: med(rows.map((r) => r.x.botRise)),
  };
}
const TH = [0, 0.6, 0.6, 0.7];
function scoreOf(st) { // st[1..3] = takeStats
  const pm = [1, 2, 3].map((ci) => st[ci].rate - TH[ci]);
  const nP = pm.filter((v) => v >= 0).length;
  const S = [1, 2, 3].map((ci) => st[ci].t10 >= 32 && st[ci].t10 <= 52);
  S.push(st[1].pLo >= 0.5 && st[1].lo >= 54 && st[1].lo <= 85, Number.isFinite(st[1].rise) && st[1].rise <= 1.5, st[1].dist >= 4 && st[1].dist <= 8);
  return { nP, margin: Math.min(...pm), nS: S.filter(Boolean).length, S, pm };
}
const gidx = (s) => KN.reduce((a, k) => a + CAL_GRID[k].indexOf(s[k] || 0), 0);
// 사전 등록 규칙으로 한 칸 고르기 (cal 줄만 씀)
export function chooseCal(files) {
  const rows = readRows(files).filter((r) => r.key.startsWith('cal|') && r.n === 15);
  const G = new Map();
  for (const r of rows) { const [, a, b, c, T] = r.key.split('|'); const k = `${a}|${b}|${c}`; if (!G.has(k)) G.set(k, { s: { jetLag: +a.slice(2), tableCushion: +b.slice(2), cushionFar: +c.slice(2) }, T: { 1: [], 2: [], 3: [] } }); G.get(k).T[+T.slice(1)].push(r); }
  const L = [...G.values()].map((g) => { const st = { 1: takeStats(1, g.T[1]), 2: takeStats(2, g.T[2]), 3: takeStats(3, g.T[3]) }; return { ...g, st, sc: scoreOf(st) }; });
  L.sort((x, y) => y.sc.nP - x.sc.nP || y.sc.margin - x.sc.margin || y.sc.nS - x.sc.nS || gidx(x.s) - gidx(y.s));
  return L;
}
const calSetting = () => { if (process.env.CAL) return JSON.parse(process.env.CAL); if (!process.env.CALF) throw new Error('CALF=<cal 원자료> 또는 CAL=<json> 필요'); return chooseCal(process.env.CALF)[0].s; };
const P6G = { kind: 'pueok', D: 0.6 };
function calJobs(st) {
  const J = [];
  const take = (key, ci, s, tune, sp = {}) => J.push({ key, n: 15, seed: s, q: 0.85, cal: 1, ...(Object.keys(tune).length ? { tune } : {}), spec: { kin: 'r', P: ci, K: ci, B: ci, jet: 'flat', ...sp } });
  if (st.has('cal')) for (const s of R(401, 412)) for (const jl of CAL_GRID.jetLag) for (const tc of CAL_GRID.tableCushion) for (const cf of CAL_GRID.cushionFar) {
    const S0 = { jetLag: jl, tableCushion: tc, cushionFar: cf };
    for (const ci of [1, 2, 3]) take(`cal|jl${jl}|tc${tc}|cf${cf}|T${ci}`, ci, s, tuneOf(S0));
  }
  if (st.has('pilot')) for (const s of R(391, 393)) for (const S0 of [{}, { tableCushion: 1 }, { tableCushion: 3 }, { tableCushion: 3, cushionFar: 0.15 }, { tableCushion: 8, cushionFar: 0.15 }, { tableCushion: 3, cushionFar: 0.4 }, { jetLag: 0.02, tableCushion: 3, cushionFar: 0.15 }, { jetLag: 0.02, tableCushion: 8, cushionFar: 0.15 }])
    for (const ci of [1, 2, 3]) take(`pilot|${ctag(S0)}|T${ci}`, ci, s, tuneOf(S0));
  const need = ['ho', 'rob', 'sk', 'gate'].some((x) => st.has(x));
  if (!need) return J;
  const C = calSetting(), tc = tuneOf(C), CT = ctag(C);
  console.error(`보정 칸 = ${JSON.stringify(C)}`);
  for (const s of R(413, 436)) {
    if (st.has('ho')) for (const ci of [1, 2, 3]) { take(`ho|${CT}|T${ci}`, ci, s, tc); take(`ho|v1|T${ci}`, ci, s, {}); }
    if (st.has('rob')) {
      for (const k of KN) if (C[k]) for (const [sg, f] of [['-', 0.9], ['+', 1.1]]) { const t2 = { ...tc, [k]: +(C[k] * f).toPrecision(6) }; for (const ci of [1, 2, 3]) take(`rob|${k}${sg}|T${ci}`, ci, s, t2); }
      for (const ci of [1, 2, 3]) for (const [nm, sp] of [['dL+', { dL: 0.3 }], ['dL-', { dL: -0.3 }], ['dy+', { dyf: 0.2 }], ['dy-', { dyf: -0.2 }], ['sh+', { shift: 2.4 }], ['sh-', { shift: -2.4 }]]) take(`rob|${nm}@${ci}|T${ci}`, ci, s, tc, sp);
    }
    if (st.has('sk')) for (const [cn, tt] of [[CT, tc], ['v1', {}]]) for (const rs of [0, 40, 85, 130]) for (const bl of [100, 200, 310]) {
      const sp = { ...(rs !== 85 ? { shift: +((rs - 85) / FRMS).toFixed(3) } : {}), ...(bl !== 310 ? { cut: bl } : {}) };
      take(`sk|${cn}|rs${rs}|bl${bl}`, 1, s, tt, sp);
    }
  }
  const v1ns = (process.env.GATEV1 || '20,30,40').split(',').map(Number); // v1 줄은 기존 원자료(data/vf/chk601 v|relfix·v|flick, 비트 동일)로 대신할 수 있음
  if (st.has('gate')) for (const n of [40, 30, 20]) for (const s of R(601, 612)) for (const [cn, tt] of [[CT, tc], ['v1', {}]].filter(([cn]) => cn !== 'v1' || v1ns.includes(n))) {
    const rc = regCell(n), T0 = Object.keys(tt).length ? { tune: tt } : {};
    for (const qq of [0.7, 0.85, 0.93, 1.0]) for (const h of [0.3, 0.4, 0.5, 0.6, 0.8]) J.push({ key: `gate|${cn}|relfix|q${qq}|h${h}`, n, seed: s, q: qq, kin: 'c', sweep: {}, breath: { kind: 'rel', D: +h.toFixed(4), off: 0.04 }, ...T0 });
    J.push({ key: `gate|${cn}|flick`, n, seed: s, q: rc.q, kin: 'c', sweep: rc.sweep, breath: P6G, ...T0 });
  }
  return J;
}

async function runJobs(jobs, of, W) {
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const keep = process.env.KEYS ? new RegExp(process.env.KEYS) : null;
  const todo = jobs.filter((j) => !done.has(tag(j)) && (!keep || keep.test(j.key))).sort((a, b) => b.n - a.n);
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { ownclipsWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 200 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ───────────────────────── 점검 ─────────────────────────
const SHOT_FIELDS = (r) => { const { x, key, meta, spec, ...rest } = r; return rest; };
async function selfTest() {
  await SW.initPhysics();
  const cases = [
    { n: 15, seed: 401, breath: { kind: 'rel', D: 0.45, off: 0.04 }, q: 0.85, kin: 'c', sweep: {} },
    { n: 15, seed: 402, breath: { kind: 'pueok', D: 0.6 }, q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0: 0.25 } },
    { n: 20, seed: 403, breath: { kind: 'rel', D: 0.3, off: 0.04 }, q: 1.0, kin: 'c', sweep: {}, geo: { ym: 1.3 } },
    { n: 30, seed: 404, breath: { kind: 'pueok', D: 0.6 }, q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0: 0.25 } },
    { n: 13, seed: 405, breath: { kind: 'rel', D: 0.4, off: 0.04 }, q: 0.93, kin: 'c', sweep: { A: 20, w: 120, t0: 0.1 }, geo: { L: 2.7 } },
    { n: 17, seed: 406, breath: { kind: 'puff' }, q: 0.95, kin: 'c', sweep: {} },
  ];
  let ok = 0;
  for (const j of cases) { const a = JSON.stringify(shot(j)), b = JSON.stringify(SHOT_FIELDS(shotO(j))); if (a === b) ok++; else console.log('다름', JSON.stringify(j), '\n  shot ', a, '\n  shotO', b); }
  // 'c' spec 경로 ≡ 표준 경로 (같은 기하·쓸기·rel 숨이면 같은 샷)
  const top = pileTop(15, 407);
  const spec = { kin: 'c', P: 1, B: 1, breath: { kind: 'rel', D: 0.5, off: 0.04 }, sweep: { A: 10, w: 80, t0: 0.2 } };
  const a2 = JSON.stringify(SHOT_FIELDS(shotO({ n: 15, seed: 407, q: 0.85, spec })));
  const b2 = JSON.stringify(shot({ n: 15, seed: 407, q: 0.85, breath: spec.breath, kin: 'c', sweep: spec.sweep, geo: { ym: CLIPS[1].ymf * top, L: CLIPS[1].L0 } }));
  const specOk = a2 === b2;
  if (!specOk) console.log('spec 경로 다름\n ', a2, '\n ', b2);
  // 봉투: 길이·최대·∫env, 문법 옮김
  for (const ci of [1, 2, 3]) {
    const b = breathMeas(ci); let mx = 0, I = 0; const h = 1 / 2400; for (let t = 0; t < b.dur; t += h) { const v = b.env(t); mx = Math.max(mx, v); I += v * h; }
    console.log(`  첨부${ci} 봉투 길이 ${b.dur.toFixed(3)} s(화면) = 실물 ${(b.dur / 3.21 * 1000).toFixed(0)} ms · 최대 ${mx.toFixed(2)} · ∫env ${I.toFixed(3)} · 문법(15장 꼭대기 ${top.toFixed(2)}) ${JSON.stringify(grammarOf(ci, top))}`);
  }
  // 제트 도달 지연: 자세는 jd 와 무관(비트 동일), 봉투는 정확히 Δ 늦음(t < Δ 이면 0), 길이 + Δ. jd 0 은 지연 없음과 같은 샷
  let jdOk = true;
  { const t = new SW.Table(401 * 7907 + 15); t.addPile(Array.from({ length: 15 }, (_, i) => i)); t.settle(600); const top0 = t.columnTop();
    for (const ci of [1, 2, 3]) for (const jd of [10, 30, JD_EQ]) {
      const a = makeProgO(t, top0, { kin: 'r', P: ci, K: ci, B: ci, jet: 'flat' }), b = makeProgO(t, top0, { kin: 'r', P: ci, K: ci, B: ci, jet: 'flat', jd }), dS = (jd / 1000) * 3.21;
      if (Math.abs(b.br.dur - a.br.dur - dS) > 1e-12) jdOk = false;
      for (let tt = 0; tt < b.br.dur; tt += 1 / 240) {
        const ga = a.prog(tt), gb = b.prog(tt);
        if (JSON.stringify(ga.o) !== JSON.stringify(gb.o) || ga.phi !== gb.phi) jdOk = false;
        if (gb.env !== (tt < dS ? 0 : a.br.env(tt - dS))) jdOk = false;
      }
    } }
  const z0 = JSON.stringify(SHOT_FIELDS(shotO({ n: 15, seed: 408, q: 0.85, spec: { kin: 'r', P: 2, K: 2, B: 2, jet: 'flat' } })));
  const z1 = JSON.stringify(SHOT_FIELDS(shotO({ n: 15, seed: 408, q: 0.85, spec: { kin: 'r', P: 2, K: 2, B: 2, jet: 'flat', jd: 0 } })));
  if (z0 !== z1) jdOk = false;
  console.log(`shotO ≡ shot() ${ok}/${cases.length} (모든 필드 비트 동일) · spec 'c' 경로 ≡ 표준 ${specOk ? '같음' : '다름'} · 제트 지연(자세 그대로·봉투 Δ 늦음·jd 0 ≡ 없음) ${jdOk ? '맞음' : '틀림'}`);
  if (ok !== cases.length || !specOk || !jdOk) process.exitCode = 1;
}

async function pathDump(ci, jet = 'flat') {
  await SW.initPhysics();
  SW.setDiscH(0.11);
  const t = new SW.Table(401 * 7907 + 15); t.addPile(Array.from({ length: 15 }, (_, i) => i)); t.settle(600);
  const top0 = t.columnTop(), zf = t.pileCenter().z + 1;
  const { br, prog } = makeProgO(t, top0, { kin: 'r', P: ci, K: ci, B: ci, jet });
  console.log(`첨부${ci} ${CLIPS[ci].name} · 15장 꼭대기 ${top0.toFixed(2)} u · jet ${jet} · 봉투 ${br.dur.toFixed(3)} s`);
  console.log('화면 s | 영상 프레임 | 입 높이 u (÷꼭대기) | 앞면까지 u | 제트° | 바람 자국(앞면) u | env');
  for (let tt = 0; tt <= br.dur + 0.3; tt += 0.04) {
    const g = prog(tt), dz = g.o.z - zf, hit = g.o.y + Math.tan(g.phi) * dz;
    console.log(`  ${tt.toFixed(2)} | ${(CLIPS[ci].onset + tt / FR).toFixed(1)} | ${g.o.y.toFixed(2)} (${(g.o.y / top0).toFixed(2)}) | ${dz.toFixed(2)} | ${(g.phi / D2R).toFixed(1)} | ${hit.toFixed(2)} | ${g.env.toFixed(2)}`);
  }
}

// ───────────────────────── 보고 ─────────────────────────
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const pr = (A, B, f = (r) => r.x.any) => { if (!A || !B) return null; const s = [...A.keys()].filter((x) => B.has(x)).sort((a, b) => a - b); return s.length ? pairedRatio(s.map((x) => f(A.get(x))), s.map((x) => f(B.get(x)))) : null; };
const dci = (p) => (p ? `${p.d >= 0 ? '+' : ''}${p.d.toFixed(1)} [${p.dlo.toFixed(1)}, ${p.dhi.toFixed(1)}]` : '-');
const cls = (r) => (r.x.any >= 0.8 * r.n ? 'all' : r.x.any <= 1 ? 'none' : 'part');
function stat(m) {
  const R2 = [...m.values()];
  const c = { all: 0, part: 0, none: 0, topPart: 0 };
  for (const r of R2) { const k = cls(r); c[k]++; if (k === 'part' && r.x.anyTop > r.x.anyBot) c.topPart++; }
  const N = R2.length;
  return {
    N, any: mean(R2.map((r) => r.x.any)), flip: mean(R2.map((r) => r.flip)), out: mean(R2.map((r) => r.out)), off: mean(R2.map((r) => r.x.off)),
    top: mean(R2.map((r) => r.x.anyTop)), bot: mean(R2.map((r) => r.x.anyBot)),
    pAll: c.all / N, pPart: c.part / N, pNone: c.none / N, pTopPart: c.topPart / N,
    q3: mean(R2.map((r) => r.x.qmax[3])), q0: mean(R2.map((r) => r.x.qmax[0])), bot5: mean(R2.map((r) => (r.tLift > 0 ? 1 : 0))), botUp: mean(R2.map((r) => (r.x.botRise > 0.2 ? 1 : 0))), botRise: mean(R2.map((r) => r.x.botRise)), dist: mean(R2.map((r) => r.x.dist)),
    t10: mean(R2.filter((r) => r.x.on.t10 > 0).map((r) => r.x.on.t10)), b10: mean(R2.filter((r) => r.x.on.b10 > 0).map((r) => r.x.on.b10)),
  };
}
const pct = (v) => `${Math.round(100 * v)}`.padStart(3) + '%';
function lineO(k, m) {
  const s = stat(m);
  return `  ${k.padEnd(34)} 어디든 ${s.any.toFixed(1).padStart(4)}장 (위반 ${s.top.toFixed(1)}/아래반 ${s.bot.toFixed(1)}) 원안 ${s.flip.toFixed(1).padStart(4)} 원밖 ${s.out.toFixed(1).padStart(4)} | 다 ${pct(s.pAll)} 일부 ${pct(s.pPart)}(위 ${pct(s.pTopPart)}) 0장 ${pct(s.pNone)} | 위¼최대 ${s.q3.toFixed(0).padStart(3)}° 아래¼ ${s.q0.toFixed(0).padStart(3)}° 맨아래 장 5°↑ ${pct(s.bot5)} 0.2 u↑ ${pct(s.botUp)} 최대 ${s.botRise.toFixed(1)} u | 위¼ 10° 실물 ${Number.isFinite(s.t10) ? (s.t10 / 3.21 * 1000).toFixed(0) : '-'} ms | 이동 ${s.dist.toFixed(1)} u  N${s.N}`;
}
function orderLine(tag, K, k1, k2, k3) {
  const A = K.get(k1), B = K.get(k2), C = K.get(k3);
  if (!A || !B || !C) return;
  const s = [A, B, C].map(stat);
  const d12 = pr(B, A), d23 = pr(C, B), d13 = pr(C, A); // 차 = 앞 − 뒤 (pairedRatio(xs, ys) → ys − xs)
  const ok = d12 && d23 && d12.dlo > 0 && d23.dlo > 0;
  const okw = s[0].any > s[1].any && s[1].any > s[2].any;
  const mode = `2번 일부(위) ${pct(s[1].pTopPart)} · 3번 0장 ${pct(s[2].pNone)} · 1번 다 넘김 ${pct(s[0].pAll)}`;
  console.log(`  ${tag.padEnd(26)} 1 / 2 / 3 = ${s.map((v) => v.any.toFixed(1)).join(' / ')}장 · 1−2 ${dci(d12)} · 2−3 ${dci(d23)} · 1−3 ${dci(d13)} → 순서 ${ok ? '재현(구간)' : okw ? '점 추정만' : '아님'} · ${mode}`);
}
// 비율 95% 구간(윌슨) · 실물 위쪽 10° 시각(숨 시작 뒤 ms, 06 §2)
const wilson = (k, n) => { const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
const p0 = (v) => `${Math.round(100 * v)}%`;
// 같은 시드 짝 차(앞 − 뒤) 부트스트랩 구간, 수준 lv (주 판정 다섯 칸 본페로니 = 99%)
function pairDiff(A, B, lv = 0.99, nb = 10000) {
  const s = [...A.keys()].filter((x) => B.has(x)).sort((a, b) => a - b), d = s.map((x) => A.get(x).x.any - B.get(x).x.any), n = d.length, Rr = SW.mulberry32(20261015), out = [];
  for (let b = 0; b < nb; b++) { let t = 0; for (let i = 0; i < n; i++) t += d[Math.floor(Rr() * n)]; out.push(t / n); }
  out.sort((a, b) => a - b);
  return [out[Math.floor(((1 - lv) / 2) * nb)], out[Math.min(nb - 1, Math.floor((1 - (1 - lv) / 2) * nb))]];
}
function jdReport(K) {
  const jk = (ci, q, d) => `r|flat|P${ci}K${ci}B${ci}|q${q}${d ? `|j${d}` : ''}`;
  console.log('-- 제트 도달 지연 (STAGES=jd, 사전 등록): 힘(숨 봉투)만 Δ 늦게 닿음 · 입·고개 자세는 실측 시각 그대로 · flat 제트 · 세 판 같은 Δ (Δ 0 = 위 r 기본 칸)');
  console.log('   판정(주) = q 0.85 에서 1−2·2−3 같은 시드 짝 차 95% 구간이 둘 다 0 위. 위¼ 10° = 숨 시작 뒤 실물 ms(Δ 포함), 실물은 52 / 42 / 32 ms');
  for (const q of QS) {
    console.log(`   q ${q}${q === 0.85 ? ' (사전 등록 칸)' : ' (민감도)'}`);
    for (const d of JD) {
      const ks = [1, 2, 3].map((ci) => jk(ci, q, d)), ms = ks.map((k) => K.get(k));
      if (ms.some((m) => !m)) continue;
      orderLine(`Δ ${d} ms`, K, ...ks);
      const A = [...ms[0].values()], nA = A.filter((r) => r.x.any >= 0.8 * r.n).length, n15 = A.filter((r) => r.x.any >= r.n).length;
      const [lo, hi] = wilson(nA, A.length), [lo2, hi2] = wilson(n15, A.length);
      const t10 = ms.map((m) => { const s = stat(m); return Number.isFinite(s.t10) ? ((s.t10 / 3.21) * 1000).toFixed(0) : '-'; });
      const bf = q === 0.85 ? (() => { const a = pairDiff(ms[0], ms[1]), b = pairDiff(ms[1], ms[2]); return ` · 본페로니(5칸) 99%: 1−2 [${a.map((v) => v.toFixed(1)).join(', ')}] 2−3 [${b.map((v) => v.toFixed(1)).join(', ')}] → ${a[0] > 0 && b[0] > 0 ? '유지' : '깨짐'}`; })() : '';
      console.log(`      첨부1 다 넘김(≥0.8N) ${nA}/${A.length} = ${p0(nA / A.length)} [${p0(lo)}, ${p0(hi)}] · 15/15 ${n15}/${A.length} [${p0(lo2)}, ${p0(hi2)}] · 위¼ 10° ${t10.join(' / ')} ms${bf}`);
    }
  }
  console.log('   q 0.85 칸 자세히:');
  for (const d of JD) for (const ci of [1, 2, 3]) { const k = jk(ci, 0.85, d); if (K.has(k)) console.log(lineO(k, K.get(k))); }
  const eq = [1, 2, 3].map((ci) => [K.get(jk(ci, 0.85, JD_EQ)), K.get(`r|flat|P${ci}K${ci}B${ci}|q0.85|s-7.5`)]);
  if (eq.every(([a]) => a)) {
    console.log(`   진단: Δ ${JD_EQ} ms(힘만 7.5프레임 늦게) 와 옛 이웃 's-7.5'(자세만 7.5프레임 앞당김)는 시간 원점만 다른 같은 샷(스텝 위상 0.04 스텝 차·힘 전 12스텝 더 쉼만 다름)`);
    orderLine(`Δ ${JD_EQ} ms`, K, ...[1, 2, 3].map((ci) => jk(ci, 0.85, JD_EQ)));
    eq.forEach(([a, b], i) => { if (!b) return; const s = [...a.keys()].filter((x) => b.has(x)), same = s.filter((x) => a.get(x).x.any === b.get(x).x.any).length; console.log(`      첨부${i + 1}: Δ ${stat(a).any.toFixed(1)} · s-7.5 ${stat(b).any.toFixed(1)}장 · 짝 차 ${dci(pr(b, a))} · 같은 장수 ${same}/${s.length} 시드`); });
  }
}
function report(files) {
  const M = index(readRows(files));
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n);
    console.log(`\n══ ${n}장 (시드 ${[...[...K.values()][0].keys()].sort((a, b) => a - b).join(',').replace(/^(\d+).*,(\d+)$/, '$1~$2')})`);
    const keys = [...K.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const grp = (pre) => keys.filter((k) => k.startsWith(pre));
    if (grp('ref|').length) { console.log('-- 참고: v1 기본 기하(입 0.5 u, 10 cm) 15장'); for (const k of grp('ref|')) console.log(lineO(k, K.get(k))); }
    if (grp('r|').length) {
      console.log('-- (1) 재생: 실측 입술 경로 + 실측 숨 봉투 (P=시작 위치, K=입·고개 움직임, B=숨, 모두 같은 영상이면 그 영상)');
      for (const k of grp('r|').filter((k) => /P(\d)K\1B\1\|q[\d.]+$/.test(k))) console.log(lineO(k, K.get(k)));
      console.log('   순서 검정 (어디든 뒤집힌 장, 같은 시드 짝 차 [95%]):');
      for (const jet of JETS) for (const q of QS) orderLine(`${jet} q${q}`, K, `r|${jet}|P1K1B1|q${q}`, `r|${jet}|P2K2B2|q${q}`, `r|${jet}|P3K3B3|q${q}`);
      for (const jet of ['flat', 'wall']) {
        const sfx = ['|s7.5', '|s-7.5', '|dL1', '|dL-1', '|dy0.25', '|dy-0.25', '|norm', '|e25'];
        if (!K.has(`r|${jet}|P1K1B1|q0.85${sfx[0]}`)) continue;
        console.log(`   이웃 (${jet}, q 0.85): s = 고개를 숨보다 늦게(+)·일찍(−) 7.5프레임(화면 0.1 s), dL = 거리 ±1 u, dy = 입 높이 ±0.25·꼭대기, norm = 영상마다 고원 1, e25 = dB 지수 25`);
        for (const sf of sfx) orderLine(`${jet}${sf}`, K, `r|${jet}|P1K1B1|q0.85${sf}`, `r|${jet}|P2K2B2|q0.85${sf}`, `r|${jet}|P3K3B3|q0.85${sf}`);
        for (const ci of [1, 2, 3]) console.log(`     첨부${ci}: ` + sfx.map((sf) => { const m = K.get(`r|${jet}|P${ci}K${ci}B${ci}|q0.85${sf}`); return m ? `${sf.slice(1)} ${stat(m).any.toFixed(1)}` : ''; }).join(' · '));
        if (jet === 'flat' && K.has('r|flat|P2K2B2|q0.85|dy0.25') && K.has('r|flat|P1K1B1|q0.85|dy-0.25')) { // 06 §4: 판 하나만 dy 이웃 행으로 바꾼 조합(사후 조합, 다중 비교 보정 없음)
          console.log('   입 높이 조합 (flat, q 0.85, 사후 조합·다중 비교 보정 없음): 판 하나만 dy 이웃 행으로 바꿈');
          orderLine('2번만 dy+0.25', K, 'r|flat|P1K1B1|q0.85', 'r|flat|P2K2B2|q0.85|dy0.25', 'r|flat|P3K3B3|q0.85');
          orderLine('1번 dy−0.25·2번 dy+0.25', K, 'r|flat|P1K1B1|q0.85|dy-0.25', 'r|flat|P2K2B2|q0.85|dy0.25', 'r|flat|P3K3B3|q0.85');
        }
      }
      for (const jet of ['flat', 'wall']) {
        const fx = (P, Kk, B) => K.get(`r|${jet}|P${P}K${Kk}B${B}|q0.85`);
        if (![1, 2, 3].every((P) => [1, 2, 3].every((Kk) => [1, 2, 3].every((B) => fx(P, Kk, B))))) continue;
        console.log(`   요인 맞바꾸기 (${jet}, q 0.85, 27칸): 한 요인만 그 영상 값, 나머지 둘은 9조합 평균 → 주효과 (어디든 장)`);
        const me = (which) => [1, 2, 3].map((v) => mean([1, 2, 3].flatMap((a) => [1, 2, 3].map((b) => stat(which === 'P' ? fx(v, a, b) : which === 'K' ? fx(a, v, b) : fx(a, b, v)).any))));
        for (const w of ['P', 'K', 'B']) { const e = me(w); console.log(`     ${w === 'P' ? 'P 시작 위치' : w === 'K' ? 'K 입·고개 움직임' : 'B 숨 봉투'}: 1 / 2 / 3 = ${e.map((v) => v.toFixed(1)).join(' / ')}  (폭 ${(Math.max(...e) - Math.min(...e)).toFixed(1)})`); }
        console.log('     첨부 1 에서 한 요인만 바꾸면 (어디든 장, 첨부1 짝 차):');
        const b1 = fx(1, 1, 1);
        for (const [lab, m] of [['P←2', fx(2, 1, 1)], ['P←3', fx(3, 1, 1)], ['K←2', fx(1, 2, 1)], ['K←3', fx(1, 3, 1)], ['B←2', fx(1, 1, 2)], ['B←3', fx(1, 1, 3)]]) console.log(`       ${lab} ${stat(m).any.toFixed(1)}장 ${dci(pr(b1, m))}`);
        console.log('     첨부 3 에서 한 요인만 첨부 1 로 바꾸면:');
        const b3 = fx(3, 3, 3);
        for (const [lab, m] of [['P←1', fx(1, 3, 3)], ['K←1', fx(3, 1, 3)], ['B←1', fx(3, 3, 1)], ['P·K←1', fx(1, 1, 3)], ['K·B←1', fx(3, 1, 1)], ['P·B←1', fx(1, 3, 1)]]) console.log(`       ${lab} ${stat(m).any.toFixed(1)}장 ${dci(pr(b3, m))}`);
      }
    }
    if (keys.some((k) => /\|j[\d.]+$/.test(k))) jdReport(K);
    const pb = ['c|1|t0z','r|flat|P1K1B1|q0.85|dy-0.25|s7.5', 'r|flat|P2K2B2|q0.85|dy-0.25|s-7.5', 'r|flat|P3K3B3|q0.85|dy-0.25|s-7.5'].filter((k) => K.has(k));
    if (pb.length) { console.log('-- 보조 탐침 (STAGES=pb)'); for (const k of pb) console.log(lineO(k, K.get(k))); orderLine('flat dy−0.25 · 1 늦게/2·3 일찍', K, pb[1], pb[2], pb[3]); }
    if (grp('c|').length) {
      console.log('-- (2) v1 문법 {A, w, t0} 로 옮김 (입이 목 축 둘레로 오르고 제트가 함께 꺾임, 숨 = 실측 봉투)');
      for (const ci of [1, 2, 3]) {
        const b = K.get(`c|${ci}|base`); if (!b) continue;
        const g = [...b.values()][0].meta;
        console.log(`   첨부${ci}: A ${g?.A}° w ${g?.w}°/s t0 ${g?.t0} s (시드 첫 줄)`);
        for (const k of grp(`c|${ci}|`)) console.log(lineO(k, K.get(k)) + (k.endsWith('|base') ? '' : `  ÷base 차 ${dci(pr(b, K.get(k)))}`));
      }
      console.log('   순서 검정:');
      for (const tg of ['base', 'rel', 'A0', 'q-', 'q+', 't-', 't+', 'L-', 'L+', 'y-', 'y+', 'A8']) orderLine(`c ${tg}`, K, `c|1|${tg}`, `c|2|${tg}`, `c|3|${tg}`);
    }
  }
}

// ───────────────────────── 물리 보정 보고 ─────────────────────────
const fm = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '-');
function takeLine(tag, st, sc) {
  const p = (ci) => `${Math.round(100 * st[ci].rate)}%`.padStart(4);
  return `  ${tag.padEnd(26)} P1 ${p(1)} P2 ${p(2)} P3 ${p(3)} | 장 ${[1, 2, 3].map((ci) => st[ci].any.toFixed(1)).join(' / ')} (2번 위반 ${st[2].top.toFixed(1)}·아래반 ${st[2].bot.toFixed(1)})`
    + ` | 위¼10° ${[1, 2, 3].map((ci) => fm(st[ci].t10)).join('/')} ms | 1번 이륙 ${Math.round(100 * st[1].pLo)}% ${fm(st[1].lo)} ms 상승 ${fm(st[1].rise, 1)} u 착지 ${fm(st[1].dist, 1)} u`
    + (sc ? ` | P ${sc.nP}/3 여유 ${sc.margin.toFixed(2)} S ${sc.nS}/6` : '');
}
const byKey = (rows) => { const M = new Map(); for (const r of rows) { if (!M.has(r.key)) M.set(r.key, new Map()); M.get(r.key).set(r.seed, r); } return M; };
const st3 = (K, pre) => { const o = {}; for (const ci of [1, 2, 3]) { const m = K.get(`${pre}|T${ci}`); if (!m) return null; o[ci] = takeStats(ci, [...m.values()]); } return o; };
function orderCI(A, B, C) { // 1−2, 2−3 같은 시드 짝 차 95%
  const d12 = pr(B, A), d23 = pr(C, B);
  return { d12, d23, ok: !!(d12 && d23 && d12.dlo > 0 && d23.dlo > 0) };
}
function calReport(files) {
  const rows = readRows(files).filter((r) => r.n === 15 || r.key.startsWith('gate|'));
  const K = byKey(rows.filter((r) => !r.key.startsWith('gate|')));
  const pil = [...new Set([...K.keys()].filter((k) => k.startsWith('pilot|')).map((k) => k.replace(/\|T\d$/, '')))];
  if (pil.length) { console.log('-- 시범(시드 391~393, 구현 점검만)'); for (const p of pil) { const s = st3(K, p); if (s) console.log(takeLine(p.slice(6), s, scoreOf(s))); } }
  if ([...K.keys()].some((k) => k.startsWith('cal|'))) {
    const L = chooseCal(files);
    console.log(`\n-- 고르기 격자 (시드 401~412, ${L.length}칸, 사전 등록 규칙 순) · 목표 P1 ≥ 60% · P2 ≥ 60% · P3 ≥ 70%`);
    const nMet = [0, 0, 0, 0]; for (const g of L) nMet[g.sc.nP]++;
    console.log(`   P 맞춘 수 분포: 0개 ${nMet[0]} · 1개 ${nMet[1]} · 2개 ${nMet[2]} · 3개 ${nMet[3]}칸 · 판별 최고율 P1 ${Math.max(...L.map((g) => g.st[1].rate)).toFixed(2)} · P2 ${Math.max(...L.map((g) => g.st[2].rate)).toFixed(2)} · P3 ${Math.max(...L.map((g) => g.st[3].rate)).toFixed(2)}`);
    L.slice(0, 12).forEach((g, i) => console.log(takeLine(`${i === 0 ? '★' : ' '}${ctag(g.s)}`, g.st, g.sc)));
    const v = L.find((g) => ctag(g.s) === 'v1'); if (v) console.log(takeLine(' v1 (손잡이 0)', v.st, v.sc) + `  (순위 ${L.indexOf(v) + 1})`);
    for (const k of KN) { // 손잡이 하나만 켠 칸
      for (const val of CAL_GRID[k].slice(1)) { const g = L.find((x) => ctag(x.s) === ctag({ [k]: val })); if (g) console.log(takeLine(` ${k}=${val} 만`, g.st, g.sc)); }
    }
    // P1 이 가장 높은 칸 (다 넘김이 어디까지 가능한가)
    const b1 = [...L].sort((x, y) => y.st[1].rate - x.st[1].rate || y.st[1].any - x.st[1].any)[0];
    console.log(takeLine(` P1 최고 ${ctag(b1.s)}`, b1.st, b1.sc));
    const b2 = [...L].sort((x, y) => y.st[2].rate - x.st[2].rate || y.st[3].rate - x.st[3].rate)[0];
    console.log(takeLine(` P2 최고 ${ctag(b2.s)}`, b2.st, b2.sc));
    // 06 §5.2 배타성: P1 이 되는 칸과 P2 가 되는 칸이 겹치지 않는가 · 낮은 이륙 칸
    const corr = (a, b) => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; a.forEach((v, i) => { sab += (v - ma) * (b[i] - mb); saa += (v - ma) ** 2; sbb += (b[i] - mb) ** 2; }); return sab / Math.sqrt(saa * sbb); };
    const hp1 = L.filter((g) => g.st[1].rate >= 0.5), hp2 = L.filter((g) => g.st[2].rate >= 0.25);
    const nOrd = L.filter((g) => g.st[1].any > g.st[2].any && g.st[2].any > g.st[3].any).length;
    console.log(`   배타: P1 ≥ 50% ${hp1.length}칸 → 첨부2 최소 ${fm(Math.min(...hp1.map((g) => g.st[2].any)), 1)}장·P2 최대 ${p0(Math.max(0, ...hp1.map((g) => g.st[2].rate)))} · P2 ≥ 25% ${hp2.length}칸 → 첨부1 최대 ${fm(Math.max(...hp2.map((g) => g.st[1].any)), 1)}장`
      + ` · 칸 평균 첨부1·2 장수 상관 ${corr(L.map((g) => g.st[1].any), L.map((g) => g.st[2].any)).toFixed(2)} · 1−2 최대 ${fm(Math.max(...L.map((g) => g.st[1].any - g.st[2].any)), 1)}장 · 점 추정 순서(1>2>3) ${nOrd}/${L.length}칸`);
    const low = L.filter((g) => g.st[1].pLo >= 0.5 && g.st[1].rise <= 1.5).sort((x, y) => x.st[1].rise - y.st[1].rise);
    console.log(`   낮은 이륙(1번 이륙 ≥ 50%·상승 ≤ 1.5 u) ${low.length}칸: ${low.map((g) => `${ctag(g.s)} ${p0(g.st[1].pLo)} ${fm(g.st[1].lo)} ms ${fm(g.st[1].rise, 1)} u 2번 ${g.st[2].any.toFixed(1)}장`).join(' · ')} · S4·S5 함께 맞춘 칸 ${L.filter((g) => g.sc.S[3] && g.sc.S[4]).length}`);
    console.log(`   ★ 고른 칸 = ${JSON.stringify(L[0].s)}`);
  }
  const hoK = [...K.keys()].filter((k) => k.startsWith('ho|') && !k.startsWith('ho|v1')).map((k) => k.replace(/\|T\d$/, ''))[0];
  if (hoK) {
    console.log('\n-- 평가(보류 시드 413~436, 24)');
    for (const pre of [hoK, 'ho|v1']) {
      const s = st3(K, pre); if (!s) continue;
      const sc = scoreOf(s); console.log(takeLine(pre.slice(3), s, sc));
      const ord = orderCI(K.get(`${pre}|T1`), K.get(`${pre}|T2`), K.get(`${pre}|T3`));
      console.log(`     P 윌슨 95%: ${[1, 2, 3].map((ci) => { const [lo, hi] = wilson(s[ci].hit, s[ci].n); return `P${ci} ${s[ci].hit}/${s[ci].n} [${p0(lo)}, ${p0(hi)}]`; }).join(' · ')} · 순서 1−2 ${dci(ord.d12)} 2−3 ${dci(ord.d23)} → ${ord.ok ? '재현(구간)' : '아님'}`);
      console.log(`     S: 위¼10° ${sc.S.slice(0, 3).map((b) => (b ? 'O' : 'X')).join('')} · 이륙 ${sc.S[3] ? 'O' : 'X'} · 상승 ${sc.S[4] ? 'O' : 'X'} · 착지 ${sc.S[5] ? 'O' : 'X'} · 1번 맨아래 최대 상승 중앙 ${fm(s[1].maxRise, 2)} u`);
    }
    const robs = [...new Set([...K.keys()].filter((k) => k.startsWith('rob|')).map((k) => k.replace(/\|T\d$/, '')))];
    if (robs.length) {
      console.log('-- 견고성 (평가 시드): 순서 1−2·2−3 [95%] · P 비율');
      const base = (ci) => K.get(`${hoK}|T${ci}`);
      let alive = 0, tot = 0;
      for (const rk of robs) {
        const only = rk.match(/@(\d)$/); const m = (ci) => (only ? (+only[1] === ci ? K.get(`${rk}|T${ci}`) : base(ci)) : K.get(`${rk}|T${ci}`));
        if (![1, 2, 3].every((ci) => m(ci))) continue;
        const o = orderCI(m(1), m(2), m(3)); tot++; if (o.ok) alive++;
        const s = { 1: takeStats(1, [...m(1).values()]), 2: takeStats(2, [...m(2).values()]), 3: takeStats(3, [...m(3).values()]) };
        console.log(`  ${rk.slice(4).padEnd(16)} 장 ${[1, 2, 3].map((ci) => s[ci].any.toFixed(1)).join(' / ')} · 1−2 ${dci(o.d12)} · 2−3 ${dci(o.d23)} → ${o.ok ? '유지' : '깨짐'} · P ${[1, 2, 3].map((ci) => `${Math.round(100 * s[ci].rate)}%`).join('/')}`);
      }
      console.log(`  순서 유지 ${alive}/${tot}`);
    }
  }
  const sks = [...new Set([...K.keys()].filter((k) => k.startsWith('sk|')).map((k) => k.slice(3, k.indexOf('|rs'))))];
  for (const cn of sks) {
    console.log(`\n-- 실력 구조 (첨부1 기하, 평가 시드) ${cn}: 행 = 입술 상승 시작(숨 시작 뒤 ms), 열 = 숨 길이 100/200/310 ms · 어디든 장 (위반/아래반) [0장≤1 비율]`);
    const g = (rs, bl) => K.get(`sk|${cn}|rs${rs}|bl${bl}`);
    for (const rs of [0, 40, 85, 130]) console.log(`  +${String(rs).padStart(3)} ms  ` + [100, 200, 310].map((bl) => { const m = g(rs, bl); if (!m) return '-'; const R2 = [...m.values()]; return `${mean(R2.map((r) => r.x.any)).toFixed(1).padStart(4)} (${mean(R2.map((r) => r.x.anyTop)).toFixed(1)}/${mean(R2.map((r) => r.x.anyBot)).toFixed(1)}) [${Math.round(100 * R2.filter((r) => r.x.any <= 1).length / R2.length)}%] 이륙 ${Math.round(100 * R2.filter((r) => r.x.on.lo > 0).length / R2.length)}%`; }).join(' | '));
    const pk = g(85, 310), e0 = g(0, 310), l130 = g(130, 310);
    if (pk && e0 && l130) {
      const a = pr(e0, pk), b = pr(l130, pk);
      const e0s = [...e0.values()], part = e0s.filter((r) => r.x.any >= 1 && r.x.any < 0.8 * r.n && r.x.anyTop > r.x.anyBot).length / e0s.length;
      const sh = [...g(85, 100).values()], sh0 = sh.filter((r) => r.x.any <= 1).length / sh.length;
      console.log(`  산: +85 − +0 ${dci(a)} · +85 − +130 ${dci(b)} → ${a.dlo > 0 && b.dlo > 0 ? '산(구간)' : a.d > 0 && b.d > 0 ? '산(점 추정만)' : '산 아님'} · +0 '위 일부' ${Math.round(100 * part)}% · 숨 100 ms(+85) ≤1장 ${Math.round(100 * sh0)}%`);
    }
  }
  const GK = byKey(rows.filter((r) => r.key.startsWith('gate|')).map((r) => ({ ...r, key: `${r.n}|${r.key}` })));
  if (GK.size) {
    console.log('\n-- 코어 게이트 (시드 601~612): 원 안 뒤집힘 flip · 최선 고정(rel 4×5, 같은 시드에서 고름) ÷ 튕김(flick)');
    const cns = [...new Set([...GK.keys()].map((k) => k.split('|').slice(2).join('|').replace(/\|(relfix\|.*|flick)$/, '')))];
    for (const n of [20, 30, 40]) for (const cn of cns) {
      const ks = [...GK.keys()].filter((k) => k.startsWith(`${n}|gate|${cn}|relfix|`));
      if (!ks.length || !GK.get(`${n}|gate|${cn}|flick`)) continue;
      const mf = (k) => mean([...GK.get(k).values()].map((r) => r.flip));
      const best = ks.sort((a, b) => mf(b) - mf(a))[0], fk = `${n}|gate|${cn}|flick`;
      const p = pairOf(GK.get(best), GK.get(fk));
      const ex = (k, f) => mean([...GK.get(k).values()].map(f));
      console.log(`  ${n}장 ${cn.padEnd(18)} 최선 고정 ${best.slice(best.indexOf('relfix|') + 7).replace('|', ' ')} ${mf(best).toFixed(1)}장 (원밖 ${ex(best, (r) => r.out).toFixed(1)}) · 튕김 ${mf(fk).toFixed(1)}장 (원밖 ${ex(fk, (r) => r.out).toFixed(1)}, 통째 ${Math.round(100 * ex(fk, (r) => r.whole))}%) · 튕김 ÷ 고정 ${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}] · 0장 고정/튕김 ${Math.round(100 * ex(best, (r) => (r.flip === 0 ? 1 : 0)))}%/${Math.round(100 * ex(fk, (r) => (r.flip === 0 ? 1 : 0)))}%`);
    }
  }
}

// ───────────────────────── 진입 ─────────────────────────
if (!isMainThread && workerData?.ownclipsWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shotO(job), key: job.key, ...(job.spec ? { spec: job.spec } : {}), ...(job.meta ? { meta: job.meta } : {}) }); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'self') await selfTest();
  else if (cmd === 'list') { await SW.initPhysics(); const J = makeJobs(); const c = {}; for (const j of J) { const s = j.key.split('|')[0]; c[s] = (c[s] || 0) + 1; } console.log(J.length, c); }
  else if (cmd === 'run') { if (!a[0]) throw new Error('run <out.jsonl> [W]'); await SW.initPhysics(); await runJobs(makeJobs(), a[0], +(a[1] || 2)); report(a[0]); }
  else if (cmd === 'report') report(a[0]);
  else if (cmd === 'calreport') calReport(a[0]);
  else if (cmd === 'choose') console.log(JSON.stringify(chooseCal(a[0])[0].s));
  else if (cmd === 'path') await pathDump(+a[0], a[1]);
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

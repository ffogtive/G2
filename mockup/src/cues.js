// cues.js — 공략 세 줄을 글 없이 보이게 하는 단서의 계산부 (렌더러 독립, 재윤님 5차)
//
// 🧭 가설(미검증): 감이 안 잡힌 건 세 규칙(높이: 위에서 3장째 / 숨: 더미 양만큼 / 좌우: 가운데, 옆은 반대쪽으로 굴릴 때)이
//   더미 위에 '보이는 물건'으로 없고, 쏜 뒤에도 어느 층이 왜 넘어갔는지 안 보였기 때문이다.
//   → 숨 물결(컵 채우기)·틈 줄과 금 띠·기운 틈과 분필 화살표·더미 영수증. 설계 패널 world 안 + coach 영수증 (docs/design/strategy-atlas.md)
// 판가름: 단서를 켜고 10번 분 뒤 '어디를·얼마나·왜'를 말할 수 있나 / 16번째 숨 이후 조준 층 중앙값이 위에서 2~4장째인가.

import { sweetHiFor, GREEN_LO } from './rules.js';

export const BRIM = 0.9; // 숨 물결이 더미 꼭대기에 '딱' 닿는 숨 = 정답의 0.9배 (초록 고원의 가운데)

// 숨 q 로 '몇 장짜리 더미를 채울 숨'인가 = sweetHiFor 의 역함수 (절대 대응: 같은 당김이면 같은 장수만큼 찬다)
export function tideDiscs(q) {
  if (q <= 0.45) return Math.max(0, q / 0.45);
  return 1 + 19 * ((q - 0.45) / 0.5) ** 2;
}
// 숨 p(절대) → 물결 높이(더미 높이 대비, 1 = 꼭대기)
export const tideFill = (p, n) => tideDiscs(p / BRIM) / Math.max(1, n);

// 조준 높이 h 위에 있는 딱지 수(= 뚜껑 장수; 조준한 딱지 포함). ysDesc = 위에서부터 딱지 중심 높이
export function lidCount(ysDesc, h, discH) {
  let k = 0;
  for (const y of ysDesc) if (y >= h - discH / 2) k++;
  return Math.max(1, k);
}

// 실측 최고 높이 창(위에서 몇 장째): 2~4장째, 20장 근처는 2~3장째. 작은 더미·황금 판은 창 없음
export function idealWindow(n, type) {
  if (type === 'golden' || type === 'goldenSide' || n <= 4) return null;
  return n >= 18 ? [2, 3] : [2, 4];
}

// 옆을 불면 반대쪽 대각선으로 굴러감: 화살표 각도(0 = 곧장 앞, π/4 = 45°)
export const slideAngle = (lat) => (Math.PI / 4) * Math.min(1, Math.abs(lat) / 0.85);

// ── 숨 원인 코드 하나 (P0 '숨 원인을 코드 하나로') ──────────────────────────────
// 🧭 가설(확인됨, 코드 경로): 숨 1번의 원인을 네 곳(숨 글자·큰 글자·방금 숨 카드·결과 제목)이 따로 판정해 서로 반대말을 했다.
//   L4 마지막 1장 숨 1.42 → 글자 '너무 셌어!' vs 카드 '같은 자리·같은 숨으로 한 번 더' / L6 초록 0.87·7/12·원 밖 2 → 카드 '너무 셌어요'.
//   → 원인 코드는 shotCause 하나만 계산하고, 채널은 아래 *Key 함수로만 문구를 고른다. 판가름 = tools/cuecheck.mjs '채널끼리 반대말 0'.
// 규칙(제안 원문 + 보완: 판 목표를 채운 숨은 '좋음' / 책상 입은 '너무 아래' 지적 없음 / 장수 판 0장은 '아깝다' 아님):
//  - 결과가 좋으면 지적하지 않는다 = null(약하게 넘겼든 세게 넘겼든 같다 — 숨 글자 없음, 카드 '잘 넘겼어요'). 좋음 = 절반 이상 넘김,
//    또는 이 숨으로 판 목표를 채움(장수 판 목표 도달 · 황금 판 황금 · ★칸 판 ★칸). 황금 판은 황금을 못 넘기면 많이 넘겨도 좋음이 아니다.
//  - 결과가 나쁠 때: 약한 숨 = 'weak', ratio > 1 = 'strong'(원 밖과 상관없이). 1장 남은 판의 셈은 '마지막은 살살'(GDD §8.5) 문구.
//  - 초록 숨이면: 높이 창보다 위 = 'high'(원 밖 2장↑이면 '맨 위가 튀었어요 → 한두 장 아래'), 아래 = 'low', 옆 = 'side', 그 밖 = 'luck'(자리·숨은 맞았다).
// 물리·정답 숨(rules.js)은 건드리지 않는다. 문구·판정만.
export const CAUSES = ['weak', 'strong', 'high', 'low', 'side', 'luck'];
// 원인 → 단서 규칙(숨·높이·옆): 단서 단계·'같은 실수 2연속' 되살리기·영수증 강조가 쓴다
export const causeFamily = (c) => (c === 'weak' || c === 'strong' ? 'breath' : c === 'high' || c === 'low' ? 'height' : c === 'side' ? 'side' : null);
const isGreen = (r) => r >= GREEN_LO && r <= 1.0;

// 결과가 좋은가. goalHit = 이 숨으로 판 목표를 채웠나(장수 판: 누적이 목표 이상 / 황금 판: 황금을 뒤집음 — 화면 쪽이 넘긴다)
//  ★칸 판 = 황금이 ★칸에 들어감, 황금 판 = 황금을 뒤집음(장수와 무관), 그 밖 = 절반 이상 넘김 또는 목표 도달
export function goodShot({ n, flips, type, pocketOk = false, goalHit = false }) {
  if (type === 'goldenSide') return !!pocketOk;
  if (type === 'golden') return !!goalHit;
  return flips >= 0.5 * n || !!goalHit;
}

// k(위에서 몇 장째를 불었나)를 모르면(상대 숨) 높이는 판정하지 않는다. pose 'low'(책상 입)는 아래를 퍼올리는 자세라 '너무 아래'를 지적하지 않는다
export function shotCause(o) {
  const { n, k = null, ratio, lat = 0, type = 'flip', pocketLatSign = 0, pocketOk = false, pose = 'eye' } = o;
  if (goodShot(o)) return null;
  if (ratio < GREEN_LO) return 'weak';
  if (ratio > 1.0) return 'strong';
  const w = k == null ? null : idealWindow(n, type);
  if (w && k < w[0]) return 'high';
  if (w && k > w[1] && pose !== 'low') return 'low';
  if (type === 'goldenSide') {
    if (!pocketOk && (Math.abs(lat) < 0.35 || Math.sign(lat) === pocketLatSign)) return 'side';
  } else if (Math.abs(lat) > 0.45) return 'side';
  return 'luck';
}
export function shotVerdict(o) {
  return { cause: shotCause(o) };
}

// ── 채널: 모두 판정 v = shotVerdict(...) 로만 문구 키를 고른다 ──
// 숨 글자(얼굴 위 한 줄). 초록 숨은 결과를 기다리지 않고 '딱 좋은 숨!'(어떤 원인과도 반대말이 아니다). 약하든 세든 결과가 좋으면 null(지적 없음)
export function breathKey(v, ratio, n) {
  if (isGreen(ratio)) return 'fbPerfect';
  if (v.cause === 'weak') return ratio < 0.66 ? 'fbTooWeak' : 'fbWeak';
  if (v.cause === 'strong') return n <= 1 ? 'fbLast' : ratio <= 1.12 ? 'fbStrong' : 'fbTooStrong';
  return null;
}
// 큰 글자. 장수 등급은 지금 목업 그대로(대박 = max(6, ⌈R/2⌉), 싹쓸이 = 모두 또는 12장↑, GDD §8.3 판 크기별 기준은 E3 대기).
// 큰 칭찬(대박·싹쓸이)은 좋은 결과에만 — 지적과 한 숨에 같이 나오지 않는다(40장 더미의 14장·황금 못 넘긴 황금 판은 '굿!'까지).
// 0장일 때 말만 원인을 따른다: '날려 버렸다'는 셈일 때만, '아깝다'는 숨이 원인이 아닐 때만
export function bigKey(v, { flips, R, outs, nearMiss }) {
  if (flips === 0) {
    if (v.cause === 'strong' && outs > 0) return 'blownOut';
    if (v.cause === 'weak' || v.cause === 'strong') return 'miss';
    return nearMiss ? 'close' : 'miss';
  }
  const good = v.cause === null;
  if (good && ((flips >= 2 && flips === R) || flips >= 12)) return 'perfect';
  if (good && flips >= Math.max(6, Math.ceil(R * 0.5))) return 'amazing';
  if (flips >= 3) return 'great';
  return 'nice';
}
// 원 밖 첫 안내('너무 세게 불면 원 밖으로…')는 셈일 때만 — 초록 숨에 '너무 세게'라고 하지 않는다
export const outTipOk = (v, outs) => outs > 0 && v.cause === 'strong';
// 방금 숨 카드 한 줄. useLowOk = '입을 책상까지' 안내를 아직 보여 줄 수 있나(화면 쪽 상태)
export function receiptKey(v, { n, ratio, outs = 0, type = 'flip', pose = 'eye', useLowOk = false }) {
  switch (v.cause) {
    case 'weak': return 'rcpWeak';
    case 'strong': return n <= 1 ? 'rcpLast' : outs > 0 ? 'rcpStrong' : 'rcpStrongIn';
    case 'high': return pose === 'low' ? 'rcpLowTop' : outs >= 2 ? 'rcpHighOut' : 'rcpHigh';
    case 'low': return useLowOk ? 'rcpUseLow' : 'rcpLow';
    case 'side': return type === 'goldenSide' ? 'rcpSideStar' : 'rcpSide';
    case 'luck': return type === 'golden' ? 'rcpThree' : 'rcpLuck';
  }
  return isGreen(ratio) ? 'rcpGood' : 'rcpNice'; // 좋은 결과: 초록이면 '이 자리·이 숨', 아니면 '잘 넘겼어요'(약했다·셌다 지적 없음)
}
// 결과 화면 원인 줄(아이콘 + 짧은 말)
export const CAUSE_ICON = { weak: '🍃', strong: '🌪️', high: '🔝', low: '🔽', side: '↔️', luck: '🎯' };
export const causeLabelKey = (c) => (c ? 'cause' + c[0].toUpperCase() + c.slice(1) : null);

// 결과 제목: '아깝다…'(failed)는 목표까지 2장 이하로 모자랄 때만(GDD §8.3). 그 밖의 실패는 중립 제목(notYet) + 그 판에 가장 많이 나온 원인
export function shortfall(spec, res) {
  if (spec.type === 'flip') return Math.max(0, spec.target - (res.flipped || 0));
  if (spec.type === 'rival') return Math.max(0, (res.ai || 0) - (res.me || 0) + 1); // 이기려면 상대보다 1장 더
  return null; // 황금 판: 장수로 셀 수 없다
}
// 거의 됐나: 2장 이하로 모자람. 장수 판은 한 장도 못 넘겼으면 아니다(목표 2장 판에서 0장 = '2장 모자람'이지만 '아깝다'가 아니다)
export function nearGoal(spec, res) {
  if (res.win) return false;
  const s = shortfall(spec, res);
  if (s == null || (spec.type === 'flip' && s >= spec.target)) return false;
  return s <= 2;
}
export function resultTitleKey(spec, res) {
  return res.win ? 'clear' : nearGoal(spec, res) ? 'failed' : 'notYet';
}
// 그 판에 가장 많이 나온 원인(같으면 CAUSES 순서 = 고칠 수 있는 것 먼저). 없으면 null
export function topCause(counts) {
  let best = null;
  for (const c of CAUSES) if ((counts?.[c] || 0) > (best ? counts[best] : 0)) best = c;
  return best;
}

export { sweetHiFor };

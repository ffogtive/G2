// cues.js — 공략 세 줄을 글 없이 보이게 하는 단서의 계산부 (렌더러 독립, 재윤님 5차)
//
// 🧭 가설(미검증): 감이 안 잡힌 건 세 규칙(높이: 위에서 3장째 / 숨: 더미 양만큼 / 좌우: 가운데, 옆은 반대쪽으로 굴릴 때)이
//   더미 위에 '보이는 물건'으로 없고, 쏜 뒤에도 어느 층이 왜 넘어갔는지 안 보였기 때문이다.
//   → 숨 물결(컵 채우기)·틈 줄과 금 띠·기운 틈과 분필 화살표·더미 영수증. 설계 패널 world 안 + coach 영수증 (docs/design/strategy-atlas.md)
// 판가름: 단서를 켜고 10번 분 뒤 '어디를·얼마나·왜'를 말할 수 있나 / 16번째 숨 이후 조준 층 중앙값이 위에서 2~4장째인가.

import { sweetHiFor } from './rules.js';

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

// 쏜 뒤 '무엇 때문이었나' 한 가지만 (결과 우선: 절반 이상 넘겼으면 지적하지 않음)
export function classifyShot({ n, k, ratio, lat, flips, outs, type, pocketLatSign, pocketOk }) {
  if (flips >= 0.5 * n && !(type === 'goldenSide' && !pocketOk)) return null;
  if (ratio < 0.78 || (ratio > 1.0 && outs > 0)) return 'breath';
  const w = idealWindow(n, type);
  if (w && (k < w[0] || k > w[1])) return 'height';
  if (type === 'goldenSide') {
    if (!pocketOk && (Math.abs(lat) < 0.35 || Math.sign(lat) === pocketLatSign)) return 'side';
  } else if (Math.abs(lat) > 0.45) return 'side';
  return null;
}

export { sweetHiFor };

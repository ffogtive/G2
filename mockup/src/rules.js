// rules.js — 화면(main.js)과 레벨 봇(tools/levelbot.mjs)이 함께 쓰는 '숨 규칙'. 렌더러 독립.
//
// 가설: 정답 숨 세기는 '쌓인 양'에 비례해야 사람이 감으로 익힌다 (재윤님 피드백 1).
//       많이 쌓이면 크게, 적으면 살짝. 물리로 넘길 때는 그 양에 맞는 숨을 0.95 로 정규화한다.

export const POWER_MAX = 1.25;
export const PHYS_SWEET = 0.95;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 1장 ≈ 0.45, 20장 = 0.95, 40장 ≈ 1.12 — 차이를 넓혀 '양에 따라 다르게 분다'가 손가락으로 느껴지게 (2라운드 리서치: 기존 폭은 손가락 한 개 폭)
export function sweetHiFor(n) {
  return clamp(0.45 + 0.5 * Math.sqrt((Math.max(1, n) - 1) / 19), 0.45, 1.12);
}
export function sweetLoFor(n) {
  return sweetHiFor(n) * 0.78;
}

function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 숨 해석 (재윤님 3차 피드백: '딱 좋은 숨'인데 안 넘어가고 빨강이 더 넘어간다 / 세기별 차이가 안 보인다)
//  - 약한 숨(초록 아래): 들어 올리는 힘이 급격히 줄어 '들썩'만 → 거의 안 넘어감
//  - 초록 구간(정답의 0.78~1.0배): 전부 최대로 들어 올림 → 초록이면 확실히 넘어간다
//  - 너무 센 숨(1.0배 초과): 들어 올리기보다 '밀어 날려 버리는' 돌풍(blast) → 딱지가 분필 원 밖으로 날아가 무효
//  + 숨이 차서 조준이 약간 흔들림
export const GREEN_LO = 0.78;
export const WEAK_ZERO = +(globalThis.process?.env?.WEAK_ZERO ?? 0.45); // 이 비율 이하는 들썩도 거의 없음
export const WEAK_FLOOR = +(globalThis.process?.env?.WEAK_FLOOR ?? 0.3); // 아주 약한 숨의 물리 세기(들썩)
export const WEAK_EXP = +(globalThis.process?.env?.WEAK_EXP ?? 2.0);
export const BLAST_SPAN = +(globalThis.process?.env?.BLAST_SPAN ?? 0.4); // 초록 끝에서 이만큼 더 세면 돌풍 최대
export function resolveShot(shot, n, top, rng, overShake = 1) {
  const hi = sweetHiFor(n);
  const ratio = shot.power / hi;
  if (ratio < GREEN_LO) {
    const lift = Math.pow(clamp((ratio - WEAK_ZERO) / (GREEN_LO - WEAK_ZERO), 0, 1), WEAK_EXP);
    return { ...shot, power: WEAK_FLOOR + (PHYS_SWEET - WEAK_FLOOR) * lift, ratio, blast: 0 };
  }
  if (ratio <= 1.0) return { ...shot, power: PHYS_SWEET, ratio, blast: 0 };
  const ex = ratio - 1.0;
  const k = overShake;
  return {
    ...shot,
    power: PHYS_SWEET,
    blast: clamp(ex / BLAST_SPAN, 0, 1.4),
    h: clamp(shot.h + gauss(rng) * ex * 1.2 * k, 0.03, top),
    lat: clamp((shot.lat || 0) + gauss(rng) * ex * 1.0 * k, -0.95, 0.95), // 숨이 넘치면 조준도 조금 흔들림
    over: true,
    ratio,
  };
}

export { gauss };

// ── 숨 주머니 (재윤님 3차: "숨도 무한으로 모을 수는 없고, 제한된 숨 주머니 속에서 스탑포인트를") ──
// 설계 패널 4안 → 심사 3명 만장일치 A안 '볼 주머니: 꽉 → 버팀 → 콜록'.
// 🧭 가설(미검증): 주머니 끝 '꽉'(F)은 모든 판의 정답보다 위에 고정된 절대 자다. 꽉에 닿는 순간(소리 끊김·손끝 걸림·숨 줄기 멈춤)이
//   멈춤점이 되고, 정답은 언제나 꽉 아래 '더미 양에 비례한 자리'라서 감이 실력으로 남는다.
//   틀렸다는 신호: 꽉 ±5% 에서 놓는 비율이 10%↑ (꽉을 정답으로 착각) / 장수와 놓은 숨의 상관이 약함.
export const POUCH_FULL = 1.12; // 꽉 = sweetHiFor 상한. 지금 판(N ≤ 24)의 정답(hi ≤ 1.0)보다 항상 위 → 꽉에서 놓으면 늘 손해(돌풍)
export const POUCH_DETENT = 0.08; // 꽉에서 손가락이 이만큼(당김 단위) 더 가도 숨이 안 늘어남 = 손끝 멈춤 신호
export const POUCH_GAIN = 0.4; // 그 너머는 고무줄처럼 뻑뻑하게(0.4배) 우겨넣기 → 벽 POWER_MAX
export const STRAIN_MS = 1400; // 꽉에서 버틸 수 있는 시간(벽에서는 절반). 넘으면 콜록 = 취소(숨·차례 안 씀, 재윤님 4차 결정)
export const STRAIN_RECOVER_MS = 900;
export const LEAK_AT = 0.35; // 버팀이 이만큼 차면 입꼬리로 김이 샘(연출만, 숨은 그대로)

// 당긴 거리(u, 1 = 화면 짧은 변 × pull) → 숨. 꽉 아래는 지금과 1:1 (정답 당김 거리 불변)
export function pouchPower(u) {
  u = Math.max(0, u);
  if (u <= POUCH_FULL) return u;
  if (u <= POUCH_FULL + POUCH_DETENT) return POUCH_FULL;
  return Math.min(POWER_MAX, POUCH_FULL + (u - POUCH_FULL - POUCH_DETENT) * POUCH_GAIN);
}
// 꽉 래치(히스테리시스: 꽉 근처에서 깜빡이지 않게)
export function fullLatch(p, was) {
  return was ? p >= POUCH_FULL - 0.03 : p >= POUCH_FULL - 0.005;
}
// 버팀 s(0..1): 꽉인 동안 차오르고(벽에 가까울수록 빨리), 꽉에서 내려오면 천천히 풀린다
export function strainStep(s, p, dtMs, full, strainMs = STRAIN_MS) {
  if (full) {
    const k = clamp((p - POUCH_FULL) / (POWER_MAX - POUCH_FULL), 0, 1);
    return Math.min(1, s + dtMs / (strainMs * (1 - 0.5 * k)));
  }
  return Math.max(0, s - dtMs / STRAIN_RECOVER_MS);
}

// ── 삐져나온 딱지 노리기 (4차) ──────────────────────────────
// ⚠ 실험용, 지금은 아무도 안 씀(AI·봇 seek 0). 4차 교차 검토: 처음 근거(한쪽 6시드 8.3 vs 6.8 vs 3.3)는 거울 짝 비교에서
//   재현되지 않았고(옆 삐져나옴 +1장 정도), 이 함수는 아래쪽 딱지 높이를 골라 고수 AI 를 오히려 약하게 만들었다.
// 다시 쌓은 더미에서 '부는 사람 쪽'으로 삐져나온 딱지를 찾는다.
// toward = 더미 → 부는 사람 수평 단위벡터. 반환 { lat, h, amount } 또는 null. 실력이 높을수록 자주 찾는다.
// lat 부호는 main.js shotGeometry 와 같다: 바람 방향 D 기준 side = (−D.z, D.x).
export function pickProtrusion(table, toward, skill, rng) {
  if (rng() > clamp((skill - 0.9) / 1.4, 0, 0.85)) return null;
  const c = table.pileCenter();
  const side = { x: toward.z, z: -toward.x };
  let best = null;
  for (const d of table.liveDiscs()) {
    const p = d.body.translation();
    const ox = p.x - c.x, oz = p.z - c.z, m = Math.hypot(ox, oz);
    if (m < 0.1) continue;
    const ux = ox / m, uz = oz / m;
    const facing = ux * toward.x + uz * toward.z; // 1 = 부는 사람 쪽으로 튀어나옴
    if (facing < 0.15) continue;
    const score = m * (0.4 + 0.6 * facing);
    if (!best || score > best.score) best = { score, lat: clamp(ux * side.x + uz * side.z, -0.9, 0.9), h: p.y, amount: m };
  }
  return best;
}

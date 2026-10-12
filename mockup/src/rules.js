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
    lat: 0,
    over: true,
    ratio,
  };
}

export { gauss };

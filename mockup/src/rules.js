// rules.js — 화면(main.js)과 레벨 봇(tools/levelbot.mjs)이 함께 쓰는 '숨 규칙'. 렌더러 독립.
//
// 가설: 정답 숨 세기는 '쌓인 양'에 비례해야 사람이 감으로 익힌다 (재윤님 피드백 1).
//       많이 쌓이면 크게, 적으면 살짝. 물리로 넘길 때는 그 양에 맞는 숨을 0.95 로 정규화한다.

export const POWER_MAX = 1.25;
export const PHYS_SWEET = 0.95;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function sweetHiFor(n) {
  return clamp(0.42 + 0.53 * Math.sqrt(Math.max(1, n) / 20), 0.5, 1.12);
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

// 숨 해석: shot = {power, lat, h} (power 는 플레이어 입력 그대로), n = 남은 딱지 수, top = 더미 꼭대기 높이
// 너무 세게 불면 힘은 더 안 오르고, 숨이 차서 조준이 흔들린다 (게임 규칙으로 만든 '과유불급')
export function resolveShot(shot, n, top, rng, overShake = 1) {
  const hi = sweetHiFor(n);
  const ratio = shot.power / hi;
  if (shot.power <= hi) return { ...shot, power: PHYS_SWEET * ratio, ratio };
  const ex = shot.power - hi;
  const k = overShake * (0.95 / hi); // 적은 더미에서 과하게 불면 더 크게 흔들림
  return {
    ...shot,
    power: PHYS_SWEET + ex * 0.25,
    lat: clamp(shot.lat + gauss(rng) * ex * 3.2 * k, -1.6, 1.6),
    h: clamp(shot.h + gauss(rng) * ex * 2.4 * k, 0.03, top),
    over: true,
    ratio,
  };
}

export { gauss };

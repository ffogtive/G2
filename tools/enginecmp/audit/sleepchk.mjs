// audit/sleepchk.mjs — Jolt 잠 타이머가 하위 스텝과 어떻게 엮이는지 실측 (공정성 감사 2026-10-16)
//   node audit/sleepchk.mjs
// Jolt 5.6 은 잠 타이머를 바깥 스텝마다 '마지막 하위 스텝'에서 dt/하위 스텝만큼만 올린다 → mTimeBeforeSleep 이 하위 스텝 수만큼 늘어난다.
// 어댑터는 sleep.time 을 게임 시간으로 받고 Jolt 에 time/하위 스텝을 넣는다(adapters/index.mjs '잠'). 아래 줄에서 '모두 잠' 시각이 기대와 맞아야 한다.
process.env.JOLT_FLAVOUR ??= 'cpd';
const { createWorld } = await import('../adapters/index.mjs');
const { GameTable } = await import('../adapters/wind.mjs');
const base = { engine: 'jolt', joltPreset: 'fair', jolt: { baumgarte: 0.4, velocitySteps: 20, positionSteps: 4 } };
const cases = [
  [1, {}, '기본(0.5 s × 1)'],
  [4, {}, '기본 = Jolt mTimeBeforeSleep 0.5 그대로 → 0.5 s × 4 = 2 s (jolt-fair 의 실제 잠)'],
  [4, { pointVelocity: 0.4, time: 2.0 }, 'Rapier 식(0.4 u/s · 2 s) — 고친 뒤 -rsleep'],
  [4, { pointVelocity: 0.4, time: 8.0 }, '옛 -rsleep 재현(Jolt 에 2.0 → 실제 8 s)'],
  [1, { pointVelocity: 0.4, time: 2.0 }, 'Rapier 식, 하위 스텝 1'],
];
for (const [sub, sleep, note] of cases) {
  const w = await createWorld({ ...base, substeps: sub, sleep });
  const t = new GameTable(w, { n: 5, seed: 1, h: 0.11 });
  let first = null, all = null, lastMove = 0;
  for (let k = 1; k <= 1440; k++) { t.step(); const s = w.sleepingCount(); if (t.maxSpeed() >= 0.02) lastMove = k; if (first == null && s > 0) first = k; if (all == null && s === 5) all = k; }
  const inf = w.info();
  console.log(`하위 스텝 ${sub} · ${note}\n   설정 ${inf.sleep}\n   마지막 움직임(≥0.02) ${(lastMove / 120).toFixed(2)} s · 처음 잠 ${first ? (first / 120).toFixed(2) : '-'} s · 모두 잠 ${all ? (all / 120).toFixed(2) : '-'} s`);
  w.destroy();
}

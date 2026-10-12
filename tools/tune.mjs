// 물리 자동 튜너: 디자인 목표 분포(조준/파워별 평균 뒤집힘 수)에 맞는 바람 파라미터를 무작위 탐색 + 국소 개선으로 찾는다.
// 사용: node tools/tune.mjs [iterations]  → 최적 파라미터 JSON 출력
import { initPhysics, Table, TUNE } from '../mockup/src/sim.js';
await initPhysics();
const N = 20, SEEDS = [104729, 209459, 314189, 418919, 523649];
// [조준 높이 비율, 횡오프셋, 파워, 목표 평균]
const TARGETS = [
  [0.95, 0, 0.5, 1.5], [0.95, 0, 0.85, 5],
  [0.72, 0, 0.6, 3], [0.72, 0, 0.85, 9], [0.72, 0, 1.15, 4],
  [0.45, 0, 0.85, 6], [0.08, 0, 0.85, 1.5], [0.72, 0.75, 0.85, 3],
];
function trial(tune, seed, af, lat, p) {
  const t = new Table(seed, tune);
  t.addPile(Array.from({ length: N }, (_, i) => i));
  t.settle();
  t.blow({ aim: { x: -1.0, y: Math.max(0.03, t.columnTop() * af), z: lat }, dir: { x: 1, z: 0 }, power: p });
  return t.runUntilSettled(4).flipped.length;
}
function evaluate(tune) {
  let loss = 0; const means = [];
  for (const [af, lat, p, target] of TARGETS) {
    let sum = 0; for (const s of SEEDS) sum += trial(tune, s, af, lat, p);
    const m = sum / SEEDS.length; means.push(+m.toFixed(1));
    loss += (m - target) ** 2;
  }
  return { loss, means };
}
const SPACE = {
  lift: [60, 600, 'log'], push: [10, 300, 'log'], pushExp: [1, 4], jetR0: [0.2, 0.8], jetSpread: [0.05, 0.45],
  minLift: [0.1, 0.8], gapRef: [0.04, 0.3], sweet: [0.7, 1.05], tumble: [0, 12], puffDuration: [0.06, 0.25],
};
const sample = (r) => Object.fromEntries(Object.entries(SPACE).map(([k, [a, b, log]]) => [k, log ? Math.exp(Math.log(a) + r() * (Math.log(b) - Math.log(a))) : a + r() * (b - a)]));
let seed = 12345; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const iters = +(process.argv[2] || 60);
let best = { tune: { lift: TUNE.lift, push: TUNE.push }, ...evaluate({}) };
console.log('baseline', best.loss.toFixed(1), JSON.stringify(best.means));
for (let i = 0; i < iters; i++) {
  const explore = i < iters * 0.5;
  let cand;
  if (explore) cand = sample(r);
  else {
    cand = { ...best.tune };
    for (const [k, [a, b, log]] of Object.entries(SPACE)) {
      if (r() < 0.4) {
        const v = cand[k] ?? (a + b) / 2;
        cand[k] = Math.min(b, Math.max(a, log ? v * Math.exp((r() - 0.5) * 0.6) : v + (r() - 0.5) * (b - a) * 0.15));
      }
    }
  }
  const ev = evaluate(cand);
  if (ev.loss < best.loss) { best = { tune: cand, ...ev }; console.log(`#${i} loss ${ev.loss.toFixed(1)} means ${JSON.stringify(ev.means)} tune ${JSON.stringify(Object.fromEntries(Object.entries(cand).map(([k, v]) => [k, +v.toFixed(3)])))}`); }
}
console.log('BEST', JSON.stringify({ loss: +best.loss.toFixed(2), means: best.means, tune: Object.fromEntries(Object.entries(best.tune).map(([k, v]) => [k, +v.toFixed(3)])) }));

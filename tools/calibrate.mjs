// calibrate.mjs — 레벨마다 난이도 손잡이 k 를 이분 탐색해 학습자 봇 클리어율을 템플릿 목표에 맞춘다
// 사용: node tools/calibrate.mjs <시작> <끝> [시도=24] [출력json]
import { writeFileSync } from 'node:fs';
import { initPhysics, clearRate, BOTS } from './botlib.mjs';
import { levelSpec } from '../mockup/src/levels.js';
await initPhysics();
const [from, to, tries = 24, out = 'tools/scratch/cal.json'] = process.argv.slice(2);
const res = {};
for (let n = +from; n <= +to; n++) {
  const target = levelSpec(n).rate;
  let lo = 0, hi = 1, best = null;
  for (let it = 0; it < 5; it++) {
    const k = (lo + hi) / 2;
    const r = clearRate(levelSpec(n, k), +tries, BOTS.learner);
    if (!best || Math.abs(r - target) < Math.abs(best.r - target)) best = { k, r };
    if (r > target) lo = k; else hi = k; // 너무 쉬우면 k↑
  }
  res[n] = +best.k.toFixed(3);
  const sp = levelSpec(n, best.k);
  console.log(`${n} ${sp.role} ${sp.type} target ${(target * 100).toFixed(0)}% → k ${best.k.toFixed(3)} rate ${(best.r * 100).toFixed(0)}%`);
  writeFileSync(out, JSON.stringify(res));
}

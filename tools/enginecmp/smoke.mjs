// smoke.mjs — 어댑터 자체 점검: 두 엔진 × (질량·광선·더미·샷·판정·해시 재현)
// node smoke.mjs [n=30] [h=0.11] [seed=1]   (프리셋 rapier-v1 · jolt-fair 를 두 번씩 돌려 같은 해시인지)
import { createWorld, addPileTo } from './adapters/index.mjs';
import { makePile, defaultShot, applyShotStep, maxSpeed, JUDGE } from './adapters/common.mjs';

const n = +(process.argv[2] ?? 30), h = +(process.argv[3] ?? 0.11), seed = +(process.argv[4] ?? 1);

function run(preset, extra = {}) {
  return createWorld({ preset, ...extra }).then((w) => {
    const pile = makePile({ n, seed, h });
    w.addFloor();
    addPileTo(w, pile);
    const shot = defaultShot(pile);
    const t0 = performance.now();
    const hashes = [];
    let shielded = 0, judgeAt = null;
    const j = { n: 0, quiet: 0 };
    let settleTop = null;
    for (let s = 0; s < shot.start + shot.steps + JUDGE.maxSteps; s++) {
      shielded += applyShotStep(w, shot, s);
      w.step();
      if (s === shot.start - 1) {
        let top = 0; for (let i = 0; i < n; i++) top = Math.max(top, w.getPose(i).p.y + h / 2);
        settleTop = { top, nominal: n * h, ratio: top / (n * h), ms: maxSpeed(w, n), sleeping: w.sleepingCount(), hash: w.hashState() };
      }
      if (s >= shot.start + shot.steps) {
        j.n++;
        const ms = maxSpeed(w, n);
        const ok = j.n > JUDGE.minSteps && (ms < JUDGE.eps || (j.n > JUDGE.lateSteps && ms < JUDGE.lateEps));
        j.quiet = ok ? j.quiet + 1 : 0;
        if (judgeAt == null && (j.quiet > JUDGE.quietSteps || j.n >= JUDGE.maxSteps)) judgeAt = j.n;
      }
      if (s % 120 === 119) hashes.push(w.hashState());
    }
    const ms = (performance.now() - t0) / (shot.start + shot.steps + JUDGE.maxSteps);
    let up = 0; for (let i = 0; i < n; i++) { const { q } = w.getPose(i); const uy = 1 - 2 * (q.x * q.x + q.z * q.z); if (uy > 0.2) up++; }
    const ray = w.castRay({ x: 0, y: 0.5 * settleTop.top, z: 5 }, { x: 0, y: 0, z: -1 }, 10, { discsOnly: true });
    const rayAll = w.castRay({ x: 0, y: 3, z: 0 }, { x: 0, y: -1, z: 0 }, 10, {});
    const out = { preset, engine: w.engine, mass0: w.mass(0), settle: settleTop, shielded, judgeSteps: judgeAt, flippedUp: up, finalMaxSpeed: maxSpeed(w, n), sleepingEnd: w.sleepingCount(), msPerStep: +ms.toFixed(3), ray, rayAll, hashes: hashes.join(','), info: w.info() };
    w.destroy();
    return out;
  });
}

for (const engine of ['rapier-v1', 'jolt-fair']) {
  const a = await run(engine);
  const b = await run(engine);
  console.log(JSON.stringify({ ...a, info: a.info }, null, 1));
  console.log(engine, '같은 프로세스 재실행 해시 같음:', a.hashes === b.hashes);
}

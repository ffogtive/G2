// bench.mjs — JS(Rapier JS 0.12 WASM) 스텝 시간. Rust 짝 = `puff_parity bench` (같은 시나리오).
// settle = 더미 가라앉힘(스텝당 평균), shot = 초록 숨 3장째 + 480스텝 고정(스텝당 평균·최대). 단일 스레드.
// 사용: node native/puff_sim/parity/bench.mjs [장수들=1,5,10,20,30,40] [반복=5]   (env SIM=다른 sim.js)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const simPath = resolve(process.env.SIM || resolve(here, '../../../mockup/src/sim.js'));
const { initPhysics, Table } = await import(pathToFileURL(simPath).href);
const { sweetHiFor, resolveShot } = await import(pathToFileURL(resolve(dirname(simPath), 'rules.js')).href);
await initPhysics();
const Ns = (process.argv[2] || '1,5,10,20,30,40').split(',').map(Number);
const reps = +(process.argv[3] || 5);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 워밍업(JIT·WASM 티어업)
{ const t = new Table(1); t.addPile(Array.from({ length: 12 }, (_, i) => i)); t.settle(); for (let i = 0; i < 300; i++) t.step(); }
console.log('== 스텝 시간 (JS WASM, 단일 스레드, µs/step)  settle = 더미 가라앉힘 / shot = 초록 숨 3장째 + 4초(480스텝 고정)');
console.log('  n  | settle µs/step (steps) | shot µs/step | shot 최대 µs/step | 120Hz 예산 8333µs 대비');
for (const n of Ns) {
  let su = 0, ss = 0, shu = 0, shs = 0, worst = 0;
  for (let r = 0; r < reps; r++) {
    const t = new Table(r * 7907 + n);
    t.addPile(Array.from({ length: n }, (_, i) => i));
    let t0 = performance.now();
    const st = t.settle();
    su += (performance.now() - t0) * 1000; ss += Math.max(1, st);
    const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a);
    const c = t.pileCenter();
    const sh = resolveShot({ lat: 0, h: ys[Math.min(n - 1, 2)], power: sweetHiFor(n) * 0.9 }, n, t.columnTop(), mul(1), 1);
    t.blow({ aim: { x: c.x - 1, y: sh.h, z: c.z }, dir: { x: 1, z: 0 }, power: sh.power, blast: 0 });
    for (let i = 0; i < 480; i++) {
      const t1 = performance.now();
      t.step();
      const us = (performance.now() - t1) * 1000;
      worst = Math.max(worst, us); shu += us; shs++;
    }
  }
  const shot = shu / shs;
  console.log(`  ${String(n).padStart(2)} | ${(su / ss).toFixed(1).padStart(8)} (${String(Math.round(ss / reps)).padStart(4)}) | ${shot.toFixed(1).padStart(8)} | ${worst.toFixed(1).padStart(8)} | ${(shot / 8333.3 * 100).toFixed(2)}%`);
}

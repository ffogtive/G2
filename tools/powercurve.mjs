// powercurve.mjs — '숨 세기(정답 대비 비율) → 뒤집힌 장수' 곡선 실측 (재윤님 3차 피드백: 초록보다 빨강이 더 넘어간다?)
// 사용: node tools/powercurve.mjs [시드=10] [장수들=6,12,20] [조준들=0.95,0.75,0.5]
import { initPhysics, Table } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const S = +(process.argv[2] || 10);
const Ns = (process.argv[3] || '6,12,20').split(',').map(Number);
const Hs = (process.argv[4] || '0.95,0.75,0.5').split(',').map(Number);
const RATIOS = (process.env.RATIOS || '0.5,0.6,0.7,0.8,0.9,1.0,1.05,1.1,1.2,1.3').split(',').map(Number);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
for (const n of Ns) for (const hf of Hs) {
  const cells = [];
  for (const r of RATIOS) {
    let sum = 0, outSum = 0;
    for (let s = 1; s <= S; s++) {
      const t = new Table(s * 7907 + n);
      t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle();
      const top = t.columnTop();
      const raw = { lat: 0, h: Math.max(0.03, top * hf), power: sweetHiFor(n) * r };
      const sh = resolveShot(raw, n, top, mul(s * 31 + n), 1);
      const c = t.pileCenter();
      t.blow({ aim: { x: c.x - 1, y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
      const res = t.runUntilSettled(4);
      sum += res.flipped.length;
      outSum += t.liveDiscs().filter((d) => !t.inCircle(d)).length;
    }
    cells.push(`${r.toFixed(2)}:${(sum / S).toFixed(1)}${outSum ? '/out' + (outSum / S).toFixed(1) : ''}`);
  }
  console.log(`n=${String(n).padStart(2)} aim=${hf} | ${cells.join('  ')}`);
}

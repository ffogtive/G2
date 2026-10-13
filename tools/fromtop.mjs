// fromtop.mjs — '위에서 몇 장째를 불면 가장 많이 넘어가나' (공략 규칙 검증, 5차)
// 사용: node tools/fromtop.mjs <장수> [시드=12]   — 가운데, 초록 숨(정답의 0.9배)
import { initPhysics, Table, DISC_H } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const n = +(process.argv[2] || 12), S = +(process.argv[3] || 12);
const KS = [0.5, 1, 2, 3, 4, 5, 6, 8].filter((k) => k <= n);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const row = [];
for (const k of KS) {
  let sum = 0, zero = 0;
  for (let s = 1; s <= S; s++) {
    const t = new Table(s * 7907 + n);
    t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle();
    const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a); // 위에서부터
    const top = t.columnTop();
    const h = k < 1 ? top - DISC_H * 0.25 : ys[Math.min(n - 1, Math.round(k) - 1)]; // k장째 딱지의 중심 높이
    const sh = resolveShot({ lat: 0, h, power: sweetHiFor(n) * 0.9 }, n, top, mul(s * 31 + n), 1);
    const c = t.pileCenter();
    t.blow({ aim: { x: c.x - 1, y: sh.h, z: c.z }, dir: { x: 1, z: 0 }, power: sh.power, blast: 0 });
    const f = t.runUntilSettled(4).flipped.length; sum += f; if (!f) zero++;
  }
  row.push(`${k}장째:${(sum / S).toFixed(1)}(꽝${Math.round(zero / S * 100)}%)`);
}
console.log(`n=${n} | ${row.join('  ')}`);

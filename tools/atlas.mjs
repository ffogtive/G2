// atlas.mjs — '공략 지도': 장수 × 조준 높이 × 좌우 × 숨 세기 → 평균 장수·위험(꽝 확률·편차)·옆 이동·원 밖 (재윤님 5차: 언제 어디를 공략?)
// 사용: node tools/atlas.mjs <장수> [시드=8] [출력 json]   — 장수별로 병렬 실행 후 합침
import { writeFileSync } from 'node:fs';
import { initPhysics, Table } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const n = +(process.argv[2] || 12), S = +(process.argv[3] || 8), out = process.argv[4];
const HS = [0.15, 0.35, 0.55, 0.75, 0.95], LATS = [0, 0.45, 0.85], RS = [0.7, 0.9, 1.1];
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cells = [];
for (const r of RS) for (const hf of HS) for (const lat of LATS) {
  const flips = []; let side = 0, moved = 0, outs = 0;
  for (let s = 1; s <= S; s++) {
    const t = new Table(s * 7907 + n);
    t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle();
    const top = t.columnTop();
    const sh = resolveShot({ lat, h: Math.max(0.03, top * hf), power: sweetHiFor(n) * r }, n, top, mul(s * 31 + n), 1);
    const c = t.pileCenter();
    const p0 = new Map(t.liveDiscs().map((d) => [d.id, { ...d.body.translation() }]));
    t.blow({ aim: { x: c.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
    const res = t.runUntilSettled(4);
    flips.push(res.flipped.length);
    for (const d of t.liveDiscs()) { const p = d.body.translation(), q = p0.get(d.id); if (Math.hypot(p.x - q.x, p.z - q.z) > 0.3) { moved++; side += p.z - q.z; } if (!t.inCircle(d)) outs++; }
  }
  const m = flips.reduce((a, b) => a + b, 0) / S;
  const sd = Math.sqrt(flips.reduce((a, b) => a + (b - m) ** 2, 0) / S);
  cells.push({ n, r, hf, lat, mean: +m.toFixed(2), frac: +(m / n).toFixed(3), sd: +sd.toFixed(2), zero: +(flips.filter((f) => f === 0).length / S).toFixed(2), side: moved ? +(side / moved).toFixed(2) : 0, out: +(outs / S).toFixed(2) });
}
if (out) writeFileSync(out, JSON.stringify(cells));
for (const r of RS) {
  console.log(`n=${n} 숨 ${r}배 — 평균 장수(꽝%) [lat 0 / 0.45 / 0.85]`);
  for (const hf of [...HS].reverse()) console.log(`  h${hf.toFixed(2)} | ` + LATS.map((lat) => { const c = cells.find((x) => x.r === r && x.hf === hf && x.lat === lat); return `${c.mean.toFixed(1).padStart(4)}(${String(Math.round(c.zero * 100)).padStart(3)}%)`; }).join('  '));
}

// goldenside.mjs — 황금 딱지 옆으로 넘기기: 조준 좌우에 따라 황금 딱지가 어디에 떨어지나 (별 칸 설계용)
// 사용: node tools/goldenside.mjs [시드=16] [장수=12] [황금 깊이(위에서 비율)=0.3]
// 바람 +x, 옆 +z = 바람 진행 방향 기준 오른쪽(게임 화면 오른쪽과 같음)
import { initPhysics, Table } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const S = +(process.argv[2] || 16), N = +(process.argv[3] || 12), depth = +(process.argv[4] || 0.3);
const LATS = (process.env.LATS || '-0.85,-0.45,0,0.45,0.85').split(',').map(Number);
const R = +(process.env.R || 0.9);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
for (const lat of LATS) {
  let flip = 0; const zs = [];
  for (let s = 1; s <= S; s++) {
    const t = new Table(s * 7907 + N);
    const ids = Array.from({ length: N }, (_, i) => 'c' + i); const gi = Math.round((1 - depth) * (N - 1)); ids[gi] = 'golden';
    t.addPile(ids); t.settle();
    const top = t.columnTop(), c = t.pileCenter();
    const g = t.liveDiscs().find((d) => d.cardId === 'golden');
    const gy = g.body.translation().y;
    const sh = resolveShot({ lat, h: gy, power: sweetHiFor(N) * R }, N, top, mul(s * 31 + N), 1);
    t.blow({ aim: { x: c.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
    const res = t.runUntilSettled(4);
    if (res.flipped.includes(g)) { flip++; zs.push(+g.body.translation().z.toFixed(2)); }
  }
  const zR = (th) => zs.filter((z) => z >= th).length / S, zL = (th) => zs.filter((z) => z <= -th).length / S;
  console.log(`lat ${lat >= 0 ? '+' : ''}${lat}: golden flipped ${(flip / S * 100).toFixed(0)}% | flipped & right(z≥0.6) ${(zR(0.6) * 100).toFixed(0)}% ≥1.0 ${(zR(1.0) * 100).toFixed(0)}% | left(z≤−0.6) ${(zL(0.6) * 100).toFixed(0)}% ≤−1.0 ${(zL(1.0) * 100).toFixed(0)}% | z: ${zs.join(' ')}`);
}

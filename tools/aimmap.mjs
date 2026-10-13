// aimmap.mjs — 조준 지점(좌우 lat × 높이 h) → 물리 반응 지도 (재윤님 4차: 닿는 곳에 따라 딱지가 실제로 다르게 반응해야)
// 사용: node tools/aimmap.mjs [시드=6] [장수=12] [숨 비율=0.9]
// 지표: flip = 원 안에서 뒤집힌 장수 / side = 움직인 딱지의 평균 옆 이동(+z = 바람 진행 방향 기준 오른쪽, main.js side 와 같음) / fwd = 평균 앞 이동
//       spin = 퍼프 직후 평균 |세로축 회전| / roll = 뒤집힘 축이 옆으로 기운 정도(0 = 앞으로 넘어감, 1 = 옆으로 굴러 넘어감) / out = 원 밖
import { initPhysics, Table } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const S = +(process.argv[2] || 6), N = +(process.argv[3] || 12), R = +(process.argv[4] || 0.9);
const OV = process.env.TUNE_JSON ? JSON.parse(process.env.TUNE_JSON) : {}; // 예: TUNE_JSON='{"rimHit":0}'
// PROT='k:dz' → k번째(아래부터) 딱지를 바람 옆(z)으로 dz 만큼 삐져나오게 고정 (삐져나온 곳 노리기 실험). 무작위 삐져나옴은 끔
const PROT = process.env.PROT ? process.env.PROT.split(':').map(Number) : null;
const LATS = (process.env.LATS || '-0.9,-0.6,-0.3,0,0.3,0.6,0.9').split(',').map(Number);
const HS = (process.env.HS || '0.95,0.75,0.5').split(',').map(Number);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rows = [];
for (const hf of HS) {
  const line = [];
  for (const lat of LATS) {
    let flip = 0, side = 0, fwd = 0, spin = 0, roll = 0, rollN = 0, out = 0, moved = 0;
    for (let s = 1; s <= S; s++) {
      const t = new Table(s * 7907 + N, { ...OV, ...(PROT ? { protrudeP: 0 } : {}) });
      t.addPile(Array.from({ length: N }, (_, i) => i));
      if (PROT) { const b = t.discs[PROT[0]].body, p = b.translation(); b.setTranslation({ x: p.x, y: p.y, z: p.z + PROT[1] }, true); }
      t.settle();
      const top = t.columnTop();
      const sh = resolveShot({ lat, h: Math.max(0.03, top * hf), power: sweetHiFor(N) * R }, N, top, mul(s * 31 + N), 1);
      const c = t.pileCenter();
      const p0 = new Map(t.liveDiscs().map((d) => [d.id, { ...d.body.translation() }]));
      // 바람 방향 +x, 옆 = +z (바람 진행 방향 기준 오른쪽 = D × up)
      t.blow({ aim: { x: c.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
      for (let i = 0; i < 30; i++) t.step();
      for (const d of t.liveDiscs()) spin += Math.abs(d.body.angvel().y) / N;
      const res = t.runUntilSettled(4);
      flip += res.flipped.length;
      for (const d of t.liveDiscs()) {
        const p = d.body.translation(), q = p0.get(d.id);
        const dx = p.x - q.x, dz = p.z - q.z;
        if (Math.hypot(dx, dz) > 0.3) { moved++; side += dz; fwd += dx; }
        if (!t.inCircle(d)) out++;
      }
      for (const d of res.flipped) {
        // 뒤집힌 딱지가 어느 쪽으로 넘어갔나: 착지 위치의 옆/앞 비율
        const p = d.body.translation(), q = p0.get(d.id);
        const dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz);
        if (L > 0.2) { roll += Math.abs(dz) / L; rollN++; }
      }
    }
    line.push({ lat, flip: flip / S, side: moved ? side / moved : 0, fwd: moved ? fwd / moved : 0, spin: spin / S, roll: rollN ? roll / rollN : 0, out: out / S });
  }
  rows.push({ hf, line });
  console.log(`h=${hf}`);
  for (const k of ['flip', 'side', 'fwd', 'spin', 'roll', 'out']) console.log(`  ${k.padEnd(4)} | ${line.map((c) => `${(c.lat >= 0 ? '+' : '') + c.lat.toFixed(1)}:${c[k].toFixed(2).padStart(5)}`).join('  ')}`);
}

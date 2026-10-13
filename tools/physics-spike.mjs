// 물리 분포 측정: node tools/physics-spike.mjs [tuneJSON] [장수=20] [시드수=10] [조준높이들] [파워들]
// 예) node tools/physics-spike.mjs "{}" 20 8 0.95,0.6 0.7,0.95
import { initPhysics, Table } from '../mockup/src/sim.js';
await initPhysics();
const tune = JSON.parse(process.argv[2] || '{}');
const N = +(process.argv[3] || 20), S = +(process.argv[4] || 10);
const hs = (process.argv[5] || '0.95,0.8,0.6,0.3').split(',').map(Number);
const ps = (process.argv[6] || '0.5,0.7,0.85,0.95').split(',').map(Number);
for (const af of hs) {
  const line = [];
  for (const p of ps) {
    const f = [];
    for (let s = 1; s <= S; s++) {
      const t = new Table(s * 7907, tune);
      t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle();
      t.blow({ aim: { x: -1, y: Math.max(0.03, t.columnTop() * af), z: 0 }, dir: { x: 1, z: 0 }, power: p });
      f.push(t.runUntilSettled(4).flipped.length);
    }
    f.sort((a, b) => a - b);
    line.push(`p${p}: μ${(f.reduce((a, b) => a + b) / S).toFixed(1)} [${f.join(',')}]`);
  }
  console.log(`h${af} | ${line.join(' | ')}`);
}

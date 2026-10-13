import { initPhysics, Table } from '../../../mockup/src/sim.js';
await initPhysics();
const [R, S = '60'] = process.argv.slice(2);
const hs = [0.25, 0.5, 0.75, 0.97], ps = [0.6, 0.75, 0.85, 0.93];
const rows = [];
for (const hf of hs) {
  const line = [];
  for (const p of ps) {
    let sum = 0, any = 0, all = 0;
    for (let s = 0; s < +S; s++) {
      const t = new Table(77 + s * 3301); t.addPile(Array.from({ length: +R }, (_, i) => i)); t.settle();
      t.blow({ aim: { x: -1, y: Math.max(0.03, t.columnTop() * hf), z: 0 }, dir: { x: 1, z: 0 }, power: p });
      const n = t.runUntilSettled(4).flipped.length; sum += n; if (n > 0) any++; if (n === +R) all++;
    }
    line.push(`p${p}:μ${(sum / S).toFixed(1)} ≥1:${Math.round(any / S * 100)}% all:${Math.round(all / S * 100)}%`);
  }
  rows.push(`R${R} h${hf} | ${line.join(' | ')}`);
}
console.log(rows.join('\n'));

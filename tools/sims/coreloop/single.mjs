import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const P = {
  expert: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  aimOnly: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: 0.4 + r() * 0.8 }),
  powerOnly: (r) => ({ hf: 0.2 + r() * 0.8, lat: (r() - 0.5) * 1.6, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  latBad: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: (r() - 0.5) * 1.6, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  heightOnlyBad: (r) => ({ hf: 0.2 + r() * 0.8, lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  novice: (r) => ({ hf: 0.2 + r() * 0.8, lat: (r() - 0.5) * 1.6, power: 0.4 + r() * 0.8 }),
  mid: (r) => ({ hf: clamp(0.68 + gauss(r) * 0.17, 0.05, 1), lat: gauss(r) * 0.35, power: clamp(0.85 + gauss(r) * 0.14, 0.35, 1.25) }),
  rookie: (r) => ({ hf: clamp(0.6 + gauss(r) * 0.25, 0.05, 1), lat: gauss(r) * 0.5, power: clamp(0.72 + gauss(r) * 0.18, 0.3, 1.25) }),
  gambler: (r) => ({ hf: clamp(0.5 + gauss(r) * 0.05, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.92 + gauss(r) * 0.03, 0.3, 1.25) }),
  over: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(1.15 + gauss(r) * 0.05, 0.3, 1.25) }),
};
const [name, S = '120', N = '20'] = process.argv.slice(2);
const f = [];
for (let s = 0; s < +S; s++) {
  const seed = 31 + s * 6271; const r = mulberry32(seed ^ 0xabc);
  const t = new Table(seed); t.addPile(Array.from({ length: +N }, (_, i) => i)); t.settle();
  let { hf, lat, power } = P[name](r); const top = t.columnTop(); let h = Math.max(0.03, top * hf);
  if (power > 0.95) { const ex = power - 0.95; power = 0.95 + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
  t.blow({ aim: { x: -1, y: h, z: lat }, dir: { x: 1, z: 0 }, power });
  f.push(t.runUntilSettled(4).flipped.length);
}
f.sort((a, b) => a - b);
const m = f.reduce((a, b) => a + b) / f.length;
const pct = (q) => f[Math.floor(q * (f.length - 1))];
console.log(`${name.padEnd(14)} N${N} mean ${m.toFixed(2)} zero ${(f.filter(x=>x===0).length/f.length).toFixed(2)} ge5 ${(f.filter(x=>x>=5).length/f.length).toFixed(2)} ge10 ${(f.filter(x=>x>=10).length/f.length).toFixed(2)} p10 ${pct(.1)} p50 ${pct(.5)} p90 ${pct(.9)} max ${f[f.length-1]}`);

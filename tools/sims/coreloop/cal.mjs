import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const POL = {
  novice: (r) => ({ hf: 0.2 + r() * 0.8, lat: (r() - 0.5) * 1.6, power: 0.4 + r() * 0.8 }),
  learner: (r) => ({ hf: clamp(0.9 + gauss(r) * 0.1, 0.05, 1), lat: gauss(r) * 0.3, power: 0.55 + r() * 0.6 }),
  rookie: (r) => ({ hf: clamp(0.6 + gauss(r) * 0.25, 0.05, 1), lat: gauss(r) * 0.5, power: clamp(0.72 + gauss(r) * 0.18, 0.3, 1.25) }),
  mid: (r) => ({ hf: clamp(0.68 + gauss(r) * 0.17, 0.05, 1), lat: gauss(r) * 0.35, power: clamp(0.85 + gauss(r) * 0.14, 0.35, 1.25) }),
  hanjang: (r) => ({ hf: clamp(0.88 + gauss(r) * 0.08, 0.05, 1), lat: gauss(r) * 0.15, power: clamp(0.88 + gauss(r) * 0.06, 0.3, 1.25) }),
  expert: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
};
function shoot(t, pol, r) {
  let { hf, lat, power } = pol(r); const top = t.columnTop(); let h = Math.max(0.03, top * hf);
  if (power > 0.95) { const ex = power - 0.95; power = 0.95 + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
  const c = t.pileCenter(); t.blow({ aim: { x: c.x - 1, y: h, z: c.z + lat }, dir: { x: 1, z: 0 }, power });
  const { flipped } = t.runUntilSettled(4); for (const d of flipped) t.remove(d); return flipped.length;
}
const [pa, pb, M = '100', N = '5'] = process.argv.slice(2);
let aw = 0, bw = 0, dr = 0, sh = 0, z = 0, ns = 0, tot = 0;
for (let m = 0; m < +M; m++) {
  const seed = 1234 + m * 7717; const r = mulberry32(seed ^ 0x77);
  const t = new Table(seed); t.addPile(Array.from({ length: 2 * +N }, (_, i) => i)); t.settle();
  let a = 0, b = 0, who = 0, n = 0;
  while (t.liveDiscs().length && n < 18) { const k = shoot(t, who ? POL[pb] : POL[pa], r); if (!who) { a += k; ns++; tot += k; if (!k) z++; } else b += k; n++; if (!t.liveDiscs().length) break; t.restack(); t.settle(240); who ^= 1; }
  sh += n; if (a > b) aw++; else if (b > a) bw++; else dr++;
}
console.log(JSON.stringify({ pa, pb, N: +N, M: +M, aWin: (aw / M * 100).toFixed(0) + '%', bWin: (bw / M * 100).toFixed(0) + '%', draw: (dr / M * 100).toFixed(0) + '%', avgShots: (sh / M).toFixed(1), aPerShot: (tot / ns).toFixed(2), aZero: (z / ns * 100).toFixed(0) + '%' }));

import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const noise = (r, hf, p) => ({ hf: clamp(hf + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(p + gauss(r) * 0.03, 0.3, 1.25) });
const POL = {
  expert: (r, R) => noise(r, 0.97, 0.9),
  master: (r, R) => R === 1 ? noise(r, 0.25, 0.75) : R <= 8 ? noise(r, 0.5, 0.93) : noise(r, 0.97, 0.9),
};
function shoot(t, pol, r) {
  const R = t.liveDiscs().length;
  let { hf, lat, power } = pol(r, R); const top = t.columnTop(); let h = Math.max(0.03, top * hf);
  if (power > 0.95) { const ex = power - 0.95; power = 0.95 + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
  const c = t.pileCenter(); t.blow({ aim: { x: c.x - 1, y: h, z: c.z + lat }, dir: { x: 1, z: 0 }, power });
  const { flipped } = t.runUntilSettled(4); for (const d of flipped) t.remove(d); return flipped.length;
}
function leg(seed, r, pf, ps, D) {
  const t = new Table(seed); t.addPile(Array.from({ length: D }, (_, i) => i)); t.settle();
  const g = [0, 0]; let w = 0, n = 0, z = [0, 0], c = [0, 0];
  while (t.liveDiscs().length && n < 18) { const k = shoot(t, w ? ps : pf, r); g[w] += k; c[w]++; if (!k) z[w]++; n++; if (!t.liveDiscs().length) break; t.restack(); t.settle(240); w ^= 1; }
  return { g, n, z, c };
}
const [pa, pb, M = '150', D = '20', mode = 'single'] = process.argv.slice(2);
let aw = 0, bw = 0, dr = 0, sh = 0, za = 0, ca = 0;
for (let m = 0; m < +M; m++) {
  const r = mulberry32(31337 + m * 7919);
  let A, B;
  if (mode === 'single') { const l = leg(600 + m * 13, r, POL[pa], POL[pb], +D); A = l.g[0]; B = l.g[1]; sh += l.n; za += l.z[0]; ca += l.c[0]; }
  else { const l1 = leg(600 + m * 13, r, POL[pa], POL[pb], +D / 2), l2 = leg(900 + m * 17, r, POL[pb], POL[pa], +D / 2); A = l1.g[0] + l2.g[1]; B = l1.g[1] + l2.g[0]; sh += l1.n + l2.n; za += l1.z[0] + l2.z[1]; ca += l1.c[0] + l2.c[1]; }
  if (A > B) aw++; else if (B > A) bw++; else dr++;
}
const pc = (x) => Math.round(x / M * 100) + '%';
console.log(JSON.stringify({ mode, pa, pb, D: +D, M: +M, aWin: pc(aw), bWin: pc(bw), draw: pc(dr), avgShots: (sh / M).toFixed(1), aZero: Math.round(za / ca * 100) + '%' }));

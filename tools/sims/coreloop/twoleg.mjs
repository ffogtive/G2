import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const POL = {
  expert: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  mid: (r) => ({ hf: clamp(0.68 + gauss(r) * 0.17, 0.05, 1), lat: gauss(r) * 0.35, power: clamp(0.85 + gauss(r) * 0.14, 0.35, 1.25) }),
  novice: (r) => ({ hf: 0.2 + r() * 0.8, lat: (r() - 0.5) * 1.6, power: 0.4 + r() * 0.8 }),
};
function shoot(t, pol, r) {
  let { hf, lat, power } = pol(r); const top = t.columnTop(); let h = Math.max(0.03, top * hf);
  if (power > 0.95) { const ex = power - 0.95; power = 0.95 + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
  const c = t.pileCenter();
  t.blow({ aim: { x: c.x - 1, y: h, z: c.z + lat }, dir: { x: 1, z: 0 }, power });
  const { flipped } = t.runUntilSettled(4); for (const d of flipped) t.remove(d); return flipped.length;
}
function leg(seed, r, polFirst, polSecond, discs, maxT) {
  const t = new Table(seed); t.addPile(Array.from({ length: discs }, (_, i) => i)); t.settle();
  const got = [0, 0]; let who = 0, n = 0;
  while (t.liveDiscs().length && n < maxT) { got[who] += shoot(t, who ? polSecond : polFirst, r); n++; if (!t.liveDiscs().length) break; t.restack(); t.settle(240); who ^= 1; }
  return { got, n };
}
const [pa, pb, M, D] = process.argv.slice(2);
let aw = 0, bw = 0, dr = 0, shots = 0;
for (let m = 0; m < +M; m++) {
  const r = mulberry32(777 + m * 104729);
  const l1 = leg(5000 + m * 31, r, POL[pa], POL[pb], +D, 12); // A 선공
  const l2 = leg(9000 + m * 37, r, POL[pb], POL[pa], +D, 12); // B 선공
  const A = l1.got[0] + l2.got[1], B = l1.got[1] + l2.got[0];
  shots += l1.n + l2.n;
  if (A > B) aw++; else if (B > A) bw++; else dr++;
}
console.log(JSON.stringify({ rule: 'twoLeg', pa, pb, discsPerLeg: +D, M: +M, aWin: aw, bWin: bw, draw: dr, avgShots: (shots / +M).toFixed(2) }));

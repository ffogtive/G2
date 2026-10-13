import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const POL = {
  expert: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  mid: (r) => ({ hf: clamp(0.68 + gauss(r) * 0.17, 0.05, 1), lat: gauss(r) * 0.35, power: clamp(0.85 + gauss(r) * 0.14, 0.35, 1.25) }),
  gambler: (r) => ({ hf: clamp(0.5 + gauss(r) * 0.05, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.92 + gauss(r) * 0.03, 0.3, 1.25) }),
};
// 매치 안에서의 샷 결과(n, R) 수집 → 등급 기준별 발생률
const [pol, M = '120', N = '10'] = process.argv.slice(2);
const rec = [];
for (let m = 0; m < +M; m++) {
  const seed = 4242 + m * 911; const r = mulberry32(seed ^ 0x55);
  const t = new Table(seed); t.addPile(Array.from({ length: 2 * +N }, (_, i) => i)); t.settle();
  let turn = 0;
  while (t.liveDiscs().length && turn < 18) {
    const R = t.liveDiscs().length;
    let { hf, lat, power } = POL[pol](r); const top = t.columnTop(); let h = Math.max(0.03, top * hf);
    if (power > 0.95) { const ex = power - 0.95; power = 0.95 + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
    const c = t.pileCenter();
    t.blow({ aim: { x: c.x - 1, y: h, z: c.z + lat }, dir: { x: 1, z: 0 }, power });
    const { flipped } = t.runUntilSettled(4); for (const d of flipped) t.remove(d);
    rec.push({ n: flipped.length, R });
    if (!t.liveDiscs().length) break; t.restack(); t.settle(240); turn++;
  }
}
const f = (fn) => (rec.filter(fn).length / rec.length * 100).toFixed(1) + '%';
const hist = {}; for (const x of rec) hist[x.n] = (hist[x.n] || 0) + 1;
console.log(pol, 'N', N, 'shots', rec.length,
  '| cur.perfect', f(x => (x.n >= 2 && x.n === x.R) || x.n >= 12),
  '| cur.amazing+', f(x => x.n >= Math.max(6, Math.ceil(x.R * 0.5)) || (x.n >= 2 && x.n === x.R) || x.n >= 12),
  '| prop.sweep(n=R,R>=4)', f(x => x.n === x.R && x.R >= 4),
  '| prop.amazing+(n>=max(8,.5R) or sweep)', f(x => x.n >= Math.max(8, Math.ceil(0.5 * x.R)) || (x.n === x.R && x.R >= 4)),
  '| ge8', f(x => x.n >= 8), '| zero', f(x => x.n === 0), '| finisher(n=R)', f(x => x.n === x.R),
  '\n   hist', JSON.stringify(hist));

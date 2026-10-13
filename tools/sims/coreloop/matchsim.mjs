// 매치 단위 실측: 선공 이점, 매치 길이, 실력차 승률
// node matchsim.mjs <policyA> <policyB> <matches> <stakeEach>
import { initPhysics, Table, mulberry32 } from '../../../mockup/src/sim.js';
await initPhysics();

const SWEET_HI = 0.95;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const POL = {
  expert: (r) => ({ hf: clamp(0.97 + gauss(r) * 0.03, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.9 + gauss(r) * 0.03, 0.3, 1.25) }),
  mid: (r) => ({ hf: clamp(0.68 + gauss(r) * 0.17, 0.05, 1), lat: gauss(r) * 0.35, power: clamp(0.85 + gauss(r) * 0.14, 0.35, 1.25) }),
  novice: (r) => ({ hf: 0.2 + r() * 0.8, lat: (r() - 0.5) * 1.6, power: 0.4 + r() * 0.8 }),
  gambler: (r) => ({ hf: clamp(0.5 + gauss(r) * 0.05, 0.05, 1), lat: gauss(r) * 0.08, power: clamp(0.92 + gauss(r) * 0.03, 0.3, 1.25) }),
};

function shoot(t, pol, r) {
  const s = pol(r);
  const top = t.columnTop();
  let h = Math.max(0.03, top * s.hf), lat = s.lat, power = s.power;
  if (power > SWEET_HI) { const ex = power - SWEET_HI; power = SWEET_HI + ex * 0.25; lat = clamp(lat + gauss(r) * ex * 3.2, -1.6, 1.6); h = clamp(h + gauss(r) * ex * 2.4, 0.03, top); }
  const c = t.pileCenter();
  t.blow({ aim: { x: c.x - 1, y: h, z: c.z + lat }, dir: { x: 1, z: 0 }, power });
  const { flipped } = t.runUntilSettled(4);
  for (const d of flipped) t.remove(d);
  return flipped;
}

const [pa = 'mid', pb = 'mid', M = '20', N = '10', MAXT = '18'] = process.argv.slice(2);
let res = { aWin: 0, bWin: 0, draw: 0, turns: [], aShare: [], firstShot: [], sweepTurns: 0, lastTurnsDecided: 0 };
for (let m = 0; m < +M; m++) {
  const seed = 1000 + m * 7919;
  const r = mulberry32(seed ^ 0x9e3779b9);
  const t = new Table(seed);
  t.addPile(Array.from({ length: 2 * +N }, (_, i) => i)); t.settle();
  let a = 0, b = 0, turn = 0, who = 0;
  const shots = [];
  while (t.liveDiscs().length > 0 && turn < +MAXT) {
    const f = shoot(t, who === 0 ? POL[pa] : POL[pb], r);
    shots.push(f.length);
    if (who === 0) a += f.length; else b += f.length;
    if (t.liveDiscs().length === 0) break;
    t.restack(); t.settle(240);
    who ^= 1; turn++;
  }
  res.turns.push(shots.length);
  res.firstShot.push(shots[0]);
  res.aShare.push(a / (2 * +N));
  if (a > b) res.aWin++; else if (b > a) res.bWin++; else res.draw++;
  process.stderr.write(`m${m} A${a} B${b} shots[${shots.join(',')}] left${t.liveDiscs().length}\n`);
}
const avg = (x) => (x.reduce((p, q) => p + q, 0) / x.length).toFixed(2);
console.log(JSON.stringify({ pa, pb, M: +M, N: +N, aWin: res.aWin, bWin: res.bWin, draw: res.draw, avgShots: avg(res.turns), avgAShare: avg(res.aShare), avgFirstShot: avg(res.firstShot) }));

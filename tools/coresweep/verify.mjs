// simsweep.js 가 v1 과 같은지: (1) 기본 blow 비트 동일 (2) blowLip ≡ 상수 prog(사인 봉투)
import * as V1 from '../../mockup/src/sim.js';
import * as SW from './simsweep.js';
await V1.initPhysics(); await SW.initPhysics();
function snap(t) { return t.liveDiscs().map((d) => { const p = d.body.translation(), q = d.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; }).flat(); }
let same = 0, tot = 0, maxd = 0;
for (const n of [5, 12, 20]) for (const seed of [1, 2, 3]) {
  const mk = (M) => { const t = new M.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(); return t; };
  const a = mk(V1), b = mk(SW);
  const c = a.pileCenter();
  const aim = { x: c.x, y: a.columnTop() * 0.6, z: c.z + 1 };
  a.blow({ aim, dir: { x: 0, z: -1 }, power: 0.9 }); b.blow({ aim, dir: { x: 0, z: -1 }, power: 0.9 });
  const ra = a.runUntilSettled(), rb = b.runUntilSettled();
  const sa = snap(a), sb = snap(b); tot++; if (sa.every((v, i) => v === sb[i])) same++;
  // blowLip vs prog
  const a2 = mk(V1), b2 = mk(SW);
  const aim2 = { x: c.x, y: 0.3, z: c.z + 1 };
  const g = a2.blowLip({ aim: aim2, dir: { x: 0, z: -1 }, power: 0.9, mouthY: 0.5 });
  const T = b2.T;
  b2.blowProg({ power: 0.9, dur: T.puffDuration, prog: (t) => ({ o: g.M, phi: g.phi, ux: 0, uz: -1, env: Math.sin(Math.min(1, t / T.puffDuration) * Math.PI) }) });
  a2.runUntilSettled(); b2.runUntilSettled();
  const s2a = snap(a2), s2b = snap(b2);
  for (let i = 0; i < s2a.length; i++) maxd = Math.max(maxd, Math.abs(s2a[i] - s2b[i]));
  console.log(`n${n} s${seed} blow: flips ${ra.flipped.length} vs ${rb.flipped.length} | lip vs prog flips ${a2.liveDiscs().filter((d) => a2.faceUp(d) > 0.2 && a2.inCircle(d)).length} vs ${b2.liveDiscs().filter((d) => b2.faceUp(d) > 0.2 && b2.inCircle(d)).length}`);
}
console.log(`기본 blow 비트 동일 ${same}/${tot}, blowLip vs prog 최대 위치차 ${maxd.toExponential(2)}`);

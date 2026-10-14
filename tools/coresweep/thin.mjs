// thin.mjs — 얇은 딱지(DISC_H 0.04~0.06)를 v1(Rapier JS 0.12)에서 세울 수 있나: 눌림·떨림·속도
import * as L from './lib.mjs';
const SW = L.SW;
await SW.initPhysics();
const CFG = [
  ['v1 기본(1/120, it8, erp0.2)', {}],
  ['erp0.8', { erp: 0.8 }],
  ['erp0.8 it16', { erp: 0.8, iters: 16 }],
  ['erp0.8 dt1/240', { erp: 0.8, dt: 1 / 240 }],
  ['erp1 it16 dt1/240', { erp: 1.0, iters: 16, dt: 1 / 240 }],
];
const rot = (q, v) => { const { x, y, z, w } = q; const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z; return { y: iy * w + iw * -y + iz * -x - ix * -z }; };
for (const H of [0.11, 0.06, 0.04]) for (const [name, tune] of CFG) for (const n of [10, 30]) {
  SW.setDiscH(H);
  let hr = 0, pen = 0, jit = 0, ms = 0, st = 0, bad = 0, minGap = 9;
  const S = 4;
  for (let s = 1; s <= S; s++) {
    const t = new SW.Table(s * 7907 + n, tune);
    t.addPile(Array.from({ length: n }, (_, i) => i));
    const steps = t.settle(Math.round(600 * (1 / 120) / t.T.dt));
    st += steps * t.T.dt;
    const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => a - b);
    hr += (t.columnTop()) / (n * H);
    pen += H / 2 - ys[0];
    for (let i = 1; i < ys.length; i++) minGap = Math.min(minGap, (ys[i] - ys[i - 1]) / H);
    const t0 = performance.now();
    let mx = 0;
    const K = Math.round(1 / t.T.dt);
    for (let i = 0; i < K; i++) { t.step(); mx = Math.max(mx, t.maxSpeed()); }
    ms += (performance.now() - t0) / K * (1 / 120) / t.T.dt; // 시뮬 1/120 s 당 ms
    jit += mx;
    bad += t.liveDiscs().filter((d) => rot(d.body.rotation(), { x: 0, y: 1, z: 0 }).y > -0.9).length;
  }
  console.log(`H${H}\t${name}\tn${n}\t높이/명목 ${(hr / S).toFixed(2)}\t최소간격/H ${minGap.toFixed(2)}\t바닥침투 ${(pen / S).toFixed(3)}\t1초 최대속도 ${(jit / S).toFixed(3)}\t가라앉힘 ${(st / S).toFixed(2)}s\t기울어짐 ${bad}\t${(ms / S).toFixed(2)}ms/120Hz스텝`);
}

// lib.mjs — 코어 쓸기 시제품: 평평한 책상 위 더미 + 책상 높이 입 + 고개 쳐올리기(제트 원점·각이 시간에 따라 바뀜)
// 힘 식은 v1 9차 입술 경로 그대로(simsweep.js = sim.js 복사 + prog 훅, 비트 동일 확인 verify.mjs). 이득 계수 0.
import * as SW from './simsweep.js';
export { SW };
const D2R = Math.PI / 180;

// 숨 봉투 (시뮬 초 = 화면 초, v1 중력 38 → 실물의 3.21배 느림)
export function breathOf(kind, D) {
  if (kind === 'puff') { const P = 0.131; return { dur: P, env: (t) => Math.sin(Math.min(1, t / P) * Math.PI) }; } // v1 퍽 그대로
  if (kind === 'pueok') {
    // 푸어억: 0.26 s 올라가 평평하게 D − 0.52 s 유지, 0.26 s 내려감 (v2 유량 상승·종료 0.26 s)
    const r = 0.26;
    return { dur: D, env: (t) => (t < r ? 0.5 * (1 - Math.cos((Math.PI * t) / r)) : t > D - r ? 0.5 * (1 - Math.cos((Math.PI * Math.max(0, D - t)) / r)) : 1) };
  }
  if (kind === 'pulse2') {
    // 진단(콤보는 다음 단계): 짧은 숨 두 번. D = [첫 길이, 쉼, 둘째 길이]. 각 숨은 0.1 s 올라가고 0.1 s 내려감
    const [a, g, b] = D, r = 0.1;
    const one = (t, L) => (t < 0 || t > L ? 0 : t < r ? 0.5 * (1 - Math.cos((Math.PI * t) / r)) : t > L - r ? 0.5 * (1 - Math.cos((Math.PI * (L - t)) / r)) : 1);
    return { dur: a + g + b, env: (t) => one(t, a) + one(t - a - g, b) };
  }
  throw new Error('breath ' + kind);
}

// 고개 각 α(t): t0 까지 0, 그 뒤 속도 w(°/s) 로 A(°) 까지, 거기서 멈춤
export function alphaOf({ A = 0, w = 30, t0 = 0 }) {
  const Ar = A * D2R, wr = w * D2R;
  return (t) => (A <= 0 || t <= t0 ? 0 : Math.min(Ar, wr * (t - t0)));
}

// 기본 기하: 입 높이 ym, 더미 앞면에서 수평 L, 목 축 = 입 + (0, PY, PZ) (뒤·위)
export const GEO = { ym: 0.5, L: 4, PY: 1.6, PZ: 3.6, phi0: 0 };

export function makeProg(table, { kin = 'c', sweep = {}, breath, geo = GEO }) {
  const c = table.pileCenter();
  const zf = c.z + 1; // 더미 앞면(입 쪽, +z)
  const M0 = { x: c.x, y: geo.ym, z: zf + geo.L };
  const N = { x: c.x, y: geo.ym + geo.PY, z: zf + geo.L + geo.PZ };
  const al = alphaOf(sweep);
  const vy = M0.y - N.y, vz = M0.z - N.z;
  return (t) => {
    const a = al(t);
    let o, phi;
    if (kin === 'c') { // 목 축 둘레로 고개를 젖힘: 입이 오르고 제트가 위로 꺾인다
      const ca = Math.cos(a), sa = Math.sin(a);
      o = { x: N.x, y: N.y + vy * ca - vz * sa, z: N.z + vz * ca + vy * sa };
      phi = geo.phi0 + a;
    } else if (kin === 'a') { o = M0; phi = geo.phi0 + a; } // 각도만
    else if (kin === 'b') { o = { x: M0.x, y: M0.y + geo.L * Math.tan(a), z: M0.z }; phi = geo.phi0; } // 높이만(닿는 점은 'a'와 같은 속도로 오름)
    else throw new Error('kin ' + kin);
    return { o, phi, ux: 0, uz: -1, env: breath.env(t) };
  };
}

function rot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// 한 샷. job = { n, seed, breath:{kind,D}, q, kin, sweep:{A,w,t0}, geo?, tune?, H?, trace? }
export function shot(job) {
  if (job.H) SW.setDiscH(job.H); else SW.setDiscH(0.11);
  const t = new SW.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(job.settleSteps || 600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const br = breathOf(job.breath.kind, job.breath.D);
  const prog = makeProg(t, { kin: job.kin || 'c', sweep: job.sweep || {}, breath: br, geo: { ...GEO, ...(job.geo || {}) } });
  t.blowProg({ prog, power: job.q, dur: br.dur });
  // 진행: 바닥 장(원래 맨 아래 i=0)의 앞(입 쪽) 테두리 높이, 더미 기울기
  const live = t.liveDiscs();
  const bottom = live[0];
  let maxTiltBottom = 0, tLift = -1, maxRimBottom = 0, liftSeries = job.trace ? [] : null;
  const dtS = t.T.dt;
  const maxSteps = Math.ceil((job.maxSec || 8) / dtS);
  let i = 0;
  for (; i < maxSteps; i++) {
    t.step();
    const up = rot(bottom.body.rotation(), { x: 0, y: 1, z: 0 });
    const tilt = Math.acos(Math.min(1, Math.abs(up.y)));
    if (tilt > maxTiltBottom) maxTiltBottom = tilt;
    if (tLift < 0 && tilt > 5 * D2R) tLift = (i + 1) * dtS;
    if (liftSeries && i % 6 === 0) {
      // 더미 '덩어리' 기울기: 원래 아래 절반의 평균 기울기, 위 절반 평균 기울기
      const half = Math.floor(job.n / 2);
      let tb = 0, tt = 0;
      live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
      liftSeries.push([+(((i + 1) * dtS).toFixed(3)), +(tilt / D2R).toFixed(1), +((tb / Math.max(1, half)) / D2R).toFixed(1), +((tt / Math.max(1, job.n - half)) / D2R).toFixed(1), t.puff ? 1 : 0]);
    }
    if (!t.puff && i > 30 && t.isSettled()) break;
  }
  const flippedSet = new Set(t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d)).map((d) => d.id));
  const outs = t.liveDiscs().filter((d) => !t.inCircle(d)).length;
  const half = Math.floor(job.n / 2);
  let flipBottom = 0, flipTop = 0, lean = 0, zs = [];
  for (const d of t.liveDiscs()) {
    if (flippedSet.has(d.id)) { if (d.id < half) flipBottom++; else flipTop++; }
    const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 });
    if (Math.abs(u.y) < 0.9 && Math.abs(u.y) > 0.2) lean++;
    zs.push(d.body.translation().z - c0.z);
  }
  zs.sort((a, b) => a - b);
  const fan = zs.length ? zs[zs.length - 1] - zs[0] : 0; // 부는 방향 퍼짐(반지름 단위, 0 = 그대로)
  const fwd = zs.length ? -zs[Math.floor(zs.length / 2)] : 0; // 중앙값이 먼 쪽(−z)으로 간 거리
  return {
    n: job.n, seed: job.seed, flip: flippedSet.size, out: outs, flipBottom, flipTop, lean, fan: +fan.toFixed(3), fwd: +fwd.toFixed(3),
    whole: flippedSet.size >= 0.7 * job.n ? 1 : 0, tilt0: +(maxTiltBottom / D2R).toFixed(1), tLift: +tLift.toFixed(3), top0: +top0.toFixed(3), steps: i,
    series: liftSeries || undefined,
  };
}

// wind.mjs — 게임 바람 모델의 엔진 독립 이식 (mockup/src/sim.js applyWind '기본 경로' = 지금 고전 조작의 초록 숨)
//
// 원본: mockup/src/sim.js (커밋 bd64bc8) Table.addPile('column') · settle · pileCenter · blow(기본) · applyWind · step · stepJudge · judgeResult.
// 이식 범위: 기울인 숨(jetPitch)·책상 퍼올림(tableScoop)·입술 높이(mouthY)·쓸기(blowProg)·jetLag 는 뺐다(PvP 고전 숨이 쓰는 기본 경로만).
// 식은 글자 그대로 옮겼다(곱하는 순서·×1 항까지) → Rapier v1 위에서 sim.js 와 비트 동일해야 한다(compare.mjs anchor 가 대조).
// 몸체 호출만 어댑터 API 로 바꿨다: translation/rotation → getPose, mass → mass, castRay → castRay({exclude}), applyImpulse* → 같은 이름.
// 난수도 sim.js 처럼 한 줄기(더미 → 숨 떨림 jit → 텀블)로 이어 쓴다.
import { GAME, mulberry32, gauss, rotate, quatFromAxisAngle, quatMul, JUDGE } from './common.mjs';
import { addPileTo } from './index.mjs';

// sim.js TUNE 중 기본 경로가 쓰는 값 (그대로)
export const WIND = Object.freeze({
  dt: 1 / 120,
  puffDuration: 0.131, jetR0: 0.471, jetSpread: 0.14, jetFalloff: 6.5,
  lift: 519.59, push: 21.993, gapRef: 0.293, minLift: 0.151, shield: 0.35, pushExp: 2.934,
  sweet: 0.938, tumble: 9.931, jitter: 0.12,
  blastLift: 0.6, blastPush: 15, blastShove: 3, circleR: 3.2,
  rimHit: 1, sideLiftLoss: 0.5, deflect: 0.6, spin: 8,
  loneLift: 0, pitch0: 0.1, tiltSpread: 1,
  scoopGap: 0.3, scoopLift: 0, scoopRise: 0.25, scoopCarry: 0.4, scoopBlast: 0,
  press: 0.5, pressBlast: 2.5, scoopFlushWedge: 0, scoopAirRef: 0.02,
});
const DISC_R = 1.0;

// sim.js addPile(cards, { mode: 'column' }) 와 같은 난수 소비(stackOffset 의 protrudeP 비교 한 번 포함)·같은 식.
// 값은 double 그대로 넘긴다(엔진이 f32 로 내림 — sim.js 와 같은 경로). 반환한 rng 는 숨 떨림·텀블이 이어 쓴다.
export function makeGamePile({ n = 20, seed = 1, h = GAME.discH, spread = 0.07 } = {}) {
  const rng = mulberry32(seed);
  const discs = [];
  for (let i = 0; i < n; i++) {
    const ox = gauss(rng) * spread, oz = gauss(rng) * spread;
    if (rng() < 0) { /* protrudeP = 0 : 비교용 한 번 소비만 */ }
    const x = 0 + ox, z = 0 + oz;
    const y = h / 2 + i * (h + 0.004);
    let q = quatFromAxisAngle(1, 0, 0, Math.PI);
    q = quatMul(quatFromAxisAngle(0, 1, 0, rng() * Math.PI * 2), q);
    const tilt = quatFromAxisAngle(1, 0, 0, (rng() - 0.5) * 0.03);
    q = quatMul(tilt, q);
    discs.push({ p: [x, y, z], q: [q.x, q.y, q.z, q.w] });
  }
  return { n, seed, h, discs, rng };
}

// 한 판(게임 절차) = 월드 + 더미 + 바람 상태. sim.js Table 의 물리 부분을 어댑터 위에서.
export class GameTable {
  constructor(w, { n, seed, h = GAME.discH, props = {}, T = WIND } = {}) {
    this.w = w; this.T = T; this.h = h;
    const pile = makeGamePile({ n, seed, h });
    this.rng = pile.rng;
    w.addFloor();
    addPileTo(w, pile, { props });
    this.n = n;
    this.off = new Set();
    this.puff = null;
  }

  // sim.js maxSpeed (off 제외)
  maxSpeed() {
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.off.has(i)) continue;
      const { v, w } = this.w.getVel(i);
      m = Math.max(m, Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z) * 0.5);
    }
    return m;
  }

  // sim.js step(): 바람 → 물리 한 스텝 → 책상 밖
  step() {
    if (this.puff) this.applyWind();
    this.w.step();
    for (let i = 0; i < this.n; i++) {
      if (this.off.has(i)) continue;
      const { p, q } = this.w.getPose(i);
      if (p.y < -3) {
        this.off.add(i);
        this.w.setGravityScale(i, 0, false);
        this.w.setVel(i, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, false);
        this.w.setPose(i, { x: p.x, y: -4, z: p.z }, q, false);
      }
    }
  }

  // sim.js settle(): 60스텝 뒤 최대 속도 < 0.06 이면 끝, 상한 600
  settle(maxSteps = 600) {
    for (let i = 0; i < maxSteps; i++) {
      this.step();
      if (i > 60 && this.maxSpeed() < 0.06) return i;
    }
    return maxSteps;
  }

  pileCenter() {
    let x = 0, z = 0;
    for (let i = 0; i < this.n; i++) { const { p } = this.w.getPose(i); x += p.x; z += p.z; }
    return { x: x / this.n, z: z / this.n };
  }

  // 위에서 k 번째 딱지 중심 높이(조준 높이 = 공략 '위에서 3장째'). 두 엔진의 눌림 차이를 따라간다
  kthFromTop(k = 3) {
    const ys = [];
    for (let i = 0; i < this.n; i++) if (!this.off.has(i)) ys.push(this.w.getPose(i).p.y);
    ys.sort((a, b) => b - a);
    return ys[Math.min(k, ys.length) - 1];
  }

  top() {
    let t = 0;
    for (let i = 0; i < this.n; i++) if (!this.off.has(i)) t = Math.max(t, this.w.getPose(i).p.y + this.h / 2);
    return t;
  }

  // sim.js blow() 기본 경로(jetPitch·tableScoop·mouthY·jetLag 없음)
  blow({ aim, dir, power, dist = 2.6, pitch = 0.1, blast = 0 }) {
    const up = 0, down = 0, spreadK = 1;
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len, dz = dir.z / len;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const d = { x: dx * cp, y: -sp, z: dz * cp };
    const o = { x: aim.x - d.x * dist, y: aim.y - d.y * dist, z: aim.z - d.z * dist };
    this.puff = { o, d, power, t: 0, jit: new Map(), blast, up, down, spreadK };
    for (let i = 0; i < this.n; i++) this.puff.jit.set(i, 1 + gauss(this.rng) * this.T.jitter);
  }

  // sim.js applyWind() 기본 경로 — 식·순서 그대로
  applyWind() {
    const P = this.puff;
    const T = this.T;
    const W = this.w;
    const env = Math.sin(Math.min(1, P.t / T.puffDuration) * Math.PI);
    let hits = 0;
    for (let id = 0; id < this.n; id++) {
      const pose = W.getPose(id);
      const c = pose.p;
      const nrm = rotate(pose.q, { x: 0, y: 1, z: 0 });
      let vx = P.o.x - c.x, vy = P.o.y - c.y, vz = P.o.z - c.z;
      const dn = vx * nrm.x + vy * nrm.y + vz * nrm.z;
      vx -= dn * nrm.x; vy -= dn * nrm.y; vz -= dn * nrm.z;
      const vl = Math.hypot(vx, vy, vz) || 1;
      let e = { x: c.x + (vx / vl) * DISC_R, y: c.y + (vy / vl) * DISC_R, z: c.z + (vz / vl) * DISC_R };
      let sinT = 0, side = 0, rh = null;
      if (T.rimHit) {
        const ox = P.o.x - c.x, oy = P.o.y - c.y, oz = P.o.z - c.z;
        const on = ox * nrm.x + oy * nrm.y + oz * nrm.z;
        const Ox = ox - on * nrm.x, Oy = oy - on * nrm.y, Oz = oz - on * nrm.z;
        const dn2 = P.d.x * nrm.x + P.d.y * nrm.y + P.d.z * nrm.z;
        let Dx = P.d.x - dn2 * nrm.x, Dy = P.d.y - dn2 * nrm.y, Dz = P.d.z - dn2 * nrm.z;
        const Dl = Math.hypot(Dx, Dy, Dz);
        if (Dl > 0.2) {
          Dx /= Dl; Dy /= Dl; Dz /= Dl;
          const od = Ox * Dx + Oy * Dy + Oz * Dz;
          const px = Ox - od * Dx, py = Oy - od * Dy, pz = Oz - od * Dz;
          const b = Math.hypot(px, py, pz);
          let ex, ey, ez;
          if (b < DISC_R) { const tt = -od - Math.sqrt(DISC_R * DISC_R - b * b); ex = Ox + tt * Dx; ey = Oy + tt * Dy; ez = Oz + tt * Dz; }
          else { ex = (px / b) * DISC_R; ey = (py / b) * DISC_R; ez = (pz / b) * DISC_R; }
          e = { x: c.x + ex, y: c.y + ey, z: c.z + ez };
          sinT = Math.min(1, b / DISC_R);
          rh = { x: ex / DISC_R, y: ey / DISC_R, z: ez / DISC_R };
          side = Math.sign((ey * Dz - ez * Dy) * nrm.x + (ez * Dx - ex * Dz) * nrm.y + (ex * Dy - ey * Dx) * nrm.z) || 0;
        }
      }
      const rx = e.x - P.o.x, ry = e.y - P.o.y, rz = e.z - P.o.z;
      const a = rx * P.d.x + ry * P.d.y + rz * P.d.z;
      if (a <= 0.05) continue;
      const lx = rx - a * P.d.x, ly = ry - a * P.d.y, lz = rz - a * P.d.z;
      const lat = Math.hypot(lx, ly * 1.6, lz);
      const rj = T.jetR0 + a * T.jetSpread;
      const cone = Math.exp(-((lat / rj) ** 2));
      if (cone < 0.02) continue;
      let s = P.power * Math.exp(-a / T.jetFalloff) * cone * env * (P.jit.get(id) ?? 1) * P.spreadK;
      // 차폐: 입 → 가장자리 사이 첫 충돌이 딱지면 약해짐(책상은 안 가림)
      const RL = Math.hypot(rx, ry, rz);
      const hit = W.castRay(P.o, { x: rx / Math.hypot(rx, ry, rz), y: ry / Math.hypot(rx, ry, rz), z: rz / Math.hypot(rx, ry, rz) }, RL - 0.08, { exclude: id });
      if (hit && hit.i >= 0) s *= T.shield;
      // 가장자리 밑 틈
      const g = W.castRay({ x: e.x, y: e.y - 0.01, z: e.z }, { x: 0, y: -1, z: 0 }, 2, { exclude: id });
      const gap = g ? g.toi : 2;
      let wedge = T.scoopGap * P.up * P.power * P.power;
      let under = 1;
      if (wedge > 0 && T.scoopFlushWedge < 1) { /* 기본 경로: up = 0 → 안 옴 */ }
      let liftF = Math.min(1.35, Math.max(T.minLift, (gap + wedge) / T.gapRef));
      const liftW = wedge > 0 ? liftF - Math.min(1.35, Math.max(T.minLift, gap / T.gapRef)) : 0;
      const m = W.mass(id);
      const k = s * m * T.dt;
      const pw = P.power;
      const bl = P.blast || 0;
      const cosT = Math.sqrt(1 - sinT * sinT);
      const riseShare = Math.min(1, T.scoopRise);
      const rimF = liftW > 0 ? liftF - riseShare * liftW : liftF;
      const liftB = T.lift * rimF * k * (1 - T.blastLift * Math.min(1, bl)) * (1 - T.sideLiftLoss * (1 - cosT)) * (1 - T.press * P.down);
      const liftK = liftB * (1 + T.scoopLift * P.up);
      const pushK = T.push * Math.pow(pw, T.pushExp) / Math.max(pw, 0.05) * k * (1 + T.blastPush * bl);
      let fx = P.d.x, fz = P.d.z;
      if (rh && sinT > 0) {
        const w = T.deflect * sinT;
        fx = P.d.x * (1 - w) - rh.x * w; fz = P.d.z * (1 - w) - rh.z * w;
        const fl = Math.hypot(fx, fz) || 1; const dl = Math.hypot(P.d.x, P.d.z) || 1;
        fx *= dl / fl; fz *= dl / fl;
      }
      const liftY = liftK;
      W.applyImpulseAtPoint(id, { x: fx * pushK, y: liftY, z: fz * pushK }, e);
      if (side && T.spin) { const tq = T.spin * sinT * side * k * DISC_R; W.applyTorqueImpulse(id, { x: nrm.x * tq, y: nrm.y * tq, z: nrm.z * tq }); }
      if (bl > 0) W.applyImpulse(id, { x: P.d.x * T.push * T.blastShove * bl * k, y: 0, z: P.d.z * T.push * T.blastShove * bl * k });
      if (pw > T.sweet) {
        const ch = (pw - T.sweet) * T.tumble * k;
        W.applyTorqueImpulse(id, { x: gauss(this.rng) * ch, y: gauss(this.rng) * ch * 0.3, z: gauss(this.rng) * ch });
      }
      hits++;
      void under;
    }
    P.t += T.dt;
    if (P.t >= T.puffDuration) this.puff = null;
    return hits;
  }

  // sim.js stepJudge
  stepJudge(j) {
    j.n++;
    const ms = this.maxSpeed();
    const ok = !this.puff && j.n > JUDGE.minSteps && (ms < JUDGE.eps || (j.n > JUDGE.lateSteps && ms < JUDGE.lateEps));
    j.quiet = ok ? j.quiet + 1 : 0;
    j.strict = !this.puff && j.n > JUDGE.minSteps && ms < JUDGE.eps ? (j.strict ?? 0) + 1 : 0;
    return j.quiet > JUDGE.quietSteps || j.n >= JUDGE.maxSteps;
  }

  // sim.js judgeResult: 원 안 + 그림 면 위(> 0.2) = 뒤집힘, 원 밖(책상 밖 포함) = 무효
  judgeResult() {
    let flipped = 0, outs = 0;
    for (let i = 0; i < this.n; i++) {
      const { p, q } = this.w.getPose(i);
      const inC = !this.off.has(i) && Math.hypot(p.x, p.z) <= this.T.circleR;
      if (!inC) { outs++; continue; }
      if (rotate(q, { x: 0, y: 1, z: 0 }).y > 0.2) flipped++;
    }
    return { flipped, outs };
  }
}

// 표준 초록 숨: 더미 중심 앞 테두리, 위에서 3장째 높이, 좌우 가운데, +x 로, 물리 세기 0.95(rules.physSweetFor, 2장 이상), 돌풍 0
export function standardShot(t, { k = 3, power = 0.95 } = {}) {
  const c = t.pileCenter();
  const y = t.kthFromTop(k);
  return { aim: { x: c.x - 1, y, z: c.z }, dir: { x: 1, z: 0 }, power, blast: 0 };
}

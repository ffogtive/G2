// sim.js — 딱지 물리 시뮬레이션 (렌더러 독립: three.js 없이 Node 에서도 돈다)
//
// 가설: 실제 유체 시뮬 없이 "바람 맞는 쪽 가장자리를 들어 올리는 임펄스(+약한 전진)"만으로
//       '일부만 넘어가는' 그럴듯한 결과가 나온다. 들뜬 가장자리(오버행)일수록 잘 넘어간다 = 실력 요소.
//
// 단위: 딱지 반지름 R = 1. (실물 지름 ~5cm → 1단위 ≈ 2.5cm)
// 딱지 로컬 +Y 면 = 그림(캐릭터) 면. 시작 시 전부 그림이 아래(뒷면이 위). 그림이 위로 오면 "뒤집힘".

import RAPIER from '@dimforge/rapier3d-compat';

export const DISC_R = 1.0;
export const DISC_H = 0.11; // 게임용 과장 두께(실물보다 두꺼움 → 장난감 같은 볼륨감 + 물리 안정)
export const TABLE_R = 9.0;

export const TUNE = {
  gravity: 38,
  dt: 1 / 120,
  density: 1.0,
  friction: 0.75,
  restitution: 0.0,
  linDamp: 0.35,
  angDamp: 1.0,
  erp: 0.2, // 기본값이면 쌓인 원판이 영원히 떨림(실측 2026-10-12) → 0.2 에서 20장 완전 정지
  // 바람(puff) 모델 — tools/tune.mjs 자동탐색(#73, 2026-10-12) 결과.
  // 실측(20장, 8시드): 맨 위 조준 p0.95 → 평균 7.4장(4~10, 안정) / 가운데 조준 p0.95 → 평균 8(0~16, 대박 아니면 꽝) / 아래 조준 → 거의 0
  puffDuration: 0.131, // 초
  jetR0: 0.471, // 입 앞 제트 반경
  jetSpread: 0.14, // 거리당 퍼짐
  jetFalloff: 6.5, // 거리 감쇠 길이
  lift: 519.59, // 가장자리 들어 올리는 힘 계수
  push: 21.993, // 진행 방향으로 미는 힘
  gapRef: 0.293, // 이 정도 틈이면 공기가 가장자리 밑으로 '완전히' 들어감
  minLift: 0.151, // 바닥에 딱 붙어도 최소 이만큼은 듦
  shield: 0.35, // 제트 경로가 다른 딱지에 가려지면 곱해지는 계수
  pushExp: 2.934, // 미는 힘의 파워 지수 (>1 이면 세게 불수록 밀림 비중↑)
  sweet: 0.938, // 이 파워를 넘으면 텀블(혼돈) 시작
  tumble: 9.931,
  jitter: 0.12, // 결과의 변동(같은 입력 → 조금씩 다른 결과)
};

export async function initPhysics() {
  await RAPIER.init();
}

// 재현 가능한 난수 (PvP 리플레이/동기화 대비)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 쿼터니언으로 벡터 회전
function rotate(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

function quatFromAxisAngle(ax, ay, az, ang) {
  const s = Math.sin(ang / 2);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) };
}

function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export class Table {
  constructor(seed = 1, tune = {}) {
    this.T = { ...TUNE, ...tune };
    this.rng = mulberry32(seed);
    this.world = new RAPIER.World({ x: 0, y: -this.T.gravity, z: 0 });
    const ip = this.world.integrationParameters;
    ip.dt = this.T.dt;
    ip.numSolverIterations = 8;
    ip.numAdditionalFrictionIterations = 4;
    ip.erp = this.T.erp;
    // 바닥(책상)
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(TABLE_R * 2, 0.5, TABLE_R * 2).setFriction(0.9), ground);
    this.discs = []; // {id, body, collider, cardId, owner:null}
    this.puff = null;
    this.time = 0;
  }

  // 딱지 더미 만들기. mode 'column' = 손으로 가지런히 쌓은 원기둥(기본, 원작 룰), 'heap' = 흩어진 무더기
  // 원기둥에서 "어느 높이·어느 쪽을 맞히느냐"가 조준 실력 요소가 된다.
  // heavy: 무거운(테이프 감은) 딱지로 만들 인덱스 집합 — 밀도 ×3 (원작 '테이프 감기' 꼼수, 레벨 기믹)
  addPile(cards, { mode = 'column', spread = 0.07, at = { x: 0, z: 0 }, heavy = new Set() } = {}) {
    const H = DISC_H;
    cards.forEach((cardId, i) => {
      const heap = mode === 'heap';
      const x = at.x + gauss(this.rng) * (heap ? 0.42 : spread);
      const z = at.z + gauss(this.rng) * (heap ? 0.42 : spread);
      const y = heap ? 0.2 + i * H * 1.6 : H / 2 + i * (H + 0.004);
      // 뒷면이 위: X축으로 180도 회전 + 약간의 기울기 + 임의 yaw
      let q = quatFromAxisAngle(1, 0, 0, Math.PI);
      q = quatMul(quatFromAxisAngle(0, 1, 0, this.rng() * Math.PI * 2), q);
      const tilt = quatFromAxisAngle(1, 0, 0, (this.rng() - 0.5) * (heap ? 0.12 : 0.03));
      q = quatMul(tilt, q);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setRotation(q)
          .setLinearDamping(this.T.linDamp)
          .setAngularDamping(this.T.angDamp)
          .setCcdEnabled(true),
      );
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(H / 2, DISC_R)
          .setDensity(this.T.density * (heavy.has(i) ? 3 : 1))
          .setFriction(this.T.friction)
          .setRestitution(this.T.restitution),
        body,
      );
      this.discs.push({ id: this.discs.length, body, collider: col, cardId, owner: null, removed: false, heavy: heavy.has(i) });
    });
  }

  // 남은 딱지를 다시 원기둥으로 모을 목표 자세 계산 (애니메이션용; 적용은 applyRestack)
  restackTargets(at = { x: 0, z: 0 }) {
    const H = DISC_H;
    return this.liveDiscs().map((d, i) => {
      let q = quatFromAxisAngle(1, 0, 0, Math.PI);
      q = quatMul(quatFromAxisAngle(0, 1, 0, this.rng() * Math.PI * 2), q);
      q = quatMul(quatFromAxisAngle(1, 0, 0, (this.rng() - 0.5) * 0.03), q);
      return { d, p: { x: at.x + gauss(this.rng) * 0.07, y: H / 2 + i * (H + 0.004), z: at.z + gauss(this.rng) * 0.07 }, q };
    });
  }

  applyRestack(targets) {
    for (const { d, p, q } of targets) {
      d.body.setTranslation(p, true);
      d.body.setRotation(q, true);
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  restack(at = { x: 0, z: 0 }) {
    this.applyRestack(this.restackTargets(at));
  }

  columnTop() {
    let top = 0;
    for (const d of this.liveDiscs()) top = Math.max(top, d.body.translation().y + DISC_H / 2);
    return top;
  }

  // 시작 전 더미를 가라앉힘
  settle(maxSteps = 600) {
    for (let i = 0; i < maxSteps; i++) {
      this.step();
      if (i > 60 && this.isSettled()) return i;
    }
    return maxSteps;
  }

  liveDiscs() {
    return this.discs.filter((d) => !d.removed);
  }

  faceUp(d) {
    const up = rotate(d.body.rotation(), { x: 0, y: 1, z: 0 });
    return up.y; // >0 이면 그림 면이 위
  }

  maxSpeed() {
    let m = 0;
    for (const d of this.liveDiscs()) {
      const v = d.body.linvel();
      const w = d.body.angvel();
      m = Math.max(m, Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z) * 0.5);
    }
    return m;
  }

  isSettled(eps = 0.06) {
    return this.maxSpeed() < eps;
  }

  // 더미 중심(조준 보조)
  pileCenter() {
    const live = this.liveDiscs();
    if (!live.length) return { x: 0, z: 0 };
    let x = 0, z = 0;
    for (const d of live) {
      const p = d.body.translation();
      x += p.x; z += p.z;
    }
    return { x: x / live.length, z: z / live.length };
  }

  // 바람!  aim: 맞힐 지점(원기둥 표면 근처 x,y,z), dir: 부는 수평 방향(x,z), dist: 입~조준점 거리,
  //         power: 0..1 (1 초과 = 오버파워), pitch: 아래로 내려 부는 각(라디안)
  blow({ aim, dir, power, dist = 2.6, pitch = 0.1, origin }) {
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len, dz = dir.z / len;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const d = { x: dx * cp, y: -sp, z: dz * cp };
    const o = origin ?? { x: aim.x - d.x * dist, y: aim.y - d.y * dist, z: aim.z - d.z * dist };
    this.puff = { o, d, power, t: 0, jit: new Map() };
    // 딱지별 변동 계수(같은 입력도 결과가 조금씩 다름 → 물리의 가변 보상)
    for (const disc of this.liveDiscs()) this.puff.jit.set(disc.id, 1 + gauss(this.rng) * this.T.jitter);
  }

  // 퍼프 1스텝 동안 각 딱지가 받는 바람 (진단용으로 per-disc 강도도 반환)
  applyWind() {
    const P = this.puff;
    if (!P) return null;
    const T = this.T;
    const env = Math.sin(Math.min(1, P.t / T.puffDuration) * Math.PI); // 0→1→0
    const hits = [];
    for (const d of this.liveDiscs()) {
      const b = d.body;
      const c = b.translation();
      const nrm = rotate(b.rotation(), { x: 0, y: 1, z: 0 });
      // 입 쪽으로 가장 가까운 가장자리 점: (O - c)를 원판 평면에 투영
      let vx = P.o.x - c.x, vy = P.o.y - c.y, vz = P.o.z - c.z;
      const dn = vx * nrm.x + vy * nrm.y + vz * nrm.z;
      vx -= dn * nrm.x; vy -= dn * nrm.y; vz -= dn * nrm.z;
      const vl = Math.hypot(vx, vy, vz) || 1;
      const e = { x: c.x + (vx / vl) * DISC_R, y: c.y + (vy / vl) * DISC_R, z: c.z + (vz / vl) * DISC_R };
      // 제트 축 기준 위치
      const rx = e.x - P.o.x, ry = e.y - P.o.y, rz = e.z - P.o.z;
      const a = rx * P.d.x + ry * P.d.y + rz * P.d.z;
      if (a <= 0.05) continue;
      const lx = rx - a * P.d.x, ly = ry - a * P.d.y, lz = rz - a * P.d.z;
      const lat = Math.hypot(lx, ly * 1.6, lz);
      const rj = T.jetR0 + a * T.jetSpread;
      const cone = Math.exp(-((lat / rj) ** 2));
      if (cone < 0.02) continue;
      let s = P.power * Math.exp(-a / T.jetFalloff) * cone * env * (P.jit.get(d.id) ?? 1);
      // 차폐: 입 → 가장자리 사이에 다른 딱지가 있으면 약해짐
      const ray = new RAPIER.Ray(P.o, { x: rx / Math.hypot(rx, ry, rz), y: ry / Math.hypot(rx, ry, rz), z: rz / Math.hypot(rx, ry, rz) });
      const hit = this.world.castRay(ray, Math.hypot(rx, ry, rz) - 0.08, true, undefined, undefined, d.collider, b);
      if (hit && hit.collider.parent()?.isDynamic()) s *= T.shield;
      // 가장자리 밑 틈: 공기가 들어갈 여지(오버행일수록 크게 뜸)
      const down = new RAPIER.Ray({ x: e.x, y: e.y - 0.01, z: e.z }, { x: 0, y: -1, z: 0 });
      const g = this.world.castRay(down, 2, true, undefined, undefined, d.collider, b);
      const gap = g ? g.toi : 2;
      const liftF = Math.min(1.35, Math.max(T.minLift, gap / T.gapRef));
      const m = b.mass();
      const k = s * m * T.dt;
      // 파워 곡선: 들어 올림은 파워에 비례, 미는 힘은 파워^pushExp → 너무 세게 불면 '뒤집히기보다 밀려남'(스윗스팟 생성)
      const pw = P.power;
      const liftK = T.lift * liftF * k;
      const pushK = T.push * Math.pow(pw, T.pushExp) / Math.max(pw, 0.05) * k;
      b.applyImpulseAtPoint({ x: P.d.x * pushK, y: liftK, z: P.d.z * pushK }, e, true);
      // 오버파워: 무작위 텀블(결과가 운에 맡겨짐)
      if (pw > T.sweet) {
        const ch = (pw - T.sweet) * T.tumble * k;
        b.applyTorqueImpulse({ x: gauss(this.rng) * ch, y: gauss(this.rng) * ch * 0.3, z: gauss(this.rng) * ch }, true);
      }
      hits.push({ id: d.id, s, gap, liftF, e, dir: { x: P.d.x, y: P.d.y, z: P.d.z } });
    }
    P.t += T.dt;
    if (P.t >= T.puffDuration) this.puff = null;
    return hits;
  }

  step() {
    // lastHits: 이번 스텝에 바람이 '가장자리 밑으로 파고든' 딱지들 (렌더러가 공기 유입을 그리는 데 사용)
    this.lastHits = this.puff ? this.applyWind() : null;
    this.world.step();
    this.time += this.T.dt;
    // 책상 밖으로 너무 멀리 날아간 딱지는 테이블 가장자리 근처로 클램프(게임 가독성)
    for (const d of this.liveDiscs()) {
      const p = d.body.translation();
      if (p.y < -3) {
        d.body.setTranslation({ x: p.x * 0.5, y: 1, z: p.z * 0.5 }, true);
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  // 블로우 후 정착까지 진행. 반환: 뒤집힌 딱지 목록
  runUntilSettled(maxSec = 6) {
    const steps = Math.ceil(maxSec / this.T.dt);
    let i = 0;
    for (; i < steps; i++) {
      this.step();
      if (!this.puff && i > 30 && this.isSettled()) break;
    }
    return { steps: i, flipped: this.liveDiscs().filter((d) => this.faceUp(d) > 0.2) };
  }

  remove(d) {
    d.removed = true;
    this.world.removeRigidBody(d.body);
  }

  snapshot() {
    return this.liveDiscs().map((d) => {
      const p = d.body.translation();
      const q = d.body.rotation();
      return { id: d.id, p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    });
  }
}

// rapier.mjs — 엔진 독립 어댑터의 Rapier 쪽 (@dimforge/rapier3d-compat 0.12.0 = 게임 웹 물리와 같은 빌드)
// API 는 adapters/index.mjs 머리말 참고. 게임 sim.js Table 과 같은 설정을 그대로 쓴다.
import { GAME, Hasher } from './common.mjs';

let R = null;
const RAPIER_CANDIDATES = [
  process.env.RAPIER_PATH,
  '@dimforge/rapier3d-compat',
  '/home/user/G2/node_modules/@dimforge/rapier3d-compat/rapier.es.js',
].filter(Boolean);

export async function loadRapier() {
  if (R) return R;
  let err;
  for (const spec of RAPIER_CANDIDATES) {
    try { R = (await import(spec)).default; break; } catch (e) { err = e; }
  }
  if (!R) throw err;
  await R.init();
  return R;
}

export class RapierWorld {
  // params: index.mjs normalizeParams() 결과
  constructor(params) {
    if (!R) throw new Error('loadRapier() 먼저');
    this.P = params;
    this.engine = 'rapier';
    this.world = new R.World({ x: 0, y: -params.gravity, z: 0 });
    const ip = this.world.integrationParameters;
    ip.dt = params.dt / params.substeps;
    ip.numSolverIterations = params.iterations;
    ip.numAdditionalFrictionIterations = params.frictionIterations;
    ip.erp = params.erp;
    const rp = params.rapier;
    if (rp.allowedLinearError != null) ip.allowedLinearError = rp.allowedLinearError;
    if (rp.predictionDistance != null) ip.predictionDistance = rp.predictionDistance;
    if (rp.numInternalPgsIterations != null) ip.numInternalPgsIterations = rp.numInternalPgsIterations;
    this.bodies = []; // 딱지만 (인덱스 = addDisc 순서)
    this.colliders = [];
    this.colIndex = new Map(); // collider handle → 딱지 인덱스
    this.floor = null;
    this.stepCount = 0;
    this._isDisc = (c) => c.parent()?.isDynamic();
    // 게임과 같은 '평균' 결합 규칙(Rapier 기본) — combine 'native' 도 Rapier 에선 평균
  }

  addFloor({ hx = GAME.desk.hx, hy = GAME.desk.hy, hz = GAME.desk.hz, y = -GAME.desk.hy, friction = GAME.floorFriction, restitution = GAME.floorRestitution } = {}) {
    const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, y, 0));
    this.floor = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(restitution), b);
    return -1;
  }

  addDisc(pos, rot, radius = GAME.discR, halfHeight = GAME.discH / 2, props = {}) {
    const p = { density: GAME.density, friction: GAME.friction, restitution: GAME.restitution, linDamp: GAME.linDamp, angDamp: GAME.angDamp, ccd: this.P.ccd, ...props };
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(rot)
      .setLinearDamping(p.linDamp)
      .setAngularDamping(p.angDamp)
      .setCcdEnabled(!!p.ccd)
      .setCanSleep(!!this.P.sleep.enabled);
    const body = this.world.createRigidBody(desc);
    const col = this.world.createCollider(
      R.ColliderDesc.cylinder(halfHeight, radius).setDensity(p.density).setFriction(p.friction).setRestitution(p.restitution),
      body,
    );
    this.bodies.push(body);
    this.colliders.push(col);
    this.colIndex.set(col.handle, this.bodies.length - 1);
    return this.bodies.length - 1;
  }

  get count() { return this.bodies.length; }

  step() {
    for (let k = 0; k < this.P.substeps; k++) this.world.step();
    this.stepCount++;
  }

  getPose(i) {
    const b = this.bodies[i];
    const t = b.translation(), q = b.rotation();
    return { p: { x: t.x, y: t.y, z: t.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
  }
  getVel(i) {
    const b = this.bodies[i];
    const v = b.linvel(), w = b.angvel();
    return { v: { x: v.x, y: v.y, z: v.z }, w: { x: w.x, y: w.y, z: w.z } };
  }
  mass(i) { return this.bodies[i].mass(); }

  setPose(i, p, q, wake = true) { const b = this.bodies[i]; b.setTranslation(p, wake); b.setRotation(q, wake); }
  setVel(i, v, w, wake = true) { const b = this.bodies[i]; b.setLinvel(v, wake); b.setAngvel(w, wake); }
  setGravityScale(i, s, wake = true) { this.bodies[i].setGravityScale(s, wake); }

  applyImpulseAtPoint(i, J, P) { this.bodies[i].applyImpulseAtPoint(J, P, true); }
  applyImpulse(i, J) { this.bodies[i].applyImpulse(J, true); }
  applyTorqueImpulse(i, T) { this.bodies[i].applyTorqueImpulse(T, true); }

  // dir 은 단위 벡터. opts.exclude = 딱지 인덱스(자기 자신), opts.discsOnly = 책상 무시. 반환 { i (책상 = -1), toi } | null
  castRay(from, dir, max, opts = {}) {
    const ray = new R.Ray(from, dir);
    const ex = opts.exclude != null && opts.exclude >= 0 ? opts.exclude : null;
    const hit = this.world.castRay(ray, max, true, undefined, undefined,
      ex != null ? this.colliders[ex] : undefined, ex != null ? this.bodies[ex] : undefined,
      opts.discsOnly ? this._isDisc : undefined);
    if (!hit) return null;
    const i = this.colIndex.get(hit.collider.handle) ?? -1;
    return { i, toi: hit.toi };
  }

  isSleeping(i) { return this.bodies[i].isSleeping(); }
  wake(i) { this.bodies[i].wakeUp(); }
  sleepingCount() { let s = 0; for (const b of this.bodies) if (b.isSleeping()) s++; return s; }

  // 상태 해시: 딱지 순서대로 p(3) q(4) v(3) ω(3) 의 float32 비트
  hashState() {
    const H = new Hasher();
    for (const b of this.bodies) {
      const t = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
      H.f32(t.x); H.f32(t.y); H.f32(t.z);
      H.f32(q.x); H.f32(q.y); H.f32(q.z); H.f32(q.w);
      H.f32(v.x); H.f32(v.y); H.f32(v.z);
      H.f32(w.x); H.f32(w.y); H.f32(w.z);
    }
    return H.hex();
  }

  info() {
    const ip = this.world.integrationParameters;
    return {
      engine: 'rapier', version: R.version(), build: '@dimforge/rapier3d-compat 0.12.0 WASM (enhanced-determinism 기능 없는 배포본 — 같은 wasm 끼리는 같음, 네이티브 0.36 과는 버전이 다름)',
      dt: ip.dt * this.P.substeps, substeps: this.P.substeps, iterations: ip.numSolverIterations, frictionIterations: ip.numAdditionalFrictionIterations,
      erp: ip.erp, allowedLinearError: ip.allowedLinearError, predictionDistance: ip.predictionDistance,
      pgs: ip.numInternalPgsIterations, sleep: this.P.sleep.enabled ? 'Rapier 기본 문턱(lin 0.4·ang 0.5·2 s, JS 0.12 에선 못 바꿈)' : '끔',
      combine: 'average(Rapier 기본)',
    };
  }

  destroy() { this.world.free(); this.bodies = []; this.colliders = []; }
}

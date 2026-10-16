// jolt.mjs — 엔진 독립 어댑터의 Jolt 쪽 (npm jolt-physics 1.1.0 = JoltPhysics.js, Jolt v5.6.0, WASM 단일 스레드)
// API 는 adapters/index.mjs 머리말 참고.
//
// 설정 짝(자세한 근거는 index.mjs JOLT_FAIR 주석):
//   dt, gravity, density(ConvexShapeSettings.mDensity — Jolt 기본 1000 이라 반드시 넣음), 감쇠, CCD(LinearCast)
//   Rapier erp(부드러운 접촉 스프링) ↔ Jolt mBaumgarte(위치 단계 보정 비율, 접촉은 단단함) + mPenetrationSlop(허용 겹침)
//   Rapier predictionDistance ↔ mSpeculativeContactDistance, numSolverIterations ↔ mNumVelocitySteps (+ mNumPositionSteps)
//   마찰·반발 결합: Rapier = 평균, Jolt = √(f1·f2)·max(r1,r2) → combine 'average' 면 게임과 같은 평균이 나오게 맞춘다
import { GAME, Hasher, fr } from './common.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 빌드 종류(JOLT_FLAVOUR):
//   'wasm-compat'(기본) = npm jolt-physics 1.1.0 배포본. CROSS_PLATFORM_DETERMINISTIC 꺼짐 → WASM 끼리만 같고 네이티브와는 26스텝째부터 갈라짐(실측)
//   'cpd'               = 같은 JoltPhysics.js 1.1.0 을 CROSS_PLATFORM_DETERMINISTIC=ON 으로 다시 빌드한 것(vendor/, native/build-jolt-cpd-wasm.sh)
//                         → 네이티브 x86_64·aarch64 CPD 빌드와 비트 동일(실측, hashcmp.mjs)
//   그 밖 = jolt-physics/<flavour> 하위 경로. JOLT_PATH 를 주면 그 파일을 그대로 씀
// npm 배포본은 저장소 package.json 에 넣지 않는다. 스크래치에 깔고 JOLT_NPM 으로 가리킨다(README '설치'):
//   npm install --prefix /tmp/jolt-npm --no-save jolt-physics@1.1.0
//   JOLT_NPM=/tmp/jolt-npm/node_modules/jolt-physics JOLT_FLAVOUR=wasm-compat node smoke.mjs
//   (JOLT_NPM 이 없으면 'jolt-physics' 를 보통 방식으로 찾는다 — tools/enginecmp/node_modules 를 스크래치로 심볼릭 링크해도 됨)
const VENDOR = fileURLToPath(new URL('../vendor/', import.meta.url));
function cpdPath() {
  const js = VENDOR + 'jolt-physics-1.1.0-cpd.wasm-compat.js';
  if (!existsSync(js) && existsSync(js + '.gz')) writeFileSync(js, gunzipSync(readFileSync(js + '.gz')));
  if (!existsSync(js)) throw new Error('CPD 빌드 없음: native/build-jolt-cpd-wasm.sh 로 만들거나 vendor/*.gz 확인');
  return pathToFileURL(js).href;
}

let J = null;
let JOLT_META = null;
export async function loadJolt(flavour = process.env.JOLT_FLAVOUR || 'wasm-compat') {
  if (J) {
    if (JOLT_META.flavour !== flavour && !process.env.JOLT_PATH) throw new Error(`Jolt ${JOLT_META.flavour} 이미 로드됨(한 프로세스에 한 빌드)`);
    return J;
  }
  const spec = process.env.JOLT_PATH
    ? (process.env.JOLT_PATH.startsWith('/') ? pathToFileURL(process.env.JOLT_PATH).href : process.env.JOLT_PATH)
    : flavour === 'cpd' ? cpdPath()
    : process.env.JOLT_NPM ? pathToFileURL(`${process.env.JOLT_NPM}/dist/jolt-physics.${flavour === 'wasm-compat' ? 'wasm-compat' : flavour}.js`).href
    : flavour === 'wasm-compat' ? 'jolt-physics' : `jolt-physics/${flavour}`;
  const init = (await import(spec)).default;
  J = await init();
  JOLT_META = { flavour: process.env.JOLT_PATH ? 'path' : flavour, spec };
  return J;
}
export const joltMeta = () => JOLT_META;

const L_STATIC = 0, L_MOVING = 1;

export class JoltWorld {
  constructor(params) {
    if (!J) throw new Error('loadJolt() 먼저');
    this.P = params;
    this.engine = 'jolt';
    const jp = params.jolt;
    const settings = new J.JoltSettings();
    settings.mMaxBodies = 4096;
    settings.mMaxBodyPairs = 65536;
    settings.mMaxContactConstraints = 16384;
    const olp = new J.ObjectLayerPairFilterTable(2);
    olp.EnableCollision(L_STATIC, L_MOVING);
    olp.EnableCollision(L_MOVING, L_MOVING);
    const bpi = new J.BroadPhaseLayerInterfaceTable(2, 2);
    bpi.MapObjectToBroadPhaseLayer(L_STATIC, new J.BroadPhaseLayer(0));
    bpi.MapObjectToBroadPhaseLayer(L_MOVING, new J.BroadPhaseLayer(1));
    settings.mObjectLayerPairFilter = olp;
    settings.mBroadPhaseLayerInterface = bpi;
    settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bpi, 2, olp, 2);
    this.jolt = new J.JoltInterface(settings);
    J.destroy(settings);
    this.ps = this.jolt.GetPhysicsSystem();
    this.bi = this.ps.GetBodyInterface();
    this.npq = this.ps.GetNarrowPhaseQuery();

    // ── 물리 설정 (기본값을 그대로 두지 않는다: 길이 허용치는 게임 단위(1 u = 25 mm, 두께 0.11 u)에 맞춰 줄임) ──
    const s = this.ps.GetPhysicsSettings();
    s.mBaumgarte = jp.baumgarte;
    s.mPenetrationSlop = jp.penetrationSlop;
    s.mSpeculativeContactDistance = jp.speculativeContactDistance;
    s.mMaxPenetrationDistance = jp.maxPenetrationDistance;
    s.mLinearCastThreshold = jp.linearCastThreshold;
    s.mLinearCastMaxPenetration = jp.linearCastMaxPenetration;
    s.mManifoldTolerance = jp.manifoldTolerance;
    s.mNumVelocitySteps = jp.velocitySteps;
    s.mNumPositionSteps = jp.positionSteps;
    s.mMinVelocityForRestitution = jp.minVelocityForRestitution;
    s.mBodyPairCacheMaxDeltaPositionSq = jp.bodyPairCacheMaxDeltaPosition ** 2;
    s.mContactPointPreserveLambdaMaxDistSq = jp.contactPointPreserveLambdaMaxDist ** 2;
    s.mAllowSleeping = !!params.sleep.enabled;
    s.mTimeBeforeSleep = params.sleep.joltTime; // = time / 하위 스텝 (Jolt 5.6 은 타이머를 바깥 스텝마다 dt/하위 스텝만 올림, index.mjs '잠')
    s.mPointVelocitySleepThreshold = params.sleep.pointVelocity;
    s.mDeterministicSimulation = true;
    s.mUseLargeIslandSplitter = jp.useLargeIslandSplitter;
    this.ps.SetPhysicsSettings(s);
    const g = new J.Vec3(0, -params.gravity, 0);
    this.ps.SetGravity(g);
    J.destroy(g);

    this.bodies = [];      // J.Body (딱지)
    this.ids = [];         // J.BodyID
    this.mat = [];         // { f, r } 딱지별 원래 값
    this.index = new Map();// BodyID 정수 → 딱지 인덱스
    this.floorBody = null;
    this.floorMat = null;
    this.shapeCache = new Map();
    this.stepCount = 0;
    this.combineMode = null; // 'material' | 'listener' | 'native'
    this.combineDirty = true;

    // 질의용 재사용 객체
    this.tv = new J.Vec3(0, 0, 0);
    this.tv2 = new J.Vec3(0, 0, 0);
    this.trv = new J.RVec3(0, 0, 0);
    this.tq = new J.Quat(0, 0, 0, 1);
    this.ray = new J.RRayCast();
    this.rayRV = new J.RVec3(0, 0, 0);
    this.rayV = new J.Vec3(0, 0, 0);
    this.raySettings = new J.RayCastSettings();
    this.rayCollector = new J.CastRayClosestHitCollisionCollector();
    this.bpFilter = new J.DefaultBroadPhaseLayerFilter(this.jolt.GetObjectVsBroadPhaseLayerFilter(), L_MOVING);
    this.olAll = new J.DefaultObjectLayerFilter(this.jolt.GetObjectLayerPairFilter(), L_MOVING);
    this.olDiscs = new J.SpecifiedObjectLayerFilter(L_MOVING);
    this.noBodyFilter = new J.BodyFilter();
    this.shapeFilter = new J.ShapeFilter();
    this.ignoreFilters = []; // 딱지별 IgnoreSingleBodyFilter
  }

  _shape(radius, halfHeight, density) {
    const cr = Math.min(this.P.jolt.convexRadiusMax, halfHeight * this.P.jolt.convexRadiusFrac, radius * 0.5);
    const key = `${radius}|${halfHeight}|${density}|${cr}`;
    let e = this.shapeCache.get(key);
    if (!e) {
      const ss = new J.CylinderShapeSettings(halfHeight, radius, cr);
      ss.mDensity = density;
      const res = ss.Create();
      if (res.HasError()) throw new Error('Jolt CylinderShape: ' + res.GetError().c_str());
      e = { ss, shape: res.Get(), cr };
      this.shapeCache.set(key, e);
    }
    return e.shape;
  }

  addFloor({ hx = GAME.desk.hx, hy = GAME.desk.hy, hz = GAME.desk.hz, y = -GAME.desk.hy, friction = GAME.floorFriction, restitution = GAME.floorRestitution } = {}) {
    const he = new J.Vec3(hx, hy, hz);
    const box = new J.BoxShape(he, Math.min(0.05, hy * 0.5));
    J.destroy(he);
    const pos = new J.RVec3(0, y, 0), rot = new J.Quat(0, 0, 0, 1);
    const bcs = new J.BodyCreationSettings(box, pos, rot, J.EMotionType_Static, L_STATIC);
    bcs.mFriction = friction;
    bcs.mRestitution = restitution;
    this.floorBody = this.bi.CreateBody(bcs);
    this.bi.AddBody(this.floorBody.GetID(), J.EActivation_DontActivate);
    J.destroy(bcs); J.destroy(pos); J.destroy(rot);
    this.floorMat = { f: friction, r: restitution };
    this.combineDirty = true;
    return -1;
  }

  addDisc(pos, rot, radius = GAME.discR, halfHeight = GAME.discH / 2, props = {}) {
    const p = { density: GAME.density, friction: GAME.friction, restitution: GAME.restitution, linDamp: GAME.linDamp, angDamp: GAME.angDamp, ccd: this.P.ccd, ...props };
    const shape = this._shape(radius, halfHeight, p.density);
    const jp = new J.RVec3(pos.x, pos.y, pos.z), jq = new J.Quat(rot.x, rot.y, rot.z, rot.w);
    const bcs = new J.BodyCreationSettings(shape, jp, jq, J.EMotionType_Dynamic, L_MOVING);
    bcs.mFriction = p.friction;
    bcs.mRestitution = p.restitution;
    bcs.mLinearDamping = p.linDamp;
    bcs.mAngularDamping = p.angDamp;
    bcs.mMotionQuality = p.ccd ? J.EMotionQuality_LinearCast : J.EMotionQuality_Discrete;
    bcs.mAllowSleeping = !!this.P.sleep.enabled;
    bcs.mMaxAngularVelocity = this.P.jolt.maxAngularVelocity;
    bcs.mMaxLinearVelocity = this.P.jolt.maxLinearVelocity;
    const body = this.bi.CreateBody(bcs);
    const id = body.GetID();
    this.bi.AddBody(id, J.EActivation_Activate);
    J.destroy(bcs); J.destroy(jp); J.destroy(jq);
    const i = this.bodies.length;
    this.bodies.push(body);
    this.ids.push(id);
    this.mat.push({ f: p.friction, r: p.restitution });
    this.index.set(id.GetIndexAndSequenceNumber(), i);
    this.ignoreFilters.push(new J.IgnoreSingleBodyFilter(id));
    this.combineDirty = true;
    return i;
  }

  get count() { return this.bodies.length; }

  // 결합 규칙 맞추기. 'average': 게임(Rapier)과 같은 산술 평균.
  //   딱지 재질이 하나뿐이고 책상 반발 ≥ 딱지 반발이면 책상 값만 바꿔 Jolt 자체 규칙(√·max)으로 정확히 평균을 만든다(콜백 없음 = 빠름).
  //   아니면 ContactListenerJS 로 접촉마다 평균을 넣는다(JS 콜백 비용 있음).
  _resolveCombine() {
    this.combineDirty = false;
    const want = this.P.combine;
    if (want === 'native') { this.combineMode = 'native'; return; }
    const set = new Set(this.mat.map((m) => `${m.f}|${m.r}`));
    if (want !== 'listener' && this.floorMat && set.size <= 1 && !this.listener) {
      const fd = fr(this.mat[0]?.f ?? GAME.friction), rd = fr(this.mat[0]?.r ?? GAME.restitution);
      const ff = fr(this.floorMat.f), rf = fr(this.floorMat.r);
      const fAvg = fr(fr(fd + ff) * 0.5), rAvg = fr(fr(rd + rf) * 0.5);
      if (fd > 0 && rf >= rd) {
        this.bi.SetFriction(this.floorBody.GetID(), fr(fr(fAvg * fAvg) / fd));
        this.bi.SetRestitution(this.floorBody.GetID(), rAvg);
        this.combineMode = 'material';
        this.combineFloor = { f: fr(fr(fAvg * fAvg) / fd), r: rAvg };
        return;
      }
    }
    if (!this.listener) {
      if (this.floorBody) { this.bi.SetFriction(this.floorBody.GetID(), this.floorMat.f); this.bi.SetRestitution(this.floorBody.GetID(), this.floorMat.r); }
      const cl = new J.ContactListenerJS();
      const avg = (b1, b2, settings) => {
        const B1 = J.wrapPointer(b1, J.Body), B2 = J.wrapPointer(b2, J.Body);
        const s = J.wrapPointer(settings, J.ContactSettings);
        s.mCombinedFriction = (B1.GetFriction() + B2.GetFriction()) * 0.5;
        s.mCombinedRestitution = (B1.GetRestitution() + B2.GetRestitution()) * 0.5;
      };
      cl.OnContactValidate = () => J.ValidateResult_AcceptAllContactsForThisBodyPair;
      cl.OnContactAdded = (b1, b2, _m, s) => avg(b1, b2, s);
      cl.OnContactPersisted = (b1, b2, _m, s) => avg(b1, b2, s);
      cl.OnContactRemoved = () => {};
      this.ps.SetContactListener(cl);
      this.listener = cl;
    }
    this.combineMode = 'listener';
  }

  step() {
    if (this.combineDirty) this._resolveCombine();
    this.jolt.Step(this.P.dt, this.P.substeps);
    this.stepCount++;
  }

  getPose(i) {
    const b = this.bodies[i];
    const t = b.GetPosition();
    const px = t.GetX(), py = t.GetY(), pz = t.GetZ();
    const q = b.GetRotation();
    return { p: { x: px, y: py, z: pz }, q: { x: q.GetX(), y: q.GetY(), z: q.GetZ(), w: q.GetW() } };
  }
  getVel(i) {
    const b = this.bodies[i];
    const v = b.GetLinearVelocity();
    const vx = v.GetX(), vy = v.GetY(), vz = v.GetZ();
    const w = b.GetAngularVelocity();
    return { v: { x: vx, y: vy, z: vz }, w: { x: w.GetX(), y: w.GetY(), z: w.GetZ() } };
  }
  mass(i) { return 1 / this.bodies[i].GetMotionProperties().GetInverseMass(); }

  setPose(i, p, q, wake = true) {
    this.trv.Set(p.x, p.y, p.z); this.tq.Set(q.x, q.y, q.z, q.w);
    this.bi.SetPositionAndRotation(this.ids[i], this.trv, this.tq, wake ? J.EActivation_Activate : J.EActivation_DontActivate);
  }
  setVel(i, v, w, wake = true) {
    this.tv.Set(v.x, v.y, v.z); this.tv2.Set(w.x, w.y, w.z);
    this.bi.SetLinearAndAngularVelocity(this.ids[i], this.tv, this.tv2);
    if (wake) this.bi.ActivateBody(this.ids[i]);
  }
  setGravityScale(i, s, wake = true) { this.bi.SetGravityFactor(this.ids[i], s); if (wake) this.bi.ActivateBody(this.ids[i]); }

  applyImpulseAtPoint(i, Jv, P) {
    this.tv.Set(Jv.x, Jv.y, Jv.z); this.trv.Set(P.x, P.y, P.z);
    this.bi.AddImpulse(this.ids[i], this.tv, this.trv); // BodyInterface 판은 잠든 몸체를 깨운다 (Rapier wakeUp=true 와 같음)
  }
  applyImpulse(i, Jv) { this.tv.Set(Jv.x, Jv.y, Jv.z); this.bi.AddImpulse(this.ids[i], this.tv); }
  applyTorqueImpulse(i, T) { this.tv.Set(T.x, T.y, T.z); this.bi.AddAngularImpulse(this.ids[i], this.tv); }

  // dir 단위 벡터, max 길이. Jolt 광선은 '방향 × 길이' 를 받고 비율(0~1)을 돌려준다 → toi = 비율 × max
  castRay(from, dir, max, opts = {}) {
    this.rayRV.Set(from.x, from.y, from.z);
    this.rayV.Set(fr(dir.x * max), fr(dir.y * max), fr(dir.z * max));
    this.ray.mOrigin = this.rayRV;
    this.ray.mDirection = this.rayV;
    this.rayCollector.Reset();
    const ex = opts.exclude != null && opts.exclude >= 0 ? this.ignoreFilters[opts.exclude] : this.noBodyFilter;
    this.npq.CastRay(this.ray, this.raySettings, this.rayCollector, this.bpFilter, opts.discsOnly ? this.olDiscs : this.olAll, ex, this.shapeFilter);
    if (!this.rayCollector.HadHit()) return null;
    const hit = this.rayCollector.mHit;
    const key = hit.mBodyID.GetIndexAndSequenceNumber();
    return { i: this.index.has(key) ? this.index.get(key) : -1, toi: hit.mFraction * max };
  }

  isSleeping(i) { return !this.bodies[i].IsActive(); }
  wake(i) { this.bi.ActivateBody(this.ids[i]); }
  sleepingCount() { let s = 0; for (const b of this.bodies) if (!b.IsActive()) s++; return s; }

  hashState() {
    const H = new Hasher();
    for (const b of this.bodies) {
      const t = b.GetPosition(); H.f32(t.GetX()); H.f32(t.GetY()); H.f32(t.GetZ());
      const q = b.GetRotation(); H.f32(q.GetX()); H.f32(q.GetY()); H.f32(q.GetZ()); H.f32(q.GetW());
      const v = b.GetLinearVelocity(); H.f32(v.GetX()); H.f32(v.GetY()); H.f32(v.GetZ());
      const w = b.GetAngularVelocity(); H.f32(w.GetX()); H.f32(w.GetY()); H.f32(w.GetZ());
    }
    return H.hex();
  }

  info() {
    const s = this.ps.GetPhysicsSettings();
    const cr = [...this.shapeCache.values()].map((e) => e.cr);
    return {
      engine: 'jolt', version: 'Jolt v5.6.0 (JoltPhysics.js 1.1.0)', flavour: JOLT_META?.flavour,
      build: JOLT_META?.flavour === 'cpd' ? 'CROSS_PLATFORM_DETERMINISTIC 켠 자체 빌드(네이티브 CPD 와 비트 동일)' : `${JOLT_META?.spec} — npm 배포본, CPD 꺼짐(WASM 끼리만 같음)`,
      dt: this.P.dt, substeps: this.P.substeps, velocitySteps: s.mNumVelocitySteps, positionSteps: s.mNumPositionSteps, baumgarte: s.mBaumgarte,
      penetrationSlop: s.mPenetrationSlop, speculativeContactDistance: s.mSpeculativeContactDistance,
      maxPenetrationDistance: s.mMaxPenetrationDistance, linearCastThreshold: s.mLinearCastThreshold,
      manifoldTolerance: s.mManifoldTolerance, minVelocityForRestitution: s.mMinVelocityForRestitution,
      sleep: s.mAllowSleeping ? `point ${s.mPointVelocitySleepThreshold} u/s · 게임 시간 ${this.P.sleep.time} s (mTimeBeforeSleep ${s.mTimeBeforeSleep} × 하위 스텝 ${this.P.substeps})` : '끔',
      convexRadius: cr, combine: this.combineMode, combineFloor: this.combineFloor ?? null,
      maxAngularVelocity: this.P.jolt.maxAngularVelocity,
    };
  }

  destroy() {
    for (const id of this.ids) { this.bi.RemoveBody(id); this.bi.DestroyBody(id); }
    if (this.floorBody) { const id = this.floorBody.GetID(); this.bi.RemoveBody(id); this.bi.DestroyBody(id); }
    for (const f of this.ignoreFilters) J.destroy(f);
    for (const o of [this.tv, this.tv2, this.trv, this.tq, this.ray, this.rayRV, this.rayV, this.raySettings, this.rayCollector, this.bpFilter, this.olAll, this.olDiscs, this.noBodyFilter, this.shapeFilter]) J.destroy(o);
    for (const e of this.shapeCache.values()) J.destroy(e.ss);
    J.destroy(this.jolt);
    if (this.listener) J.destroy(this.listener);
    this.bodies = []; this.ids = [];
  }
}

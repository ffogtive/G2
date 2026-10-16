// index.mjs — 엔진 독립 물리 어댑터 (Rapier ↔ Jolt 비교용)
//
//   import { createWorld } from './adapters/index.mjs';
//   const w = await createWorld({ preset: 'jolt-fair' });    // 또는 { engine: 'rapier' | 'jolt', ...덮어쓰기 }. 안 준 값 = 게임 v1
//   w.addFloor();                                            // 책상 상자(윗면 y=0), 마찰 0.9
//   const i = w.addDisc({x,y,z}, {x,y,z,w}, 1.0, 0.055, { density, friction, restitution, linDamp, angDamp, ccd });
//   w.step();                                                // dt 1/120 한 스텝 (params.substeps 개 하위 스텝)
//   w.getPose(i) → { p:{x,y,z}, q:{x,y,z,w} } · w.getVel(i) → { v, w } · w.mass(i)
//   w.applyImpulseAtPoint(i, J, P) · w.applyImpulse(i, J) · w.applyTorqueImpulse(i, T)
//   w.castRay(from, dir(단위), max, { exclude: i, discsOnly: true }) → { i(책상 -1), toi } | null   (바람 가림용)
//   w.isSleeping(i) · w.wake(i) · w.sleepingCount()
//   w.setPose(i, p, q) · w.setVel(i, v, ω) · w.setGravityScale(i, s)          (다시 쌓기·책상 밖 처리용)
//   w.hashState() → 8자리 hex (딱지 순서 p·q·v·ω float32 비트, native/jolt-bench 와 같은 식)
//   w.info() → 실제로 들어간 설정 · w.destroy()
//
// 단위는 게임 단위(1 u = 25 mm, 중력 38 u/s², 화면 시간). 두 엔진 모두 같은 단위계에서 돈다.
// Jolt 빌드: params.joltBuild 또는 JOLT_FLAVOUR = 'wasm-compat'(npm, CPD 꺼짐) | 'cpd'(vendor/, 네이티브와 비트 동일). 한 프로세스에 한 빌드.
import { GAME } from './common.mjs';
import { loadRapier, RapierWorld } from './rapier.mjs';
import { loadJolt, JoltWorld } from './jolt.mjs';

// ── Rapier ↔ Jolt 설정 짝 (게임 v1 = Rapier JS 0.12 = rapier 0.18 '작은 스텝 PGS') ─────────────────
//   erp 0.2 (+ damping_ratio 1 ÷ 서브스텝 8) : 접촉을 스프링처럼 '무르게' 푸는 값. 낮을수록 물러서 더미가 눌린다(v1 30장 높이 = 명목 37%).
//     ↔ mBaumgarte : 위치 단계(mNumPositionSteps)마다 겹침의 몇 %를 고치나. Jolt 접촉은 속도 단계에서 단단하고(CFM 없음) 무름이 없다.
//       뜻이 같은 0.2 에서 출발 → 훑어서 0.4 (tune-jolt stage1~3).
//   allowedLinearError 0.001 ↔ mPenetrationSlop · predictionDistance 0.002 ↔ mSpeculativeContactDistance · (없음) ↔ mMaxPenetrationDistance
//     Jolt 기본(0.02·0.02·0.2)은 '미터·10 cm 물체'용이라 게임 단위로 줄인 값(0.002·0.01·0.05 = JOLT_SCALED)부터 쟀다.
//     결과(stage4): 하위 스텝 4 에선 더미 높이는 같고(0.989/0.977), 기본 쪽이 잠이 잘 들고 3~4배 싸다 → 'fair' 는 기본 길이 허용치를 쓴다.
//   numSolverIterations 8 + 마찰 4 ↔ mNumVelocitySteps · mNumPositionSteps (훑어서 10·4)
//   (한 스텝 길이) ↔ substeps: Jolt 는 1/120 한 스텝으로는 30장 더미를 못 세운다(높이 0.28~0.5, stage1) — 하위 스텝 4(1/480)에서 0.98~0.99.
//     Rapier 도 단단하게(erp 0.8) 세우려면 1/240 이 필요했다(core-sweep §7). 공정 비교 = 둘 다 하위 스텝을 손잡이로 둔다.
//   ccd ↔ EMotionQuality_LinearCast (mLinearCastThreshold 0.75·mLinearCastMaxPenetration 0.25 는 무차원 → 기본)
//   cylinder(h/2, r) ↔ CylinderShape(h/2, r, 볼록 반경 = min(0.05, h/2·0.5)). Jolt 는 테두리를 볼록 반경만큼 둥글린다(면 위치는 같음).
//     h/2 전부(둥근 테두리)와 결과 차이 작음(stage4) → Rapier 의 각진 원기둥에 가까운 절반을 둔다.
//   density 1 ↔ ConvexShapeSettings.mDensity = 1 (Jolt 기본 1000 이면 질량 1000배 → 같은 충격량에 1/1000 움직임)
//   감쇠: Rapier v·1/(1+c·dt) ↔ Jolt v·(1−c·dt) (dt 1/120, c 0.35 에서 차 1e-5 → 같은 값 넣음)
//   반발: Rapier = '새 접촉 첫 스텝'에만 ↔ Jolt = 다가오는 속도 > mMinVelocityForRestitution(기본 1 m/s → 0.5 u/s: 한 스텝 중력 속도 0.32 u/s 위)
//   결합: Rapier 평균 ↔ Jolt √(f1f2)·max(r1,r2) → combine 'average' 가 평균을 맞춘다(jolt.mjs _resolveCombine)
//   잠: Rapier 0.12 JS 는 문턱을 못 바꿈(|v|<0.4·|ω|<0.5 가 2 s) ↔ Jolt mPointVelocitySleepThreshold·mTimeBeforeSleep
//     주의(감사에서 찾음, 실측): Jolt 5.6 은 잠 타이머를 '마지막 하위 스텝'에서 한 번만, mStepDeltaTime(= dt/하위 스텝)만큼 올린다
//     (PhysicsSystem.cpp CheckSleepAndUpdateBounds). 그래서 mTimeBeforeSleep 0.5 를 하위 스텝 4 로 돌리면 실제로는 2 s 뒤에 잔다.
//     → 이 어댑터의 sleep.time 은 '게임 시간(초)'이고, Jolt 에는 time / 하위 스텝 수(sleep.joltTime)를 넣는다(audit/sleepchk.mjs 로 확인).
//     sleep.time 을 안 주면 Jolt 기본 mTimeBeforeSleep 0.5 를 그대로 넣는다 = 실제 0.5 s × 하위 스텝 수(jolt-fair 는 2 s, Rapier 와 같은 길이).
//     2026-10-16 저녁 이전 원자료의 '-rsleep' 줄은 time 2.0 이 그대로 들어가 실제 8 s 였다(cmp-A 에서 '-rsleep8s' 로 이름을 바꿈).
//   각속도 상한: Rapier 없음 ↔ Jolt mMaxAngularVelocity 기본 47 rad/s → 1000 (돌며 날아가는 딱지가 잘리지 않게)

// 게임 단위로 줄인 길이 허용치(처음 '공정' 후보. stage1~2 의 'scaled'). 나머지 값의 바탕
export const JOLT_SCALED = Object.freeze({
  baumgarte: 0.2,
  penetrationSlop: 0.002,
  speculativeContactDistance: 0.01,
  maxPenetrationDistance: 0.05,
  linearCastThreshold: 0.75,
  linearCastMaxPenetration: 0.25,
  manifoldTolerance: 1e-3,
  velocitySteps: 10,
  positionSteps: 2,
  minVelocityForRestitution: 0.5,
  bodyPairCacheMaxDeltaPosition: 0.001,
  contactPointPreserveLambdaMaxDist: 0.01,
  convexRadiusFrac: 0.5,
  convexRadiusMax: 0.05,
  useLargeIslandSplitter: true,
  maxAngularVelocity: 1000,
  maxLinearVelocity: 1000,
});

// Jolt 기본값 그대로(stage1~3 의 'default'). 볼록 반경은 두께를 넘을 수 없어 h/2 로 잘린다
export const JOLT_DEFAULTS = Object.freeze({
  ...JOLT_SCALED,
  penetrationSlop: 0.02, speculativeContactDistance: 0.02, maxPenetrationDistance: 0.2,
  minVelocityForRestitution: 1.0, bodyPairCacheMaxDeltaPosition: 0.001, contactPointPreserveLambdaMaxDist: 0.01,
  convexRadiusFrac: 1.0, convexRadiusMax: 0.05, maxAngularVelocity: 47.12389, maxLinearVelocity: 500,
});

// 훑어서 고른 '공정' 값 (tune-jolt stage1~4, data/). 하위 스텝 4 와 같이 쓴다(PRESETS['jolt-fair'])
export const JOLT_FAIR = Object.freeze({
  ...JOLT_SCALED,
  baumgarte: 0.4,
  velocitySteps: 10,
  positionSteps: 4,
  penetrationSlop: 0.02,
  speculativeContactDistance: 0.02,
  maxPenetrationDistance: 0.2,
});

// 비교에 쓰는 이름 붙은 설정. createWorld({ preset, ...덮어쓰기 })
export const PRESETS = Object.freeze({
  'rapier-v1': { engine: 'rapier' },                                   // 지금 게임(erp 0.2, 1/120): 더미가 눌림(37%)·쏜 뒤 멈춤
  'rapier-thin': { engine: 'rapier', erp: 0.8, substeps: 2 },          // core-sweep §7 얇은 안(1/240): 서지만 쏜 뒤 안 멈춤
  'jolt-fair': { engine: 'jolt', substeps: 4, joltPreset: 'fair' },     // 훑어서 고른 Jolt (1/480 하위 스텝)
  'jolt-1x': { engine: 'jolt', substeps: 1, joltPreset: 'fair' },       // 같은 값, 하위 스텝 없이(1/120) — 더미 못 세움(비교용)
  // 잠 문턱을 Rapier 0.12 기본(|v|<0.4·|ω|<0.5 를 2 s)에 맞춘 것. Jolt 는 '상자 꼭짓점 속도' 기준이라 0.4 u/s·2 s(게임 시간)가 가장 가까운 짝(약간 엄격)
  'jolt-fair-rsleep': { engine: 'jolt', substeps: 4, joltPreset: 'fair', sleep: { pointVelocity: 0.4, time: 2.0 } },
});

const JOLT_PRESETS = { fair: JOLT_FAIR, scaled: JOLT_SCALED, default: JOLT_DEFAULTS };

export function normalizeParams(input = {}) {
  const base = input.preset ? PRESETS[input.preset] : {};
  if (input.preset && !base) throw new Error(`알 수 없는 preset: ${input.preset}`);
  const params = { ...base, ...input, jolt: { ...(base.jolt ?? {}), ...(input.jolt ?? {}) }, sleep: { ...(base.sleep ?? {}), ...(input.sleep ?? {}) } };
  const engine = params.engine ?? 'rapier';
  const sleepIn = params.sleep;
  const substeps = params.substeps ?? 1;
  const jp = JOLT_PRESETS[params.joltPreset ?? 'fair'];
  if (!jp) throw new Error(`알 수 없는 joltPreset: ${params.joltPreset}`);
  return {
    engine,
    preset: input.preset ?? null,
    gravity: params.gravity ?? GAME.gravity,
    dt: params.dt ?? GAME.dt,
    iterations: params.iterations ?? GAME.iterations,
    frictionIterations: params.frictionIterations ?? GAME.frictionIterations,
    erp: params.erp ?? GAME.erp,
    substeps, // 한 step() = dt 를 substeps 개 하위 스텝으로 (Rapier: ip.dt = dt/k 를 k 번, Jolt: Step(dt, k))
    ccd: params.ccd ?? GAME.ccd,
    combine: params.combine ?? 'average', // 'average'(게임 의미, Jolt 는 자동: 재질 맞춤 또는 콜백) | 'listener'(Jolt 강제 콜백) | 'native'(각 엔진 기본)
    sleep: {
      enabled: sleepIn.enabled ?? true, // Rapier 게임 기본 = 잠 켜짐(setCanSleep 안 부름)
      pointVelocity: sleepIn.pointVelocity ?? 0.03, // Jolt 전용
      // Jolt 전용. time = 게임 시간(초). joltTime = Jolt mTimeBeforeSleep 에 실제로 넣는 값(= time / 하위 스텝, 위 '잠' 주석)
      time: sleepIn.time ?? 0.5 * substeps,
      joltTime: sleepIn.time != null ? sleepIn.time / substeps : 0.5,
    },
    rapier: { ...(params.rapier ?? {}) },
    jolt: { ...jp, ...params.jolt },
    joltBuild: params.joltBuild,
  };
}

export async function createWorld(params = {}) {
  const P = normalizeParams(params);
  if (P.engine === 'rapier') { await loadRapier(); return new RapierWorld(P); }
  if (P.engine === 'jolt') { await loadJolt(P.joltBuild); return new JoltWorld(P); }
  throw new Error(`알 수 없는 엔진: ${P.engine}`);
}

// 시나리오(common.mjs makePile)를 월드에 넣기
export function addPileTo(w, pile, { radius = GAME.discR, props = {} } = {}) {
  const hh = pile.h / 2;
  for (const d of pile.discs) {
    w.addDisc({ x: d.p[0], y: d.p[1], z: d.p[2] }, { x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] }, radius, hh, props);
  }
}

export { GAME };

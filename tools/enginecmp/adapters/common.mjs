// common.mjs — 엔진 공통: 게임 기본값(sim.js TUNE 의 물리 부분), 해시, 난수, 쿼터니언, 더미 시나리오.
// 렌더러·엔진 독립. 어댑터(rapier.mjs·jolt.mjs)와 네이티브 벤치(native/jolt-bench)가 같은 시나리오·같은 해시를 쓴다.

// 게임 v1 물리 기본값 (mockup/src/sim.js TUNE + Table 생성자에서 가져옴)
export const GAME = Object.freeze({
  gravity: 38,          // u/s² (1 u = 25 mm, 화면 시간 기준)
  dt: 1 / 120,
  iterations: 8,        // Rapier numSolverIterations (작은 스텝 PGS 의 서브스텝 수)
  frictionIterations: 4,// Rapier numAdditionalFrictionIterations
  erp: 0.2,             // Rapier erp (게임 값. Rapier JS 0.12 기본은 0.6)
  density: 1.0,
  friction: 0.75,       // 딱지
  restitution: 0.0,
  floorFriction: 0.9,   // 책상
  floorRestitution: 0.0,
  linDamp: 0.35,
  angDamp: 1.0,
  ccd: true,
  discR: 1.0,
  discH: 0.11,          // v1 두께. 종이 딱지 안 = 0.055 (절반)
  desk: { hx: 11, hy: 0.5, hz: 8 },
});

// ── 해시: 32비트 단어 열 → FNV-1a(바이트, 리틀엔디언) + murmur3 fmix. native/jolt-bench/bench.cpp 와 같은 식 ──
const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);
export function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export class Hasher {
  constructor() { this.h = 0x811c9dc5; }
  u32(w) {
    let h = this.h;
    for (let k = 0; k < 4; k++) { h ^= (w >>> (8 * k)) & 0xff; h = Math.imul(h, 0x01000193); }
    this.h = h;
  }
  f32(x) { F32[0] = x; this.u32(U32[0]); }
  hex() { return fmix32(this.h).toString(16).padStart(8, '0'); }
}
export const f32bits = (x) => { F32[0] = x; return U32[0]; };
export const bitsF32 = (u) => { U32[0] = u >>> 0; return F32[0]; };
export const fr = Math.fround;

// ── 난수 (sim.js mulberry32 / gauss 와 같음) ──
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
export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── 쿼터니언 ──
export function quatFromAxisAngle(ax, ay, az, ang) {
  const s = Math.sin(ang / 2);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) };
}
export function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
export function rotate(q, v) {
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

// ── 시나리오: sim.js addPile('column') 과 같은 rng 소비 순서로 더미를 만들고, 값은 float32 로 고정 ──
// (엔진·플랫폼이 달라도 '같은 비트의 시작 상태'를 받게: 어댑터는 이 f32 값을 그대로 넣고, 네이티브 벤치는 비트(hex)로 읽는다)
export function makePile({ n = 30, seed = 1, h = GAME.discH, gap = 0.004, spread = 0.07 } = {}) {
  const rng = mulberry32(seed);
  const discs = [];
  for (let i = 0; i < n; i++) {
    const x = gauss(rng) * spread, z = gauss(rng) * spread;
    const y = h / 2 + i * (h + gap);
    let q = quatFromAxisAngle(1, 0, 0, Math.PI);
    q = quatMul(quatFromAxisAngle(0, 1, 0, rng() * Math.PI * 2), q);
    q = quatMul(quatFromAxisAngle(1, 0, 0, (rng() - 0.5) * 0.03), q);
    const L = Math.hypot(q.x, q.y, q.z, q.w);
    discs.push({ p: [fr(x), fr(y), fr(z)], q: [fr(q.x / L), fr(q.y / L), fr(q.z / L), fr(q.w / L)] });
  }
  return { n, seed, h, gap, spread, discs };
}

// 네이티브 벤치 입력 텍스트: 첫 줄 n, 그 뒤 한 줄에 7개 float32 비트(hex) = px py pz qx qy qz qw
export function pileToText(pile) {
  const lines = [String(pile.discs.length)];
  for (const d of pile.discs) lines.push([...d.p, ...d.q].map((v) => f32bits(v).toString(16).padStart(8, '0')).join(' '));
  return lines.join('\n') + '\n';
}

// ── 공통 '샷'(합성 바람): 엔진 독립 결정적 입력. 각 엔진은 자기 상태에서 같은 식으로 힘 점·가림을 계산한다 ──
// shot = { start, steps, lo, hi, lift, push, mouth:[x,y,z], shield }
//   start 스텝부터 steps 스텝 동안, 인덱스 lo..hi 딱지의 +z 테두리 점 P = c + (0,0,R) 에 J = (0, lift, −push) 를 준다.
//   입(mouth) → P 광선이 다른 딱지에 먼저 맞으면(끝 0.08 덜, 자기·책상 제외) J × shield.
// 값은 전부 float32 로 맞춰 둔다(네이티브와 같은 비트 입력).
export function defaultShot(pile, o = {}) {
  const n = pile.discs.length;
  const top = pile.discs[n - 1].p[1];
  return {
    start: o.start ?? 360,
    steps: o.steps ?? 16,
    lo: o.lo ?? Math.max(0, Math.floor(n * 0.4)),
    hi: o.hi ?? n - 1,
    lift: fr(o.lift ?? 0.2),   // Rapier v1 30장 시드 1 에서 ~11장 뒤집힘 (out/dbg8 보정)
    push: fr(o.push ?? 0.02),
    mouth: (o.mouth ?? [0, top * 0.6, 3.2]).map(fr),
    shield: fr(o.shield ?? 0.35),
  };
}

// 한 스텝 분의 샷 적용 (어댑터 공통 API 만 씀)
export function applyShotStep(w, shot, step) {
  if (step < shot.start || step >= shot.start + shot.steps) return 0;
  let shielded = 0;
  for (let i = shot.lo; i <= shot.hi; i++) {
    const { p } = w.getPose(i);
    const P = { x: fr(p.x), y: fr(p.y), z: fr(p.z + 1) };
    const M = { x: shot.mouth[0], y: shot.mouth[1], z: shot.mouth[2] };
    const dx = fr(P.x - M.x), dy = fr(P.y - M.y), dz = fr(P.z - M.z);
    const L = fr(Math.sqrt(fr(fr(fr(dx * dx) + fr(dy * dy)) + fr(dz * dz))));
    let k = 1;
    if (L > 0.08) {
      const dir = { x: fr(dx / L), y: fr(dy / L), z: fr(dz / L) };
      const hit = w.castRay(M, dir, fr(L - 0.08), { exclude: i, discsOnly: true });
      if (hit) { k = shot.shield; shielded++; }
    }
    w.applyImpulseAtPoint(i, { x: 0, y: fr(shot.lift * k), z: fr(-shot.push * k) }, P);
  }
  return shielded;
}

// sim.js maxSpeed 와 같은 '움직임' 척도: max(|v|, |ω|·0.5)
export function maxSpeed(w, n) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const { v, w: av } = w.getVel(i);
    m = Math.max(m, Math.hypot(v.x, v.y, v.z), Math.hypot(av.x, av.y, av.z) * 0.5);
  }
  return m;
}

// sim.js JUDGE (스텝 판정) — PvP 가 쓰는 '멈춤' 규칙
export const JUDGE = { minSteps: 72, lateSteps: 300, quietSteps: 24, maxSteps: 600, eps: 0.08, lateEps: 0.5 };

// sim.js step() 의 '책상 밖' 처리: y < -3 이면 멈춰 책상 밑(y −4)에 둔다. off = Set(인덱스)
export function handleOffDesk(w, n, off) {
  for (let i = 0; i < n; i++) {
    if (off.has(i)) continue;
    const { p, q } = w.getPose(i);
    if (p.y < -3) {
      off.add(i);
      w.setGravityScale(i, 0, false);
      w.setVel(i, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, false);
      w.setPose(i, { x: p.x, y: -4, z: p.z }, q, false);
    }
  }
}

// 판정(sim.js judgeResult): 원(r 3.2) 안에서 그림 면(+Y)이 위 = 뒤집힘, 원 밖·책상 밖 = 무효
export function judge(w, n, off, circleR = 3.2) {
  let flipped = 0, outs = 0;
  for (let i = 0; i < n; i++) {
    const { p, q } = w.getPose(i);
    const inC = !off.has(i) && Math.hypot(p.x, p.z) <= circleR;
    if (!inC) { outs++; continue; }
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY > 0.2) flipped++;
  }
  return { flipped, outs };
}

export function maxSpeedLive(w, n, off) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (off.has(i)) continue;
    const { v, w: av } = w.getVel(i);
    m = Math.max(m, Math.hypot(v.x, v.y, v.z), Math.hypot(av.x, av.y, av.z) * 0.5);
  }
  return m;
}

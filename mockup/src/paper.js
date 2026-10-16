// paper.js — 딱지의 '보이는' 종이 몸 (두꺼운 도화지). 물리와 무관: 읽기만 하고 몸체·월드·해시에는 손대지 않는다.
//
// 🧭 가설 (재윤님 여러 차례: "딱지가 두껍다 — 두꺼운 플라스틱 같다, 두꺼운 도화지처럼 절반 두께·탄성 더"):
//   플라스틱으로 읽히는 건 (1) 두께 0.11 u(2.75 mm) (2) 반들한 재질 (3) 통짜 색 띠 옆면 (4) 떨어져도 안 휘는 몸 넷이다.
//   → 물리(sim.js DISC_H 0.11, 바람 손잡이·레벨 보정·PvP simVersion)는 그대로 두고, 그림만 절반(0.055 u ≈ 1.4 mm)으로 얇게,
//     무광 종이 재질 + 종이 단면 옆면 + 착지 때 짧게 휘청(가장자리 들썩·살짝 통) 으로 바꾼다. core-sweep §7 1번(웹은 보이는 두께만 얇게)의 구현.
//
// 왜 '그림만 얇게'가 그냥은 안 되나 (실측, settle 600):
//   v1 더미는 눌려 겹친다. 위쪽 몇 장은 중심 간격 0.08~0.10 u(거의 안 눌림), 아래쪽은 0.004~0.04 u, 바닥 몇 장은 책상 속(16장 1장 · 40장 3~4장).
//   얇은 원판을 물리 중심에 그리면 위쪽에 0.03~0.05 u 틈이 떠 보인다(장난감 동전이 공중에 뜬 모습).
//   1판(a1424e3): 윗장을 아랫장에 기대 '휘게' 그려 덮었다 → 검토에서 틀림(확인됨): 한 축 휨은 직각 쪽 테두리 높이를 못 바꿔서
//     테두리 전체로 재면 쐐기 틈이 남고(아랫장 휨이 오히려 0.09 u 까지 벌림), 조준 중엔 휨이 꺼졌다.
//   2판(지금): **보이는 몸을 받침에 닿게 옮기는 배치(rest)** — 판이 있으면 매 프레임(조준 중에도), 물리 자세가 그대로면 지난 배치 재사용:
//     1) 높이 순으로, 받침(아래 딱지 또는 책상)과의 '보이는 세로 틈'(두 판이 겹치는 발자국 안의 최소, 테두리 12점 + 중심 표본)만큼 내린다.
//        받침의 내림을 이어받는다(누적) → 보이는 꼭대기는 물리보다 0.07~0.18 u 낮다. 눌려 겹친 장은 그대로(겹친 부분은 안 보임)이되
//        장마다 옆면 SLIVER(0.008) 는 보이게(셀 수 있게), 책상 밑으로는 절대 안 감 → 물리상 책상 속에 묻힌 바닥 장도 위로 올라와 희귀도 옆면이 보인다.
//     2) 받침과 (물리) 기울기 차 6° 안이면 받침의 보이는 자세에 맞춰 나란히 눕힘(물리에서 ≤ 3°) → 쐐기 틈 없음. 쏜 뒤 부채꼴은 부채꼴 그대로.
//     3) 기대 누운 장은 첫 닿는 점을 축으로 기울여 두 번째 받침에도 닿게(≤ 15°), 위가 빈 장은 두 번째 받침 쪽으로 처지게(휨 모프 ≤ 0.06).
//     4) 마지막으로 책상 가까운 장은 테두리 36점으로 다시 재서 책상 밑이면 올림.
//     물리 조준·판정은 그대로라, 화면의 조준 표시(누른 곳·표적 고리·소매·금 띠·숨 물결)는 visY/physY 대응표로 보이는 딱지에 맞춘다(main.js).
//   휨(모프)은 이제 종이 느낌에만: 착지 휘청 + 혼자 누운 딱지의 '쓰던 딱지' 들림 + 3)의 처짐. 위에 딱지가 얹힌 장은 들림·통 없음.
//   게이트: node tools/papercheck.mjs (테두리 전체 틈 · 쏜 뒤 뜬 장 · 묻힘 · 대응표)
import * as THREE from 'three';
import { DISC_R, DISC_H } from './sim.js';
import { CARD_BY_ID, RARITY, drawFace, drawBack, drawEdge, drawTape, paperGrain } from './art.js';

export const VIS_H = 0.055; // 보이는 두께 = 물리(0.11)의 절반 ≈ 1.4 mm (도화지 두 겹 정도)
const SINK = 0.012; // 혼자 누운 딱지 중심 = 0.043(실측) → 물리 원판이 책상에 0.012 박힌다
export const VIS_OFF = DISC_H / 2 - SINK - VIS_H / 2; // 0.0155: 얇은 몸을 아래 면 쪽으로 이만큼 내려 혼자 누운 딱지가 책상에 딱 붙게
const VIS_K = VIS_H / DISC_H; // 대응표 바깥(맨 위 위 · 맨 아래 아래) 기울기: 물리 반 두께 ↔ 보이는 반 두께
export const BEND_MAX = 0.06; // 가장자리 휨 상한(u, 경계 구 여유)
const SLIVER = 0.008; // 눌린 더미에서 장마다 최소로 보이는 옆면 높이(아랫장과 겹침 ≤ VIS_H − SLIVER)
// 받침으로 칠 범위(물리 자세에서 잰 보이는 세로 틈, u): [이 안 = 다 내림, 이 밖 = 안 내림] 사이는 부드럽게.
// 물리가 닿아 있으면 딱지끼리 ≈ 0.055 − 박힘(기운 접촉은 조금 더), 책상 ≈ 0 (SINK 로 맞춤)
const C_DISC = [0.075, 0.15];
const C_TABLE = [0.02, 0.07];
const TAU_UP = 0.03, TAU_DOWN = 0.07; // 배치 높이 따라가기(초, 실제 시간): 뜰 땐 빠르게, 내려앉을 땐 종이처럼 천천히
const IDLE_CURL = [0.006, 0.016]; // 혼자 누운 딱지: 가장자리가 살짝 들린 '쓰던 딱지' 휨(장마다 다름)
const FLEX_T = 0.17; // 착지 휘청 길이(초, 게임 시계 = 슬로모 따라감)
const SMOOTH = 0.06; // 휨 목표를 따라가는 시간 상수(초)
const NK = 12; // 테두리 표본 수(세로 틈 재기)
const SAG_MAX = 0.06; // 두 번째 받침 쪽으로 처지는 휨 상한(u)
const PIVOT_MAX = 0.26; // 기대 누운 장 피벗 상한(rad ≈ 15°)
const ALIGN = [3, 6]; // 받침과 (물리) 기울기 차가 이 안(°)이면 받침과 나란히 눕혀 그림(3° 안 = 다, 6° 밖 = 물리 그대로) — 종이가 아랫장에 맞춰 눕는 모습, 쐐기 틈 없앰
const DEV_MAX = 3; // 눕힘으로 물리 자세에서 벗어나는 각 상한(°): 쏜 뒤 부채꼴로 기운 더미는 부채꼴 그대로(쐐기 틈 = 얇은 종이 더미의 실제 모습)

// 손으로 모은 더미(내 더미·홈 탑): i 번째 장의 중심 높이
export const pileY = (i) => VIS_H / 2 + i * (VIS_H + 0.002);

// ── 기하: 얇은 원판 + 휨 모프 3개(x², z², 2xz) — 위치와 법선 둘 다(빛이 휜 가장자리를 잡게) ──
// CylinderGeometry 와 같은 그룹 순서(옆 0 · 그림 면(+Y) 1 · 뒷면(−Y) 2)와 같은 UV(그림이 거울로 안 뒤집힘).
// 뚜껑을 고리 여러 겹으로 나눠 휨이 매끈하다(원기둥 뚜껑은 부채꼴 한 겹이라 휘면 피라미드가 됨).
// 모프 k 의 y 변화량: X2 = −(x/R)², Z2 = −(z/R)², XZ = −2xz/R² → 영향값 (b·cos²φ, b·sin²φ, b·sinφcosφ) = 방향 φ 로 가장자리 b 만큼 처짐
// 법선 모프: 면 y = y0 − b·f(x,z) 의 위 법선 ∝ (b·∂f/∂x, 1, b·∂f/∂z) → 위 뚜껑 +b·∇f, 아래 뚜껑 −b·∇f, 옆면 0(테두리 높이만 바뀜)
// 삼각형 48·3겹 = 576 (원기둥 56·1 = 224 의 2.6배; 1판 56·4겹 896 에서 줄임)
export function paperDiscGeometry(radial = 48, rings = 3) {
  const R = DISC_R, hh = VIS_H / 2;
  const pos = [], nor = [], uv = [], idx = [];
  const groups = [];
  let start = 0;
  // 옆면
  const side0 = pos.length / 3;
  for (let row = 0; row <= 1; row++) {
    const y = row === 0 ? hh : -hh;
    for (let x = 0; x <= radial; x++) {
      const u = x / radial, th = u * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
      pos.push(R * s, y, R * c); nor.push(s, 0, c); uv.push(u, row === 0 ? 1 : 0);
    }
  }
  for (let x = 0; x < radial; x++) {
    const a = side0 + x, b = side0 + radial + 1 + x, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  groups.push([start, idx.length - start, 0]); start = idx.length;
  const capSign = new Array(pos.length / 3).fill(0); // 0 = 옆면, ±1 = 위/아래 뚜껑
  // 뚜껑: 위(+Y, 그림) · 아래(−Y, 뒷면)
  for (const sign of [1, -1]) {
    const base = pos.length / 3;
    pos.push(0, hh * sign, 0); nor.push(0, sign, 0); uv.push(0.5, 0.5); capSign.push(sign);
    for (let k = 1; k <= rings; k++) {
      const r = (R * k) / rings;
      for (let x = 0; x <= radial; x++) {
        const th = (x / radial) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
        pos.push(r * s, hh * sign, r * c); nor.push(0, sign, 0); capSign.push(sign);
        uv.push((c * r) / R * 0.5 + 0.5, (s * r) / R * 0.5 * sign + 0.5);
      }
    }
    const ring = (k, x) => base + 1 + (k - 1) * (radial + 1) + x;
    const tri = (a, b, c) => {
      // 감기 방향을 면 바깥(sign)으로 맞춘다
      const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny * sign >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    for (let x = 0; x < radial; x++) tri(base, ring(1, x), ring(1, x + 1));
    for (let k = 1; k < rings; k++) for (let x = 0; x < radial; x++) {
      tri(ring(k, x), ring(k + 1, x), ring(k + 1, x + 1));
      tri(ring(k, x), ring(k + 1, x + 1), ring(k, x + 1));
    }
    groups.push([start, idx.length - start, sign > 0 ? 1 : 2]); start = idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const [s, n, m] of groups) g.addGroup(s, n, m);
  const n = pos.length / 3;
  // f(x, z) 와 기울기 (x, z 는 R 로 나눈 값)
  const F = [
    [(x) => x * x, (x) => [2 * x, 0]],
    [(x, z) => z * z, (x, z) => [0, 2 * z]],
    [(x, z) => 2 * x * z, (x, z) => [2 * z, 2 * x]],
  ];
  const mkP = (f) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a[i * 3 + 1] = -f(pos[i * 3] / R, pos[i * 3 + 2] / R); return new THREE.Float32BufferAttribute(a, 3); };
  const mkN = (df) => {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = capSign[i];
      if (!s) continue;
      const [gx, gz] = df(pos[i * 3] / R, pos[i * 3 + 2] / R);
      a[i * 3] = (s * gx) / R; a[i * 3 + 2] = (s * gz) / R;
    }
    return new THREE.Float32BufferAttribute(a, 3);
  };
  g.morphAttributes.position = F.map(([f]) => mkP(f));
  g.morphAttributes.normal = F.map(([, df]) => mkN(df));
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  g.boundingSphere.radius += BEND_MAX;
  return g;
}

// 정적인 딱지(홈 탑·펼쳐 둔 딱지): 지역 방향 φ 로 가장자리 b 만큼(+ = 아래 면 쪽으로 처짐, − = 들림)
export function setBend(mesh, b, phi = 0) {
  const I = mesh.morphTargetInfluences;
  if (!I) return;
  const c = Math.cos(phi), s = Math.sin(phi);
  I[0] = b * c * c; I[1] = b * s * s; I[2] = b * s * c;
}

// ── 물리 몸 → 종이 그림 ──
const hash01 = (n) => { let h = Math.imul((n + 1) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const _n = new THREE.Vector3(), _ex = new THREE.Vector3(), _ez = new THREE.Vector3(), _t = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const COS = Float64Array.from({ length: NK }, (_, k) => Math.cos((k / NK) * Math.PI * 2));
const SIN = Float64Array.from({ length: NK }, (_, k) => Math.sin((k / NK) * Math.PI * 2));
const smooth01 = (x, [a, b]) => (x <= a ? 1 : x >= b ? 0 : 1 - ((x - a) / (b - a)) ** 2 * (3 - 2 * (x - a) / (b - a)));

// 한 장의 보이는 판(물리 자세, 내림 전): 아래 면·위 면 평면과 테두리 표본
function newRow() {
  return { it: null, u: null, px: 0, py: 0, pz: 0, n: [0, 1, 0], c: [0, 0, 0], ny: 1, steep: false, ylow: 0, yhigh: 0,
    qp: new THREE.Quaternion(), qv: new THREE.Quaternion(), bs: null, bt: false, sag: 0, sx: 0, sz: 0,
    lf: [0, -1, 0], lF: [0, 0, 0], uf: [0, 1, 0], uF: [0, 0, 0],
    lo: new Float64Array((2 * NK + 1) * 3), nlo: 0, up: new Float64Array((2 * NK + 1) * 3), nup: 0,
    rest: 0, cov: false, onTable: false };
}
// 평면(법선 f, 점 F) 위 (x, z) 의 높이 → 원판 안(반지름 R)이면 y, 아니면 NaN
function planeY(f, F, x, z) {
  const y = F[1] - (f[0] * (x - F[0]) + f[2] * (z - F[2])) / f[1];
  const dx = x - F[0], dy = y - F[1], dz = z - F[2];
  return dx * dx + dy * dy + dz * dz <= DISC_R * DISC_R * 1.0004 ? y : NaN;
}
// 윗장 a 를 그대로 내렸을 때 아랫장 b 에 처음 닿는 세로 거리(두 판이 겹치는 발자국 안의 최소 세로 틈). 발자국이 안 겹치면 Infinity.
// 처음 닿는 자리(윗장 a 위의 점, 내리기 전)를 GP 에 남긴다(기대 누운 장 피벗용)
const GP = [0, 0, 0];
function vgap(a, b) {
  let G = Infinity;
  if (!b.steep) for (let k = 0; k < a.nlo; k++) { const x = a.lo[k * 3], y = a.lo[k * 3 + 1], z = a.lo[k * 3 + 2]; const yb = planeY(b.uf, b.uF, x, z); if (yb === yb && y - yb < G) { G = y - yb; GP[0] = x; GP[1] = y; GP[2] = z; } }
  if (!a.steep) for (let k = 0; k < b.nup; k++) { const x = b.up[k * 3], y = b.up[k * 3 + 1], z = b.up[k * 3 + 2]; const ya = planeY(a.lf, a.lF, x, z); if (ya === ya && ya - y < G) { G = ya - y; GP[0] = x; GP[1] = ya; GP[2] = z; } }
  return G;
}
// 판 r 의 가장 낮은 표본점(책상에 처음 닿는 자리) → GP
function lowestPt(r) {
  let y = Infinity;
  for (let k = 0; k < r.nlo; k++) if (r.lo[k * 3 + 1] < y) { y = r.lo[k * 3 + 1]; GP[0] = r.lo[k * 3]; GP[1] = y; GP[2] = r.lo[k * 3 + 2]; }
}
function ringPts(out, o, C, e1, e2, withCenter) {
  let k = o;
  for (let i = 0; i < NK; i++) {
    const c = COS[i] * DISC_R, s = SIN[i] * DISC_R;
    out[k * 3] = C[0] + c * e1.x + s * e2.x; out[k * 3 + 1] = C[1] + c * e1.y + s * e2.y; out[k * 3 + 2] = C[2] + c * e1.z + s * e2.z; k++;
  }
  if (withCenter) { out[k * 3] = C[0]; out[k * 3 + 1] = C[1]; out[k * 3 + 2] = C[2]; k++; }
  return k;
}

export class PaperLook {
  constructor() {
    this.live = new Set(); // 종이 상태가 있는 메시(장면에서 빠지면 놓음)
    this.clock = 0; // 게임 시계(슬로모·히트스톱 따라감) — 착지 휘청용
    this.lastNow = null;
    this.rows = []; // 마지막 배치(판 위 딱지, 트윈 중 제외)
    this.nrows = 0;
    this.pool = [];
    this.mapC = null; this.mapP = []; this.mapV = []; this.mapStamp = -1; this.stamp = 0;
    this.sig = null; // 마지막 배치의 물리 자세 지문(같으면 다시 풀지 않음 — 조준 중·턴 사이 대부분의 프레임, 한 프레임 두 번 불러도 한 번만 풂)
  }

  stateOf(mesh, id) {
    let u = mesh.userData.paper;
    if (!u) {
      const r = hash01(id ?? mesh.id);
      u = mesh.userData.paper = { psi0: r * Math.PI * 2, curl: IDLE_CURL[0] + (IDLE_CURL[1] - IDLE_CURL[0]) * hash01((id ?? mesh.id) + 77), sgn: 1, phi: 0, tb: 0, flexAt: -9, flexA: 0,
        base: new THREE.Vector3(), rest: 0, dy: 0, seen: false, prevSeen: false, cov: false, hop: false, released: false, px: 0, py: 0, pz: 0, ny: 1 };
      this.live.add(mesh);
    }
    return u;
  }

  // 물리 자세 읽기 (row 재사용) — 보이는 중심 = 물리 중심에서 아래 면 쪽으로 VIS_OFF(누운 정도² 만큼, 선 딱지는 0 → 이음매 없이 연속)
  _row(i, it) {
    const r = this.pool[i] || (this.pool[i] = newRow());
    const p = it.body.translation(), q = it.body.rotation();
    r.qp.set(q.x, q.y, q.z, q.w);
    _n.set(0, 1, 0).applyQuaternion(r.qp);
    r.it = it; r.px = p.x; r.py = p.y; r.pz = p.z; r.ny = _n.y;
    const k = _n.y * VIS_OFF;
    r.c[0] = p.x - _n.x * k; r.c[1] = p.y - _n.y * k; r.c[2] = p.z - _n.z * k;
    this._geom(r, r.qp);
    return r;
  }
  // 보이는 판의 면·테두리 표본 (자세 q: 물리 또는 받침에 맞춘 자세)
  _geom(r, q) {
    r.qv.copy(q);
    _n.set(0, 1, 0).applyQuaternion(q);
    _ex.set(1, 0, 0).applyQuaternion(q);
    _ez.set(0, 0, 1).applyQuaternion(q);
    r.n[0] = _n.x; r.n[1] = _n.y; r.n[2] = _n.z;
    const hh = VIS_H / 2, ay = Math.abs(_n.y), rr = DISC_R * Math.sqrt(Math.max(0, 1 - _n.y * _n.y));
    r.ylow = r.c[1] - rr - hh * ay; r.yhigh = r.c[1] + rr + hh * ay;
    r.steep = ay < 0.25;
    const s = _n.y >= 0 ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      r.lf[j] = -s * r.n[j]; r.lF[j] = r.c[j] - s * hh * r.n[j];
      r.uf[j] = s * r.n[j]; r.uF[j] = r.c[j] + s * hh * r.n[j];
    }
    if (r.steep) { // 선 딱지: 낮은/높은 점은 두 테두리 위
      let m = ringPts(r.lo, 0, r.lF, _ex, _ez, false); r.nlo = ringPts(r.lo, m, r.uF, _ex, _ez, false);
      m = ringPts(r.up, 0, r.uF, _ex, _ez, false); r.nup = ringPts(r.up, m, r.lF, _ex, _ez, false);
    } else {
      r.nlo = ringPts(r.lo, 0, r.lF, _ex, _ez, true);
      r.nup = ringPts(r.up, 0, r.uF, _ex, _ez, true);
    }
  }

  // 높이 배치 한 번: 높이 순으로, 받침에 닿게 내린다(받침의 내림을 이어받음) · 눌린 장은 옆면 SLIVER 는 보이게 · 책상 밑 금지.
  // pivot: 받침이 둘 이상인데(예: 책상 + 내려간 더미에 기대 누운 장) 첫 받침에만 닿으면, 그 닿는 점을 축으로 무게중심 쪽으로 기울여 다음 받침에도 닿게(≤ 15°)
  _layout(rows, pivot = false) {
    const n = rows.length;
    const R2 = (2 * DISC_R + 0.02) ** 2;
    const cand = this.cand || (this.cand = []);
    for (let i = 0; i < n; i++) { rows[i].rest = 0; rows[i].cov = false; rows[i].onTable = false; rows[i].bs = null; rows[i].bt = false; rows[i].sag = 0; }
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      let nc = 0;
      const push = (s, G) => { const c = cand[nc] || (cand[nc] = { s: null, G: 0, v: 0, x: 0, y: 0, z: 0 }); c.s = s; c.G = G; c.v = (s ? s.rest : 0) - G; c.x = GP[0]; c.y = GP[1]; c.z = GP[2]; nc++; return c; };
      // 받침 후보: 책상 + 겹치는 아랫장들. 고르기 = 내렸을 때 처음 닿는 것 = 닿는 높이 오프셋 v(= 받침 내림 − 틈)가 가장 큰 것. 범위 가중은 고른 받침에만
      const Gt = r.ylow;
      if (Gt <= C_TABLE[1]) { lowestPt(r); push(null, Gt); }
      for (let j = i - 1; j >= 0; j--) {
        const s = rows[j];
        if (r.c[1] - s.c[1] > 1.3) break;
        const dx = r.c[0] - s.c[0], dz = r.c[2] - s.c[2];
        if (dx * dx + dz * dz > R2) continue;
        if (r.ylow - s.yhigh > C_DISC[1] || r.yhigh <= s.yhigh) continue;
        const G = vgap(r, s);
        if (!(G <= C_DISC[1]) || G < -(VIS_H + 0.03)) continue; // 안 겹침 · 멀리 떨어짐 · 거꾸로(엇갈림)
        push(s, G);
      }
      let b = null;
      for (let k = 0; k < nc; k++) if (!b || cand[k].v > b.v) b = cand[k];
      const best = b ? b.v : -Infinity, bs = b ? b.s : null, bG = b ? b.G : 0;
      // 떠 있으면 닿게 내림(멀수록 덜 — 날아오는/떠나는 장이 이어지게), 이미 박혀 있으면 그대로(겹친 부분은 안 보임)
      const t = !b || best >= 0 ? 0 : best * smooth01(bG, bs ? C_DISC : C_TABLE);
      let lo = -r.ylow; // 책상 밑으로는 절대 안 감(묻힌 바닥 장 → 책상 위로)
      if (bs) {
        if (bG <= C_DISC[0]) { bs.cov = true; r.bs = bs; }
        const par = Math.abs(r.n[0] * bs.n[0] + r.n[1] * bs.n[1] + r.n[2] * bs.n[2]) > 0.97;
        const dh = Math.hypot(r.c[0] - bs.c[0], r.c[2] - bs.c[2]);
        if (par && bG <= C_DISC[0] && dh < DISC_R) lo = Math.max(lo, bs.rest - bG - (VIS_H - SLIVER)); // 셀 수 있게: 아랫장보다 SLIVER 는 위
      } else if (b) {
        r.onTable = true;
        let other = false; // 다른 딱지에도 걸쳐 있으면(끝이 딱지 위) 책상과 나란히 눕히지 않음 — 걸친 모습 그대로
        for (let k = 0; k < nc; k++) if (cand[k].s && cand[k].G <= C_DISC[0]) other = true;
        r.bt = bG <= C_TABLE[0] && !other;
      }
      r.rest = Math.max(lo, t);
      if (!pivot || !b || nc < 2 || r.rest > Math.max(t, -r.ylow) + 1e-6 || Math.abs(r.n[1]) < 0.3) continue; // 조각(SLIVER)으로 들린 장은 그대로
      // 기대 누운 장만: 주받침(책상 = 위)과 나란하지 않음(6° 넘게 기움). 쌓인 더미의 장은 받침과 나란히 눕혀졌으니 건드리지 않음
      const pd = bs ? Math.abs(r.n[0] * bs.n[0] + r.n[1] * bs.n[1] + r.n[2] * bs.n[2]) : Math.abs(r.n[1]);
      if (pd > Math.cos((ALIGN[1] * Math.PI) / 180)) continue;
      // 피벗: 축 = 첫 닿는 점 A 를 지나는 수평선, 무게중심(중심) 쪽이 내려감. 두 번째 받침 중 가장 먼저 닿는 각
      const ax = b.x, az = b.z;
      let ux = r.c[0] - ax, uz = r.c[2] - az;
      const ul = Math.hypot(ux, uz);
      if (ul < 0.15) continue;
      ux /= ul; uz /= ul;
      let th = Infinity, hit = null;
      for (let k = 0; k < nc; k++) {
        const c = cand[k];
        if (c === b) continue;
        // 주받침 발자국 안의 점(더미에서 두 장 아래 장 등)은 주받침이 이미 채우고 있음 → 두 번째 받침이 아님
        if (bs && (c.x - bs.c[0]) ** 2 + (c.z - bs.c[2]) ** 2 < (0.95 * DISC_R) ** 2) continue;
        const gap = (best - c.v) * smooth01(c.G, c.s ? C_DISC : C_TABLE); // 내린 뒤 남은 틈
        if (gap < 0.008) continue;
        const proj = (c.x - ax) * ux + (c.z - az) * uz;
        if (proj < 0.15) continue;
        const a = Math.atan2(gap, proj);
        if (a < th) { th = a; hit = c; }
      }
      if (!hit) continue;
      // 책상은 늘 한계: u 쪽 가장 먼 테두리 점이 책상에 닿는 각보다 더 기울이지 않음
      { let fy = Infinity, fp = 0; for (let k = 0; k < r.nlo; k++) { const px = (r.lo[k * 3] - ax) * ux + (r.lo[k * 3 + 2] - az) * uz; if (px > 0.15) { const a2 = Math.atan2(r.lo[k * 3 + 1] + r.rest, px); if (a2 < fy) { fy = a2; fp = px; } } } if (fy < th) th = Math.max(0, fy); }
      th = Math.min(th, PIVOT_MAX);
      if (th < 1e-4) continue;
      if (hit.s) hit.s.cov = true;
      _qa.setFromAxisAngle(_t.set(uz, 0, -ux), th); // 축 = 위 × u → u 쪽이 내려감
      const ay = b.y;
      _n.set(r.c[0] - ax, r.c[1] - ay, r.c[2] - az).applyQuaternion(_qa);
      r.c[0] = ax + _n.x; r.c[1] = ay + _n.y; r.c[2] = az + _n.z;
      this._geom(r, _qc.copy(_qa).multiply(r.qv));
    }
  }

  // 처짐: 위에 아무것도 없는 장이 주받침 밖의 두 번째 받침(다른 무더기·더미 옆 장) 위에 떠 있으면 그쪽 가장자리가 종이처럼 처져 닿게(휨 모프, ≤ SAG_MAX).
  // 두 무더기에 걸친 장 · 기대 누운 장이 덜 내려간 쪽에 붙어 반대쪽이 뜨는 것(얇은 그림 + 받침마다 다른 내림)을 덮는다
  _sag(rows) {
    const n = rows.length, R2 = (2 * DISC_R + 0.02) ** 2;
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      if (r.cov || Math.abs(r.n[1]) < 0.5 || (!r.bs && !r.onTable)) continue;
      let best = 0, bx = 0, bz = 0;
      for (let j = i - 1; j >= 0; j--) {
        const s = rows[j];
        if (r.c[1] - s.c[1] > 1.3) break;
        if (s === r.bs) continue;
        const dx = r.c[0] - s.c[0], dz = r.c[2] - s.c[2];
        if (dx * dx + dz * dz > R2) continue;
        const G = vgap(r, s);
        if (!(G <= C_DISC[0] + 0.02)) continue;
        if (r.bs && (GP[0] - r.bs.c[0]) ** 2 + (GP[2] - r.bs.c[2]) ** 2 < (0.95 * DISC_R) ** 2) continue; // 주받침 위(그 장이 채움)
        const gap = G + r.rest - s.rest;
        if (gap > best) { best = gap; bx = GP[0]; bz = GP[2]; }
      }
      if (best < 0.006) continue;
      const d = Math.hypot(bx - r.c[0], bz - r.c[2]) / DISC_R; // 처질 자리까지(반지름 비)
      if (d < 0.5) continue;
      const sx = (bx - r.c[0]) / (d * DISC_R), sz = (bz - r.c[2]) / (d * DISC_R);
      let sag = Math.min(SAG_MAX, best / (d * d));
      for (let k = 0; k < r.nlo; k++) { // 처진 테두리가 책상을 뚫지 않게(처짐 = sag·(투영/R)², 앞뒤 둘 다)
        const pr = ((r.lo[k * 3] - r.c[0]) * sx + (r.lo[k * 3 + 2] - r.c[2]) * sz) / DISC_R;
        if (pr * pr > 0.1) sag = Math.min(sag, Math.max(0, r.lo[k * 3 + 1] + r.rest) / (pr * pr));
      }
      if (sag < 0.004) continue;
      r.sag = sag; r.sx = sx; r.sz = sz;
    }
  }

  // 마지막 책상 검사: 책상 가까운 장만 테두리 36점(처짐 포함)으로 다시 재서 책상 밑이면 올린다(표본 12점 사이·피벗 뒤 오차)
  _floor(rows) {
    for (const r of rows) {
      if (r.ylow + r.rest > 0.06) continue;
      _qc.copy(r.qv);
      let lo = Infinity;
      const hh = VIS_H / 2;
      for (let k = 0; k < 36; k++) {
        const th = (k / 36) * Math.PI * 2, x = Math.cos(th), z = Math.sin(th);
        for (const sy of [hh, -hh]) {
          _n.set(x * DISC_R, sy, z * DISC_R).applyQuaternion(_qc);
          let y = r.c[1] + _n.y;
          if (r.sag > 0) { const pr = (_n.x * r.sx + _n.z * r.sz) / DISC_R; y -= r.sag * pr * pr * Math.abs(r.n[1]); }
          if (y < lo) lo = y;
        }
      }
      if (lo + r.rest < 0) r.rest = -lo;
    }
  }

  // 배치: (1) 물리 자세로 받침을 찾고 (2) 받침과 거의 나란한 장(6° 안)은 받침의 보이는 자세에 맞춰 눕힌 뒤 (3) 그 자세로 높이를 다시 배치
  _solve(items) {
    const n = items.length;
    const rows = this.rows;
    rows.length = n;
    for (let i = 0; i < n; i++) rows[i] = this._row(i, items[i]);
    rows.sort((a, b) => a.c[1] - b.c[1]);
    this._layout(rows); // 1차: 물리 자세로 받침 찾기
    for (const r of rows) if (r.bs || r.bt) this._align(r, r.bs); // 받침과 거의 나란한 장 눕힘(높이 순 → 받침은 이미 맞춰짐)
    this._layout(rows, true); // 2차: 맞춘 자세로 높이 배치 + 기대 누운 장 피벗
    this._sag(rows);
    this._floor(rows);
    this.nrows = n;
    return rows;
  }

  // 받침 s(없으면 책상)와 물리 기울기 차가 ALIGN 안이면 받침의 (이미 맞춘) 보이는 법선에 맞춰 눕힌다(물리에서 DEV_MAX 까지만). 눕혔으면 true
  _align(r, s) {
    _n.set(0, 1, 0).applyQuaternion(r.qp);
    const sp = s ? _t.set(0, 1, 0).applyQuaternion(s.qp) : _t.set(0, 1, 0);
    const ang = Math.acos(Math.min(1, Math.abs(_n.dot(sp)))) * (180 / Math.PI);
    if (ang >= ALIGN[1]) return false;
    const w = ang <= ALIGN[0] ? 1 : 1 - (ang - ALIGN[0]) / (ALIGN[1] - ALIGN[0]);
    const tgt = s ? _t.set(s.n[0], s.n[1], s.n[2]) : _t.set(0, 1, 0);
    if (_n.dot(tgt) < 0) tgt.negate(); // 엎어진 장은 받침 법선의 반대쪽에 맞춤
    if (_n.dot(tgt) > 1 - 1e-12) return false;
    _qa.setFromUnitVectors(_n, tgt);
    const dev = Math.acos(Math.min(1, _n.dot(tgt))) * (180 / Math.PI); // 받침의 보이는 자세까지(연쇄로 쌓인 각)
    _qb.identity().slerp(_qa, Math.min(w, dev > 0 ? DEV_MAX / dev : 1));
    this._geom(r, _qc.copy(_qb).multiply(r.qp));
    return true;
  }


  // syncMeshes 안(판이 있으면 매 프레임): 자세는 물리 그대로, 높이는 배치(rest). items: [{ id, body, mesh }] — 트윈 중인 메시는 빼고 넘긴다.
  apply(items) {
    for (const it of items) this.stateOf(it.mesh, it.id);
    // 지문: 장 목록 + 물리 자세. 같으면 지난 배치를 그대로(물리가 쉬는 동안 비용 ≈ 0)
    let sig = items.length * 7.13;
    for (let i = 0; i < items.length; i++) { const it = items[i], p = it.body.translation(), q = it.body.rotation(); sig += (i + 1) * (it.id * 0.618 + p.x * 3.1 + p.y * 5.3 + p.z * 7.7 + q.x * 11.3 + q.y * 13.1 + q.z * 17.9 + q.w * 19.7); }
    const lm = this.lastMeshes || (this.lastMeshes = []);
    let same = this.sig === sig && this.nrows === items.length && lm.length === items.length;
    for (let i = 0; same && i < items.length; i++) same = lm[i] === items[i].mesh && lm[i].userData.paper.prevSeen; // 트윈에서 막 돌아온 장이 있으면 다시
    this.sig = sig; lm.length = items.length;
    for (let i = 0; i < items.length; i++) lm[i] = items[i].mesh;
    const rows = same ? this.rows : this._solve(items);
    for (const r of rows) {
      const u = r.it.mesh.userData.paper, m = r.it.mesh;
      m.quaternion.copy(r.qv); // 물리 자세(받침과 6° 안이면 받침에 맞춰 눕힌 자세)
      u.base.set(r.c[0], r.c[1], r.c[2]);
      u.rest = r.rest; u.cov = r.cov; u.released = false;
      u.px = r.px; u.py = r.py; u.pz = r.pz; u.ny = r.ny;
      if (!u.prevSeen && !u.seen) u.dy = r.rest; // 새로 나타났거나 트윈에서 막 돌아옴: 따라가지 말고 바로(트윈 끝 = 배치 자리)
      u.seen = true;
      u.sgn = Math.max(-1, Math.min(1, r.ny * 4)); // 휨은 늘 '책상 쪽' 면 기준
      // 휨: 두 번째 받침 쪽 처짐(_sag) · 혼자 책상에 누운 장(위에 아무것도 없음)만 살짝 들림. 더미 바닥 장·얹힌 장·선 장은 평평
      let wx = Math.cos(u.psi0), wz = Math.sin(u.psi0); // 세계 방향 ψ → 지역 각 φ
      if (r.sag > 0) { u.tb = r.sag; wx = r.sx; wz = r.sz; }
      else u.tb = r.onTable && !r.cov && Math.abs(r.ny) > 0.9 ? -u.curl : 0;
      _ex.set(1, 0, 0).applyQuaternion(m.quaternion); _ez.set(0, 0, 1).applyQuaternion(m.quaternion);
      u.phi = Math.atan2(wx * _ez.x + wz * _ez.z, wx * _ex.x + wz * _ex.z);
      m.position.set(u.base.x, u.base.y + u.dy, u.base.z);
    }
    this.mapStamp = -1;
  }

  // 트윈 목표: 이 자세로 놓였을 때의 보이는 자리·자세(배치 포함). 메시는 안 건드림. Map(id → { p: Vector3, q: Quaternion })
  restPositions(items) {
    const rows = this._solve(items);
    const out = new Map();
    for (const r of rows) out.set(r.it.id, { p: new THREE.Vector3(r.c[0], r.c[1] + r.rest, r.c[2]), q: r.qv.clone() });
    this.nrows = 0; this.rows.length = 0; this.sig = null; // 화면 배치(대응표)는 다음 apply 가 다시 만든다
    this.mapStamp = -1;
    return out;
  }

  // 판에서 빠진 장(모은 더미로 날아감 등): 휨을 펴고 더는 자리를 안 만진다
  release(mesh) {
    const u = mesh?.userData.paper;
    if (!u) return;
    u.released = true; u.tb = 0; u.seen = false; u.prevSeen = false; u.hop = false; u.flexAt = -9;
  }

  // 착지 '탁': 가장자리가 두 번 들썩(종이 탄성) + 아주 살짝 통(위에 얹힌 장이 없을 때만). k 0~1
  land(mesh, k = 1) {
    if (!mesh?.userData.paper) return;
    const u = mesh.userData.paper;
    if (this.clock - u.flexAt < FLEX_T * 0.5 && u.flexA >= k) return;
    u.flexAt = this.clock; u.flexA = Math.min(1, k);
  }

  // ── 조준 표시용 대응표: 물리 높이 ↔ 보이는 높이 (더미 기둥 = 중심 c 에서 0.6R 안의 누운 장, 화면에 그려진 높이 기준) ──
  _map(c) {
    if (this.mapStamp === this.stamp && this.mapC && this.mapC.x === c.x && this.mapC.z === c.z) return;
    const pts = [];
    for (let i = 0; i < this.nrows; i++) {
      const u = this.rows[i].it.mesh.userData.paper;
      if (!u || Math.abs(u.ny) < 0.9 || Math.hypot(u.px - c.x, u.pz - c.z) > 0.6 * DISC_R) continue;
      pts.push([u.py, u.base.y + u.dy]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    this.mapP = pts.map((p) => p[0]);
    this.mapV = [];
    for (let k = 0; k < pts.length; k++) this.mapV.push(k ? Math.max(pts[k][1], this.mapV[k - 1] + 1e-4) : pts[k][1]); // 단조
    this.mapC = { x: c.x, z: c.z }; this.mapStamp = this.stamp;
  }
  // 물리 높이 y(더미 중심 c 근처) → 화면에 보이는 높이. 딱지 중심은 그 딱지의 보이는 중심으로, 사이는 직선
  visY(y, c) {
    this._map(c);
    const P = this.mapP, V = this.mapV, n = P.length;
    if (!n) return y - VIS_OFF;
    if (y <= P[0]) return V[0] + (y - P[0]) * VIS_K;
    if (y >= P[n - 1]) return V[n - 1] + (y - P[n - 1]) * VIS_K;
    let k = 1;
    while (P[k] < y) k++;
    const t = P[k] > P[k - 1] ? (y - P[k - 1]) / (P[k] - P[k - 1]) : 1;
    return V[k - 1] + (V[k] - V[k - 1]) * t;
  }
  // 거꾸로: 보이는 높이 v → 물리 높이(누른 곳 → 조준 h)
  physY(v, c) {
    this._map(c);
    const P = this.mapP, V = this.mapV, n = P.length;
    if (!n) return v + VIS_OFF;
    if (v <= V[0]) return P[0] + (v - V[0]) / VIS_K;
    if (v >= V[n - 1]) return P[n - 1] + (v - V[n - 1]) / VIS_K;
    let k = 1;
    while (V[k] < v) k++;
    const t = (v - V[k - 1]) / (V[k] - V[k - 1]);
    return P[k - 1] + (P[k] - P[k - 1]) * t;
  }

  // 매 프레임(apply 다음): 배치 높이·휨을 부드럽게 따라가고 휘청을 얹는다. now = 프레임 시각(ms), gdt = 게임 초(슬로모·멈칫 따라감)
  tick(now, gdt) {
    const dt = this.lastNow == null ? 0 : Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.clock += gdt;
    this.stamp++;
    const a = 1 - Math.exp(-dt / SMOOTH), aUp = 1 - Math.exp(-dt / TAU_UP), aDn = 1 - Math.exp(-dt / TAU_DOWN);
    for (const m of this.live) {
      if (!m.parent || !m.morphTargetInfluences) { this.live.delete(m); continue; }
      const u = m.userData.paper;
      const seen = u.seen;
      u.prevSeen = seen; u.seen = false;
      if (u.released) u.tb = 0;
      const c = Math.cos(u.phi), s = Math.sin(u.phi), B = u.sgn * u.tb;
      const T0 = B * c * c, T1 = B * s * s, T2 = B * s * c;
      if (!u.I) u.I = [T0, T1, T2];
      else { u.I[0] += (T0 - u.I[0]) * a; u.I[1] += (T1 - u.I[1]) * a; u.I[2] += (T2 - u.I[2]) * a; }
      const t = this.clock - u.flexAt;
      let flex = 0, hop = 0;
      if (t >= 0 && t < FLEX_T && !u.released) {
        const A = u.flexA;
        flex = t < 0.09 ? -0.05 * A * Math.sin((Math.PI * t) / 0.09) : -0.017 * A * Math.sin((Math.PI * (t - 0.09)) / (FLEX_T - 0.09)); // − = 가장자리 들림
        if (!u.cov) hop = t < 0.08 ? 0.035 * A * Math.sin((Math.PI * t) / 0.08) : 0; // 위에 얹힌 장이 있으면 통 없이 휘청만(윗장을 파고들지 않게)
      }
      const F = u.sgn * flex, I = m.morphTargetInfluences;
      I[0] = u.I[0] + F * c * c; I[1] = u.I[1] + F * s * s; I[2] = u.I[2] + F * s * c;
      // 자리: 이번 프레임 배치를 받은 장만(트윈 중·판에서 빠진 장은 안 건드림)
      if (seen && !m.userData.anim) {
        const e = u.rest - u.dy;
        u.dy += e * (e > 0 ? aUp : aDn);
        m.position.set(u.base.x, u.base.y + u.dy + hop, u.base.z);
      }
    }
  }
}

// ── 텍스처·재질 (main.js 에서 옮김): 무광 종이 — 반들한 코팅(clearcoat)·금속광 없음 ──
// 그림 면 = 인쇄된 도화지(거칠기 0.86 + 섬유), 옆 = 종이 단면(크림 심지 + 희귀도 색 + 위아래 인쇄층, art.js drawEdge),
// 에픽·전설 = 홀로 인쇄(무지개 반사만 약하게, 코팅 광택 없음), 황금 = 금박 종이, 테이프 딱지 옆면만 테이프 광택.
const texCache = new Map();
let backTex, backTapeTex, grainTex;
const edgeTex = {};

function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const tx = new THREE.CanvasTexture(cv);
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

function faceTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const tx = canvasTex(512, 512, (g) => { drawFace(g, 512, CARD_BY_ID[id]); if (id !== 'golden') paperGrain(g, 512, 0.6); });
  texCache.set(id, tx);
  return tx;
}

export function initDiscTextures() {
  backTex = canvasTex(512, 512, (g) => drawBack(g, 512));
  backTapeTex = canvasTex(512, 512, (g) => { drawBack(g, 512); drawTape(g, 512); });
  for (const [rar, info] of [...Object.entries(RARITY), ['tape', { side: '#c9d3dc' }], ['golden', { side: '#ffcf33' }]]) {
    const tx = canvasTex(256, 32, (g) => drawEdge(g, 256, 32, info.side, rar));
    tx.wrapS = THREE.RepeatWrapping;
    tx.repeat.set(6, 1);
    edgeTex[rar] = tx;
  }
  // 종이 결(요철): 그림 면·뒷면에 아주 옅게 — 빛이 비스듬할 때만 보이는 도화지 결
  grainTex = canvasTex(256, 256, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); paperGrain(g, 256, 1.6); }, false);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.repeat.set(3, 3);
}

const discGeo = paperDiscGeometry();
const matCache = new Map();
function discMaterials(id, heavy = false) {
  const key = id + (heavy ? ':h' : '');
  if (matCache.has(key)) return matCache.get(key);
  const c = CARD_BY_ID[id];
  const paper = { bumpMap: grainTex, bumpScale: 0.35 };
  let mats;
  if (id === 'golden') {
    // 황금 딱지: 금박 종이 — 옆면이 금빛이라 더미 속 위치가 보인다(어디를 노릴지). 금속광은 남기되 코팅 광택은 뺌
    mats = [
      new THREE.MeshStandardMaterial({ map: edgeTex.golden, color: 0xffd34d, roughness: 0.42, metalness: 0.7, emissive: 0x3a2500, envMapIntensity: 1.0 }),
      new THREE.MeshStandardMaterial({ map: faceTexture(id), roughness: 0.4, metalness: 0.45, envMapIntensity: 0.9 }),
      new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.85, color: 0xffe9a0, envMapIntensity: 0.3, ...paper }),
    ];
  } else {
    const fancy = c.rarity === 'epic' || c.rarity === 'legendary';
    const top = fancy
      ? new THREE.MeshPhysicalMaterial({ map: faceTexture(id), roughness: 0.62, metalness: 0.05, iridescence: 0.7, iridescenceIOR: 1.5, envMapIntensity: 0.45, ...paper })
      : new THREE.MeshStandardMaterial({ map: faceTexture(id), roughness: 0.86, metalness: 0, envMapIntensity: 0.18, ...paper });
    const side = heavy
      ? new THREE.MeshStandardMaterial({ map: edgeTex.tape, roughness: 0.35, metalness: 0.3, envMapIntensity: 0.8 })
      : new THREE.MeshStandardMaterial({ map: edgeTex[c.rarity], roughness: 0.95, metalness: 0, envMapIntensity: 0.12 });
    const bottom = new THREE.MeshStandardMaterial({ map: heavy ? backTapeTex : backTex, roughness: 0.92, envMapIntensity: 0.15, ...paper });
    mats = [side, top, bottom];
  }
  matCache.set(key, mats);
  return mats;
}

export function makeDiscMesh(id, heavy = false) {
  const m = new THREE.Mesh(discGeo, discMaterials(id, heavy));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.cardId = id;
  return m;
}

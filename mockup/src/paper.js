// paper.js — 딱지의 '보이는' 종이 몸 (두꺼운 도화지). 물리와 무관: 읽기만 하고 몸체·월드·해시에는 손대지 않는다.
//
// 🧭 가설 (재윤님 여러 차례: "딱지가 두껍다 — 두꺼운 플라스틱 같다, 두꺼운 도화지처럼 절반 두께·탄성 더"):
//   플라스틱으로 읽히는 건 (1) 두께 0.11 u(2.75 mm) (2) 반들한 재질 (3) 통짜 색 띠 옆면 (4) 떨어져도 안 휘는 몸 넷이다.
//   → 물리(sim.js DISC_H 0.11, 바람 손잡이·레벨 보정·PvP simVersion)는 그대로 두고, 그림만 절반(0.055 u ≈ 1.4 mm)으로 얇게,
//     무광 종이 재질 + 종이 단면 옆면 + 착지 때 짧게 휘청(가장자리 들썩·살짝 통) 으로 바꾼다. core-sweep §7 1번(웹은 보이는 두께만 얇게)의 구현.
//
// 왜 '그림만 얇게'가 그냥은 안 되나 (실측, 시드 1~4, settle 600):
//   v1 더미는 눌려 겹친다. 위쪽 몇 장은 중심 간격 0.08~0.10 u(거의 안 눌림), 아래쪽은 0.004~0.04 u(많이 눌림), 바닥 장은 책상 속(5장 이상).
//   얇은 원판을 물리 중심에 그리면 위쪽에 0.03~0.05 u 틈이 떠 보인다(장난감 동전이 공중에 뜬 모습).
//   → 딱지를 옮기지 않고(조준·단서·터치 높이가 물리 높이와 1:1 그대로) **아래 장에 기대 휘게(drape)** 그린다:
//      윗장의 휨 축을 아랫장의 휨 축과 직각으로 두면 윗장 가장자리가 아랫장의 안 휜 자리에 닿는다 → 틈 = 휨 양.
//      두꺼운 도화지 딱지가 실제로 살짝 휘어 포개진 모습이다. 아래쪽 눌린 장들은 겹쳐 그려져 원래처럼 꽉 찬 기둥.
import * as THREE from 'three';
import { DISC_R, DISC_H } from './sim.js';
import { CARD_BY_ID, RARITY, drawFace, drawBack, drawEdge, drawTape, paperGrain } from './art.js';

export const VIS_H = 0.055; // 보이는 두께 = 물리(0.11)의 절반 ≈ 1.4 mm (도화지 두 겹 정도)
const SINK = 0.012; // 혼자 누운 딱지 중심 = 0.043(실측) → 물리 원판이 책상에 0.012 박힌다
export const VIS_OFF = DISC_H / 2 - SINK - VIS_H / 2; // 0.0155: 얇은 몸을 아래 면 쪽으로 이만큼 내려 혼자 누운 딱지가 책상에 딱 붙게
export const BEND_MAX = 0.06; // 가장자리 휨 상한(u). 접촉 중 최대 틈 = DISC_H − VIS_H = 0.055
const DRAPE_PAD = 0.004; // 아랫장에 살짝 묻히게(머리카락 틈 방지)
const IDLE_CURL = [0.006, 0.016]; // 혼자 누운 딱지: 가장자리가 살짝 들린 '쓰던 딱지' 휨(장마다 다름)
const FLEX_T = 0.17; // 착지 휘청 길이(초, 게임 시계 = 슬로모 따라감)
const SMOOTH = 0.06; // 휨 목표를 따라가는 시간 상수(초)

// 손으로 모은 더미(내 더미·홈 탑): i 번째 장의 중심 높이
export const pileY = (i) => VIS_H / 2 + i * (VIS_H + 0.002);

// ── 기하: 얇은 원판 + 휨 모프 3개(x², z², 2xz) ──
// CylinderGeometry 와 같은 그룹 순서(옆 0 · 그림 면(+Y) 1 · 뒷면(−Y) 2)와 같은 UV(그림이 거울로 안 뒤집힘).
// 뚜껑을 고리 여러 겹으로 나눠 휨이 매끈하다(원기둥 뚜껑은 부채꼴 한 겹이라 휘면 피라미드가 됨).
// 모프 k 의 y 변화량: X2 = −(x/R)², Z2 = −(z/R)², XZ = −2xz/R² → 영향값 (b·cos²φ, b·sin²φ, b·sinφcosφ) = 방향 φ 로 가장자리 b 만큼 처짐
export function paperDiscGeometry(radial = 56, rings = 4) {
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
  // 뚜껑: 위(+Y, 그림) · 아래(−Y, 뒷면)
  for (const sign of [1, -1]) {
    const base = pos.length / 3;
    pos.push(0, hh * sign, 0); nor.push(0, sign, 0); uv.push(0.5, 0.5);
    for (let k = 1; k <= rings; k++) {
      const r = (R * k) / rings;
      for (let x = 0; x <= radial; x++) {
        const th = (x / radial) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
        pos.push(r * s, hh * sign, r * c); nor.push(0, sign, 0);
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
  const mk = (f) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a[i * 3 + 1] = -f(pos[i * 3] / R, pos[i * 3 + 2] / R); return new THREE.Float32BufferAttribute(a, 3); };
  g.morphAttributes.position = [mk((x) => x * x), mk((x, z) => z * z), mk((x, z) => 2 * x * z)];
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
const _q = new THREE.Quaternion(), _n = new THREE.Vector3(), _ex = new THREE.Vector3(), _ez = new THREE.Vector3();

export class PaperLook {
  constructor() {
    this.live = new Set(); // 휨을 갱신하는 메시(장면에서 빠지면 놓음)
    this.clock = 0; // 게임 시계(슬로모·히트스톱 따라감) — 착지 휘청용
    this.lastNow = null;
  }

  stateOf(mesh, id) {
    let u = mesh.userData.paper;
    if (!u) {
      const r = hash01(id ?? mesh.id);
      u = mesh.userData.paper = { psi0: r * Math.PI * 2, curl: IDLE_CURL[0] + (IDLE_CURL[1] - IDLE_CURL[0]) * hash01((id ?? mesh.id) + 77), psi: 0, sgn: 1, phi: 0, tb: 0, b: null, flexAt: -9, flexA: 0, base: new THREE.Vector3(), seen: false };
      this.live.add(mesh);
    }
    return u;
  }

  // syncMeshes 안: 위치·자세는 물리 그대로, 얇은 몸만 아래 면 쪽으로 VIS_OFF. 휨 목표(아랫장에 기대기)를 고른다.
  // items: [{ id, body, mesh }] — 애니메이션 중인 메시는 빼고 넘긴다.
  apply(items) {
    const rows = [];
    for (const it of items) {
      const p = it.body.translation(), q = it.body.rotation();
      _q.set(q.x, q.y, q.z, q.w);
      _n.set(0, 1, 0).applyQuaternion(_q);
      const u = this.stateOf(it.mesh, it.id);
      const k = _n.y * VIS_OFF; // 아래 면 쪽으로(누운 정도² 만큼 내려감, 선 딱지는 0 → 이음매 없이 연속)
      u.base.set(p.x - _n.x * k, p.y - _n.y * k, p.z - _n.z * k);
      it.mesh.position.copy(u.base);
      it.mesh.quaternion.copy(_q);
      _ex.set(1, 0, 0).applyQuaternion(_q);
      _ez.set(0, 0, 1).applyQuaternion(_q);
      u.sgn = Math.max(-1, Math.min(1, _n.y * 4)); // 처짐은 늘 '책상 쪽' 면으로
      u.seen = true;
      rows.push({ u, x: p.x, y: p.y, z: p.z, ny: _n.y, n: _n.clone(), ex: _ex.clone(), ez: _ez.clone() });
    }
    rows.sort((a, b) => a.y - b.y);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], u = r.u;
      let sup = null, gap = 0;
      if (Math.abs(r.ny) > 0.9) {
        for (let j = i - 1; j >= 0; j--) { // 바로 밑에서 받쳐 주는 장: 거의 나란하고(8° 안 — 엇갈려 기운 장에 휘면 면을 뚫는다) 발자국이 겹치고 접촉 거리 안
          const s = rows[j], dy = r.y - s.y;
          if (dy > DISC_H + 0.02) break;
          if (dy <= 0 || Math.abs(r.n.dot(s.n)) < 0.99) continue;
          if (Math.hypot(r.x - s.x, r.z - s.z) < 1.25 * DISC_R) { sup = s; gap = Math.abs((r.x - s.x) * r.n.x + (r.y - s.y) * r.n.y + (r.z - s.z) * r.n.z); break; }
        }
      }
      if (sup) { u.psi = sup.u.psi + Math.PI / 2; u.tb = Math.min(BEND_MAX, Math.max(0, gap - VIS_H + DRAPE_PAD)); } // 틈(면에 수직) − 보이는 두께 = 휨
      else { u.psi = u.psi0; u.tb = Math.abs(r.ny) > 0.9 ? -u.curl : 0; } // 받침 없음: 책상 위면 살짝 들린 휨, 공중·선 딱지는 평평
      // 세계 방향 ψ → 지역 각 φ
      const wx = Math.cos(u.psi), wz = Math.sin(u.psi);
      u.phi = Math.atan2(wx * r.ez.x + wz * r.ez.z, wx * r.ex.x + wz * r.ex.z);
    }
  }

  // 착지 '탁': 가장자리가 두 번 들썩(종이 탄성) + 아주 살짝 통. k 0~1
  land(mesh, k = 1) {
    if (!mesh?.userData.paper) return;
    const u = mesh.userData.paper;
    if (this.clock - u.flexAt < FLEX_T * 0.5 && u.flexA >= k) return;
    u.flexAt = this.clock; u.flexA = Math.min(1, k);
  }

  // 매 프레임: 휨(영향값 셋)을 부드럽게 따라가고 휘청을 얹는다. now = 프레임 시각(ms), gdt = 게임 초(슬로모·멈칫 따라감)
  tick(now, gdt) {
    const dt = this.lastNow == null ? 0 : Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.clock += gdt;
    const a = 1 - Math.exp(-dt / SMOOTH);
    for (const m of this.live) {
      if (!m.parent || !m.morphTargetInfluences) { this.live.delete(m); continue; }
      const u = m.userData.paper;
      if (!u.seen) u.tb = 0; // 물리에서 빠진 장(모은 더미로 날아감 등): 평평하게 펴진다
      u.seen = false;
      const c = Math.cos(u.phi), s = Math.sin(u.phi), B = u.sgn * u.tb;
      const T0 = B * c * c, T1 = B * s * s, T2 = B * s * c;
      if (!u.I) u.I = [T0, T1, T2];
      else { u.I[0] += (T0 - u.I[0]) * a; u.I[1] += (T1 - u.I[1]) * a; u.I[2] += (T2 - u.I[2]) * a; }
      const t = this.clock - u.flexAt;
      let flex = 0, hop = 0;
      if (t >= 0 && t < FLEX_T) {
        const A = u.flexA;
        flex = t < 0.09 ? -0.05 * A * Math.sin((Math.PI * t) / 0.09) : -0.017 * A * Math.sin((Math.PI * (t - 0.09)) / (FLEX_T - 0.09)); // − = 가장자리 들림
        hop = t < 0.08 ? 0.035 * A * Math.sin((Math.PI * t) / 0.08) : 0;
      }
      const F = u.sgn * flex, I = m.morphTargetInfluences;
      I[0] = u.I[0] + F * c * c; I[1] = u.I[1] + F * s * s; I[2] = u.I[2] + F * s * c;
      // 통: 착지 직후 80 ms 만 위치를 만진다(끝나면 물리 자리로 되돌림). 트윈 중인 메시는 안 건드림
      if (!m.userData.anim && (hop > 0 || u.hop)) { m.position.y = u.base.y + hop; u.hop = hop > 0; }
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

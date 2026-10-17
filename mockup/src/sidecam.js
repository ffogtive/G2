// sidecam.js — 문법 D ② '장면'(각도 박자를 실제 장면 옆 시점에서): 렌더러 독립 식. three.js 를 import 하지 않는다 → Node 에서 그대로 돈다.
//
// 🧭 가설(재윤님 '진행' 2026-10-17 · 시제품 화면 확인, 손 미검증): ② 부채꼴·숫자 창 대신 카메라가 옆으로 돌아 재윤님 머리(mockup/assets/head.glb)가
//   더미를 향해 고개를 들었다 내렸다 하면(= 각도 눈금) '언제 톡' 이 그림 없이 읽힌다. 바람 리본이 닿는 곳(볼 = 앞면 낮게 빨강 · 스트라이크 = 꼭대기 넘어 초록)과
//   더미 색 띠(영점 → 지금 닿는 높이)가 판정 칸을 대신한다. 숫자·호·눈금 글 없음.
//   재윤님 시제품 피드백 '얼굴 밑에 그림자가 없어서 어색하다' → 머리는 해 그림자를 책상에 드리우고(main.js 해 그림자 틀을 머리까지) + 턱 밑 접촉 그늘.
//
// 이 파일은 그림만 정한다(물리·판정·박자 값 무변화): 바람이 닿는 높이 = sweep.js poseAt 'c' 정직한 기하(SweepCtl 'zero' 의 yHit 과 같은 식),
//   보이는 머리 = 턱을 책상에 괸 채 입술이 그 높이를 겨누는 자세(입술 ↔ 더미 거리 = 물리 입) · 꼭대기 위는 고개 젖힘만 줄여 그림(over).
//   숨 동안은 물리 고개 각(ctl.state.alpha · yHit)을 그대로 받아 같은 자세 식으로 → 보이는 쓸기 = 물리 쓸기(볼 = 쓸기 없음, gdSwing).
import { GEO, poseAt, D2R } from './sweep.js';

export const SV = {
  // 옆 시점: 앞 시점(+z, 입 뒤)에서 −x 쪽으로 도는 각 az(90 = 정옆) · 내려다보는 각 el · 목표점까지 거리 · 시야각 ·
  //   목표점 = 더미 가운데에서 입 쪽(+z) tz · 높이 ty — three.js 투영으로 푼 구도(390×844: 더미 왼쪽 끝 = 화면 3 % · θ 10° 입술 = 84 % · 더미 가운데 높이 = 60 %,
  //   시제품 105° 의 더미 폭 약 120 px → 125° 약 150~160 px · 얼굴은 오른쪽 끝에 걸쳐 3/4 로 보임)
  cam: { az: 125, el: 16, dist: 18.9, fov: 40, tz: 1.92, ty: 1.7 },
  trans: 600,          // 앞 시점 ↔ 옆 시점 카메라 이동(ms)
  delay: 200,          // ② 눈금 출발 늦춤(ms) — 카메라가 다 돈 뒤에 바늘(고개)이 움직이기 시작(준비 400 ms 는 그대로 뒤에 붙음)
  punch: { ms: 220, k: 0.035 }, shakeMs: 160, // 톡 = 카메라가 3.5 % 다가갔다 돌아옴 + 짧은 흔들림
  head: { H: 5.5, margin: 0.03 }, // 머리 높이(정수리 → 턱, u — 딱지 지름 2 u = 5 cm 기준 약 14 cm) · 턱 ↔ 책상 여유
  over: 0.4,           // 꼭대기 위 겨눔 줄임: 보이는 고개는 꼭대기 위 (바람 높이 − 꼭대기) × 0.4 를 겨눈다(45° 에서 얼굴이 책상에 눕지 않게 — 리본이 꼭대기를 스쳐 넘어감)
  dip: 220,            // ③ 꾹 누르면 고개가 영점 자세로 내려가는 ms(놓는 순간 물리 숨은 영점 α0 에서 출발 → 보이는 = 물리)
  hand: { hold: 160, trans: 650, cap: 2600 }, // 숨: 쓸기가 끝나고 hold ms 뒤 trans ms 동안 앞(뒤로 물러난) 시점으로 · 발사 뒤 cap ms 가 지나면 무조건 넘김
};

// 머리 모델 좌표(mockup/assets/head.glb: +Y 위 · 얼굴 +Z · 머리 높이 1 · 원점 = 흉상 경계 상자 가운데) — 모델에서 잰 점
export const HEAD = {
  lip: [0.0105, -0.068, 0.5201],   // 오므린 입술 앞 가운데(숨 나가는 곳)
  chin: [0.009, -0.2855, 0.2634],  // 턱 끝
  eye: [-0.1917, 0.1259, 0.3207],  // 왼눈 흰자 가운데(옆 시점 카메라 쪽 눈)
  box: [[-0.652, -0.7154, -0.5176], [0.6525, 0.6981, 0.5196]],
  // 턱 아래 테두리(y, z): 턱 끝 → 아랫입술 아래 — 책상에 닿는 표본(목·셔츠는 책상 아래로 가려짐)
  under: [[-0.2861, 0.2589], [-0.2855, 0.2634], [-0.2831, 0.2824], [-0.2709, 0.3058], [-0.2763, 0.3243], [-0.2676, 0.3465], [-0.2616, 0.3675], [-0.2443, 0.3912], [-0.2393, 0.4139], [-0.1903, 0.4446], [-0.1715, 0.4651], [-0.1265, 0.4942], [-0.1025, 0.5196]],
};

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const easeIO = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// 정직한 바람 높이: 고개 각 aDeg(영점 α0 + θ, 또는 숨 동안 물리 α) → 입·제트 각·앞면에서 닿는 물리 높이(SweepCtl 'zero' 의 yHit 과 같은 식)
export function hitOf(aDeg, pc) {
  const zf = pc.z + 1, p = poseAt(aDeg * D2R, 'c', GEO, { x: pc.x, y: GEO.ym, z: zf + GEO.L });
  return { o: p.o, phi: p.phi, zf, y: p.o.y + Math.tan(p.phi) * (p.o.z - zf) };
}
// 보이는 겨눔 높이: 앞면 안(꼭대기 아래)은 정직한 높이 그대로 · 꼭대기 위는 고개 젖힘만 줄임(단조·연속)
export const aimOf = (hitV, vtop, over = SV.over) => (hitV <= vtop ? hitV : vtop + over * (hitV - vtop));

// 머리 모델 점 p(모델 좌표) → 세계: 얼굴이 −z(더미 쪽)를 보게 y 축 180° 돌린 뒤 x 축으로 phi(+ = 턱 듦) · 크기 H · 자리 pos
//   (three.js: quaternion = Rx(phi) · Ry(π), position = pos, scale = H 와 같은 변환)
export function headPt(p, phi, H, pos) {
  const c = Math.cos(phi), s = Math.sin(phi), y0 = p[1] * H, z0 = -p[2] * H;
  return { x: -p[0] * H + pos.x, y: y0 * c - z0 * s + pos.y, z: y0 * s + z0 * c + pos.z };
}
// 턱 괸 자세: 입술 z = 물리 입 z(입술 ↔ 더미 거리 = 물리) · 턱 아래 가장 낮은 점 = 책상 + margin · 입술 → (앞면, aimY) 를 겨누는 phi (고정점 반복)
//   → { phi, pos, lips, contact } (contact = 책상에 닿은 턱 점 — 접촉 그늘 자리)
export function headPose({ aimY, zf, ox, oz, H = SV.head.H, margin = SV.head.margin }) {
  let phi = 0, pos = { x: 0, y: 0, z: 0 }, lips = null, contact = null;
  for (let it = 0; it < 24; it++) {
    const L = headPt(HEAD.lip, phi, H, { x: 0, y: 0, z: 0 });
    let lo = Infinity, cz = 0;
    for (const [y, z] of HEAD.under) { const q = headPt([0, y, z], phi, H, { x: 0, y: 0, z: 0 }); if (q.y < lo) { lo = q.y; cz = q.z; } }
    pos = { x: ox - L.x, y: margin - lo, z: oz - L.z };
    lips = { x: ox, y: L.y + pos.y, z: oz };
    contact = { x: ox, y: margin, z: cz + pos.z };
    const nphi = Math.atan2(aimY - lips.y, lips.z - zf);
    if (Math.abs(nphi - phi) < 1e-9) { phi = nphi; break; }
    phi = nphi;
  }
  const L = headPt(HEAD.lip, phi, H, pos);
  return { phi, pos, lips: L, contact };
}
// 한 번에: 고개 각(°) → 정직한 바람 높이(물리) · 보이는 높이(V = 종이 대응) · 겨눔 · 머리 자세
//   vis = { V(물리 y → 보이는 y), vtop(보이는 꼭대기) } · yHit 을 주면(숨 동안 ctl.state.yHit · o) 그 값을 쓴다
export function sceneAt(aDeg, pc, vis, phys = null) {
  const h = phys ? { o: phys.o, zf: pc.z + 1, y: phys.yHit } : hitOf(aDeg, pc);
  const hitV = vis.V(h.y), aim = aimOf(hitV, vis.vtop);
  const hp = headPose({ aimY: aim, zf: h.zf, ox: pc.x, oz: h.o.z });
  return { hitP: h.y, hitV, aim, over: hitV > vis.vtop, zf: h.zf, o: h.o, ...hp };
}

// 바람 리본 길(점 n+1 개): 볼 = 입술 → 앞면 닿는 곳 곧은 줄 · 스트라이크(꼭대기 위) = 입술에서 얼굴 쪽으로 나가 꼭대기 앞 가장자리를 스치고 뒤로 넘어가는 굽은 줄(3차 베지어)
export function ribbonPts({ lips, aim, hitV, over, zf, vtop, zBack, x }, n = 28) {
  const P = [];
  if (!over) {
    for (let i = 0; i <= n; i++) { const t = i / n; P.push({ x, y: lips.y + (hitV - lips.y) * t, z: lips.z + (zf - lips.z) * t }); }
    return P;
  }
  const dz = lips.z - zf, k = 0.45;
  const p0 = lips, p1 = { x, y: lips.y + (aim - lips.y) * k, z: lips.z - dz * k }; // 얼굴이 보는 쪽으로 나감
  const p2 = { x, y: vtop + 0.16 + 0.25 * (aim - vtop), z: zf + 0.15 };         // 꼭대기 앞 가장자리 위(겨눔이 높을수록 조금 높게)
  const p3 = { x, y: vtop + 0.06, z: zBack };                                     // 더미 뒤로 넘어가 낮게
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    P.push({ x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y, z: a * p0.z + b * p1.z + c * p2.z + d * p3.z });
  }
  return P;
}

// ── 카메라 자세 = { T(목표점), az, el(라디안), r(거리), fov } — 앞 시점(게임 카메라)과 옆 시점을 이 꼴로 섞는다 ──
export function sidePose(pc, cam = SV.cam) {
  return { T: { x: pc.x, y: cam.ty, z: pc.z + cam.tz }, az: cam.az * D2R, el: cam.el * D2R, r: cam.dist, fov: cam.fov };
}
// 카메라(자리 pos · 보는 방향 단위 벡터 f · 시야각) → 자세: 목표점 = 자리에서 보는 쪽으로 ref(더미 가운데)까지 거리만큼
export function poseOfCam(pos, f, fov, ref) {
  const r = Math.hypot(pos.x - ref.x, pos.y - ref.y, pos.z - ref.z);
  const T = { x: pos.x + f.x * r, y: pos.y + f.y * r, z: pos.z + f.z * r };
  return { T, az: Math.atan2(f.x, -f.z), el: Math.asin(clamp(-f.y, -1, 1)), r, fov };
}
export function camOfPose(p) {
  const ce = Math.cos(p.el);
  return { pos: { x: p.T.x - Math.sin(p.az) * ce * p.r, y: p.T.y + Math.sin(p.el) * p.r, z: p.T.z + Math.cos(p.az) * ce * p.r }, target: p.T };
}
// 섞기 k(0 = a, 1 = b): 목표점·고도·시야각은 k, 거리는 kr · 방위는 ka(멀어질 땐 먼저 물러나며 돌게 — 앞 시점 카메라는 머리 속 자리라 빨리 빠져나와 돌아야 머리가 일찍 화면에 든다)
export function mixPose(a, b, k, kr = k, ka = k) {
  const L = (x, y, t) => x + (y - x) * t;
  return { T: { x: L(a.T.x, b.T.x, k), y: L(a.T.y, b.T.y, k), z: L(a.T.z, b.T.z, k) }, az: L(a.az, b.az, ka), el: L(a.el, b.el, k), r: L(a.r, b.r, kr), fov: L(a.fov, b.fov, k) };
}
// 옆 시점 무게 w(0 앞 → 1 옆)에서 거리 섞기 무게: 앞으로 빨리 물러남(1 − (1 − w)²) · 방위 섞기 무게: 조금 덜 앞당김(1 − (1 − w)^1.6)
export const wr = (w) => 1 - (1 - w) * (1 - w);
export const wa = (w) => 1 - Math.pow(1 - w, 1.6);

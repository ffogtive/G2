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
// 책상 크기(렌더러의 책상 상자와 같게). 돌풍에 책상 밖으로 날아간 딱지는 떨어져서 'off' → 다시 쌓기 때 회수
export const DESK_HX = 11, DESK_HZ = 8;

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
  // 돌풍(너무 센 숨, 재윤님 3차 피드백): 들어 올리기보다 '밀어 날려 버림' → 분필 원 밖이면 무효
  blastLift: 0.6, // blast=1 일 때 들어 올림 감소 비율
  blastPush: 15, // blast=1 일 때 가장자리 미는 힘 배수
  blastShove: 3, // blast=1 일 때 중심을 수평으로 미는 힘(미끄러져 날아감)
  circleR: 3.2, // 분필 원 반지름 (딱지 반지름 1 기준). 원 밖에 떨어진 딱지는 그림이 보여도 무효
  // 4차(재윤님: 좌우·상하로 닿을 곳을 고르고 거기에 맞춰 실제로 반응): 바람은 '제트 축이 실제로 닿는 테두리 지점'에 작용
  // (전에는 입에서 가장 가까운 테두리 → 옆으로 0.8 비켜 불어도 힘 받는 점이 12° 밖에 안 움직였음, tools/aimmap.mjs 로 확인)
  rimHit: 1, // 1 = 제트-테두리 교점, 0 = 옛 모델(비교용)
  sideLiftLoss: 0.5, // 비스듬히 맞을수록 가장자리 밑으로 덜 파고듦: 들기 × (1 − loss·(1 − cosθ))
  deflect: 0.6, // 곡면에 맞고 꺾인 바람이 미는 방향: 진행 방향과 '맞은 면 안쪽' 사이 (옆을 불면 반대쪽 대각선으로)
  spin: 8, // 옆을 스치는 바람이 테두리를 끌고 가는 회전(팽이처럼 돌며 넘어감)
  // 다시 쌓을 때 몇 장이 삐져나옴(실험, 기본 끔). 4차 교차 검토: '삐져나온 곳을 노리면 더 넘어간다'는 거울 짝 비교에서
  // 옆 삐져나옴 +1장(오차 2배 수준)뿐, 앞쪽 삐져나옴은 이득 없음 → 보상 없는 무작위만 늘어서 끔. 다시 켜려면 설계부터
  protrudeP: 0,
  // 마지막 한 장(재윤님 4차: '1장 남으면 죽어도 안 넘어감'): 책상에 혼자 납작하게 놓인 딱지는 테두리 밑 틈이 0 → 들기가 최소치뿐.
  // 바닥에 깔린 바람이 테두리 밑으로 파고드는 '바닥 쿠션'을 혼자 놓인 딱지에만 준다. 가장자리(옆)를 맞힐수록 크게.
  loneLift: 0, // 실험 결과 역효과(가설 수정: 1장은 힘이 모자란 게 아니라 너무 셈) → 끔
  protMin: 0.14,
  protMax: 0.26,
  // 7차 실험(재윤님: '밑에서 입을 퍼올려 불면 포물선으로 잘 넘어간다 / 지금은 입이 수평 고정이라 위·아래 공략이 안 통한다').
  // blow({ jetPitch }) = 제트의 위아래 기울기(라디안, + = 입이 조준점 아래에서 위로 퍼올림, − = 위에서 내리 붊).
  // 기울기는 지금 게임의 입(0.1 rad = 5.7° 내려봄 = pitch0)에서 잰다: tilt = jetPitch + pitch0, up/down = sin(tilt) 의 양/음 부분.
  // jetPitch 를 안 넘기면(지금 main.js·botlib 전부) up = down = 0, 퍼짐 계수 = 1 → 아래 항이 전부 ×1 / +0 → 기존과 비트 동일.
  // 수평 밀기는 원래부터 진행 방향(P.d.x, P.d.z)을 쓰므로 기울면 cos(pitch) 만큼 저절로 줄어든다(새 항 없음).
  // 튜닝·실측: tools/pitchmap.mjs (재윤님 숨 3단 0.7/0.9/1.1 × 층 × 기울기). 위험-보상 사다리: 위(안전·작게) ↔ 수평 ↔ 퍼올림(정확한 숨이면 크게·포물선, 세면 원 밖)
  pitch0: 0.1,
  tiltSpread: 1, // 비스듬한 제트는 원기둥 옆면에 세로로 길게 닿음(원뿔이 저절로 더 많은 층을 덮음) → 같은 숨이 퍼진 만큼 세기 × cos(tilt). 0 이면 공짜 이득(+30° 가운데 4.8→7.3장)
  scoopGap: 0.065, // 위로 부는 바람이 붙어 있는 테두리 밑에도 파고듦: 틈 += scoopGap·up·세기² (압력 ∝ 세기² → 약한 숨은 못 파고듦)
  scoopLift: 0, // 위로 향한 운동량이 테두리를 더 들기: 들기 × (1 + scoopLift·up). 실측: 0.25 만 줘도 약한 숨(0.7배)을 구해 줘서 숨 규칙이 무너짐 → 0, 위 운동량은 scoopRise 로
  scoopRise: 3, // 파고든 공기(틈 증가분만큼의 들기)가 밑면 전체를 받쳐 중심째 띄움 → 포물선
  scoopCarry: 0.6, // 그 띄움의 방향: 0 = 수직, 1 = 제트 방향. 0.6 ≈ 앞위 45° → '솟았다가 넘어감'
  scoopBlast: 10, // 퍼올리며 너무 세게(돌풍) 불면 띄움 × (1 + scoopBlast·blast) → 원 밖으로 날아감 (퍼올림의 대가)
  press: 0.5, // 위에서 내리 부는 바람이 누름: 들기 × (1 − press·down)
  pressBlast: 2.5, // 위에서 내리 불면 넘치는 숨이 더미·책상으로 빠짐: 돌풍 × (1 − pressBlast·down) (위 공략의 장점 = 숨이 넘쳐도 덜 날아감)
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
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(DESK_HX, 0.5, DESK_HZ).setFriction(0.9), ground);
    this.discs = []; // {id, body, collider, cardId, owner:null}
    this.puff = null;
    this.time = 0;
  }

  // 딱지 더미 만들기. mode 'column' = 손으로 가지런히 쌓은 원기둥(기본, 원작 룰), 'heap' = 흩어진 무더기
  // 원기둥에서 "어느 높이·어느 쪽을 맞히느냐"가 조준 실력 요소가 된다.
  // heavy: 무거운(테이프 감은) 딱지로 만들 인덱스 집합 — 밀도 ×3 (원작 '테이프 감기' 꼼수, 레벨 기믹)
  // 쌓을 때 한 장의 어긋남: 대부분 살짝(gauss), 가끔 확 삐져나옴(손으로 대충 쌓은 더미)
  stackOffset(spread = 0.07) {
    let x = gauss(this.rng) * spread, z = gauss(this.rng) * spread;
    if (this.rng() < this.T.protrudeP) {
      const a = this.rng() * Math.PI * 2, m = this.T.protMin + (this.T.protMax - this.T.protMin) * this.rng();
      x += Math.cos(a) * m; z += Math.sin(a) * m;
    }
    return { x, z };
  }

  addPile(cards, { mode = 'column', spread = 0.07, at = { x: 0, z: 0 }, heavy = new Set() } = {}) {
    const H = DISC_H;
    cards.forEach((cardId, i) => {
      const heap = mode === 'heap';
      const off = heap ? { x: gauss(this.rng) * 0.42, z: gauss(this.rng) * 0.42 } : this.stackOffset(spread);
      const x = at.x + off.x;
      const z = at.z + off.z;
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
      const off = this.stackOffset(0.07);
      return { d, p: { x: at.x + off.x, y: H / 2 + i * (H + 0.004), z: at.z + off.z }, q };
    });
  }

  applyRestack(targets) {
    for (const { d, p, q } of targets) {
      if (d.off) { d.off = false; d.body.setGravityScale(1, true); }
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
      if (d.off) continue;
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
  //         power: 0..1 (1 초과 = 오버파워), pitch: 아래로 내려 부는 각(라디안, 옛 인자 — 힘에는 안 씀)
  //         jetPitch: 7차 실험 인자. 위로 퍼올려 부는 각(라디안, + = 입이 조준점 아래, − = 위, 지금 게임 = −0.1).
  //                   넘기면 pitch 를 대신하고 기울기가 힘에 들어간다(TUNE 7차 항목). 안 넘기면 기존과 비트 동일
  //                   주의: 입은 축을 따라 dist 뒤에 둔다 → 낮은 층을 크게 퍼올리면 입 자리가 책상 밑(가상 축). 화면에 그릴 땐 따로 맞출 것
  blow({ aim, dir, power, dist = 2.6, pitch = 0.1, origin, blast = 0, jetPitch }) {
    const tilted = Number.isFinite(jetPitch);
    if (tilted) pitch = -jetPitch;
    const tilt = tilted ? this.T.pitch0 - pitch : 0; // 지금 입 각도 대비 위(+)/아래(−) 기울기
    const up = Math.max(0, Math.sin(tilt)), down = Math.max(0, -Math.sin(tilt));
    const spreadK = tilted ? 1 - this.T.tiltSpread * (1 - Math.cos(tilt)) : 1; // 비스듬히 퍼져 닿는 만큼 약해짐
    if (down > 0) blast *= Math.max(0, 1 - this.T.pressBlast * down); // 위에서 누르듯 불면 넘치는 숨이 빠짐
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len, dz = dir.z / len;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const d = { x: dx * cp, y: -sp, z: dz * cp };
    const o = origin ?? { x: aim.x - d.x * dist, y: aim.y - d.y * dist, z: aim.z - d.z * dist };
    this.puff = { o, d, power, t: 0, jit: new Map(), blast, up, down, spreadK };
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
      let e = { x: c.x + (vx / vl) * DISC_R, y: c.y + (vy / vl) * DISC_R, z: c.z + (vz / vl) * DISC_R };
      // 제트 축을 원판 평면에 투영해 테두리와 만나는 점(가까운 쪽) = 바람이 실제로 닿는 곳. 빗나가면 축에 가장 가까운 테두리
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
          const px = Ox - od * Dx, py = Oy - od * Dy, pz = Oz - od * Dz; // 중심에서 축까지 수선
          const b = Math.hypot(px, py, pz);
          let ex, ey, ez;
          if (b < DISC_R) { const tt = -od - Math.sqrt(DISC_R * DISC_R - b * b); ex = Ox + tt * Dx; ey = Oy + tt * Dy; ez = Oz + tt * Dz; }
          else { ex = (px / b) * DISC_R; ey = (py / b) * DISC_R; ez = (pz / b) * DISC_R; }
          e = { x: c.x + ex, y: c.y + ey, z: c.z + ez };
          sinT = Math.min(1, b / DISC_R);
          rh = { x: ex / DISC_R, y: ey / DISC_R, z: ez / DISC_R }; // 맞은 점의 바깥 방향
          // 어느 쪽을 스쳤나: (맞은 점 × 진행 방향)·법선 → 세로축 회전 방향
          side = Math.sign((ey * Dz - ez * Dy) * nrm.x + (ez * Dx - ex * Dz) * nrm.y + (ex * Dy - ey * Dx) * nrm.z) || 0;
        }
      }
      // 제트 축 기준 위치
      const rx = e.x - P.o.x, ry = e.y - P.o.y, rz = e.z - P.o.z;
      const a = rx * P.d.x + ry * P.d.y + rz * P.d.z;
      if (a <= 0.05) continue;
      const lx = rx - a * P.d.x, ly = ry - a * P.d.y, lz = rz - a * P.d.z;
      const lat = Math.hypot(lx, ly * 1.6, lz);
      const rj = T.jetR0 + a * T.jetSpread;
      const cone = Math.exp(-((lat / rj) ** 2));
      if (cone < 0.02) continue;
      let s = P.power * Math.exp(-a / T.jetFalloff) * cone * env * (P.jit.get(d.id) ?? 1) * P.spreadK;
      // 차폐: 입 → 가장자리 사이에 다른 딱지가 있으면 약해짐
      const ray = new RAPIER.Ray(P.o, { x: rx / Math.hypot(rx, ry, rz), y: ry / Math.hypot(rx, ry, rz), z: rz / Math.hypot(rx, ry, rz) });
      const hit = this.world.castRay(ray, Math.hypot(rx, ry, rz) - 0.08, true, undefined, undefined, d.collider, b);
      if (hit && hit.collider.parent()?.isDynamic()) s *= T.shield;
      // 가장자리 밑 틈: 공기가 들어갈 여지(오버행일수록 크게 뜸)
      const down = new RAPIER.Ray({ x: e.x, y: e.y - 0.01, z: e.z }, { x: 0, y: -1, z: 0 });
      const g = this.world.castRay(down, 2, true, undefined, undefined, d.collider, b);
      const gap = g ? g.toi : 2;
      // 퍼올림(7차): 아래에서 올라오는 바람은 붙어 있는 테두리 밑에도 파고든다(∝ 세기²). up = 0 이면 + 0 → 그대로
      const wedge = T.scoopGap * P.up * P.power * P.power;
      let liftF = Math.min(1.35, Math.max(T.minLift, (gap + wedge) / T.gapRef));
      const liftW = wedge > 0 ? liftF - Math.min(1.35, Math.max(T.minLift, gap / T.gapRef)) : 0; // 파고든 공기로 늘어난 들기
      if (T.loneLift && this.isLone(d, c, nrm)) liftF = Math.max(liftF, T.loneLift * (0.45 + 0.55 * sinT));
      const m = b.mass();
      const k = s * m * T.dt;
      // 파워 곡선: 들어 올림은 파워에 비례, 미는 힘은 파워^pushExp → 너무 세게 불면 '뒤집히기보다 밀려남'(스윗스팟 생성)
      const pw = P.power;
      const bl = P.blast || 0;
      const cosT = Math.sqrt(1 - sinT * sinT);
      // 기울기(7차): 위에서 내리 불면 눌림(press). 기울기 0 이면 ×1 → 그대로
      const liftB = T.lift * liftF * k * (1 - T.blastLift * Math.min(1, bl)) * (1 - T.sideLiftLoss * (1 - cosT)) * (1 - T.press * P.down);
      const liftK = liftB * (1 + T.scoopLift * P.up);
      // 퍼올림 띄움: 파고든 공기만큼 밑면 전체를 받쳐 중심째 앞위로 → 포물선. 돌풍이면 훨씬 세게(원 밖으로)
      const riseK = liftW > 0 ? (liftB / liftF) * liftW * T.scoopRise * (1 + T.scoopBlast * bl) : 0;
      const pushK = T.push * Math.pow(pw, T.pushExp) / Math.max(pw, 0.05) * k * (1 + T.blastPush * bl);
      // 미는 방향: 진행 방향 ↔ 맞은 면 안쪽(−rh) 사이. 정면이면 그대로, 옆을 맞으면 반대쪽 대각선으로 꺾임
      let fx = P.d.x, fz = P.d.z;
      if (rh && sinT > 0) {
        const w = T.deflect * sinT;
        fx = P.d.x * (1 - w) - rh.x * w; fz = P.d.z * (1 - w) - rh.z * w;
        const fl = Math.hypot(fx, fz) || 1; const dl = Math.hypot(P.d.x, P.d.z) || 1;
        fx *= dl / fl; fz *= dl / fl;
      }
      b.applyImpulseAtPoint({ x: fx * pushK, y: liftK, z: fz * pushK }, e, true);
      if (riseK > 0) {
        const cx = P.d.x * T.scoopCarry, cy = 1 - T.scoopCarry + P.d.y * T.scoopCarry, cz = P.d.z * T.scoopCarry;
        const cl = Math.hypot(cx, cy, cz) || 1;
        b.applyImpulse({ x: (riseK * cx) / cl, y: (riseK * cy) / cl, z: (riseK * cz) / cl }, true);
      }
      // 옆을 스치는 바람 → 테두리를 끌고 감 = 팽이 회전 (원판 법선 축)
      if (side && T.spin) { const tq = T.spin * sinT * side * k * DISC_R; b.applyTorqueImpulse({ x: nrm.x * tq, y: nrm.y * tq, z: nrm.z * tq }, true); }
      if (bl > 0) b.applyImpulse({ x: P.d.x * T.push * T.blastShove * bl * k, y: 0, z: P.d.z * T.push * T.blastShove * bl * k }, true);
      // 오버파워: 무작위 텀블(결과가 운에 맡겨짐)
      if (pw > T.sweet) {
        const ch = (pw - T.sweet) * T.tumble * k;
        b.applyTorqueImpulse({ x: gauss(this.rng) * ch, y: gauss(this.rng) * ch * 0.3, z: gauss(this.rng) * ch }, true);
      }
      hits.push({ id: d.id, s, gap, liftF, e, dir: { x: fx, y: P.d.y, z: fz } });
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
    // 책상 밖으로 떨어진 딱지: 책상 밑에 멈춰 둔다(off). 무효 처리되고 다음 '다시 쌓기'에서 회수
    for (const d of this.liveDiscs()) {
      if (d.off) continue;
      const p = d.body.translation();
      if (p.y < -3) {
        d.off = true;
        d.body.setGravityScale(0, false);
        d.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        d.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        d.body.setTranslation({ x: p.x, y: -4, z: p.z }, false);
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
    return { steps: i, flipped: this.liveDiscs().filter((d) => this.faceUp(d) > 0.2 && this.inCircle(d)) };
  }

  // 책상에 혼자 납작하게 놓였나: 바닥 높이 + 거의 수평 + 위·옆으로 겹친 딱지 없음
  isLone(d, c, nrm) {
    if (Math.abs(nrm.y) < 0.95 || c.y > DISC_H * 0.9) return false;
    for (const o of this.liveDiscs()) {
      if (o === d) continue;
      const p = o.body.translation();
      if (Math.hypot(p.x - c.x, p.z - c.z) < 2 * DISC_R && p.y > c.y - 0.02) return false;
    }
    return true;
  }

  // 분필 원 안인가 (원 밖에 떨어진 딱지는 그림이 보여도 무효 → 다시 쌓임)
  inCircle(d) {
    if (d.off) return false;
    const p = d.body.translation();
    return Math.hypot(p.x, p.z) <= this.T.circleR;
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

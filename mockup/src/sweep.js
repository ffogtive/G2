// sweep.js — 고개 쓸기(푸어억) 조작의 렌더러 독립 부분 (docs/design/core-sweep.md §2·§3·§4). three.js 를 import 하지 않는다 → Node 에서 그대로 돈다.
//
// 🧭 가설(미검증): '아래에서 위로 쓸기'에 필요한 식은 측정 도구에 이미 다 있다 — 게임에 없는 것은 이식뿐이다.
//   → 측정 식(tools/sweepmap.mjs breathOf·alphaOf·GEO·poseAt·makeProg, tools/sweepcheck.mjs hitC·alphaTop, tools/coresweep/gesture.mjs)을
//     글자 그대로 옮기고 node tools/sweepgame.mjs parity·ctl 로 비트 대조한다. 판가름 = 주입 훅 샷이 Node 측정과 비트까지 같고(sweepplay),
//     재윤님 손으로 30장 3번 중 1번 이상 부채꼴(손 게이트).
//
// 이 파일은 PvP 해시(turn.js·shotSimV) 밖이다: 솔로 '쓸기 연습판'만 쓴다. 고전 조작·고전 물리는 그대로(sim.js 고전 경로 비트 동일).
// 시간: 숨 시각 t·D 는 물리(화면) 초 = sim.js 스텝 시각(P.t). 엄지(Gesture)는 벽시계 ms(손 판정). 둘을 잇는 것은 SweepCtl 의 u(px)뿐이다.
//
// 🧭 가설 수정(2026-10-16, 재윤님 실기기 기록 + 화면 녹화): 문법 A('툭 열고 → 누른 채 기다렸다 → 쓸며 떼기, 떼면 숨 끝')는 자연스러운 한 획
//   (당김 → 빠른 휙 → 떼기)과 부딪힌다 — 40장 4숨 모두 푸 시작→떼기 4~108 ms · 0장. → 기본을 문법 B '놓고 쓸기'로 바꾼다(아래 GB 절, 측정 tools/sweepgb.mjs).
//   A 는 SweepCtl 'thumb' 그대로 남겨 ⚙ '누른 채 쓸기(옛)'로 비교한다.

export const D2R = Math.PI / 180;

// ───────────── tools/sweepmap.mjs 에서 그대로 (숨 봉투·고개 각·기하) ─────────────
// 숨 봉투 (시뮬 초 = 화면 초; v1 중력 38 → 실물보다 약 3.2배 느림)
export function breathOf(kind, D, off) {
  if (kind === 'puff') { const P = 0.131; return { dur: P, env: (t) => Math.sin(Math.min(1, t / P) * Math.PI) }; } // v1 퍽 그대로
  if (kind === 'pueok') {
    // 푸어억: 0.26 s 올라가 평평하게 유지, 끝 0.26 s 내려감 (v2 유량 상승·종료 0.26 s). 길이 D 고정 — 엄지와 무관
    const r = 0.26;
    return { dur: D, env: (t) => (t < r ? 0.5 * (1 - Math.cos((Math.PI * t) / r)) : t > D - r ? 0.5 * (1 - Math.cos((Math.PI * Math.max(0, D - t)) / r)) : 1) };
  }
  if (kind === 'tail' || kind === 'rel') {
    // '엄지 떼기 = 숨 끝' 문법: 놓는 순간(D)까지 숨이 차 있고(0.26 s 상승 뒤 1), 놓은 뒤 off 초 동안 잦아든다('억').
    // tail = rel(off 0.26) (깊이 우선안 B3). off 0.04 ≈ 떼자마자 끊김
    const r = 0.26, o = kind === 'tail' ? 0.26 : off ?? 0.26;
    const up = (t) => (t < r ? 0.5 * (1 - Math.cos((Math.PI * t) / r)) : 1);
    const vD = up(D);
    return { dur: D + o, env: (t) => (t <= D ? up(t) : vD * 0.5 * (1 + Math.cos((Math.PI * Math.min(o, t - D)) / o))) };
  }
  throw new Error('breath ' + kind);
}

// 고개 각 α(t): t0 까지 0, 그 뒤 속도 w(°/s) 로 A(°) 까지 오르고 거기서 멈춤
export function alphaOf({ A = 0, w = 30, t0 = 0 }) {
  const Ar = A * D2R, wr = w * D2R;
  return (t) => (A <= 0 || t <= t0 ? 0 : Math.min(Ar, wr * (t - t0)));
}

// 기본 기하: 입 높이 ym(0.5 u = 12.5 mm), 더미 앞면에서 수평 L(4 u = 10 cm), 목 축 = 입 + (0, PY 위, PZ 뒤)
export const GEO = { ym: 0.5, L: 4, PY: 1.6, PZ: 3.6, phi0: 0 };

// 입 위치·제트 각 (kin 'c' = 목 축 둘레로 젖힘 / 'a' = 각도만(입 고정) / 'b' = 높이만(제트 평행 이동, 닿는 점은 'a'와 같은 속도로 오름))
export function poseAt(a, kin, geo, M0) {
  const N = { x: M0.x, y: M0.y + geo.PY, z: M0.z + geo.PZ };
  if (kin === 'c') {
    const vy = M0.y - N.y, vz = M0.z - N.z, ca = Math.cos(a), sa = Math.sin(a);
    return { o: { x: N.x, y: N.y + vy * ca - vz * sa, z: N.z + vz * ca + vy * sa }, phi: geo.phi0 + a };
  }
  if (kin === 'a') return { o: M0, phi: geo.phi0 + a };
  if (kin === 'b') return { o: { x: M0.x, y: M0.y + geo.L * Math.tan(a), z: M0.z }, phi: geo.phi0 };
  throw new Error('kin ' + kin);
}

export function makeProg(table, { kin = 'c', sweep = {}, breath, geo = GEO }) {
  const c = table.pileCenter();
  const zf = c.z + 1; // 더미 앞면(입 쪽, +z)
  const M0 = { x: c.x, y: geo.ym, z: zf + geo.L };
  const al = alphaOf(sweep);
  return (t) => { const p = poseAt(al(t), kin, geo, M0); return { o: p.o, phi: p.phi, ux: 0, uz: -1, env: breath.env(t) }; };
}

// 실패 원인 — 측정 원본(sweepmap causeOf 그대로, 문턱 미검증). 대조 시험·측정 줄 재현용
export function causeOfRaw(r) {
  if (r.tTop >= 0 && r.ttAtTop < 25) return 'early'; // 바람 축이 꼭대기를 넘을 때 위 절반이 아직 25° 미만
  if (r.out >= 0.25 * r.n) return 'strong'; // 원 밖 ≥ 장수의 25%
  if (r.maxTT < 20) return 'weak'; // 위 절반 최대 기울기 < 20° (들썩만)
  if (r.maxTB >= 40 && r.endTB < 30) return 'sank'; // 아래 절반이 들렸다 주저앉음(반동 a)
  if (r.flip >= 0.5 * r.n) return 'good';
  return 'mixed';
}
// 연습판 표시용(고친 판, 스펙 §3·§8): 💨 셌어요는 '원 밖 ≥ 25% 이고 뒤집힘 < n/2' 일 때만 — 많이 넘기고 몇 장 날아간 좋은 숨을 '셌다'고 하지 않는다.
// 고친 줄은 이 한 줄뿐이다(sweepgame parity 가 나머지가 원본과 같은지 따로 본다). 레벨에는 cuecheck 검증 전까지 안 쓴다
export function causeOf(r) {
  if (r.tTop >= 0 && r.ttAtTop < 25) return 'early';
  if (r.out >= 0.25 * r.n && r.flip < 0.5 * r.n) return 'strong';
  if (r.maxTT < 20) return 'weak';
  if (r.maxTB >= 40 && r.endTB < 30) return 'sank';
  if (r.flip >= 0.5 * r.n) return 'good';
  return 'mixed';
}

// ───────────── tools/sweepcheck.mjs 에서 그대로 (바람 자국 높이·꼭대기 각) ─────────────
// 목 축 기하에서 고개 α° → 앞면 바람 자국 높이(u)
export const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
export const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };

// ───────────── 엄지 → 고개 (스펙 §3 thumb) ─────────────
export const SWEEP = {
  pxPerU: 150,      // 엄지 150 CSS px = 바람 자국 1 u(25 mm) — 2안 매핑(sweepmap geo)
  maxDeg: 24,       // 고개 상한(엄지 485 px)
  stepDeg: 1,       // 따라가기: 스텝(1/120 s)마다 최대 1° = 화면 120°/s
  minD: 0.131,      // 숨 최소(화면 초) = 퍽 길이
  capD: 1.0,        // 숨 상한(화면 초) — 떼지 않으면 저절로 떼기
  off: 0.04,        // 뗀 뒤 0.04 s 에 끊김(rel 0.04)
};
// 바람 자국 높이 h(u) → 고개 α°. 0~24° 에서 이분 50회 (h ≤ hitC(0) 이면 0, ≥ hitC(24) 이면 24)
export function hInv(h) {
  if (h <= hitC(0)) return 0;
  if (h >= hitC(SWEEP.maxDeg)) return SWEEP.maxDeg;
  let lo = 0, hi = SWEEP.maxDeg;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (hitC(m) > h) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
// 엄지 u(px, 최저점에서 올라간 원신호 높이) → 목표 고개 α°
export const alphaForU = (u) => hInv(GEO.ym + Math.max(0, u) / SWEEP.pxPerU);

// ───────────── tools/coresweep/gesture.mjs 에서 그대로 (한 엄지 인식기) ─────────────
// 시간 ms, 거리 CSS px. 게임 설정 = GCFG + { slowCancel: 40 }(문서 §4.1 제안 · gestnoise fix) + minBlowMs 0·capMs 끔(숨 길이는 SweepCtl 이 물리 초로 강제)
export const POUCH_FULL = 1.12, POUCH_DETENT = 0.08, POUCH_GAIN = 0.4, POWER_MAX = 1.25;
export function pouchPower(u) { u = Math.max(0, u); if (u <= POUCH_FULL) return u; if (u <= POUCH_FULL + POUCH_DETENT) return POUCH_FULL; return Math.min(POWER_MAX, POUCH_FULL + (u - POUCH_FULL - POUCH_DETENT) * POUCH_GAIN); }
export const GCFG = {
  pull: 0.42,      // 당김 1.0 = 화면 짧은 변 × 0.42 (지금 게임과 같음)
  upStart: 12,     // (평활) 12 px 위로 → '푸' 시작
  upWin: 300,      // 그 12 px 를 '최근' 300 ms 안에(굴러가는 창 = 40 px/s 바닥). 160 ms 는 느린 손 쓸기를 1.55% 놓침(gestnoise table)
  smoothMs: 100,   // 시작 판정용 이동 평균 창. 50 ms 면 아이 손떨림 '퍽 → 잘못 시작' 28%, 100 ms 면 0.25%
  upCum: 0,        // ② 누적 규칙(px). 0 = 끔
  upCumMs: 0,      //   그 높이에 이만큼 머물러야(ms)
  roll2: null,     // ③ 둘째 창 [px, ms]. null = 끔
  slowCancel: 0,   // ④ 떼기 규칙(px, 선택): '푸'가 안 열린 채 평활 엄지가 최저점보다 이만큼 위에서 떼면 퍽 대신 취소(+ '툭 밀어요' 안내). 0 = 끔
  minP: 0.06,      // 이보다 덜 당기고 떼면 취소(지금 게임과 같음)
  cancelFrac: 0.30,
  minBlowMs: 131,  // 숨은 한 번 나가면 퍽 길이만큼은 나간다(튕겨 떼기)
  capMs: 1600,     // 푸 상한(이 시제품 값. 문서 §4.1 은 화면 1.0 s)
};
export const GAME_GCFG = { slowCancel: 40, minBlowMs: 0, capMs: 1e9 };
// 문법 B 의 당김: 같은 인식기(세기·꽉·옆 빼기·덜 당김 취소)인데 '푸'를 열지 않고(upStart ∞ → 떼기 = up() 의 'puff' = 놓기) 느린 밀기 취소도 없다
//   (자연스러운 한 획은 놓기 전에 손가락이 위로 간다 — 그것을 취소로 보면 안 된다). 옆 빼기는 GestureB(아래, Gesture 뒤)
export const GB_GCFG = { ...GAME_GCFG, slowCancel: 0, upStart: Infinity };
export class Gesture {
  constructor(W, H, cfg = {}) { this.W = W; this.H = H; this.c = { ...GCFG, ...cfg }; this.reset(); }
  reset() { this.st = 'idle'; this.tr = []; this.sm = []; this.out = null; this.cumAt = null; this.why = null; this.relAt = null; }
  get minDim() { return Math.min(this.W, this.H); }
  // ZOH 신호의 [t − w, t] 시간 평균
  avgY(t) {
    const w = this.c.smoothMs, tr = this.tr; if (!w) return tr.at(-1)[2];
    let acc = 0, tEnd = t;
    for (let i = tr.length - 1; i >= 0; i--) {
      const t0 = Math.max(tr[i][0], t - w); if (tEnd > t0) acc += tr[i][2] * (tEnd - t0); tEnd = t0;
      if (tr[i][0] <= t - w) break;
    }
    const span = t - Math.max(tr[0][0], t - w); return span > 0 ? acc / span : tr.at(-1)[2];
  }
  // 최근 ms 안의 평활 최저점(화면 y 최대) − 지금 평활 y
  riseWithin(ms, t, ys) {
    let yOld = -1e9; for (let i = this.sm.length - 1; i >= 0 && t - this.sm[i][0] <= ms; i--) yOld = Math.max(yOld, this.sm[i][1]);
    return yOld - ys;
  }
  down(x, y, t) { this.reset(); this.st = 'inhale'; this.ax = x; this.ay = y; this.lowRaw = y; this.lowS = y; this.pMax = 0; this.tr.push([t, x, y]); this.sm.push([t, y]); }
  tick(t) { // 사건이 없어도 매 프레임 부른다(멈춰 있는 엄지도 판정)
    if (this.st === 'inhale') {
      const c = this.c;
      const ys = this.avgY(t); this.sm.push([t, ys]); if (this.sm.length > 400) this.sm.splice(0, 100);
      if (ys > this.lowS) this.lowS = ys;
      const x = this.tr.at(-1)[1]; this.sideOut = Math.abs(x - this.ax) > c.cancelFrac * this.W;
      const rise = this.lowS - ys;
      if (c.upCum > 0) { if (rise >= c.upCum) { if (this.cumAt == null) this.cumAt = t; } else this.cumAt = null; }
      if (!this.sideOut && this.pMax >= c.minP && rise >= c.upStart) {
        let why = null;
        if (this.riseWithin(c.upWin, t, ys) >= c.upStart) why = 'roll';
        else if (c.roll2 && rise >= c.roll2[0] && this.riseWithin(c.roll2[1], t, ys) >= c.roll2[0]) why = 'roll2';
        else if (c.upCum > 0 && this.cumAt != null && t - this.cumAt >= c.upCumMs) why = 'cum';
        if (why) { this.st = 'blow'; this.t0 = t; this.ys = this.lowRaw; this.p = this.pMax; this.why = why; return { ev: 'blowStart', p: this.p, why }; }
      }
      return { ev: 'inhale', p: this.pMax };
    }
    if (this.st === 'blow') {
      const u = Math.max(0, this.ys - this.tr.at(-1)[2]);
      if (t - this.t0 >= this.c.capMs) { this.st = 'done'; this.out = { kind: 'pueok', p: this.p, ms: this.c.capMs, u, cap: true, why: this.why }; return { ev: 'blowEnd', u, cap: true, endAt: t }; }
      if (this.relAt != null && t >= this.relAt) { this.st = 'done'; return { ev: 'blowEnd', u, endAt: t }; }
      return { ev: 'sweep', u, ms: t - this.t0 };
    }
    return null;
  }
  move(x, y, t) {
    if (this.st === 'idle' || this.st === 'done') return null;
    if (this.relAt != null) return this.tick(t); // 뗀 뒤(최소 숨 시간 동안)는 위치가 안 바뀜
    this.tr.push([t, x, y]);
    if (this.st === 'inhale' && y > this.lowRaw) { this.lowRaw = y; this.pMax = pouchPower((y - this.ay) / (this.minDim * this.c.pull)); }
    return this.tick(t);
  }
  up(x, y, t) {
    if (this.st === 'inhale') {
      this.tr.push([t, x, y]); this.st = 'done';
      if (this.sideOut || Math.abs(x - this.ax) > this.c.cancelFrac * this.W || this.pMax < this.c.minP) return (this.out = { kind: 'cancel', p: this.pMax });
      if (this.c.slowCancel > 0 && this.lowS - this.avgY(t) >= this.c.slowCancel) return (this.out = { kind: 'cancel', p: this.pMax, slow: true });
      return (this.out = { kind: 'puff', p: this.pMax });
    }
    if (this.st === 'blow') {
      const u = Math.max(0, this.ys - y); this.tr.push([t, x, y]);
      const ms = Math.max(this.c.minBlowMs, t - this.t0); this.relAt = this.t0 + ms;
      return (this.out = { kind: 'pueok', p: this.p, ms, u, flick: t - this.t0 < this.c.minBlowMs, why: this.why });
    }
    return this.out;
  }
}

// 문법 B 당김 인식기: Gesture(gesture.mjs 그대로)에 옆 빼기 판정만 바꾼다 — 옆 빼기는 '당기는 동안'의 x(엄지가 최저점보다 GB.rise px 넘게
//   오르기 전 마지막 x)로 본다. 같은 획의 위로 휙(엄지 호)에서 옆으로 흐른 것은 취소가 아니다(검토 2026-10-16: 휙 220 px 위 + 옆 120 px 이면
//   5판 모두 숨이 조용히 취소됨). 취소 반환에 side(옆 빼기) 표시 → 게임이 이유를 토스트로
export class GestureB extends Gesture {
  constructor(W, H, cfg = {}) { super(W, H, { ...GB_GCFG, ...cfg }); }
  down(x, y, t) { super.down(x, y, t); this.xPull = x; }
  move(x, y, t) {
    const r = super.move(x, y, t);
    if (this.st === 'inhale' && this.lowRaw - y < GB.rise) this.xPull = x;
    return r;
  }
  up(x, y, t) {
    if (this.st !== 'inhale') return super.up(x, y, t);
    if (this.lowRaw - y < GB.rise) this.xPull = x;
    this.tr.push([t, x, y]); this.st = 'done';
    const side = Math.abs(this.xPull - this.ax) > this.c.cancelFrac * this.W;
    if (side || this.pMax < this.c.minP) return (this.out = { kind: 'cancel', p: this.pMax, side });
    return (this.out = { kind: 'puff', p: this.pMax });
  }
}

// ───────────── 문법 B '놓고 쓸기' (기본 · 측정 tools/sweepgb.mjs, 원자료 tools/coresweep/data/gb/, 2026-10-16) ─────────────
// 🧭 가설(측정으로 대체로 확인됨, 손 게이트 미검증): B 의 실력은 '휙' 하는 때다 — 꼭대기는 더미 위 절반이 들썩인 직후(화면 0.3~0.35 s).
//   '위 절반 10° → 들리면 휙!' 단서 + 사람 반응(벽시계 0.2~0.44 s)이 격자 꼭대기의 94~98%(학습·보류 시드 같음).
// 문법: 당겼다 놓으면 '퍼—'가 저절로 D(q) 화면 초 나간다(입 바닥 α 0, 봉투 rel = 0.26 s 오름 → 평평 → 0.04 s 끊김 — plan 모드와 같은 봉투).
//   그동안 놓은 뒤 새로 누른 손가락이 위로 휙(최근 300 ms 안 최저점보다 12 px 위, 어느 속도든) → 고개가 목 축(poseAt 'c')을 따라 80°/s 로 24°까지
//   (손가락 궤적은 안 따라감 = 방아쇠). 두 번째 휙부터 무시. 떼기 전 같은 획의 위로 휙은 방아쇠가 아니다(놓자마자 휙 = 0.0~0.4장, sweepgb ⑤ 가설 수정).
//   숨 끝은 늘 저절로(두 번째 탭으로 일찍 끊기 없음 — D 0.6~1.0 에서 꼭대기가 평평해 이득 없음). 퍽 없음(30·40장 0장).
export const GB = {
  w: 80, A: 24,                // 쓸기 w 80 °/s(화면) · A 24° (sweepgb CHOSEN.sw[0] 'w80·A24': q 0.7~1.0 모든 칸에서 꼭대기가 최고값의 95~100%)
  dMin: 0.6, dMax: 1.0, qLo: 0.7, // D(q) = clamp(0.6 + (q − 0.7)·4/3, 0.6, 1.0) 화면 초 (q 0.7/0.85/1.0 → 0.6/0.8/1.0, sweepgb CHOSEN.dq)
  rise: 12, winMs: 300,        // 휙: 최근 300 ms 안의 가장 낮은 점(화면 y 최대)보다 12 px 위(문법 A '푸' 열림 문턱과 같은 크기 · 40 px/s 바닥). 평활 없음(때가 실력 → 지연을 안 더함)
  cueTT: 10,                   // 단서: 위 절반 평균 기울기 ≥ 10°(옆모습 창 값) → '들리면 휙!' (화면 0.16~0.19 s, 판 간 ±0.01 s)
};
// 숨 길이(화면 초, 소수 4자리 — 측정 DQ 0.6/0.8/1.0 과 비트로 같게)
export const gbD = (q) => +Math.min(GB.dMax, Math.max(GB.dMin, GB.dMin + ((q - GB.qLo) * 4) / 3)).toFixed(4);
// 원인 칩(sweepgb CHIP 과 같은 규칙): 휙 없음 안 쓸었어요 · 뒤집힘 ≥ 0.85 × 기준 꼭대기(30장 20 · 40장 25, 측정 격자 꼭대기 19.3~20.8 · 24.0~26.2) 좋아요 ·
//   그 밖 휙 순간 위 절반 기울기 ttF < 23° 이름 · ≥ 85° 또는 휙 때 남은 숨(D − ts) < 0.12 s 또는 숨 안에 꼭대기 못 넘음 늦음 · 그 밖 좋아요
// 🧭 가설 수정(검토 2026-10-16, 측정 원자료로 확인됨): 기울기 문턱만(20°/85°)이면 거의 최고 결과에도 이름·늦음이 붙었다(놓고 450 ms 휙 19~23장 = 꼭대기 88% → 이름,
//   1100 ms 휙 25~26장 = 꼭대기 → 늦음; 학습 시드 늦음 칩의 31% 가 꼭대기 85% 이상). 결과 우선 + 이름 문턱 23° → 이름 평균 19~20%·늦음 58~59%·좋아요 94~95%,
//   이름·늦음 칩인데 꼭대기 85% 이상 = 0~1% (sweepgb report ⑩)
export const GB_CHIP = { early: 23, late: 85, rem: 0.12, good: 0.85, peak: { 30: 20, 40: 25 } };
export const gbPeakRef = (n) => GB_CHIP.peak[n] ?? 0.62 * n;
export function gbChip({ ts, ttF, D, tTop, flip, n }) {
  if (ts == null) return 'none';
  if (flip >= GB_CHIP.good * gbPeakRef(n)) return 'good';
  if (ttF < GB_CHIP.early) return 'early';
  if (ttF >= GB_CHIP.late || D - ts < GB_CHIP.rem || !(tTop >= 0)) return 'late';
  return 'good';
}
// 휙 인식(벽시계 ms · CSS px): 놓은 뒤 새로 누른 손가락 하나. 창 시작 직전 점 하나는 남긴다(그때 손가락이 거기 있었다 = ZOH)
export class Flick {
  constructor(cfg = {}) { this.c = { rise: GB.rise, winMs: GB.winMs, ...cfg }; this.tr = null; this.fired = false; }
  down(x, y, t) { this.tr = [[t, y]]; this.fired = false; return false; }
  move(x, y, t) {
    if (!this.tr || this.fired) return false;
    const tr = this.tr;
    tr.push([t, y]);
    while (tr.length > 2 && tr[1][0] <= t - this.c.winMs) tr.shift();
    let yLow = -Infinity;
    for (const p of tr) if (p[1] > yLow) yLow = p[1];
    if (yLow - y >= this.c.rise) { this.fired = true; return true; }
    return false;
  }
  up(x, y, t) { const f = this.move(x, y, t); this.tr = null; return f; }
}

// ───────────── 한 숨의 고개 조종 (스펙 §3 SweepCtl) ─────────────
// '푸' 시작 순간 만든다. table.blowProg({ prog: ctl.prog, power: q, dur: ctl.durCap }) → ctl.attach(그 숨).
// prog(t) 는 sim.js applyWind 가 물리 스텝마다 정확히 1번 부른다. 렌더는 prog 를 부르지 않고 ctl.state 를 읽는다.
//  mode 'plan'  = 주입 훅·측정 일정: α = alphaOf({A, w, t0})(t), env = breathOf('rel', D, 0.04).env(t), 처음부터 dur = D + 0.04 (= makeProg('c', rel))
//  mode 'thumb' = 문법 A 엄지: α* = hInv(0.5 + u/150), α ← α + clamp(α* − α, ±1°) (≤ 24°). 떼기 요청 + t ≥ 0.131 이면 D = t 로 잠금(dur = D + 0.04),
//                 떼지 않고 t ≥ 1.0 이면 D = 1.0(저절로 떼기). env = rel 봉투(D 잠기기 전엔 오름 0.26 s 뒤 1). 뗀 뒤 α 는 그 자리
//  mode 'puck'  = 쓸기 문법의 퍽: 같은 바닥 입, α 0, breathOf('puff')(0.131 s) (= 측정 kind 'puff' · kin 'c' · sweep {})
//  mode 'flick' = 문법 B: 처음부터 D = gbD(q) · dur = D + 0.04 · env = rel 봉투. flick(at) 요청 → 다음 prog(t) 에서 t0 잠금
//                 (at 없음 = 그 스텝 t, at = 화면 초면 t ≥ at 인 첫 스텝에서 t0 = at — 주입·Node 일정). 잠근 뒤 α = alphaOf({A 24, w 80, t0})(t).
//                 → plan {A 24, w 80, t0, D} 와 비트 동일(휙 없음 = plan {A 0}), sweepgame ctl 이 대조
export class SweepCtl {
  constructor(table, { mode = 'thumb', plan = null, q = null, onEvent = null } = {}) {
    const c = table.pileCenter();
    this.c = c;
    this.zf = c.z + 1;
    this.M0 = { x: c.x, y: GEO.ym, z: this.zf + GEO.L };
    this.top0 = table.columnTop();
    this.mode = mode;
    this.onEvent = onEvent;
    this.u = 0; // 엄지 높이(px) — 게임이 gesture.tick 마다 넣는다
    this.relReq = false;
    this.D = null;
    this.P = null;
    this.alphaDeg = 0;
    this.br = null;
    if (mode === 'plan') {
      const al = alphaOf(plan);
      this.al = al;
      this.D = plan.D;
      this.br = breathOf('rel', plan.D, SWEEP.off);
      this.durCap = this.br.dur;
    } else if (mode === 'puck') {
      this.br = breathOf('puff');
      this.D = this.br.dur;
      this.durCap = this.br.dur;
    } else if (mode === 'flick') {
      if (!(q >= 0)) throw new Error("SweepCtl 'flick': q 필요");
      this.tb = table; // 휙 순간 기울기를 읽기만(halves) — 힘에는 안 쓴다
      this.q = q;
      this.D = gbD(q);
      this.br = breathOf('rel', this.D, SWEEP.off);
      this.durCap = this.br.dur;
      this.t0 = null; // 휙이 잠긴 숨 시각(화면 초) — 없으면 안 휙
      this.flickReq = null; // 'now' | 화면 초
      this.al = null;
    } else this.durCap = SWEEP.capD + SWEEP.off;
    this.state = { t: 0, alpha: 0, env: 0, o: { ...this.M0 }, yHit: GEO.ym, D: this.D, steps: 0, done: false };
    // 기록(카드·원인·진동). ttF·cueT 는 문법 B 만(휙 순간 위 절반 기울기 · 위 절반이 처음 10° 를 넘은 스텝 끝 시각)
    this.rec = { tTop: -1, ttAtTop: -1, maxTT: 0, maxTB: 0, endTB: 0, tb90: -1, series: [], tt: [], ttF: -1, cueT: -1 };
    this.below = false;
    this.k = 0; // after() 호출 수(물리 스텝 수)
    this.calls = 0; this.seen = 0; // prog 호출 수(숨이 있던 스텝 수) · after 가 본 수
    this.prog = (t) => this._prog(t);
  }
  attach(P) { this.P = P; return this; }
  release(u) { if (u != null) this.u = u; this.relReq = true; }
  // 문법 B 휙 요청(첫 번째만). at = 화면 초(주입·Node 일정) · 없으면 다음 물리 스텝. 숨이 끝났으면 false
  flick(at = null) {
    if (this.mode !== 'flick' || this.flickReq != null || this.state.done) return false;
    this.flickReq = at == null ? 'now' : at;
    return true;
  }
  _prog(t) {
    this.calls++;
    let aRad, env;
    if (this.mode === 'plan') { aRad = this.al(t); env = this.br.env(t); }
    else if (this.mode === 'puck') { aRad = 0; env = this.br.env(t); }
    else if (this.mode === 'flick') {
      if (this.t0 == null && this.flickReq != null && (this.flickReq === 'now' || t >= this.flickReq)) {
        this.t0 = this.flickReq === 'now' ? t : this.flickReq;
        this.al = alphaOf({ A: GB.A, w: GB.w, t0: this.t0 });
        // 손 휙: 휙 순간(= 지난 스텝 끝, 시각 t0) 위 절반 기울기. 일정 휙(숫자)은 after() 가 측정 규칙(스텝 끝 시각 ≥ ts 인 첫 스텝)으로
        if (this.flickReq === 'now') this.rec.ttF = +halves(this.tb)[1].toFixed(1);
        this.onEvent?.('flick');
      }
      aRad = this.al ? this.al(t) : 0;
      env = this.br.env(t);
    }
    else {
      // 떼기 잠금(물리 초): 요청 뒤 첫 스텝(최소 0.131), 아니면 상한 1.0
      if (this.D == null && ((this.relReq && t >= SWEEP.minD) || t >= SWEEP.capD)) {
        this.D = this.relReq && t >= SWEEP.minD ? t : SWEEP.capD;
        this.br = breathOf('rel', this.D, SWEEP.off);
        if (this.P) this.P.dur = this.br.dur;
      }
      if (this.D == null || t <= this.D) { // 뗀 뒤에는 고개가 그 자리
        const want = alphaForU(this.u);
        this.alphaDeg = Math.min(SWEEP.maxDeg, this.alphaDeg + Math.max(-SWEEP.stepDeg, Math.min(SWEEP.stepDeg, want - this.alphaDeg)));
      }
      aRad = this.alphaDeg * D2R;
      env = this.br ? this.br.env(t) : (t < 0.26 ? 0.5 * (1 - Math.cos((Math.PI * t) / 0.26)) : 1);
    }
    const p = poseAt(aRad, 'c', GEO, this.M0);
    const S = this.state;
    S.t = t; S.alpha = aRad; S.env = env; S.o = p.o; S.D = this.D;
    S.yHit = p.o.y + Math.tan(p.phi) * (p.o.z - this.zf);
    return { o: p.o, phi: p.phi, ux: 0, uz: -1, env };
  }
  // 매 table.step() 직후(frame 루프·Node 도구 같은 순서). 기하 기록만 — 힘에는 안 쓴다
  after(table) {
    const S = this.state, R = this.rec, k = this.k++;
    let crossed = false;
    if (this.calls > this.seen) { // 이번 스텝에 숨이 있었다(prog 가 불렸다)
      this.seen = this.calls;
      S.steps = this.calls;
      // 바람 축이 더미 앞면에서 꼭대기(top0)를 '아래에서 위로' 넘는 스텝 (처음부터 위면 안 셈 — sweepmap 고침 2026-10-14 와 같은 뜻)
      if (R.tTop < 0) { if (S.yHit <= this.top0) this.below = true; else if (this.below) crossed = true; }
      if (crossed) { R.tTop = +(S.t + table.T.dt).toFixed(4); this.onEvent?.('top'); }
      if (R.series.length < 200) R.series.push([+S.t.toFixed(4), +(S.alpha / D2R).toFixed(2), +S.env.toFixed(3), +S.yHit.toFixed(3)]);
      // 문법 B(읽기만): 일정 휙의 ttF = 스텝 끝 시각 (k+1)·dt ≥ ts 인 첫 스텝 뒤 위 절반 기울기(sweepgb gbShot 과 같은 규칙 → 원인 칩 문턱이 측정과 같은 뜻)
      //   · cueT = 숨 동안 위 절반이 처음 10° 를 넘은 스텝 끝 시각(코치 '들리면 휙!', sweepgb cue.tt10 과 같은 값)
      const fq = this.mode === 'flick' ? this.flickReq : null;
      const needF = typeof fq === 'number' && R.ttF < 0 && (k + 1) * table.T.dt >= fq;
      if (this.mode === 'flick' && (needF || R.cueT < 0)) {
        const tt = halves(table)[1];
        if (needF) R.ttF = +tt.toFixed(1);
        if (R.cueT < 0 && tt >= GB.cueTT) { R.cueT = +((k + 1) * table.T.dt).toFixed(4); this.onEvent?.('cue'); }
      }
    }
    S.done = !table.puff;
    if (crossed || k % 3 === 0) {
      const [tb, tt] = halves(table);
      if (tb > R.maxTB) R.maxTB = tb;
      if (tt > R.maxTT) R.maxTT = tt;
      R.endTB = tb;
      if (crossed) R.ttAtTop = tt;
      if (R.tb90 < 0 && tb > 90) { R.tb90 = +((k + 1) * table.T.dt).toFixed(4); this.onEvent?.('tb90'); }
      if (R.tt.length < 400) R.tt.push([+((k + 1) * table.T.dt).toFixed(4), +tb.toFixed(1), +tt.toFixed(1)]);
    }
  }
  // 판정 뒤 요약(원인 칩 입력). flips·outs·n 은 판정 결과
  summary(table, flips, outs) {
    const R = this.rec;
    R.endTB = halves(table)[0];
    const r = { n: table.liveDiscs().length, flip: flips, out: outs, tTop: R.tTop, ttAtTop: R.ttAtTop, maxTT: +R.maxTT.toFixed(1), maxTB: +R.maxTB.toFixed(1), endTB: +R.endTB.toFixed(1) };
    r.cause = causeOf(r);
    if (this.mode === 'flick') { Object.assign(r, { ts: this.t0, ttF: R.ttF, D: this.D, cueT: R.cueT }); r.chip = gbChip(r); }
    return r;
  }
}

// 위·아래 절반 평균 기울기(°): live 순서 앞 floor(n/2) = 아래 절반. acos(clamp(−u.y)) = 뒷면이 위(시작 자세)에서 0°, 세우면 90°
export function halves(table) {
  const live = table.liveDiscs(), n = live.length, half = Math.floor(n / 2);
  let tb = 0, tt = 0;
  live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
  return [tb / Math.max(1, half) / D2R, tt / Math.max(1, n - half) / D2R];
}
function rot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// ───────────── 연습판 판·주입 일정 ─────────────
export const PRACTICE_SEEDS = { 30: [601, 624], 40: [401, 424] }; // 측정 기준 표가 있는 판(§3.9) — 30장 601~624, 40장 401~424
export const practiceSeed = (N, idx) => { const [a, b] = PRACTICE_SEEDS[N]; const span = b - a + 1; return a + (((idx % span) + span) % span); };
export const practiceTableSeed = (N, seed) => seed * 7907 + N; // 측정과 같은 더미(sweepmap shot: Table 시드 = seed·7907 + n)
// 측정 기준 한 줄(카드 아래 참고, 정답 표시 아님) — 문서 §3.9·스펙 §5
export const PRACTICE_REF = { 30: 20.5, 40: 25.5 };
// 주입 일정 풀기: A 'top' = alphaTop(꼭대기) + 0.5(소수 3자리), D 'top' = t0 + A/w + 0.04(소수 4자리) — sweepcheck relTop 과 같은 식
export function resolvePlan(plan, top) {
  const p = { ...plan };
  if (p.A === 'top') p.A = +(alphaTop(top) + 0.5).toFixed(3);
  if (p.D === 'top') p.D = +(p.t0 + p.A / p.w + 0.04).toFixed(4);
  return p;
}

// 정지 뒤 모든 딱지(id 순) 위치·회전 f64 + off 깃발 → 64비트 해시(FNV-1a 두 줄, 16진 16자). 주입 훅 비트 대조용
export function poseHash(table) {
  const live = table.liveDiscs().slice().sort((a, b) => a.id - b.id);
  const f = new Float64Array(live.length * 8);
  live.forEach((d, i) => { const p = d.body.translation(), q = d.body.rotation(); f.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w, d.off ? 1 : 0], i * 8); });
  const u8 = new Uint8Array(f.buffer);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < u8.length; i++) { h1 = Math.imul(h1 ^ u8[i], 0x01000193); h2 = Math.imul(h2 ^ u8[i], 0x5bd1e995) ^ (h2 >>> 15); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// Node·게임 공용: 연습판 한 샷(주입 일정) — 새 더미 → blowProg → 스텝 판정(sim.js stepJudge)까지. 게임 frame 루프와 같은 호출 순서(step → after → judge)
export function planShot(Table, { N, seed, plan, q, cards }) {
  const t = new Table(practiceTableSeed(N, seed), { lift: 519.59 });
  t.addPile(cards || Array.from({ length: N }, (_, i) => i));
  t.settle(600);
  const top = t.columnTop();
  const pl = plan.kind === 'puck' ? null : resolvePlan(plan, top);
  const ctl = pl ? new SweepCtl(t, { mode: 'plan', plan: pl }) : new SweepCtl(t, { mode: 'puck' });
  ctl.attach(t.blowProg({ prog: ctl.prog, power: q, dur: ctl.durCap }));
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do { t.step(); ctl.after(t); steps++; } while (!t.stepJudge(j));
  const R = t.judgeResult();
  return { table: t, ctl, plan: pl, D: ctl.D, steps, flips: R.flipped.length, outs: R.outs.length, hash: poseHash(t), tTop: ctl.rec.tTop, top };
}

// Node·게임 공용: 문법 B 한 샷 — 놓기(q) → ts(화면 초)에 휙(null = 안 휙) → 판정. 게임 주입 훅({ kind: 'gb', q, ts })과 같은 호출 순서
//   flickNow = 스텝 번호(사람 손처럼 '그 스텝 전에 휙 요청 → 그 스텝 t 로 잠금'을 Node 에서 재현할 때, ts 대신)
export function flickShot(Table, { N, seed, q, ts = null, flickNow = null, cards }) {
  const t = new Table(practiceTableSeed(N, seed), { lift: 519.59 });
  t.addPile(cards || Array.from({ length: N }, (_, i) => i));
  t.settle(600);
  const top = t.columnTop();
  const ctl = new SweepCtl(t, { mode: 'flick', q });
  if (ts != null) ctl.flick(ts);
  ctl.attach(t.blowProg({ prog: ctl.prog, power: q, dur: ctl.durCap }));
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do { if (flickNow != null && steps === flickNow) ctl.flick(); t.step(); ctl.after(t); steps++; } while (!t.stepJudge(j));
  const R = t.judgeResult();
  const flips = R.flipped.length, outs = R.outs.length;
  const sum = ctl.summary(t, flips, outs);
  return { table: t, ctl, D: ctl.D, t0: ctl.t0, steps, flips, outs, hash: poseHash(t), tTop: ctl.rec.tTop, ttF: ctl.rec.ttF, cueT: ctl.rec.cueT, chip: sum.chip, top };
}

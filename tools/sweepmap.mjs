// tools/sweepmap.mjs — 고개 쓸기(튕김) 코어 측정 도구. 설계서: docs/design/core-sweep.md
//
// 무엇을 재나: 평평한 책상 위 원기둥 더미 + 책상 높이 입(수평 제트) + 숨 도중 고개를 목 축 둘레로 쳐올림(입이 오르고 제트가 위로 꺾임).
// 힘 식은 v1 9차 '입술' 경로(blowLip) 그대로다 — 이득 계수 0. 바뀌는 것은 시간에 따른 입 위치 o(t)·제트 각 φ(t)·숨 봉투 env(t) 뿐.
// 물리 = tools/coresweep/simsweep.js (= mockup/src/sim.js 복사 + blowProg/jetPose 약 25줄 + 시험 손잡이 DISC_H·iters·stackGap).
// `verify` 로 옛 경로가 mockup 과 비트 동일인지 먼저 확인한다.
//
// 명령 (CPU 4코어 공유: 기본 2 일꾼. 프리셋 하나가 2코어로 20분을 넘지 않게 짰다 — list 참고)
//   node tools/sweepmap.mjs verify                         simsweep ≡ mockup sim (기본 blow 비트 동일 · blowLip ≡ 상수 prog)
//   node tools/sweepmap.mjs list                           프리셋·샷 수
//   node tools/sweepmap.mjs run <프리셋> [out.jsonl] [W=2]  작업 생성 → W 일꾼 → out.jsonl(이어 돌리기 가능) → 요약 출력
//   node tools/sweepmap.mjs sum <out.jsonl>                키별 평균[95%]·원 밖·통째·0장·원인 분포. BASE=키 또는 BASE=best:fix → 기준 대비 짝 비
//   node tools/sweepmap.mjs pair <out.jsonl> <기준키> <비교키> [n...]
//   node tools/sweepmap.mjs gate <out.jsonl>               gate 프리셋 판정 (사전 등록 칸 ÷ 최선 고정, 시작 시각 산, 절제, 각도만/높이만)
//   node tools/sweepmap.mjs release <out.jsonl>            release 프리셋 표 (엄지 떼기 ↔ 숨 끝 결합)
//   node tools/sweepmap.mjs one '<job json>'               한 샷 + 아래/위 절반 기울기 시계열
//   node tools/sweepmap.mjs geo                            고개 각 → 입 높이·바람 자국 높이·엄지 px, 장수별 꼭대기를 넘는 각
//   node tools/sweepmap.mjs track [n...]                   PvP 궤적 크기·스텝 판정 시각 (v1 vs 얇은 물리)
//   node tools/sweepmap.mjs bench [n...]                   부는 동안 화면 1프레임(1/60 s 시뮬) 비용
// 환경: SEEDS=a-b (프리셋 시드 범위 바꾸기, 빠른 확인용) · NS=20,30 (장수 거르기) · FROM=out_map.jsonl (skill 프리셋의 의도 출처)
//
// 시드는 프리셋마다 다르게 고정했다(고르기 1~8·101~116 / 확인 201~248 / 얇은 301~316 / 지도 301~310 / 실력 501~524 / 게이트 401~424).
// 같은 (프리셋, n, 시드)는 같은 더미에서 시작한다(Table 시드 = seed·7907 + n) → 키 사이 짝 비교.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as SW from './coresweep/simsweep.js';

const D2R = Math.PI / 180;

// ───────────────────────── 숨 봉투 (시뮬 초 = 화면 초; v1 중력 38 → 실물보다 약 3.2배 느림) ─────────────────────────
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
  if (kind === 'pulse2') {
    // 진단(콤보는 다음 단계): 짧은 숨 두 번. D = [첫 길이, 쉼, 둘째 길이]. 각 숨은 0.1 s 올라가고 0.1 s 내려감
    const [a, g, b] = D, r = 0.1;
    const one = (t, L) => (t < 0 || t > L ? 0 : t < r ? 0.5 * (1 - Math.cos((Math.PI * t) / r)) : t > L - r ? 0.5 * (1 - Math.cos((Math.PI * (L - t)) / r)) : 1);
    return { dur: a + g + b, env: (t) => one(t, a) + one(t - a - g, b) };
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

function rot(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// 실패 원인(초안, 문턱 미검증 — cuecheck 식 검증 전에는 화면에 쓰지 않는다). 그 샷의 물리 기록에서만 계산한다
export function causeOf(r) {
  if (r.tTop >= 0 && r.ttAtTop < 25) return 'early'; // 바람 축이 꼭대기를 넘을 때 위 절반이 아직 25° 미만
  if (r.out >= 0.25 * r.n) return 'strong'; // 원 밖 ≥ 장수의 25%
  if (r.maxTT < 20) return 'weak'; // 위 절반 최대 기울기 < 20° (들썩만)
  if (r.maxTB >= 40 && r.endTB < 30) return 'sank'; // 아래 절반이 들렸다 주저앉음(반동 a)
  if (r.flip >= 0.5 * r.n) return 'good';
  return 'mixed';
}

// ───────────────────────── 한 샷 ─────────────────────────
// job = { n, seed, breath:{kind,D,off}, q, kin, sweep:{A,w,t0}, geo?, tune?, H?, trace?, settleSteps?, maxSec? }
export function shot(job) {
  SW.setDiscH(job.H || 0.11);
  const t = new SW.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(job.settleSteps || 600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const zf = c0.z + 1;
  const br = breathOf(job.breath.kind, job.breath.D, job.breath.off);
  const prog = makeProg(t, { kin: job.kin || 'c', sweep: job.sweep || {}, breath: br, geo: { ...GEO, ...(job.geo || {}) } });
  t.blowProg({ prog, power: job.q, dur: br.dur });
  const live = t.liveDiscs();
  const bottom = live[0];
  const half = Math.floor(job.n / 2);
  let maxTiltBottom = 0, tLift = -1, series = job.trace ? [] : null;
  let maxTB = 0, maxTT = 0, endTB = 0, tTop = -1, ttAtTop = -1;
  const halves = () => {
    let tb = 0, tt = 0;
    live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
    return [tb / Math.max(1, half) / D2R, tt / Math.max(1, job.n - half) / D2R];
  };
  const dtS = t.T.dt;
  const maxSteps = Math.ceil((job.maxSec || 8) / dtS);
  let i = 0, capped = 1, below = false;
  for (; i < maxSteps; i++) {
    // 바람 축이 더미 앞면에서 꼭대기(top0) '아래에서 위로' 넘는 순간 (기하만; 힘에는 안 씀)
    // (고침 2026-10-14: 예전엔 처음부터 축이 꼭대기 위인 낮은 더미(입 12.5 mm 보다 낮은 약 7장 이하)도 첫 스텝에 '넘음'으로 쳐서
    //  고개 고정 샷까지 전부 'early'(🐇)로 분류했다. 10장 이상은 축이 꼭대기 아래에서 시작하므로 값이 같다)
    const P = t.puff;
    let crossed = false;
    // P.t = 0 이면 아직 첫 바람 전이라 자세가 자리표시(원점)다 → 건너뜀
    if (P && P.t > 0 && tTop < 0 && P.d && P.d.z < -1e-6) { const s = (zf - P.o.z) / P.d.z; if (P.o.y + s * P.d.y <= top0) below = true; else if (below) crossed = true; }
    t.step();
    const up = rot(bottom.body.rotation(), { x: 0, y: 1, z: 0 });
    const tilt = Math.acos(Math.min(1, Math.abs(up.y)));
    if (tilt > maxTiltBottom) maxTiltBottom = tilt;
    if (tLift < 0 && tilt > 5 * D2R) tLift = (i + 1) * dtS;
    if (crossed || i % 3 === 0) {
      const [tb, tt] = halves();
      if (tb > maxTB) maxTB = tb;
      if (tt > maxTT) maxTT = tt;
      endTB = tb;
      if (crossed) { tTop = (i + 1) * dtS; ttAtTop = tt; }
      if (series && i % 6 === 0) series.push([+((i + 1) * dtS).toFixed(3), +(tilt / D2R).toFixed(1), +tb.toFixed(1), +tt.toFixed(1), t.puff ? 1 : 0]);
    }
    if (!t.puff && i > 30 && t.isSettled()) { capped = 0; break; }
  }
  endTB = halves()[0];
  const flippedSet = new Set(t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d)).map((d) => d.id));
  const outs = t.liveDiscs().filter((d) => !t.inCircle(d)).length;
  const flip42 = t.liveDiscs().filter((d) => { if (d.off || t.faceUp(d) <= 0.2) return false; const p = d.body.translation(); return Math.hypot(p.x, p.z) <= 4.2; }).length;
  let flipBottom = 0, flipTop = 0, lean = 0;
  const zs = [];
  for (const d of t.liveDiscs()) {
    if (flippedSet.has(d.id)) { if (d.id < half) flipBottom++; else flipTop++; }
    const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 });
    if (Math.abs(u.y) < 0.9 && Math.abs(u.y) > 0.2) lean++;
    zs.push(d.body.translation().z - c0.z);
  }
  zs.sort((a, b) => a - b);
  const r = {
    n: job.n, seed: job.seed, flip: flippedSet.size, flip42, out: outs, flipBottom, flipTop, lean,
    fan: zs.length ? +(zs[zs.length - 1] - zs[0]).toFixed(3) : 0, // 부는 방향 퍼짐(반지름 단위)
    fwd: zs.length ? +(-zs[Math.floor(zs.length / 2)]).toFixed(3) : 0, // 중앙값이 먼 쪽(−z)으로 간 거리
    whole: flippedSet.size >= 0.7 * job.n ? 1 : 0,
    tilt0: +(maxTiltBottom / D2R).toFixed(1), tLift: +tLift.toFixed(3), top0: +top0.toFixed(3), steps: i, capped,
    maxTB: +maxTB.toFixed(1), endTB: +endTB.toFixed(1), maxTT: +maxTT.toFixed(1), tTop: +tTop.toFixed(3), ttAtTop: +ttAtTop.toFixed(1),
  };
  r.cause = causeOf(r);
  if (series) r.series = series;
  return r;
}

// ───────────────────────── 프리셋 (작업 목록) ─────────────────────────
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// 프리셋 시드 범위. SEEDS=a-b 면 그 범위로 '바꾼다'(프리셋 밖 새 시드로 재현 확인 가능).
// (고침 2026-10-14: 예전엔 프리셋 범위 안에서 거르기만 해서 SEEDS=601-624 같은 새 시드는 작업 0개가 됐다. 범위 안 값이면 예전과 같은 작업)
const SR = (a, b) => { const s = process.env.SEEDS; if (!s) return R(a, b); const [x, y] = s.split('-').map(Number); return R(x, y ?? x); };
const P = (D) => ({ kind: 'pueok', D });
const THIN240 = { H: 0.04, tune: { erp: 0.8, dt: 1 / 240 } }; // 1안 얇은 구성
const THIN16 = { H: 0.04, tune: { erp: 0.8, iters: 16 } }; // 3안 얇은 구성(dt 1/120)
// 게이트 사전 등록 칸: 30장 이하 = 숨 0.7·0.6 s, 8°·40°/s·0.25 s / 40장 이상 = 숨 0.85, 8°·120°/s·0.3 s (1안 확인판·3안 지도에서 미리 정함)
export const regCell = (n) => (n >= 40 ? { q: 0.85, sweep: { A: 8, w: 120, t0: 0.3 } } : { q: 0.7, sweep: { A: 8, w: 40, t0: 0.25 } });

const PRESETS = {
  // 1안 확인판 (시드 201~248, 48짝, 칸은 고르기 판을 보고 미리 정함) — 키 접두 'c|'
  confirm: { note: '1안 확인판: 고정 숨 4 × 튕김 시작 5 + q0.85·120°/s·15°/s, 5·10·20·30장, 시드 201~248 (약 5분)', gen(J) {
    for (const n of [5, 10, 20, 30]) for (const s of SR(201, 248)) {
      for (const q of [0.55, 0.7, 0.85, 0.93]) J.push({ key: `c|fix|q${q}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: {} });
      for (const t0 of [0.05, 0.15, 0.25, 0.35, 0.45]) J.push({ key: `c|w40|q0.7|t${t0}`, n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0 } });
      for (const t0 of [0.25, 0.35]) J.push({ key: `c|w40|q0.85|t${t0}`, n, seed: s, breath: P(0.6), q: 0.85, kin: 'c', sweep: { A: 8, w: 40, t0 } });
      J.push({ key: 'c|w120|q0.7|t0.3', n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 120, t0: 0.3 } });
      J.push({ key: 'c|w15|q0.7|t0.1', n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 15, t0: 0.1 } });
    } } },
  // 1안 속도 × 시작 (시드 101~116) — 키 접두 'p2|'
  speed: { note: '1안 속도×시작×폭 표: 10·20·30장, 시드 101~116 (약 12분)', gen(J) {
    for (const n of [10, 20, 30]) for (const s of SR(101, 116)) {
      for (const D of [0.45, 0.6, 1.0]) for (const q of [0.55, 0.7, 0.85, 0.93]) J.push({ key: `p2|D${D}|q${q}|A0|w0|t0`, n, seed: s, breath: P(D), q, kin: 'c', sweep: {} });
      for (const q of [0.55, 0.7, 0.85]) for (const t0 of [0.1, 0.2, 0.3, 0.4]) for (const w of [15, 40, 120]) for (const A of [4, 8]) J.push({ key: `p2|D0.6|q${q}|A${A}|w${w}|t${t0}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: { A, w, t0 } });
    } } },
  // 1안 분해: 각도만/높이만, 입 높인 고정, 입 4 cm, 턱 축, 두 번 숨 (시드 101~116) — 키 접두 'd|'
  decomp: { note: '1안 분해: 각도만/높이만·입 높인 고정·4 cm·턱 축·두 번 숨, 20·30장, 시드 101~116 (약 6분)', gen(J) {
    for (const n of [20, 30]) for (const s of SR(101, 116)) {
      for (const [D, q] of [[0.6, 0.7], [1.0, 0.85], [0.6, 0.55]]) {
        const b = P(D);
        J.push({ key: `d|D${D}|q${q}|fixLow`, n, seed: s, breath: b, q, kin: 'c', sweep: {} });
        for (const ym of [0.9, 1.3]) J.push({ key: `d|D${D}|q${q}|fixHigh${ym}`, n, seed: s, breath: b, q, kin: 'c', sweep: {}, geo: { ym } });
        for (const kin of ['c', 'a', 'b']) for (const t0 of [0.25, 0.3]) J.push({ key: `d|D${D}|q${q}|kin${kin}|t${t0}`, n, seed: s, breath: b, q, kin, sweep: { A: 8, w: 40, t0 } });
        J.push({ key: `d|D${D}|q${q}|L1.6fix`, n, seed: s, breath: b, q, kin: 'c', sweep: {}, geo: { L: 1.6 } });
        for (const A of [8, 20]) J.push({ key: `d|D${D}|q${q}|L1.6A${A}`, n, seed: s, breath: b, q, kin: 'c', sweep: { A, w: 40, t0: 0.25 }, geo: { L: 1.6 } });
        for (const A of [8, 20]) J.push({ key: `d|D${D}|q${q}|chinA${A}`, n, seed: s, breath: b, q, kin: 'c', sweep: { A, w: 40, t0: 0.25 }, geo: { PY: -1.6, PZ: 0.6 } });
      }
      for (const g of [0.1, 0.25, 0.4, 0.6]) J.push({ key: `d|pulse0.3+${g}+0.3|q0.7|two`, n, seed: s, breath: { kind: 'pulse2', D: [0.3, g, 0.3] }, q: 0.7, kin: 'c', sweep: {} });
      J.push({ key: 'd|pulse0.3|q0.7|one', n, seed: s, breath: { kind: 'pulse2', D: [0.3, 0, 0] }, q: 0.7, kin: 'c', sweep: {} });
    } } },
  // 심사 절제: 각도에 따라 바뀌는 힘 항(lipGap·lipPushUp·lipSplit)을 모두 끄고도 튕김 이득이 남나 (시드 201~216)
  ablate: { note: '심사 절제: lip 힘 항 0 에서 고정/튕김 + 각도만/높이만, 20·30장, 시드 201~216 (약 1분)', gen(J) {
    const OFF = { lipGap: 0, lipPushUp: 0, lipSplit: 0 };
    for (const n of [20, 30]) for (const s of SR(201, 216)) {
      for (const q of [0.55, 0.7, 0.93]) J.push({ key: `abl|fix|q${q}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: {}, tune: OFF });
      for (const q of [0.55, 0.7]) J.push({ key: `abl|w40|q${q}|t0.25`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: { A: 8, w: 40, t0: 0.25 }, tune: OFF });
      J.push({ key: 'abl|w120|q0.7|t0.3', n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 120, t0: 0.3 }, tune: OFF });
      for (const kin of ['a', 'b']) {
        J.push({ key: `abl|kin${kin}|q0.55|t0.25`, n, seed: s, breath: P(0.6), q: 0.55, kin, sweep: { A: 8, w: 40, t0: 0.25 }, tune: OFF });
        J.push({ key: `full|kin${kin}|q0.55|t0.25`, n, seed: s, breath: P(0.6), q: 0.55, kin, sweep: { A: 8, w: 40, t0: 0.25 } });
      }
    } } },
  // 1안 얇은 딱지 (두께 0.04 + erp 0.8 + dt 1/240, 시드 301~316) — 키 접두 't|'. 주의: 쏜 뒤 정착 안 함(track 참고) → 근거 약함
  thin: { note: '1안 얇은 딱지(0.04·erp 0.8·dt 1/240): 10·20·30장, 시드 301~316 (약 4분, 쏜 뒤 정착 안 함 주의)', gen(J) {
    for (const n of [10, 20, 30]) for (const s of SR(301, 316)) {
      for (const q of [0.55, 0.7, 0.85, 0.93]) J.push({ key: `t|fix|q${q}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: {}, ...THIN240 });
      for (const t0 of [0.05, 0.25, 0.45]) J.push({ key: `t|w40|q0.7|t${t0}`, n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0 }, ...THIN240 });
      J.push({ key: 't|w120|q0.7|t0.3', n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 120, t0: 0.3 }, ...THIN240 });
      J.push({ key: 't|puff|q0.93', n, seed: s, breath: { kind: 'puff' }, q: 0.93, kin: 'c', sweep: {}, ...THIN240 });
    } } },
  // 3안 장수별 전략 지도 (v1 / 얇은(erp 0.8·iters 16) × 8·16·30·45장 × 전략 17, 시드 301~310) — 키 'B|구성|전략'
  map: { note: '3안 장수별 전략 지도: v1/thin × 8·16·30·45장 × 전략 17, 시드 301~310 (약 10분)', gen(J) {
    const S = {
      'puff.70': [{ kind: 'puff' }, 0.7, {}], 'puff.85': [{ kind: 'puff' }, 0.85, {}], 'puff.95': [{ kind: 'puff' }, 0.95, {}],
      'puff.85+flick6': [{ kind: 'puff' }, 0.85, { A: 6, w: 120, t0: 0.03 }],
      'pu.55': [P(0.6), 0.55, {}], 'pu.70': [P(0.6), 0.7, {}], 'pu.85': [P(0.6), 0.85, {}],
      'pu.70+A8w120t.3': [P(0.6), 0.7, { A: 8, w: 120, t0: 0.3 }], 'pu.70+A3w120t.3': [P(0.6), 0.7, { A: 3, w: 120, t0: 0.3 }],
      'pu.70+A20w120t.3': [P(0.6), 0.7, { A: 20, w: 120, t0: 0.3 }], 'pu.70+A8w40t.3': [P(0.6), 0.7, { A: 8, w: 40, t0: 0.3 }],
      'pu.70+A8w360t.3': [P(0.6), 0.7, { A: 8, w: 360, t0: 0.3 }], 'pu.70+A8w120t.1': [P(0.6), 0.7, { A: 8, w: 120, t0: 0.1 }],
      'pu.70+A8w120t.45': [P(0.6), 0.7, { A: 8, w: 120, t0: 0.45 }], 'pu.55+A8w120t.3': [P(0.6), 0.55, { A: 8, w: 120, t0: 0.3 }],
      'pu.85+A8w120t.3': [P(0.6), 0.85, { A: 8, w: 120, t0: 0.3 }], 'puL.70+A8w120t.7': [P(1.0), 0.7, { A: 8, w: 120, t0: 0.7 }],
    };
    for (const [c, cv] of Object.entries({ v1: {}, thin: THIN16 })) for (const n of [8, 16, 30, 45]) for (const [nm, [breath, q, sweep]] of Object.entries(S)) for (const seed of SR(301, 310))
      J.push({ key: `B|${c}|${nm}`, n, seed, kin: 'c', breath, q, sweep, ...cv });
  } },
  // 3안 실력 곡선: map 에서 고른 의도(퍽·고정·쓸기 최고)에 손 잡음 3단(가정, 미검증). 의도는 시드 301~310, 보고는 501~524(오라클 분리)
  skill: { note: '3안 실력 곡선: FROM=out_map.jsonl 필요, v1(CCFG=thin 이면 얇은), 시드 501~524 (약 4분)', gen(J) {
    if (!process.env.FROM) throw new Error('skill 프리셋은 FROM=out_map.jsonl 이 필요하다');
    const rows = readRows(process.env.FROM).filter((r) => r.key.startsWith('B|'));
    const parse = (st) => {
      const [b, sw] = st.split('+');
      const kind = b.startsWith('puff') ? 'puff' : 'pueok';
      const D = b.startsWith('puL') ? 1.0 : 0.6;
      const q = +('0' + b.slice(b.indexOf('.')));
      let sweep = {};
      if (sw) { const m = sw.match(/A(\d+)w(\d+)t([\d.]+)/); if (m) sweep = { A: +m[1], w: +m[2], t0: +m[3] }; else if (sw.startsWith('flick')) sweep = { A: +sw.slice(5), w: 120, t0: 0.03 }; }
      return { kind, D, q, sweep };
    };
    const G = new Map();
    for (const r of rows) { const [, cfg, st] = r.key.split('|'); const g = `${cfg}|${r.n}`; if (!G.has(g)) G.set(g, new Map()); const m = G.get(g); if (!m.has(st)) m.set(st, []); m.get(st).push(r.flip); }
    const SK = { novice: { q: 0.25, t0: 0.12, A: 0.5, w: 0.6, D: 0.12 }, learner: { q: 0.15, t0: 0.07, A: 0.3, w: 0.35, D: 0.07 }, expert: { q: 0.04, t0: 0.025, A: 0.12, w: 0.15, D: 0.025 } };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const want = process.env.CCFG || 'v1';
    for (const [g, m] of G) {
      const [cfg, n] = g.split('|'); if (cfg !== want) continue;
      const L = [...m.entries()].map(([st, v]) => ({ st, m: mean(v) }));
      const pick = (f) => L.filter((x) => f(x.st)).sort((a, b) => b.m - a.m)[0];
      const it = { puff: pick((s) => s.startsWith('puff') && !s.includes('+')), fix: pick((s) => s.startsWith('pu') && !s.startsWith('puff') && !s.includes('+')), sweep: pick((s) => s.startsWith('pu') && !s.startsWith('puff') && s.includes('+')) };
      for (const [iname, pk] of Object.entries(it)) {
        if (!pk) continue;
        const I = parse(pk.st);
        for (const [sk, s] of Object.entries(SK)) for (const seed of SR(501, 524)) {
          const rr = rng(seed * 131 + (sk === 'novice' ? 1 : sk === 'learner' ? 2 : 3) * 7919 + +n); // 같은 (구성, N, 시드, 실력)이면 세 의도가 같은 잡음
          const zq = gauss(rr), zt = gauss(rr), zA = gauss(rr), zw = gauss(rr), zD = gauss(rr);
          const q = clamp(I.q * (1 + s.q * zq), 0.2, 1.25);
          const D = I.kind === 'pueok' ? clamp(I.D + s.D * zD, 0.25, 1.93) : undefined;
          let sweep = {};
          if (I.sweep.A) sweep = { A: clamp(I.sweep.A * Math.exp(s.A * zA), 0.5, 40), w: clamp(I.sweep.w * Math.exp(s.w * zw), 5, 900), t0: clamp(I.sweep.t0 + s.t0 * zt, 0, 1.9) };
          J.push({ key: `C|${cfg}|${iname}|${sk}|${pk.st}`, n: +n, seed, kin: 'c', breath: I.kind === 'puff' ? { kind: 'puff' } : { kind: 'pueok', D }, q, sweep, ...(cfg === 'thin' ? THIN16 : {}) });
        }
      }
    }
  } },
  // 게이트(설계서 §구현 백로그): 20·30·45장 × 사전 등록 칸 vs 최선 고정(숨 4 × 길이 3 + 퍽 2), 시작 시각 격자, 폭, 절제, 각도만/높이만. 시드 401~424(새로)
  gate: { note: '게이트: 20·30·45장, 사전 등록 칸 ÷ 최선 고정(14칸)·시작 시각 산·폭·절제·각도만/높이만, 시드 401~424 (약 11분)', gen(J) {
    const OFF = { lipGap: 0, lipPushUp: 0, lipSplit: 0 };
    for (const n of [20, 30, 45]) for (const s of SR(401, 424)) {
      for (const q of [0.7, 0.85, 0.93, 1.0]) for (const D of [0.45, 0.6, 1.0]) J.push({ key: `g|fix|q${q}|D${D}`, n, seed: s, breath: P(D), q, kin: 'c', sweep: {} });
      for (const q of [0.85, 0.95]) J.push({ key: `g|fix|puff|q${q}`, n, seed: s, breath: { kind: 'puff' }, q, kin: 'c', sweep: {} });
      const rc = regCell(n);
      J.push({ key: 'g|flick', n, seed: s, breath: P(0.6), q: rc.q, kin: 'c', sweep: rc.sweep });
      for (const t0 of [0.05, 0.15, 0.25, 0.35, 0.45]) J.push({ key: `g|t0|${t0}`, n, seed: s, breath: P(0.6), q: rc.q, kin: 'c', sweep: { ...rc.sweep, t0 } });
      for (const A of [3, 20]) J.push({ key: `g|A|${A}`, n, seed: s, breath: P(0.6), q: rc.q, kin: 'c', sweep: { ...rc.sweep, A } });
      for (const kin of ['a', 'b']) J.push({ key: `g|kin${kin}`, n, seed: s, breath: P(0.6), q: rc.q, kin, sweep: rc.sweep });
      for (const q of [0.85, 0.93, 1.0]) J.push({ key: `g|abl|fix|q${q}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: {}, tune: OFF });
      J.push({ key: 'g|abl|flick', n, seed: s, breath: P(0.6), q: rc.q, kin: 'c', sweep: rc.sweep, tune: OFF });
    } } },
  // 엄지 떼기 ↔ 숨 끝 결합 (1안 문법 '떼면 숨 끝' + 3안 B2·B3 + 심사 지적: B2 의 0장은 봉투가 놓기 0.26 s 전부터 줄던 착시가 섞임)
  release: { note: '엄지 떼기↔숨 끝: 20·30·45장 × 떼기 7가지, 시드 401~424 (약 3분)', gen(J) {
    for (const n of [20, 30, 45]) for (const s of SR(401, 424)) {
      const rc = regCell(n), sw = rc.sweep;
      const top = +(sw.t0 + sw.A / sw.w + 0.04).toFixed(3); // 고개가 끝 각(A)에 닿고 0.04 s 뒤 엄지가 떨어짐
      const B = (kind, D, off) => ({ kind, D, off });
      J.push({ key: 'r|hold', n, seed: s, breath: P(0.6), q: rc.q, kin: 'c', sweep: sw }); // 기준: 숨 0.6 s 고정(측정 기본)
      J.push({ key: 'r|top-pueok', n, seed: s, breath: P(top), q: rc.q, kin: 'c', sweep: sw }); // 3안 B2 (봉투가 미리 줄어듦)
      J.push({ key: 'r|top-cut', n, seed: s, breath: B('rel', top, 0.04), q: rc.q, kin: 'c', sweep: sw }); // 떼자마자 끊김(봉투는 놓기까지 가득)
      J.push({ key: 'r|top-tail', n, seed: s, breath: B('rel', top, 0.26), q: rc.q, kin: 'c', sweep: sw }); // 3안 B3 '억' 꼬리
      J.push({ key: 'r|top+.15-cut', n, seed: s, breath: B('rel', +(top + 0.15).toFixed(3), 0.04), q: rc.q, kin: 'c', sweep: sw }); // 쳐올린 채 0.15 s 버티고 떼기
      J.push({ key: 'r|top+.15-tail', n, seed: s, breath: B('rel', +(top + 0.15).toFixed(3), 0.26), q: rc.q, kin: 'c', sweep: sw });
      J.push({ key: 'r|fix-tail0.6', n, seed: s, breath: B('rel', 0.6, 0.26), q: rc.q, kin: 'c', sweep: {} }); // 고개 고정, 같은 문법(0.6 s 에 떼기 + 꼬리)
    } } },
};

// ───────────────────────── 통계 ─────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(R) { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
// 평균비 ys/xs, 짝 부트스트랩 95% (B 2000회, 고정 난수 → 같은 입력이면 같은 구간)
export function pairedRatio(xs, ys, B = 2000) {
  const n = xs.length, Rr = rng(20261014), out = [], dif = [];
  const mx = mean(xs), my = mean(ys);
  for (let b = 0; b < B; b++) { let sx = 0, sy = 0; for (let i = 0; i < n; i++) { const j = Math.floor(Rr() * n); sx += xs[j]; sy += ys[j]; } out.push(sx > 0 ? sy / sx : Infinity); dif.push((sy - sx) / n); }
  out.sort((a, b) => a - b); dif.sort((a, b) => a - b);
  return { r: mx > 0 ? my / mx : Infinity, lo: out[Math.floor(0.025 * B)], hi: out[Math.floor(0.975 * B)], mx, my, d: my - mx, dlo: dif[Math.floor(0.025 * B)], dhi: dif[Math.floor(0.975 * B)] };
}
function bootMean(xs, B = 2000) {
  const n = xs.length, Rr = rng(7), out = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += xs[Math.floor(Rr() * n)]; out.push(s / n); }
  out.sort((a, b) => a - b);
  return { m: mean(xs), lo: out[Math.floor(0.025 * B)], hi: out[Math.floor(0.975 * B)] };
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const ci = (p) => `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}]`;

export function readRows(f) { return f.split(',').flatMap((ff) => readFileSync(ff, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))); }
export function index(rows) { // n → key → seed → row
  const M = new Map();
  for (const r of rows) { if (!M.has(r.n)) M.set(r.n, new Map()); const K = M.get(r.n); if (!K.has(r.key)) K.set(r.key, new Map()); K.get(r.key).set(r.seed, r); }
  return M;
}
export function pairOf(A, B) { const s = [...A.keys()].filter((x) => B.has(x)); return pairedRatio(s.map((x) => A.get(x).flip), s.map((x) => B.get(x).flip)); }
const vals = (m, f = (r) => r.flip) => [...m.values()].map(f);
export function bestKey(K, test) { let best = null, bm = -1; for (const [k, m] of K) if (test(k)) { const v = mean(vals(m)); if (v > bm) { bm = v; best = k; } } return best; }
function causes(m) {
  const c = {}; for (const r of m.values()) { if (!r.cause) return '-'; c[r.cause] = (c[r.cause] || 0) + 1; } // 옛 출력(원인 필드 없음)은 '-'
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / m.size)}%`).join(' ');
}
export function line(k, m) {
  const b = bootMean(vals(m));
  return `  ${k.padEnd(30)} ${b.m.toFixed(2).padStart(6)}장 [${b.lo.toFixed(1)}, ${b.hi.toFixed(1)}]  원밖 ${mean(vals(m, (r) => r.out)).toFixed(1).padStart(4)}  통째 ${(100 * mean(vals(m, (r) => r.whole))).toFixed(0).padStart(3)}%  0장 ${(100 * mean(vals(m, (r) => (r.flip === 0 ? 1 : 0)))).toFixed(0).padStart(3)}%  상한 ${[...m.values()][0].capped === undefined ? '-' : (100 * mean(vals(m, (r) => r.capped))).toFixed(0) + '%'}  N${m.size}  | ${causes(m)}`;
}

function summarize(file) {
  const M = index(readRows(file));
  const BASE = process.env.BASE;
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n);
    const base = !BASE ? null : BASE.startsWith('best:') ? bestKey(K, (k) => k.includes(BASE.slice(5))) : K.has(BASE) ? BASE : null;
    console.log(`\n== ${n}장${base ? `   (기준 ${base})` : ''}`);
    for (const k of [...K.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      let s = line(k, K.get(k));
      if (base && base !== k) s += `   ÷기준 ${ci(pairOf(K.get(base), K.get(k)))}`;
      console.log(s);
    }
  }
}

function gateReport(file) {
  const M = index(readRows(file));
  let pass = true;
  const verdict = (ok, txt) => { console.log(`  ${ok ? '통과' : '실패'}  ${txt}`); return ok; };
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n);
    const g = (k) => K.get(k);
    if (!g('g|flick')) continue;
    console.log(`\n== ${n}장  사전 등록 칸 ${JSON.stringify(regCell(n))}`);
    const bf = bestKey(K, (k) => k.startsWith('g|fix|'));
    console.log(line('g|flick (사전 등록)', g('g|flick')));
    console.log(line(`${bf} (최선 고정)`, g(bf)));
    const p1 = pairOf(g(bf), g('g|flick'));
    const g1 = verdict(p1.lo > 1.05, `① 튕김 ÷ 최선 고정 = ${ci(p1)}  (하한 > 1.05)`);
    if (n >= 30) pass = pass && g1;
    const t0s = [0.05, 0.15, 0.25, 0.35, 0.45].map((t) => mean(vals(g(`g|t0|${t}`))));
    const mx = Math.max(...t0s), ai = t0s.indexOf(mx);
    const hill = ai > 0 && ai < 4 && t0s[0] <= 0.8 * mx && t0s[4] <= 0.8 * mx;
    const g2 = verdict(hill, `② 시작 시각 0.05/0.15/0.25/0.35/0.45 s = ${t0s.map((v) => v.toFixed(1)).join(' / ')}  (가운데 정점, 양끝 ≤ 0.8×정점 = 산)`);
    if (n >= 30) pass = pass && g2;
    const A = [3, 8, 20].map((a) => (a === 8 ? mean(vals(g('g|flick'))) : mean(vals(g(`g|A|${a}`)))));
    console.log(`  (정보) 폭 3/8/20° = ${A.map((v) => v.toFixed(1)).join(' / ')}  — 3·20 ÷ 8 = ${ci(pairOf(g('g|flick'), g('g|A|3')))} · ${ci(pairOf(g('g|flick'), g('g|A|20')))}`);
    const ab = bestKey(K, (k) => k.startsWith('g|abl|fix|'));
    const p3 = pairOf(g(ab), g('g|abl|flick'));
    const g3 = verdict(p3.lo > 1.05, `③ 절제(lip 힘 항 0)에서도: 튕김 ÷ 최선 고정(${ab}) = ${ci(p3)}  (이득이 기하×시간에서 나옴)`);
    if (n >= 30) pass = pass && g3;
    const p4 = pairOf(g('g|kinb'), g('g|kina'));
    console.log(`  (정보) 각도만 ÷ 높이만 = ${ci(p4)}  (1 근처 = 위 운동량은 주원인 아님; 1안 q0.55 에서는 1.23~1.41)`);
    console.log(`  (정보) 튕김 ÷ 각도만·높이만 = ${ci(pairOf(g('g|kina'), g('g|flick')))} · ${ci(pairOf(g('g|kinb'), g('g|flick')))}`);
  }
  console.log(`\n게이트(30장 이상 ①②③): ${pass ? '통과' : '실패'}`);
}

function releaseReport(file) {
  const M = index(readRows(file));
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n);
    if (!K.has('r|hold')) continue;
    console.log(`\n== ${n}장  (기준 r|hold = 숨 0.6 s 고정 길이, 사전 등록 칸 ${JSON.stringify(regCell(n))})`);
    for (const k of ['r|hold', 'r|top-pueok', 'r|top-cut', 'r|top-tail', 'r|top+.15-cut', 'r|top+.15-tail', 'r|fix-tail0.6']) if (K.has(k)) {
      let s = line(k, K.get(k));
      if (k !== 'r|hold') s += `   ÷hold ${ci(pairOf(K.get('r|hold'), K.get(k)))}`;
      console.log(s);
    }
  }
}

// ───────────────────────── 실행기 ─────────────────────────
function makeJobs(name) {
  const p = PRESETS[name];
  if (!p) throw new Error(`프리셋 없음: ${name} (list 참고)`);
  let J = [];
  p.gen(J); // SEEDS 는 gen 안의 SR() 이 처리
  if (process.env.NS) { const ok = new Set(process.env.NS.split(',').map(Number)); J = J.filter((j) => ok.has(j.n)); }
  J.sort((a, b) => b.n - a.n); // 큰 더미 먼저(일꾼 균형)
  return J;
}

async function runJobs(jobs, of, W) {
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const todo = jobs.filter((j) => !done.has(tag(j)));
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepmapWorker: 1 } });
      const next = () => { if (k < todo.length) wk.postMessage(todo[k++]); else wk.postMessage(null); };
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); fin++; if (fin % 100 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

async function verify() {
  const V1 = await import('../mockup/src/sim.js');
  await V1.initPhysics(); await SW.initPhysics();
  const snap = (t) => t.liveDiscs().map((d) => { const p = d.body.translation(), q = d.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; }).flat();
  let same = 0, tot = 0, maxd = 0;
  for (const n of [5, 12, 20]) for (const seed of [1, 2, 3]) {
    const mk = (Mo) => { if (Mo.setDiscH) Mo.setDiscH(0.11); const t = new Mo.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(); return t; };
    const a = mk(V1), b = mk(SW);
    const c = a.pileCenter();
    const aim = { x: c.x, y: a.columnTop() * 0.6, z: c.z + 1 };
    a.blow({ aim, dir: { x: 0, z: -1 }, power: 0.9 }); b.blow({ aim, dir: { x: 0, z: -1 }, power: 0.9 });
    a.runUntilSettled(); b.runUntilSettled();
    const sa = snap(a), sb = snap(b); tot++; if (sa.every((v, i) => v === sb[i])) same++;
    const a2 = mk(V1), b2 = mk(SW);
    const g = a2.blowLip({ aim: { x: c.x, y: 0.3, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.9, mouthY: 0.5 });
    const T = b2.T;
    b2.blowProg({ power: 0.9, dur: T.puffDuration, prog: (t) => ({ o: g.M, phi: g.phi, ux: 0, uz: -1, env: Math.sin(Math.min(1, t / T.puffDuration) * Math.PI) }) });
    a2.runUntilSettled(); b2.runUntilSettled();
    const s2a = snap(a2), s2b = snap(b2);
    for (let i = 0; i < s2a.length; i++) maxd = Math.max(maxd, Math.abs(s2a[i] - s2b[i]));
  }
  console.log(`기본 blow 비트 동일 ${same}/${tot}, blowLip vs 상수 prog 최대 위치차 ${maxd.toExponential(2)}`);
  if (same !== tot || maxd !== 0) process.exitCode = 1;
}

async function geo() {
  await SW.initPhysics();
  const M0 = { x: 0, y: GEO.ym, z: GEO.L }; // 더미 앞면 z = 0
  const hitAt = (a) => { const p = poseAt(a * D2R, 'c', GEO, M0); return p.o.y + Math.tan(p.phi) * (p.o.z - 0); };
  const PX = 150; // 엄지 px / 바람 자국 1 u(25 mm) — 2안 매핑
  console.log('고개 α° | 입 높이 u(mm) | 바람 자국(앞면) u(mm) | 엄지 px(150 px/u, 0° 기준)');
  for (const a of [0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 24]) { const p = poseAt(a * D2R, 'c', GEO, M0), h = hitAt(a); console.log(`  ${String(a).padStart(3)} | ${p.o.y.toFixed(2)} (${(p.o.y * 25).toFixed(0)}) | ${h.toFixed(2)} (${(h * 25).toFixed(0)}) | ${((h - hitAt(0)) * PX).toFixed(0)}`); }
  console.log('\n장수 | v1 정착 높이 u(mm) (시드 401~404) | 바람 축이 꼭대기를 넘는 α° | 엄지 px');
  for (const n of [5, 10, 20, 30, 40, 45]) {
    const tops = [401, 402, 403, 404].map((s) => { SW.setDiscH(0.11); const t = new SW.Table(s * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t.columnTop(); });
    const top = mean(tops);
    let lo = 0, hi = 60; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (hitAt(m) > top) hi = m; else lo = m; }
    console.log(`  ${String(n).padStart(3)} | ${top.toFixed(2)} (${(top * 25).toFixed(0)}) | ${top <= hitAt(0) ? '0 (입보다 낮음)' : hi.toFixed(1)} | ${Math.max(0, (top - hitAt(0)) * PX).toFixed(0)}`);
  }
}

async function track(ns) {
  await SW.initPhysics();
  const qang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
  const CFG = [['v1', 0.11, {}], ['thin(0.04,erp0.8,1/240)', 0.04, { erp: 0.8, dt: 1 / 240 }]];
  for (const [name, H, tune] of CFG) for (const n of ns) for (const [sn, sw] of Object.entries({ fixed: {}, flick: regCell(n).sweep })) {
    const kb = [], tj = []; let cap = 0, flips = 0;
    for (const seed of [301, 302, 303, 304]) {
      SW.setDiscH(H);
      const t = new SW.Table(seed * 7907 + n, tune);
      t.addPile(Array.from({ length: n }, (_, i) => i));
      t.settle(Math.round((600 * (1 / 120)) / t.T.dt));
      const br = breathOf('pueok', 0.6);
      t.blowProg({ prog: makeProg(t, { kin: 'c', sweep: sw, breath: br }), power: regCell(n).q, dur: br.dur });
      const per30 = Math.round(1 / 30 / t.T.dt);
      const view = new Map(t.liveDiscs().map((d) => [d.id, { p: { ...d.body.translation() }, q: { ...d.body.rotation() } }]));
      let bytes = 0, quiet = 0, steps = 0, judged = -1;
      const maxS = Math.round(5 / t.T.dt), minS = Math.round(0.6 / t.T.dt), lateS = Math.round(2.5 / t.T.dt), quietS = Math.round(0.2 / t.T.dt);
      while (steps < maxS) { // turn.js 스텝 판정(eps 0.08, 2.5 s 뒤 0.5, 상한 5 s)과 TrackChunker 규칙(위치 0.006·회전 0.012 넘으면 13 B)
        t.step(); steps++;
        const ms = t.maxSpeed();
        quiet = ms < (steps > lateS ? 0.5 : 0.08) ? quiet + 1 : 0;
        if (steps % per30 === 0) {
          let rows = 0;
          for (const d of t.liveDiscs()) { const v = view.get(d.id), p = d.body.translation(), q = d.body.rotation();
            if (!v || Math.abs(p.x - v.p.x) > 0.006 || Math.abs(p.y - v.p.y) > 0.006 || Math.abs(p.z - v.p.z) > 0.006 || qang(q, v.q) > 0.012) { rows++; view.set(d.id, { p: { ...p }, q: { ...q } }); } }
          bytes += 1 + rows * 13;
        }
        if (!t.puff && steps > minS && quiet >= quietS) { judged = steps * t.T.dt; break; }
      }
      if (judged < 0) { cap++; judged = 5; }
      kb.push(bytes / 1024); tj.push(judged);
      flips += t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d)).length;
    }
    console.log(`${name}\t${n}장\t${sn}\t궤적 평균 ${mean(kb).toFixed(1)} KB 최대 ${Math.max(...kb).toFixed(1)} KB\t판정 ${mean(tj).toFixed(2)} s (상한 ${cap}/4)\t뒤집힘 ${(flips / 4).toFixed(1)}`);
  }
}

async function bench(ns) {
  await SW.initPhysics();
  for (const [name, H, tune] of [['v1', 0.11, {}], ['thin(0.04,erp0.8,1/240)', 0.04, { erp: 0.8, dt: 1 / 240 }]]) for (const n of ns) {
    const frames = [];
    for (const seed of [301, 302, 303]) {
      SW.setDiscH(H);
      const t = new SW.Table(seed * 7907 + n, tune);
      t.addPile(Array.from({ length: n }, (_, i) => i));
      t.settle(Math.round((600 * (1 / 120)) / t.T.dt));
      const br = breathOf('pueok', 0.6);
      t.blowProg({ prog: makeProg(t, { kin: 'c', sweep: regCell(n).sweep, breath: br }), power: regCell(n).q, dur: br.dur });
      const per = Math.round(1 / 60 / t.T.dt);
      for (let f = 0; f < 180; f++) { const a = performance.now(); for (let k = 0; k < per; k++) t.step(); frames.push(performance.now() - a); if (!t.puff && f > 48 && t.isSettled()) break; }
    }
    frames.sort((a, b) => a - b);
    console.log(`${name}\t${n}장\t프레임(1/60 s) 평균 ${mean(frames).toFixed(2)} ms  p95 ${frames[Math.floor(frames.length * 0.95)].toFixed(2)}  최대 ${frames[frames.length - 1].toFixed(2)}`);
  }
}

// ───────────────────────── 진입 ─────────────────────────
// 다른 스크립트가 import 해도(예: tools/sweepcheck.mjs) CLI·일꾼 진입이 돌지 않게: 직접 실행했을 때만 CLI, 자기 일꾼일 때만 일꾼
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepmapWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shot(job), key: job.key }); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  const nsArg = (d) => (a.length ? a.map(Number) : d);
  if (cmd === 'verify') await verify();
  else if (cmd === 'list') for (const [k, p] of Object.entries(PRESETS)) { let c = '?'; try { c = makeJobs(k).length; } catch { /* skill 은 FROM 필요 */ } console.log(`${k.padEnd(8)} ${String(c).padStart(5)}샷  ${p.note}`); }
  else if (cmd === 'run') {
    const name = a[0], of = a[1] || `out_${name}.jsonl`, W = +(a[2] || 2);
    await runJobs(makeJobs(name), of, W);
    if (name === 'gate') gateReport(of); else if (name === 'release') releaseReport(of); else summarize(of);
  } else if (cmd === 'sum') summarize(a[0]);
  else if (cmd === 'gate') gateReport(a[0]);
  else if (cmd === 'release') releaseReport(a[0]);
  else if (cmd === 'pair') {
    const M = index(readRows(a[0]));
    for (const n of a.slice(3).map(Number)) { const K = M.get(n); if (!K?.get(a[1]) || !K.get(a[2])) { console.log(`${n}장: 키 없음`); continue; } console.log(`${n}장 ${a[2]} ÷ ${a[1]} = ${ci(pairOf(K.get(a[1]), K.get(a[2])))}`); }
  } else if (cmd === 'one') { await SW.initPhysics(); const r = shot({ trace: true, ...JSON.parse(a[0]) }); console.log(JSON.stringify({ ...r, series: undefined })); console.log('t\t바닥장°\t아래절반°\t위절반°\t숨'); for (const s of r.series) console.log(s.join('\t')); }
  else if (cmd === 'geo') await geo();
  else if (cmd === 'track') await track(nsArg([20, 30, 40, 45]));
  else if (cmd === 'bench') await bench(nsArg([30, 40, 45]));
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 26).join('\n'));
}

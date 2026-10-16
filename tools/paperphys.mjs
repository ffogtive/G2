// tools/paperphys.mjs — 종이 딱지 물리 선택지(탄성·가벼움·공기 감쇠) 측정만. 게임 기본값(sim.js TUNE)은 한 글자도 안 바꾼다.
//
// 🧭 가설(측정 전, 미검증): 재윤님 피드백 '두꺼운 플라스틱 같다 → 두꺼운 도화지처럼(절반 두께·탄성 조금 더)'.
//   (1) 탄성(restitution)은 Rapier 결합 규칙이 평균이라 딱지에만 주면 책상과는 절반만 먹는다 → 변형은 딱지·책상 모두에 같은 e 를 준다.
//       e 0.1~0.3 이면 정지·판정은 거의 그대로이고 원 밖이 조금 는다(튀어 굴러 나감).
//   (2) '가벼움'은 밀도만 바꾸면 거의 아무 일도 없다 — v1 바람 충격은 질량에 비례(k = s·m·dt)라 가속이 질량과 무관하다.
//       정직한 가벼움 = 같은 숨이 가벼운 딱지를 더 민다 = 바람 손잡이(lift·push·spin·tumble) ÷ 밀도 → 뒤집힘·원 밖이 크게 바뀐다(숨 규칙 재보정 필요).
//   (3) 공기 감쇠(linDamp·angDamp)를 조금 올리면 정지가 빨라지고 원 밖이 준다.
//   → 판가름 = 아래 표(쌓기 정지·흔들림·높이, 쏜 뒤 5초 안 정지, 고전 1~22장·쓸기판 30·40장 뒤집힘·원 밖, v1 대비 짝 차이).
//
// 변형 12개(≤ 12): e ∈ {0(v1), 0.1, 0.2, 0.3} × 밀도 {1.0, 0.7} × 공기 {v1, 조금} 의 줄인 격자 + 정직한 가벼움 2개.
//   e = 딱지 콜라이더 restitution(TUNE.restitution) + 책상 콜라이더 restitution(같은 값, 게임 코드에는 아직 없는 한 줄 — 여기서만 Table 하위 클래스로)
//   밀도 0.7 = TUNE.density(Rapier 질량만) · 0.7h = 그 위에 바람 충격을 밀도 1 질량으로(lift·push·spin·tumble ÷ 0.7) = 같은 숨에 1/0.7 배 가속
//   공기 조금 = linDamp 0.35 → 0.65 · angDamp 1.0 → 1.5 (1 mm 판지 5 cm 원판 납작 낙하 항력 ≈ 1 m/s 에서 0.1 g, 화면 시간 배율 3.21 → 약 +0.3/s)
// v1 줄은 게임 그대로의 Table(하위 클래스 없음). self 가 '값을 명시한 v1 하위 클래스(책상 e 0 포함) ≡ 게임 Table' 을 매 스텝 비트로 본다.
//
// 측정(시드 801~824, 작업 = (변형, 장수, 시드, …), Table 시드 = seed·7907 + n — react3 shotG·sweep planShot 과 같은 규칙):
//   drop  — 딱지 1장을 0.6~1.4 u(15~35 mm) 다섯 높이에서 책상에(납작·20° 기울여)·10장 더미 위에 떨어뜨림: 튀는 비(v 후/전)·튄 높이·정지까지 스텝(중앙값)
//   pile  — 1·2·3·4·6·8·10·12·15·18·22·30·40장 더미: settle() 판정 스텝(게임 규칙) · 엄격 정지(최대 속도 < 0.01 이 24스텝) ·
//           600스텝 뒤 높이·장당 간격·맨 아래 장 · 600→720스텝(1초) 최대 이동(흔들림)·최대 속도
//   game  — 고전 경로(react3 shotG = turn.js fire 기하, 초록 0.89 → resolveShot): eye 1~22장 × 조준 3 · low 6~22장 × 조준 2 ·
//           숨 규칙 0.6/1.2 × 2~22장 짝수(eye·0.82·옆 0). 변형 10개(r7a·e2r7a 뺌, 아래 GAME_VIDS). 판정 = PvP stepJudge·judgeResult. + 판정 뒤 60스텝(0.5초) 더 돌려 움직임·판정 바뀜
//   sweep — 쓸기판(sweep.js planShot 과 같은 호출 순서, 30장 q0.7 · 40장 q0.85): 문법 B 휙(t0 0.3, D(q)) · 버티기(A 0) · 퍽 · 꽉 휙(q 1.0)
//
// 명령 (일꾼 ≤ 2 — 다른 작업과 CPU 4코어 공유)
//   node tools/paperphys.mjs self                 비트 점검: 값 명시 v1 ≡ 게임 Table(고전·쓸기 매 스텝) · 쓸기 재구현 ≡ sweep.js planShot 해시 · 변형마다 v1 과 다름(음성 대조)
//   node tools/paperphys.mjs list                 변형·작업 수
//   node tools/paperphys.mjs run <part> [W=2]     part = drop|pile|game|sweep → tools/coresweep/data/paper/<part>.jsonl(이어 돌리기) → 다 차면 .jsonl.gz
//   node tools/paperphys.mjs report               표(v1 대비 짝 차이·시드 붓스트랩 95%)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Sim from '../mockup/src/sim.js';
import * as Rules from '../mockup/src/rules.js';
import * as G from '../mockup/src/sweep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'coresweep/data/paper');
const T0 = Sim.TUNE;

// ───────────────────────── 변형 ─────────────────────────
const AIR = { linDamp: 0.65, angDamp: 1.5 };
const honest = (rho) => ({ density: rho, lift: T0.lift / rho, push: T0.push / rho, spin: T0.spin / rho, tumble: T0.tumble / rho });
const mk = (e, rho, air, hon = false) => ({ e, rho, air, hon, tune: { ...(e ? { restitution: e } : {}), ...(rho !== 1 ? (hon ? honest(rho) : { density: rho }) : {}), ...(air ? AIR : {}) }, tableE: e || null });
export const VARIANTS = Object.freeze({
  v1: { e: 0, rho: 1, air: false, hon: false, tune: null, tableE: null }, // 게임 그대로
  e1: mk(0.1, 1, false),
  e2: mk(0.2, 1, false),
  e3: mk(0.3, 1, false),
  r7: mk(0, 0.7, false),
  air: mk(0, 1, true),
  e2a: mk(0.2, 1, true),
  e3a: mk(0.3, 1, true),
  r7a: mk(0, 0.7, true),
  e2r7a: mk(0.2, 0.7, true),
  r7h: mk(0, 0.7, false, true),
  e2r7ha: mk(0.2, 0.7, true, true),
});
export const VIDS = Object.keys(VARIANTS);
const vname = (v) => { const V = VARIANTS[v]; return v === 'v1' ? 'v1' : `e${V.e}${V.rho !== 1 ? ` ρ${V.rho}${V.hon ? 'h' : ''}` : ''}${V.air ? ' 공기' : ''}`; };

// 변형 → Table 클래스. v1 = 게임 Table 그대로. 그 밖 = tune 덮어쓰기(마지막에 얹음 → planShot 의 { lift } 보다 우선) + 책상 restitution
export function tableOf(V) {
  if (!V.tune && V.tableE == null) return Sim.Table;
  return class PaperTable extends Sim.Table {
    constructor(seed, tune = {}) {
      super(seed, { ...tune, ...(V.tune || {}) });
      if (V.tableE != null) this.world.forEachCollider((c) => { if (!c.parent()?.isDynamic()) c.setRestitution(V.tableE); });
    }
  };
}
// self 전용: v1 값을 전부 명시(책상 e 0 도 setRestitution(0) 으로 실제로 부름)
const V1X = { tune: { restitution: 0, density: 1, linDamp: T0.linDamp, angDamp: T0.angDamp, lift: T0.lift, push: T0.push, spin: T0.spin, tumble: T0.tumble }, tableE: 0 };

// ───────────────────────── 공용 ─────────────────────────
const SEEDS = Array.from({ length: 24 }, (_, i) => 801 + i);
const rng32 = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ids = (n) => Array.from({ length: n }, (_, i) => i);
const pos = (t) => t.liveDiscs().map((d) => { const p = d.body.translation(); return [p.x, p.y, p.z]; });
const maxY = (t) => { let m = -Infinity; for (const d of t.liveDiscs()) if (!d.off) m = Math.max(m, d.body.translation().y); return m; };
const maxDisp = (A, B) => { let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1], A[i][2] - B[i][2])); return m; };
const symDiff = (a, b) => { const A = new Set(a), B = new Set(b); let k = 0; for (const x of A) if (!B.has(x)) k++; for (const x of B) if (!A.has(x)) k++; return k; };
const r4 = (x) => +x.toFixed(4);
const POST = 60; // 판정 뒤 더 돌리는 스텝(0.5초): 판정 순간에 아직 움직이던 딱지가 결과를 바꾸는지

// 판정 루프 공용: step 콜백(after) · 최고 높이 · 숨 스텝 · 상한(5초) 여부 · 판정 뒤 POST 스텝 움직임
function judgeLoop(t, after) {
  const j = { n: 0, quiet: 0 };
  let k = 0, puffSteps = 0, peak = -Infinity;
  for (;;) { if (t.puff) puffSteps++; t.step(); after?.(t); k++; const y = maxY(t); if (y > peak) peak = y; if (t.stepJudge(j)) break; }
  const capped = j.quiet <= Sim.JUDGE.quietSteps; // 조용함으로 안 끝나고 5초 상한으로 끝남
  const R = t.judgeResult();
  const res = { flipIds: R.flipped.map((d) => d.id), outIds: R.outs.map((d) => d.id), off: t.liveDiscs().filter((d) => d.off).length, steps: k, puffSteps, capped, peak };
  const P0 = pos(t);
  let vmax = 0;
  for (let i = 0; i < POST; i++) { t.step(); vmax = Math.max(vmax, t.maxSpeed()); }
  const R2 = t.judgeResult();
  res.drift = maxDisp(P0, pos(t));
  res.vpost = vmax;
  res.dFlip = symDiff(res.flipIds, R2.flipped.map((d) => d.id));
  res.dOut = symDiff(res.outIds, R2.outs.map((d) => d.id));
  return res;
}

// ───────────────────────── 작업 ─────────────────────────
// 고전 경로(react3 shotG 와 같은 식): 표적 = turn.js fire() 기하, 숨 = 정답 × ratio → resolveShot
// 조준: react3 gsmall3 의 6칸(높이 0.6/0.82/0.95 × 옆 0/0.4) 중 3칸 — CPU 공유(다른 작업과 4코어)로 6칸 × 12변형이면 약 3시간이라 줄임
const EYE_AIMS = [[0.82, 0], [0.6, 0.4], [0.95, 0]];
const LOW_AIMS = [[0.82, 0], [0.6, 0.4]];
const RULE_R = [0.6, 1.2]; // 약함(≈0장) · 센 돌풍(≈0장, 원 밖)
// 고전 경로는 ρ0.7(그냥 밀도)을 공기와 겹친 두 변형(r7a·e2r7a)을 뺀다: 밀도만은 바람이 질량 비례라 숫자 잡음일 뿐(쌓기·쓸기판에서 확인) → r7 하나가 잡음 대조
export const GAME_VIDS = Object.freeze(VIDS.filter((v) => v !== 'r7a' && v !== 'e2r7a'));
const shotRng = (job) => rng32((Math.imul(job.seed, 7919) ^ Math.imul(job.n, 104729) ^ Math.round(job.ratio * 1000)) >>> 0);
export function gameShot(job, V = VARIANTS[job.v], { trace } = {}) {
  const TC = tableOf(V);
  const t = new TC(job.seed * 7907 + job.n);
  t.addPile(ids(job.n));
  const settleK = t.settle();
  const n = t.liveDiscs().length, top = t.columnTop();
  const ratio = job.ratio ?? 0.89;
  const rng = ratio > 1 ? shotRng({ ...job, ratio }) : () => { throw new Error('초록·약한 숨은 난수를 안 씀'); };
  const s = Rules.resolveShot({ h: top * job.hf, lat: job.lat, power: Rules.sweetHiFor(n) * ratio }, n, top, rng, 1);
  const D = { x: 0, z: -1 }, side = { x: -D.z, z: D.x }, c = t.pileCenter();
  const lat = clamp(s.lat || 0, -0.95 * Sim.DISC_R, 0.95 * Sim.DISC_R), back = Math.sqrt(Sim.DISC_R * Sim.DISC_R - lat * lat);
  const aim = { x: c.x - D.x * back + side.x * lat, y: s.h, z: c.z - D.z * back + side.z * lat };
  t.blow({ aim, dir: { x: D.x, z: D.z }, power: s.power, blast: s.blast || 0, ...(job.pose === 'low' ? { mouthY: Rules.mouthYFor('low') } : {}) });
  const r = judgeLoop(t, trace);
  return { part: 'game', v: job.v, n: job.n, seed: job.seed, pose: job.pose, hf: job.hf, lat: job.lat, ratio, settleK, top: r4(top), flip: r.flipIds.length, out: r.outIds.length, off: r.off, steps: r.steps, puffSteps: r.puffSteps, capped: r.capped ? 1 : 0, peak: r4(r.peak), drift: r4(r.drift), vpost: r4(r.vpost), dFlip: r.dFlip, dOut: r.dOut, ...(trace ? { _t: t } : {}) };
}
// 쓸기판: sweep.js planShot 과 같은 호출 순서(new Table(practiceTableSeed, { lift }) → addPile → settle(600) → resolvePlan → SweepCtl → blowProg → step·after·judge)
export const SWEEP_PLANS = {
  flick: (q) => ({ q, plan: { A: G.GB.A, w: G.GB.w, t0: 0.3, D: G.gbD(q) } }), // 문법 B: 놓고 0.3 s 에 휙(= flickShot ts 0.3)
  hold: (q) => ({ q, plan: { A: 0, w: G.GB.w, t0: 0, D: G.gbD(q) } }), // 문법 B 안 휙(퍼—만)
  puck: (q) => ({ q, plan: { kind: 'puck' } }), // 퍽 0.131 s
  hard: () => ({ q: 1.0, plan: { A: G.GB.A, w: G.GB.w, t0: 0.3, D: G.gbD(1.0) } }), // 꽉 휙
};
const SWEEP_Q = { 30: 0.7, 40: 0.85 }; // 측정 기준 칸(sweepgame REF·practice)과 같은 세기
export function sweepShot(job, V = VARIANTS[job.v]) {
  const TC = tableOf(V);
  const { q, plan } = SWEEP_PLANS[job.plan](SWEEP_Q[job.N]);
  const t = new TC(G.practiceTableSeed(job.N, job.seed), { lift: 519.59 });
  t.addPile(ids(job.N));
  const settleK = t.settle(600);
  const top = t.columnTop();
  const pl = plan.kind === 'puck' ? null : G.resolvePlan(plan, top);
  const ctl = pl ? new G.SweepCtl(t, { mode: 'plan', plan: pl }) : new G.SweepCtl(t, { mode: 'puck' });
  ctl.attach(t.blowProg({ prog: ctl.prog, power: q, dur: ctl.durCap }));
  const r = judgeLoop(t, (tt) => ctl.after(tt));
  // 해시는 판정 순간 자세(planShot 과 같은 뜻)여야 하므로 judgeLoop 안 POST 전에 못 잡는다 → self 는 POST 0 경로(sweepHash)로 따로 본다
  return { part: 'sweep', v: job.v, N: job.N, seed: job.seed, plan: job.plan, q, settleK, top: r4(top), flip: r.flipIds.length, out: r.outIds.length, off: r.off, steps: r.steps, capped: r.capped ? 1 : 0, peak: r4(r.peak), tTop: ctl.rec.tTop, drift: r4(r.drift), vpost: r4(r.vpost), dFlip: r.dFlip, dOut: r.dOut };
}
// self 전용: 위 sweepShot 과 같은 길에서 판정 순간 해시(POST 없음)
function sweepHash(job, V) {
  const TC = tableOf(V);
  const { q, plan } = SWEEP_PLANS[job.plan](SWEEP_Q[job.N]);
  const t = new TC(G.practiceTableSeed(job.N, job.seed), { lift: 519.59 });
  t.addPile(ids(job.N));
  t.settle(600);
  const pl = plan.kind === 'puck' ? null : G.resolvePlan(plan, t.columnTop());
  const ctl = pl ? new G.SweepCtl(t, { mode: 'plan', plan: pl }) : new G.SweepCtl(t, { mode: 'puck' });
  ctl.attach(t.blowProg({ prog: ctl.prog, power: q, dur: ctl.durCap }));
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do { t.step(); ctl.after(t); steps++; } while (!t.stepJudge(j));
  const R = t.judgeResult();
  return { steps, flips: R.flipped.length, outs: R.outs.length, hash: G.poseHash(t) };
}
// 쌓기: settle() 규칙(61스텝 뒤 최대 속도 < 0.06) · 엄격 정지(< 0.01 이 24스텝 연속) · 600스텝 자세 · 600→720 흔들림
export const PILE_N = [1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 22, 30, 40];
export function pileRun(job, V = VARIANTS[job.v]) {
  const TC = tableOf(V);
  const t = new TC(job.seed * 7907 + job.n);
  t.addPile(ids(job.n));
  let settleK = -1, stillK = -1, quiet = 0, P600 = null, top600 = 0, bot600 = 0, jitV = 0;
  for (let k = 0; k < 720; k++) {
    t.step();
    const ms = t.maxSpeed();
    if (settleK < 0 && k > 60 && ms < 0.06) settleK = k;
    quiet = ms < 0.01 ? quiet + 1 : 0;
    if (stillK < 0 && quiet >= 24) stillK = k - 23;
    if (k === 599) { P600 = pos(t); top600 = t.columnTop(); bot600 = Math.min(...P600.map((p) => p[1])); }
    if (k >= 600) jitV = Math.max(jitV, ms);
  }
  const jit = maxDisp(P600, pos(t));
  const n = job.n;
  return { part: 'pile', v: job.v, n, seed: job.seed, settleK, stillK, top: r4(top600), gap: n > 1 ? r4((top600 - Sim.DISC_H) / (n - 1)) : null, bot: r4(bot600), jit: +jit.toExponential(3), jitV: +jitV.toExponential(3) };
}
// 낙하: 딱지 1장을 책상에(납작·20°) 또는 10장 더미 꼭대기 위에. 높이 0.6~1.4 u 다섯 번(충돌 순간 스텝 위상에 따라 무른 접촉의 튐이 흔들려서) → 중앙값
const DROP_CASES = { flat: { tilt: 0, pile: 0 }, tilt20: { tilt: 20, pile: 0 }, pile10: { tilt: 0, pile: 10 } };
const DROP_H = [0.6, 0.8, 1.0, 1.2, 1.4];
function dropOnce(TC, C, seed, h) {
  const t = new TC(seed);
  if (C.pile) { t.addPile(ids(C.pile)); t.settle(); }
  const base = C.pile ? t.columnTop() : 0;
  t.addPile([99]);
  const d = t.discs[t.discs.length - 1], a = (C.tilt * Math.PI) / 180;
  d.body.setTranslation({ x: 0, y: base + h + Sim.DISC_H / 2, z: 0 }, true);
  d.body.setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }, true);
  let vin = 0, vout = 0, hit = false, k0 = -1, yMax = -Infinity, still = -1, quiet = 0, bounces = 0, lastVy = 0;
  for (let k = 0; k < 600; k++) {
    t.step();
    const v = d.body.linvel(), p = d.body.translation();
    if (!hit) { vin = Math.max(vin, -v.y); if (v.y > -0.5 && vin > 1) { hit = true; k0 = k; } }
    else if (k < k0 + 90) { vout = Math.max(vout, v.y); yMax = Math.max(yMax, p.y); }
    if (lastVy < -0.2 && v.y > 0.05) bounces++;
    lastVy = v.y;
    quiet = hit && t.maxSpeed() < 0.01 ? quiet + 1 : 0;
    if (still < 0 && quiet >= 24) still = k - 23 - k0;
  }
  const yRest = d.body.translation().y; // 튄 높이 = 닿은 뒤 0.75초(90스텝) 안 최고 − 마지막 쉼 자리(무른 접촉 눌림 회복은 쉼 자리 아래라 안 셈)
  return { vin, ratio: vout / vin, hUp: Math.max(0, yMax - yRest), bounces, still };
}
export function dropRun(job, V = VARIANTS[job.v]) {
  const TC = tableOf(V), C = DROP_CASES[job.c];
  const R = DROP_H.map((h) => dropOnce(TC, C, job.seed, h));
  const med = (k) => quant(R.map((r) => r[k]), 0.5);
  return { part: 'drop', v: job.v, c: job.c, seed: job.seed, ratio: r4(med('ratio')), hUp: r4(med('hUp')), bounces: med('bounces'), still: med('still'), all: R.map((r) => [r4(r.vin), r4(r.ratio), r4(r.hUp), r.bounces, r.still]) };
}

export function jobsOf(part, vids = VIDS) {
  const J = [];
  for (const v of vids) {
    if (part === 'drop') for (const c of Object.keys(DROP_CASES)) J.push({ part, v, c, seed: 801, cost: 1 });
    if (part === 'pile') for (const s of SEEDS) for (const n of PILE_N) J.push({ part, v, n, seed: s, cost: n });
    if (part === 'game' && GAME_VIDS.includes(v)) for (const s of SEEDS) {
      for (let n = 1; n <= 22; n++) for (const [hf, lat] of EYE_AIMS) J.push({ part, v, n, seed: s, pose: 'eye', hf, lat, cost: n });
      for (let n = Rules.LOW_POSE_MIN_N; n <= 22; n++) for (const [hf, lat] of LOW_AIMS) J.push({ part, v, n, seed: s, pose: 'low', hf, lat, cost: n });
      for (let n = 2; n <= 22; n += 2) for (const ratio of RULE_R) J.push({ part, v, n, seed: s, pose: 'eye', hf: 0.82, lat: 0, ratio, cost: n });
    }
    if (part === 'sweep') for (const s of SEEDS) for (const N of [30, 40]) for (const plan of Object.keys(SWEEP_PLANS)) J.push({ part, v, N, seed: s, plan, cost: N * 2 });
  }
  return J;
}
const keyOf = (j) => [j.part, j.v, j.n ?? j.N ?? '', j.seed, j.c ?? '', j.pose ?? '', j.hf ?? '', j.lat ?? '', j.ratio ?? '', j.plan ?? ''].join('|');
function runOne(job) {
  if (job.part === 'game') return gameShot(job);
  if (job.part === 'sweep') return sweepShot(job);
  if (job.part === 'pile') return pileRun(job);
  if (job.part === 'drop') return dropRun(job);
  throw new Error('part ' + job.part);
}
const rowKey = (r) => keyOf({ ...r, ratio: r.part === 'game' && r.ratio !== 0.89 ? r.ratio : undefined });
const jobKey = (j) => keyOf(j);

// ───────────────────────── 돌리기 (일꾼 ≤ 2) ─────────────────────────
async function run(part, W) {
  W = Math.min(2, Math.max(1, W | 0));
  const jobs = jobsOf(part);
  if (!jobs.length) throw new Error('part: drop|pile|game|sweep');
  mkdirSync(DATA, { recursive: true });
  const of = join(DATA, `${part}.jsonl`), gz = of + '.gz';
  if (existsSync(gz)) { console.error(`${gz} 이미 있음 — 다시 재려면 지우고 돌릴 것`); return; }
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(rowKey(JSON.parse(l)));
  const todo = jobs.filter((j) => !done.has(jobKey(j))).sort((a, b) => b.cost - a.cost);
  console.error(`${part}: 작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  if (todo.length) await new Promise((res) => {
    let alive = W;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { paperWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 500 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}개 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  // 다 찼으면 정렬해 gz 로 굳힘(작업 순서와 무관한 바이트)
  const rows = readFileSync(of, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const have = new Map(rows.map((r) => [rowKey(r), r]));
  const missing = jobs.filter((j) => !have.has(jobKey(j)));
  if (missing.length) { console.error(`빠진 줄 ${missing.length} — 다시 run`); return; }
  const order = jobs.map((j) => have.get(jobKey(j)));
  writeFileSync(gz, gzipSync(order.map((r) => JSON.stringify(r)).join('\n') + '\n', { level: 9 }));
  unlinkSync(of);
  console.error(`→ ${gz} (${order.length}줄)`);
}

// ───────────────────────── self: 비트 점검 ─────────────────────────
const snap = (t) => t.liveDiscs().flatMap((d) => { const p = d.body.translation(), q = d.body.rotation(), v = d.body.linvel(), w = d.body.angvel(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z, d.off ? 1 : 0]; });
const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
async function self() {
  let FAIL = 0;
  const ok = (name, c, info = '') => { if (!c) FAIL++; console.log(`  ${c ? '맞음' : '틀림'}  ${name}${info ? ' — ' + info : ''}`); };
  // (1) 값 명시 v1 하위 클래스(책상 setRestitution(0) 포함) ≡ 게임 Table: 고전 경로 매 스텝(위치·회전·속도·off) + 판정
  const cases = [{ n: 1, seed: 801, pose: 'eye', hf: 0.82, lat: 0 }, { n: 7, seed: 802, pose: 'eye', hf: 0.6, lat: 0.4 }, { n: 15, seed: 803, pose: 'low', hf: 0.95, lat: 0 }, { n: 22, seed: 804, pose: 'eye', hf: 0.82, lat: 0, ratio: 1.2 }, { n: 12, seed: 805, pose: 'eye', hf: 0.82, lat: 0, ratio: 0.6 }];
  let g1 = 0;
  for (const c of cases) {
    const trA = [], trB = [];
    const a = gameShot({ ...c, v: 'v1' }, VARIANTS.v1, { trace: (t) => trA.push(snap(t)) });
    const b = gameShot({ ...c, v: 'v1' }, V1X, { trace: (t) => trB.push(snap(t)) });
    const stepOk = trA.length === trB.length && trA.every((x, i) => same(x, trB[i]));
    const { _t: ta, ...ra } = a, { _t: tb, ...rb } = b;
    if (stepOk && JSON.stringify(ra) === JSON.stringify(rb) && same(snap(ta), snap(tb))) g1++; else console.log('   다름', c);
  }
  ok('값 명시 v1(e 0·책상 e 0·밀도 1·감쇠·바람 손잡이) ≡ 게임 Table — 고전 경로 매 스텝 위치·회전·속도·off · 판정 · 판정 뒤 60스텝', g1 === cases.length, `${g1}/${cases.length}`);
  // (2) 쓸기 재구현 ≡ sweep.js planShot(게임 Table) 해시, 그리고 값 명시 v1 도 같은 해시
  let s1 = 0, sT = 0;
  for (const N of [30, 40]) for (const plan of Object.keys(SWEEP_PLANS)) {
    const job = { N, seed: 801 + sT, plan };
    const { q, plan: pl } = SWEEP_PLANS[plan](SWEEP_Q[N]);
    const ref = G.planShot(Sim.Table, { N, seed: job.seed, q, plan: pl });
    const a = sweepHash(job, VARIANTS.v1), b = sweepHash(job, V1X);
    sT++;
    if (a.hash === ref.hash && b.hash === ref.hash && a.steps === ref.steps && a.flips === ref.flips && a.outs === ref.outs) s1++; else console.log('   다름', job, ref.hash, a.hash, b.hash);
  }
  ok('쓸기판 재구현(v1 · 값 명시 v1) ≡ sweep.js planShot 해시·스텝·뒤집힘·원 밖 (30·40장 × 휙·버티기·퍽·꽉)', s1 === sT, `${s1}/${sT}`);
  // (3) sweepShot(POST 포함)의 판정 순간 결과 = 해시 경로와 같은 뒤집힘·원 밖·스텝
  { const job = { v: 'v1', N: 30, seed: 801, plan: 'flick' }; const a = sweepShot(job), b = sweepHash(job, VARIANTS.v1); ok('sweepShot 판정 값 = 해시 경로(같은 스텝·뒤집힘·원 밖)', a.steps === b.steps && a.flip === b.flips && a.out === b.outs, `${a.steps}/${a.flip}/${a.out}`); }
  // (4) 음성 대조: v1 이 아닌 변형은 모두 v1 과 어딘가 달라야(숫자가 실제로 먹힘). 고전 15장 한 샷 매 스텝
  const diff = [];
  for (const v of VIDS.filter((x) => x !== 'v1')) {
    const trA = [], trB = [];
    gameShot({ n: 15, seed: 806, pose: 'eye', hf: 0.82, lat: 0, v: 'v1' }, VARIANTS.v1, { trace: (t) => trA.push(snap(t)) });
    gameShot({ n: 15, seed: 806, pose: 'eye', hf: 0.82, lat: 0, v }, VARIANTS[v], { trace: (t) => trB.push(snap(t)) });
    const firstDiff = trA.findIndex((x, i) => !trB[i] || !same(x, trB[i]));
    if (firstDiff < 0 && trA.length === trB.length) diff.push(v);
  }
  ok('음성 대조: v1 이 아닌 변형 11개 모두 v1 과 다름(같으면 손잡이가 안 먹은 것)', diff.length === 0, diff.length ? `같음 ${diff.join(',')}` : '11/11 다름');
  // (5) 책상 restitution 이 실제로 들어감 + 결합 규칙(평균) 확인: 딱지만 e 0.3 이면 책상과 튀는 비 ≈ 0.15, 책상까지면 ≈ 0.3
  const dOnly = dropRun({ v: 'x', c: 'flat', seed: 801 }, { tune: { restitution: 0.3 }, tableE: null });
  const dBoth = dropRun({ v: 'x', c: 'flat', seed: 801 }, VARIANTS.e3);
  ok('결합 규칙 평균: 딱지만 e 0.3 의 책상 튀는 비 ≈ 딱지+책상 e 0.3 의 절반(0.35~0.65배), 둘 다 e 0 이면 ≈ 0', dOnly.ratio > 0.35 * dBoth.ratio && dOnly.ratio < 0.65 * dBoth.ratio && dropRun({ v: 'v1', c: 'flat', seed: 801 }).ratio < 0.02, `딱지만 ${dOnly.ratio} · 둘 다 ${dBoth.ratio}`);
  // (7) 원자료 재현: 커밋된 줄 몇 개를 다시 돌려 바이트 비교(변형마다 고전 1줄 · 쓸기판 1줄 · 쌓기 1줄 · 낙하 1줄 — 없으면 건너뜀)
  { let k = 0, tot = 0; const bad = [];
    const pick = (rows, pred) => VIDS.map((v) => rows.find((r) => r.v === v && pred(r))).filter(Boolean);
    const strip = (r) => { const { _t, ...x } = r; return JSON.stringify(x); };
    const chk = (row, fn) => { tot++; const again = fn(row); if (strip(again) === JSON.stringify(row)) k++; else bad.push(`${row.part}|${row.v}|${row.n ?? row.N ?? row.c}|${row.seed}`); };
    for (const r of pick(readPart('game'), (r) => r.n <= 6 && r.seed === 803)) chk(r, (x) => gameShot({ ...x, ratio: x.ratio === 0.89 ? undefined : x.ratio }));
    for (const r of pick(readPart('sweep'), (r) => r.N === 30 && r.seed === 802 && r.plan === 'flick')) chk(r, (x) => sweepShot(x));
    for (const r of pick(readPart('pile'), (r) => r.n === 8 && r.seed === 804)) chk(r, (x) => pileRun(x));
    for (const r of pick(readPart('drop'), (r) => r.c === 'tilt20')) chk(r, (x) => dropRun(x));
    ok('원자료 재현: 저장된 줄(고전·쓸기판·쌓기·낙하, 변형마다) = 다시 돌린 줄 바이트 동일', tot === 0 || k === tot, tot ? `${k}/${tot}${bad.length ? ' 다름 ' + bad.join(', ') : ''}` : '원자료 없음(건너뜀)'); }
  // (6) 게임 기본값 무변경: TUNE 에 이 도구가 쓰는 키의 v1 값
  ok('sim.js TUNE 기본값 그대로(restitution 0 · density 1 · linDamp 0.35 · angDamp 1)', T0.restitution === 0 && T0.density === 1 && T0.linDamp === 0.35 && T0.angDamp === 1);
  console.log(FAIL ? `틀림 ${FAIL}` : '모두 맞음');
  if (FAIL) process.exitCode = 1;
}

// ───────────────────────── report ─────────────────────────
const readPart = (part) => {
  const gz = join(DATA, `${part}.jsonl.gz`), pl = join(DATA, `${part}.jsonl`);
  const txt = existsSync(gz) ? gunzipSync(readFileSync(gz)).toString('utf8') : existsSync(pl) ? readFileSync(pl, 'utf8') : '';
  return txt.split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function quant(a, q) { const b = [...a].sort((x, y) => x - y); if (!b.length) return NaN; const i = (b.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return b[lo] + (b[hi] - b[lo]) * (i - lo); }
// 짝 붓스트랩: 시드마다 (변형 평균 − v1 평균) → 시드 복원 추출 2000회 → 95%
function pairedCI(rows, v, sel, val, B = 2000) {
  const per = (vv) => { const m = new Map(); for (const r of rows) if (r.v === vv && sel(r)) { if (!m.has(r.seed)) m.set(r.seed, []); m.get(r.seed).push(val(r)); } return m; };
  const A = per(v), Z = per('v1');
  const seeds = [...Z.keys()].filter((s) => A.has(s)).sort((a, b) => a - b);
  const d = seeds.map((s) => mean(A.get(s)) - mean(Z.get(s)));
  const rnd = rng32(20261016);
  const bs = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < d.length; i++) s += d[Math.floor(rnd() * d.length)]; bs.push(s / d.length); }
  return { d: mean(d), lo: quant(bs, 0.025), hi: quant(bs, 0.975), nSeeds: d.length };
}
const f = (x, k = 2) => (Number.isFinite(x) ? x.toFixed(k) : '—');
const sg = (x, k = 2) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(k) : '—');
const ci = (c, k = 2) => `${sg(c.d, k)} [${sg(c.lo, k)}, ${sg(c.hi, k)}]${c.lo > 0 || c.hi < 0 ? '*' : ''}`;
function report() {
  const drop = readPart('drop'), pile = readPart('pile'), game = readPart('game'), sweep = readPart('sweep');
  const vs = VIDS.filter((v) => [drop, pile, game, sweep].some((R) => R.some((r) => r.v === v)));
  console.log('# 종이 딱지 물리 선택지 — v1 대비 (시드 801~824, * = 95% 짝 구간이 0 을 안 넘음)');
  console.log('변형: ' + vs.map((v) => `${v}=${vname(v)}`).join(' · '));
  if (drop.length) {
    console.log('\n## 낙하 (0.6~1.4 u = 15~35 mm 다섯 높이의 중앙값. 튀는 비 = 위로 튄 최고 속도 ÷ 떨어진 속도 · 튄 높이 u(쉼 자리 위) · 정지 = 닿은 뒤 엄격 정지 스텝)');
    console.log('변형      | 책상 납작 비·높이·정지 | 책상 20° 비·높이·정지 | 10장 위 비·높이·정지');
    for (const v of vs) { const g = (c) => drop.find((r) => r.v === v && r.c === c); const s = (r) => (r ? `${f(r.ratio)} · ${f(r.hUp, 3)} · ${r.still}` : '—'); console.log(`${vname(v).padEnd(9)} | ${s(g('flat'))} | ${s(g('tilt20'))} | ${s(g('pile10'))}`); }
  }
  if (pile.length) {
    // 한 줄 요약: 22·40장 settle 판정 스텝 중앙 · 40장 엄격 정지 중앙[최대] · 엄격 정지 못함(720스텝 안) 수 · 30·40장 높이(v1 대비 %) · 600→720 흔들림·속도 최대(모든 장수)
    console.log('\n## 쌓기 정지 (13장수 × 24시드) — settle 판정 스텝 중앙(22·40장) · 엄격 정지(속도 < 0.01 이 24스텝) 40장 중앙[최대] · 못함 · 30·40장 높이 u(v1 대비) · 600→720스텝 최대 이동·최대 속도');
    const hv = (n) => mean(pile.filter((r) => r.v === 'v1' && r.n === n).map((r) => r.top));
    for (const v of vs) {
      const R = (n) => pile.filter((r) => r.v === v && (n == null || r.n === n));
      if (!R().length) continue;
      const st40 = R(40).map((r) => (r.stillK < 0 ? Infinity : r.stillK));
      const h = (n) => mean(R(n).map((r) => r.top));
      console.log(`${vname(v).padEnd(14)} settle ${quant(R(22).map((r) => r.settleK), 0.5)}·${quant(R(40).map((r) => r.settleK), 0.5)} | 엄격 40장 ${quant(st40, 0.5)}[${Math.max(...st40)}] | 못함 ${R().filter((r) => r.stillK < 0).length}/${R().length} | 높이 30장 ${f(h(30), 3)}(${sg((100 * (h(30) - hv(30))) / hv(30), 1)}%) 40장 ${f(h(40), 3)}(${sg((100 * (h(40) - hv(40))) / hv(40), 1)}%) | 흔들림 ${Math.max(...R().map((r) => r.jit)).toExponential(1)} · 속도 ${Math.max(...R().map((r) => r.jitV)).toExponential(1)}`);
    }
    if (process.env.DETAIL) {
      console.log('변형      | 장수 | settle 중앙[최대] | 엄격 정지 중앙[최대·못함] | 높이 | 간격 | 흔들림 최대 | 속도 최대');
      for (const v of vs) for (const n of PILE_N) {
        const R = pile.filter((r) => r.v === v && r.n === n);
        if (!R.length) continue;
        const st = R.map((r) => (r.stillK < 0 ? Infinity : r.stillK));
        console.log(`${vname(v).padEnd(9)} | ${String(n).padStart(2)} | ${quant(R.map((r) => r.settleK), 0.5)} [${Math.max(...R.map((r) => r.settleK))}] | ${quant(st, 0.5)} [${Math.max(...st.filter(Number.isFinite), 0)}·${st.filter((x) => !Number.isFinite(x)).length}] | ${f(mean(R.map((r) => r.top)), 3)} | ${n > 1 ? f(mean(R.map((r) => r.gap)), 4) : '—'} | ${Math.max(...R.map((r) => r.jit)).toExponential(1)} | ${Math.max(...R.map((r) => r.jitV)).toExponential(1)}`);
      }
    }
  }
  const bands = [['eye 1~4', (r) => r.pose === 'eye' && r.ratio === 0.89 && r.n <= 4], ['eye 5~12', (r) => r.pose === 'eye' && r.ratio === 0.89 && r.n >= 5 && r.n <= 12], ['eye 13~22', (r) => r.pose === 'eye' && r.ratio === 0.89 && r.n >= 13], ['low 6~22', (r) => r.pose === 'low']];
  if (game.length) {
    console.log('\n## 고전 경로 (초록 0.89 · 조준 eye 3·low 2 · 변형 10 · PvP stepJudge 판정) — 샷당 뒤집힘 Δ[95%] · 원 밖(장당 %) Δ · 책상 밖 % · 판정 스텝 중앙/p95 · 5초 상한 % · 판정 뒤 0.5초에 판정 바뀜 %');
    for (const [name, sel] of bands) {
      console.log(`-- ${name}`);
      for (const v of vs) {
        const R = game.filter((r) => r.v === v && sel(r));
        if (!R.length) continue;
        const fl = mean(R.map((r) => r.flip)), outP = (100 * R.reduce((s, r) => s + r.out, 0)) / R.reduce((s, r) => s + r.n, 0), offP = (100 * R.reduce((s, r) => s + r.off, 0)) / R.reduce((s, r) => s + r.n, 0);
        const cF = v === 'v1' ? null : pairedCI(game, v, sel, (r) => r.flip), cO = v === 'v1' ? null : pairedCI(game, v, sel, (r) => (100 * r.out) / r.n);
        console.log(`${vname(v).padEnd(14)} 뒤집힘 ${f(fl)}${cF ? ' ' + ci(cF) : ''} | 원 밖 ${f(outP, 1)}%${cO ? ' ' + ci(cO, 1) : ''} | 책상 밖 ${f(offP, 2)}% | 스텝 ${Math.round(quant(R.map((r) => r.steps), 0.5))}/${Math.round(quant(R.map((r) => r.steps), 0.95))} | 상한 ${f((100 * R.filter((r) => r.capped).length) / R.length, 1)}% | 바뀜 ${f((100 * R.filter((r) => r.dFlip || r.dOut).length) / R.length, 1)}% | 최고 ${f(quant(R.map((r) => r.peak), 0.5), 2)}`);
      }
    }
    console.log('\n## 숨 규칙 (eye · 0.82 · 옆 0 · 2~22장 짝수) — 샷당 뒤집힘 · 원 밖 %');
    for (const ratio of RULE_R) {
      const sel = (r) => r.ratio === ratio;
      console.log(`-- 비율 ${ratio}`);
      for (const v of vs) {
        const R = game.filter((r) => r.v === v && sel(r));
        if (!R.length) continue;
        const outP = (100 * R.reduce((s, r) => s + r.out, 0)) / R.reduce((s, r) => s + r.n, 0);
        const cF = v === 'v1' ? null : pairedCI(game, v, sel, (r) => r.flip), cO = v === 'v1' ? null : pairedCI(game, v, sel, (r) => (100 * r.out) / r.n);
        console.log(`${vname(v).padEnd(14)} 뒤집힘 ${f(mean(R.map((r) => r.flip)))}${cF ? ' ' + ci(cF) : ''} | 원 밖 ${f(outP, 1)}%${cO ? ' ' + ci(cO, 1) : ''} | 상한 ${f((100 * R.filter((r) => r.capped).length) / R.length, 1)}%`);
      }
    }
  }
  if (sweep.length) {
    console.log('\n## 쓸기판 (planShot 순서 · 30장 q0.7 · 40장 q0.85 · 꽉 = q1.0) — 샷당 뒤집힘 Δ[95%] · 원 밖 장 Δ · 판정 스텝 중앙/p95 · 5초 상한 % · 판정 바뀜 %');
    for (const N of [30, 40]) for (const plan of Object.keys(SWEEP_PLANS)) {
      const sel = (r) => r.N === N && r.plan === plan;
      console.log(`-- ${N}장 ${plan}`);
      for (const v of vs) {
        const R = sweep.filter((r) => r.v === v && sel(r));
        if (!R.length) continue;
        const cF = v === 'v1' ? null : pairedCI(sweep, v, sel, (r) => r.flip), cO = v === 'v1' ? null : pairedCI(sweep, v, sel, (r) => r.out);
        console.log(`${vname(v).padEnd(14)} 뒤집힘 ${f(mean(R.map((r) => r.flip)))}${cF ? ' ' + ci(cF) : ''} | 원 밖 ${f(mean(R.map((r) => r.out)))}${cO ? ' ' + ci(cO) : ''} | 스텝 ${Math.round(quant(R.map((r) => r.steps), 0.5))}/${Math.round(quant(R.map((r) => r.steps), 0.95))} | 상한 ${f((100 * R.filter((r) => r.capped).length) / R.length, 1)}% | 바뀜 ${f((100 * R.filter((r) => r.dFlip || r.dOut).length) / R.length, 1)}%`);
      }
    }
  }
  // 한눈에: 변형마다 한 줄 — 고전 초록(eye 1~22 · low) 샷당 뒤집힘·원 밖(장당 %p) Δ · 숨 규칙 1.2 원 밖 Δ · 쓸기판 40장 휙·버티기 뒤집힘 Δ · 원 밖 Δ · 5초 상한·판정 바뀜(전체) · 낙하 튀는 비
  if (game.length || sweep.length) {
    console.log('\n## 한눈에 (v1 대비 짝 차이, * = 95% 구간이 0 을 안 넘음)');
    const all = (r) => r.ratio === 0.89;
    for (const v of vs.filter((x) => x !== 'v1')) {
      const parts = [];
      if (game.some((r) => r.v === v)) {
        const ge = (r) => all(r) && r.pose === 'eye', gl = (r) => r.pose === 'low', b12 = (r) => r.ratio === 1.2;
        parts.push(`고전 eye 뒤집힘 ${ci(pairedCI(game, v, ge, (r) => r.flip))} · 원 밖 ${ci(pairedCI(game, v, ge, (r) => (100 * r.out) / r.n), 1)}%p`);
        parts.push(`low 뒤집힘 ${ci(pairedCI(game, v, gl, (r) => r.flip))}`);
        parts.push(`돌풍 1.2 원 밖 ${ci(pairedCI(game, v, b12, (r) => (100 * r.out) / r.n), 1)}%p`);
        const G = game.filter((r) => r.v === v && all(r)), Z = game.filter((r) => r.v === 'v1' && all(r));
        parts.push(`상한 ${f((100 * G.filter((r) => r.capped).length) / G.length, 1)}%(v1 ${f((100 * Z.filter((r) => r.capped).length) / Z.length, 1)}) · 바뀜 ${f((100 * G.filter((r) => r.dFlip || r.dOut).length) / G.length, 1)}%(v1 ${f((100 * Z.filter((r) => r.dFlip || r.dOut).length) / Z.length, 1)})`);
      }
      if (sweep.some((r) => r.v === v)) {
        const s = (N, plan) => (r) => r.N === N && r.plan === plan;
        parts.push(`쓸기 40 휙 ${ci(pairedCI(sweep, v, s(40, 'flick'), (r) => r.flip))} · 버티기 ${ci(pairedCI(sweep, v, s(40, 'hold'), (r) => r.flip))} · 30 휙 ${ci(pairedCI(sweep, v, s(30, 'flick'), (r) => r.flip))} · 원 밖(전체) ${ci(pairedCI(sweep, v, () => true, (r) => r.out))}장`);
        // 휙 ÷ 버티기(같은 판, 평균의 비): 쓸기가 버티기보다 얼마나 나은가 — 코어 손잡이(core-sweep §9 0번)와 같은 방향의 참고값(판정 아님)
        const fh = (vv, N) => mean(sweep.filter((r) => r.v === vv && s(N, 'flick')(r)).map((r) => r.flip)) / mean(sweep.filter((r) => r.v === vv && s(N, 'hold')(r)).map((r) => r.flip));
        parts.push(`휙÷버티기 40장 ${f(fh(v, 40))}(v1 ${f(fh('v1', 40))}) · 30장 ${f(fh(v, 30))}(v1 ${f(fh('v1', 30))})`);
      }
      const d = drop.find((r) => r.v === v && r.c === 'flat');
      if (d) parts.push(`낙하 튀는 비 ${f(d.ratio)}`);
      console.log(`${vname(v)}\n   ${parts.join('\n   ')}`);
    }
  }
}

// ───────────────────────── 입구 ─────────────────────────
if (!isMainThread && workerData?.paperWorker) {
  await Sim.initPhysics();
  parentPort.on('message', (job) => { if (job === null) { parentPort.close(); process.exit(0); } parentPort.postMessage(runOne(job)); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [cmd, a1, a2] = process.argv.slice(2);
  await Sim.initPhysics();
  if (cmd === 'self') await self();
  else if (cmd === 'list') {
    for (const p of ['drop', 'pile', 'game', 'sweep']) console.log(`${p}: ${jobsOf(p).length} (변형 ${p === 'game' ? GAME_VIDS.length : VIDS.length} × ${jobsOf(p, ['v1']).length})`);
    for (const v of VIDS) console.log(`  ${v.padEnd(7)} ${vname(v).padEnd(14)} tune ${JSON.stringify(VARIANTS[v].tune)} 책상 e ${VARIANTS[v].tableE ?? '(손 안 댐)'}`);
  } else if (cmd === 'run') await run(a1, Number(a2 || 2));
  else if (cmd === 'report') report();
  else { console.error('사용: node tools/paperphys.mjs self|list|run <drop|pile|game|sweep> [W]|report'); process.exitCode = 2; }
}

// tools/sweepgame.mjs — 고개 쓸기(푸어억) 게임 이식 대조 (docs/design/core-sweep.md §9 4번 줄 '깃발 뒤 새 문법'). CLI 가드: 직접 실행할 때만 돈다.
//
// 🧭 가설(확인 대상): 측정 도구의 쓸기 식(tools/sweepmap.mjs·sweepcheck.mjs·coresweep/gesture.mjs·coresweep/simsweep.js blowProg)을
//   게임(mockup/src/sim.js blowProg·jetPose + mockup/src/sweep.js)으로 옮긴 것이 비트까지 같다. 고전 경로(blow·blowLip)도 그대로다.
//   → 판가름 = 아래 넷이 모두 맞음. 하나라도 틀리면 연습판 숫자가 측정(문서 §3)과 같은 물리라고 말할 수 없다.
//
// 명령
//   node tools/sweepgame.mjs parity   (a) sweep.js ≡ sweepmap(breathOf puff·rel·pueok·tail, alphaOf, poseAt c·a·b, makeProg, t 0~1.2 s 0.001 간격) · sweepcheck(hitC 0~24°, alphaTop)
//                                      · causeOf 고친 줄만 다름  (b) sim.js blowProg ≡ simsweep blowProg: 장수 10·20·30·40 × 시드 601·602 × 칸 8
//                                      (퍽 0.131 · rel 30장식 q0.7 w40 t0 .05/.25/.45 꼭대기 떼기 · 40장식 q0.85 w120 t0 .10/.35 · relHold 0.6 s · 상한 1.0 s),
//                                      매 스텝 모든 딱지 위치·회전·선속도·각속도 f64 + off 깃발 비트 동일, 판정 스텝·뒤집힘·원 밖 같음
//                                      (c) 고전 blow(눈높이)·blowLip(책상 입)도 같은 표에서 매 스텝 비트 동일. 약 1분
//   node tools/sweepgame.mjs chk [W=2] sweepcheck 작업 목록(기본 SEEDS=601-602 · NS=30 = 98줄)을 sim.js + sweep.js 로 다시 돌려
//                                      tools/coresweep/data/vf/chk601.jsonl.gz 와 (장수, 키, 시드)로 맞춰 줄마다 비트 대조(sweepcheck same 과 같은 판정). SEEDS=601-624 NS=20,30,45 = 전부(약 20분)
//   node tools/sweepgame.mjs ctl      엄지 px ↔ 고개 α 표(±1 px) · 따라가기(스텝당 |Δα| ≤ 1°, ≤ 24°) · 떼기 잠금(D = 떼기 뒤 첫 스텝·최소 0.131·상한 1.0, dur = D + 0.04)
//                                      · plan 모드 prog ≡ makeProg('c', rel 0.04) 비트 · gesture.js ≡ gesture.mjs(gestnoise 손 잡음 궤적에서 모든 반환값·시각 같음)
//                                      · 채택 설정(+ slowCancel 40) '푸' 열림 지연 중앙값 233/617/267 ms · 쓸기 놓침 0%
//                                      · 문법 B '놓고 쓸기'(2026-10-16 기본): GB 값 ≡ sweepgb 측정(CHOSEN w80·A24 · D(q) · CHIP 규칙) · 휙 인식기 표(탭·느린 끌기·떨림 = 안 휙,
//                                        12 px/100 ms·빠른 휙·뗄 때 휙 = 휙, 한 번만) · 당김 인식기 GestureB 는 '푸'를 안 열고 한 획 휙·느린 밀기도 놓기(취소 아님),
//                                        한 획 휙 동안 옆 ±125 px 흐름도 놓기 · 당기며 옆 빼기·덜 당김 = 취소(side 표시)
//                                        · flick ≡ plan {A 24, w 80, t0, D(q)} prog 비트 · 손 휙(그 스텝 t 로 잠금)·일정 휙·안 휙·숨 끝 뒤 휙 = planShot 해시
//                                        · 두 번째 휙 무시 · flickShot = 측정 원자료(tools/coresweep/data/gb grid·held) 줄의 해시·뒤집힘·원 밖·스텝·ttF·단서 시각·칩
//                                        · 칩 함수 gbChip ≡ sweepgb chipOf(고른 쓸기·D(q) 원자료 줄 전부)
//                                      · 문법 C '영점 조준'(2026-10-16 기본): GC 상수 ≡ sweepgc(S_BASE·D_FLOOR·W_UP·FB·RULE·지배 칸·A_BASE) · a0Of 비트(s 0.40~1.00 × 꼭대기 12개)
//                                        · zero prog ≡ GcCtl prog 비트(고정 tUp) · α0 0 이면 plan 과 같음 · zeroShot ≡ gcShot(6칸) · zeroShot ≡ 원자료 줄(map 10 · held 8)
//                                        · meterAt·thOfRise·sOfH/hOfS 표 · GC_LINES ≡ sweepgc lines --json · gcChip ≡ sweepgc chipOf(기둥 원자료 전 줄) · 단위 예 · 사건 cue·lock·up. 약 1.5분
//                                      · 문법 D '세 박자'(2026-10-17 기본): DESK ≡ sim.js · blastSpan ≡ rules.js · gdMeterAt('s') ≡ meterAt('s') 비트 · 각도 눈금·당김 표
//                                        · gdShot(q ≤ 1) ≡ zeroShot(같은 s·q·θ) 해시(원·책상 판정 모두) · gdShot(q > 1) ≡ 인라인 참조(SweepCtl + blowProg + P.blast)
//                                        · GD 숫자 = 보류 시드 측정(node tools/sweepgd.mjs report --json 문턱·peak 13개 모두 버팀) · judgeDesk ≡ 독립 식(측정 스크래치 deskOut 꼴)
//                                        · gdZone 경계표(아슬 칸 없음) · gdTipH 연속·단조 · gdChip 단위 예
//                                        · 정적 검사: main.js 조종 모드 직접 비교('zero')가 ctlG 밖에 0건 · 판정은 Sweep.judgeDesk/deskOut 만(자체 책상 식 없음)
//                                        · 비교 토글(⚙ 숨 난이도 × 아웃 범위): 기본 조합 = 옛 결과(주입 4칸 해시·뒤집힘·칩 = 바꾸기 전 커밋 값 · gdCfg() 가 GD 자신 · 칸 격자 같음)
//                                          · 어려움 = sweepgd 손잡이 (b)(armShot 'b' 해시 · 돌풍 (q − 1)/0.25 · q ≤ 1 은 보통과 같은 해시) · 반지름 5 판정: 게임 함수 = 독립 식 = sweepgd 줄(flipR·outR)
//                                          · GD_COMBO 숫자 = sweepgd report --json 4 조합 문턱·peak 모두 버팀 · main.js 정적 검사(판정·실시간·돌풍이 조합을 넘김)
//   node tools/sweepgame.mjs ref [--json]   주입 훅(window.__sweepPlan) 칸들의 Node 기준: #p30 시드 601 t0 .05/.25/.45 · #p40 시드 401 t0 .10/.35 → 뒤집힘·원 밖·D·스텝·정지 해시
//                                      + 문법 B 주입({ kind: 'gb', q, ts }) 칸: #p40 401 q0.85 ts 0.3·안 휙 · #p30 601 q0.7 ts 0.3 (tools/sweepplay.mjs 가 게임과 비교)
//                                      + 문법 C 주입({ kind: 'gc', s, q, th }) 칸: #p40 401 (0.55, 0.9, 40)·(0.8, 0.9, 40)·(0.55, 0.9, 0) · #p30 601 (0.55, 0.85, 20)
//                                        — sweepgc gcShot 과 한 번 더 대조('맞음') + 문법 D 주입({ kind: 'gd', s, q, th }) 칸: #p40 401 (0.55, 0.9, 40)·(0.55, 1.2, 40) · #p30 601 (0.55, 0.95, 30)
//                                        (책상 판정 — gdShot) + D 비교 토글 4 조합 같은 칸 #p40 401 (0.55, 1.15, 40) (gdShot mode). --json = { plan, gb, gc, gd, gdm }. 약 25초
//   node tools/sweepgame.mjs base     게임 문법의 고정 숨 기준선(검토 2): '툭 연 높이(엄지 18 px → α ≈ 0.9°)에서 버티다 떼기' D 0.375·0.45·0.525·0.6 대
//                                      쓸기(꼭대기 떼기) t0 0.25·0.35 — 30장 q0.7 시드 601~606 · 40장 q0.85 시드 401~406. 장수별 평균 · 시드마다 (최고 쓸기 − 최고 고정) 짝 차.
//                                      문서·카드의 이득 주장은 이 기준으로 말한다(측정 표의 α = 0 고정보다 게임 버티기가 세다). 판정 없음(보고만). 약 30초
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, realpathSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as V1 from '../mockup/src/sim.js';
import * as SW from './coresweep/simsweep.js';
import * as G from '../mockup/src/sweep.js';
import * as M from './sweepmap.mjs';
import * as GM from './coresweep/gesture.mjs';
import { PL } from './coresweep/gestnoise.mjs';

const D2R = Math.PI / 180;
const eq = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
let FAIL = 0;
const ok = (name, cond, info = '') => { if (!cond) FAIL++; console.log(`  ${cond ? '맞음' : '틀림'}  ${name}${info ? ' — ' + info : ''}`); return cond; };

// ── 주입·대조 칸 (스펙 gates (b)) ──
export const REF_CELLS = [
  { N: 30, seed: 601, q: 0.7, plan: { A: 'top', w: 40, t0: 0.05, D: 'top' } },
  { N: 30, seed: 601, q: 0.7, plan: { A: 'top', w: 40, t0: 0.25, D: 'top' } },
  { N: 30, seed: 601, q: 0.7, plan: { A: 'top', w: 40, t0: 0.45, D: 'top' } },
  { N: 40, seed: 401, q: 0.85, plan: { A: 'top', w: 120, t0: 0.1, D: 'top' } },
  { N: 40, seed: 401, q: 0.85, plan: { A: 'top', w: 120, t0: 0.35, D: 'top' } },
];
// 문법 B 주입 칸(sweepplay (1) 이 같은 판에서 게임과 비교). ts = 화면 초, null = 안 휙
export const REF_GB_CELLS = [
  { N: 40, seed: 401, q: 0.85, ts: 0.3 },
  { N: 40, seed: 401, q: 0.85, ts: null },
  { N: 30, seed: 601, q: 0.7, ts: 0.3 },
];
// 문법 C 주입 칸({ kind: 'gc', s, q, th } — sweepplay (11) 이 같은 판에서 게임과 비교): 지배 칸 · 영점 높음(zHigh) · 쓸기 없음(thLow) · 30장 중간 각
export const REF_GC_CELLS = [
  { N: 40, seed: 401, s: 0.55, q: 0.9, th: 40 },
  { N: 40, seed: 401, s: 0.8, q: 0.9, th: 40 },
  { N: 40, seed: 401, s: 0.55, q: 0.9, th: 0 },
  { N: 30, seed: 601, s: 0.55, q: 0.85, th: 20 },
];
// 문법 D 주입 칸({ kind: 'gd', s, q, th } — sweepplay (12) 가 같은 판에서 게임과 비교): 지배 칸 · 돌풍 1.2 · 30장
export const REF_GD_CELLS = [
  { N: 40, seed: 401, s: 0.55, q: 0.9, th: 40 },
  { N: 40, seed: 401, s: 0.55, q: 1.2, th: 40 },
  { N: 30, seed: 601, s: 0.55, q: 0.95, th: 30 },
  { N: 40, seed: 401, s: 0.55, q: 0.92, th: 5 }, // 볼 = 헛스윙(gdSwing → 쓸기 각 0) · 칩 ⚾
];
// 바꾸기 전(커밋 d2ebb42) REF_GD_CELLS 의 Node 결과 [뒤집힘, 책상 밖, 걸침, 스텝, 칩, 해시] — 비교 토글을 넣은 뒤에도 기본 조합이 그대로인지(ctl)
export const REF_GD_BEFORE = [[38, 1, 0, 324, 'good', '03545235288ca3d0'], [25, 14, 4, 289, 'qGust', 'f3c2c961eb14950d'], [28, 2, 0, 345, 'good', 'c7a3ad9a005d624a'], [25, 0, 0, 280, 'thBall', '54c48810ba973641']];
// 문법 D 비교 토글 주입 칸(sweepplay (12) 가 조합마다 페이지 하나 ?gdq=…&gdout=… 로 같은 칸을 쏜다): 40장 401 (0.55, 1.15, 40°) — 보통 = 초록 · 어려움 = 돌풍 빨강
export const REF_GD_MODE_CELL = { N: 40, seed: 401, s: 0.55, q: 1.15, th: 40 };
export const GD_MODE_LIST = [{ q: 'normal', out: 'desk' }, { q: 'hard', out: 'desk' }, { q: 'normal', out: 'r5' }, { q: 'hard', out: 'r5' }];
const PARITY_CELLS = [
  { name: '퍽 0.131', q: 0.85, plan: { kind: 'puck' } },
  { name: 'rel q0.7 w40 t.05 꼭대기', q: 0.7, plan: { A: 'top', w: 40, t0: 0.05, D: 'top' } },
  { name: 'rel q0.7 w40 t.25 꼭대기', q: 0.7, plan: { A: 'top', w: 40, t0: 0.25, D: 'top' } },
  { name: 'rel q0.7 w40 t.45 꼭대기', q: 0.7, plan: { A: 'top', w: 40, t0: 0.45, D: 'top' } },
  { name: 'rel q0.85 w120 t.10 꼭대기', q: 0.85, plan: { A: 'top', w: 120, t0: 0.1, D: 'top' } },
  { name: 'rel q0.85 w120 t.35 꼭대기', q: 0.85, plan: { A: 'top', w: 120, t0: 0.35, D: 'top' } },
  { name: 'relHold 0.6 s', q: 0.7, plan: { A: 'top', w: 40, t0: 0.25, D: 0.6 } },
  { name: '상한 1.0 s', q: 0.7, plan: { A: 'top', w: 40, t0: 0.25, D: 1.0 } },
];

export async function refRows() {
  await V1.initPhysics();
  return REF_CELLS.map((c) => {
    const r = G.planShot(V1.Table, { N: c.N, seed: c.seed, plan: c.plan, q: c.q });
    return { N: c.N, seed: c.seed, q: c.q, plan: r.plan, D: r.D, steps: r.steps, flips: r.flips, outs: r.outs, hash: r.hash, tTop: r.tTop };
  });
}
export async function refRowsGB() {
  await V1.initPhysics();
  return REF_GB_CELLS.map((c) => {
    const r = G.flickShot(V1.Table, c);
    return { N: c.N, seed: c.seed, q: c.q, ts: c.ts, D: r.D, t0: r.t0, steps: r.steps, flips: r.flips, outs: r.outs, hash: r.hash, tTop: r.tTop, ttF: r.ttF, cueT: r.cueT, chip: r.chip };
  });
}
export async function refRowsGC() {
  await V1.initPhysics();
  return REF_GC_CELLS.map((c) => {
    const r = G.zeroShot(V1.Table, c);
    return { N: c.N, seed: c.seed, s: c.s, q: c.q, th: c.th, a0: r.a0, D: r.D, steps: r.steps, flips: r.flips, outs: r.outs, hash: r.hash, tUp: r.tUp, cueT: r.cueT, ttUp: r.ttUp, tTop: r.tTop, chip: r.chip, chip2: r.chip2 };
  });
}

export async function refRowsGD() {
  await V1.initPhysics();
  return REF_GD_CELLS.map((c) => {
    const r = G.gdShot(V1.Table, c);
    const row = { N: c.N, seed: c.seed, s: c.s, q: c.q, th: c.th, a0: r.a0, D: r.D, steps: r.steps, flips: r.flips, outs: r.outs, hang: r.hang, hash: r.hash, tUp: r.tUp, cueT: r.cueT, blast: r.blast, chip: r.chip };
    r.table.world.free();
    return row;
  });
}
// 비교 토글 조합마다 같은 주입 칸 하나(REF_GD_MODE_CELL) — gdShot(mode)
export async function refRowsGDModes() {
  await V1.initPhysics();
  return GD_MODE_LIST.map((m) => {
    const c = REF_GD_MODE_CELL, r = G.gdShot(V1.Table, { ...c, mode: m });
    const row = { ...c, mode: G.gdKey(m), q_: m.q, out_: m.out, D: r.D, steps: r.steps, flips: r.flips, outs: r.outs, hang: r.hang, ring: r.ring, hash: r.hash, tUp: r.tUp, blast: r.blast, chip: r.chip };
    r.table.world.free();
    return row;
  });
}

// ───────────────────────── parity ─────────────────────────
const fullSnap = (t) => t.liveDiscs().flatMap((d) => { const p = d.body.translation(), q = d.body.rotation(), v = d.body.linvel(), w = d.body.angvel(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z, d.off ? 1 : 0]; });
function mkPair(n, seed, tune = {}) {
  SW.setDiscH(0.11);
  const a = new V1.Table(seed * 7907 + n, tune), b = new SW.Table(seed * 7907 + n, tune);
  a.addPile(Array.from({ length: n }, (_, i) => i)); b.addPile(Array.from({ length: n }, (_, i) => i));
  a.settle(600); b.settle(600);
  return [a, b];
}
// 두 월드를 나란히: 매 스텝 전체 상태 비교, 판정은 sim.js stepJudge(게임 연습판과 같은 규칙) → 같은 스텝에 판정되는지까지
function lockstep(a, b, afterA) {
  const ja = { n: 0, quiet: 0 }, jb = { n: 0, quiet: 0 };
  let steps = 0, firstBad = -1;
  for (;;) {
    a.step(); b.step(); steps++;
    afterA?.(a);
    if (firstBad < 0 && !eq(fullSnap(a), fullSnap(b))) firstBad = steps;
    const da = a.stepJudge(ja), db = V1.Table.prototype.stepJudge.call(b, jb);
    if (da !== db) return { steps, firstBad: firstBad < 0 ? steps : firstBad, judge: false };
    if (da) break;
  }
  const ra = a.judgeResult(), rb = b.judgeResult();
  return { steps, firstBad, judge: true, fa: ra.flipped.length, fb: rb.flipped.length, oa: ra.outs.length, ob: rb.outs.length };
}
async function parity() {
  await V1.initPhysics(); await SW.initPhysics();
  console.log('(a) sweep.js ≡ 측정 도구 함수');
  const T = Array.from({ length: 1201 }, (_, i) => i / 1000);
  let bad = 0, tot = 0;
  const cmp = (x, y) => { tot++; if (!Object.is(x, y)) bad++; };
  const BRS = [['puff'], ['pueok', 0.6], ['pueok', 0.45], ['pueok', 1.0], ['rel', 0.3, 0.04], ['rel', 0.4115, 0.04], ['rel', 0.6, 0.04], ['rel', 1.0, 0.04], ['rel', 0.6, 0.26], ['tail', 0.5], ['rel', 0.131, 0.04]];
  for (const [k, D, o] of BRS) { const x = G.breathOf(k, D, o), y = M.breathOf(k, D, o); cmp(x.dur, y.dur); for (const t of T) cmp(x.env(t), y.env(t)); }
  ok('breathOf puff·pueok·rel·tail', bad === 0, `${tot - bad}/${tot}`);
  bad = 0; tot = 0;
  const SWS = [{}, { A: 8, w: 40, t0: 0.25 }, { A: 8.471, w: 120, t0: 0.1 }, { A: 20, w: 15, t0: 0.05 }, { A: 3, w: 360, t0: 0.45 }, { A: 6.123, w: 40, t0: 0 }];
  for (const s of SWS) { const x = G.alphaOf(s), y = M.alphaOf(s); for (const t of T) cmp(x(t), y(t)); }
  ok('alphaOf', bad === 0, `${tot - bad}/${tot}`);
  bad = 0; tot = 0;
  const M0 = { x: 0.0123, y: 0.5, z: 5.0071 };
  for (const kin of ['c', 'a', 'b']) for (let a = 0; a <= 0.42; a += 0.0007) { const x = G.poseAt(a, kin, G.GEO, M0), y = M.poseAt(a, kin, M.GEO, M0); cmp(x.o.x, y.o.x); cmp(x.o.y, y.o.y); cmp(x.o.z, y.o.z); cmp(x.phi, y.phi); }
  ok('poseAt c·a·b · GEO', bad === 0 && JSON.stringify(G.GEO) === JSON.stringify(M.GEO), `${tot - bad}/${tot}`);
  bad = 0; tot = 0;
  const fake = { pileCenter: () => ({ x: -0.0317, z: 0.0219 }) };
  for (const s of SWS) for (const [k, D, o] of BRS.slice(4, 8)) {
    const px = G.makeProg(fake, { kin: 'c', sweep: s, breath: G.breathOf(k, D, o) }), py = M.makeProg(fake, { kin: 'c', sweep: s, breath: M.breathOf(k, D, o) });
    for (const t of T) { const x = px(t), y = py(t); cmp(x.o.x, y.o.x); cmp(x.o.y, y.o.y); cmp(x.o.z, y.o.z); cmp(x.phi, y.phi); cmp(x.env, y.env); cmp(x.ux, y.ux); cmp(x.uz, y.uz); }
  }
  ok('makeProg (kin c)', bad === 0, `${tot - bad}/${tot}`);
  // sweepcheck hitC·alphaTop: 그 파일 안의 상수식을 그대로 다시 만든다(내보내지 않음) — 원문 식을 이 파일에 적어 두고 대조
  const hitCRef = (a) => { const p = M.poseAt(a * D2R, 'c', M.GEO, { x: 0, y: M.GEO.ym, z: M.GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
  const alphaTopRef = (top) => { if (top <= hitCRef(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitCRef(m) > top) hi = m; else lo = m; } return hi; };
  const src = readFileSync(new URL('./sweepcheck.mjs', import.meta.url), 'utf8');
  const srcOk = src.includes("const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };")
    && src.includes('const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };');
  bad = 0; tot = 0;
  for (let a = 0; a <= 24; a += 0.01) cmp(G.hitC(a), hitCRef(a));
  const tops = [];
  for (let n = 5; n <= 45; n += 5) for (const seed of [601, 401]) { const t = new V1.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); tops.push(t.columnTop()); }
  for (let h = 0.2; h < 3.5; h += 0.0137) tops.push(h);
  for (const h of tops) cmp(G.alphaTop(h), alphaTopRef(h));
  ok('hitC 0~24° · alphaTop(장수 5~45 꼭대기 + 0.2~3.5 u) = sweepcheck 원문 식', bad === 0 && srcOk, `${tot - bad}/${tot} · 원문 식 일치 ${srcOk}`);
  // causeOf: 원본은 sweepmap 과 같고, 고친 판은 '원 밖 ≥ 25% 이고 뒤집힘 ≥ 절반'인 기록에서만 다르다
  const R = mulberry(7);
  let rawBad = 0, fixBad = 0, diff = 0;
  for (let i = 0; i < 20000; i++) {
    const n = 5 + Math.floor(R() * 41);
    const r = { n, flip: Math.floor(R() * (n + 1)), out: Math.floor(R() * (n + 1)), tTop: R() < 0.3 ? -1 : R(), ttAtTop: R() * 60, maxTT: R() * 90, maxTB: R() * 90, endTB: R() * 90 };
    if (G.causeOfRaw(r) !== M.causeOf(r)) rawBad++;
    const special = r.out >= 0.25 * r.n && r.flip >= 0.5 * r.n && !(r.tTop >= 0 && r.ttAtTop < 25);
    if (special) { diff++; if (G.causeOf(r) === 'strong' || G.causeOf(r) === G.causeOfRaw(r)) fixBad++; }
    else if (G.causeOf(r) !== G.causeOfRaw(r)) fixBad++;
  }
  ok("causeOf 원본 ≡ sweepmap · 고친 판은 '원 밖 ≥ 25% · 뒤집힘 ≥ 절반'에서만 💨 를 빼고 다름", rawBad === 0 && fixBad === 0, `원본 다름 ${rawBad} · 고친 판 틀림 ${fixBad} (그 경우 ${diff}/20000)`);

  console.log('(b) sim.js blowProg ≡ simsweep blowProg (매 스텝 위치·회전·선속도·각속도 f64 + off)');
  const t0 = Date.now();
  let nOk = 0, nTot = 0;
  for (const n of [10, 20, 30, 40]) for (const seed of [601, 602]) for (const cell of PARITY_CELLS) {
    const [a, b] = mkPair(n, seed);
    const top = a.columnTop();
    let ctl, progB, durB;
    if (cell.plan.kind === 'puck') {
      ctl = new G.SweepCtl(a, { mode: 'puck' });
      const br = M.breathOf('puff'); progB = M.makeProg(b, { kin: 'c', sweep: {}, breath: br }); durB = br.dur;
    } else {
      const pl = G.resolvePlan(cell.plan, top);
      ctl = new G.SweepCtl(a, { mode: 'plan', plan: pl });
      const br = M.breathOf('rel', pl.D, 0.04); progB = M.makeProg(b, { kin: 'c', sweep: { A: pl.A, w: pl.w, t0: pl.t0 }, breath: br }); durB = br.dur;
    }
    ctl.attach(a.blowProg({ prog: ctl.prog, power: cell.q, dur: ctl.durCap }));
    b.blowProg({ prog: progB, power: cell.q, dur: durB });
    const r = lockstep(a, b, (t) => ctl.after(t));
    nTot++;
    const good = r.judge && r.firstBad < 0 && r.fa === r.fb && r.oa === r.ob;
    if (good) nOk++; else console.log(`    다름: ${n}장 시드 ${seed} ${cell.name} — 첫 다른 스텝 ${r.firstBad} · 판정 ${r.judge} · 뒤집힘 ${r.fa}/${r.fb} · 원 밖 ${r.oa}/${r.ob}`);
  }
  ok('장수 10·20·30·40 × 시드 601·602 × 칸 8: 매 스텝 비트 동일 · 같은 스텝 판정 · 뒤집힘·원 밖 같음', nOk === nTot, `${nOk}/${nTot} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);

  console.log('(c) 고전 blow(눈높이)·blowLip(책상 입)도 같은 표에서 매 스텝 비트 동일');
  nOk = 0; nTot = 0;
  for (const n of [10, 20, 30, 40]) for (const seed of [601, 602]) for (const [kind, power, blast] of [['eye', 0.9, 0], ['eye', 1.05, 0.4], ['lip', 0.9, 0]]) {
    const [a, b] = mkPair(n, seed);
    const c = a.pileCenter(), top = a.columnTop();
    const args = kind === 'lip' ? { aim: { x: c.x, y: 0.3, z: c.z + 1 }, dir: { x: 0, z: -1 }, power, blast, mouthY: 0.5 } : { aim: { x: c.x, y: top * 0.6, z: c.z + 1 }, dir: { x: 0, z: -1 }, power, blast };
    a.blow(args); b.blow(args);
    const r = lockstep(a, b);
    nTot++;
    if (r.judge && r.firstBad < 0 && r.fa === r.fb && r.oa === r.ob) nOk++; else console.log(`    다름: ${n}장 시드 ${seed} ${kind} p${power} — 첫 다른 스텝 ${r.firstBad}`);
  }
  ok('고전 blow·blowLip 매 스텝 비트 동일', nOk === nTot, `${nOk}/${nTot}`);
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ───────────────────────── chk (sweepcheck 줄 재현) ─────────────────────────
// sweepmap.mjs shot() 을 그대로 옮기되 물리 = sim.js(게임 엔진), 쓸기 식 = sweep.js. 줄의 키 순서까지 같게(JSON 문자열로 비교)
function rotq(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}
export function shotGame(job) {
  if (job.H && job.H !== 0.11) throw new Error('게임 엔진은 DISC_H 0.11 고정');
  const t = new V1.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(job.settleSteps || 600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const zf = c0.z + 1;
  const br = G.breathOf(job.breath.kind, job.breath.D, job.breath.off);
  const prog = G.makeProg(t, { kin: job.kin || 'c', sweep: job.sweep || {}, breath: br, geo: { ...G.GEO, ...(job.geo || {}) } });
  t.blowProg({ prog, power: job.q, dur: br.dur });
  const live = t.liveDiscs();
  const bottom = live[0];
  const half = Math.floor(job.n / 2);
  let maxTiltBottom = 0, tLift = -1;
  let maxTB = 0, maxTT = 0, endTB = 0, tTop = -1, ttAtTop = -1;
  const halves = () => {
    let tb = 0, tt = 0;
    live.forEach((d, k) => { const u = rotq(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
    return [tb / Math.max(1, half) / D2R, tt / Math.max(1, job.n - half) / D2R];
  };
  const dtS = t.T.dt;
  const maxSteps = Math.ceil((job.maxSec || 8) / dtS);
  let i = 0, capped = 1, below = false;
  for (; i < maxSteps; i++) {
    const P = t.puff;
    let crossed = false;
    if (P && P.t > 0 && tTop < 0 && P.d && P.d.z < -1e-6) { const s = (zf - P.o.z) / P.d.z; if (P.o.y + s * P.d.y <= top0) below = true; else if (below) crossed = true; }
    t.step();
    const up = rotq(bottom.body.rotation(), { x: 0, y: 1, z: 0 });
    const tilt = Math.acos(Math.min(1, Math.abs(up.y)));
    if (tilt > maxTiltBottom) maxTiltBottom = tilt;
    if (tLift < 0 && tilt > 5 * D2R) tLift = (i + 1) * dtS;
    if (crossed || i % 3 === 0) {
      const [tb, tt] = halves();
      if (tb > maxTB) maxTB = tb;
      if (tt > maxTT) maxTT = tt;
      endTB = tb;
      if (crossed) { tTop = (i + 1) * dtS; ttAtTop = tt; }
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
    const u = rotq(d.body.rotation(), { x: 0, y: 1, z: 0 });
    if (Math.abs(u.y) < 0.9 && Math.abs(u.y) > 0.2) lean++;
    zs.push(d.body.translation().z - c0.z);
  }
  zs.sort((a, b) => a - b);
  const r = {
    n: job.n, seed: job.seed, flip: flippedSet.size, flip42, out: outs, flipBottom, flipTop, lean,
    fan: zs.length ? +(zs[zs.length - 1] - zs[0]).toFixed(3) : 0,
    fwd: zs.length ? +(-zs[Math.floor(zs.length / 2)]).toFixed(3) : 0,
    whole: flippedSet.size >= 0.7 * job.n ? 1 : 0,
    tilt0: +(maxTiltBottom / D2R).toFixed(1), tLift: +tLift.toFixed(3), top0: +top0.toFixed(3), steps: i, capped,
    maxTB: +maxTB.toFixed(1), endTB: +endTB.toFixed(1), maxTT: +maxTT.toFixed(1), tTop: +tTop.toFixed(3), ttAtTop: +ttAtTop.toFixed(1),
  };
  r.cause = G.causeOfRaw(r);
  return r;
}
async function chk(W) {
  process.env.SEEDS ||= '601-602';
  process.env.NS ||= '30';
  const { makeJobs } = await import('./sweepcheck.mjs');
  await SW.initPhysics();
  const jobs = makeJobs();
  const tag = (r) => `${r.n}|${r.key}|${r.seed}`;
  const old = new Map(gunzipSync(readFileSync(new URL('./coresweep/data/vf/chk601.jsonl.gz', import.meta.url))).toString('utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [tag(r), l]; }));
  console.log(`chk: 작업 ${jobs.length}줄 (SEEDS=${process.env.SEEDS} NS=${process.env.NS}) · 일꾼 ${W} · 원자료 chk601 ${old.size}줄`);
  const t0 = Date.now();
  const rows = [];
  let k = 0;
  await new Promise((res) => {
    let alive = W;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepgameWorker: 1 } });
      const next = () => wk.postMessage(k < jobs.length ? jobs[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); rows.push(m); if (rows.length % 50 === 0) console.error(`  ${rows.length}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => { console.error(e); FAIL++; });
    }
  });
  let same = 0, miss = 0; const bad = [];
  for (const r of rows) { const o = old.get(tag(r)); if (o === undefined) miss++; else if (o === JSON.stringify(r)) same++; else bad.push(tag(r)); }
  ok(`sim.js + sweep.js 로 다시 돌린 줄 = chk601 원자료(줄마다 JSON 비트 동일)`, same === jobs.length && !bad.length && !miss, `같음 ${same}/${jobs.length} · 다름 ${bad.length}${bad.length ? ` (${bad.slice(0, 5).join(', ')})` : ''} · 원자료에 없음 ${miss} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
}

// ───────────────────────── ctl ─────────────────────────
// gestnoise.mjs run() 을 그대로 옮기되 두 인식기(gesture.mjs · sweep.js)를 같은 사건으로 함께 몰고 모든 반환값을 비교
const W0 = 390, H0 = 844, PULL = 390 * 0.42;
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const mj = (u) => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
function runPair(kind, cfg, r, pl, cnt) {
  const g = new GM.Gesture(W0, H0, cfg), h = new G.Gesture(W0, H0, cfg);
  const call = (m, ...a) => { const x = g[m](...a), y = h[m](...a); cnt.n++; if (JSON.stringify(x) !== JSON.stringify(y)) cnt.bad++; return x; };
  const x0 = 195, y0 = 520, hz = 60, dt = 1000 / hz;
  const pT = 0.3 + 0.6 * r(), pullMs = 300 + 500 * r() * pl.slow, holdMs = 150 + (1050 - 150) * r();
  const drift = (r() * 2 - 1) * 15 * pl.drift, f = 8 + 4 * r(), ph = r() * 6.28;
  let t = 0; call('down', x0, y0, t); let out;
  const tremor = (tt) => pl.trem * Math.sin(2 * Math.PI * f * tt / 1000 + ph) * 1.4 + gauss(r) * pl.trem * 0.5;
  const yPull = y0 + pT * PULL;
  for (; t <= pullMs; t += dt) { const y = y0 + (yPull - y0) * mj(t / pullMs) + tremor(t); call('move', x0 + tremor(t + 50), y, t); }
  const tH = t;
  for (; t <= tH + holdMs; t += dt) { const y = yPull + drift * (t - tH) / 1000 + tremor(t); call('move', x0 + tremor(t + 50), y, t); }
  const yE = yPull + drift * holdMs / 1000;
  if (kind === 'puff') { const lift = gauss(r) * 5; call('move', x0, yE + lift * 0.6, t); out = call('up', x0, yE + lift, t + 8); call('tick', t + 40); return { kind: out.kind }; }
  const v = pl.v * (0.7 + 0.6 * r()), D = 40 + 140 * r();
  const ms = 1.875 * D / v * 1000;
  const tS = t; let lat = null;
  for (; t <= tS + ms; t += dt) { const rise = D * mj((t - tS) / ms); const y = yE - rise + tremor(t); const e = call('move', x0 + tremor(t + 50), y, t); if (e?.ev === 'blowStart' && lat == null) lat = t - tS; }
  out = call('up', x0, yE - D, t);
  for (let k = 1; k <= 12; k++) call('tick', t + k * dt); // 뗀 뒤 tick(최소 숨·끝 사건)
  return { miss: out.kind !== 'pueok', lat };
}
// ───────────────────────── base (게임 고정 숨 기준선) ─────────────────────────
async function base() {
  await V1.initPhysics();
  const A0 = +G.alphaForU(18).toFixed(3);
  const fixD = [0.375, 0.45, 0.525, 0.6], swT0 = [0.25, 0.35];
  for (const [N, q, w, seeds] of [[30, 0.7, 40, [601, 602, 603, 604, 605, 606]], [40, 0.85, 120, [401, 402, 403, 404, 405, 406]]]) {
    const fx = fixD.map(() => []), sw = swT0.map(() => []), diff = [];
    for (const seed of seeds) {
      const f = fixD.map((D, i) => { const r = G.planShot(V1.Table, { N, seed, q, plan: { A: A0, w: 120, t0: 0, D } }); fx[i].push(r.flips); return r.flips; });
      const sv = swT0.map((t0, i) => { const r = G.planShot(V1.Table, { N, seed, q, plan: { A: 'top', w, t0, D: 'top' } }); sw[i].push(r.flips); return r.flips; });
      diff.push(Math.max(...sv) - Math.max(...f));
    }
    const m = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
    const bestF = Math.max(...fx.map((a) => +m(a))), bestS = Math.max(...sw.map((a) => +m(a)));
    console.log(`${N}장 q${q} 시드 ${seeds[0]}~${seeds.at(-1)} · 고정 = 툭 높이 α ${A0}° 버티기`);
    console.log(`  고정 D ${fixD.join('/')}: ${fx.map(m).join(' / ')}장   쓸기 t0 ${swT0.join('/')}(w ${w}°/s, 꼭대기 떼기): ${sw.map(m).join(' / ')}장`);
    console.log(`  최고 쓸기 / 최고 고정 = ${(bestS / bestF).toFixed(2)}배 · 시드마다 짝 차(최고 쓸기 − 최고 고정) ${diff.join(', ')} · 0 이상 ${diff.filter((d) => d >= 0).length}/${diff.length}`);
  }
}

async function ctl() {
  await V1.initPhysics();
  console.log('엄지 px ↔ 고개 α (150 px/u, 목 축 c)');
  const TAB = [[0, 0], [20, 1], [40, 2], [59, 3], [79, 4], [99, 5], [118, 6], [158, 8], [197, 10], [297, 15], [400, 20], [485, 24]];
  const rowsTxt = TAB.map(([px, d]) => `${px}px→${G.alphaForU(px).toFixed(2)}°`).join(' · ');
  ok('표 0/20/40/59/79/99/118/158/197/297/400/485 px = 0/1/2/3/4/5/6/8/10/15/20/24° (±1 px)', TAB.every(([px, d]) => G.alphaForU(px - 1) - 1e-9 <= d && d <= G.alphaForU(px + 1) + 1e-9), rowsTxt);
  // 따라가기·잠금: 실제 sim.js 더미에 thumb 모드로 숨 → 엄지 일정 u(t)
  const mk = (n, seed) => { const t = new V1.Table(seed * 7907 + n, { lift: 519.59 }); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t; };
  const runThumb = (sched, relAt) => {
    const t = mk(30, 601);
    const c = new G.SweepCtl(t, { mode: 'thumb' });
    const P = c.attach(t.blowProg({ prog: c.prog, power: 0.7, dur: c.durCap })).P;
    const al = [], tt = [];
    let k = 0, endT = null;
    while (t.puff && k < 400) {
      const tNow = k * t.T.dt;
      c.u = sched(tNow);
      if (relAt != null && tNow >= relAt && !c.relReq) c.release();
      t.step(); c.after(t); k++;
      al.push(c.state.alpha / D2R); tt.push(c.state.t);
      if (!t.puff && endT == null) endT = c.state.t;
    }
    return { al, tt, D: c.D, dur: P.dur, endT, steps: k };
  };
  const ramp = runThumb((tn) => (tn < 0.05 ? 0 : 600), 0.5); // 엄지가 한 번에 끝까지 → 고개는 스텝당 1° 로 따라감
  const dmax = Math.max(...ramp.al.map((a, i) => Math.abs(a - (i ? ramp.al[i - 1] : 0))));
  ok('따라가기: 스텝당 |Δα| ≤ 1° · α ≤ 24° · 24° 에 닿음', dmax <= 1 + 1e-9 && Math.max(...ramp.al) <= 24 + 1e-9 && Math.max(...ramp.al) === 24, `최대 Δ ${dmax.toFixed(4)}° · 최대 α ${Math.max(...ramp.al).toFixed(3)}°`);
  const wave = runThumb((tn) => 120 + 100 * Math.sin(tn * 20), 0.6);
  const dmax2 = Math.max(...wave.al.map((a, i) => Math.abs(a - (i ? wave.al[i - 1] : 0))));
  ok('따라가기(오르내리는 엄지): 스텝당 |Δα| ≤ 1°', dmax2 <= 1 + 1e-9, `최대 Δ ${dmax2.toFixed(4)}°`);
  const DT = 1 / 120, firstAfter = (x) => { let s = 0, k = 0; while (s < x) { s += DT; k++; } return s; }; // P.t 는 dt 를 더해 가므로 같은 방식으로
  const early = runThumb(() => 50, 0.02);
  ok('떼기 잠금: 0.02 s 에 뗌 → D = 0.131 이상 첫 스텝 · dur = D + 0.04 · 숨 끝 = dur 넘는 첫 스텝', early.D === firstAfter(0.131) && early.dur === early.D + 0.04 && early.endT >= early.dur - DT - 1e-12 && early.endT < early.dur, `D ${early.D?.toFixed(4)} · dur ${early.dur.toFixed(4)} · 마지막 숨 스텝 t ${early.endT?.toFixed(4)}`);
  const mid = runThumb(() => 100, 0.5);
  ok('떼기 잠금: 0.5 s 에 뗌 → D = 0.5 이상 첫 스텝', mid.D === firstAfter(0.5) && mid.dur === mid.D + 0.04, `D ${mid.D?.toFixed(4)} · dur ${mid.dur.toFixed(4)}`);
  const cap = runThumb(() => 100, null);
  ok('떼지 않음 → D = 1.0 (저절로 떼기) · dur 1.04', cap.D === 1.0 && cap.dur === 1.04 && cap.endT < 1.04 && cap.endT >= 1.04 - DT - 1e-12, `D ${cap.D} · dur ${cap.dur} · 마지막 숨 스텝 t ${cap.endT?.toFixed(4)}`);
  const held = mid.al.slice(mid.tt.findIndex((x) => x > mid.D));
  ok('뗀 뒤 고개는 그 자리', held.length > 0 && held.every((a) => a === held[0]), `뗀 뒤 ${held.length}스텝 α ${held[0]?.toFixed(3)}°`);
  // plan ≡ makeProg
  let bad = 0, tot = 0;
  for (const n of [20, 30, 40]) for (const pl of [{ A: 8.471, w: 40, t0: 0.25, D: 0.6 }, { A: 6.2, w: 120, t0: 0.1, D: 0.2117 }, { A: 0, w: 40, t0: 0, D: 0.4 }]) {
    const t = mk(n, 601);
    const c = new G.SweepCtl(t, { mode: 'plan', plan: pl });
    const ref = M.makeProg(t, { kin: 'c', sweep: { A: pl.A, w: pl.w, t0: pl.t0 }, breath: M.breathOf('rel', pl.D, 0.04) });
    for (let i = 0; i <= 1200; i++) { const x = c.prog(i / 1000), y = ref(i / 1000); for (const k of ['phi', 'env', 'ux', 'uz']) { tot++; if (!Object.is(x[k], y[k])) bad++; } for (const k of ['x', 'y', 'z']) { tot++; if (!Object.is(x.o[k], y.o[k])) bad++; } }
    tot++; if (c.durCap !== M.breathOf('rel', pl.D, 0.04).dur) bad++;
  }
  ok("plan 모드 prog ≡ makeProg('c', rel 0.04) 비트 · durCap = D + 0.04", bad === 0, `${tot - bad}/${tot}`);
  // gesture.js ≡ gesture.mjs (gestnoise 손 잡음 궤적) + 채택 설정 숫자
  const N = Number(process.env.N || 4000);
  const cfg = { ...G.GCFG, slowCancel: 40 };
  const cnt = { n: 0, bad: 0 };
  const lat = [], miss = [];
  for (const [hk, pl] of Object.entries(PL)) {
    const r = mulberry(20261014);
    for (let i = 0; i < N; i++) runPair('puff', cfg, r, pl, cnt);
    const ls = []; let ms = 0;
    for (let i = 0; i < N; i++) { const o = runPair('sweep', cfg, r, pl, cnt); if (o.miss) ms++; else if (o.lat != null) ls.push(o.lat); }
    ls.sort((a, b) => a - b);
    lat.push(Math.round(ls[Math.floor(ls.length * 0.5)])); miss.push(ms);
    void hk;
  }
  ok('gesture.js ≡ gesture.mjs (slowCancel 40): 같은 사건에 모든 반환값·결정·시각 같음', cnt.bad === 0 && JSON.stringify(G.GCFG) === JSON.stringify(GM.GCFG) && G.pouchPower(0.9) === GM.pouchPower(0.9), `${cnt.n - cnt.bad}/${cnt.n} 호출`);
  ok("채택 설정 '푸' 열림 지연 중앙값 233/617/267 ms (보통·느린 손·아이) · 쓸기 놓침 0%", lat.join('/') === '233/617/267' && miss.every((m) => m === 0), `${lat.join('/')} ms · 놓침 ${miss.join('/')}`);
  await ctlGB(mk);
  await ctlGC(mk);
  await ctlGD(mk);
}

// ───────────────────────── ctl: 문법 D '세 박자' ─────────────────────────
async function ctlGD(mk) {
  console.log("문법 D '세 박자' (sweep.js GD · DESK · gdMeterAt · qOfPull · gdShot · judgeDesk · gdZone · gdChip · main.js 정적 검사)");
  const R = await import('../mockup/src/rules.js');
  // (1) 상수 = 물리·규칙 정의
  const simSrc = readFileSync(new URL('../mockup/src/sim.js', import.meta.url), 'utf8');
  ok('DESK ≡ sim.js DESK_HX · DESK_HZ · 책상 판 두께 절반(cuboid(DESK_HX, 0.5, DESK_HZ)) · GD.blastSpan ≡ rules.js BLAST_SPAN · GD.s ≡ GC 곡선(0.4~1) · 지배 칸 ≡ GC.dom',
    G.DESK.hx === V1.DESK_HX && G.DESK.hz === V1.DESK_HZ && G.DESK.drop === 0.5 && simSrc.includes(`cuboid(DESK_HX, ${G.DESK.drop}, DESK_HZ)`) && G.GD.blastSpan === R.BLAST_SPAN && G.GD.s.min === G.GC.sMin && G.GD.s.max === G.GC.sMax && JSON.stringify(G.GD.dom) === JSON.stringify(G.GC.dom),
    `책상 ${G.DESK.hx}×${G.DESK.hz} · 떨어짐 문턱 y < −${G.DESK.drop} · 돌풍 폭 ${G.GD.blastSpan}`);
  // (1b) GD 숫자 = 보류 시드 측정(node tools/sweepgd.mjs report --json · 원자료 tools/coresweep/data/gd/): 문턱 11 + peak 2 모두 '버팀'(바꿈 0)
  { const { execFileSync } = await import('node:child_process');
    const J = JSON.parse(execFileSync(process.execPath, [new URL('./sweepgd.mjs', import.meta.url).pathname, 'report', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }));
    const P = J.proposals || [], ch = P.filter((x) => !x.holds);
    ok(`GD 숫자 = 보류 시드 측정(sweepgd report): 문턱·peak ${P.length}개 모두 버팀`, P.length === 13 && ch.length === 0, ch.length ? ch.map((x) => `${x.name} ${JSON.stringify(x.game)} → ${JSON.stringify(x.proposed)}`).join(' · ') : `버팀 ${P.length}`); }
  // (2) 눈금: 's' ≡ meterAt('s') 비트(0~3000 ms, 7 ms, T 셋) · 'th' 표(0° 출발 → 45° → 0°)
  let bad = 0, tot = 0;
  for (const T of G.GC.meter.Ts) for (let ms = 0; ms <= 3000; ms += 7) { tot++; if (!Object.is(G.gdMeterAt('s', ms, T), G.meterAt('s', ms, T))) bad++; }
  const thT = [[0, 0], [400, 0], [700, 22.5], [1000, 45], [1300, 22.5], [1600, 0], [1700, 7.5]].map(([ms, w]) => [ms, w, G.gdMeterAt('th', ms, 1200)]);
  const thOk = thT.every(([, w, g]) => Math.abs(w - g) <= 1e-9);
  ok("gdMeterAt('s') ≡ meterAt('s') 비트(0~3000 ms · 7 ms · 왕복 1.6/1.2/1.0 s) · 'th' 표(T 1.2 s: 0/400/700/1000/1300/1600/1700 ms = 0/0/22.5/45/22.5/0/7.5°)", bad === 0 && thOk,
    `${tot - bad}/${tot} · θ ${thT.map(([, , g]) => +g.toFixed(2)).join('/')}`);
  // (3) 당김 → 숨: 390 px 폰(짧은 변) 0/8/43.1/124.6/140/200 px · 거꾸로 왕복
  const qs = [0, 8, 43.2, 124.2, 140.4, 200].map((px) => G.qOfPull(px, 390));
  let rt = 0; for (let q = 0.6; q <= 1.25; q += 0.01) rt = Math.max(rt, Math.abs(G.qOfPull(G.pullOfQ(q, 390), 390) - q));
  ok('qOfPull(390): 0/8/43.2/124.2/140.4/200 px = 0.6/0.637/0.8/1.175/1.25/1.25 · pullOfQ 왕복 ≤ 1e-12 · gdPower = min(q, 1) · gdBlast(1.2) = 0.5 · gdBlast(≤ 1) = 0',
    Math.abs(qs[0] - 0.6) < 1e-12 && Math.abs(qs[2] - 0.8) < 1e-9 && Math.abs(qs[3] - 1.175) < 1e-9 && qs[4] === 1.25 && qs[5] === 1.25 && rt <= 1e-12 && G.gdPower(1.2) === 1 && G.gdPower(0.9) === 0.9 && Math.abs(G.gdBlast(1.2) - 0.5) < 1e-12 && G.gdBlast(1) === 0,
    qs.map((q) => q.toFixed(3)).join('/'));
  // (4) gdShot(q ≤ 1) ≡ zeroShot(같은 s·q·θ): 판정 원(측정과 같은 판정)·책상 모두 — 해시·스텝·뒤집힘·원 밖·tUp·단서
  const cells = [{ N: 40, seed: 401, s: 0.55, q: 0.9, th: 40 }, { N: 30, seed: 601, s: 0.55, q: 0.9, th: 40 }, { N: 40, seed: 402, s: 0.75, q: 0.6, th: 0 }, { N: 30, seed: 602, s: 0.42, q: 1, th: 12 }];
  let sOk = 0; const txt = [];
  for (const c of cells) {
    const a = G.gdShot(V1.Table, { ...c, judge: 'circle' }), z = G.zeroShot(V1.Table, c);
    const ad = G.gdShot(V1.Table, c), zd = G.zeroShot(V1.Table, { ...c, judge: 'desk' });
    const good = a.hash === z.hash && a.steps === z.steps && a.flips === z.flips && a.outs === z.outs && a.tUp === z.tUp && a.cueT === z.cueT && ad.hash === z.hash && ad.flips === zd.flips && ad.outs === zd.outs && a.blast === 0;
    if (good) sOk++;
    txt.push(`${c.N}장 ${c.seed} (${c.s}, ${c.q}, ${c.th}°) 원 ${a.flips}/${a.outs} 책상 ${ad.flips}/${ad.outs}${good ? '' : ' ×'}`);
    for (const r of [a, z, ad, zd]) r.table.world.free();
  }
  ok('gdShot(q ≤ 1) ≡ zeroShot(s, q, θ) 4칸: 해시·스텝·뒤집힘·원 밖·tUp·단서 같음 · 책상 판정도 zeroShot(judge desk) 와 같음 · 돌풍 0', sOk === cells.length, txt.join(' · '));
  // (4b) 볼 = 헛스윙: gdSwing 경계 · gdShot(θ 5) ≡ zeroShot(θ 0) 해시 · 칩 ⚾(탭한 θ 로)
  { const sw = [0, 5, 9.99, 10, 30].map(G.gdSwing), a = G.gdShot(V1.Table, { N: 40, seed: 401, s: 0.55, q: 0.92, th: 5 }), z = G.zeroShot(V1.Table, { N: 40, seed: 401, s: 0.55, q: 0.92, th: 0, judge: 'desk' });
    ok('볼 = 헛스윙: gdSwing 0/5/9.99/10/30 → 0/0/0/10/30 · gdShot(40장 401, θ 5) ≡ zeroShot(θ 0) 해시·뒤집힘 · 칩 thBall',
      sw.join() === '0,0,0,10,30' && a.hash === z.hash && a.flips === z.flips && a.chip === 'thBall', `${sw.join('/')} · ${a.flips}/${a.outs} ${a.chip} · ${a.hash === z.hash ? '해시 같음' : '해시 다름 ×'}`);
    a.table.world.free(); z.table.world.free(); }
  // (5) gdShot(q > 1) ≡ 인라인 참조(SweepCtl 'zero' q 1 + blowProg power 1 + P.blast = (q − 1)/0.4 — 측정 스크래치 cellShot 'gust' 꼴)
  const ref = (N, seed, s, q, th) => {
    const t = new V1.Table(G.practiceTableSeed(N, seed), { lift: 519.59 }); t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle(600);
    const c = new G.SweepCtl(t, { mode: 'zero', s, q: 1.0, th }); const P = t.blowProg({ prog: c.prog, power: 1.0, dur: c.durCap }); P.blast = Math.min(1.4, (q - 1) / 0.4); c.attach(P);
    const j = { n: 0, quiet: 0 }; let steps = 0; do { t.step(); c.after(t); steps++; } while (!t.stepJudge(j));
    const out = { hash: G.poseHash(t), steps }; t.world.free(); return out;
  };
  let gOk = 0; const gtx = [];
  for (const [N, seed, q] of [[40, 401, 1.05], [40, 403, 1.2], [30, 601, 1.25]]) {
    const a = G.gdShot(V1.Table, { N, seed, s: 0.55, q, th: 40 }), b = ref(N, seed, 0.55, q, 40);
    const good = a.hash === b.hash && a.steps === b.steps && Math.abs(a.blast - (q - 1) / 0.4) < 1e-12;
    if (good) gOk++; gtx.push(`${N}장 ${seed} q ${q} → ${a.flips}/${a.outs} 걸침 ${a.hang}${good ? '' : ' ×'}`);
    a.table.world.free();
  }
  ok('gdShot(q > 1) ≡ 인라인 참조(SweepCtl q 1 · power 1 · P.blast) 3칸(1.05 · 1.2 · 1.25): 해시·스텝', gOk === 3, gtx.join(' · '));
  // (6) judgeDesk ≡ 독립 식(떨어짐 · 판 옆으로 내려감 · 중심이 책상 사각형 밖) — 돌풍 샷의 최종 월드에서 장마다 · 40장 맨 아래 묻힌 장(y ≈ −0.11)은 OUT 아님
  { const t = G.gdShot(V1.Table, { N: 40, seed: 405, s: 0.55, q: 1.22, th: 40 }).table;
    const own = (d) => { if (d.off) return true; const p = d.body.translation(); return p.y < -0.5 || Math.abs(p.x) > V1.DESK_HX || Math.abs(p.z) > V1.DESK_HZ; };
    const L = t.liveDiscs(), J = G.judgeDesk(t);
    const f = L.filter((d) => t.faceUp(d) > 0.2 && !own(d)).length, o = L.filter(own).length, h = L.filter((d) => own(d) && !d.off).length;
    const u = new V1.Table(G.practiceTableSeed(40, 401), { lift: 519.59 }); u.addPile(Array.from({ length: 40 }, (_, i) => i)); u.settle(600);
    const buried = u.liveDiscs().filter((d) => d.body.translation().y < -0.1).length, out0 = G.judgeDesk(u).outs.length;
    ok('judgeDesk ≡ 독립 식(40장 405 q 1.22): 뒤집힘·OUT·걸침 같음 · OUT 이 원 판정보다 적다 · 숨 전 40장 401 묻힌 맨 아래 장은 OUT 아님',
      J.flipped.length === f && J.outs.length === o && J.hang === h && o <= t.judgeResult().outs.length && buried >= 1 && out0 === 0,
      `책상 ${f}/${o} 걸침 ${h} · 원 ${t.judgeResult().flipped.length}/${t.judgeResult().outs.length} · 숨 전 묻힌 장 ${buried} · OUT ${out0}`);
    t.world.free(); u.world.free(); }
  // (7) gdZone 경계표(보류 시드 확인 값 — tools/sweepgd.mjs report: 숨 회색 끝 40장 0.75 · 30장 0.6 · 빨강 1.2 · 스트라이크 ≥ 10 = 아슬 칸 없음) · gdTone · gdTipH(θtop 에서 꼭대기 · 연속 · 단조)
  const Z = [['s', 0.4, 40, 'low'], ['s', 0.45, 40, 'green'], ['s', 0.65, 40, 'green'], ['s', 0.66, 40, 'high'], ['s', 0.75, 40, 'red'], ['s', 0.4, 30, 'green'], ['th', 9.99, 40, 'ball'], ['th', 10, 40, 'strike'], ['th', 12, 30, 'strike'], ['th', 15, 30, 'strike'], ['th', 45, 30, 'strike'],
    ['q', 0.6, 40, 'weak'], ['q', 0.749, 40, 'weak'], ['q', 0.75, 40, 'soft'], ['q', 0.8, 40, 'green'], ['q', 1.199, 40, 'green'], ['q', 1.2, 40, 'red'], ['q', 0.6, 30, 'soft'], ['q', 0.66, 30, 'soft'], ['q', 0.7, 30, 'green'], ['q', 1.199, 30, 'green'], ['q', 1.2, 30, 'red']];
  let nearHit = 0; for (const n of [40, 30]) for (let th = 0; th <= 45; th += 0.05) if (G.gdZone('th', th, n) === 'near') nearHit++; // 아슬 칸 없음(near = ball)
  const zOk = Z.every(([k, v, n, w]) => G.gdZone(k, v, n) === w);
  let tipBad = 0; const top = 4.3, s = 0.55, a0 = G.a0Of(s, top), thTop = G.alphaTop(top) - a0;
  let prev = -1; for (let th = 0; th <= 45; th += 0.25) { const h = G.gdTipH(th, s, top); if (!(h >= prev - 1e-12)) tipBad++; prev = h; }
  const cont = Math.abs(G.gdTipH(thTop, s, top) - G.gdTipH(thTop + 1e-6, s, top)) < 1e-3 && Math.abs(G.gdTipH(thTop, s, top) - top) < 1e-6 && Math.abs(G.gdTipH(45, s, top) - 1.3 * top) < 1e-9;
  ok(`gdZone 경계표 ${Z.length}칸 · θ 0~45°(0.05°) 에 'near' 0번 · gdTone · gdTipH: θtop 에서 = 꼭대기 · 연속 · 0~45° 단조 · 45° = 1.3 × 꼭대기`, zOk && nearHit === 0 && cont && tipBad === 0 && G.gdTone('strike') === 'g' && G.gdTone('ball') === 'r' && G.gdTone('weak') === 'w' && G.gdTone('near') === 'y',
    `${Z.map(([k, v, n]) => G.gdZone(k, v, n)).join(',')} · near ${nearHit} · θtop ${thTop.toFixed(2)}°`);
  // (8) gdChip 단위 예(결과 먼저 → 가장 나쁜 박자)
  const U = [[{ n: 40, s: 0.55, q: 0.9, th: 40, flip: 31 }, 'good'], [{ n: 40, s: 0.55, q: 1.2, th: 40, flip: 25 }, 'qGust'], [{ n: 40, s: 0.8, q: 0.9, th: 40, flip: 28 }, 'zHigh'], [{ n: 40, s: 0.55, q: 0.65, th: 40, flip: 20 }, 'qWeak'],
    [{ n: 40, s: 0.55, q: 0.9, th: 5, flip: 20 }, 'thBall'], [{ n: 40, s: 0.42, q: 0.9, th: 40, flip: 29 }, 'zLow'], [{ n: 40, s: 0.55, q: 0.9, th: 12, flip: 29 }, 'mixed'], [{ n: 40, s: 0.55, q: 0.9, th: 10, flip: 29 }, 'mixed'], [{ n: 40, s: 0.55, q: 0.9, th: 40, flip: 29 }, 'mixed'],
    [{ n: 40, s: 0.55, q: 0.7, th: 40, flip: 27 }, 'qWeak'], [{ n: 40, s: 0.55, q: 1.19, th: 40, flip: 29 }, 'mixed'], [{ n: 30, s: 0.55, q: 0.6, th: 30, flip: 22 }, 'qWeak'],
    [{ n: 30, s: 0.55, q: 0.95, th: 30, flip: 24 }, 'good'], [{ n: 30, s: 0.55, q: 0.95, th: 30, flip: 23 }, 'mixed']];
  ok(`gdChip 단위 예 ${U.length}칸(좋아요 ≥ 0.85 × 책상 지배 칸 40장 36 · 30장 28 · θ 10~12 = 스트라이크(아슬 칩 없음) · 40장 q 0.7 = 회색 · 30장 q 0.6 = 노랑 · 1.19 = 초록)`, U.every(([r, w]) => G.gdChip(r) === w), U.map(([r, w]) => `${G.gdChip(r)}${G.gdChip(r) === w ? '' : '×'}`).join(' · '));
  // (9) 정적 검사(main.js): 조종 모드 직접 비교('zero')는 ctlG 안 1건뿐 · 책상 판정은 sweep.js 함수만 · D 발사는 gdPower + gdArm
  const src = readFileSync(new URL('../mockup/src/main.js', import.meta.url), 'utf8');
  const lines = src.split('\n'), zeroCmp = lines.filter((l) => /mode\s*[!=]==\s*'zero'/.test(l));
  const inCtlG = zeroCmp.filter((l) => /function ctlG\(/.test(l)).length;
  const ownDesk = /DESK_HX|DESK_HZ|Math\.abs\(p\.x\)\s*>\s*11/.test(src);
  const ownRing = /Math\.hypot\(p\.x, p\.z\)\s*>\s*(5|Sweep\.GD_RING)/.test(src);
  ok("main.js 정적 검사: 조종 모드 'zero' 직접 비교 = ctlG 안 1건뿐 · 자체 책상·원 식 없음(Sweep.judgeDesk·deskOut 만, 조합 out 을 넘김) · D 발사 = Sweep.gdPower + Sweep.gdArm(조합) · 손·주입 발사 둘 다 Sweep.gdSwing",
    zeroCmp.length === 1 && inCtlG === 1 && !ownDesk && !ownRing && /Sweep\.judgeDesk\(table, \{ out: swGdMode\(\)\.out \}\)/.test(src) && /Sweep\.deskOut\(d, out\)/.test(src) && /Sweep\.deskOut\(d, swGdMode\(\)\.out\)/.test(src)
      && /Sweep\.gdArm\(P, raw\.q, swGdMode\(\)\)/.test(src) && /Sweep\.gdPower\(raw\.q\)/.test(src) && (src.match(/th: Sweep\.gdSwing\(/g) || []).length === 2 && !/Sweep\.GD\b(?!_)/.test(src.replace(/Sweep\.GD_RING/g, '')),
    `'zero' 비교 ${zeroCmp.length}줄(ctlG ${inCtlG}) · 자체 책상 식 ${ownDesk} · 자체 원 식 ${ownRing}`);
  await ctlGDModes();
}

// ───────────────────────── ctl: 문법 D 비교 토글(⚙ '숨 난이도' × '아웃 범위') ─────────────────────────
async function ctlGDModes() {
  console.log("문법 D 비교 토글 (sweep.js gdMode · gdCfg · GD_COMBO · judgeDesk out 'r5' — 기본 = 옛 결과 · 어려움 = 손잡이 (b) · 반지름 5 판정 게임 = 측정 도구)");
  const GDT = await import('./sweepgd.mjs');
  // (1) 기본 조합 = 바꾸기 전: gdCfg() 가 GD 자신 · gdKey · 주입 4칸 = 커밋 d2ebb42 결과 · 같은 칸 mode 명시 = 같은 해시
  const def = [undefined, {}, { q: 'normal', out: 'desk' }, 'desk|normal'];
  const same = REF_GD_CELLS.map((c, i) => { const a = G.gdShot(V1.Table, c), b = G.gdShot(V1.Table, { ...c, mode: { q: 'normal', out: 'desk' } }), w = REF_GD_BEFORE[i];
    const good = [a.flips, a.outs, a.hang, a.steps, a.chip, a.hash].join() === w.join() && b.hash === a.hash && b.flips === a.flips && b.chip === a.chip && a.mode === 'desk|normal';
    a.table.world.free(); b.table.world.free(); return good; });
  ok('기본 조합 = 바꾸기 전: gdCfg(없음 · {} · 보통/책상 · "desk|normal") === GD · 주입 4칸 뒤집힘·책상 밖·걸침·스텝·칩·해시 = 커밋 d2ebb42 값 · mode 명시 = 같은 해시',
    def.every((m) => G.gdCfg(m) === G.GD && G.gdKey(m) === 'desk|normal') && same.every(Boolean), same.map((x) => (x ? 'O' : 'X')).join(''));
  // (2) 기본 칸·돌풍 = 옛 식(GD 직접 읽는 독립 식): s · th · q 격자(30·40장) · gdBlast · gdPeakRef · gdChip(단위 예 ≡ mode 없음)
  const oldZone = (k, v, n) => { const kk = n >= 35 ? 40 : 30, D = G.GD; if (k === 's') { const [lo, hi] = D.s.green[kk]; return v >= D.s.red ? 'red' : v > hi ? 'high' : v >= lo ? 'green' : 'low'; } if (k === 'th') return v < D.th.ball ? 'ball' : v < D.th.near ? 'near' : 'strike'; return v >= D.q.red ? 'red' : v >= D.q.green[kk] ? 'green' : v >= D.q.weak[kk] ? 'soft' : 'weak'; };
  let zb = 0, zt = 0;
  for (const n of [30, 40]) for (const [k, a, b, st] of [['s', 0.4, 1, 0.005], ['th', 0, 45, 0.05], ['q', 0.6, 1.25, 0.0025]]) for (let v = a; v <= b + 1e-9; v += st) { zt++; for (const m of def) if (G.gdZone(k, v, n, m) !== oldZone(k, v, n)) zb++; }
  let bb = 0; for (let q = 0.6; q <= 1.25 + 1e-9; q += 0.005) if (!Object.is(G.gdBlast(q), q > 1 ? Math.min(1.4, (q - 1) / 0.4) : 0) || !Object.is(G.gdBlast(q, { q: 'normal', out: 'r5' }), G.gdBlast(q))) bb++;
  ok(`기본 칸 = 옛 식(격자 ${zt}점 × 기본 표기 4가지 다름 ${zb}) · gdBlast(보통, 책상·반지름 5) = (q − 1)/0.4 비트 · gdPeakRef 36·28`, zb === 0 && bb === 0 && G.gdPeakRef(40) === 36 && G.gdPeakRef(30) === 28 && G.gdPeakRef(40, {}) === 36, `칸 ${zb} · 돌풍 ${bb}`);
  // (3) 어려움 = sweepgd 손잡이 (b): blastSpan 0.25 = MAPS.b · gdBlast(1.2, 어려움) = 0.8 · gdShot(어려움) ≡ armShot('b') 해시 2칸 · q ≤ 1 은 보통과 같은 해시 · 어려움 ≢ 보통(q 1.15)
  const H = { q: 'hard', out: 'desk' }, cH = G.gdCfg(H);
  const hc = [{ N: 40, seed: 402, s: 0.55, q: 1.15, th: 30 }, { N: 30, seed: 602, s: 0.55, q: 1.225, th: 30 }].map((c) => { const g = G.gdShot(V1.Table, { ...c, mode: H }), a = GDT.armShot({ ...c, map: 'b' }), n = G.gdShot(V1.Table, c);
    const r = [g.hash === a.hash && g.flips === a.flips && g.outs === a.outs && g.steps === a.steps && Math.abs(g.blast - a.blast) < 1e-12, g.hash !== n.hash, `${c.N}장 ${c.seed} q ${c.q}: 어려움 ${g.flips}/${g.outs} 보통 ${n.flips}/${n.outs}`];
    for (const x of [g, a, n]) x.table.world.free(); return r; });
  const lo = G.gdShot(V1.Table, { N: 40, seed: 403, s: 0.55, q: 0.95, th: 30, mode: H }), ln = G.gdShot(V1.Table, { N: 40, seed: 403, s: 0.55, q: 0.95, th: 30 });
  ok("어려움 = 손잡이 (b): blastSpan 0.25 = sweepgd MAPS.b · gdBlast(1.2) 0.8 · gdShot(어려움) ≡ armShot('b') 해시 2칸 · ≢ 보통 · q 0.95(≤ 1) 어려움 = 보통 해시 · 영점·각도·peak 숫자 = 보통",
    cH.blastSpan === GDT.MAPS.b.span && GDT.MAPS.b.q0 === 1 && Math.abs(G.gdBlast(1.2, H) - 0.8) < 1e-12 && hc.every((x) => x[0] && x[1]) && lo.hash === ln.hash && lo.flips === ln.flips
      && JSON.stringify(cH.s) === JSON.stringify(G.GD.s) && JSON.stringify(cH.th) === JSON.stringify(G.GD.th) && JSON.stringify(cH.peak) === JSON.stringify(G.GD.peak) && cH.q.red < G.GD.q.red,
    hc.map((x) => x[2]).join(' · ') + ` · 빨강 ${cH.q.red}`);
  lo.table.world.free(); ln.table.world.free();
  // (4) 반지름 5 판정: gdShot(r5) = 같은 월드(해시 = 책상) · judgeDesk(t, { out: 'r5' }) = 독립 식(책상 밖 또는 원점에서 5 밖) · = sweepgd shotRow(flipR · outR · ringR) · OUT ≥ 책상 · 뒤집힘 ≤ 책상
  let rOk = 0; const rtx = [];
  for (const c of [{ N: 40, seed: 405, s: 0.55, q: 1.15, th: 40 }, { N: 30, seed: 605, s: 0.7, q: 1.0, th: 30 }, { N: 40, seed: 406, s: 0.55, q: 1.22, th: 40 }]) {
    const d = G.gdShot(V1.Table, c), r = G.gdShot(V1.Table, { ...c, mode: { out: 'r5' } }), t = r.table;
    const own = (x) => { if (x.off) return true; const p = x.body.translation(); return p.y < -0.5 || Math.abs(p.x) > V1.DESK_HX || Math.abs(p.z) > V1.DESK_HZ || Math.hypot(p.x, p.z) > 5; };
    const L = t.liveDiscs(), f = L.filter((x) => t.faceUp(x) > 0.2 && !own(x)).length, o = L.filter(own).length;
    const row = GDT.shotRow({ N: c.N, seed: c.seed, kind: 'gd', map: 'a', s: c.s, q: c.q, th: c.th, key: 'ctl' });
    const good = r.hash === d.hash && r.flips === f && r.outs === o && row.flipR === r.flips && row.outR === r.outs && row.ringR === r.ring && row.flip === d.flips && r.outs >= d.outs && r.flips <= d.flips && r.mode === 'r5|normal' && G.GD_RING === 5;
    if (good) rOk++; rtx.push(`${c.N}장 ${c.seed} q ${c.q}: 책상 ${d.flips}/${d.outs} · 반지름 5 ${r.flips}/${r.outs}(원 밖 책상 위 ${r.ring})${good ? '' : ' ×'}`);
    d.table.world.free(); t.world.free();
  }
  ok("반지름 5 판정: 같은 월드(해시 = 책상) · 게임 함수 judgeDesk(out 'r5') = 독립 식 = sweepgd 줄(flipR·outR·ringR) · OUT ≥ 책상 · 뒤집힘 ≤ 책상 3칸", rOk === 3, rtx.join(' · '));
  // (5) GD_COMBO 숫자 = 측정(sweepgd report --json '비교 토글 4 조합': 조합마다 문턱 11 + peak 2 모두 버팀)
  { const { execFileSync } = await import('node:child_process');
    const J = JSON.parse(execFileSync(process.execPath, [new URL('./sweepgd.mjs', import.meta.url).pathname, 'report', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }));
    const C = J.combos || {}, keys = Object.keys(C), bad = keys.flatMap((k) => C[k].proposals.filter((x) => !x.holds).map((x) => `${k} ${x.name} ${JSON.stringify(x.game)} → ${JSON.stringify(x.proposed)}`));
    const cfgSame = keys.every((k) => JSON.stringify(C[k].cfg.q) === JSON.stringify(G.gdCfg(k).q) && JSON.stringify(C[k].cfg.s) === JSON.stringify(G.gdCfg(k).s) && JSON.stringify(C[k].cfg.peak) === JSON.stringify(G.gdCfg(k).peak));
    ok(`GD_COMBO 숫자 = 보류 시드 측정(sweepgd report): 4 조합 × 문턱·peak 13개 모두 버팀`, keys.join() === GDT.COMBOS.join() && keys.every((k) => C[k].proposals.length === 13) && !bad.length && cfgSame,
      bad.length ? bad.join(' · ') : keys.map((k) => `${k} peak ${C[k].cfg.peak[40]}/${C[k].cfg.peak[30]} 빨강 ${C[k].cfg.q.red}`).join(' · ')); }
}

// ───────────────────────── ctl: 문법 B '놓고 쓸기' ─────────────────────────
async function ctlGB(mk) {
  console.log("문법 B '놓고 쓸기' (sweep.js GB · Flick · SweepCtl 'flick' · flickShot)");
  const GB = await import('./sweepgb.mjs');
  // (1) 값 = 측정이 고른 값
  const dqOk = Object.entries(GB.CHOSEN.dq).every(([q, D]) => G.gbD(+q) === D);
  let mono = true, prev = -1;
  for (let q = 0; q <= 1.25 + 1e-9; q += 0.005) { const d = G.gbD(q); if (d < prev || d < 0.6 || d > 1) mono = false; prev = d; }
  const chipSame = ['early', 'late', 'rem', 'good'].every((k) => G.GB_CHIP[k] === GB.CHIP[k]) && JSON.stringify(G.GB_CHIP.peak) === JSON.stringify(GB.CHIP.peak);
  ok("GB = 측정 고른 값: 쓸기 'w80·A24' · D(q) 0.7/0.85/1 → 0.6/0.8/1.0(비트) · 0.6~1.0 단조 · 칩 규칙(꼭대기 0.85 × 20/25장 · 23°/85°/0.12 s) = sweepgb CHIP",
    GB.CHOSEN.sw[0] === `w${G.GB.w}·A${G.GB.A}` && dqOk && mono && chipSame,
    `sw ${GB.CHOSEN.sw[0]} · D(q) ${Object.keys(GB.CHOSEN.dq).map((q) => G.gbD(+q)).join('/')} · 단조 ${mono}`);
  // (2) 휙 인식기 표 (벽시계 ms · px, 16 ms 간격)
  const drive = (pts, upAt) => { const f = new G.Flick(); let at = null; f.down(0, pts[0][1], pts[0][0]); for (let i = 1; i < pts.length; i++) if (f.move(0, pts[i][1], pts[i][0]) && at == null) at = pts[i][0]; if (upAt && f.up(0, upAt[1], upAt[0]) && at == null) at = upAt[0]; return at; };
  const lin = (t0, y0, t1, y1) => { const a = []; for (let t = t0; t <= t1 + 1e-9; t += 16) a.push([t, y0 + ((y1 - y0) * (t - t0)) / Math.max(1, t1 - t0)]); return a; };
  const R = mulberry(16);
  const cases = [
    ['탭(움직임 없음)', drive([[0, 500], [80, 500]], [96, 500]), false],
    ['느린 끌기 12 px / 400 ms', drive(lin(0, 500, 400, 488), [416, 488]), false],
    ['아주 느린 끌기 60 px / 3 s', drive(lin(0, 500, 3000, 440), [3016, 440]), false],
    ['떨림 ±4 px 2 s', drive(Array.from({ length: 125 }, (_, i) => [i * 16, 500 + (R() * 8 - 4)]), [2016, 500]), false],
    ['12 px / 100 ms', drive([[0, 500], ...lin(16, 500, 112, 488)], [128, 488]) != null, true],
    ['빠른 휙 40 px / 48 ms', drive([[0, 500], ...lin(16, 500, 64, 460)], [80, 460]) != null, true],
    ['뗄 때만 휙(움직임 사건 없이 30 ms 뒤 30 px 위에서 뗌)', drive([[0, 500]], [30, 470]) != null, true],
    ['누른 채 1 s 머문 뒤 12 px / 64 ms', drive([[0, 500], [1000, 500], ...lin(1016, 500, 1080, 488)], [1096, 488]) != null, true],
    ['20 px 내렸다 12 px 올림(최저점 기준)', drive([[0, 500], ...lin(16, 500, 96, 520), ...lin(112, 520, 160, 508)], [176, 508]) != null, true],
  ];
  const cOk = cases.every(([, got, want]) => !!got === want);
  const f1 = new G.Flick(); f1.down(0, 500, 0); const a1 = f1.move(0, 470, 16), a2 = f1.move(0, 400, 32), a3 = f1.up(0, 380, 48);
  ok('휙 인식기: 탭·느린 끌기·떨림 = 안 휙 · 12 px/100 ms·빠른 휙·뗄 때 휙·머문 뒤 휙·내렸다 올림 = 휙 · 한 누름에 한 번', cOk && a1 && !a2 && !a3, cases.map(([n, got, want]) => `${n} ${!!got === want ? '○' : '×'}`).join(' · '));
  // (3) 당김 인식기(GestureB = GB_GCFG + 옆 빼기는 당기는 동안의 x): '푸'를 안 열고(blowStart 없음) 떼면 'puff'(= 놓기) — 한 획 휙·느린 밀기도 취소 아님.
  //     옆 빼기(당기는 동안 30%)·덜 당김은 취소. 같은 획의 위로 휙에서 옆으로 흐른 것(엄지 호, 검토: 휙 220 px 위 + 옆 ±120 px)은 취소 아님
  const pullRun = (fn) => { const g = new G.GestureB(W0, H0); const ev = []; const call = (m, ...a) => { const r = g[m](...a); if (r?.ev === 'blowStart') ev.push(r); return r; }; const out = fn(call); return { out, opened: ev.length }; };
  const oneStroke = pullRun((c) => { let t = 0; c('down', 195, 500, t); for (let i = 1; i <= 19; i++) c('move', 195, 500 + (156 * i) / 19, (t += 16)); for (let i = 1; i <= 4; i++) c('move', 195, 656 - 20 * i, (t += 16)); return c('up', 195, 576, t + 8); });
  const slowPush = pullRun((c) => { let t = 0; c('down', 195, 500, t); for (let i = 1; i <= 19; i++) c('move', 195, 500 + (160 * i) / 19, (t += 16)); t += 200; for (let i = 1; i <= 188; i++) { t += 16; c('move', 195, 660 - (60 * i) / 188, t); c('tick', t); } return c('up', 195, 600, t + 8); });
  const side = pullRun((c) => { c('down', 195, 500, 0); c('move', 195, 600, 100); c('move', 350, 600, 200); return c('up', 350, 600, 216); });
  const tiny = pullRun((c) => { c('down', 195, 500, 0); c('move', 195, 505, 100); return c('up', 195, 505, 116); });
  const drift = (dx) => pullRun((c) => { let t = 0; c('down', 195, 500, t); for (let i = 1; i <= 19; i++) c('move', 195, 500 + (156 * i) / 19, (t += 16)); for (let i = 1; i <= 8; i++) c('move', 195 + (dx * i) / 8, 656 - (220 * i) / 8, (t += 16)); return c('up', 195 + dx, 436, t + 8); });
  const dL = drift(-125), dR = drift(125);
  const sideRel = pullRun((c) => { let t = 0; c('down', 195, 500, t); for (let i = 1; i <= 19; i++) c('move', 195 + (130 * i) / 19, 500 + (156 * i) / 19, (t += 16)); return c('up', 325, 656, t + 8); });
  ok("당김 인식기 GestureB: 한 획(당김 156 px → 80 px 휙 → 뗌) = 놓기 'puff'·세기 = 가장 깊이 · '푸' 안 열림 · 느린 밀기도 놓기 · 한 획 휙 + 옆 ±125 px = 놓기 · 옆 빼기(당기며 130 px·당긴 뒤 옆)·덜 당김 = 취소",
    oneStroke.out.kind === 'puff' && oneStroke.opened === 0 && Math.abs(oneStroke.out.p - G.pouchPower(156 / (390 * 0.42))) < 1e-12 && slowPush.out.kind === 'puff' && slowPush.opened === 0
      && dL.out.kind === 'puff' && dR.out.kind === 'puff' && side.out.kind === 'cancel' && side.out.side === true && sideRel.out.kind === 'cancel' && sideRel.out.side === true && tiny.out.kind === 'cancel' && tiny.out.side === false,
    `한 획 ${oneStroke.out.kind} p ${oneStroke.out.p.toFixed(3)} 열림 ${oneStroke.opened} · 느린 밀기 ${slowPush.out.kind} · 휙+옆 ${dL.out.kind}/${dR.out.kind} · 옆 ${side.out.kind}/${sideRel.out.kind} · 덜 당김 ${tiny.out.kind}`);
  // (4) flick ≡ plan: prog 출력 비트(일정 휙 t0 3개 · 안 휙) · durCap
  let bad = 0, tot = 0;
  for (const n of [30, 40]) for (const q of [0.7, 0.85, 1.0]) for (const ts of [0.1, 0.3, 0.55, null]) {
    const t = mk(n, 401), D = G.gbD(q);
    const c = new G.SweepCtl(t, { mode: 'flick', q });
    if (ts != null) c.flick(ts);
    const ref = new G.SweepCtl(t, { mode: 'plan', plan: { A: ts == null ? 0 : 24, w: 80, t0: ts ?? 0, D } });
    for (let i = 0; i <= 125; i++) { const tt = i / 120, x = c.prog(tt), y = ref.prog(tt); for (const k of ['phi', 'env', 'ux', 'uz']) { tot++; if (!Object.is(x[k], y[k])) bad++; } for (const k of ['x', 'y', 'z']) { tot++; if (!Object.is(x.o[k], y.o[k])) bad++; } }
    tot += 2; if (c.durCap !== ref.durCap) bad++; if (c.D !== D) bad++;
  }
  ok("flick ≡ plan {A 24, w 80, t0, D(q)} (안 휙 = A 0): prog 출력 비트 · durCap = D + 0.04", bad === 0, `${tot - bad}/${tot}`);
  // (5) 손 휙(그 스텝 전에 요청 → 그 스텝 t 로 잠금) · 숨 끝 뒤 휙 · 두 번째 휙 = planShot 해시
  const rows = [];
  let sOk = 0, sTot = 0;
  for (const [N, seed, q] of [[40, 401, 0.85], [30, 601, 0.7]]) for (const k of [0, 30, 42, 66, 200]) {
    const s = G.flickShot(V1.Table, { N, seed, q, flickNow: k });
    const p = G.planShot(V1.Table, { N, seed, q, plan: s.t0 == null ? { A: 0, w: 80, t0: 0, D: G.gbD(q) } : { A: 24, w: 80, t0: s.t0, D: G.gbD(q) } });
    const late = k * (1 / 120) > G.gbD(q) + 0.04;
    const good = s.hash === p.hash && s.flips === p.flips && s.outs === p.outs && s.steps === p.steps && (late ? s.t0 == null && s.chip === 'none' : s.t0 != null);
    sTot++; if (good) sOk++;
    rows.push(`${N}장 ${seed} q${q} 스텝 ${k} → t0 ${s.t0 == null ? '없음' : s.t0.toFixed(4)} ${s.flips}장 ${s.chip}${good ? '' : ' ×'}`);
  }
  { // 두 번째 휙은 무시
    const t = mk(40, 401), c = new G.SweepCtl(t, { mode: 'flick', q: 0.85 });
    c.attach(t.blowProg({ prog: c.prog, power: 0.85, dur: c.durCap }));
    const f1 = c.flick(); for (let i = 0; i < 10; i++) { t.step(); c.after(t); }
    const t0a = c.t0, f2 = c.flick(); for (let i = 0; i < 10; i++) { t.step(); c.after(t); }
    sTot++; if (f1 && !f2 && c.t0 === t0a && t0a === 0) sOk++; else rows.push(`두 번째 휙 × (${f1}/${f2} t0 ${t0a}/${c.t0})`);
  }
  ok("손 휙(스텝 0·30·42·66 → 그 스텝 t 로 잠금)·숨 끝 뒤 휙(스텝 200 = 안 휙)·두 번째 휙 무시 = planShot 해시·뒤집힘·원 밖·스텝", sOk === sTot, `${sOk}/${sTot} · ${rows.join(' · ')}`);
  // (6) flickShot(일정 휙) = 측정 원자료 줄 비트(학습 시드 grid · 보류 시드 held, 고른 쓸기·D(q)·안 휙)
  const raw = GB.readRows(new URL('./coresweep/data/gb/grid.jsonl.gz', import.meta.url).pathname + ',' + new URL('./coresweep/data/gb/held.jsonl.gz', import.meta.url).pathname)
    .filter((r) => (r.kind === 'gb' && r.sw === GB.CHOSEN.sw[0] && GB.CHOSEN.dq[r.q] === r.D) || (r.kind === 'never' && GB.CHOSEN.dq[r.q] === r.D));
  const stride = Math.max(1, Math.floor(raw.length / 14));
  let mOk = 0, mTot = 0;
  const chipOf = GB.chipOf; // sweepgb report ⑩ 식 그대로
  const bads = [];
  for (let i = 0; i < raw.length && mTot < 14; i += stride) {
    const r = raw[i];
    const s = G.flickShot(V1.Table, { N: r.N, seed: r.seed, q: r.q, ts: r.kind === 'gb' ? r.ts : null });
    const good = s.hash === r.hash && s.flips === r.flip && s.outs === r.out && s.steps === r.steps && s.tTop === r.tTop && s.ttF === r.ttF && s.cueT === (r.cue.tt10 ?? -1) && s.chip === chipOf(r);
    mTot++; if (good) mOk++; else bads.push(`${r.N}|${r.seed}|${r.key}`);
  }
  ok('flickShot(일정 휙·안 휙) = 측정 원자료 줄(grid·held): 해시·뒤집힘·원 밖·스텝·꼭대기 넘음·ttF·단서 시각·칩', mOk === mTot && mTot >= 12, `${mOk}/${mTot}${bads.length ? ' 다름 ' + bads.join(', ') : ''}`);
  // (7) 칩 함수 전체 대조: 게임 gbChip(요약 입력) ≡ sweepgb chipOf — 고른 쓸기·D(q) 의 모든 원자료 줄
  let cBad = 0;
  for (const r of raw) if (G.gbChip({ ts: r.kind === 'gb' ? r.ts : null, ttF: r.ttF, D: r.Deff, tTop: r.tTop, flip: r.flip, n: r.N }) !== chipOf(r)) cBad++;
  ok('칩 함수 gbChip ≡ sweepgb chipOf (고른 쓸기·D(q) 원자료 줄 전부)', cBad === 0 && raw.length > 1000, `${raw.length - cBad}/${raw.length}`);
}

// ───────────────────────── ctl: 문법 C '영점 조준' ─────────────────────────
async function ctlGC(mk) {
  console.log("문법 C '영점 조준' (sweep.js GC · a0Of · meterAt · thOfRise · SweepCtl 'zero' · zeroShot · gcChip ≡ tools/sweepgc.mjs)");
  const SC = await import('./sweepgc.mjs');
  // (1) 상수 = 측정 정의
  ok("GC = sweepgc 상수(S_BASE 0.4 · D_FLOOR 2 · W_UP 80 · FB 0.4 · RULE 'cue10+0.15' · 지배 칸 · 아래 모서리 각)",
    G.GC.sBase === SC.S_BASE && G.GC.sMin === SC.S_BASE && G.GC.sMax === 1 && G.GC.dFloor === SC.D_FLOOR && G.GC.w === SC.W_UP && G.GC.fb === SC.FB && `cue${G.GC.cueTT}+${G.GC.cueD}` === SC.RULE
      && JSON.stringify(G.GC.dom) === JSON.stringify(SC.DOM) && Object.is(G.GC_A_BASE, SC.A_BASE),
    `S_BASE ${SC.S_BASE} · W_UP ${SC.W_UP} · FB ${SC.FB} · RULE ${SC.RULE} · A_BASE ${G.GC_A_BASE.toFixed(4)}°`);
  // (2) a0Of 비트: s 0.40~1.00(0.01) × 장수 10·20·30·40 × 시드 801·401·601 정착 꼭대기
  let bad = 0, tot = 0;
  const tops = [];
  for (const N of [10, 20, 30, 40]) for (const seed of [801, 401, 601]) { const t = new V1.Table(G.practiceTableSeed(N, seed), { lift: 519.59 }); t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle(600); tops.push(t.columnTop()); t.world.free(); }
  for (const top of tops) for (let i = 0; i <= 60; i++) { const s = +(0.4 + i * 0.01).toFixed(2); tot++; if (!Object.is(G.a0Of(s, top), SC.a0Of(s, top))) bad++; }
  let thr = false; try { G.a0Of(0.39, 1.4); } catch { thr = true; }
  ok('a0Of(s 0.40~1.00 × 꼭대기 12개) ≡ sweepgc a0Of: Object.is 비트 · 바닥(s < 0.4)은 거부', bad === 0 && thr, `${tot - bad}/${tot} · 40장 401 꼭대기 ${tops[10].toFixed(3)} u: s 0.4/0.55/0.7/1 → ${[0.4, 0.55, 0.7, 1].map((s) => G.a0Of(s, tops[10]).toFixed(2)).join('/')}°`);
  // (3) zero prog ≡ GcCtl prog(고정 tUp 0.3 일정): s 줄 × θ{0, 12, 40} × q{0.7, 0.9, 1}, t 0~1.04 s 0.001 간격 · phi·env·o·ux·uz 비트 · durCap = D + 0.04
  bad = 0; tot = 0;
  for (const [N, seed] of [[40, 401], [30, 601]]) {
    const t = mk(N, seed);
    for (const s of SC.LINE_S) for (const th of [0, 12, 40]) for (const q of [0.7, 0.9, 1]) {
      const z = new G.SweepCtl(t, { mode: 'zero', s, q, th }); z.lock(0.3);
      const g = new SC.GcCtl(t, { a0: SC.a0Of(s, t.columnTop()), theta: th, q, rule: 'fix0.3', floor: 'wall' });
      for (let i = 0; i <= 1040; i++) { const tt = i / 1000, x = z.prog(tt), y = g.prog(tt); for (const k of ['phi', 'env', 'ux', 'uz']) { tot++; if (!Object.is(x[k], y[k])) bad++; } for (const k of ['x', 'y', 'z']) { tot++; if (!Object.is(x.o[k], y.o[k])) bad++; } }
      tot += 3; if (z.durCap !== g.dur) bad++; if (z.D !== g.D) bad++; if (z.floorHit !== 0) bad++;
    }
  }
  ok("SweepCtl 'zero' prog ≡ sweepgc GcCtl prog(고정 tUp 0.3 · s 8칸 × θ 0/12/40 × q 0.7/0.9/1 · 40장 401·30장 601): 비트 · durCap · 바닥 닿음 0", bad === 0, `${tot - bad}/${tot}`);
  // (4) α0 0 이면 plan 과 같은 일정: θ 0 ≡ plan {A 0} · θ 24 + lock(T) ≡ plan {A 24, w 80, t0 T}
  bad = 0; tot = 0;
  { const t = mk(40, 401);
    for (const q of [0.7, 0.85, 1]) for (const [th, T] of [[0, 0], [24, 0.3], [24, 0.45]]) {
      const z = new G.SweepCtl(t, { mode: 'zero', a0: 0, q, th }); z.lock(T);
      const p = new G.SweepCtl(t, { mode: 'plan', plan: { A: th, w: 80, t0: T, D: G.gbD(q) } });
      for (let i = 0; i <= 1040; i++) { const tt = i / 1000, x = z.prog(tt), y = p.prog(tt); for (const k of ['phi', 'env']) { tot++; if (!Object.is(x[k], y[k])) bad++; } for (const k of ['x', 'y', 'z']) { tot++; if (!Object.is(x.o[k], y.o[k])) bad++; } }
      tot++; if (z.durCap !== p.durCap) bad++;
    } }
  ok('α0 0 · θ 0 ≡ plan {A 0, D(q)} · α0 0 · θ 24 · 고정 시작 T ≡ plan {A 24, w 80, t0 T, D(q)}: prog 비트', bad === 0, `${tot - bad}/${tot}`);
  // (5) zeroShot ≡ gcShot (같은 칸 6개 — θ 0 은 sweepgc 'fix0' 줄이라 tUp 0 고정으로)
  const rowsShot = [];
  let sOk = 0, sTot = 0, fh = 0;
  const cells = [{ N: 40, seed: 805, s: 0.55, q: 0.9, th: 40 }, { N: 40, seed: 806, s: 0.4, q: 0.7, th: 40 }, { N: 30, seed: 807, s: 0.8, q: 1, th: 16 }, { N: 30, seed: 808, s: 0.65, q: 0.85, th: 12 }, { N: 20, seed: 809, s: 1, q: 0.9, th: 20 }, { N: 10, seed: 810, s: 0.5, q: 0.6, th: 0 }];
  for (const c of cells) {
    const z = G.zeroShot(V1.Table, { ...c, tUp: c.th === 0 ? 0 : null });
    const g = SC.gcShot({ ...c, kind: 'gc', rule: c.th === 0 ? 'fix0' : SC.RULE, floor: 'wall', key: 'x' });
    const good = z.hash === g.hash && z.flips === g.flip && z.outs === g.out && z.steps === g.steps && z.tUp === g.tUp && z.cueT === g.cueT && z.ttUp === g.ttUp && z.floorHit === 0 && g.floorSteps === 0;
    fh += z.floorHit; sTot++; if (good) sOk++;
    rowsShot.push(`${c.N}장 ${c.seed} (${c.s}, ${c.q}, ${c.th}°) ${z.flips}장 tUp ${z.tUp} 단서 ${z.cueT}${good ? '' : ' ×'}`);
    z.table.world.free();
  }
  ok('zeroShot ≡ sweepgc gcShot (칸 6개: 해시·뒤집힘·원 밖·스텝·tUp·단서·ttUp · 바닥 닿음 0)', sOk === sTot && fh === 0, `${sOk}/${sTot} · ${rowsShot.join(' · ')}`);
  // (6) zeroShot ≡ 측정 원자료 줄(map·held 기둥 줄 고르게 18개)
  const raw = SC.readRows(`${SC.MAP_FILE},${SC.HELD_FILE}`).filter((r) => r.kind === 'gc' && r.floor === 'wall' && r.s >= SC.S_BASE);
  const evenly = (arr, k) => { const st = arr.length / k; return Array.from({ length: k }, (_, i) => arr[Math.floor(i * st + st / 2)]); };
  const pick = [...evenly(raw.filter((r) => r.seed <= 812), 10), ...evenly(raw.filter((r) => r.seed >= 813), 8)];
  let mOk = 0; const bads = [];
  for (const r of pick) {
    const z = G.zeroShot(V1.Table, { N: r.N, seed: r.seed, s: r.s, q: r.q, th: r.th, tUp: r.rule === 'fix0' ? 0 : null });
    const good = z.hash === r.hash && z.flips === r.flip && z.outs === r.out && z.steps === r.steps && z.tUp === r.tUp && z.cueT === r.cueT && z.ttUp === r.ttUp && z.tTop === r.tTop && z.maxTT === r.maxTT && z.maxTB === r.maxTB && z.a0 === r.a0 && z.floorHit === r.floorSteps;
    if (good) mOk++; else bads.push(`${r.N}|${r.seed}|${r.key}`);
    z.table.world.free();
  }
  ok('zeroShot ≡ 측정 원자료 줄(map 10 · held 8 기둥 줄: 해시·뒤집힘·원 밖·스텝·tUp·단서·ttUp·꼭대기 넘음·maxTT·maxTB·α0·바닥 스텝)', mOk === pick.length && pick.length >= 16, `${mOk}/${pick.length}${bads.length ? ' 다름 ' + bads.join(', ') : ''}`);
  // (7) 눈금·엄지 식 표
  bad = 0; tot = 0;
  const near = (a, b) => Math.abs(a - b) <= 1e-12;
  for (const knob of ['s', 'th', 'q']) for (const T of G.GC.meter.Ts) {
    const [r0, r1] = G.GC.meter.range[knob], mid = r0 + (r1 - r0) / 2;
    const down = knob === 's', [lo, hi] = down ? [r1, r0] : [r0, r1]; // 영점은 꼭대기에서 내려오며 출발(검토: 아래 끝 출발이면 띠가 반응 속도 시험이 됨) · 각도·세기는 낮은 끝에서 오르며
    for (const [ms, want] of [[0, lo], [200, lo], [400, lo], [400 + T / 4, mid], [400 + T / 2, hi], [400 + (3 * T) / 4, mid], [400 + T, lo], [400 + 2 * T + T / 2, hi]]) { tot++; if (!near(G.meterAt(knob, ms, T), want)) bad++; }
    for (let ms = 400; ms + 7 <= 400 + T / 2; ms += 7) { tot++; const d = G.meterAt(knob, ms + 7, T) - G.meterAt(knob, ms, T); if (!(down ? d <= 1e-12 : d >= -1e-12)) bad++; } // 첫 반쪽 단조(영점 내림 · 각도·세기 오름)
  }
  const th = [0, 59, 117, 300].map((px) => +G.thOfRise(px, 390).toFixed(2));
  let rt = 0; for (const top of tops) for (let i = 0; i <= 60; i++) { const s = 0.4 + i * 0.01; rt = Math.max(rt, Math.abs(G.sOfH(G.hOfS(s, top), top) - s)); }
  const clampOk = G.sOfH(-1, 1.4) === 0.4 && G.sOfH(9, 1.4) === 1;
  ok('meterAt 표(준비 400 ms = 출발 끝(영점 꼭대기 · 각도·세기 낮은 끝) · T/4·T/2·3T/4·T = 가운데·반대 끝·가운데·출발 끝 · 세 범위 × 주기 1.6/1.2/1.0 s · 첫 반쪽 단조) · thOfRise(0/59/117/300 px @390) = 0/20.17/40/40 · sOfH∘hOfS 왕복 ≤ 1e-12 · sOfH 기둥으로 자름',
    bad === 0 && th.join('/') === '0/20.17/40/40' && rt <= 1e-12 && clampOk, `${tot - bad}/${tot} · θ ${th.join('/')} · 왕복 ${rt.toExponential(1)}`);
  // (8) GC_LINES ≡ sweepgc lines --json · gcChip ≡ sweepgc chipOf(기둥 원자료 전 줄)
  const lines = SC.gcLines(SC.readRows(SC.MAP_FILE));
  ok('GC_LINES ≡ node tools/sweepgc.mjs lines --json (JSON 문자열)', JSON.stringify(G.GC_LINES) === JSON.stringify(lines));
  let cBad = 0; const cnt = {};
  for (const r of raw) { const a = G.gcChip({ n: r.N, s: r.s, q: r.q, th: r.th, flip: r.flip, out: r.out }), b = SC.chipOf(r, lines); cnt[a] = (cnt[a] || 0) + 1; if (a !== b) cBad++; }
  ok('gcChip ≡ sweepgc chipOf (map·held 기둥 원자료 줄 전부)', cBad === 0 && raw.length > 20000, `${raw.length - cBad}/${raw.length} · ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const u = [[{ n: 40, s: 0.4, q: 0.7, th: 40, flip: 1, out: 2 }, 'qWeak'], [{ n: 40, s: 0.8, q: 0.9, th: 40, flip: 16, out: 13 }, 'zHigh'], [{ n: 40, s: 0.55, q: 0.9, th: 0, flip: 8, out: 13 }, 'thLow'], [{ n: 40, s: 0.55, q: 0.9, th: 40, flip: 22, out: 11 }, 'good'], [{ n: 40, s: 0.55, q: 0.9, th: 40, flip: 21, out: 11 }, 'mixed'], [{ n: 30, s: 0.6, q: 0.85, th: 20, flip: 17, out: 6 }, 'good'],
    [{ n: 30, s: 0.42, q: 0.76, th: 31, flip: 14, out: 5 }, 'qWeak'], [{ n: 40, s: 0.5, q: 0.9, th: 40, flip: 20, out: 12 }, 'mixed'], [{ n: 40, s: 0.45, q: 0.9, th: 40, flip: 20, out: 12 }, 'zLow']]; // 맞물림(약한 숨 + 아래 모서리) · 띠 안 = 영점 칩 없음 · 띠 아래 = zLow
  const c2 = [G.gcChip2({ n: 40, q: 1, flip: 12, out: 14, chip: 'mixed' }), G.gcChip2({ n: 40, q: 1, flip: 12, out: 14, chip: 'zHigh' }), G.gcChip2({ n: 40, q: 0.9, flip: 12, out: 14, chip: 'mixed' })];
  ok('단위 예: 40장 (0.4, 0.7, 40) qWeak · (0.8, 0.9, 40) zHigh · (0.55, 0.9, 0) thLow · 22장 좋아요 · 21장 mixed · 30장 17장 좋아요 · 30장 (0.42, 0.76, 31) 14장 qWeak(맞물림) · 40장 띠 안 s 0.5 = mixed · s 0.45 = zLow · 덧칩 💨(q 1·원 밖 14·12장) = strong, 주 칩 zHigh 면 없음, q 0.9 면 없음',
    u.every(([r, w]) => G.gcChip(r) === w) && c2[0] === 'strong' && c2[1] === null && c2[2] === null, u.map(([r, w]) => `${G.gcChip(r)}${G.gcChip(r) === w ? '' : '×'}`).join(' · ') + ` · 💨 ${c2.join('/')}`);
  // (9) 사건: lock 1번 · up 1번(θ > 0) · θ 0 이면 up 없음 · cue 1번
  const ev = (th) => { const t = mk(40, 401); const e = []; const c = new G.SweepCtl(t, { mode: 'zero', s: 0.55, q: 0.9, th, onEvent: (n) => e.push(n) }); c.attach(t.blowProg({ prog: c.prog, power: 0.9, dur: c.durCap })); let k = 0; while (t.puff && k < 400) { t.step(); c.after(t); k++; } return { e, c }; };
  const e40 = ev(40), e0 = ev(0);
  const cntE = (a, n) => a.filter((x) => x === n).length;
  ok("사건: 'cue'·'lock'·'up' 각 1번 · up 은 lock 뒤 · tUp = cueT + 0.15 · θ 0 이면 'up' 없음", cntE(e40.e, 'cue') === 1 && cntE(e40.e, 'lock') === 1 && cntE(e40.e, 'up') === 1 && e40.e.indexOf('up') > e40.e.indexOf('lock') && e40.c.tUp === +(e40.c.rec.cueT + 0.15).toFixed(4) && cntE(e0.e, 'up') === 0 && cntE(e0.e, 'lock') === 1,
    `${e40.e.join('→')} · tUp ${e40.c.tUp} 단서 ${e40.c.rec.cueT} 실제 시작 ${e40.c.upAt?.toFixed(4)} · θ0: ${e0.e.join('→')}`);
}

// ───────────────────────── 진입 ─────────────────────────
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepgameWorker) {
  await V1.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shotGame(job), key: job.key, meta: job.meta }); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  const t0 = Date.now();
  if (cmd === 'parity') await parity();
  else if (cmd === 'chk') await chk(+(a[0] || 2));
  else if (cmd === 'ctl') await ctl();
  else if (cmd === 'base') await base();
  else if (cmd === 'ref') {
    const rows = await refRows(), gb = await refRowsGB(), gc = await refRowsGC(), gd = await refRowsGD(), gdm = await refRowsGDModes();
    if (a.includes('--json')) console.log(JSON.stringify({ plan: rows, gb, gc, gd, gdm }));
    else {
      for (const r of rows) console.log(`${r.N}장 시드 ${r.seed} q${r.q} A ${r.plan.A}° w ${r.plan.w} t0 ${r.plan.t0} D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 원 밖 ${r.outs} · 꼭대기 넘음 ${r.tTop} · 해시 ${r.hash}`);
      for (const r of gb) console.log(`B ${r.N}장 시드 ${r.seed} q${r.q} ts ${r.ts ?? '안 휙'} D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 원 밖 ${r.outs} · 꼭대기 넘음 ${r.tTop} · ttF ${r.ttF} · 단서 ${r.cueT} · 칩 ${r.chip} · 해시 ${r.hash}`);
      for (const r of gd) console.log(`D ${r.N}장 시드 ${r.seed} 영점 s ${r.s}(α0 ${r.a0}°) q${r.q}${r.blast ? ` 돌풍 ${r.blast}` : ''} θ ${r.th}° D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 책상 밖 ${r.outs}(걸침 ${r.hang}) · 단서 ${r.cueT} · tUp ${r.tUp} · 칩 ${r.chip} · 해시 ${r.hash}`);
      for (const r of gdm) console.log(`D 조합 ${r.mode} ${r.N}장 시드 ${r.seed} (${r.s}, ${r.q}, ${r.th}°) 돌풍 ${+r.blast.toFixed(3)} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 밖 ${r.outs}(걸침 ${r.hang} · 원 밖 책상 위 ${r.ring}) · 칩 ${r.chip} · 해시 ${r.hash}`);
      for (const r of gc) console.log(`C ${r.N}장 시드 ${r.seed} 영점 s ${r.s}(α0 ${r.a0}°) q${r.q} θ ${r.th}° D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 원 밖 ${r.outs} · 단서 ${r.cueT} · tUp ${r.tUp} · ttUp ${r.ttUp} · 칩 ${r.chip}${r.chip2 ? '+' + r.chip2 : ''} · 해시 ${r.hash}`);
      // C 칸은 측정 도구(sweepgc gcShot)로 한 번 더 — 주입 기준이 측정과 같은 샷인지(θ 0 은 측정 'fix0' 줄)
      const SC = await import('./sweepgc.mjs');
      for (const r of gc) { const g = SC.gcShot({ N: r.N, seed: r.seed, s: r.s, q: r.q, th: r.th, kind: 'gc', rule: r.th === 0 ? 'fix0' : SC.RULE, floor: 'wall', key: 'x' }); ok(`C ${r.N}장 ${r.seed} (${r.s}, ${r.q}, ${r.th}°) = sweepgc gcShot(해시·뒤집힘·원 밖·스텝${r.th ? '·tUp·단서' : ''})`, g.hash === r.hash && g.flip === r.flips && g.out === r.outs && g.steps === r.steps && (r.th === 0 || (g.tUp === r.tUp && g.cueT === r.cueT))); }
    }
  } else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  if (cmd !== 'ref' || !a.includes('--json')) console.log(`\nsweepgame ${cmd}: ${FAIL ? `틀림 ${FAIL}` : '맞음'} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  if (FAIL) process.exitCode = 1;
}

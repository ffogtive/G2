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
//                                        · 칩 함수 gbChip ≡ sweepgb chipOf(고른 쓸기·D(q) 원자료 줄 전부). 약 40초
//   node tools/sweepgame.mjs ref [--json]   주입 훅(window.__sweepPlan) 칸들의 Node 기준: #p30 시드 601 t0 .05/.25/.45 · #p40 시드 401 t0 .10/.35 → 뒤집힘·원 밖·D·스텝·정지 해시
//                                      + 문법 B 주입({ kind: 'gb', q, ts }) 칸: #p40 401 q0.85 ts 0.3·안 휙 · #p30 601 q0.7 ts 0.3 (tools/sweepplay.mjs 가 게임과 비교). 약 8초
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
    const rows = await refRows(), gb = await refRowsGB();
    if (a.includes('--json')) console.log(JSON.stringify({ plan: rows, gb }));
    else {
      for (const r of rows) console.log(`${r.N}장 시드 ${r.seed} q${r.q} A ${r.plan.A}° w ${r.plan.w} t0 ${r.plan.t0} D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 원 밖 ${r.outs} · 꼭대기 넘음 ${r.tTop} · 해시 ${r.hash}`);
      for (const r of gb) console.log(`B ${r.N}장 시드 ${r.seed} q${r.q} ts ${r.ts ?? '안 휙'} D ${r.D} → 스텝 ${r.steps} · 뒤집힘 ${r.flips} · 원 밖 ${r.outs} · 꼭대기 넘음 ${r.tTop} · ttF ${r.ttF} · 단서 ${r.cueT} · 칩 ${r.chip} · 해시 ${r.hash}`);
    }
  } else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  if (cmd !== 'ref' || !a.includes('--json')) console.log(`\nsweepgame ${cmd}: ${FAIL ? `틀림 ${FAIL}` : '맞음'} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  if (FAIL) process.exitCode = 1;
}

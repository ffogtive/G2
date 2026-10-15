#!/usr/bin/env node
// native/puff_v2/scripts/flatfloor.mjs — 정직 엔진(puff_v2) 평평한 바닥 고개 튕김 판가름 (docs/design/core-sweep.md §9 1번)
// 보고서: docs/research/v2-flatfloor.md · 원자료: native/puff_v2/data/flatfloor/*.jsonl.gz
//
// 🧭 결과(2026-10-15, 정직 엔진 안 확인됨 · 실물 미검증): 정직 엔진의 평평한 바닥 숨은 20~45장을 거의 넘기지 못한다(고정 3,840샷 0장, 사전 등록 튕김 0.00~0.04장,
//    0.1 s 버티기 40·45장 0.19장) → §9 1번 문자 판정은 비 ∞(분모 0 → 판가름 불능), 해석 판정 실패. v1 40장은 1.32 [1.23, 1.41].
// 🧭 가설(측정 전, 미검증): 정직 엔진의 평평한 바닥에서도 '기울기 시작에 맞춘 튕김'이 40·45장에서 게임 문법 최선 고정보다 낫다(하한 > 1.05),
//    그리고 정직 엔진의 기울기 시작은 v1 보다 빠르다(재윤님 '거의 시작하고 찰나'). → (a) 기울기 시작 (b) 시작 시각 곡선 (c) 튕김 ÷ 최선 고정 (d) 민감도.
//
// 규약 (측정 전에 고정. v1 tools/sweepcheck.mjs 와 같은 칸):
//  - 평평한 바닥 기하: 입 (0, 0.5 u, 앞면 + 4 u), 수평 제트에서 시작, 목 축 = 입 + (0, 1.6, 3.6) (pose.rs FLAT_*).
//  - 게임 문법 숨(rel): 0.26 s 올림 코사인으로 올라가 엄지를 뗄 때까지 가득, 뗀 뒤 0.04 s 에 끝. 유량 Q = 3.9 L/s·q, 입 면적 = v2 푸어억 시간표.
//  - 고정 격자 relfix: q 0.7/0.85/0.93/1.0 × 떼기 0.3/0.4/0.5/0.6/0.8 s (20칸, 고개 고정).
//  - 튕김 = 그 더미의 꼭대기 각 + 0.5° 까지 w °/s 로 들고, 닿은 뒤 0.04 s 에 떼기 (sweepcheck v|Atop|rel@top).
//    사전 등록 칸 = v1 regCell: 40장 이상 q 0.85·120°/s·t0 0.30 s, 30장 이하 q 0.7·40°/s·t0 0.25 s.
//  - 시작 시각 곡선: t0 = 0.00/0.03/0.06/0.10/0.15/0.25/0.35/0.45 s (사전 등록 q·w). 세기 고르기(b'): 사전 등록 t0 에서 q 4개.
//  - 비 = 같은 시드 짝 평균비, 짝 부트스트랩 2,000회(tools/sweepmap.mjs pairedRatio 그대로). 둘 다 0 이면 '정의 안 됨' = 실패(v2-spike 규칙).
//    (사후, 다시 돌릴 때를 위해 등록) 최선 고정이 한 숨 1장 미만이면 비는 정의하지 않고 '판가름 불가(분모 0)'로 적는다 — 보고서 §1.
//  - 반씩 교차 = sweepcheck 규칙: 시드 오름차순 앞 ⌊N/2⌋ = A, 나머지 = B. 한 반에서 최선 고정(relfix 20칸)을 고르고 다른 반에서 평가, 두 방향 짝을 이어 한 번.
//    (b') 줄은 튕김 칸(시작 시각 8 + 세기 3 + 사전 등록)도 같은 반에서 고른다.
//
// 명령 (스레드 2 = THREADS):
//   node flatfloor.mjs list                       단계별 샷 수
//   node flatfloor.mjs run <단계...>             단계: base401 base601 sens f2 nscan aimtop areapuff → $FF_RAW/<단계>.jsonl (이어 돌리기)
//   node flatfloor.mjs v1 [W=2]                   v1(tools/coresweep/simsweep.js) 비교: 기울기 시작·시작 시각 곡선·숨 임펄스 → $FF_RAW/v1.jsonl
//   node flatfloor.mjs v1check                    v1 러너 ≡ tools/sweepmap.mjs shot() (뒤집힘·원 밖 같음) 확인 — 20·30·40·45장 × 고정·튕김·0.1 s 버티기 12개
//   node flatfloor.mjs report [파일,...]          표 (기본: $FF_RAW 또는 ../data/flatfloor 의 모든 *.jsonl[.gz])
// 환경: PUFF_BIN (기본 ../../puff_sim/target/release/puff_v2) · FF_RAW (기본 ../data/flatfloor) · THREADS=2
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const BIN = process.env.PUFF_BIN || resolve(HERE, '../../puff_sim/target/release/puff_v2');
const RAW = process.env.FF_RAW || resolve(HERE, '../data/flatfloor');
const THREADS = +(process.env.THREADS || 2);
const S_TIME = Math.sqrt(9.81 / 0.95); // 실물 초 = 화면 초 ÷ 3.21

const QS = [0.7, 0.85, 0.93, 1.0];
const HS = [0.3, 0.4, 0.5, 0.6, 0.8];
const T0S = [0, 0.03, 0.06, 0.1, 0.15, 0.25, 0.35, 0.45];
const reg = (n) => (n >= 40 ? { q: 0.85, w: 120, t0: 0.3 } : { q: 0.7, w: 40, t0: 0.25 });
const regKey = (n) => (n >= 40 ? 'flick|reg' : 'flick|t0.25');
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// 민감도 변형 (§9 1번: 두께 2~3단 + 접촉·들기 ±30%). 두께는 콜라이더 두께 배율(휨 틈은 그대로), mk = 질량 배율
const VARIANTS = {
  base: '',
  'tk1.5': 'tk=1.5 mk=1.5', // 두께 ×1.5, 같은 밀도(질량 ×1.5)
  'tk2.1': 'tk=2.1 mk=2.1', // 두께 ×2.1, 같은 밀도
  'tk2.1m1': 'tk=2.1', // 두께 ×2.1, 질량 그대로(높이만) — v1 이 못 가른 높이·무게를 가른다
  'cpin0.7': 'cp_in=0.56', // 들기: 공동 입구 압력 계수 Cp_in 0.8 ×0.7
  'cpin1.3': 'cp_in=1.04', // ×1.3 (§4.11 범위 0.5~1 을 0.04 넘음)
  'mu0.7': 'mu_pp=0.315 mu_pt=0.266', // 접촉: 마찰 ×0.7 (§4.11 범위 밖)
  'mu1.3': 'mu_pp=0.585 mu_pt=0.494', // ×1.3 (범위 밖)
  f2: 'f2=2', // 모형 구조: §4.7 F2 전체(윗면 충돌 + 흡입). §7.2 구성 밖, H1 과 충돌(v2-spike §8.3)
  areapuff: 'area=puff', // 입 면적 1.1 cm² 고정(푸어억 시간표 대신) — 0.4 s 떼기 j −8%, 0.8 s −35% 를 없앤다
};

function pileJobs(phase, variant, n, seed, { series = false } = {}) {
  const J = [];
  const rc = reg(n);
  const ex = VARIANTS[variant];
  const add = (key, kv) => J.push({ tag: `${phase}|${variant}|${n}|${seed}|${key}`, line: `n=${n} seed=${seed} pose=flat ${kv} ${ex} tag=${phase}|${variant}|${n}|${seed}|${key}`.replace(/\s+/g, ' ').trim() });
  for (const q of QS) for (const h of HS) add(`relfix|q${q}|h${h}`, `q=${q} rel=${h}${series && h === 0.8 && (q === 0.85 || q === 1) ? ' tilt=1' : ''}`);
  const flick = (q, t0, relx = 0.04) => `q=${q} w=${rc.w} t0=${t0} a=top rel=top relx=${relx}`;
  for (const t0 of T0S) add(`flick|t${t0}`, flick(rc.q, t0));
  if (n >= 40) add('flick|reg', flick(rc.q, rc.t0));
  for (const q of QS) if (q !== rc.q) add(`flickq|q${q}`, flick(q, rc.t0));
  add('flick|reg|hold0.1', flick(rc.q, rc.t0, 0.14));
  return J;
}

const PHASES = {
  base401: () => [20, 30, 40, 45].flatMap((n) => R(401, 424).flatMap((s) => pileJobs('base401', 'base', n, s, { series: true }))),
  base601: () => [20, 30, 40, 45].flatMap((n) => R(601, 624).flatMap((s) => pileJobs('base601', 'base', n, s))),
  sens: () => ['tk1.5', 'tk2.1', 'tk2.1m1', 'cpin0.7', 'cpin1.3', 'mu0.7', 'mu1.3'].flatMap((v) => [40, 45].flatMap((n) => R(401, 412).flatMap((s) => pileJobs('sens', v, n, s)))),
  f2: () => [40, 45].flatMap((n) => R(401, 412).flatMap((s) => pileJobs('f2', 'f2', n, s))),
  nscan: () => [5, 10, 15].flatMap((n) => R(401, 412).flatMap((s) => pileJobs('nscan', 'base', n, s))),
  // 입 면적 민감도(리뷰 뒤 추가, 2026-10-15): 기본과 같은 시드 48짝 × 4장수, 고정 q 0.85·1 × 떼기 0.4·0.8 s + 사전 등록 튕김 + 0.1 s 버티기 (1,152샷, 2스레드 약 3분)
  areapuff: () => [20, 30, 40, 45].flatMap((n) => [...R(401, 424), ...R(601, 624)].flatMap((s) => {
    const keep = new Set(['relfix|q0.85|h0.4', 'relfix|q0.85|h0.8', 'relfix|q1|h0.4', 'relfix|q1|h0.8', regKey(n), 'flick|reg|hold0.1']);
    return pileJobs('areapuff', 'areapuff', n, s).filter((j) => keep.has(j.tag.split('|').slice(4).join('|')));
  })),
  // 진단(게임 문법 밖 = 높이 조준): 처음부터 고개를 꼭대기 각 + δ 에 두고 0.6 s 분다 — 타이밍이 아니라 힘이 모자란지 가른다
  aimtop: () => [40, 45].flatMap((n) => R(401, 412).flatMap((s) => [0.85, 1.0].flatMap((q) => [-2, -1, 0, 0.5].map((dl) => ({
    tag: `aimtop|base|${n}|${s}|aim|q${q}|d${dl}`,
    line: `n=${n} seed=${s} pose=flat q=${q} w=100000 t0=0 a=top ax=${dl} rel=0.6 tag=aimtop|base|${n}|${s}|aim|q${q}|d${dl}`,
  }))))),
};

// ───────── 실행: puff_v2 batch 를 더미 묶음(같은 변형·N·시드) 단위로 ─────────
function runBatch(lines) {
  return new Promise((res, rej) => {
    const p = spawn(BIN, ['batch', String(THREADS)], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res(out.split('\n').filter(Boolean)) : rej(new Error('puff_v2 batch 종료 코드 ' + code))));
    p.stdin.end(lines.join('\n') + '\n');
  });
}

async function run(phases) {
  mkdirSync(RAW, { recursive: true });
  for (const ph of phases) {
    if (!PHASES[ph]) throw new Error('모르는 단계 ' + ph);
    const of = join(RAW, `${ph}.jsonl`);
    const done = new Set();
    if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).tag);
    const jobs = PHASES[ph]().filter((j) => !done.has(j.tag));
    // 더미 묶음으로 나눔 (태그 앞 네 칸 = 단계|변형|N|시드)
    const piles = new Map();
    for (const j of jobs) { const k = j.tag.split('|').slice(0, 4).join('|'); if (!piles.has(k)) piles.set(k, []); piles.get(k).push(j); }
    const groups = [...piles.values()];
    console.error(`[${ph}] 샷 ${jobs.length} (더미 ${groups.length}), 이미 ${done.size} → ${of}`);
    const t0 = Date.now();
    const CH = 6;
    for (let g = 0; g < groups.length; g += CH) {
      const chunk = groups.slice(g, g + CH).flat();
      const out = await runBatch(chunk.map((j) => j.line));
      appendFileSync(of, out.join('\n') + '\n');
      const el = (Date.now() - t0) / 1000;
      console.error(`[${ph}] 더미 ${Math.min(g + CH, groups.length)}/${groups.length} · ${el.toFixed(0)} s`);
    }
  }
}

// ───────── v1 비교 러너 (tools/sweepmap.mjs shot() 과 같은 설정 + 스텝마다 절반 기울기 + 숨 임펄스 합) ─────────
const D2R = Math.PI / 180;
function rotY(q) { // 로컬 +y 를 세계로 (sweepmap rot 과 같은 식, v = (0,1,0))
  const { x, y, z, w } = q;
  const ix = w * 0 + y * 0 - z * 1, iy = w * 1 + z * 0 - x * 0, iz = w * 0 + x * 1 - y * 0, iw = -x * 0 - y * 1 - z * 0;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}
async function v1shot(SW, SM, job) {
  SW.setDiscH(0.11);
  const t = new SW.Table(job.seed * 7907 + job.n, {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const zf = c0.z + 1;
  let sweep = {}, D = job.D, alphaTop = null, Atop = null;
  if (job.flick) {
    const hitC = (a) => { const p = SM.poseAt(a * D2R, 'c', SM.GEO, { x: 0, y: SM.GEO.ym, z: SM.GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
    alphaTop = 0;
    if (top0 > hitC(0)) { let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top0) hi = m; else lo = m; } alphaTop = hi; }
    Atop = +(alphaTop + 0.5).toFixed(3); // sweepcheck 과 같은 반올림
    sweep = { A: Atop, w: job.w, t0: job.t0 };
    D = +(job.t0 + Atop / job.w + (job.relx ?? 0.04)).toFixed(4);
  }
  const br = SM.breathOf('rel', D, 0.04);
  const prog = SM.makeProg(t, { kin: 'c', sweep, breath: br, geo: SM.GEO });
  // 숨 임펄스 합(바람이 딱지에 준 운동량): applyImpulse·applyImpulseAtPoint 를 감싸 y·수평 성분을 더한다(물리는 그대로)
  const live = t.liveDiscs();
  const proto = Object.getPrototypeOf(live[0].body);
  const acc = { y: 0, h: 0, on: true };
  if (!proto.__ffWrapped) {
    for (const fn of ['applyImpulse', 'applyImpulseAtPoint']) {
      const orig = proto[fn];
      proto[fn] = function (imp, ...rest) { const a = globalThis.__ffAcc; if (a && a.on) { a.y += imp.y; a.h += Math.hypot(imp.x, imp.z); } return orig.call(this, imp, ...rest); };
    }
    proto.__ffWrapped = true;
  }
  globalThis.__ffAcc = acc;
  const mass = live[0].body.mass();
  t.blowProg({ prog, power: job.q, dur: br.dur });
  const half = Math.floor(job.n / 2);
  const halves = () => {
    let tb = 0, tt = 0;
    live.forEach((d, k) => { const u = rotY(d.body.rotation()); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
    return [tb / Math.max(1, half) / D2R, tt / Math.max(1, job.n - half) / D2R];
  };
  const dtS = t.T.dt;
  const rec = { t5: -1, t10: -1, t20: -1, t_lift: -1, tt_at: [-1, -1, -1, -1, -1], max_tt: 0, max_tb: 0, t_cross: -1, tt_at_cross: -1 };
  const AT = [0.05, 0.1, 0.2, 0.3, 0.4];
  let below = false;
  const series = job.series ? [] : null;
  const maxSteps = Math.ceil(8 / dtS);
  let i = 0;
  for (; i < maxSteps; i++) {
    const P = t.puff;
    let crossed = false;
    if (P && P.t > 0 && rec.t_cross < 0 && P.d && P.d.z < -1e-6) { const s = (zf - P.o.z) / P.d.z; if (P.o.y + s * P.d.y <= top0) below = true; else if (below) crossed = true; }
    acc.on = !!t.puff;
    t.step();
    const tt_ = (i + 1) * dtS;
    const ub = rotY(live[0].body.rotation());
    if (rec.t_lift < 0 && Math.acos(Math.min(1, Math.abs(ub.y))) > 5 * D2R) rec.t_lift = tt_;
    const [tb, tt] = halves();
    if (crossed) { rec.t_cross = tt_; rec.tt_at_cross = tt; }
    if (rec.t5 < 0 && tt > 5) rec.t5 = tt_;
    if (rec.t10 < 0 && tt > 10) rec.t10 = tt_;
    if (rec.t20 < 0 && tt > 20) rec.t20 = tt_;
    AT.forEach((a, k) => { if (rec.tt_at[k] < 0 && tt_ >= a - 1e-9) rec.tt_at[k] = +tt.toFixed(2); });
    if (tt > rec.max_tt) rec.max_tt = tt;
    if (tb > rec.max_tb) rec.max_tb = tb;
    if (series && i % 2 === 1 && tt_ <= 1.2 + 1e-9) series.push([+tt_.toFixed(4), +tb.toFixed(2), +tt.toFixed(2)]);
    if (!t.puff && i > 30 && t.isSettled()) break;
  }
  acc.on = false;
  const flip = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d)).length;
  const out = t.liveDiscs().filter((d) => !t.inCircle(d)).length;
  const W = mass * 38; // 딱지 무게 (v1 질량 × g 38) → 임펄스 ÷ W = 딱지 무게·초
  return {
    tag: job.tag, n: job.n, seed: job.seed, q: job.q, D, flipped: flip, out, top0: +top0.toFixed(4), alpha_top: alphaTop, a: Atop,
    imp_y_ws: +(acc.y / W).toFixed(3), imp_h_ws: +(acc.h / W).toFixed(3), steps: i,
    flat: { ...rec, max_tt: +rec.max_tt.toFixed(2), max_tb: +rec.max_tb.toFixed(2), tt_at_cross: +(+rec.tt_at_cross).toFixed(2), ...(series ? { series } : {}) },
  };
}
// v1: ① 기울기 시작(rel 0.8 s, q 0.7/0.85/1.0)·시작 시각 곡선(20·30·40·45장, 401~424)
//     ② v1 에서 아직 안 잰 40장 게이트(sweepcheck ① 과 같은 칸: relfix 20칸 + 사전 등록 튕김 + 세기 3 + 0.1 s 버티기, 401~424·601~624)
function v1Jobs() {
  const J = [];
  const seen = new Set();
  const add = (j) => { if (!seen.has(j.tag)) { seen.add(j.tag); J.push(j); } };
  for (const n of [20, 30, 40, 45]) for (const s of R(401, 424)) {
    const rc = reg(n);
    for (const q of [0.7, 0.85, 1.0]) add({ tag: `v1|base|${n}|${s}|relfix|q${q}|h0.8`, n, seed: s, q, D: 0.8, series: q === 0.85 });
    for (const t0 of T0S) add({ tag: `v1|base|${n}|${s}|flick|t${t0}`, n, seed: s, q: rc.q, flick: true, w: rc.w, t0 });
    if (n >= 40) add({ tag: `v1|base|${n}|${s}|flick|reg`, n, seed: s, q: rc.q, flick: true, w: rc.w, t0: rc.t0 });
  }
  const n = 40, rc = reg(n);
  for (const s of [...R(401, 424), ...R(601, 624)]) {
    for (const q of QS) for (const h of HS) add({ tag: `v1|base|${n}|${s}|relfix|q${q}|h${h}`, n, seed: s, q, D: h, series: false });
    add({ tag: `v1|base|${n}|${s}|flick|reg`, n, seed: s, q: rc.q, flick: true, w: rc.w, t0: rc.t0 });
    add({ tag: `v1|base|${n}|${s}|flick|reg|hold0.1`, n, seed: s, q: rc.q, flick: true, w: rc.w, t0: rc.t0, relx: 0.14 });
    for (const q of QS) if (q !== rc.q) add({ tag: `v1|base|${n}|${s}|flickq|q${q}`, n, seed: s, q, flick: true, w: rc.w, t0: rc.t0 });
  }
  return J;
}
async function v1run(W) {
  mkdirSync(RAW, { recursive: true });
  const of = join(RAW, 'v1.jsonl');
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).tag);
  const todo = v1Jobs().filter((j) => !done.has(j.tag));
  console.error(`[v1] 샷 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { ffV1: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 100 === 0) console.error(`[v1] ${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`[v1] 끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
async function v1check() {
  const SW = await import(pathToFileURL(join(REPO, 'tools/coresweep/simsweep.js')).href);
  const SM = await import(pathToFileURL(join(REPO, 'tools/sweepmap.mjs')).href);
  await SW.initPhysics();
  let ok = 0, bad = 0;
  // 30·45·20장 + 새 게이트 40장(601) — 고정 rel 0.5 · 사전 등록 튕김 · 꼭대기 뒤 0.1 s 버티기(relx 0.14)
  for (const [n, s] of [[30, 401], [45, 402], [20, 403], [40, 601]]) {
    const rc = reg(n);
    const a = await v1shot(SW, SM, { tag: 'chk', n, seed: s, q: 0.85, D: 0.5 });
    const b = SM.shot({ n, seed: s, breath: { kind: 'rel', D: 0.5, off: 0.04 }, q: 0.85, kin: 'c', sweep: {} });
    const c = await v1shot(SW, SM, { tag: 'chk', n, seed: s, q: rc.q, flick: true, w: rc.w, t0: rc.t0 });
    const d = SM.shot({ n, seed: s, breath: { kind: 'rel', D: c.D, off: 0.04 }, q: rc.q, kin: 'c', sweep: { A: c.a, w: rc.w, t0: rc.t0 } });
    const e = await v1shot(SW, SM, { tag: 'chk', n, seed: s, q: rc.q, flick: true, w: rc.w, t0: rc.t0, relx: 0.14 });
    const f = SM.shot({ n, seed: s, breath: { kind: 'rel', D: e.D, off: 0.04 }, q: rc.q, kin: 'c', sweep: { A: e.a, w: rc.w, t0: rc.t0 } });
    for (const [lab, x, y] of [['고정', a, b], ['튕김', c, d], ['버티기', e, f]]) { const same = x.flipped === y.flip && x.out === y.out; same ? ok++ : bad++; console.log(`${n}장 s${s} ${lab}: 러너 ${x.flipped}/${x.out} vs shot() ${y.flip}/${y.out} ${same ? '같음' : '다름'}`); }
  }
  console.log(`같음 ${ok} · 다름 ${bad}`);
  if (bad) process.exitCode = 1;
}

// v2 제트 운동량 ∫J dt (딱지 무게·화면 초) — breath.rs build_flat 의 j(t) 를 그대로 적분 (더미가 받을 수 있는 외부 운동량의 상한)
function v2JetImpulse(q, D, off = 0.04) {
  const dt = 1 / 480, n = Math.ceil((D + off) / dt - 1e-9);
  const up = (t) => (t <= 0 ? 0 : t >= 0.26 ? 1 : 0.5 * (1 - Math.cos((Math.PI * t) / 0.26)));
  let s = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * dt;
    const env = t <= D ? up(t) : up(D) * 0.5 * (1 + Math.cos((Math.PI * Math.min(off, t - D)) / off));
    const a = t < 0.32 ? 1.1 : t < 1.44 ? 1.1 + (1.4 * (t - 0.32)) / 1.12 : 2.5;
    const Q = 3.9e-3 * q * env;
    s += ((1.2 * Q * Q) / (a * 1e-4) / 0.0116) * dt;
  }
  return s;
}

// ───────── 보고 ─────────
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : v === Infinity ? '∞' : '-');

async function report(fileArg) {
  const { pairedRatio } = await import(pathToFileURL(join(REPO, 'tools/sweepmap.mjs')).href);
  const files = fileArg ? fileArg.split(',') : readdirSync(RAW).filter((f) => /\.jsonl(\.gz)?$/.test(f)).map((f) => join(RAW, f));
  const rows = files.flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  // 색인: 묶음(단계|변형) → n → key → seed → row
  const M = new Map();
  for (const r of rows) {
    const [ph, v, n, s, ...kk] = r.tag.split('|');
    const grp = ph === 'v1' ? 'v1' : `${ph}:${v}`;
    const key = kk.join('|');
    // 기본 두 판(401~424·601~624)은 합친 묶음 'base:401+601'(48짝)에도 넣는다 — 반씩 교차 = 401~424 ↔ 601~624
    for (const gg of ph === 'base401' || ph === 'base601' ? [grp, 'base:401+601'] : [grp]) {
      if (!M.has(gg)) M.set(gg, new Map());
      const G = M.get(gg);
      if (!G.has(+n)) G.set(+n, new Map());
      const K = G.get(+n);
      if (!K.has(key)) K.set(key, new Map());
      K.get(key).set(+s, r);
    }
  }
  const ratio = (xs, ys) => { if (!xs.length) return null; if (mean(xs) === 0 && mean(ys) === 0) return { undef: true, mx: 0, my: 0 }; return pairedRatio(xs, ys); };
  const ci = (p) => (!p ? '-' : p.undef ? '정의 안 됨(0 대 0)' : `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}] (차 ${p.d >= 0 ? '+' : ''}${f2(p.d)} [${f2(p.dlo)}, ${f2(p.dhi)}]장)`);
  const cellMean = (K, k, S) => { const m = K.get(k); if (!m) return NaN; const v = S ? S.map((s) => m.get(s)?.flipped) : [...m.values()].map((r) => r.flipped); return v.some((x) => x === undefined) ? NaN : mean(v); };
  const allSeeds = (K) => [...K.get('relfix|q1|h0.8').keys()].sort((a, b) => a - b);
  // 같은 시드 묶음 S 에서 평균이 가장 큰 칸 (그 시드를 다 가진 칸만, 동점이면 목록 앞 칸 = sweepcheck bestKey 와 같은 규칙)
  // 시드가 다 있지 않은 칸은 후보에서 빠진다 → skip(Set) 을 주면 그 칸 이름을 모은다(보고에 찍음)
  const best = (K, keys, S = allSeeds(K), skip = null) => { let b = null, bm = -1; for (const k of keys) { const v = cellMean(K, k, S); if (Number.isNaN(v)) { if (skip) skip.add(k); continue; } if (v > bm) { bm = v; b = k; } } return b; };
  const fixKeys = QS.flatMap((q) => HS.map((h) => `relfix|q${q}|h${h}`));
  const flickKeys = (n) => [...T0S.map((t) => `flick|t${t}`), ...(n >= 40 ? ['flick|reg'] : []), ...QS.filter((q) => q !== reg(n).q).map((q) => `flickq|q${q}`)];
  const pair = (K, kb, ke, S) => { const mb = K.get(kb), me = K.get(ke); const ss = (S || [...me.keys()]).filter((s) => mb.has(s) && me.has(s)).sort((a, b) => a - b); return [ss.map((s) => mb.get(s).flipped), ss.map((s) => me.get(s).flipped)]; };
  const split = (K, pickBase, pickEval) => {
    const seeds = [...K.get('relfix|q1|h0.8').keys()].sort((a, b) => a - b);
    const h = Math.floor(seeds.length / 2), A = seeds.slice(0, h), B = seeds.slice(h);
    const xs = [], ys = [], picks = [];
    for (const [sel, ev] of [[A, B], [B, A]]) { const kb = pickBase(sel), ke = pickEval(sel); const [x, y] = pair(K, kb, ke, ev); xs.push(...x); ys.push(...y); picks.push(`${kb}→${ke}`); }
    // 고른 칸에 평가 반 시드가 없으면 짝이 조용히 빠진다 → 짝 수가 시드 수와 다르면 경고
    const short = xs.length !== seeds.length ? `⚠ 짝 ${xs.length}/${seeds.length}(고른 칸에 평가 반 시드 없음)` : '';
    if (short) console.error(`[report] 반씩 교차 ${short}: ${picks.join(', ')}`);
    return { p: ratio(xs, ys), picks, short };
  };
  const out = [];
  const P = (s = '') => out.push(s);
  const grpOrder = [...M.keys()].sort((a, b) => (a === 'v1') - (b === 'v1') || a.localeCompare(b));
  // (c)+(b) 묶음별 표
  P('## (b)(c) 묶음별: 최선 고정·튕김·시작 시각 곡선·비');
  for (const g of grpOrder) {
    const G = M.get(g);
    for (const n of [...G.keys()].sort((a, b) => a - b)) {
      const K = G.get(n);
      if (!fixKeys.every((k) => K.get(k))) continue; // v1 은 relfix 20칸을 다 잰 40장만
      const seeds = [...K.get('relfix|q1|h0.8').keys()];
      const bf = best(K, fixKeys);
      const rk = regKey(n);
      const allFlips = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.flipped));
      const allOut = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.out));
      const nz = allFlips.filter((x) => x > 0).length;
      const curve = T0S.map((t) => cellMean(K, `flick|t${t}`));
      const curveOut = T0S.map((t) => mean([...(K.get(`flick|t${t}`)?.values() || [])].map((r) => r.out)));
      const fixMean = cellMean(K, bf);
      const reg1 = ratio(...pair(K, bf, rk));
      const skip = new Set();
      best(K, fixKeys, undefined, skip);
      const bFl = best(K, flickKeys(n), undefined, skip);
      const reg2 = ratio(...pair(K, bf, bFl));
      const hold = K.get('flick|reg|hold0.1') ? ratio(...pair(K, bf, 'flick|reg|hold0.1')) : null;
      const x1 = split(K, (S) => best(K, fixKeys, S), () => rk);
      const x2 = split(K, (S) => best(K, fixKeys, S), (S) => best(K, flickKeys(n), S));
      const tops = [...K.get('relfix|q1|h0.8').values()].map((r) => r.flat?.top).filter(Number.isFinite);
      const atops = [...K.get('relfix|q1|h0.8').values()].map((r) => r.flat?.alpha_top).filter(Number.isFinite);
      const maxTT = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.flat?.max_tt ?? 0));
      const aud = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.audit?.total ?? 0));
      P(`\n### ${g} · ${n}장 (시드 ${seeds.length}개, 꼭대기 평균 ${f2(mean(tops))} u = ${f1(mean(tops) * 25)} mm, 꼭대기 각 ${f1(mean(atops))}°)`);
      P(`- 샷 ${allFlips.length} · 뒤집힘 > 0 샷 ${nz} (${f1((100 * nz) / allFlips.length)}%) · 평균 뒤집힘 ${f2(mean(allFlips))} · 원 밖 평균 ${f2(mean(allOut))} · 위 절반 최대 기울기 중앙값 ${f1(median(maxTT))}° (최대 ${f1(Math.max(...maxTT))}°) · 감사 위반 샷 ${aud.filter((x) => x > 0).length}`);
      P(`- 최선 고정(같은 시드에서 고름) ${bf} = ${f2(fixMean)}장 · 사전 등록 튕김 ${rk} = ${f2(cellMean(K, rk))}장 · 튕김 최고 칸 ${bFl} = ${f2(cellMean(K, bFl))}장 · 꼭대기 뒤 0.1 s 버티기 ${f2(cellMean(K, 'flick|reg|hold0.1'))}장`);
      P(`- 시작 시각 t0 ${T0S.join('/')} s = ${curve.map(f2).join(' / ')} 장 (원 밖 ${curveOut.map(f1).join(' / ')})`);
      if (skip.size) P(`- ⚠ 후보에서 빠진 칸(시드 ${seeds.length}개를 다 갖지 않음): ${[...skip].join(', ')}`);
      P(`- (c) 사전 등록 튕김 ÷ 최선 고정 ${ci(reg1)} · 반씩 교차 ${ci(x1.p)} (${x1.picks.join(', ')})${x1.short ? ' ' + x1.short : ''}`);
      P(`- (b') 튕김도 고름 ÷ 최선 고정 ${ci(reg2)} · 반씩 교차 ${ci(x2.p)} (${x2.picks.join(', ')})${x2.short ? ' ' + x2.short : ''}`);
      P(`- 꼭대기 뒤 0.1 s 버티기 ÷ 최선 고정 ${ci(hold)}`);
      P(`- relfix 칸 평균: ${QS.map((q) => `q${q} ` + HS.map((h) => f2(cellMean(K, `relfix|q${q}|h${h}`))).join('/')).join(' · ')}`);
      const fq = QS.map((q) => (q === reg(n).q ? cellMean(K, rk) : cellMean(K, `flickq|q${q}`)));
      P(`- 튕김 세기 q ${QS.join('/')} (t0 ${reg(n).t0}) = ${fq.map(f2).join(' / ')}`);
      const f1p = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.mean_f1_push_j));
      const f4u = [...K.values()].flatMap((m) => [...m.values()].map((r) => r.mean_f4_up_j));
      const sl = (k) => mean([...(K.get(k)?.values() || [])].map((r) => r.slide_max));
      P(`- 힘 진단(숨 동안 평균, 딱지 무게 단위): 옆면·밑면 미는 힘 F1+F3 ${f2(mean(f1p))} · 공동 들기 합 F4 ${f2(mean(f4u))} · 안 넘어간 딱지 최대 미끄럼(u) relfix q1 h0.4/h0.8 ${f2(sl('relfix|q1|h0.4'))}/${f2(sl('relfix|q1|h0.8'))} · 사전 등록 튕김 ${f2(sl(rk))}`);
    }
  }
  // 요약 표 (보고서용): 묶음 × N
  P('\n## 요약 표');
  P('| 묶음 | N | 명목 높이 (u) | 가라앉힌 꼭대기 (u) | 꼭대기 각 | 샷 | 뒤집힘 > 0 샷 | 최선 고정 (칸) | 사전 등록 튕김 | 튕김 최고 (칸) | 0.1 s 버티기 | (c) 사전 등록 ÷ 최선 고정, 차 [95%] | 반씩 교차 차 [95%] | 0.1 s 버티기 − 최선 고정 차 [95%] | 위 절반 최대 기울기 중앙값 (최대) |');
  P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of grpOrder) {
    const G = M.get(g);
    for (const n of [...G.keys()].sort((a, b) => a - b)) {
      const K = G.get(n);
      if (!fixKeys.every((k) => K.get(k))) continue;
      const rk = regKey(n), bf = best(K, fixKeys), bFl = best(K, flickKeys(n));
      const rows0 = [...K.get('relfix|q1|h0.8').values()];
      const all = [...K.values()].flatMap((m) => [...m.values()]);
      const p = ratio(...pair(K, bf, rk));
      const x1 = split(K, (S) => best(K, fixKeys, S), () => rk);
      const dd = (q) => (!q ? '-' : q.undef ? '0 대 0' : `${q.d >= 0 ? '+' : ''}${f2(q.d)} [${f2(q.dlo)}, ${f2(q.dhi)}]`);
      const rr = (q) => (!q ? '-' : q.undef ? '정의 안 됨' : `${f2(q.r)}, ${dd(q)}`);
      const mt = all.map((r) => r.flat?.max_tt ?? 0);
      const ph = K.get('flick|reg|hold0.1') ? ratio(...pair(K, bf, 'flick|reg|hold0.1')) : null;
      P(`| ${g} | ${n} | ${f2(mean(rows0.map((r) => r.nominal ?? NaN)))} | ${f2(mean(rows0.map((r) => r.flat?.top ?? r.top0)))} | ${f1(mean(rows0.map((r) => r.flat?.alpha_top ?? r.alpha_top)))}° | ${all.length} | ${all.filter((r) => r.flipped > 0).length} | ${f2(cellMean(K, bf))} (${bf.replace('relfix|', '').replace(/\|/g, '·')}) | ${f2(cellMean(K, rk))} | ${f2(cellMean(K, bFl))} (${bFl.replace(/\|/g, '·')}) | ${f2(cellMean(K, 'flick|reg|hold0.1'))} | ${rr(p)} | ${dd(x1.p)}${x1.short ? ' ' + x1.short : ''} | ${dd(ph)} | ${f1(median(mt))}° (${f1(Math.max(...mt))}°) |`);
    }
  }
  // (a) 기울기 시작
  P('\n## (a) 기울기 시작 (위 절반 평균 기울기, 고정 숨 rel 0.8 s)');
  P('| 엔진·묶음 | 장수 | q | 5° 넘은 샷 | t5 중앙값 (실물 ms) | t10 | t20 | 위 절반 @0.05/0.1/0.2/0.3/0.4 s | 위 절반 최대 (중앙값) | 아래 맨 딱지 5° (tLift) |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (const g of grpOrder) {
    const G = M.get(g);
    if (!(g.startsWith('base') || g.startsWith('nscan') || g === 'v1')) continue;
    for (const n of [...G.keys()].sort((a, b) => a - b)) for (const q of QS) {
      const m = G.get(n).get(`relfix|q${q}|h0.8`);
      if (!m) continue;
      const rs = [...m.values()];
      const t5 = rs.map((r) => r.flat.t5).filter((x) => x >= 0), t10 = rs.map((r) => r.flat.t10).filter((x) => x >= 0), t20 = rs.map((r) => r.flat.t20).filter((x) => x >= 0);
      const tl = rs.map((r) => r.flat.t_lift).filter((x) => x >= 0);
      const at = [0, 1, 2, 3, 4].map((k) => mean(rs.map((r) => r.flat.tt_at[k]).filter((x) => x >= 0)));
      P(`| ${g} | ${n} | ${q} | ${t5.length}/${rs.length} | ${f2(median(t5))} (${f1((median(t5) / S_TIME) * 1000)}) | ${f2(median(t10))} | ${f2(median(t20))} | ${at.map(f1).join(' / ')}° | ${f1(median(rs.map((r) => r.flat.max_tt)))}° | ${tl.length}/${rs.length} ${f2(median(tl))} |`);
    }
  }
  // 진단: 꼭대기 조준 고정
  if (M.has('aimtop:base')) {
    P('\n## 진단: 처음부터 꼭대기 각 + δ 로 고정해 0.6 s (게임 문법 밖)');
    const G = M.get('aimtop:base');
    for (const n of [...G.keys()].sort((a, b) => a - b)) for (const q of [0.85, 1.0]) {
      const cells = [-2, -1, 0, 0.5].map((dl) => { const rs = [...(G.get(n).get(`aim|q${q}|d${dl}`)?.values() || [])]; return `δ ${dl}° ${f2(mean(rs.map((r) => r.flipped)))}장 (원 밖 ${f1(mean(rs.map((r) => r.out)))}, 위 절반 최대 ${f1(median(rs.map((r) => r.flat.max_tt)))}°, 뒤집힘>0 ${rs.filter((r) => r.flipped > 0).length}/${rs.length})`; });
      P(`- ${n}장 q ${q}: ${cells.join(' · ')}`);
    }
  }
  // 입 면적 민감도: area=puff 와 기본(푸어억 면적 시간표)을 같은 시드·같은 칸으로
  if (M.has('areapuff:areapuff') && M.has('base:401+601')) {
    P('\n## 입 면적 민감도: area=puff(1.1 cm² 고정) vs 기본(0.32 s 부터 넓어짐), 같은 시드');
    P('| 장수 | 칸 | 짝 | 뒤집힘 기본 → puff (차 [95%]) | 원 밖 기본 → puff | 위 절반 5° 넘은 샷 기본 → puff | 위 절반 최대 중앙값 기본 → puff |');
    P('|---|---|---|---|---|---|---|');
    const A = M.get('areapuff:areapuff'), Bg = M.get('base:401+601');
    for (const n of [...A.keys()].sort((a, b) => a - b)) {
      const KA = A.get(n), KB = Bg.get(n);
      if (!KB) continue;
      for (const key of ['relfix|q0.85|h0.4', 'relfix|q0.85|h0.8', 'relfix|q1|h0.4', 'relfix|q1|h0.8', regKey(n), 'flick|reg|hold0.1']) {
        const ma = KA.get(key), mb = KB.get(key);
        if (!ma || !mb) continue;
        const ss = [...ma.keys()].filter((s) => mb.has(s)).sort((a, b) => a - b);
        const ra = ss.map((s) => ma.get(s)), rb = ss.map((s) => mb.get(s));
        const p = ratio(rb.map((r) => r.flipped), ra.map((r) => r.flipped));
        const dd = !p ? '-' : p.undef ? '0 대 0' : `${p.d >= 0 ? '+' : ''}${f2(p.d)} [${f2(p.dlo)}, ${f2(p.dhi)}]`;
        const t5 = (rs) => rs.filter((r) => r.flat?.t5 >= 0).length;
        P(`| ${n} | ${key} | ${ss.length} | ${f2(mean(rb.map((r) => r.flipped)))} → ${f2(mean(ra.map((r) => r.flipped)))} (${dd}) | ${f2(mean(rb.map((r) => r.out)))} → ${f2(mean(ra.map((r) => r.out)))} | ${t5(rb)}/${ss.length} → ${t5(ra)}/${ss.length} | ${f1(median(rb.map((r) => r.flat?.max_tt ?? 0)))}° → ${f1(median(ra.map((r) => r.flat?.max_tt ?? 0)))}° |`);
      }
    }
  }
  // v1 시작 시각 곡선·숨 임펄스
  if (M.has('v1')) {
    P('\n## v1 (tools/coresweep/simsweep.js) 시작 시각 곡선 (게임 문법 relTop, 사전 등록 q·w, 시드 401~424)');
    const G = M.get('v1');
    for (const n of [...G.keys()].sort((a, b) => a - b)) {
      const K = G.get(n);
      const curve = T0S.map((t) => cellMean(K, `flick|t${t}`));
      const cross = T0S.map((t) => mean([...(K.get(`flick|t${t}`)?.values() || [])].map((r) => r.flat.tt_at_cross).filter((x) => x >= 0)));
      P(`- ${n}장: t0 ${T0S.join('/')} s = ${curve.map(f1).join(' / ')} 장 · 바람 축이 꼭대기를 넘을 때 위 절반 ${cross.map(f1).join(' / ')}°${n >= 40 ? ` · 사전 등록(t0 0.3) ${f1(cellMean(K, 'flick|reg'))}` : ''}`);
      const imp = [0.7, 0.85, 1.0].map((q) => { const rs = [...(K.get(`relfix|q${q}|h0.8`)?.values() || [])]; return `q${q} 위 ${f1(mean(rs.map((r) => r.imp_y_ws)))} · 수평 ${f1(mean(rs.map((r) => r.imp_h_ws)))}`; });
      P(`  - 숨 0.8 s 동안 바람이 딱지들에 준 임펄스 합(딱지 무게·초): ${imp.join(' | ')} · v2 같은 숨의 제트 운동량 ∫J dt = ${[0.7, 0.85, 1.0].map((q) => `q${q} ${f2(v2JetImpulse(q, 0.8))}`).join(' · ')}`);
    }
  }
  console.log(out.join('\n'));
}

if (!isMainThread && workerData?.ffV1) {
  const SW = await import(pathToFileURL(join(REPO, 'tools/coresweep/simsweep.js')).href);
  const SM = await import(pathToFileURL(join(REPO, 'tools/sweepmap.mjs')).href);
  await SW.initPhysics();
  parentPort.on('message', async (job) => { if (job === null) process.exit(0); parentPort.postMessage(await v1shot(SW, SM, job)); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'run') await run(a);
  else if (cmd === 'list') { for (const [k, f] of Object.entries(PHASES)) console.log(k, f().length); console.log('v1', v1Jobs().length); }
  else if (cmd === 'v1') await v1run(+(a[0] || THREADS));
  else if (cmd === 'v1check') await v1check();
  else if (cmd === 'report') await report(a[0]);
  else console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

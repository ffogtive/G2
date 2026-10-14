// tools/coresweep/econ.mjs — 숨 풍선(체력) 경제 장난감 DP + 세기 지배 검사. 설계서: docs/design/core-sweep.md §6.3 · §9 3번
//
// 왜: 옛 §6.3 비용(풍선 6칸, 차례마다 +2, 퍽 0.5칸, 푸어억 1 + 4·D칸)은 세기 q 를 보지 않는다(Codex 지적).
//     게임 문법(§4.1: 뗄 때까지 숨 가득, 떼면 0.04 s 에 끝)에서는 '짧고 센 고정 숨'(q 0.93~1.0, 0.3~0.4 s 에 떼기)이
//     튕김(q 0.7, 꼭대기에서 떼기)과 수확·길이가 비슷하다(§3.9 ①). 그러면 세기가 공짜다.
//     또 옛 §6.3 의 '섞기 +15%·+17%, 퍽 등장'은 3안 측정 봉투(푸어억 0.6 s 고정 → 3.4칸)로 낸 값이라, 게임 문법 숨(0.34~0.5 s)으로 다시 푼다.
//
// 몸짓 (모두 같은 시드 짝, 기본 601~624 = sweepcheck 와 같은 더미):
//   퍽    e|puck|q          v1 퍽(0.131 s, 고개 고정), q 0.55·0.7·0.85·1.0
//   고정  v|relfix|q|h      rel 고정 숨, 떼는 시각 h 0.3~0.8 s (sweepcheck ① 과 같은 작업)    D = h + 0.04
//   튕김  v|Atop|rel@top    사전 등록 타이밍으로 그 더미의 꼭대기 각 + 0.5° 까지 들고 바로 떼기(사전 등록 세기)  D = 뗀 시각 + 0.04
//         e|flick|q         같은 튕김을 다른 세기로 (q 0.55·0.7·0.85·1.0)
//         + sweepcheck 의 게임 문법 튕김 변형(relTop 시작 시각 · rel@top+.1 · relHold · A8|rel@A8) — 파일에 있으면 같이 쓴다
//   D = 실제로 분 길이(화면 초) = '푸' 시작부터 엄지를 떼고 0.04 s 잦아들 때까지. 측정 봉투(pueok)·분해용 키는 쓰지 않는다.
//
// 비용 규칙 (0.1칸 반올림): 퍽 P칸 · 푸어억 a + b·D·(q/0.85)^p + k·((q−0.8)₊/0.2)²칸 (all = 1 이면 세기 배수를 통째로 곱함).
//   옛 §6.3 = a 1, b 4, p 0, k 0. 제안 = a 1, b 6, k 2 ('당김 80% 넘기면 웃돈, 끝까지 당기면 +2칸')
// 판(장난감): 판마다 N장·숨 T번. 풍선 BAL칸 가득에서 시작, 숨마다 비용을 빼고 +REG(상한 BAL). K 판 경기면 풍선이 판을 넘어 이어진다.
//   '쉬기'(0장·0칸, 숨 한 번을 씀)도 고를 수 있다(REST=0 이면 옛 econ 처럼 못 쉼). 원 밖 딱지는 다시 쌓이므로(main.js) 남은 장수 = n − 수확.
//   기대 수확 = 장수별 평균 수확률을 장수 사이 선형 보간 × 남은 장수. 남은 장수는 반올림(옛 econ 과 같은 근사).
// 판정 (기본 판 20장·숨 2, 30장·숨 3, 45장·숨 3 = levels.js 숨 2~3번. 옛 판은 BOARDS=20:3,30:4,45:5):
//   (i)   섞기 이득 = 최적 ÷ 한 몸짓만 쓴 최적(쉬기 허용) − 1 > 5%
//   (ii)  퍽이 최적 계획에 나온다
//   (iii) 세기가 공짜가 아니다: 첫 수(N장)에서 약한 쪽(q ≤ 0.85) 1등(수확 1등의 95% 안에서 효율 최고)의 효율(장/칸)이
//         센 숨(q ≥ 0.93) 수확 최고보다 5% 넘게 좋다(iii-a). 그리고 30·45장에서 짧고 센 고정 숨(q ≥ 0.93, 0.4 s 이하에 떼기) 최선이
//         튕김(1등)을 지배(수확·효율 둘 다 이상)하지 않는다(iii-b).
//         [정보 iii*] 문자 그대로 '어떤 몸짓도 수확·효율 둘 다 1등이 아니다'도 찍는다. 45장은 때 맞춘 튕김이 늘 둘 다 1등이라
//         어느 비용식으로도 못 넘는다 — §0 '45장 튕김 필수' 그 자체라 판정에서 뺐다.
//   (iv)  풍선이 묶인다: 최적이 무한 풍선 최적보다 2% 넘게 낮다
//
// 명령 (CPU 공유: 기본 일꾼 1. 같은 시드면 비트까지 같다 — 20·30·45장 겹치는 키는 sweepcheck 와 비트 동일):
//   node tools/coresweep/econ.mjs run <out.jsonl> [W=1] [이미 잰 파일,...]   몸짓 × 장수 2·4·8·12·16·20·30·45 = 6,336샷(이어 돌리기)
//        sweepcheck 의 chk601.jsonl 을 주면 겹치는 키를 건너뛴다 → 4,824샷, 1 일꾼 약 15분
//   node tools/coresweep/econ.mjs table <files,...>     장수별 첫 수 표(수확·원 밖·D·규칙별 비용·장/칸)
//   node tools/coresweep/econ.mjs gate <files,...>      규칙별 네 판정 + 최적 계획. 기본 = 옛 / 세기 웃돈만 / 3판 이음만 / 제안
//   node tools/coresweep/econ.mjs search <files,...>    풍선(가득·+숨마다) × 판마다 가득/3판 이음 × 비용식 격자 1,008칸
//   node tools/coresweep/econ.mjs boot <files,...> [B=200]   시드 부트스트랩: 판정 통과율·여유 95% 구간
// 환경: SEEDS=601-624 · NS=2,4,8,...,45 (run) · BOARDS=20:2,30:3,45:3 · BAL=6 · REG=2 · K=1 · REST=1 · TOP
//       RULES='이름=a,b,p,P,k,all[@BAL,REG,K];...' (@ 뒤는 그 규칙의 풍선. 없으면 BAL·REG·K 환경값)
// 주의: 장난감이다. 숙련(잡음 없는) 기대값 DP·선형 보간·같은 시드에서 고른 최선(승자의 저주). 수치는 레벨 봇(§9 6번)으로 다시 맞춘다.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as SW from './simsweep.js';
import { shot, poseAt, regCell, GEO } from '../sweepmap.mjs';

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const rel = (D) => ({ kind: 'rel', D: +D.toFixed(4), off: 0.04 }); // sweepcheck 와 같은 표기(비트 동일 작업)
const PUCK_D = 0.131;
const QP = [0.55, 0.7, 0.85, 1.0]; // 퍽·튕김 세기
const QF = [0.55, 0.7, 0.85, 0.93, 1.0]; // 고정 숨 세기 (sweepcheck 는 0.7~1.0)
const HF = [0.3, 0.4, 0.5, 0.6, 0.8]; // 고정 숨 떼는 시각
const NS_DEF = [2, 4, 8, 12, 16, 20, 30, 45];

// ───────── 꼭대기 각 (sweepcheck 와 같은 식) ─────────
const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };
function pileTop(n, seed) { SW.setDiscH(0.11); const t = new SW.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t.columnTop(); }

function makeJobs() {
  const [a, b] = (process.env.SEEDS || '601-624').split('-').map(Number);
  const NS = process.env.NS ? process.env.NS.split(',').map(Number) : NS_DEF;
  const J = [];
  for (const n of NS) for (const s of R(a, b ?? a)) {
    const rc = regCell(n), sw = rc.sweep;
    const at = alphaTop(pileTop(n, s)), Atop = +(at + 0.5).toFixed(3);
    const tA8 = sw.t0 + sw.A / sw.w + 0.04, tTop = sw.t0 + Atop / sw.w + 0.04;
    const base = { n, seed: s, kin: 'c', meta: { alphaTop: +at.toFixed(2), Atop, tA8: +tA8.toFixed(3), tTop: +tTop.toFixed(3) } };
    const add = (key, o) => J.push({ ...base, key, ...o });
    for (const q of QP) add(`e|puck|q${q}`, { breath: { kind: 'puff' }, q, sweep: {} });
    for (const q of QF) for (const h of HF) add(`v|relfix|q${q}|h${h}`, { breath: rel(h), q, sweep: {} });
    for (const q of QP) add(q === rc.q ? 'v|Atop|rel@top' : `e|flick|q${q}`, { breath: rel(tTop), q, sweep: { ...sw, A: Atop } });
  }
  J.sort((x, y) => y.n - x.n);
  return J;
}

async function run(of, W, haveFiles) {
  await SW.initPhysics();
  const jobs = makeJobs();
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  for (const f of [of, ...haveFiles]) if (f && existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const todo = jobs.filter((j) => !done.has(tag(j)));
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { econWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 200 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ───────── 행 → 몸짓 (게임 문법만) ─────────
// 돌려줌 { act, kind: 'puck'|'fix'|'flick', q, D, label } 또는 null(측정 봉투·분해용 키).
// act 는 장수와 무관한 몸짓 이름이다: 사전 등록 세기는 30장 이하 0.7 / 40장 이상 0.85 라서
// 같은 '튕김 0.7' 이 20·30장에서는 v|Atop|rel@top, 45장에서는 e|flick|q0.7 로 저장된다.
function actionOf(r) {
  const k = r.key, rc = regCell(r.n), m = r.meta || {};
  let x;
  if ((x = k.match(/^e\|puck\|q([\d.]+)$/))) return { act: `puck|q${x[1]}`, kind: 'puck', q: +x[1], D: PUCK_D, label: `퍽 ${x[1]}` };
  if ((x = k.match(/^v\|relfix\|q([\d.]+)\|h([\d.]+)$/))) return { act: `fix|q${x[1]}|h${x[2]}`, kind: 'fix', q: +x[1], h: +x[2], D: +x[2] + 0.04, label: `고정 ${x[1]}·${x[2]}s` };
  const fl = (name, q, D, label) => ({ act: `${name}|q${q}`, kind: 'flick', q, D, label });
  if (k === 'v|Atop|rel@top') return fl('flick', rc.q, m.tTop + 0.04, `튕김 ${rc.q}`);
  if ((x = k.match(/^e\|flick\|q([\d.]+)$/))) return fl('flick', +x[1], m.tTop + 0.04, `튕김 ${x[1]}`);
  if (k === 'v|Atop|rel@top+.1') return fl('flick+.1', rc.q, m.tTop + 0.14, `튕김 ${rc.q} +0.1s`);
  if (k === 'v|A8|rel@A8') return fl('flickA8', rc.q, m.tA8 + 0.04, `튕김 ${rc.q} 8°`);
  if ((x = k.match(/^v\|rel(Top|Hold)\|t([\d.]+)$/))) {
    const t0 = +x[2];
    if (x[1] === 'Top' && t0 === rc.sweep.t0) return null; // = v|Atop|rel@top (같은 작업)
    const reach = t0 + m.Atop / rc.sweep.w;
    const relAt = x[1] === 'Top' ? reach + 0.04 : Math.max(0.6, reach + 0.04);
    return fl(`rel${x[1]}${t0}`, rc.q, relAt + 0.04, `튕김 ${rc.q} 시작${t0}${x[1] === 'Hold' ? '·0.6s까지' : ''}`);
  }
  return null;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
// files → { Ns, acts: [{act, kind, q, h, label, byN: Map(n → Map(seed → {flip, out, D}))}] }
export function load(files) {
  const rows = files.split(',').flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const A = new Map();
  for (const r of rows) {
    const a = actionOf(r);
    if (!a) continue;
    if (!A.has(a.act)) A.set(a.act, { act: a.act, kind: a.kind, q: a.q, h: a.h, label: a.label, byN: new Map() });
    const e = A.get(a.act);
    if (!e.byN.has(r.n)) e.byN.set(r.n, new Map());
    e.byN.get(r.n).set(r.seed, { flip: r.flip, out: r.out, D: a.D });
  }
  const Ns = [...new Set(rows.map((r) => r.n))].sort((a, b) => a - b);
  return { Ns, acts: [...A.values()] };
}

// 시드 표본(부트스트랩용) → 장수별 평균표
export function summarize(acts, seedPick) {
  return acts.map((a) => {
    const pts = [...a.byN.entries()].sort((x, y) => x[0] - y[0]).map(([n, m]) => {
      const ss = seedPick ? seedPick(n, m) : [...m.keys()];
      const v = ss.map((s) => m.get(s)).filter(Boolean);
      return { n, frac: mean(v.map((x) => x.flip)) / n, y: mean(v.map((x) => x.flip)), out: mean(v.map((x) => x.out)), D: mean(v.map((x) => x.D)) };
    });
    return { ...a, pts };
  });
}
// 장수 사이 선형 보간. 잰 범위 밖이면 못 씀(단 가장 작은 잰 장수가 2 이하면 그 아래로 그대로 씀)
export function interp(a, n, f) {
  const P = a.pts;
  if (n < P[0].n) return P[0].n <= 2 ? P[0][f] : null;
  for (let i = 0; i < P.length; i++) {
    if (P[i].n === n) return P[i][f];
    if (P[i].n > n) { if (i === 0) return null; const k = (n - P[i - 1].n) / (P[i].n - P[i - 1].n); return P[i - 1][f] * (1 - k) + P[i][f] * k; }
  }
  return null;
}

// ───────── 비용 규칙 ─────────
// rule = { name, a, b, p, P, k } → 칸(0.1 반올림)
// rule.all = 1 이면 세기 배수 (q/0.85)^p 를 퍽·기본 칸까지 통째로 곱한다(한 줄 규칙: '비용 × (세기 ÷ 초록)^p')
export function cost(rule, a, D) {
  const s = Math.pow(a.q / 0.85, rule.p || 0);
  if (a.kind === 'puck') return Math.round(rule.P * (rule.all ? s : 1) * 10) / 10;
  const tax = (rule.k || 0) * Math.max(0, (a.q - 0.8) / 0.2) ** 2;
  return Math.round(((rule.all ? s * rule.a : rule.a) + rule.b * D * s + tax) * 10) / 10;
}
const sup = (p) => (p === 1 ? '' : p === 2 ? '²' : '^' + p);
export const ruleStr = (r) => (r.all && r.p
  ? `(퍽 ${r.P}칸 · 푸어억 ${r.a} + ${r.b}·D) × (q/0.85)${sup(r.p)}`
  : `퍽 ${r.P}칸 · 푸어억 ${r.a} + ${r.b}·D${r.p ? `·(q/0.85)${sup(r.p)}` : ''}${r.k ? ` + ${r.k}·((q−0.8)₊/0.2)²` : ''}`);
// RULES='이름=a,b,p,P,k,all[@BAL,REG,K];...' — @ 뒤는 그 규칙의 풍선(가득 칸, 숨마다 +칸, 판 수 K: 1 = 판마다 가득, 3 = 3판 내내 이어짐)
export function parseRules(s) {
  return s.split(';').filter(Boolean).map((x) => {
    const [nm, v] = x.split('='), [cs, es] = v.split('@');
    const [a, b, p, P, k, all] = cs.split(',').map(Number);
    const r = { name: nm, a, b, p: p || 0, P: P ?? 0.5, k: k || 0, all: all || 0 };
    if (es) { const [BAL, REG, K] = es.split(',').map(Number); r.env = { BAL, REG, K: K || 1 }; }
    return r;
  });
}
// 기본 비교: 옛 §6.3 / 세기 항만 / 이음만 / 제안(세기 웃돈 + 3판 이음)
export const RULES_DEF = 'old=1,4,0,0.5,0@6,2,1;tax_only=1,6,0,0.5,2@6,2,1;carry_only=1,6,0,0.5,0@6,1,3;new=1,6,0,0.5,2@6,1,3';

// ───────── DP ─────────
// 정수(0.1칸)로 푼다. 돌려줌 { v, plan: [{n, label, c, b}] }
// env.K = 판 수(경기). K > 1 이면 풍선이 판을 넘어 이어진다(판마다 다시 차지 않음). 판마다 같은 N장·숨 T번
export function solve(N, T, S, rule, allowed, env) {
  const BAL = Math.round(env.BAL * 10), REG = Math.round(env.REG * 10), REST = env.REST, K = env.K || 1;
  const opts = (n) => {
    const o = [];
    for (const a of allowed) {
      const fr = interp(a, n, 'frac');
      if (fr == null) continue;
      const D = interp(a, n, 'D');
      o.push({ a, y: Math.min(n, fr * n), c: Math.round(cost(rule, a, D) * 10) });
    }
    return o;
  };
  const optCache = new Map();
  const memo = new Map();
  const f = (n, t, b, k = 0) => {
    if (t === 0 || n <= 0) return k + 1 < K ? f(N, T, b, k + 1) : { v: 0, plan: [] };
    const key = ((k * 100 + n) * 10 + t) * 10000 + b;
    if (memo.has(key)) return memo.get(key);
    if (!optCache.has(n)) optCache.set(n, opts(n));
    let best = { v: -1, plan: [] };
    if (REST) { const nx = f(n, t - 1, Math.min(BAL, b + REG), k); best = { v: nx.v, plan: [{ k, n, label: '쉼', c: 0, b: b / 10 }, ...nx.plan] }; }
    for (const o of optCache.get(n)) {
      if (o.c > b) continue;
      const nx = f(Math.round(n - o.y), t - 1, Math.min(BAL, b - o.c + REG), k);
      const v = o.y + nx.v;
      if (v > best.v + 1e-9) best = { v, plan: [{ k, n, label: o.a.label, kind: o.a.kind, act: o.a.act, c: o.c / 10, b: b / 10 }, ...nx.plan] };
    }
    if (best.v < 0) best = { v: 0, plan: [] };
    memo.set(key, best);
    return best;
  };
  return f(N, T, BAL);
}

// 판(장수:숨 수). 기본은 levels.js 의 숨 2~3번에 맞춘 빡빡한 판. 옛 econ 판은 BOARDS=20:3,30:4,45:5
const BOARDS = (process.env.BOARDS || '20:2,30:3,45:3').split(',').map((x) => x.split(':').map(Number));
const envOf = () => ({ BAL: +(process.env.BAL || 6), REG: +(process.env.REG || 2), REST: process.env.REST === '0' ? 0 : 1, K: +(process.env.K || 1) });

// 첫 수(N장)의 몸짓 표: 수확·효율
export function firstMove(S, rule, N) {
  const L = [];
  for (const a of S) {
    const fr = interp(a, N, 'frac');
    if (fr == null) continue;
    const D = interp(a, N, 'D'), c = cost(rule, a, D), y = fr * N;
    L.push({ a, y, D, c, e: y / c, out: interp(a, N, 'out') });
  }
  return L.sort((x, y) => y.y - x.y);
}

// 네 판정
// (iii) 은 두 갈래다. Codex 지적('세기가 공짜')을 직접 재는 것:
//   (iii-a) 세기 값: 첫 수(N장)에서 센 숨(q ≥ 0.93)의 수확 최고 몸짓 M 보다, 약한 쪽(q ≤ 0.85) 1등 몸짓 W
//           (수확 1등의 95% 안에서 효율 최고)의 효율(장/칸)이 5% 넘게 좋아야 한다. 여유 = 효율 W/M − 1 ≥ 0.05.
//           옛 규칙은 세기가 비용에 없어서 센 숨이 같은 값이다(20장 센 고정이 1등, 45장 튕김 1.0 이 1등).
//   (iii-b) 30·45장: 짧고 센 고정 숨(q ≥ 0.93, 0.4 s 이하에 떼기) 최선이 튕김(수확 1등의 95% 안에서 효율 최고)을 지배하지 않는다.
//   (iii*)  [정보] 문자 그대로 '어떤 몸짓도 수확·효율 둘 다 1등이 아니다'. 1등 몸짓 A(수확 1등의 95% 안에서 효율 최고)에
//           수확 A ≥ 1.05·B, 효율 B ≥ 1.05·A 인 상대 B 가 있나. 45장은 때 맞춘 튕김이 둘 다 1등이라 어느 비용식으로도 못 넘는다(§0 '45장 튕김 필수' 그 자체)
export function judge(S, rule, N, T, env) {
  const mix = solve(N, T, S, rule, S, env);
  const inf = solve(N, T, S, rule, S, { ...env, BAL: 999, REG: 999 });
  let single = { v: -1 };
  for (const a of S) { if (interp(a, N, 'frac') == null) continue; const v = solve(N, T, S, rule, [a], env).v; if (v > single.v) single = { v, label: a.label }; }
  const gain = mix.v / single.v - 1;
  const puck = mix.plan.some((s) => s.kind === 'puck');
  const L = firstMove(S, rule, N);
  const top95 = (xs) => xs.filter((x) => x.y >= 0.95 * xs[0].y).sort((x, y) => y.e - x.e)[0];
  // (iii*) 정보
  const A = top95(L);
  let tm = -Infinity, tB = null;
  for (const B of L) { if (B === A || B.y <= 0) continue; const m = Math.min(A.y / B.y, B.e / A.e) - 1; if (m > tm) { tm = m; tB = B; } }
  // (iii-a) 세기 값: M = 센 숨(q ≥ 0.93) 중 수확 최고, W = 약한 쪽(q ≤ 0.85)의 1등(수확 1등의 95% 안에서 효율 최고)
  const strong = L.filter((x) => x.a.q >= 0.93), weak = L.filter((x) => x.a.q <= 0.85);
  const M = strong[0], W = weak.length ? top95(weak) : null;
  const qm = M && W ? W.e / M.e - 1 : Infinity;
  const qPair = M && W ? [W, M] : null;
  // (iii-b) 센 고정 vs 튕김
  const sf = L.filter((x) => x.a.kind === 'fix' && x.a.q >= 0.93 && x.a.h <= 0.4)[0];
  const fls = L.filter((x) => x.a.kind === 'flick');
  const fl = fls.length ? top95(fls) : null;
  const sfDom = sf && fl ? sf.y >= fl.y && sf.e >= fl.e : false;
  const sfMargin = sf && fl ? Math.max(fl.y / sf.y, fl.e / sf.e) - 1 : NaN; // > 0 이면 지배당하지 않음
  const bind = 1 - mix.v / inf.v;
  const ok = { i: gain > 0.05, ii: puck, iii: qm >= 0.05 && (N < 30 || !sfDom), iv: bind > 0.02 };
  return { N, T, K: env.K || 1, mix, inf, single, gain, puck, A, tm, tB, qm, qPair, sf, fl, sfDom, sfMargin, bind, ok, all: ok.i && ok.ii && ok.iii && ok.iv, strict: tm >= 0.05 };
}

const pct = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)}%` : '없음');
const mv = (x) => `${x.a.label} ${x.y.toFixed(1)}장·${x.c}칸·${x.e.toFixed(2)}장/칸`;
function printJudge(j) {
  const P = (s) => `${j.K > 1 ? `${s.k + 1}판 ` : ''}${s.n}:${s.label}${s.c ? `(${s.c}/${s.b}칸)` : ''}`;
  console.log(`  ${j.N}장·숨 ${j.T}${j.K > 1 ? ` × ${j.K}판` : ''}: 섞기 ${j.mix.v.toFixed(1)} | 단일 최고 ${j.single.label} ${j.single.v.toFixed(1)} → (i) 섞기 이득 ${pct(j.gain)} ${j.ok.i ? '통과' : '실패'}`);
  console.log(`     계획 ${j.mix.plan.map(P).join(' → ')}`);
  console.log(`     (ii) 퍽 ${j.puck ? '나옴 통과' : '안 나옴 실패'} · (iv) 무한 풍선 ${j.inf.v.toFixed(1)} → 묶임 ${pct(j.bind)} ${j.ok.iv ? '통과' : '실패'}`);
  console.log(`     (iii-a) 세기 값: 약한 쪽 1등 ${mv(j.qPair[0])} vs 센 숨 최고 ${mv(j.qPair[1])} → 효율 여유 ${pct(j.qm)}` +
    (j.sf && j.fl ? ` · (iii-b) 센 고정 ${mv(j.sf)} vs 튕김 ${mv(j.fl)} → ${j.sfDom ? '센 고정이 지배' : `지배 아님(여유 ${pct(j.sfMargin)})`}` : '') + ` → ${j.ok.iii ? '통과' : '실패'}`);
  console.log(`     (iii*, 정보) 1등 ${mv(j.A)} · 맞교환 상대 ${j.tB ? mv(j.tB) : '없음'} → 여유 ${pct(j.tm)} ${j.strict ? '(지배 없음)' : '(1등이 수확·효율 둘 다 1등 = 지배)'}`);
}

function table(files) {
  const { acts } = load(files);
  const S = summarize(acts);
  const rules = parseRules(process.env.RULES || RULES_DEF);
  for (const N of [20, 30, 45]) {
    console.log(`\n== ${N}장 첫 수 (수확 순 상위 ${+(process.env.TOP || 14)}, 시드 ${[...acts[0].byN.values()][0].size}개 평균. 장/칸 = 수확 ÷ 비용)`);
    console.log(`  ${'몸짓'.padEnd(18)} 수확  원 밖  D(s)  ` + rules.map((r) => `${r.name}:칸 장/칸`).join('  '));
    for (const x of firstMove(S, rules[0], N).slice(0, +(process.env.TOP || 14))) {
      console.log(`  ${x.a.label.padEnd(18)} ${x.y.toFixed(1).padStart(4)}  ${x.out.toFixed(1).padStart(4)}  ${x.D.toFixed(3)}  ` + rules.map((r) => { const c = cost(r, x.a, x.D); return `${c.toFixed(1).padStart(4)} ${(x.y / c).toFixed(2).padStart(5)}`; }).join('    '));
    }
  }
}

const hdr = (rule, env) => `${rule.name}: ${ruleStr(rule)} — 풍선 ${env.BAL}칸, 숨마다 +${env.REG}${env.K > 1 ? `, ${env.K}판 내내 이어짐` : ', 판마다 가득'}${env.REST ? '' : ', 쉬기 없음'}`;
const failStr = (js) => (js.every((j) => j.all) ? '모두 통과' : '실패: ' + js.filter((j) => !j.all).map((j) => `${j.N}장(${Object.entries(j.ok).filter(([, v]) => !v).map(([k]) => k).join('·')})`).join(', '));

function gate(files) {
  const { acts } = load(files);
  const S = summarize(acts);
  for (const rule of parseRules(process.env.RULES || RULES_DEF)) {
    const env = { ...envOf(), ...(rule.env || {}) };
    console.log(`\n### ${hdr(rule, env)}`);
    const js = BOARDS.map(([N, T]) => judge(S, rule, N, T, env));
    for (const j of js) printJudge(j);
    console.log(`  → 네 판정 ${failStr(js)} · (iii*) 문자 그대로 지배 없음 ${js.filter((j) => j.strict).map((j) => j.N + '장').join('·') || '없음'}`);
  }
}

// 손잡이 격자: 풍선(가득·+숨마다) × 판 수(1 = 판마다 가득, 3 = 3판 내내 이어짐) × 비용식
function search(files) {
  const { acts } = load(files);
  const S = summarize(acts);
  const env0 = envOf();
  const out = [];
  const rules = [];
  for (const a of [0.5, 1]) for (const b of [3, 4, 5, 6]) {
    rules.push({ a, b, p: 0, P: 0.5, k: 0, all: 0 });
    for (const p of [1, 2, 3]) for (const all of [0, 1]) rules.push({ a, b, p, P: 0.5, k: 0, all });
    for (const k of [1, 2]) rules.push({ a, b, p: 0, P: 0.5, k, all: 0 });
  }
  for (const K of [1, 3]) for (const [BAL, REG] of [[6, 2], [6, 1.5], [5, 1.5], [8, 1.5], [6, 1], [8, 2], [10, 3]]) for (const rule of rules) {
    const env = { ...env0, BAL, REG, K };
    const js = BOARDS.map(([N, T]) => judge(S, rule, N, T, env));
    const nPass = js.reduce((s, j) => s + Object.values(j.ok).filter(Boolean).length, 0);
    const minM = Math.min(...js.map((j) => Math.min(j.gain - 0.05, j.qm, j.bind - 0.02, j.N >= 30 && j.sf ? j.sfMargin : 1)));
    out.push({ rule, env, js, all: js.every((j) => j.all), nPass, minM });
  }
  out.sort((x, y) => (y.all - x.all) || (y.nPass - x.nPass) || (y.minM - x.minM));
  const fmt = (o) => `풍선 ${o.env.BAL}·+${o.env.REG}${o.env.K > 1 ? ` ${o.env.K}판이음` : ' 판마다'} | ${ruleStr(o.rule).padEnd(38)} | ` + o.js.map((j) => `${j.N}/${j.T} 섞기${pct(j.gain)} 퍽${j.puck ? 'O' : 'X'} 세기${pct(j.qm)}${j.N >= 30 && j.sf ? ` 센고정${pct(j.sfMargin)}` : ''} 묶임${pct(j.bind)} [${['i', 'ii', 'iii', 'iv'].filter((k) => j.ok[k]).join(',')}]`).join(' | ');
  const nAll = out.filter((o) => o.all).length;
  console.log(`판 ${BOARDS.map((b) => b.join('장·숨 ')).join(', ')} · 격자 ${out.length}칸 중 네 판정 모두 통과 ${nAll}칸`);
  console.log(nAll ? '통과 칸 (최소 여유 순):' : '통과 칸 없음 → 가장 가까운 칸:');
  for (const o of out.slice(0, +(process.env.TOP || 15))) console.log(`  ${o.all ? '통과' : `${o.nPass}/${4 * o.js.length}`} ` + fmt(o));
  console.log('\n옛 §6.3 규칙(퍽 0.5 · 1 + 4·D, 풍선 6·+2):');
  for (const o of out.filter((o) => o.rule.p === 0 && o.rule.k === 0 && o.rule.a === 1 && o.rule.b === 4 && o.env.BAL === 6 && o.env.REG === 2)) console.log(`  ${o.all ? '통과' : `${o.nPass}/${4 * o.js.length}`} ` + fmt(o));
  const by = (f) => { const m = new Map(); for (const o of out) { const k = f(o); if (!m.has(k)) m.set(k, [0, 0, 0]); const e = m.get(k); e[1]++; if (o.all) e[0]++; e[2] = Math.max(e[2], o.nPass); } return [...m].map(([k, [p, t, best]]) => `${k} ${p}/${t}(최다 ${best})`).join(' · '); };
  console.log(`\n판정별 통과 칸 수: ` + ['i', 'ii', 'iii', 'iv'].map((k) => `${k} ${BOARDS.map((_, bi) => out.filter((o) => o.js[bi].ok[k]).length).join('/')}`).join(' · ') + ` (장수 ${BOARDS.map((b) => b[0]).join('/')})`);
  console.log(`풍선 이음별: ${by((o) => (o.env.K > 1 ? '3판 이음' : '판마다 가득'))}`);
  console.log(`세기 항별: ${by((o) => (o.rule.k ? `세금 k${o.rule.k}` : o.rule.p ? `p${o.rule.p}${o.rule.all ? ' 통째' : ''}` : '세기 없음'))}`);
}

// 시드 부트스트랩: 장수마다 시드를 복원 추출 → 몸짓 표 → 판정. 모든 몸짓이 같은 표본 시드를 쓴다(짝 유지)
function boot(files, B) {
  const { acts } = load(files);
  const seedsOf = new Map();
  for (const a of acts) for (const [n, m] of a.byN) { if (!seedsOf.has(n)) seedsOf.set(n, new Set()); for (const s of m.keys()) seedsOf.get(n).add(s); }
  for (const rule of parseRules(process.env.RULES || RULES_DEF)) {
    const env = { ...envOf(), ...(rule.env || {}) };
    let st = 12345;
    const rnd = () => ((st = (st * 1103515245 + 12345) % 2147483648) / 2147483648);
    const acc = BOARDS.map(() => ({ all: 0, i: 0, ii: 0, iii: 0, iv: 0, strict: 0, gain: [], qm: [], sfm: [], bind: [] }));
    for (let it = 0; it < B; it++) {
      const pick = new Map();
      for (const [n, ss] of seedsOf) { const arr = [...ss].sort((a, b) => a - b); pick.set(n, arr.map(() => arr[Math.floor(rnd() * arr.length)])); }
      const S = summarize(acts, (n, m) => pick.get(n).filter((s) => m.has(s)));
      BOARDS.forEach(([N, T], bi) => {
        const j = judge(S, rule, N, T, env), c = acc[bi];
        c.all += j.all; c.i += j.ok.i; c.ii += j.ok.ii; c.iii += j.ok.iii; c.iv += j.ok.iv; c.strict += j.strict;
        c.gain.push(j.gain); c.qm.push(j.qm); c.sfm.push(j.sfMargin); c.bind.push(j.bind);
      });
    }
    const q = (a, p) => { const s = [...a].filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
    const ci = (a) => `${pct(q(a, 0.5))} [${pct(q(a, 0.025))}, ${pct(q(a, 0.975))}]`;
    console.log(`\n### ${hdr(rule, env)} — 부트스트랩 ${B}회`);
    BOARDS.forEach(([N, T], bi) => {
      const c = acc[bi], r = (x) => `${Math.round((100 * x) / B)}%`;
      console.log(`  ${N}장·숨 ${T}: 넷 다 통과 ${r(c.all)} (i ${r(c.i)} · ii ${r(c.ii)} · iii ${r(c.iii)} · iv ${r(c.iv)}; iii* ${r(c.strict)}) | 섞기 이득 ${ci(c.gain)} · 세기 값 여유 ${ci(c.qm)}${N >= 30 ? ` · 센 고정 대비 튕김 여유 ${ci(c.sfm)}` : ''} · 묶임 ${ci(c.bind)}`);
    });
  }
}

if (!isMainThread && workerData?.econWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shot(job), key: job.key, meta: job.meta }); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })()) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'run') await run(a[0] || 'econ601.jsonl', +(a[1] || 1), (a[2] || '').split(',').filter(Boolean));
  else if (cmd === 'table') table(a[0]);
  else if (cmd === 'gate') gate(a[0]);
  else if (cmd === 'search') search(a[0]);
  else if (cmd === 'boot') boot(a[0], +(a[1] || 200));
  else if (cmd === 'list') { await SW.initPhysics(); const J = makeJobs(); const c = {}; for (const j of J) c[j.n] = (c[j.n] || 0) + 1; console.log(`${J.length}샷`, c); }
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

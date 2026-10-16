// tools/sweepcheck.mjs — docs/design/core-sweep.md 재검증(회의적 검증, 2026-10-14). 물리·한 샷은 sweepmap.mjs 의 shot() 그대로.
//
// sweepmap 프리셋이 못 보는 대조 다섯 가지를 같은 시드 짝으로 잰다 (기본 시드 601~624 = 앞선 측정 어디와도 안 겹침):
//  ① 게임 문법 기준선: §4.1 은 '떼면 0.04 s 에 숨 끝'(rel). 그런데 게이트의 '최선 고정'은 측정 기본 봉투(pueok, 끝 0.26 s 전부터 줄어듦)뿐.
//     → rel 고정 숨 격자(세기 0.7/0.85/0.93/1.0 × 떼는 시각 0.3/0.4/0.5/0.6/0.8 s)로 '같은 문법의 최선 고정'을 다시 잡는다.
//  ② 같은 봉투, 쓸기만 뺀 대조(cut): 쓸기 이득이 '숨이 끊기는 때' 효과와 섞였나.
//  ③ 진짜 '꼭대기에서 떼기': release 프리셋의 top = 고개가 8°(A)에 닿는 때(+0.04 s). 20·30장의 바람 축은 3.5°·5.2° 에서 꼭대기를 넘으므로
//     그 top 은 꼭대기를 0.15·0.11 s 지난 뒤다. 여기서는 그 샷 더미의 실제 꼭대기 각 + 0.5°(§8.2 봇 규칙)까지만 들고 그때 뗀다.
//  ③' 시작 시각 산을 게임 문법으로(relTop = 꼭대기 각에서 바로 떼기 / relHold = 꼭대기에서 멈추고 max(0.6 s, 도달+0.04 s)에 떼기).
//  ④ 바람 자국 경로를 맞춘 분해: sweepmap 의 각도만(a)·높이만(b)은 A 8° 라 바람 자국이 27 mm 에서 멈춰 30·45장 꼭대기(30·38 mm)에 못 닿는다.
//     a*·b* 는 목 축(c) 8° 와 같은 바람 자국 경로(끝 각 14.74°, 같은 도달 시각)로 → c ÷ b* = 제트 각(위 운동량·각에 따른 힘 항·입 접근)의 몫.
//  ⑤ 폭 × 속도 혼동: 30장을 120°/s 로, 45장을 40°/s 로 8° vs 20°.
//
// 명령 (CPU 2코어, 시드 24개 = 3,336샷: NS=45 1,104샷 ≈ 11분 + NS=20,30 2,232샷 ≈ 8분 — 한 번 20분을 넘지 않게 NS 로 나눠 같은 파일에 이어 돌린다):
//   node tools/sweepcheck.mjs run <out.jsonl> [W=2]          SEEDS=a-b 로 시드 바꾸기, NS=20,30 장수 거르기
//   node tools/sweepcheck.mjs report <out.jsonl>[,<gate 같은 시드.jsonl>]   (게이트 파일을 같이 주면 pueok 고정·퍽까지 합친 최선 고정)
//   node tools/sweepcheck.mjs same <새.jsonl> <옛.jsonl[.gz]>   새 파일의 모든 줄이 옛 파일의 같은 (장수, 키, 시드) 줄과 비트까지 같은지
//   .jsonl.gz 도 그대로 읽는다. 문서의 원자료 = tools/coresweep/data/ (예: report tools/coresweep/data/vf/chk601.jsonl.gz,tools/coresweep/data/vf/gate601.jsonl.gz)
//
// 반씩 교차 (report 의 '└ 반씩 교차' 줄, 선택 편향 점검):
//   '같은 시드에서 고름' 비는 최선 고정을 평가할 바로 그 시드에서 고른다(고르기 운이 기준선에 섞임). 그래서 고르기와 평가를 나눈다.
//   분할 규칙(결정적): 평가 키가 가진 시드를 오름차순으로 놓고 앞 ⌊N/2⌋개 = A, 나머지 = B (601~624 → A 601~612, B 613~624).
//   A→B: A 시드 평균 장수가 가장 큰 후보 칸을 고르고(동점이면 파일에 먼저 나온 키 = bestKey 와 같은 규칙), B 시드에서 '평가 키 ÷ 그 칸'을 짝으로 잰다.
//   B→A: 거꾸로. 합: A→B 의 B 시드 짝(오름차순) 뒤에 B→A 의 A 시드 짝(오름차순)을 이어 pairedRatio 한 번(같은 부트스트랩 2,000회·같은 난수 씨).
//   후보는 같은 시드 비와 같다: v|relfix|* (+ 게이트 파일을 주면 g|fix|* = pueok 고정·퍽). ③' 줄은 최고 시작 시각도 같은 반에서 고른다.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import * as SW from './coresweep/simsweep.js';
import { shot, poseAt, regCell, GEO, index, pairOf, pairedRatio, bestKey, line } from './sweepmap.mjs';

// 쉼표로 이은 파일들 → 줄(JSON). .gz 는 풀어서 읽는다(레포의 원자료 tools/coresweep/data/*.jsonl.gz).
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
const readRows = (files) => files.split(',').flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));

// 반씩 교차 (규칙은 맨 위 주석). S = 시드 묶음.
const meanOn = (m, S) => { let s = 0; for (const x of S) { const r = m?.get(x); if (!r) return NaN; s += r.flip; } return s / S.length; };
function bestOn(K, test, S) { let best = null, bm = -1; for (const [k, m] of K) if (test(k)) { const v = meanOn(m, S); if (v > bm) { bm = v; best = k; } } return best; }
function splitHalf(K, seedKey, pickEval, pickBase) {
  const seeds = [...K.get(seedKey).keys()].sort((a, b) => a - b);
  const h = Math.floor(seeds.length / 2), A = seeds.slice(0, h), B = seeds.slice(h);
  const xs = [], ys = [], dir = [];
  for (const [sel, ev] of [[A, B], [B, A]]) {
    const kb = pickBase(sel), ke = pickEval(sel), px = [], py = [];
    for (const s of ev) { const rb = K.get(kb)?.get(s), re = K.get(ke)?.get(s); if (rb && re) { px.push(rb.flip); py.push(re.flip); } }
    xs.push(...px); ys.push(...py);
    dir.push({ kb, ke, p: px.length ? pairedRatio(px, py) : null });
  }
  return { A, B, dir, all: xs.length ? pairedRatio(xs, ys) : null };
}

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const OFF = { lipGap: 0, lipPushUp: 0, lipSplit: 0 };
const P6 = { kind: 'pueok', D: 0.6 };
const rel = (D) => ({ kind: 'rel', D: +D.toFixed(4), off: 0.04 });

// 목 축 기하에서 고개 α° → 앞면 바람 자국 높이(u)
const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };
// a*·b*: 고정 입에서 바람 자국 = ym + L·tan α 가 c 의 8° 끝 높이와 같아지는 각
const A_STAR = Math.atan((hitC(8) - GEO.ym) / GEO.L) / D2R;

function pileTop(n, seed) { SW.setDiscH(0.11); const t = new SW.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t.columnTop(); }

export function makeJobs() {
  const [a, b] = (process.env.SEEDS || '601-624').split('-').map(Number);
  const NS = process.env.NS ? process.env.NS.split(',').map(Number) : [20, 30, 45];
  const J = [];
  for (const n of NS) for (const s of R(a, b ?? a)) {
    const rc = regCell(n), sw = rc.sweep, q = rc.q;
    const at = alphaTop(pileTop(n, s)), Atop = +(at + 0.5).toFixed(3);
    const tA8 = sw.t0 + sw.A / sw.w + 0.04, tTop = sw.t0 + Atop / sw.w + 0.04;
    const base = { n, seed: s, kin: 'c', meta: { alphaTop: +at.toFixed(2), Atop, tA8: +tA8.toFixed(3), tTop: +tTop.toFixed(3) } };
    const add = (key, o) => J.push({ ...base, key, ...o });
    // ① rel 고정 격자
    for (const qq of [0.7, 0.85, 0.93, 1.0]) for (const h of [0.3, 0.4, 0.5, 0.6, 0.8]) add(`v|relfix|q${qq}|h${h}`, { breath: rel(h), q: qq, sweep: {} });
    // ② 같은 봉투, 쓸기 없음
    add('v|cut@A8', { breath: rel(tA8), q, sweep: {} });
    add('v|cut@top', { breath: rel(tTop), q, sweep: {} });
    // 기준 튕김 (sweepmap g|flick = r|hold, r|top-cut 과 같은 작업)
    add('v|flick', { breath: P6, q, sweep: sw });
    add('v|A8|rel@A8', { breath: rel(tA8), q, sweep: sw });
    // ③ 진짜 꼭대기에서 떼기
    add('v|Atop|rel@top', { breath: rel(tTop), q, sweep: { ...sw, A: Atop } });
    add('v|Atop|rel@top+.1', { breath: rel(tTop + 0.1), q, sweep: { ...sw, A: Atop } });
    add('v|Atop|rel@0.6', { breath: rel(0.6), q, sweep: { ...sw, A: Atop } });
    add('v|A8|rel@top', { breath: rel(tTop), q, sweep: sw });
    // ③' 시작 시각 산을 게임 문법으로: 게이트 ②는 pueok 0.6 s 봉투라 늦은 시작은 '숨이 잦아드는 중'에 쓴다(§2.4 5). 게임은 뗄 때까지 숨이 가득.
    //     relTop = 꼭대기 각까지 들고 바로 떼기 / relHold = 꼭대기 각에서 멈추고 max(0.6 s, 도달+0.04 s)에 떼기
    for (const t0 of [0.05, 0.15, 0.25, 0.35, 0.45, 0.6]) {
      const reach = t0 + Atop / sw.w;
      add(`v|relTop|t${t0}`, { breath: rel(reach + 0.04), q, sweep: { ...sw, A: Atop, t0 } });
      add(`v|relHold|t${t0}`, { breath: rel(Math.max(0.6, reach + 0.04)), q, sweep: { ...sw, A: Atop, t0 } });
    }
    // ④ 바람 자국 경로 맞춘 분해
    const swStar = { A: +A_STAR.toFixed(3), w: +((A_STAR * sw.w) / sw.A).toFixed(3), t0: sw.t0 };
    add('v|kinA*', { breath: P6, q, kin: 'a', sweep: swStar });
    add('v|kinB*', { breath: P6, q, kin: 'b', sweep: swStar });
    add('v|abl|flick', { breath: P6, q, sweep: sw, tune: OFF });
    add('v|abl|kinB*', { breath: P6, q, kin: 'b', sweep: swStar, tune: OFF });
    if (n === 30) {
      add('v|q.55|flick', { breath: P6, q: 0.55, sweep: sw });
      add('v|q.55|kinA*', { breath: P6, q: 0.55, kin: 'a', sweep: swStar });
      add('v|q.55|kinB*', { breath: P6, q: 0.55, kin: 'b', sweep: swStar });
      // ⑤ 폭 × 속도
      for (const A of [8, 20]) add(`v|w120t.3|A${A}`, { breath: P6, q, sweep: { A, w: 120, t0: 0.3 } });
    }
    if (n === 45) for (const A of [8, 20]) add(`v|w40t.25|A${A}`, { breath: P6, q, sweep: { A, w: 40, t0: 0.25 } });
  }
  J.sort((x, y) => y.n - x.n);
  return J;
}

async function run(of, W) {
  await SW.initPhysics();
  const jobs = makeJobs();
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const todo = jobs.filter((j) => !done.has(tag(j)));
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}  (A* = ${A_STAR.toFixed(2)}°)`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepcheckWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 100 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

function report(files) {
  const M = index(readRows(files));
  const ci = (p) => `${p.r.toFixed(2)} [${p.lo.toFixed(2)}, ${p.hi.toFixed(2)}]`;
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n), g = (k) => K.get(k);
    if (!g('v|flick')) continue;
    const meta = [...g('v|flick').values()].map((r) => r.meta).filter(Boolean);
    const mm = (f) => (meta.length ? (meta.reduce((s, x) => s + x[f], 0) / meta.length).toFixed(2) : '?');
    console.log(`\n== ${n}장  사전 등록 칸 ${JSON.stringify(regCell(n))}  꼭대기 각 평균 ${mm('alphaTop')}° · 떼기 top ${mm('tTop')} s vs A8 ${mm('tA8')} s`);
    const show = (k, base) => { if (!g(k)) return; let s = line(k, g(k)); if (base && g(base) && base !== k) s += `   ÷${base.replace(/^[vg]\|/, '')} ${ci(pairOf(g(base), g(k)))}`; console.log(s); };
    const isFix = (k) => k.startsWith('v|relfix|') || k.startsWith('g|fix|'); // 같은 시드 비와 반씩 교차가 같은 후보를 쓴다
    const bRel = bestKey(K, (k) => k.startsWith('v|relfix|'));
    const bAll = bestKey(K, isFix);
    const pickFix = (S) => bestOn(K, isFix, S);
    const xci = (p) => (p ? ci(p) : '-');
    const xLine = (x) => (x.A.length ? `       └ 반씩 교차 합 ${xci(x.all)} · A→B ${xci(x.dir[0].p)} · B→A ${xci(x.dir[1].p)}` : '       └ 반씩 교차: 시드 2개 미만이라 못 나눔');
    const tOf = (k) => (k ? k.split('|')[2] : '-');
    console.log(`  -- ① 게임 문법(rel) 최선 고정 = ${bRel}${bAll !== bRel ? ` · pueok·퍽 포함 최선 = ${bAll}` : ''}  (÷ 비 = 같은 시드에서 고름)`);
    show(bRel); if (bAll !== bRel) show(bAll);
    const x0 = splitHalf(K, 'v|flick', () => 'v|flick', pickFix), rg = (S) => `${S[0]}~${S[S.length - 1]}`;
    if (x0.A.length) console.log(`  -- ① 반씩 교차 규칙: 시드 오름차순 앞 ${x0.A.length}개 A ${rg(x0.A)} / 뒤 ${x0.B.length}개 B ${rg(x0.B)}. 한 반에서 최선 고정(같은 후보)을 고르고 다른 반에서 평가, 두 방향 짝을 이어 같은 부트스트랩. 고른 칸 A→B ${x0.dir[0].kb} · B→A ${x0.dir[1].kb}`);
    for (const k of ['v|flick', 'v|A8|rel@A8', 'v|Atop|rel@top', 'v|Atop|rel@top+.1', 'v|Atop|rel@0.6', 'v|A8|rel@top']) {
      if (!g(k)) continue;
      show(k, bAll);
      console.log(xLine(splitHalf(K, k, () => k, pickFix)));
    }
    for (const fam of ['relTop', 'relHold']) {
      const ts = [0.05, 0.15, 0.25, 0.35, 0.45, 0.6].filter((t) => g(`v|${fam}|t${t}`));
      if (!ts.length) continue;
      const ms = ts.map((t) => [...g(`v|${fam}|t${t}`).values()].reduce((s, r) => s + r.flip, 0) / g(`v|${fam}|t${t}`).size);
      const os = ts.map((t) => [...g(`v|${fam}|t${t}`).values()].reduce((s, r) => s + r.out, 0) / g(`v|${fam}|t${t}`).size);
      const mx = Math.max(...ms), ai = ms.indexOf(mx);
      const best = `v|${fam}|t${ts[ai]}`;
      console.log(`  -- ③' 게임 문법 시작 시각 ${fam} t0 ${ts.join('/')} = ${ms.map((v) => v.toFixed(1)).join(' / ')} 장 (원 밖 ${os.map((v) => v.toFixed(1)).join(' / ')})  ${ai > 0 && ai < ts.length - 1 && ms[0] <= 0.8 * mx && ms[ms.length - 1] <= 0.8 * mx ? '산' : '산 아님'} · 최고 ÷ 최선 고정 ${ci(pairOf(g(bAll), g(best)))} (둘 다 같은 시드에서 고름)`);
      const famKeys = new Set(ts.map((t) => `v|${fam}|t${t}`));
      const xf = splitHalf(K, best, (S) => bestOn(K, (k) => famKeys.has(k), S), pickFix);
      console.log(`${xLine(xf)}  (최고 시작 시각도 같은 반에서 고름: A→B ${tOf(xf.dir[0].ke)} · B→A ${tOf(xf.dir[1].ke)})`);
    }
    console.log('  -- ② 같은 봉투, 쓸기만 뺌');
    show('v|cut@A8'); console.log(`     v|A8|rel@A8 ÷ cut@A8 = ${ci(pairOf(g('v|cut@A8'), g('v|A8|rel@A8')))} · Atop|rel@top ÷ cut@top = ${ci(pairOf(g('v|cut@top'), g('v|Atop|rel@top')))}`);
    console.log('  -- ④ 바람 자국 경로 맞춘 분해 (A* 14.74°)');
    show('v|kinA*', 'v|kinB*'); show('v|kinB*');
    console.log(`     목 축 c ÷ 높이만 b* = ${ci(pairOf(g('v|kinB*'), g('v|flick')))} · c ÷ 각도만 a* = ${ci(pairOf(g('v|kinA*'), g('v|flick')))}`);
    console.log(`     절제(lip 힘 항 0): c ÷ b* = ${ci(pairOf(g('v|abl|kinB*'), g('v|abl|flick')))}`);
    if (g('v|q.55|flick')) {
      show('v|q.55|flick'); show('v|q.55|kinA*', 'v|q.55|kinB*'); show('v|q.55|kinB*');
      console.log(`     q0.55: c ÷ b* = ${ci(pairOf(g('v|q.55|kinB*'), g('v|q.55|flick')))}`);
    }
    for (const pre of ['v|w120t.3|', 'v|w40t.25|']) if (g(pre + 'A8')) {
      console.log(`  -- ⑤ 폭 × 속도 ${pre}`);
      show(pre + 'A8'); show(pre + 'A20', pre + 'A8');
    }
  }
}

// 다른 스크립트가 import 해도(tools/sweepgame.mjs chk 가 makeJobs 를 씀) CLI 가 돌지 않게: 직접 실행했을 때만 CLI (sweepmap.mjs 와 같은 가드)
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepcheckWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shot(job), key: job.key, meta: job.meta }); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'run') { await run(a[0] || 'out_check.jsonl', +(a[1] || 2)); report(a[0] || 'out_check.jsonl'); }
  else if (cmd === 'report') report(a[0]);
  else if (cmd === 'same') { // 다시 돌린 줄이 원자료와 비트까지 같은가 (일꾼 순서 때문에 줄 순서는 다르므로 (장수, 키, 시드)로 맞춘다)
    const tag = (r) => `${r.n}|${r.key}|${r.seed}`;
    const old = new Map(readRows(a[1]).map((r) => [tag(r), JSON.stringify(r)]));
    let ok = 0, miss = 0; const bad = [];
    for (const r of readRows(a[0])) { const o = old.get(tag(r)); if (o === undefined) miss++; else if (o === JSON.stringify(r)) ok++; else bad.push(tag(r)); }
    console.log(`같음 ${ok} · 다름 ${bad.length} · 원자료에 없음 ${miss}${bad.length ? `\n다른 줄: ${bad.slice(0, 10).join(', ')}` : ''}`);
    if (bad.length || miss || !ok) process.exitCode = 1;
  }
  else if (cmd === 'list') { await SW.initPhysics(); const J = makeJobs(); console.log(`${J.length}샷, A* = ${A_STAR.toFixed(3)}°`); const c = {}; for (const j of J) c[j.n] = (c[j.n] || 0) + 1; console.log(c); console.log(J.filter((j) => j.key === 'v|Atop|rel@top').slice(0, 6).map((j) => `${j.n}장 s${j.seed} ${JSON.stringify(j.meta)}`).join('\n')); }
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

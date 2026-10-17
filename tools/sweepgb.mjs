// tools/sweepgb.mjs — 쓸기 문법 B '놓고 쓸기' Node 측정 (구현 전). 물리 = 게임 그대로(mockup/src/sim.js blowProg + mockup/src/sweep.js SweepCtl plan,
//   G.planShot 과 같은 더미·같은 호출 순서 step → after → stepJudge). CLI 가드: 직접 실행할 때만 돈다.
//
// 🧭 가설(확인됨, 2026-10-16 · 학습 시드 + 보류 시드 625~636): 문법 B 에서 실력 = '휙' 하는 때(ts)이고, 꼭대기는 더미 위 절반이 들썩인 직후다.
//   '위 절반 평균 기울기 10° → 들리면 휙!' 단서 + 사람 반응(벽시계 0.2~0.44 s = 화면 +0.10~0.22 s)이 격자 꼭대기의 94~98%(보류 시드 0.94~0.98)에 떨어진다.
//   → 판가름 (1) ts 산: 30·40장 모두 이른 쪽 절벽(ts 0~0.1 → 0~3장)·꼭대기 0.3~0.35 s·늦은 쪽 완만(확인됨)
//            (2) 단서 + 반응 ≥ 꼭대기 90%: tt10 0.94~0.98 (확인됨)
//            (3) 놓자마자 휙(ts 0)이 0 이 아님: **가설 수정** — 고른 쓸기(w80·A24)에서 ts 0 은 0.0~0.4장(빠른 쓸기는 바람이 기울기 전 꼭대기를 넘어 허공).
//                0 이 아니게 하려면 느린 쓸기(w40: 1.3~3.9장, 꼭대기 −1~2장)거나 꼭대기에서 멈춤(A 꼭대기+0.5: 2.9~5.2장, 꼭대기 −2장·원 밖 +2)뿐 →
//                대신 '떼기 전 같은 획의 위로 휙은 방아쇠 아님'이면 첫 시도 = 안 휙 긴 퍼(30장 10~11 · 40장 8~14장, q ≤ 0.85)로 0 이 아니다.
//
// 문법 B (재윤님 실기기 2026-10-16: 한 번에 '당김 → 빠른 휙 → 떼기' → 문법 A 의 '떼면 숨 끝'과 충돌, blowMs 4~108 ms·0장):
//   당겨서 놓으면 '퍼—'가 저절로 D 초(화면) 나간다 — 입은 바닥(α 0), 봉투 rel(0.26 s 오름 → 평평 → 급차단 0.04 s) = SweepCtl plan 의 D.
//   그동안 위로 휙(어느 속도든) → 고개가 목 축(poseAt 'c')을 따라 w °/s 로 A 까지 오른다(손가락 궤적은 안 따라감, 휙은 방아쇠). 두 번째 휙은 무시.
//   시각은 모두 화면 초(물리 P.t, 놓은 순간 0). 숨 동안 0.5배 → 벽시계 = 화면 × 2.
//
// 고른 값(근거 = report, 원자료 tools/coresweep/data/gb/): 쓸기 w 80 °/s · A 24°(바람 자국 93 mm = 40장 꼭대기의 2.6배, 꼭대기 넘음 = 휙 + 약 0.07~0.09 s)
//   · D(q) = clamp(0.6 + (q − 0.7)·4/3, 0.6, 1.0) → q 0.7/0.85/1.0 = 0.6/0.8/1.0 s(화면) · 단서 = 위 절반 평균 기울기 ≥ 10°(화면 0.16~0.19 s)
//   · 원인 칩 CHIP(휙 없음 안 쓸었어요 · 뒤집힘 ≥ 0.85 × 기준 꼭대기(30장 20 · 40장 25) 좋아요 · 그 밖 휙 순간 위 절반 < 23° 이름 ·
//     ≥ 85° 또는 남은 숨 < 0.12 s 또는 숨 안에 꼭대기 못 넘음 늦음 · 그 밖 좋아요). **가설 수정**(구현 검토 2026-10-16): 처음 규칙(기울기만 20°/85°)은
//     거의 최고 결과에도 이름·늦음을 붙였다(학습 시드 늦음 칩의 31% 가 꼭대기 85% 이상) → 결과 우선 + 이름 23° (report ⑩ '꼭대기 85% 이상' 칸)
//
// 명령 (CPU 4코어, 일꾼 4)
//   node tools/sweepgb.mjs self                      기록 훅이 물리를 안 건드림: gbShot ≡ G.planShot(같은 plan) 뒤집힘·원 밖·스텝·정지 해시 (8칸, 약 10초)
//   node tools/sweepgb.mjs list                      단계별 샷 수
//   node tools/sweepgb.mjs run <단계> <out.jsonl> [W=4]   이어 돌리기(이미 있는 (장수, 시드, 키)는 건너뜀) · 끝나면 키 순 정렬(같은 명령 = 같은 파일)
//        sweep  속도·폭 고르기: 30장 601~612 · 40장 401~412 × q 0.85 · D 0.6 × w 40/80/120/200 °/s × A 꼭대기+0.5°/꼭대기+3°/12°/24°
//               × ts 0·0.05~0.6 + 안 휙 + 참고 '꼭대기에서 끊기'(문법 A 이상, w120 꼭대기+0.5 → D = ts + A/w + 0.04)   (5,328샷, 약 18분)
//        grid   q 0.7/0.85/1.0 × D 0.45/0.6/0.8/1.0 × CHOSEN.sw 3개 × ts + 안 휙 + 퍽 + 고전(눈높이 위 2·3·4장째, 초록 0.95)   (11,664샷, 약 40분)
//        held   보류 시드 625~636(30·40장 둘 다) · CHOSEN.sw[0] · CHOSEN.dq × ts + 안 휙 + 퍽 + 고전   (1,152샷, 약 4분)
//        cue    FROM=<안 휙 줄이 든 파일> → 그 더미의 단서 시각 tc + 반응 r 0.10/0.14/0.18/0.22 s 에 휙 (CHOSEN.sw[0] · CHOSEN.dq)   (grid 2,072 · held 2,172샷, 각 약 8분)
//   node tools/sweepgb.mjs same <단계> <원자료.jsonl[.gz]> [n=24]   단계 작업을 고르게 n 개 골라 다시 돌려 원자료 줄과 JSON 비트 대조(cue 는 FROM= 필요, 약 20초)
//   node tools/sweepgb.mjs report <파일[,파일…]>      산 모양·D(q)·속도/폭·단서·기준선·원인 칩·요약 표 (.jsonl.gz 도 읽음, 1초)
//   원자료 다시 보기: D=tools/coresweep/data/gb; report $D/sweep.jsonl.gz · report $D/grid.jsonl.gz,$D/gridcue.jsonl.gz · report $D/held.jsonl.gz,$D/heldcue.jsonl.gz
//   다시 만들기: run sweep · run grid · run held · FROM=<grid> run cue · FROM=<held> run cue (gzip -n 으로 묶음). 문서 반영은 구현 단계(core-sweep §4·§9 4번, BLOCKERS G13)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as V1 from '../mockup/src/sim.js';
import * as G from '../mockup/src/sweep.js';
import { pairedRatio } from './sweepmap.mjs';

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const TS = R(0, 12).map((i) => +(i * 0.05).toFixed(2)); // 0, 0.05 … 0.6
export const SEEDS = { 30: R(601, 612), 40: R(401, 412) }; // 연습판 판(PRACTICE_SEEDS 앞 12개)
export const HELD = R(625, 636); // 보류 시드(측정 어디와도 안 겹침, 30·40장 공통)
export const QS = [0.7, 0.85, 1.0];
export const DS = [0.45, 0.6, 0.8, 1.0];
export const WS = [40, 80, 120, 200];
export const AS = ['t0.5', 't3', '12', '24']; // t = 그 더미 꼭대기 각(alphaTop) + x°, 숫자 = 절대 각
export const REACT = [0.1, 0.14, 0.18, 0.22]; // 화면 초 = 벽시계 0.2 / 0.28 / 0.36 / 0.44 s (0.5배)
// 단서 후보: tt = 위 절반 평균 기울기 ≥ X°, tb = 아래 절반 ≥ X°, bot = 맨 아래 장 ≥ X° (옆모습 창에서 보이는 것)
export const CUES = ['tt5', 'tt10', 'tt15', 'tt20', 'tt25', 'tb5', 'tb10', 'bot5'];
const TT = [5, 10, 15, 20, 25, 30, 40], TB = [5, 10, 15, 20, 30], BOT = [5, 10];
// 고른 값(sweep·grid 단계 결과로 정함 → report 에 근거). 환경 변수로 바꿀 수 있다: SW=w120·A24,w80·At3  DQ=0.7:0.6,0.85:0.6,1:0.8
// sw[0] = 고른 쓸기(held·cue·칩·요약 표가 씀), 나머지는 grid 비교용. dq = 측정한 q 세 점의 D(q) 값(식은 머리말)
export const CHOSEN = {
  sw: (process.env.SW || 'w80·A24,w40·A24,w120·A24').split(','),
  dq: Object.fromEntries((process.env.DQ || '0.7:0.6,0.85:0.8,1:1').split(',').map((s) => s.split(':').map(Number))),
};

// 원인 칩(문법 B 카드: 이름/좋아요/늦음/안 쓸었어요) — 결과(뒤집힘 ÷ 기준 꼭대기) 먼저, 그다음 휙 순간 위 절반 평균 기울기(옆모습 창과 같은 값)
//   문턱 + 휙 때 남은 숨(화면 초). report ⑩ 이 근거. 게임 = mockup/src/sweep.js GB_CHIP·gbChip(sweepgame ctl 이 같음을 대조)
export const CHIP = { early: 23, late: 85, rem: 0.12, good: 0.85, peak: { 30: 20, 40: 25 }, name: { early: '이름', good: '좋아요', late: '늦음', none: '안 쓸었어요' } };
export const chipOf = (r) => (r.kind === 'never' ? 'none'
  : r.flip >= CHIP.good * (CHIP.peak[r.N] ?? 0.62 * r.N) ? 'good'
    : r.ttF < CHIP.early ? 'early' : r.ttF >= CHIP.late || r.Deff - r.ts < CHIP.rem || !(r.tTop >= 0) ? 'late' : 'good');

const swKey = (w, a, cut) => `w${w}·A${a}${cut ? '·cut' : ''}`;
function parseSw(k) { const m = /^w(\d+)·A(t?[\d.]+)(·cut)?$/.exec(k); if (!m) throw new Error('쓸기 키 ' + k); return { w: +m[1], a: m[2], cut: !!m[3] }; }
const resolveA = (a, aTop) => (a.startsWith('t') ? +(aTop + +a.slice(1)).toFixed(3) : +a);

// ───────────────────────── 한 샷 ─────────────────────────
// job.kind: 'gb'(ts 에 휙) · 'never'(안 휙 = 긴 퍼, α 0) · 'puck'(퍽 0.131, 같은 바닥 입) · 'classic'(지금 게임 눈높이 숨: 위에서 k 장째, 초록 0.95)
export function gbShot(job) {
  const { N, seed } = job;
  const t = new V1.Table(G.practiceTableSeed(N, seed), { lift: 519.59 });
  t.addPile(Array.from({ length: N }, (_, i) => i));
  t.settle(600);
  const top = t.columnTop(), aTop = G.alphaTop(top), dt = t.T.dt;
  let ctl = null, plan = null, A = 0, Deff = null;
  if (job.kind === 'classic') {
    const c = t.pileCenter(), pitch = top / N;
    t.blow({ aim: { x: c.x, y: top - (job.k - 0.5) * pitch, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.95, blast: 0 });
  } else if (job.kind === 'puck') {
    ctl = new G.SweepCtl(t, { mode: 'puck' });
  } else {
    const sw = job.sw ? parseSw(job.sw) : { w: 120, a: '0', cut: false };
    A = job.kind === 'never' ? 0 : resolveA(sw.a, aTop);
    Deff = job.D;
    if (sw.cut && job.kind === 'gb') Deff = Math.min(job.D, +(job.ts + A / sw.w + 0.04).toFixed(4));
    plan = { A, w: sw.w, t0: job.kind === 'never' ? 0 : job.ts, D: Deff };
    ctl = new G.SweepCtl(t, { mode: 'plan', plan });
  }
  if (ctl) ctl.attach(t.blowProg({ prog: ctl.prog, power: job.q, dur: ctl.durCap }));
  // 기록(읽기만): 매 스텝 위·아래 절반 기울기, 맨 아래 장 기울기 → 처음 넘는 시각(스텝 끝 시각 = (k+1)·dt)
  const live = t.liveDiscs(), bottom = live[0];
  const cue = {};
  let ttF = -1, tbF = -1, tbPk = 0, tbPkT = 0, ttPk = 0;
  const tsF = job.kind === 'gb' ? job.ts : null;
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do {
    t.step(); ctl?.after(t); steps++;
    const tk = steps * dt;
    if (steps <= 240) { // 2 s 까지만(단서는 숨 안)
      const [tb, tt] = G.halves(t);
      const u = rotq(bottom.body.rotation());
      const b0 = Math.acos(Math.max(-1, Math.min(1, -u.y))) / D2R;
      for (const x of TT) if (cue['tt' + x] == null && tt >= x) cue['tt' + x] = +tk.toFixed(4);
      for (const x of TB) if (cue['tb' + x] == null && tb >= x) cue['tb' + x] = +tk.toFixed(4);
      for (const x of BOT) if (cue['bot' + x] == null && b0 >= x) cue['bot' + x] = +tk.toFixed(4);
      if (tsF != null && ttF < 0 && tk >= tsF) { ttF = +tt.toFixed(1); tbF = +tb.toFixed(1); }
      if (tb > tbPk) { tbPk = tb; tbPkT = tk; }
      if (tt > ttPk) ttPk = tt;
    }
  } while (!t.stepJudge(j));
  const Rj = t.judgeResult();
  const half = Math.floor(N / 2);
  const flipBot = Rj.flipped.filter((d) => d.id < half).length;
  const flipAny = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2).length;
  const row = {
    N, seed, key: job.key, kind: job.kind, q: job.q ?? 0.95, D: job.D ?? null, ts: job.ts ?? null, sw: job.sw ?? null, k: job.k ?? null,
    A, Deff, top: +top.toFixed(4), aTop: +aTop.toFixed(3),
    flip: Rj.flipped.length, flipAny, out: Rj.outs.length, flipBot, flipTop: Rj.flipped.length - flipBot, steps, hash: G.poseHash(t),
    ttF, tbF, tbPk: +tbPk.toFixed(1), tbPkT: +tbPkT.toFixed(4), ttPk: +ttPk.toFixed(1), cue,
  };
  if (ctl) { const s = ctl.summary(t, row.flip, row.out); Object.assign(row, { tTop: s.tTop, ttAtTop: s.ttAtTop, maxTT: s.maxTT, maxTB: s.maxTB, endTB: s.endTB, cause: s.cause }); }
  if (job.meta) row.meta = job.meta;
  return row;
}
function rotq(q) { // (0,1,0) 회전
  const { x, y, z, w } = q, v = { x: 0, y: 1, z: 0 };
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// ───────────────────────── 작업 목록 ─────────────────────────
const gbJob = (N, seed, q, D, sw, ts, meta) => ({ N, seed, kind: 'gb', q, D, sw, ts, key: `gb|q${q}|D${D}|${sw}|ts${ts}`, ...(meta ? { meta } : {}) });
const neverJob = (N, seed, q, D) => ({ N, seed, kind: 'never', q, D, key: `never|q${q}|D${D}` });
const puckJob = (N, seed, q) => ({ N, seed, kind: 'puck', q, key: `puck|q${q}` });
const classicJob = (N, seed, k) => ({ N, seed, kind: 'classic', k, key: `classic|k${k}` });
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
export const readRows = (files) => files.split(',').flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));

export function makeJobs(stage) {
  const J = [];
  const both = (seedsOf) => [30, 40].flatMap((N) => seedsOf(N).map((seed) => [N, seed]));
  if (stage === 'sweep') {
    for (const [N, seed] of both((N) => SEEDS[N])) {
      J.push(neverJob(N, seed, 0.85, 0.6));
      for (const w of WS) for (const a of AS) for (const ts of TS) J.push(gbJob(N, seed, 0.85, 0.6, swKey(w, a), ts));
      for (const ts of TS) J.push(gbJob(N, seed, 0.85, 0.6, swKey(120, 't0.5', true), ts));
    }
  } else if (stage === 'grid' || stage === 'held') {
    const seedsOf = stage === 'grid' ? (N) => SEEDS[N] : () => HELD;
    for (const [N, seed] of both(seedsOf)) {
      for (const q of QS) {
        const Ds = stage === 'grid' ? DS : [CHOSEN.dq[q]];
        for (const D of Ds) {
          J.push(neverJob(N, seed, q, D));
          for (const sw of stage === 'grid' ? CHOSEN.sw : CHOSEN.sw.slice(0, 1)) for (const ts of TS) J.push(gbJob(N, seed, q, D, sw, ts));
        }
        J.push(puckJob(N, seed, q));
      }
      for (const k of [2, 3, 4]) J.push(classicJob(N, seed, k));
    }
  } else if (stage === 'cue') {
    if (!process.env.FROM) throw new Error('cue: FROM=<안 휙 줄이 든 파일> 필요');
    const rows = readRows(process.env.FROM).filter((r) => r.kind === 'never');
    const sw = CHOSEN.sw[0];
    const seen = new Set();
    for (const r of rows.sort((a, b) => a.N - b.N || a.seed - b.seed || a.q - b.q || a.D - b.D)) {
      const D = CHOSEN.dq[r.q];
      const id = `${r.N}|${r.seed}|${r.q}`;
      if (D == null || seen.has(id)) continue; // 단서 시각은 D 와 무관(숨이 같은 동안 같은 물리) → (장수, 시드, q) 마다 한 번
      seen.add(id);
      for (const c of CUES) {
        const tc = r.cue[c];
        if (tc == null) continue; // 단서가 안 뜸 → 휙 없음(= 안 휙 줄)
        for (const rr of REACT) { const ts = +(tc + rr).toFixed(4); const jb = gbJob(r.N, r.seed, r.q, D, sw, ts, { cue: c, tc, r: rr }); jb.key = `cue|${c}|r${rr}|q${r.q}|D${D}|${sw}`; J.push(jb); }
      }
    }
  } else throw new Error('단계 ' + stage);
  return J;
}

// ───────────────────────── 일꾼 ─────────────────────────
async function run(stage, out, W) {
  await V1.initPhysics();
  const jobs = makeJobs(stage);
  const tag = (r) => `${r.N}|${r.seed}|${r.key}`;
  const done = new Set(existsSync(out) ? readText(out).split('\n').filter(Boolean).map((l) => tag(JSON.parse(l))) : []);
  const todo = jobs.filter((j) => !done.has(tag(j)));
  console.log(`run ${stage}: 작업 ${jobs.length} · 이미 ${jobs.length - todo.length} · 남음 ${todo.length} · 일꾼 ${W} · SW=${CHOSEN.sw.join(',')} DQ=${JSON.stringify(CHOSEN.dq)}`);
  const t0 = Date.now();
  let k = 0, got = 0;
  await new Promise((res) => {
    const nW = Math.min(W, todo.length);
    let alive = nW;
    if (!nW) return res();
    for (let w = 0; w < nW; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepgbWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => {
        if (m.ready) return next();
        appendFileSync(out, JSON.stringify(m) + '\n');
        if (++got % 200 === 0) console.error(`  ${got}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        next();
      });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => { console.error(e); process.exitCode = 1; });
    }
  });
  // 키 순 정렬(같은 명령이면 같은 파일)
  const lines = readText(out).split('\n').filter(Boolean);
  const keyOf = (l) => { const r = JSON.parse(l); return [r.N, r.seed, r.key]; };
  lines.sort((a, b) => { const x = keyOf(a), y = keyOf(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`끝: ${got}샷 ${((Date.now() - t0) / 1000).toFixed(0)}초 → ${out} (${lines.length}줄)`);
}

// ───────────────────────── same: 원자료 비트 재현 ─────────────────────────
async function same(stage, file, n) {
  await V1.initPhysics();
  const jobs = makeJobs(stage);
  const stored = new Map(readText(file).split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [`${r.N}|${r.seed}|${r.key}`, l]; }));
  const stride = Math.max(1, Math.floor(jobs.length / n));
  let good = 0, bad = 0, miss = 0;
  for (let i = 0; i < jobs.length && good + bad + miss < n; i += stride) {
    const j = jobs[i], l = stored.get(`${j.N}|${j.seed}|${j.key}`);
    if (l === undefined) { miss++; continue; }
    if (JSON.stringify(gbShot(j)) === l) good++; else { bad++; console.log(`  다름: ${j.N}장 ${j.seed} ${j.key}`); }
  }
  console.log(`sweepgb same ${stage}: 같음 ${good} · 다름 ${bad} · 원자료에 없음 ${miss} (작업 ${jobs.length}개 중 ${stride}개마다) → ${bad || miss ? '틀림' : '맞음'}`);
  if (bad || miss) process.exitCode = 1;
}

// ───────────────────────── self: 기록 훅 ≡ planShot ─────────────────────────
async function self() {
  await V1.initPhysics();
  let bad = 0;
  const cells = [
    { N: 30, seed: 601, q: 0.85, D: 0.6, sw: 'w120·At0.5', ts: 0.25 }, { N: 40, seed: 401, q: 0.85, D: 0.6, sw: 'w80·A24', ts: 0 },
    { N: 40, seed: 402, q: 1, D: 0.8, sw: 'w200·A12', ts: 0.35 }, { N: 30, seed: 602, q: 0.7, D: 0.45, sw: 'w40·At3', ts: 0.6 },
    { N: 30, seed: 603, q: 0.85, D: 0.6, sw: 'w120·At0.5·cut', ts: 0.2 },
  ];
  for (const c of cells) {
    const r = gbShot({ ...c, kind: 'gb', key: 'x' });
    const p = G.planShot(V1.Table, { N: c.N, seed: c.seed, q: c.q, plan: { A: r.A, w: parseSw(c.sw).w, t0: c.ts, D: r.Deff } });
    const same = p.hash === r.hash && p.flips === r.flip && p.outs === r.out && p.steps === r.steps;
    if (!same) bad++;
    console.log(`  ${same ? '맞음' : '틀림'}  ${c.N}장 ${c.seed} q${c.q} D${c.D} ${c.sw} ts ${c.ts} → A ${r.A}° D ${r.Deff} 뒤집힘 ${r.flip}/${p.flips} 원 밖 ${r.out}/${p.outs} 스텝 ${r.steps}/${p.steps} 해시 ${r.hash}/${p.hash}`);
  }
  for (const c of [{ N: 40, seed: 403, q: 0.85, D: 0.6 }, { N: 30, seed: 604, q: 1, D: 1 }]) {
    const r = gbShot({ ...c, kind: 'never', key: 'x' });
    const p = G.planShot(V1.Table, { N: c.N, seed: c.seed, q: c.q, plan: { A: 0, w: 120, t0: 0, D: c.D } });
    const same = p.hash === r.hash && p.flips === r.flip;
    if (!same) bad++;
    console.log(`  ${same ? '맞음' : '틀림'}  안 휙 ${c.N}장 ${c.seed} q${c.q} D${c.D} → 뒤집힘 ${r.flip}/${p.flips} 해시 ${r.hash}/${p.hash}`);
  }
  { const r = gbShot({ N: 30, seed: 605, q: 0.85, kind: 'puck', key: 'x' }); const p = G.planShot(V1.Table, { N: 30, seed: 605, q: 0.85, plan: { kind: 'puck' } }); const same = p.hash === r.hash; if (!same) bad++; console.log(`  ${same ? '맞음' : '틀림'}  퍽 30장 605 → 뒤집힘 ${r.flip}/${p.flips} 해시 ${r.hash}/${p.hash}`); }
  console.log(`\nsweepgb self: ${bad ? `틀림 ${bad}` : '맞음'}`);
  if (bad) process.exitCode = 1;
}

// ───────────────────────── report ─────────────────────────
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const ci = (p) => (p ? `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}]` : '—');
function idx(rows) { const M = new Map(); for (const r of rows) { const k = `${r.N}|${r.key}`; if (!M.has(k)) M.set(k, new Map()); M.get(k).set(r.seed, r); } return M; }
const get = (M, N, key) => M.get(`${N}|${key}`);
const mOf = (m, f = (r) => r.flip) => (m ? mean([...m.values()].map(f)) : NaN);
function pair(mA, mB, f = (r) => r.flip) { if (!mA || !mB) return null; const s = [...mA.keys()].filter((x) => mB.has(x)).sort((a, b) => a - b); return s.length ? pairedRatio(s.map((x) => f(mA.get(x))), s.map((x) => f(mB.get(x)))) : null; }

// 한 줄 산: ts 별 평균 → 꼭대기·80% 창·이른 쪽(ts 0)·늦은 쪽(0.6)·안 휙
function mountain(M, N, q, D, sw) {
  const ys = TS.map((ts) => mOf(get(M, N, `gb|q${q}|D${D}|${sw}|ts${ts}`)));
  const os = TS.map((ts) => mOf(get(M, N, `gb|q${q}|D${D}|${sw}|ts${ts}`), (r) => r.out));
  const ok = ys.map(Number.isFinite);
  if (!ok.some(Boolean)) return null;
  let pk = 0; ys.forEach((y, i) => { if (y > ys[pk]) pk = i; });
  const win = TS.filter((_, i) => ys[i] >= 0.8 * ys[pk]);
  const w9 = TS.filter((_, i) => ys[i] >= 0.9 * ys[pk]);
  const nv = mOf(get(M, N, `never|q${q}|D${D}`));
  return { ys, os, pk: TS[pk], peak: ys[pk], peakOut: os[pk], win: [win[0], win.at(-1)], w9: [w9[0], w9.at(-1)], ts0: ys[0], late: ys.at(-1), never: nv };
}

function report(files) {
  const rows = readRows(files);
  const M = idx(rows);
  const Ns = [...new Set(rows.map((r) => r.N))].sort();
  const keys = new Set(rows.map((r) => r.key));
  const sws = [...new Set(rows.filter((r) => r.kind === 'gb' && !r.key.startsWith('cue')).map((r) => r.sw))];
  const combos = [...new Set(rows.filter((r) => r.kind === 'gb' && !r.key.startsWith('cue')).map((r) => `${r.q}|${r.D}`))].map((s) => s.split('|').map(Number));
  console.log(`줄 ${rows.length} · 장수 ${Ns.join('/')} · 쓸기 ${sws.length} · (q, D) ${combos.length}`);
  const seedsTxt = (N) => { const s = [...new Set(rows.filter((r) => r.N === N).map((r) => r.seed))].sort((a, b) => a - b); return `${s[0]}~${s.at(-1)} (${s.length})`; };

  // ① 산 표: (q, D, 쓸기)마다 ts 줄
  for (const N of Ns) {
    console.log(`\n━━ ${N}장 시드 ${seedsTxt(N)} — 휙 시각 ts(화면 초) 별 평균 뒤집힘(원 안) ━━`);
    console.log(`  ts: ${TS.map((t) => t.toFixed(2)).join(' ')}`);
    for (const [q, D] of combos.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      const nv = get(M, N, `never|q${q}|D${D}`);
      for (const sw of sws) {
        const mt = mountain(M, N, q, D, sw);
        if (!mt) continue;
        const best = get(M, N, `gb|q${q}|D${D}|${sw}|ts${mt.pk}`), z = get(M, N, `gb|q${q}|D${D}|${sw}|ts0`);
        console.log(`  q${q} D${D} ${sw.padEnd(15)} ${mt.ys.map((y) => f1(y).padStart(4)).join(' ')} | 꼭대기 ts ${mt.pk} ${f1(mt.peak)}장(원 밖 ${f1(mt.peakOut)}) · 80% 창 ${mt.win.join('~')} · 90% ${mt.w9.join('~')} · 안 휙 ${f1(mt.never)} · 꼭대기÷안 휙 ${ci(pair(nv, best))} · ts0÷꼭대기 ${ci(pair(best, z))}`);
      }
    }
  }

  // ② 원 밖·어디든 뒤집힘(꼭대기 ts 와 ts 0, 안 휙)
  if (sws.length) {
    console.log(`\n━━ 꼭대기·놓자마자(ts 0)·안 휙: 원 안 뒤집힘 / 어디든 뒤집힘 / 원 밖 / 위 절반 몫 ━━`);
    for (const N of Ns) for (const [q, D] of combos) for (const sw of sws) {
      const mt = mountain(M, N, q, D, sw); if (!mt) continue;
      const b = get(M, N, `gb|q${q}|D${D}|${sw}|ts${mt.pk}`), z = get(M, N, `gb|q${q}|D${D}|${sw}|ts0`), nv = get(M, N, `never|q${q}|D${D}`);
      const s = (m) => (m ? `${f1(mOf(m))}/${f1(mOf(m, (r) => r.flipAny))}/${f1(mOf(m, (r) => r.out))}/위${f1(mOf(m, (r) => r.flipTop))}` : '—');
      console.log(`  ${N}장 q${q} D${D} ${sw.padEnd(15)} 꼭대기(ts ${mt.pk}) ${s(b)} · ts0 ${s(z)} · 안 휙 ${s(nv)}`);
    }
  }

  // ③ 기준선: 최선 고정(안 휙·퍽 중 최고 평균) · 고전(눈높이 위 k 장째 0.95)
  console.log(`\n━━ 기준선 ━━`);
  for (const N of Ns) {
    const fixed = [...keys].filter((k) => k.startsWith('never|') || k.startsWith('puck|')).map((k) => [k, mOf(get(M, N, k)), mOf(get(M, N, k), (r) => r.out)]).filter((x) => Number.isFinite(x[1])).sort((a, b) => b[1] - a[1]);
    const cl = [2, 3, 4].map((k) => [k, get(M, N, `classic|k${k}`)]).filter((x) => x[1]);
    console.log(`  ${N}장 최선 고정(바닥 입, 쓸기 없음): ${fixed.slice(0, 4).map(([k, m, o]) => `${k} ${f1(m)}(원 밖 ${f1(o)})`).join(' · ')}`);
    if (cl.length) console.log(`  ${N}장 고전 눈높이(초록 0.95, 위에서 k 장째): ${cl.map(([k, m]) => `k${k} ${f1(mOf(m))}/어디든 ${f1(mOf(m, (r) => r.flipAny))}(원 밖 ${f1(mOf(m, (r) => r.out))})`).join(' · ')}`);
  }

  // ④ 단서 시각(안 휙 줄의 cue): 장수·q 별 평균 ± sd [최소, 최대]
  const nev = rows.filter((r) => r.kind === 'never');
  if (nev.length) {
    console.log(`\n━━ 단서 시각(화면 초, 안 휙 더미 · D 무관 구간) — 평균 ± sd [최소, 최대] (안 뜸 n) ━━`);
    for (const N of Ns) for (const q of [...new Set(nev.map((r) => r.q))].sort()) {
      const rs = [...new Map(nev.filter((r) => r.N === N && r.q === q).map((r) => [r.seed, r])).values()];
      if (!rs.length) continue;
      const cols = [...TT.map((x) => 'tt' + x), ...TB.map((x) => 'tb' + x), ...BOT.map((x) => 'bot' + x)].map((c) => { const v = rs.map((r) => r.cue[c]).filter((x) => x != null); return `${c} ${f2(mean(v))}±${f2(sd(v))}[${f2(Math.min(...v))},${f2(Math.max(...v))}]${v.length < rs.length ? `(안 뜸 ${rs.length - v.length})` : ''}`; });
      console.log(`  ${N}장 q${q}: ${cols.join(' · ')}`);
    }
  }

  // ⑤ 단서 + 반응 칸: cue|c|r 평균 ÷ 같은 (q, D, 쓸기) 의 꼭대기 · 안 휙
  const cueRows = rows.filter((r) => r.key.startsWith('cue|'));
  if (cueRows.length) {
    console.log(`\n━━ 단서 + 반응: ts = 단서 시각 + r (화면 초). 칸 평균 뒤집힘 · ÷ 같은 시드 ts 격자 최고칸 · ÷ 안 휙 ━━`);
    const sw = cueRows[0].sw;
    for (const N of Ns) for (const q of [...new Set(cueRows.map((r) => r.q))].sort()) {
      const D = cueRows.find((r) => r.q === q).D;
      const mt = mountain(M, N, q, D, sw);
      const best = mt ? get(M, N, `gb|q${q}|D${D}|${sw}|ts${mt.pk}`) : null, nv = get(M, N, `never|q${q}|D${D}`);
      console.log(`  ${N}장 q${q} D${D} ${sw}: 격자 꼭대기 ts ${mt?.pk} ${f1(mt?.peak)}장 · 안 휙 ${f1(mt?.never)}`);
      for (const c of CUES) {
        const parts = REACT.map((rr) => { const m = get(M, N, `cue|${c}|r${rr}|q${q}|D${D}|${sw}`); return m ? `r${rr} ${f1(mOf(m))}` : null; }).filter(Boolean);
        if (!parts.length) continue;
        // 반응 4칸을 시드마다 평균한 '사람' 한 명 → 짝 비
        const per = new Map();
        for (const rr of REACT) { const m = get(M, N, `cue|${c}|r${rr}|q${q}|D${D}|${sw}`); if (!m) continue; for (const [s, r] of m) { if (!per.has(s)) per.set(s, []); per.get(s).push(r.flip); } }
        const hum = new Map([...per].map(([s, a]) => [s, { flip: mean(a) }]));
        const tcs = [...(get(M, N, `cue|${c}|r${REACT[0]}|q${q}|D${D}|${sw}`)?.values() ?? [])].map((r) => r.meta.tc);
        console.log(`    ${c.padEnd(5)} 단서 ${f2(mean(tcs))}±${f2(sd(tcs))} s → ${parts.join(' · ')} | 사람(r 4칸 평균) ${f1(mOf(hum))} · ÷ 격자 꼭대기 ${ci(pair(best, hum))} · ÷ 안 휙 ${ci(pair(nv, hum))}`);
      }
    }
  }

  // ⑦ D(q) 요약: (장수, 쓸기, q) 마다 D 별 꼭대기·안 휙·놓자마자(ts 0)·90% 창·꼭대기 원 밖
  const Dset = [...new Set(combos.map((c) => c[1]))].sort((a, b) => a - b), Qset = [...new Set(combos.map((c) => c[0]))].sort((a, b) => a - b);
  if (Dset.length > 1) {
    console.log(`\n━━ D(q) 요약 — 칸: 꼭대기(ts) / 안 휙 / ts0 / 90% 창 / 꼭대기 원 밖 · 꼭대기÷안 휙 ━━`);
    for (const N of Ns) for (const sw of sws) {
      console.log(`  ${N}장 ${sw}`);
      for (const q of Qset) {
        const cells = Dset.map((D) => { const mt = mountain(M, N, q, D, sw); return mt ? `D${D} ${f1(mt.peak)}(${mt.pk})/${f1(mt.never)}/${f1(mt.ts0)}/${mt.w9.join('~')}/밖${f1(mt.peakOut)}·${f2(mt.peak / mt.never)}` : `D${D} —`; });
        const pk = mOf(get(M, N, `puck|q${q}`));
        console.log(`    q${q}: ${cells.join(' | ')}${Number.isFinite(pk) ? ` | 퍽 ${f1(pk)}` : ''}`);
      }
    }
  }

  // ⑧ ts 별 휙 순간 위 절반(ttF)·아래 절반(tbF)·꼭대기 넘을 때 위 절반(ttAtTop) — 원인 칩(이름/좋아요/늦음) 문턱 근거
  if (sws.length) {
    console.log(`\n━━ ts 별 평균: 뒤집힘 · ttF(휙 순간 위 절반°) · tbF(아래 절반°) · ttAtTop(바람 축이 꼭대기를 넘을 때 위 절반°, 못 넘으면 뺌 → 넘은 비율) ━━`);
    for (const N of Ns) for (const [q, D] of combos.filter((c) => c[1] === (Dset.includes(0.6) ? 0.6 : Dset[0]))) for (const sw of sws) {
      const cols = TS.map((ts) => { const m = get(M, N, `gb|q${q}|D${D}|${sw}|ts${ts}`); if (!m) return null; const rs = [...m.values()]; const cr = rs.filter((r) => r.ttAtTop >= 0); return `${ts}:${f1(mean(rs.map((r) => r.flip)))}/${f1(mean(rs.map((r) => r.ttF)))}/${f1(mean(rs.map((r) => r.tbF)))}/${cr.length ? f1(mean(cr.map((r) => r.ttAtTop))) : '—'}(${Math.round((100 * cr.length) / rs.length)}%)`; }).filter(Boolean);
      console.log(`  ${N}장 q${q} D${D} ${sw}: ${cols.join(' ')}`);
    }
  }

  // ⑨ 단서 + 반응 미리 보기(격자 보간, 시드마다 그 더미의 단서 시각 + r 을 ts 격자에서 선형 보간). 정확한 값은 cue 단계
  if (nev.length && sws.length) {
    console.log(`\n━━ 단서 + 반응 미리 보기(격자 보간 · r ${REACT.join('/')} 평균, 시드마다) — 칸: 사람 평균 / 격자 꼭대기 ━━`);
    for (const N of Ns) for (const [q, D] of combos) for (const sw of sws) {
      const mt = mountain(M, N, q, D, sw); if (!mt) continue;
      const nvm = get(M, N, `never|q${q}|D${D}`); if (!nvm) continue;
      const out = CUES.map((c) => {
        const vals = [];
        for (const [seed, nr] of nvm) {
          const tc = nr.cue[c]; if (tc == null) { vals.push(nr.flip); continue; }
          const ys = TS.map((ts) => get(M, N, `gb|q${q}|D${D}|${sw}|ts${ts}`)?.get(seed)?.flip);
          const at = (x) => { if (x >= TS.at(-1)) return x > D ? nr.flip : ys.at(-1); const i = Math.floor(x / 0.05), f = x / 0.05 - i; return ys[i] * (1 - f) + ys[i + 1] * f; };
          vals.push(mean(REACT.map((r) => at(tc + r))));
        }
        return `${c} ${f1(mean(vals))}`;
      });
      console.log(`  ${N}장 q${q} D${D} ${sw}: ${out.join(' · ')} | 꼭대기 ${f1(mt.peak)}(${mt.pk})`);
    }
  }

  // ⑩ 원인 칩 규칙(문법 B, chipOf): 안 쓸었어요 = 숨 동안 휙 없음 · 좋아요 = 뒤집힘 ≥ CHIP.good × 기준 꼭대기 · 그 밖 이름 = 휙 순간 위 절반 < CHIP.early° ·
  //    늦음 = 휙 순간 위 절반 ≥ CHIP.late° 또는 휙 때 남은 숨 < CHIP.rem 초 또는 바람 축이 숨 안에 꼭대기를 못 넘음 · 좋아요 = 그 밖.
  //    고른 쓸기(CHOSEN.sw[0])·D(q)(CHOSEN.dq) 의 ts 격자 줄에 적용 → 칩별 샷 수·평균 뒤집힘·꼭대기 대비 · '꼭대기 85% 이상' 비율(이름·늦음에서 0 에 가까워야 — 헷갈리는 칩)
  {
    const sw = CHOSEN.sw[0];
    const lines = [];
    for (const N of Ns) for (const q of Qset) {
      const D = CHOSEN.dq[q]; const mt = mountain(M, N, q, D, sw); if (!mt) continue;
      const rs = rows.filter((r) => r.N === N && r.q === q && r.D === D && ((r.kind === 'gb' && r.sw === sw && !r.key.startsWith('cue')) || r.kind === 'never'));
      const by = {}; for (const r of rs) (by[chipOf(r)] ||= []).push(r.flip);
      const hi = (v) => Math.round((100 * v.filter((x) => x >= 0.85 * mt.peak).length) / v.length);
      lines.push(`  ${N}장 q${q} D${D} ${sw} (꼭대기 ${f1(mt.peak)}): ${['early', 'good', 'late', 'none'].map((c) => (by[c] ? `${CHIP.name[c]} ${by[c].length}샷 ${f1(mean(by[c]))}장(${Math.round((100 * mean(by[c])) / mt.peak)}%, 85%↑ ${hi(by[c])}%)` : `${CHIP.name[c]} —`)).join(' · ')}`);
    }
    if (lines.length) { console.log(`\n━━ 원인 칩 규칙 적용(뒤집힘 ≥ ${CHIP.good} × 기준 꼭대기 ${JSON.stringify(CHIP.peak)} = 좋아요 · 그 밖 이름 < ${CHIP.early}° ≤ 좋아요 < ${CHIP.late}° ≤ 늦음, 휙 순간 위 절반 기울기 · 남은 숨 < ${CHIP.rem} s 또는 숨 안에 꼭대기 못 넘으면 늦음) ━━`); lines.forEach((l) => console.log(l)); }
  }

  // ⑪ 요약 표(고른 쓸기): ts 0/0.1/0.2/0.3/0.4/0.5/0.6·안 휙 칸 = 원 안 뒤집힘/어디든 뒤집힘/원 밖
  {
    const sw = CHOSEN.sw[0], tsSel = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const cell = (m) => (m ? `${f1(mOf(m))}/${f1(mOf(m, (r) => r.flipAny))}/${f1(mOf(m, (r) => r.out))}` : '—');
    const lines = [];
    for (const N of Ns) for (const [q, D] of combos.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      if (!get(M, N, `gb|q${q}|D${D}|${sw}|ts0`)) continue;
      lines.push(`  ${N}장 q${q} D${D}: ${tsSel.map((ts) => `${ts} ${cell(get(M, N, `gb|q${q}|D${D}|${sw}|ts${ts}`))}`).join(' · ')} · 안 휙 ${cell(get(M, N, `never|q${q}|D${D}`))}`);
    }
    if (lines.length) { console.log(`\n━━ 요약 표 ${sw}: 휙 시각별 원 안/어디든/원 밖 ━━`); lines.forEach((l) => console.log(l)); }
  }

  // ⑥ 원인(SweepCtl causeOf 고친 판) 분포 — 이른(ts ≤ 0.1)·꼭대기 ±0.05·늦은(≥ 꼭대기 + 0.2)·안 휙
  if (sws.length) {
    console.log(`\n━━ 원인 칩 후보: 지금 causeOf 분포 · 휙 순간 위 절반 기울기(ttF) · 바람 축이 꼭대기를 넘을 때 위 절반(ttAtTop) ━━`);
    for (const N of Ns) for (const [q, D] of combos) for (const sw of sws.slice(0, 2)) {
      const mt = mountain(M, N, q, D, sw); if (!mt) continue;
      const band = (lo, hi) => rows.filter((r) => r.N === N && r.kind === 'gb' && r.q === q && r.D === D && r.sw === sw && !r.key.startsWith('cue') && r.ts >= lo - 1e-9 && r.ts <= hi + 1e-9);
      const desc = (rs) => { const c = {}; for (const r of rs) c[r.cause] = (c[r.cause] || 0) + 1; return `${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / rs.length)}%`).join(' ')} · ttF ${f1(mean(rs.map((r) => r.ttF)))} · ttAtTop ${f1(mean(rs.filter((r) => r.ttAtTop >= 0).map((r) => r.ttAtTop)))} · 뒤집힘 ${f1(mean(rs.map((r) => r.flip)))}`; };
      const nv = rows.filter((r) => r.N === N && r.key === `never|q${q}|D${D}`);
      console.log(`  ${N}장 q${q} D${D} ${sw}\n    이른 ts 0~0.1: ${desc(band(0, 0.1))}\n    꼭대기 ±0.05: ${desc(band(mt.pk - 0.05, mt.pk + 0.05))}\n    늦은 ≥ 꼭대기+0.2: ${band(mt.pk + 0.2, 9).length ? desc(band(mt.pk + 0.2, 9)) : '—'}\n    안 휙: ${nv.length ? desc(nv) : '—'}`);
    }
  }
}

// ───────────────────────── 진입 ─────────────────────────
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepgbWorker) {
  await V1.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage(gbShot(job)); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  const t0 = Date.now();
  if (cmd === 'self') await self();
  else if (cmd === 'list') { for (const st of ['sweep', 'grid', 'held']) console.log(`${st}: ${makeJobs(st).length}샷`); }
  else if (cmd === 'run') await run(a[0], a[1], +(a[2] || 4));
  else if (cmd === 'same') await same(a[0], a[1], +(a[2] || 24));
  else if (cmd === 'report') report(a[0]);
  else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}

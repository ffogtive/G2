// tools/coresweep/pdfcheck.mjs — 재윤님 PDF '퍼크, 어떻게 떠서 뒤집히는가'(2026-10-15, 39초 영상 연속 컷 + Codex 분석)의 두 주장을
//   v1 게임 물리(simsweep.js ≡ mockup/src/sim.js)에서 같은 시드 짝으로 잰다. 설계서: docs/design/core-sweep.md (§0·§2.1·§2.4·§3.9·§4.1)
//
// 🧭 가설(측정 전, 미검증): PDF 의 두 주장이 v1 에서도 재현되는지가 코어(바닥 입 + 바람 자국 쓸어 올리기 타이밍)를 지킬지 고칠지 가른다.
//   (A) 입 높이가 더미 꼭대기 근처면 위쪽부터 들리고 큰 쓸기 없이도 많이 넘어간다(PDF 9·11쪽 '높이', 3쪽 '상부 딱지가 먼저').
//   (B) 고개를 고정하고 '퍼'(짧고 센 분출) → 간격 g → '크'(두 번째 분출)로 불면 g 에도 산이 있다(PDF 10쪽 '두 단계 사이가 너무 길면
//       내려앉고, 너무 이르면 아직 평평한 면에 힘이 걸린다').
//   → 판가름: (A) 꼭대기 입 최선 고정 ÷ 바닥 입 최선 고정, ÷ 지금 코어 튕김(C). 위·아래 4분의 1 기울기 10° 도달 시각 순서.
//            (B) g 0 / 0.05 / 0.10 / 0.15 / 0.25 / 0.35 초(화면)의 평균 장수가 산인가(가운데 정점, 양끝 ≤ 0.8×정점 = sweepmap gate ② 규칙)
//                + 정점 ÷ g 0(= 같은 총 숨의 연속 한 숨) 짝 비의 하한.
//
// 무엇을 바꾸나 (물리 손잡이는 하나도 안 바꾼다 — `node tools/sweepmap.mjs verify` 9/9 그대로):
//   - 입 높이 = sweepmap GEO.ym(기본 0.5 u = 12.5 mm). 고개 고정(sweep {}) = 입 고정·제트 수평(φ 0). 더미 앞면에서 수평 4 u(10 cm) 그대로.
//       lip4 0.15 u(3.75 mm = simsweep lipMinY, 입술이 책상에 닿음 — 지시 밖 추가 칸) / floor 0.5 u(지금 코어) / mid 꼭대기 × 0.5 /
//       top 꼭대기 / top5 꼭대기 + 0.2 u(5 mm). 꼭대기 = 그 샷 더미의 정착 높이 columnTop(시드마다 다름, shot() 의 top0 과 같은 값).
//       주의: 20장 꼭대기 약 24 mm 라 mid(약 12 mm) ≈ floor(12.5 mm)다. 지금 '바닥 입'은 이미 20~40장 더미 높이의 35~52% 에 있다.
//   - 숨 봉투: 게임 문법 rel(0.26 s 올라감 → 뗄 때까지 가득 → 0.04 s 끊김, §4.1)과 새 'box2' = 둥근 상자 두 개
//       (퍼 a 초 → 쉼 g → 크 b 초. 가장자리는 너비 0.04 s 코사인 경사를 상자 끝에 '가운데 맞춤' → 상자마다 ∫env = 길이 그대로.
//        그래서 g 0 은 a+b 길이 한 숨과 같다 = '같은 총 숨의 연속 한 숨' 기준. b 0 = 퍼만).
//       봉투는 숨 세기 q 에 곱해질 뿐이다(들기 ∝ env·q, 밀기 ∝ env·q^2.93). 결과를 키우는 계수가 아니다.
//   - 한 샷 = shotX: sweepmap shot() 과 같은 코드. 다른 점은 (1) box2 봉투 (2) 꼭대기 기준 입 높이 (3) 4분의 1 기울기 기록(읽기만) 뿐.
//       `self` 가 표준 숨에서 shotX ≡ shot() (모든 필드)을, `same` 이 30장 바닥 격자·튕김 줄을 레포 원자료 vf/chk401 과 비트 대조한다.
//
// 기울기 = 딱지마다 acos(−up_y) (처음 뒷면이 위 = 0°, 다 뒤집힘 = 180°, sweepmap halves() 와 같음). 4분의 1 = 쌓은 순서(id) 기준
//   아래 ⌊4k/n⌋ = 0, 위 = 3. 도달 시각 t5·t10 = 그 4분의 1 평균 기울기가 처음 5°·10° 를 넘는 시각(매 스텝, 화면 초). 실물 초 = ÷ 3.21.
//
// 명령 (CPU 4코어 공유: 기본 2 일꾼. 1 일꾼 한 샷 20장 0.3 s · 30장 0.55 s · 40장 1.0 s)
//   node tools/coresweep/pdfcheck.mjs self                       shotX ≡ shot() (표준 숨 6샷, 모든 필드)
//   node tools/coresweep/pdfcheck.mjs list [A|B <out.jsonl>]     단계별 샷 수
//   node tools/coresweep/pdfcheck.mjs run A <out.jsonl> [W=2]    (A) 입 높이 5 × 게임 문법 고정 격자 16 + (C) 지금 코어 튕김 2 (이어 돌리기 가능)
//   node tools/coresweep/pdfcheck.mjs run B <out.jsonl> [W=2]    (B) 두 번 분출. 같은 파일의 (A) 줄로 장수마다 '바닥이 아닌 최선 높이'를 고른다
//   node tools/coresweep/pdfcheck.mjs report <out.jsonl[.gz][,…]>
//   node tools/coresweep/pdfcheck.mjs same <out.jsonl[.gz]> [옛.jsonl.gz = tools/coresweep/data/vf/chk401.jsonl.gz]
// 환경: SEEDS=401-412(기본, 12짝) · NS=20,30,40(기본) · BH=top (run B 의 둘째 높이를 고정할 때만) · KEYS=정규식 (그 키만 돌림, 시드 늘리기용)
// 원자료: tools/coresweep/data/pdf/pdf401.jsonl.gz (5,760줄, report 는 .gz 를 바로 읽는다). 만든 순서 (2 일꾼, 합 약 29분):
//   node tools/coresweep/pdfcheck.mjs run A out.jsonl 2                                           2,952샷 873 s
//   node tools/coresweep/pdfcheck.mjs run B out.jsonl 2                                           1,872샷 554 s (둘째 높이 = 세 장수 모두 mid)
//   SEEDS=413-424 KEYS='^v\|Atop' node tools/coresweep/pdfcheck.mjs run A out.jsonl 2            72샷 21 s   ((C) 24짝으로)
//   SEEDS=413-424 BH=mid KEYS='\|b0\.3\|' node tools/coresweep/pdfcheck.mjs run B out.jsonl 2    864샷 268 s (산 후보인 크 0.3 s 곡선만 24짝으로)
//   → (A)·크 0.15 s 곡선은 401~412(12짝), (C)·크 0.3 s 곡선은 401~424(24짝). report 가 늘린 반(413~424)을 따로 찍는다(처음 반에서 고른 정점의 독립 반복).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as SW from './simsweep.js';
import { shot, breathOf, makeProg, causeOf, poseAt, GEO, regCell, pairedRatio, index, bestKey, line } from '../sweepmap.mjs';

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
const readRows = (files) => files.split(',').flatMap((f) => (existsSync(f) ? readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []));

// ───────────────────────── 숨 봉투 ─────────────────────────
const RAMP = 0.04; // box2 가장자리 경사 너비(화면 초) = 게임의 '떼면 0.04 s 에 끊김'과 같은 너비
const ramp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 * (1 - Math.cos(Math.PI * x)));
// 둥근 상자 [s, e]: 경사를 끝점에 가운데 맞춤 → ∫ = e − s (경사 둘이 서로 상쇄). 시작 경사가 t = 0 에서 시작하도록 RAMP/2 밀었다
const box = (t, s, e) => ramp((t - RAMP / 2 - s) / RAMP + 0.5) - ramp((t - RAMP / 2 - e) / RAMP + 0.5);
export function breathX(b) {
  if (b.kind === 'box2') {
    const [a, g, c] = b.D; // 퍼 길이, 쉼, 크 길이 (화면 초)
    return { dur: a + g + c + RAMP, env: (t) => box(t, 0, a) + (c > 0 ? box(t, a + g, a + g + c) : 0) };
  }
  return breathOf(b.kind, b.D, b.off);
}

function rot(q, v) { // sweepmap.mjs rot() 와 같은 식
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}

// ───────────────────────── 한 샷 (sweepmap shot() 과 같은 코드 + 읽기 전용 기록) ─────────────────────────
// job 추가 필드: breath.kind 'box2' · ymOf {f, add} (입 높이 = f·꼭대기 + add) · trace4 (4분의 1 기울기 1/60 s 기록, 0.8 s 까지) · probeT (그 시각 4분의 1 기울기)
export function shotX(job) {
  SW.setDiscH(job.H || 0.11);
  const t = new SW.Table(job.seed * 7907 + job.n, job.tune || {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle(job.settleSteps || 600);
  const top0 = t.columnTop();
  const c0 = t.pileCenter();
  const zf = c0.z + 1;
  const br = breathX(job.breath);
  const geo = { ...GEO, ...(job.geo || {}) };
  if (job.ymOf) geo.ym = job.ymOf.f * top0 + job.ymOf.add;
  const prog = makeProg(t, { kin: job.kin || 'c', sweep: job.sweep || {}, breath: br, geo });
  t.blowProg({ prog, power: job.q, dur: br.dur });
  const live = t.liveDiscs();
  const bottom = live[0];
  const half = Math.floor(job.n / 2);
  let maxTiltBottom = 0, tLift = -1;
  let maxTB = 0, maxTT = 0, endTB = 0, tTop = -1, ttAtTop = -1;
  const halves = () => {
    let tb = 0, tt = 0;
    live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); const a = Math.acos(Math.max(-1, Math.min(1, -u.y))); if (k < half) tb += a; else tt += a; });
    return [tb / Math.max(1, half) / D2R, tt / Math.max(1, job.n - half) / D2R];
  };
  // 4분의 1 기울기 (읽기만 — 물리에 영향 없음)
  const qi = live.map((_, k) => Math.min(3, Math.floor((4 * k) / job.n)));
  const qc = [0, 0, 0, 0]; for (const v of qi) qc[v]++;
  const quarters = () => {
    const s = [0, 0, 0, 0];
    live.forEach((d, k) => { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); s[qi[k]] += Math.acos(Math.max(-1, Math.min(1, -u.y))); });
    return s.map((v, j) => v / Math.max(1, qc[j]) / D2R);
  };
  const on = { b5: -1, b10: -1, t5: -1, t10: -1 };
  const qmax = [0, 0, 0, 0];
  const s4 = job.trace4 ? [] : null;
  let probe = null;
  const dtS = t.T.dt;
  const maxSteps = Math.ceil((job.maxSec || 8) / dtS);
  let i = 0, capped = 1, below = false;
  for (; i < maxSteps; i++) {
    const P = t.puff;
    let crossed = false;
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
    }
    // ── 추가 기록 ──
    const tn = (i + 1) * dtS;
    const Q = quarters();
    for (let j = 0; j < 4; j++) if (Q[j] > qmax[j]) qmax[j] = Q[j];
    if (on.b5 < 0 && Q[0] >= 5) on.b5 = tn;
    if (on.b10 < 0 && Q[0] >= 10) on.b10 = tn;
    if (on.t5 < 0 && Q[3] >= 5) on.t5 = tn;
    if (on.t10 < 0 && Q[3] >= 10) on.t10 = tn;
    if (s4 && i % 2 === 1 && tn <= 0.8 + 1e-9) s4.push([+tn.toFixed(4), ...Q.map((v) => +v.toFixed(1))]);
    if (job.probeT !== undefined && !probe && tn >= job.probeT - 1e-9) probe = Q.map((v) => +v.toFixed(1));
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
    fan: zs.length ? +(zs[zs.length - 1] - zs[0]).toFixed(3) : 0,
    fwd: zs.length ? +(-zs[Math.floor(zs.length / 2)]).toFixed(3) : 0,
    whole: flippedSet.size >= 0.7 * job.n ? 1 : 0,
    tilt0: +(maxTiltBottom / D2R).toFixed(1), tLift: +tLift.toFixed(3), top0: +top0.toFixed(3), steps: i, capped,
    maxTB: +maxTB.toFixed(1), endTB: +endTB.toFixed(1), maxTT: +maxTT.toFixed(1), tTop: +tTop.toFixed(3), ttAtTop: +ttAtTop.toFixed(1),
  };
  r.cause = causeOf(r);
  // 추가 필드 (shot() 에는 없음)
  r.x = { ym: +geo.ym.toFixed(4), on: Object.fromEntries(Object.entries(on).map(([k, v]) => [k, +v.toFixed(4)])), qmax: qmax.map((v) => +v.toFixed(1)), envInt: +envIntegral(br).toFixed(4) };
  if (probe) r.x.probe = probe;
  if (s4) r.x.s4 = s4;
  return r;
}
// 숨 총량 ∫env dt (화면 초, q 를 곱하기 전). 숨 풍선 비용과 따로 — 같은 총 숨 비교용
function envIntegral(br) { let s = 0; const h = 1 / 1200; for (let t = 0; t < br.dur; t += h) s += br.env(t) * h; return s; }

// ───────────────────────── 작업 ─────────────────────────
const SEEDS = () => { const [a, b] = (process.env.SEEDS || '401-412').split('-').map(Number); return R(a, b ?? a); };
const NS = () => (process.env.NS ? process.env.NS.split(',').map(Number) : [20, 30, 40]);
const QS = [0.7, 0.85, 0.93, 1.0], HS = [0.3, 0.4, 0.5, 0.6]; // 게임 문법 고정 격자 (sweepcheck v|relfix 의 0.8 s 칸만 뺌)
export const HEIGHTS = { lip4: { geo: { ym: 0.15 } }, floor: { geo: { ym: 0.5 } }, mid: { ymOf: { f: 0.5, add: 0 } }, top: { ymOf: { f: 1, add: 0 } }, top5: { ymOf: { f: 1, add: 0.2 } } };
const HL = Object.keys(HEIGHTS);
const rel = (D) => ({ kind: 'rel', D: +D.toFixed(4), off: 0.04 }); // sweepcheck rel() 과 같은 반올림
const TRACE = { q: 0.85, h: 0.5 }; // 들림 순서를 시계열로 남길 고정 숨 한 칸
const B_A = 0.1, B_GS = [0, 0.05, 0.1, 0.15, 0.25, 0.35], B_BS = [0.15, 0.3], B_QS = [0.85, 1.0];

// sweepcheck.mjs 와 같은 꼭대기 각 계산 (지금 코어 튕김 'v|Atop|rel@top' 을 같은 작업으로 만들기 위해)
const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };
function pileTop(n, seed) { SW.setDiscH(0.11); const t = new SW.Table(seed * 7907 + n); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(600); return t.columnTop(); }

function jobsA() {
  const J = [];
  for (const n of NS()) for (const s of SEEDS()) {
    const base = { n, seed: s, kin: 'c', sweep: {} };
    for (const hl of HL) for (const q of QS) for (const h of HS)
      J.push({ ...base, ...HEIGHTS[hl], key: `pA|${hl}|q${q}|h${h}`, breath: rel(h), q, ...(q === TRACE.q && h === TRACE.h ? { trace4: true } : {}) });
    // (C) 지금 코어 튕김 — sweepcheck makeJobs 의 'v|Atop|rel@top'·'v|Atop|rel@top+.1' 과 같은 작업(같은 반올림)
    const rc = regCell(n), sw = rc.sweep;
    const at = alphaTop(pileTop(n, s)), Atop = +(at + 0.5).toFixed(3);
    const tTop = sw.t0 + Atop / sw.w + 0.04;
    const meta = { alphaTop: +at.toFixed(2), Atop, tTop: +tTop.toFixed(3) };
    J.push({ n, seed: s, kin: 'c', key: 'v|Atop|rel@top', breath: rel(tTop), q: rc.q, sweep: { ...sw, A: Atop }, meta });
    J.push({ n, seed: s, kin: 'c', key: 'v|Atop|rel@top+.1', breath: rel(tTop + 0.1), q: rc.q, sweep: { ...sw, A: Atop }, meta });
  }
  return J;
}

// (A) 줄에서 장수마다 '바닥이 아닌 최선 높이' (최선 격자 칸 평균이 가장 큰 높이, 같은 이름이면 HL 순서). BH=이름 이면 그 높이로 고정
function bestHeights(rows) {
  const M = index(rows), out = {};
  for (const n of NS()) {
    const K = M.get(n);
    if (process.env.BH) { out[n] = process.env.BH; continue; }
    if (!K) throw new Error(`${n}장 (A) 줄 없음 — run A 를 먼저`);
    let bh = null, bm = -1;
    for (const hl of HL) {
      if (hl === 'floor') continue;
      const k = bestKey(K, (x) => x.startsWith(`pA|${hl}|`));
      if (!k) continue;
      const m = mean([...K.get(k).values()].map((r) => r.flip));
      if (m > bm) { bm = m; bh = hl; }
    }
    out[n] = bh;
  }
  return out;
}

function jobsB(of) {
  const bh = bestHeights(readRows(of));
  const J = [];
  for (const n of NS()) for (const s of SEEDS()) for (const hl of ['floor', bh[n]]) {
    const base = { n, seed: s, kin: 'c', sweep: {}, ...HEIGHTS[hl] };
    for (const q of B_QS) {
      J.push({ ...base, key: `pB|${hl}|q${q}|puOnly`, breath: { kind: 'box2', D: [B_A, 0, 0] }, q });
      for (const b of B_BS) for (const g of B_GS)
        J.push({ ...base, key: `pB|${hl}|q${q}|b${b}|g${g}`, breath: { kind: 'box2', D: [B_A, g, b] }, q, probeT: +(B_A + g).toFixed(4) });
    }
  }
  return { J, bh };
}

async function runJobs(jobs, of, W) {
  const tag = (j) => `${j.key}|${j.seed}|${j.n}`;
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) done.add(tag(JSON.parse(l)));
  const keep = process.env.KEYS ? new RegExp(process.env.KEYS) : null; // KEYS=정규식: 그 키만 (시드 늘리기용)
  const todo = jobs.filter((j) => !done.has(tag(j)) && (!keep || keep.test(j.key))).sort((a, b) => b.n - a.n); // 큰 더미 먼저(일꾼 균형)
  console.error(`작업 ${jobs.length}, 남은 것 ${todo.length}, 일꾼 ${W} → ${of}`);
  let k = 0, fin = 0;
  const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    if (!todo.length) return res();
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { pdfcheckWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 100 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ───────────────────────── 점검 ─────────────────────────
const SHOT_FIELDS = (r) => { const { x, key, meta, series, ...rest } = r; return rest; };
async function selfTest() {
  await SW.initPhysics();
  const cases = [
    { n: 20, seed: 401, breath: rel(0.5), q: 0.85, kin: 'c', sweep: {} },
    { n: 20, seed: 402, breath: rel(0.3), q: 1.0, kin: 'c', sweep: {}, geo: { ym: 1.3 } },
    { n: 30, seed: 403, breath: { kind: 'pueok', D: 0.6 }, q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0: 0.25 } },
    { n: 30, seed: 404, breath: rel(0.4), q: 0.93, kin: 'c', sweep: {}, geo: { ym: 0.15 } },
    { n: 40, seed: 405, breath: rel(0.4025), q: 0.85, kin: 'c', sweep: { A: 7.5, w: 120, t0: 0.3 } },
    { n: 20, seed: 406, breath: { kind: 'puff' }, q: 0.95, kin: 'c', sweep: {} },
  ];
  let ok = 0;
  for (const j of cases) {
    const a = JSON.stringify(shot(j)), b = JSON.stringify(SHOT_FIELDS(shotX(j)));
    if (a === b) ok++; else console.log('다름', JSON.stringify(j), '\n  shot ', a, '\n  shotX', b);
  }
  // box2: g 0 이면 a+b 한 상자와 같은 봉투(부동소수 오차 안), 상자마다 ∫ = 길이
  const e1 = breathX({ kind: 'box2', D: [0.1, 0, 0.2] }), e2 = breathX({ kind: 'box2', D: [0.3, 0, 0] });
  let md = 0; for (let t = 0; t < 0.4; t += 0.001) md = Math.max(md, Math.abs(e1.env(t) - e2.env(t)));
  const ints = [[0.1, 0, 0], [0.1, 0.05, 0.15], [0.1, 0.35, 0.3]].map((D) => envIntegral(breathX({ kind: 'box2', D })).toFixed(4));
  console.log(`shotX ≡ shot() ${ok}/${cases.length} (모든 필드 비트 동일) · box2 g0 ≡ 한 상자 최대차 ${md.toExponential(1)} · ∫env [0.1]/[0.1+0.15]/[0.1+0.3] = ${ints.join(' / ')}`);
  if (ok !== cases.length || md > 1e-12) process.exitCode = 1;
}

// 30장 바닥 격자·튕김 줄 ↔ 레포 원자료(sweepcheck chk401) 비트 대조. 키 이름만 다르다(pA|floor|q|h ↔ v|relfix|q|h)
function sameOld(fNew, fOld) {
  const old = new Map(readRows(fOld).map((r) => [`${r.n}|${r.key}|${r.seed}`, JSON.stringify(SHOT_FIELDS(r))]));
  let ok = 0, bad = 0, miss = 0;
  for (const r of readRows(fNew)) {
    let k = null;
    if (r.key.startsWith('pA|floor|')) k = r.key.replace('pA|floor|', 'v|relfix|');
    else if (r.key.startsWith('v|Atop|')) k = r.key;
    if (!k) continue;
    const o = old.get(`${r.n}|${k}|${r.seed}`);
    if (o === undefined) { miss++; continue; }
    if (o === JSON.stringify(SHOT_FIELDS(r))) ok++; else { bad++; if (bad <= 5) console.log('다름', r.n, r.key, r.seed); }
  }
  console.log(`원자료와 같음 ${ok} · 다름 ${bad} · 원자료에 없음(정상: 20·40장, 다른 키) ${miss}`);
  if (bad || !ok) process.exitCode = 1;
}

// ───────────────────────── 보고 ─────────────────────────
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const ci = (p) => (p ? `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}]` : '-');
const cid = (p) => (p ? `${p.d >= 0 ? '+' : ''}${p.d.toFixed(2)} [${p.dlo.toFixed(2)}, ${p.dhi.toFixed(2)}]` : '-');
const pair = (A, B, f = (r) => r.flip) => { if (!A || !B) return null; const s = [...A.keys()].filter((x) => B.has(x)).sort((a, b) => a - b); return s.length ? pairedRatio(s.map((x) => f(A.get(x))), s.map((x) => f(B.get(x)))) : null; };
const meanOn = (m, S) => mean(S.map((s) => m.get(s).flip));
function bestOn(K, test, S) { let best = null, bm = -1; for (const [k, m] of K) if (test(k) && S.every((s) => m.has(s))) { const v = meanOn(m, S); if (v > bm) { bm = v; best = k; } } return best; }
// 반씩 교차(sweepcheck 와 같은 규칙): 시드 오름차순 앞 반 A / 뒤 반 B. 한 반에서 기준·비교 칸을 고르고 다른 반에서 짝 비, 두 방향을 이어 한 번 부트스트랩
function cross(K, seeds, pickBase, pickEval) {
  const h = Math.floor(seeds.length / 2); if (h < 1) return null;
  const A = seeds.slice(0, h), B = seeds.slice(h), xs = [], ys = [], picks = [];
  for (const [sel, ev] of [[A, B], [B, A]]) {
    const kb = pickBase(sel), ke = pickEval(sel); picks.push([kb, ke]);
    if (!kb || !ke) return null;
    for (const s of ev) { xs.push(K.get(kb).get(s).flip); ys.push(K.get(ke).get(s).flip); }
  }
  return { p: pairedRatio(xs, ys), picks };
}
const cell = (k) => k.split('|').slice(2).join('·');

function report(files) {
  const M = index(readRows(files));
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n), g = (k) => K.get(k);
    const flick = g('v|Atop|rel@top'), flick1 = g('v|Atop|rel@top+.1');
    if (!flick) continue;
    // 비교마다 시드 묶음이 다를 수 있다(시드 늘리기는 일부 키만) → 반씩 교차는 그 비교의 키가 모두 가진 시드로
    const seedsOf = (...ks) => [...flick.keys()].filter((s) => ks.every((k) => g(k)?.has(s))).sort((a, b) => a - b);
    const sF = seedsOf('pA|floor|q1|h0.4');
    const seeds = sF.length ? sF : [...flick.keys()].sort((a, b) => a - b);
    const top = mean([...flick.values()].map((r) => r.top0));
    const rgs = (S) => `${S[0]}~${S[S.length - 1]} (${S.length}짝)`;
    console.log(`\n══ ${n}장  (A) 시드 ${rgs(seeds)} · (C) 시드 ${rgs([...flick.keys()].sort((a, b) => a - b))}  꼭대기 평균 ${top.toFixed(2)} u (${(top * 25).toFixed(0)} mm)`);
    console.log('-- (C) 지금 코어 튕김 (바닥 입 12.5 mm, 바람 자국을 꼭대기까지 쓸고 떼기 · sweepcheck 와 같은 작업)');
    console.log(line('v|Atop|rel@top', flick));
    if (flick1) console.log(line('v|Atop|rel@top+.1', flick1) + `   ÷rel@top ${ci(pair(flick, flick1))}`);
    const bFloor = bestKey(K, (k) => k.startsWith('pA|floor|'));
    if (!bFloor) continue;
    const isH = (hl) => (k) => k.startsWith(`pA|${hl}|`);
    console.log(`   (C) ÷ 바닥 입 게임 문법 최선 고정(${cell(bFloor)}, 같은 시드에서 고름) = ${ci(pair(g(bFloor), flick))} · +.1 = ${ci(pair(g(bFloor), flick1))}`);
    const xc = cross(K, seeds, (S) => bestOn(K, isH('floor'), S), () => 'v|Atop|rel@top');
    if (xc) console.log(`      └ 반씩 교차 ${ci(xc.p)} (고른 칸 ${xc.picks.map((p) => cell(p[0])).join(' / ')})`);

    console.log('-- (A) 고개 고정 · 입 높이 × 게임 문법 고정 격자 (q 0.7/0.85/0.93/1.0 × 떼기 0.3/0.4/0.5/0.6 s)');
    console.log('   높이   입 mm | 최선 칸 → 평균장 [95%] 원밖 통째 | ÷바닥 최선 (같은 시드) | 반씩 교차 | ÷튕김(C) [같은 시드 고름] | 격자 16칸 평균');
    for (const hl of HL) {
      const bk = bestKey(K, isH(hl)); if (!bk) continue;
      const m = g(bk), ym = mean([...m.values()].map((r) => r.x.ym));
      const all = mean([...K.keys()].filter(isH(hl)).map((k) => mean([...g(k).values()].map((r) => r.flip))));
      const xh = hl === 'floor' ? null : cross(K, seeds, (S) => bestOn(K, isH('floor'), S), (S) => bestOn(K, isH(hl), S));
      const lb = line('', m).trim().split('  원밖')[0];
      console.log(`   ${hl.padEnd(5)} ${(ym * 25).toFixed(1).padStart(5)} | ${cell(bk).padEnd(9)} → ${lb} 원밖 ${mean([...m.values()].map((r) => r.out)).toFixed(1)} 통째 ${(100 * mean([...m.values()].map((r) => r.whole))).toFixed(0)}% | ${hl === 'floor' ? '1 (기준)' : ci(pair(g(bFloor), m))} | ${xh ? ci(xh.p) : '-'} | ${ci(pair(flick, m))} | ${all.toFixed(1)}`);
    }
    console.log('   격자 평균장 (행 q, 열 떼기 0.3/0.4/0.5/0.6 s)');
    for (const hl of HL) {
      if (!bestKey(K, isH(hl))) continue;
      const rows = QS.map((q) => `q${q} ${HS.map((h) => { const m = g(`pA|${hl}|q${q}|h${h}`); return m ? mean([...m.values()].map((r) => r.flip)).toFixed(1).padStart(4) : '   -'; }).join(' ')}`);
      console.log(`     ${hl.padEnd(5)} ${rows.join(' │ ')}`);
    }

    console.log(`-- (A) 들림 순서: 고정 숨 q ${TRACE.q} · ${TRACE.h} s 떼기. 4분의 1 평균 기울기 10° 도달 시각(화면 초, ÷3.21 = 실물)`);
    console.log('   높이  | 위¼ t10  아래¼ t10 | 아래 − 위 [95%] (둘 다 도달한 시드) | 위가 먼저 | 0.10 / 0.20 / 0.30 s 위¼·아래¼ 기울기° | 격자 16칸 전체: 위가 먼저 / 아래가 먼저 / 둘 다 안 됨');
    for (const hl of HL) {
      const m = g(`pA|${hl}|q${TRACE.q}|h${TRACE.h}`); if (!m) continue;
      const R2 = [...m.values()];
      const both = R2.filter((r) => r.x.on.t10 > 0 && r.x.on.b10 > 0);
      const d = both.length ? pairedRatio(both.map((r) => r.x.on.t10), both.map((r) => r.x.on.b10)) : null;
      const first = (r) => { const a = r.x.on.t10 > 0 ? r.x.on.t10 : Infinity, b = r.x.on.b10 > 0 ? r.x.on.b10 : Infinity; return a === b ? 0 : a < b ? 1 : -1; };
      const tf = R2.filter((r) => first(r) === 1).length;
      const at = (tt) => { const v = R2.map((r) => r.x.s4.find((s) => s[0] >= tt - 1e-6)).filter(Boolean); return `${mean(v.map((s) => s[4])).toFixed(0)}·${mean(v.map((s) => s[1])).toFixed(0)}`; };
      const tm = (f) => { const v = R2.map((r) => r.x.on[f]).filter((x) => x > 0); return v.length ? `${mean(v).toFixed(3)}${v.length < R2.length ? `(${v.length})` : ''}` : '안 됨'; };
      const allRows = [...K.keys()].filter(isH(hl)).flatMap((k) => [...g(k).values()]);
      const fa = [1, -1, 0].map((v) => allRows.filter((r) => first(r) === v).length);
      console.log(`   ${hl.padEnd(5)} | ${tm('t10').padStart(8)} ${tm('b10').padStart(9)} | ${d ? `${d.d >= 0 ? '+' : ''}${d.d.toFixed(3)} [${d.dlo.toFixed(3)}, ${d.dhi.toFixed(3)}] N${both.length}` : '-'} | ${tf}/${R2.length} | ${at(0.1)} / ${at(0.2)} / ${at(0.3)} | ${fa[0]} / ${fa[1]} / ${fa[2]} (N${allRows.length})`);
    }

    const bhs = [...new Set([...K.keys()].filter((k) => k.startsWith('pB|')).map((k) => k.split('|')[1]))];
    if (!bhs.length) continue;
    console.log(`-- (B) 고개 고정 두 번 분출: 퍼 ${B_A} s → 쉼 g → 크 b s (경사 ${RAMP} s, g 0 = 같은 총 숨 연속 한 숨). 평균장 (원 밖)`);
    for (const hl of ['floor', ...bhs.filter((h) => h !== 'floor')]) {
      if (!bhs.includes(hl)) continue;
      const isB = (k) => k.startsWith(`pB|${hl}|`);
      const bB = bestKey(K, isB), bF = bestKey(K, isH(hl));
      for (const q of B_QS) {
        const po = g(`pB|${hl}|q${q}|puOnly`);
        console.log(`   [${hl} 입 ${(mean([...(po || g(bB)).values()].map((r) => r.x.ym)) * 25).toFixed(1)} mm · q ${q}]  퍼만 ${po ? mean([...po.values()].map((r) => r.flip)).toFixed(1) : '-'}장`);
        for (const b of B_BS) {
          const ks = B_GS.map((gg) => `pB|${hl}|q${q}|b${b}|g${gg}`);
          if (!ks.every((k) => g(k))) continue;
          const ms = ks.map((k) => mean([...g(k).values()].map((r) => r.flip)));
          const os = ks.map((k) => mean([...g(k).values()].map((r) => r.out)));
          const pr = ks.map((k) => mean([...g(k).values()].map((r) => mean(r.x.probe || [0]))));
          const mx = Math.max(...ms), ai = ms.indexOf(mx);
          const hill = ai > 0 && ai < ms.length - 1 && ms[0] <= 0.8 * mx && ms[ms.length - 1] <= 0.8 * mx;
          const pk = pair(g(ks[0]), g(ks[ai])), pl = pair(g(ks[ks.length - 1]), g(ks[ai]));
          // 반씩 교차: 정점 g 를 한 반에서 고르고 다른 반에서 정점 ÷ g0
          const sB = seedsOf(...ks);
          const xg = cross(K, sB, () => ks[0], (S) => bestOn(K, (k) => ks.includes(k), S));
          console.log(`     b ${b} (N${sB.length}): g ${B_GS.join('/')} = ${ms.map((v) => v.toFixed(1)).join(' / ')}  (원밖 ${os.map((v) => v.toFixed(1)).join('/')})  ${hill ? '산' : '산 아님'} · 정점 g${B_GS[ai]} ÷ g0 ${ci(pk)} · ÷ g${B_GS[B_GS.length - 1]} ${ci(pl)} · 반씩 교차 정점÷g0 ${xg ? ci(xg.p) : '-'} (고른 g ${xg ? xg.picks.map((p) => p[1].split('|g')[1]).join('/') : '-'})`);
          if (sB.length > seeds.length) { // 시드를 늘린 줄: 늘린 반만 따로 (사전에 고른 칸의 독립 반복)
            const ext = sB.filter((s) => !seeds.includes(s)), sub = (k) => new Map(ext.map((s) => [s, g(k).get(s)]));
            const me = ks.map((k) => mean(ext.map((s) => g(k).get(s).flip)));
            const kPk = bestOn(K, (k) => ks.includes(k), seeds); // 정점 g 는 처음 시드(401~412)에서 고른다 → 늘린 시드는 독립 평가
            const flickExt = ext.every((s) => flick.has(s)) ? ci(pair(sub('v|Atop|rel@top'), sub(kPk))) : '-';
            console.log(`            늘린 시드 ${rgs(ext)}만: ${me.map((v) => v.toFixed(1)).join(' / ')} · 처음 시드에서 고른 정점 g${kPk.split('|g')[1]} ÷ g0 = ${ci(pair(sub(ks[0]), sub(kPk)))} · ÷ 튕김(C) = ${flickExt}`);
          }
          console.log(`            크 시작 때 더미 평균 기울기° = ${pr.map((v) => v.toFixed(0)).join(' / ')}`);
        }
      }
      if (bB) {
        console.log(`   [${hl}] 두 번 분출 최선 ${cell(bB)} ${mean([...g(bB).values()].map((r) => r.flip)).toFixed(1)}장 · ÷ 같은 높이 게임 문법 최선 고정(${bF ? cell(bF) : '-'}) ${ci(pair(g(bF), g(bB)))} · ÷ 튕김(C) ${ci(pair(flick, g(bB)))} (모두 같은 시드에서 고름)`);
        const xb = cross(K, seeds, () => 'v|Atop|rel@top', (S) => bestOn(K, isB, S));
        if (xb) console.log(`      └ 반씩 교차 두 번 분출 최선 ÷ 튕김(C) ${ci(xb.p)} (고른 칸 ${xb.picks.map((p) => cell(p[1])).join(' / ')})`);
      }
    }
  }
}

// ───────────────────────── 진입 ─────────────────────────
if (!isMainThread && workerData?.pdfcheckWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shotX(job), key: job.key, ...(job.meta ? { meta: job.meta } : {}) }); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'self') await selfTest();
  else if (cmd === 'list') {
    await SW.initPhysics();
    const A = jobsA(); const c = {}; for (const j of A) c[j.n] = (c[j.n] || 0) + 1;
    console.log(`(A)+(C) ${A.length}샷`, c);
    if (a[0] === 'B' && a[1]) { const { J, bh } = jobsB(a[1]); console.log(`(B) ${J.length}샷, 둘째 높이`, bh); }
  } else if (cmd === 'run') {
    const st = a[0], of = a[1], W = +(a[2] || 2);
    if (!of) throw new Error('run A|B <out.jsonl> [W]');
    await SW.initPhysics();
    if (st === 'A') await runJobs(jobsA(), of, W);
    else if (st === 'B') { const { J, bh } = jobsB(of); console.error('(B) 둘째 높이', JSON.stringify(bh)); await runJobs(J, of, W); }
    else throw new Error('단계는 A 또는 B');
    report(of);
  } else if (cmd === 'report') report(a[0]);
  else if (cmd === 'same') sameOld(a[0], a[1] || new URL('./data/vf/chk401.jsonl.gz', import.meta.url).pathname);
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

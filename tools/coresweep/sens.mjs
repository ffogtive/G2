// tools/coresweep/sens.mjs — 테두리 임펄스 모델 민감도 (Codex P2, docs/design/core-sweep.md §3.10)
//
// 가설: 30·45장의 '시작 시각 산'과 튕김 이득은 시간에 따라 바뀌는 접촉 높이(기하 × 시간)에서 나오므로,
//       v1 테두리 임펄스 모델(닿는 점 rimHit · 들기 계수 lift · 바닥값 minLift · 두께 DISC_H)을 그럴듯한 범위에서 바꿔도 남는다.
//       무너지면 '기하 × 시간'은 그 모델의 산물이다.
//
// 물리는 simsweep.js 기본값 그대로이고, 변형은 Table(tune)·setDiscH 로만 준다(simsweep.js 수정 없음 → `sweepmap verify` 그대로).
// 한 샷은 sweepmap.mjs 의 shot(), 작업 정의는 sweepmap gate ②(시작 시각) · sweepcheck ①(rel 고정 격자 · 꼭대기 +0.5° 에서 떼기) · ④(b* 경로 맞춤) 그대로.
//
// 변형 (기본값: lift 519.59 · minLift 0.151 · rimHit 1 · DISC_H 0.11)
//   base        기본
//   rim0        rimHit 0 = 옛 '입에 가장 가까운 테두리' 모델(제트-테두리 교점 계산 끔, 옆 손실·꺾임·회전도 꺼짐)
//   minL×0.5/1.5  붙은 테두리 바닥 들기(minLift) 0.0755 / 0.2265
//   lift×0.7/1.3  테두리 들기 임펄스 전체(lift). 틈 구간에서는 lift/gapRef 기울기 × 0.7 / 1.3 과 같고 바닥값 임펄스도 함께 바뀐다
//   H0.08/H0.14   두께. 더미 높이가 바뀌므로 쓸기 폭은 그 더미의 꼭대기 각 +0.5°(Atop)로 맞춘다(사전 등록 8° 대신). 45장 H0.14 는 서지 않아 뺀다
//
// 변형마다 (장수, 시드) 짝:
//   (a) 시작 시각 산: 푸어억 0.6 s · 사전 등록 칸(regCell) · t0 0.05/0.15/0.25/0.35/0.45 s (게이트 ②). 두께 변형은 폭 = Atop
//   (b) 게임 문법: 꼭대기 각 +0.5° 까지 들고 0.04 s 에 끊기(gflick = sweepcheck v|Atop|rel@top) ÷ rel 고정 격자 최선(숨 0.7/0.85/0.93/1.0 × 떼기 0.3~0.8 s)
//   (b') 모델이 바뀌면 사전 등록 숨 세기가 그 모델의 맞는 세기가 아닐 수 있다 → 튕김도 숨 0.7/0.85/0.93/1.0 에서 고르고,
//        고정·튕김 둘 다 홀·짝 시드 절반에서 고른 뒤 다른 절반에서 평가(반씩 교차)
//        (b' 의 튕김 시작 시각 t0 은 사전 등록값 고정이다)
//   (b'') 선택 T0ALT=1: (a) 정점이 사전 등록 t0 보다 이른 변형(lift×0.7: 30장 0.15 s, 45장 0.25 s)에서 그 t0 로 튕김 4세기를 더 잰다(12시드 × 2장수 × 4 = 96샷)
//        반씩 교차는 (b') 와 같고 튕김 후보만 t0 2 × 세기 4 로 넓힌다
//   (c) 튕김(푸어억, 사전 등록 칸) ÷ 같은 바람 자국 경로의 높이만 b* (sweepcheck ④)
//
// 명령 (CPU 2코어. 기본 시드 701~712 = 앞선 측정과 안 겹침, 12짝 = 5,484샷 ≈ 40분.
//       16짝(701~716)이면 7,312샷 ≈ 53분이라 45분 예산에 맞춰 12짝으로 줄였다):
//   node tools/coresweep/sens.mjs run <out.jsonl> [W=2]     SEEDS=a-b · NS=30,45 · V=base,rim0 (변형 거르기). 이어 돌리기 가능
//   T0ALT=1 V=lift×0.7 node tools/coresweep/sens.mjs run <out.jsonl> 1    (b'') 96샷을 같은 파일에 이어서
//   node tools/coresweep/sens.mjs report <out.jsonl[.gz]>      레포 원자료: tools/coresweep/data/sens/out_sens.jsonl.gz
//   node tools/coresweep/sens.mjs stand                        두께별 더미가 서는지(기본 시드 701~716: 최대 기울기·중심에서 벗어난 거리)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as SW from './simsweep.js';
import { shot, poseAt, regCell, GEO, index, pairOf, pairedRatio } from '../sweepmap.mjs';

// 쉼표로 이은 파일들 → 줄(JSON). .gz 도 읽는다(레포 원자료 tools/coresweep/data/sens/out_sens.jsonl.gz)
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
const readRows = (files) => files.split(',').flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const P6 = { kind: 'pueok', D: 0.6 };
const rel = (D) => ({ kind: 'rel', D: +D.toFixed(4), off: 0.04 });
const T0S = [0.05, 0.15, 0.25, 0.35, 0.45];
const QS = [0.7, 0.85, 0.93, 1.0], HS = [0.3, 0.4, 0.5, 0.6, 0.8];

const L0 = SW.TUNE.lift, M0 = SW.TUNE.minLift;
export const VARIANTS = {
  base: { note: '기본' },
  rim0: { tune: { rimHit: 0 }, note: 'rimHit 0 (가장 가까운 테두리)' },
  'minL×0.5': { tune: { minLift: M0 * 0.5 }, note: `minLift ${(M0 * 0.5).toFixed(4)}` },
  'minL×1.5': { tune: { minLift: M0 * 1.5 }, note: `minLift ${(M0 * 1.5).toFixed(4)}` },
  // t0alt: 이 변형의 (a) 산 정점이 사전 등록 t0 보다 이르다(30장 0.15 s, 45장 0.25 s) → T0ALT=1 이면 그 시각으로 튕김(4세기)도 잰다
  'lift×0.7': { tune: { lift: L0 * 0.7 }, note: `lift ${(L0 * 0.7).toFixed(1)}`, t0alt: { 30: 0.15, 45: 0.25 } },
  'lift×1.3': { tune: { lift: L0 * 1.3 }, note: `lift ${(L0 * 1.3).toFixed(1)}` },
  'H0.08': { H: 0.08, top: true, note: '두께 0.08, 폭 = Atop' },
  'H0.14': { H: 0.14, top: true, ns: [30], note: '두께 0.14, 폭 = Atop (45장은 서지 않음)' },
};

// 목 축 기하에서 고개 α° → 앞면 바람 자국 높이(u) (sweepcheck 와 같은 식)
const hitC = (a) => { const p = poseAt(a * D2R, 'c', GEO, { x: 0, y: GEO.ym, z: GEO.L }); return p.o.y + Math.tan(p.phi) * p.o.z; };
const alphaTop = (top) => { if (top <= hitC(0)) return 0; let lo = 0, hi = 60; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (hitC(m) > top) hi = m; else lo = m; } return hi; };
// b*: 고정 입(수평 제트)을 평행 이동해 목 축 c 의 끝 각 A 와 같은 바람 자국 경로(같은 도달 시각)
const starOf = (sw) => { const As = Math.atan((hitC(sw.A) - GEO.ym) / GEO.L) / D2R; return { A: +As.toFixed(3), w: +((As * sw.w) / sw.A).toFixed(3), t0: sw.t0 }; };

const rot = (q, v) => { const { x, y, z, w } = q; const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z; return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x }; };
// 정착한 더미: 꼭대기 높이 + 서 있나(모든 장 기울기 < 20°, 중심에서 0.6 u 안, 멈춤). 바람 없는 정착이라 lift·minLift·rimHit 와 무관 → 두께만 본다
function pileInfo(n, seed, H) {
  SW.setDiscH(H);
  const t = new SW.Table(seed * 7907 + n);
  t.addPile(Array.from({ length: n }, (_, i) => i));
  t.settle(600);
  const c = t.pileCenter();
  let tilt = 0, r = 0;
  for (const d of t.liveDiscs()) { const u = rot(d.body.rotation(), { x: 0, y: 1, z: 0 }); tilt = Math.max(tilt, Math.acos(Math.min(1, Math.abs(u.y))) / D2R); const p = d.body.translation(); r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z)); }
  return { top: t.columnTop(), tilt, r, stands: tilt < 20 && r < 0.6 && t.isSettled() };
}

function makeJobs() {
  const [a, b] = (process.env.SEEDS || '701-712').split('-').map(Number);
  const NS = process.env.NS ? process.env.NS.split(',').map(Number) : [30, 45];
  const VS = process.env.V ? process.env.V.split(',') : Object.keys(VARIANTS);
  const J = [], skipped = [];
  const cache = new Map();
  const info = (n, s, H) => { const k = `${n}|${s}|${H}`; if (!cache.has(k)) cache.set(k, pileInfo(n, s, H)); return cache.get(k); };
  for (const s of R(a, b ?? a)) for (const n of NS) for (const v of VS) {
    const V = VARIANTS[v];
    if (!V) throw new Error('변형 없음: ' + v);
    if (V.ns && !V.ns.includes(n)) { if (s === a) skipped.push(`${v} ${n}장`); continue; }
    const H = V.H || 0.11;
    const pi = info(n, s, H);
    const rc = regCell(n), q = rc.q;
    const at = alphaTop(pi.top), Atop = +(at + 0.5).toFixed(3);
    const swM = { ...rc.sweep, A: V.top ? Atop : rc.sweep.A }; // (a)(c) 의 쓸기: 기하가 같은 변형은 사전 등록 8°, 두께 변형은 Atop
    const base = { n, seed: s, kin: 'c', q, ...(V.H ? { H: V.H } : {}), ...(V.tune ? { tune: V.tune } : {}), meta: { top: +pi.top.toFixed(3), stands: pi.stands, alphaTop: +at.toFixed(2), Atop, Am: swM.A } };
    const add = (key, o) => J.push({ ...base, key: `${v}|${key}`, ...o });
    for (const t0 of T0S) add(`t0|${t0}`, { breath: P6, sweep: { ...swM, t0 } }); // (a)
    if (!T0S.includes(rc.sweep.t0)) add('flick', { breath: P6, sweep: swM }); // (c) 의 튕김(30장은 t0 0.25 = 위 작업)
    add('gflick', { breath: rel(rc.sweep.t0 + Atop / rc.sweep.w + 0.04), sweep: { ...rc.sweep, A: Atop } }); // (b)
    // (b') 모델이 바뀌면 사전 등록 숨 세기(q)가 그 모델의 맞는 세기가 아닐 수 있다 → 고정 격자처럼 튕김도 같은 4세기에서 고른다(반씩 교차로 평가)
    for (const qq of QS) if (qq !== q) add(`gflick|q${qq}`, { breath: rel(rc.sweep.t0 + Atop / rc.sweep.w + 0.04), q: qq, sweep: { ...rc.sweep, A: Atop } });
    for (const qq of QS) for (const h of HS) add(`relfix|q${qq}|h${h}`, { breath: rel(h), q: qq, sweep: {} }); // (b) 기준선
    // (b'') 선택(T0ALT=1): 튕김 시작 시각을 그 변형의 (a) 정점으로 옮긴 튕김 4세기. (b') 의 t0 는 사전 등록값 고정이다
    const ta = process.env.T0ALT === '1' && V.t0alt?.[n];
    if (ta != null && ta !== false) for (const qq of QS) add(`gflickT|t${ta}|q${qq}`, { breath: rel(ta + Atop / rc.sweep.w + 0.04), q: qq, sweep: { ...rc.sweep, t0: ta, A: Atop } });
    add('kinB*', { breath: P6, kin: 'b', sweep: starOf(swM) }); // (c)
  }
  return { J, skipped, cache };
}

async function run(of, W) {
  await SW.initPhysics();
  const { J: jobs, skipped, cache } = makeJobs();
  const bad = [...cache.entries()].filter(([, p]) => !p.stands);
  if (bad.length) console.error(`서지 않은 더미(쓰는 변형만): ${bad.map(([k]) => k).join(', ')}`);
  if (skipped.length) console.error(`뺀 칸: ${skipped.join(', ')}`);
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
      const wk = new Worker(new URL(import.meta.url), { workerData: { sensWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); if (++fin % 100 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => console.error(e));
    }
  });
  console.error(`끝 ${fin}샷 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const ci = (p) => `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}]`;
const mFlip = (m) => mean([...m.values()].map((r) => r.flip));
const mOut = (m) => mean([...m.values()].map((r) => r.out));

// 반씩 교차: 홀·짝 시드 절반에서 최선 고정(과 yKeys 가 여럿이면 최선 튕김도)을 고르고 다른 절반에서 평가 → 모든 시드를 짝으로 모아 비
function crossFit(K, fixKeys, yKeys) {
  const seeds = [...K.get(yKeys[0]).keys()].sort((a, b) => a - b);
  const halves = [seeds.filter((_, i) => i % 2 === 0), seeds.filter((_, i) => i % 2 === 1)];
  if (seeds.length < 2) return { r: NaN, lo: NaN, hi: NaN }; // 시드 1개면 교차 불가
  const pick = (keys, ss) => { let best = null, bm = -1; for (const k of keys) { const m = mean(ss.map((s) => K.get(k).get(s).flip)); if (m > bm) { bm = m; best = k; } } return best; };
  const xs = [], ys = [];
  for (let h = 0; h < 2; h++) {
    const bx = pick(fixKeys, halves[h]), by = pick(yKeys, halves[h]);
    for (const s of halves[1 - h]) { xs.push(K.get(bx).get(s).flip); ys.push(K.get(by).get(s).flip); }
  }
  return pairedRatio(xs, ys);
}

function report(files) {
  const M = index(readRows(files));
  const rows = [];
  for (const n of [...M.keys()].sort((a, b) => a - b)) {
    const K = M.get(n);
    const thr = n >= 40 ? 1.05 : 1.0;
    console.log(`\n== ${n}장  사전 등록 칸 ${JSON.stringify(regCell(n))}  (b) 통과 = 하한 > ${thr}`);
    for (const v of Object.keys(VARIANTS)) {
      // 이 변형의 모든 칸에 다 있는 시드만 쓴다(돌리는 중인 파일도 짝이 맞게)
      const vk = [...K.keys()].filter((k) => k.startsWith(`${v}|`));
      if (!vk.length) continue;
      const common = [...K.get(vk[0]).keys()].filter((s) => vk.every((k) => K.get(k).has(s)));
      if (!common.length) continue;
      for (const k of vk) K.set(k, new Map(common.map((s) => [s, K.get(k).get(s)])));
      const g = (k) => K.get(`${v}|${k}`);
      if (!g('gflick')) continue;
      const N = g('gflick').size;
      const meta = [...g('gflick').values()].map((r) => r.meta);
      const ts = T0S.map((t) => mFlip(g(`t0|${t}`)));
      const mx = Math.max(...ts), ai = ts.indexOf(mx);
      const hill = ai > 0 && ai < T0S.length - 1 && ts[0] <= 0.8 * mx && ts[T0S.length - 1] <= 0.8 * mx;
      const pk = g(`t0|${T0S[ai]}`);
      const eL = pairOf(pk, g(`t0|${T0S[0]}`)), eR = pairOf(pk, g(`t0|${T0S[T0S.length - 1]}`));
      const fixKeys = [...K.keys()].filter((k) => k.startsWith(`${v}|relfix|`));
      let bf = null, bm = -1; for (const k of fixKeys) { const m = mFlip(K.get(k)); if (m > bm) { bm = m; bf = k; } }
      const pB = pairOf(K.get(bf), g('gflick')), pX = crossFit(K, fixKeys, [`${v}|gflick`]);
      // (b') 튕김 세기도 4단에서 고름: gflick(사전 등록 q) + gflick|q…
      const fqKeys = [`${v}|gflick`, ...[...K.keys()].filter((k) => k.startsWith(`${v}|gflick|q`))];
      let bq = null, bqm = -1; for (const k of fqKeys) { const m = mFlip(K.get(k)); if (m > bqm) { bqm = m; bq = k; } }
      const pQ = fqKeys.length > 1 ? pairOf(K.get(bf), K.get(bq)) : null, pQX = fqKeys.length > 1 ? crossFit(K, fixKeys, fqKeys) : null;
      const qName = (k) => (k === `${v}|gflick` ? `q${regCell(n).q}` : k.replace(`${v}|gflick|`, ''));
      const fk = g('flick') ? 'flick' : `t0|${regCell(n).sweep.t0}`;
      const pC = pairOf(g('kinB*'), g(fk));
      const passB = pB.lo > thr;
      const edge = /q1\||h0\.8$|h0\.3$/.test(bf) ? ' (격자 끝)' : '';
      console.log(`  ${v.padEnd(9)} N${N}  꼭대기 ${mean(meta.map((m) => m.top)).toFixed(2)} u · Atop ${mean(meta.map((m) => m.Atop)).toFixed(1)}° · (a)(c) 폭 ${mean(meta.map((m) => m.Am)).toFixed(1)}°${meta.some((m) => !m.stands) ? ' · 서지 않은 시드 있음' : ''}`);
      console.log(`     (a) t0 ${T0S.join('/')} = ${ts.map((x) => x.toFixed(1)).join(' / ')}  ${hill ? '산' : '산 아님'}  · 끝÷정점 ${f2(eL.r)} [${f2(eL.lo)}, ${f2(eL.hi)}] / ${f2(eR.r)} [${f2(eR.lo)}, ${f2(eR.hi)}]`);
      console.log(`     (b) gflick ${mFlip(g('gflick')).toFixed(1)}장(원 밖 ${mOut(g('gflick')).toFixed(1)}) ÷ 최선 rel 고정 ${bf.replace(`${v}|relfix|`, '')}${edge} ${bm.toFixed(1)}장(${mOut(K.get(bf)).toFixed(1)}) = ${ci(pB)} ${passB ? '통과' : '실패'} · 반씩 교차 ${ci(pX)}`);
      if (pQ) console.log(`     (b') 튕김 세기도 고름: 최선 ${qName(bq)} ${bqm.toFixed(1)}장(${mOut(K.get(bq)).toFixed(1)}) ÷ 최선 고정 = ${ci(pQ)} ${pQ.lo > thr ? '통과' : '실패'} · 반씩 교차(둘 다 고름) ${ci(pQX)} ${pQX.lo > thr ? '통과' : '실패'}  [세기별 ${fqKeys.map((k) => `${qName(k)} ${mFlip(K.get(k)).toFixed(1)}`).join(' / ')}]`);
      const tKeys = [...K.keys()].filter((k) => k.startsWith(`${v}|gflickT|`));
      if (tKeys.length) {
        const aKeys = [...fqKeys, ...tKeys];
        let ba = null, bam = -1; for (const k of aKeys) { const m = mFlip(K.get(k)); if (m > bam) { bam = m; ba = k; } }
        const pA = pairOf(K.get(bf), K.get(ba)), pAX = crossFit(K, fixKeys, aKeys);
        const tName = (k) => (k.includes('|gflickT|') ? k.replace(`${v}|gflickT|`, '').replace('|', '·') : `t${regCell(n).sweep.t0}·${qName(k)}`);
        console.log(`     (b'') 튕김 시작 시각도 (a) 정점으로(T0ALT): 최선 ${tName(ba)} ${bam.toFixed(1)}장(${mOut(K.get(ba)).toFixed(1)}) ÷ 최선 고정 = ${ci(pA)} · 반씩 교차(t0 2 × 세기 4 와 고정 격자를 다 고름) ${ci(pAX)} ${pAX.lo > thr ? '통과' : '실패'}  [${tKeys.map((k) => `${tName(k)} ${mFlip(K.get(k)).toFixed(1)}`).join(' / ')}]`);
      }
      console.log(`     (c) 튕김 ÷ 높이만 b* = ${ci(pC)}  (튕김 ${mFlip(g(fk)).toFixed(1)} vs b* ${mFlip(g('kinB*')).toFixed(1)})`);
      rows.push({ n, v, N, ts, hill, pB, pX, pC, pQ, pQX, bq: bq && qName(bq), bqm, thr, bf: bf.replace(`${v}|relfix|`, ''), bm, gf: mFlip(g('gflick')), passB });
    }
  }
  // 문서용 표
  console.log('\n| 변형 | 장수 | (a) 시작 0.05 / 0.15 / 0.25 / 0.35 / 0.45초 | (b) 사전 등록 세기 튕김 ÷ 게임 문법 최선 고정 | (b\') 튕김 세기도 고름, 반씩 교차 | (c) 튕김 ÷ 높이만 b* |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.v} | ${r.n} | ${r.ts.map((x) => x.toFixed(1)).join(' / ')} ${r.hill ? '산' : '**산 아님**'} | ${r.gf.toFixed(1)} ÷ ${r.bm.toFixed(1)}(${r.bf.replace('|', '·')}) = ${ci(r.pB)} ${r.passB ? '통과' : '**실패**'} | ${r.pQX ? `${r.bq}: ${ci(r.pQX)} ${r.pQX.lo > r.thr ? '통과' : '**실패**'}` : '-'} | ${ci(r.pC)} |`);
}

function stand() {
  for (const H of [0.08, 0.11, 0.14]) for (const n of [30, 45]) {
    const [a, b] = (process.env.SEEDS || '701-716').split('-').map(Number);
    const L = R(a, b ?? a).map((s) => pileInfo(n, s, H));
    console.log(`두께 ${H} ${n}장: 서 있음 ${L.filter((p) => p.stands).length}/${L.length} · 꼭대기 ${mean(L.map((p) => p.top)).toFixed(2)} u · 최대 기울기 ${Math.max(...L.map((p) => p.tilt)).toFixed(1)}° · 중심 밖 최대 ${Math.max(...L.map((p) => p.r)).toFixed(2)} u`);
  }
}

if (!isMainThread && workerData?.sensWorker) {
  await SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage({ ...shot(job), key: job.key, meta: job.meta }); });
  parentPort.postMessage({ ready: true });
} else if (isMainThread) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'run') { await run(a[0] || 'out_sens.jsonl', +(a[1] || 2)); report(a[0] || 'out_sens.jsonl'); }
  else if (cmd === 'report') report(a[0]);
  else if (cmd === 'stand') { await SW.initPhysics(); stand(); }
  else if (cmd === 'list') { await SW.initPhysics(); const { J, skipped } = makeJobs(); const c = {}; for (const j of J) { const k = `${j.n}|${j.key.split('|')[0]}`; c[k] = (c[k] || 0) + 1; } console.log(`${J.length}샷`, c, skipped); }
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}

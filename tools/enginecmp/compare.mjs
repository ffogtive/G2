// compare.mjs — Rapier ↔ Jolt 비교 실행기 (시나리오 A·B·C·D). 무거운 프로세스 1개로 돈다(nice 권장).
//
//   node compare.mjs anchor [n=10,20,30,40] [seeds=1-4]       B 의 바람 이식(wind.mjs)이 sim.js 와 Rapier v1 위에서 비트 동일한가
//   node compare.mjs stack <tag> <cfgs.json|name,...> [--seeds 1-3] [--hs 0.11,0.055,0.04] [--ns 1,5,10,20,30,45] [--steps 600]
//   node compare.mjs shot  <tag> <cfgs>  [--seeds 1-12] [--hs 0.11,0.055] [--ns 10,20,30,40] [--post 720] [--props '{"restitution":0.2}']
//   node compare.mjs simshot <tag> [--seeds 1-12] [--ns 10,20,30,40]   진짜 sim.js(Rapier v1, 두께 0.11) 로 같은 샷 — 기준점
//   node compare.mjs det   [--flavour cpd]                      같은 입력 두 번 → 같은 해시(같은 프로세스·새 월드) + 체크포인트 해시 출력
//   node compare.mjs speed <cfgs> [--n 45] [--reps 3]           45장 ms/스텝 (가라앉힘 360 + 샷 360)
//   node compare.mjs report <tag> [kind]                        data/cmp-<tag>.json.gz → 표
//
// cfgs: 이름 목록(아래 CONFIGS) 또는 JSON 파일. Jolt 빌드는 JOLT_FLAVOUR(기본 cpd = 웹↔앱 PvP 에 쓸 빌드).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { cpus, loadavg } from 'node:os';
import { createWorld } from './adapters/index.mjs';
import { GAME, Hasher, rotate } from './adapters/common.mjs';
import { GameTable, standardShot } from './adapters/wind.mjs';

process.env.JOLT_FLAVOUR ??= 'cpd';
const HERE = new URL('.', import.meta.url).pathname;
const DATA = HERE + 'data/';
mkdirSync(DATA, { recursive: true });

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const range = (s) => s.split(',').flatMap((p) => { const m = p.match(/^(\d+)-(\d+)$/); if (!m) return [+p]; const r = []; for (let i = +m[1]; i <= +m[2]; i++) r.push(i); return r; });

// ── 설정 이름표 (A 훑기 + B·C·D 에 쓰는 것) ─────────────────────────────────────────────
const R = (erp, sub, it = 8, extra = {}) => ({ engine: 'rapier', erp, substeps: sub, iterations: it, ...extra });
const J = (bg, sub, vs = 10, ps = 4, extra = {}) => ({ engine: 'jolt', substeps: sub, joltPreset: 'fair', jolt: { baumgarte: bg, velocitySteps: vs, positionSteps: ps, ...(extra.jolt ?? {}) }, ...(extra.sleep ? { sleep: extra.sleep } : {}) });
export const CONFIGS = {
  // Rapier 0.12 JS (게임 웹 물리). erp × 하위 스텝(1 = 1/120, 2 = 1/240, 4 = 1/480) × 반복
  'R-e0.2-1x': R(0.2, 1),               // = rapier-v1 (지금 게임)
  'R-e0.2-2x': R(0.2, 2),
  'R-e0.4-1x': R(0.4, 1),
  'R-e0.4-2x': R(0.4, 2),
  'R-e0.8-1x': R(0.8, 1),
  'R-e0.8-2x': R(0.8, 2),               // = rapier-thin (core-sweep §7)
  'R-e0.8-4x': R(0.8, 4),
  'R-e0.2-1x-i16': R(0.2, 1, 16),
  'R-e0.8-1x-i16': R(0.8, 1, 16),
  'R-e0.8-2x-i16': R(0.8, 2, 16),
  'R-e0.8-2x-i4': R(0.8, 2, 4),
  'R-e1.0-2x': R(1.0, 2),
  'R-e0.8-2x-pgs2': R(0.8, 2, 8, { rapier: { numInternalPgsIterations: 2 } }),
  // Jolt 5.6 (CPD WASM). baumgarte × 하위 스텝 × 속도·위치 반복. 길이 허용치·볼록 반경 = jolt-fair(기본 길이 허용치, 볼록 반경 반두께·0.5)
  'J-b0.2-1x': J(0.2, 1),
  'J-b0.4-1x': J(0.4, 1),               // = jolt-1x
  'J-b0.8-1x': J(0.8, 1),
  'J-b0.2-2x': J(0.2, 2),
  'J-b0.4-2x': J(0.4, 2),
  'J-b0.8-2x': J(0.8, 2),
  'J-b0.2-4x': J(0.2, 4),
  'J-b0.4-4x': J(0.4, 4),               // = jolt-fair
  'J-b0.8-4x': J(0.8, 4),
  'J-b0.4-4x-p2': J(0.4, 4, 10, 2),
  'J-b0.4-4x-v20': J(0.4, 4, 20, 4),
  'J-b0.4-8x': J(0.4, 8),
  'J-b0.4-2x-p8': J(0.4, 2, 10, 8),
  'J-b0.4-1x-v20p8': J(0.4, 1, 20, 8),
  // 잠 문턱 변형 (B 용)
  'J-b0.4-4x-rsleep': J(0.4, 4, 10, 4, { sleep: { pointVelocity: 0.4, time: 2.0 } }),
  'J-b0.4-2x-rsleep': J(0.4, 2, 10, 4, { sleep: { pointVelocity: 0.4, time: 2.0 } }),
  // A 1등(v20) 변형: 볼록 반경(테두리 둥글림) h/2·0.1 — 쏜 뒤 기울어 기댄 딱지가 둥근 테두리 위에서 흔들의자처럼 구르는 것(진단 diag.mjs) 줄이기
  'J-b0.4-4x-v20-cr0.1': J(0.4, 4, 20, 4, { jolt: { convexRadiusFrac: 0.1 } }),
  'J-b0.4-4x-v20-rsleep': J(0.4, 4, 20, 4, { sleep: { pointVelocity: 0.4, time: 2.0 } }),
  'J-b0.4-4x-v20-cr0.1-rsleep': J(0.4, 4, 20, 4, { jolt: { convexRadiusFrac: 0.1 }, sleep: { pointVelocity: 0.4, time: 2.0 } }),
  'J-b0.4-4x-cr0.1': J(0.4, 4, 10, 4, { jolt: { convexRadiusFrac: 0.1 } }),
  // 두께 0.11 쏜 뒤 기어감 탐색
  'J-b0.2-4x-v20': J(0.2, 4, 20, 4),
  'J-b0.4-4x-v20-p8': J(0.4, 4, 20, 8),
  'J-b0.4-8x-v20': J(0.4, 8, 20, 4),
};
function loadCfgs(spec) {
  if (spec.endsWith('.json')) return JSON.parse(readFileSync(spec, 'utf8'));
  return spec.split(',').map((name) => { const c = CONFIGS[name]; if (!c) throw new Error('모르는 설정 ' + name); return { name, cfg: c }; });
}

const saveGz = (file, obj) => writeFileSync(file, gzipSync(JSON.stringify(obj)));
const loadGz = (file) => JSON.parse(gunzipSync(readFileSync(file)).toString());
const meta = () => ({ date: new Date().toISOString(), node: process.version, load: loadavg().map((x) => +x.toFixed(2)), cpus: cpus().length, jolt: process.env.JOLT_FLAVOUR });

function hashTable(bodies) { // sim.js Table 용 (어댑터 hashState 와 같은 식)
  const H = new Hasher();
  for (const b of bodies) {
    const t = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
    for (const x of [t.x, t.y, t.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z]) H.f32(x);
  }
  return H.hex();
}
const deg = (r) => (r * 180) / Math.PI;
const poses = (w, n) => { const a = []; for (let i = 0; i < n; i++) a.push(w.getPose(i)); return a; };
const maxDisp = (A, B, skip) => { let m = 0; for (let i = 0; i < A.length; i++) { if (skip?.has(i)) continue; m = Math.max(m, Math.hypot(A[i].p.x - B[i].p.x, A[i].p.y - B[i].p.y, A[i].p.z - B[i].p.z)); } return m; };

// ═══ anchor: 이식(wind.mjs + rapier-v1 어댑터) ≡ sim.js ═══════════════════════════════════
async function simTable(seed, n) {
  const sim = await import('../../mockup/src/sim.js');
  await sim.initPhysics();
  const t = new sim.Table(seed);
  t.addPile(Array.from({ length: n }, (_, i) => i));
  return { sim, t };
}
function simShotOn(t) { // standardShot 과 같은 규칙을 sim.js Table 에
  const c = t.pileCenter();
  const ys = t.liveDiscs().filter((d) => !d.off).map((d) => d.body.translation().y).sort((a, b) => b - a);
  return { aim: { x: c.x - 1, y: ys[2], z: c.z }, dir: { x: 1, z: 0 }, power: 0.95, blast: 0 };
}
async function runSimTrial(seed, n, post = 720) {
  const { sim, t } = await simTable(seed, n);
  const r = { engine: 'sim.js', n, h: 0.11, seed };
  r.settleSteps = t.settle();
  r.settleHash = hashTable(t.discs.map((d) => d.body));
  let top = 0; for (const d of t.discs) top = Math.max(top, d.body.translation().y + 0.055);
  r.heightRatio = +(top / (n * 0.11)).toFixed(4);
  t.blow(simShotOn(t));
  const j = { n: 0, quiet: 0 };
  let judged = null;
  const P = () => t.discs.map((d) => ({ p: d.body.translation() }));
  let P3 = null, Pj = null;
  const speeds = [];
  for (let k = 1; k <= post; k++) {
    t.step();
    if (!judged && t.stepJudge(j)) { judged = k; const jr = t.judgeResult(); r.judge = { steps: k, flipped: jr.flipped.length, outs: jr.outs.length, hash: hashTable(t.discs.map((d) => d.body)) }; Pj = P(); }
    speeds.push(t.maxSpeed());
    if (k === 360) P3 = P();
  }
  const jr = t.judgeResult();
  r.end = { flipped: jr.flipped.length, outs: jr.outs.length, hash: hashTable(t.discs.map((d) => d.body)) };
  const Pe = P();
  const off = new Set(t.discs.filter((d) => d.off).map((d) => d.id));
  const mdisp = (A, B) => { let m = 0; for (let i = 0; i < A.length; i++) { if (off.has(i)) continue; m = Math.max(m, Math.hypot(A[i].p.x - B[i].p.x, A[i].p.y - B[i].p.y, A[i].p.z - B[i].p.z)); } return m; };
  Object.assign(r, restStats(speeds), { drift3to6: +mdisp(P3, Pe).toFixed(4), driftAfterJudge: Pj ? +mdisp(Pj, Pe).toFixed(4) : null, sleeping: t.discs.filter((d) => d.body.isSleeping()).length });
  t.world.free();
  return r;
}

function restStats(speeds) {
  const last = (thr) => { for (let i = speeds.length - 1; i >= 0; i--) if (speeds[i] >= thr) return i + 1 < speeds.length ? i + 1 : null; return 0; };
  return { rest02: last(0.02), rest08: last(0.08), v3s: +speeds[359]?.toFixed(4), v5s: +speeds[599]?.toFixed(4), v6s: +speeds[speeds.length - 1].toFixed(4) };
}

// 어댑터 위 한 판(게임 절차): 쌓기 → sim.js settle → 표준 초록 숨 → stepJudge → 6 s 까지 더 돌려 멈춤·기어감 측정
async function runShotTrial(cfg, { n, h, seed, post = 720, props = {}, keepSpeeds = false }) {
  const w = await createWorld(cfg);
  const t = new GameTable(w, { n, seed, h, props });
  const r = { n, h, seed };
  const t0 = performance.now();
  r.settleSteps = t.settle();
  const tS = performance.now() - t0;
  r.settleHash = w.hashState();
  r.heightRatio = +(t.top() / (n * h)).toFixed(4);
  r.settleSpeed = +t.maxSpeed().toFixed(4);
  t.blow(standardShot(t));
  const j = { n: 0, quiet: 0, strict: 0 };
  let P3 = null, Pj = null;
  const speeds = [];
  const t1 = performance.now();
  for (let k = 1; k <= post; k++) {
    t.step();
    if (!r.judge && t.stepJudge(j)) {
      const jr = t.judgeResult();
      r.judge = { steps: k, kind: k >= 600 ? 'cap' : j.strict > 24 ? 'quiet' : 'late', flipped: jr.flipped, outs: jr.outs, hash: w.hashState() };
      Pj = poses(w, n);
    }
    speeds.push(t.maxSpeed());
    if (k === 360) P3 = poses(w, n);
  }
  const tP = performance.now() - t1;
  const jr = t.judgeResult();
  const Pe = poses(w, n);
  r.end = { flipped: jr.flipped, outs: jr.outs, hash: w.hashState() };
  Object.assign(r, restStats(speeds), {
    drift3to6: +maxDisp(P3, Pe, t.off).toFixed(4), driftAfterJudge: Pj ? +maxDisp(Pj, Pe, t.off).toFixed(4) : null,
    sleeping: w.sleepingCount(), offDesk: t.off.size,
    msSettle: +(tS / Math.max(1, r.settleSteps + 1)).toFixed(3), msPost: +(tP / post).toFixed(3),
  });
  if (keepSpeeds) r.speeds = speeds.map((x) => +x.toFixed(4));
  w.destroy();
  return r;
}

// 쌓기·가라앉힘(A): 바람 없음. steps 동안 돌리고 쉼·높이·떨림·잠
async function runStackTrial(cfg, { n, h, seed, steps = 600 }) {
  const w = await createWorld(cfg);
  const t = new GameTable(w, { n, seed, h });
  const speeds = [];
  const win = steps - 120; // 마지막 1초 = 떨림 창
  let Pw = null, winMax = 0;
  const t0 = performance.now();
  for (let k = 1; k <= steps; k++) {
    t.step();
    const ms = t.maxSpeed();
    speeds.push(ms);
    if (k === win) Pw = poses(w, n);
    if (k > win) winMax = Math.max(winMax, ms);
  }
  const msStep = (performance.now() - t0) / steps;
  const Pe = poses(w, n);
  // 높이·눌림·기울기·흩어짐
  let top = 0, bottom = Infinity, cx = 0, cz = 0, maxTilt = 0;
  for (const { p, q } of Pe) {
    top = Math.max(top, p.y + h / 2); bottom = Math.min(bottom, p.y); cx += p.x / n; cz += p.z / n;
    const up = rotate(q, { x: 0, y: 1, z: 0 });
    maxTilt = Math.max(maxTilt, deg(Math.acos(Math.min(1, Math.abs(up.y)))));
  }
  let maxOff = 0; for (const { p } of Pe) maxOff = Math.max(maxOff, Math.hypot(p.x - cx, p.z - cz));
  // 쉼 시각: 그 뒤로 끝까지 문턱 아래인 첫 스텝
  const restAt = (thr) => { for (let i = speeds.length - 1; i >= 0; i--) if (speeds[i] >= thr) return i + 1 < speeds.length ? i + 1 : null; return 0; };
  // 이웃 간격(아래→위 정렬 후 중심 y 차) 평균 = 실제 한 장 두께 몫
  const ys = Pe.map((x) => x.p.y).sort((a, b) => a - b);
  let gapSum = 0; for (let i = 1; i < ys.length; i++) gapSum += ys[i] - ys[i - 1];
  const r = {
    n, h, seed,
    heightRatio: +(top / (n * h)).toFixed(4), // 1 = 명목 그대로, 0.37 = 63% 눌림
    spacing: n > 1 ? +(gapSum / (n - 1)).toFixed(5) : null,
    floorPen: +(h / 2 - bottom).toFixed(5), // 맨 아래 장이 책상에 묻힌 깊이
    rest02: restAt(0.02), rest06: restAt(0.06),
    jitterMax: +winMax.toFixed(5), // 마지막 1초 최대 속도
    jitterDrift: +maxDisp(Pw, Pe).toFixed(5), // 마지막 1초 최대 이동
    endSpeed: +speeds[speeds.length - 1].toFixed(5),
    sleeping: w.sleepingCount(),
    maxTilt: +maxTilt.toFixed(2), maxOff: +maxOff.toFixed(3),
    msStep: +msStep.toFixed(4), hash: w.hashState(),
  };
  w.destroy();
  return r;
}

// ═══ 하위 명령 ═══════════════════════════════════════════════════════════════════════════
const cmd = argv[0];
if (cmd === 'anchor') {
  const ns = range(argv[1] ?? '10,20,30,40'), seeds = range(argv[2] ?? '1-4');
  let same = 0, tot = 0;
  for (const n of ns) for (const seed of seeds) {
    const a = await runSimTrial(seed, n);
    const b = await runShotTrial({ preset: 'rapier-v1' }, { n, h: 0.11, seed });
    const eq = a.settleSteps === b.settleSteps && a.settleHash === b.settleHash && a.judge?.hash === b.judge?.hash && a.end.hash === b.end.hash;
    tot++; if (eq) same++;
    console.log(`n=${n} seed=${seed} sim: settle ${a.settleSteps} ${a.settleHash} judge ${a.judge?.steps} ${a.judge?.flipped}/${a.judge?.outs} ${a.judge?.hash} end ${a.end.hash} | port: settle ${b.settleSteps} ${b.settleHash} judge ${b.judge?.steps} ${b.judge?.flipped}/${b.judge?.outs} ${b.judge?.hash} end ${b.end.hash} → ${eq ? '같음' : '다름'}`);
  }
  console.log(`anchor: ${same}/${tot} 비트 동일`);
  saveGz(DATA + 'cmp-anchor.json.gz', { meta: meta(), same, tot });
} else if (cmd === 'stack') {
  const tag = argv[1], cfgs = loadCfgs(argv[2]);
  const seeds = range(opt('seeds', '1-3')), hs = opt('hs', '0.11,0.055,0.04').split(',').map(Number), ns = range(opt('ns', '1,5,10,20,30,45'));
  const steps = +opt('steps', 600);
  const file = DATA + `cmp-${tag}.json.gz`;
  const out = existsSync(file) ? loadGz(file) : { meta: meta(), kind: 'stack', rows: [] };
  for (const { name, cfg } of cfgs) {
    if (out.rows.some((r) => r.name === name)) { console.log('있음:', name); continue; }
    const t0 = Date.now();
    const trials = [];
    for (const h of hs) for (const n of ns) for (const seed of seeds) trials.push(await runStackTrial(cfg, { n, h, seed, steps }));
    out.rows.push({ name, cfg, trials, sec: (Date.now() - t0) / 1000, load: loadavg()[0] });
    saveGz(file, out);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    printStack([out.rows.at(-1)]);
  }
} else if (cmd === 'shot') {
  const tag = argv[1], cfgs = loadCfgs(argv[2]);
  const seeds = range(opt('seeds', '1-12')), hs = opt('hs', '0.11,0.055').split(',').map(Number), ns = range(opt('ns', '10,20,30,40'));
  const post = +opt('post', 720), props = JSON.parse(opt('props', '{}'));
  const file = DATA + `cmp-${tag}.json.gz`;
  const out = existsSync(file) ? loadGz(file) : { meta: meta(), kind: 'shot', props, rows: [] };
  for (const { name, cfg } of cfgs) {
    if (out.rows.some((r) => r.name === name)) { console.log('있음:', name); continue; }
    const t0 = Date.now();
    const trials = [];
    for (const h of hs) for (const n of ns) for (const seed of seeds) trials.push(await runShotTrial(cfg, { n, h, seed, post, props }));
    out.rows.push({ name, cfg, trials, sec: (Date.now() - t0) / 1000, load: loadavg()[0] });
    saveGz(file, out);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    printShot([out.rows.at(-1)]);
  }
} else if (cmd === 'simshot') {
  const tag = argv[1];
  const seeds = range(opt('seeds', '1-12')), ns = range(opt('ns', '10,20,30,40'));
  const trials = [];
  for (const n of ns) for (const seed of seeds) trials.push(await runSimTrial(seed, n));
  const out = { meta: meta(), kind: 'shot', rows: [{ name: 'sim.js(Rapier v1)', trials: trials.map((t) => ({ ...t, judge: { ...t.judge, kind: t.judge.steps >= 600 ? 'cap' : '?' } })) }] };
  saveGz(DATA + `cmp-${tag}.json.gz`, out);
  printShot(out.rows);
} else if (cmd === 'det') {
  // 같은 입력 두 번(새 월드) → 같은 해시. 각 설정 × (n 30, h 0.055, 시드 1) + (n 40, h 0.11, 시드 2) — 바람 이식 샷 포함
  const names = (opt('cfgs', 'R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-2x')).split(',');
  const res = [];
  for (const name of names) for (const [n, h, seed] of [[30, 0.055, 1], [40, 0.11, 2]]) {
    const a = await runShotTrial(CONFIGS[name], { n, h, seed });
    const b = await runShotTrial(CONFIGS[name], { n, h, seed });
    const row = { name, n, h, seed, settle: [a.settleHash, b.settleHash], judge: [a.judge.hash, b.judge.hash], end: [a.end.hash, b.end.hash], same: a.settleHash === b.settleHash && a.judge.hash === b.judge.hash && a.end.hash === b.end.hash, flips: [a.judge.flipped, b.judge.flipped] };
    res.push(row);
    console.log(JSON.stringify(row));
  }
  const tag = opt('tag', 'det-' + process.env.JOLT_FLAVOUR);
  saveGz(DATA + `cmp-${tag}.json.gz`, { meta: meta(), res });
} else if (cmd === 'speed') {
  const cfgs = loadCfgs(argv[1]);
  const n = +opt('n', 45), reps = +opt('reps', 3), hs = opt('hs', '0.11,0.055').split(',').map(Number);
  const res = [];
  for (const { name, cfg } of cfgs) for (const h of hs) {
    const runs = [];
    for (let r = 0; r < reps; r++) {
      const w = await createWorld(cfg);
      const t = new GameTable(w, { n, seed: 1, h });
      let t0 = performance.now();
      for (let k = 0; k < 360; k++) t.step();
      const a = (performance.now() - t0) / 360;
      t.blow(standardShot(t));
      t0 = performance.now();
      for (let k = 0; k < 360; k++) t.step();
      const b = (performance.now() - t0) / 360;
      runs.push({ settle: a, shot: b, load: loadavg()[0] });
      w.destroy();
    }
    const best = (k) => Math.min(...runs.map((x) => x[k]));
    const row = { name, h, n, settleMs: +best('settle').toFixed(3), shotMs: +best('shot').toFixed(3), runs, substeps: cfg.substeps };
    res.push(row);
    console.log(`${name} h=${h}: 가라앉힘 ${row.settleMs} ms · 샷 ${row.shotMs} ms (최소 of ${reps}, load ${runs.map((x) => x.load.toFixed(1)).join('/')})`);
  }
  saveGz(DATA + `cmp-speed-${opt('tag', process.env.JOLT_FLAVOUR)}.json.gz`, { meta: meta(), res });
} else if (cmd === 'report') {
  const d = loadGz(DATA + `cmp-${argv[1]}.json.gz`);
  if (d.kind === 'stack') printStack(d.rows, argv.includes('--detail')); else printShot(d.rows, argv.includes('--detail'));
} else {
  console.log('사용: node compare.mjs anchor|stack|shot|simshot|det|speed|report …');
}

// ═══ 표 ═══════════════════════════════════════════════════════════════════════════════════
function med(a) { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }
function mean(a) { const s = a.filter((x) => x != null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; }
function f(x, d = 2) { return x == null || Number.isNaN(+x) ? '—' : (+x).toFixed(d); }
function printStack(rows, detail = false) {
  for (const row of rows) {
    const byH = new Map();
    for (const t of row.trials) { if (!byH.has(t.h)) byH.set(t.h, []); byH.get(t.h).push(t); }
    for (const [h, ts] of byH) {
      const big = ts.filter((t) => t.n >= 20);
      const restOk = ts.filter((t) => t.rest02 != null).length;
      console.log(`| ${row.name} | ${h} | 높이/명목 최소 ${f(Math.min(...big.map((t) => t.heightRatio)), 3)} (20장↑ 평균 ${f(mean(big.map((t) => t.heightRatio)), 3)}) | 바닥 묻힘 최대 ${f(Math.max(...ts.map((t) => t.floorPen)), 4)} | 쉼(<0.02) ${restOk}/${ts.length} · 중앙 ${f(med(ts.map((t) => t.rest02)) / 120, 2)} s · 최대 ${restOk === ts.length ? f(Math.max(...ts.map((t) => t.rest02)) / 120, 2) : '>5'} s | 끝 1초 최대 속도 중앙 ${f(med(ts.map((t) => t.jitterMax)), 4)} 최대 ${f(Math.max(...ts.map((t) => t.jitterMax)), 4)} · 이동 최대 ${f(Math.max(...ts.map((t) => t.jitterDrift)), 4)} | 잠 ${ts.reduce((s, t) => s + t.sleeping, 0)}/${ts.reduce((s, t) => s + t.n, 0)} | 기울기 최대 ${f(Math.max(...ts.map((t) => t.maxTilt)), 1)}° · 흩어짐 ${f(Math.max(...ts.map((t) => t.maxOff)), 2)} | ms/스텝 45장 ${f(mean(ts.filter((t) => t.n === 45).map((t) => t.msStep)), 2)} |`);
      if (detail) for (const n of [...new Set(ts.map((t) => t.n))]) {
        const g = ts.filter((t) => t.n === n);
        console.log(`    n=${n}: 높이 ${g.map((t) => t.heightRatio).join('/')} 쉼 ${g.map((t) => t.rest02).join('/')} 떨림 ${g.map((t) => t.jitterMax).join('/')} 잠 ${g.map((t) => t.sleeping).join('/')}`);
      }
    }
  }
}
function printShot(rows, detail = false) {
  for (const row of rows) {
    const byH = new Map();
    for (const t of row.trials) { if (!byH.has(t.h)) byH.set(t.h, []); byH.get(t.h).push(t); }
    for (const [h, ts] of byH) {
      const kinds = { quiet: 0, late: 0, cap: 0, '?': 0 };
      for (const t of ts) kinds[t.judge?.kind ?? '?']++;
      const rested = ts.filter((t) => t.rest02 != null);
      const r08 = ts.filter((t) => t.rest08 != null && t.rest08 <= 600);
      const changed = ts.filter((t) => t.judge && (t.judge.flipped !== t.end.flipped || t.judge.outs !== t.end.outs)).length;
      console.log(`| ${row.name} | ${h} | 판정 멈춤/느슨/상한 ${kinds.quiet}/${kinds.late}/${kinds.cap} · 판정 중앙 ${f(med(ts.map((t) => t.judge?.steps)) / 120, 2)} s | 5 s 안 완전 멈춤(<0.08) ${r08.length}/${ts.length} · (<0.02, 6 s 안) ${rested.length}/${ts.length} 중앙 ${f(med(rested.map((t) => t.rest02)) / 120, 2)} s | 5 s 속도 중앙 ${f(med(ts.map((t) => t.v5s)), 3)} 최대 ${f(Math.max(...ts.map((t) => t.v5s)), 3)} | 3→6 s 이동 중앙 ${f(med(ts.map((t) => t.drift3to6)), 3)} 최대 ${f(Math.max(...ts.map((t) => t.drift3to6)), 3)} · 판정 뒤 결과 바뀜 ${changed} | 뒤집힘 평균 ${f(mean(ts.map((t) => t.judge?.flipped)), 1)} · 원 밖 평균 ${f(mean(ts.map((t) => t.judge?.outs)), 1)} | 높이/명목 ${f(mean(ts.map((t) => t.heightRatio)), 2)} | 잠 ${ts.reduce((s, t) => s + (t.sleeping ?? 0), 0)}/${ts.reduce((s, t) => s + t.n, 0)} | ms/스텝 샷 ${f(mean(ts.map((t) => t.msPost)), 2)} |`);
      if (detail) for (const n of [...new Set(ts.map((t) => t.n))]) {
        const g = ts.filter((t) => t.n === n);
        console.log(`    n=${n}: 뒤집힘 ${g.map((t) => t.judge?.flipped).join(',')} | 원 밖 ${g.map((t) => t.judge?.outs).join(',')} | 판정 ${g.map((t) => t.judge?.steps).join(',')} | 멈춤(<0.02) ${g.map((t) => t.rest02 ?? 'x').join(',')}`);
      }
    }
  }
}

// mouthmap.mjs — 9차 '입술 높이'(blow({ mouthY })) 지도: 장수 × 노리는 층 × 입 높이 × 숨 → 뒤집힌 장수·0장 비율·원 밖·솟은 높이 + 설계 목표 G1~G6 판정
// (재윤님: '밑에서 입을 퍼올려서 넘기면 잘 넘어가거든 포물선으로' → '입술의 y축 위치는 컨트롤 못하나?')
//
// 사용: node tools/mouthmap.mjs [시드=16] [장수들=1,2,3,4,6,8,10,12,14,16,20]
//   env LAYERS='top,2,3,4,mid,low3,bottom'   노리는 층: 위에서 k장째 / mid = 가운데 / low3 = 아래 1/3 / bottom = 맨 아래 (가라앉은 실제 y)
//       MOUTHS='0.15,0.35,0.6,follow,top+0.5,top+1.2'  입 높이(절대 y). follow = 지금 게임(입이 조준점 0.26 위, mouthY 안 넘김)
//                                                      top+k = 가라앉은 더미 꼭대기 + k. fol9 = 9차 경로로 follow 와 같은 기울기(검산용)
//       RATIOS='0.7,0.9,1.1'           정답 숨 대비 비율 → rules.js resolveShot/physSweetFor (게임과 같음. 넘치면 조준 높이·좌우도 흔들림, 입 높이는 그대로)
//       DIRS='-z,+z'                   부는 방향(같은 더미를 앞·뒤에서 = 거울 짝)
//       SUB_LATS='0.4,-0.4' SUB_LAYERS='3,mid,low3' SUB_MOUTHS='0.15,0.35,follow' SUB_RATIOS='0.9,1.1'  좌우 부분 지도(빈 값이면 끔)
//       DIST=1                         G6: 장수별 '수평 최고 칸'·'입 높이 최고 칸'을 숨 비율 격자로 더 재서 숨 분포 N(0.89, 0.07)·N(0.89, 0.14) 기대값
//       TUNE_JSON='{"lipGap":0.3}'     sim TUNE 덮어쓰기
//       LEVEL_CACHE=file.json          follow 칸 캐시(follow 는 lip* 손잡이와 무관 — lip* 만 바꿀 땐 그대로 재사용)
//       HOLDOUT=1                      G2 를 선택 편향 없이: 시드 1..S 로 고른 장수별 최고 칸(수평·입 높이, 숨 0.9/1.1)을 시드 S+1..2S 로 다시 재서 판정
//       WORKERS=4  JSON=out.json  QUIET=1
// 지표: flip = 원 안에서 뒤집힌 장수 평균(시드 × 방향), zero = 0장 샷 비율, out = 분필 원 밖 장수, apex = 뒤집힌 딱지가 시작보다 가장 높이 솟은 높이 평균(R)
// 기하(main.js shotGeometry 와 같음): 조준점 = c − D·√(1−lat²) + side·lat (높이 = 그 층의 가라앉은 y). 진짜 입 = 조준점 − D·2.6(수평), 높이 mouthY(≥ 0.15)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const DIRV = { '-z': { x: 0, z: -1 }, '+z': { x: 0, z: 1 }, '+x': { x: 1, z: 0 }, '-x': { x: -1, z: 0 } };
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function layerIndex(L, n) {
  if (L === 'top') return 0;
  if (L === 'mid') return Math.floor((n - 1) / 2);
  if (L === 'low3') return Math.round(((n - 1) * 2) / 3);
  if (L === 'bottom') return n - 1;
  return Math.min(n - 1, Math.max(0, +L - 1)); // 숫자 = 위에서 k장째
}

if (!isMainThread) {
  const { initPhysics, Table } = await import('../mockup/src/sim.js');
  const { sweetHiFor, resolveShot } = await import('../mockup/src/rules.js');
  await initPhysics();
  const OV = workerData.tune || {};
  function shot(job, seed, dk) {
    const { n, layer, mouth, ratio, lat } = job;
    seed += job.seedOff || 0; // HOLDOUT: 고른 칸을 새 시드로 다시 잼
    const t = new Table(seed * 7907 + n, OV);
    t.addPile(Array.from({ length: n }, (_, i) => i));
    t.settle();
    const c = t.pileCenter();
    const D = DIRV[dk];
    const side = { x: -D.z, z: D.x };
    const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a);
    const top = t.columnTop();
    const sh = resolveShot({ lat, h: ys[layerIndex(layer, n)], power: sweetHiFor(n) * ratio }, n, top, mul(seed * 31 + n), 1);
    const back = Math.sqrt(1 - sh.lat * sh.lat);
    const args = { aim: { x: c.x - D.x * back + side.x * sh.lat, y: sh.h, z: c.z - D.z * back + side.z * sh.lat }, dir: D, power: sh.power, blast: sh.blast || 0 };
    if (mouth === 'fol9') args.mouthY = sh.h + t.T.lipBack * Math.tan(t.T.pitch0);
    else if (mouth.startsWith('top+')) args.mouthY = top + +mouth.slice(4);
    else if (mouth !== 'follow') args.mouthY = +mouth;
    const y0 = new Map(), maxY = new Map();
    for (const d of t.liveDiscs()) { const y = d.body.translation().y; y0.set(d.id, y); maxY.set(d.id, y); }
    const g = t.blow(args);
    const steps = Math.ceil(4 / t.T.dt); // runUntilSettled(4) 와 같은 루프 + 솟은 높이 기록
    for (let i = 0; i < steps; i++) {
      t.step();
      for (const d of t.liveDiscs()) { if (d.off) continue; const y = d.body.translation().y; if (y > maxY.get(d.id)) maxY.set(d.id, y); }
      if (!t.puff && i > 30 && t.isSettled()) break;
    }
    const flipped = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d));
    return { flip: flipped.length, out: t.liveDiscs().filter((d) => !t.inCircle(d)).length, apex: flipped.map((d) => maxY.get(d.id) - y0.get(d.id)), tilt: g?.tilt ?? 0 };
  }
  parentPort.on('message', (job) => {
    if (job === null) return process.exit(0);
    const flips = [], outs = [], apex = [];
    let tilt = 0;
    for (let s = 1; s <= workerData.S; s++) for (const dk of workerData.DIRS) { const r = shot(job, s, dk); flips.push(r.flip); outs.push(r.out); apex.push(...r.apex); tilt += r.tilt; }
    parentPort.postMessage({ job, flips, outs, apex, tilt: tilt / flips.length });
  });
} else {
  const S = +(process.argv[2] || 16);
  const Ns = (process.argv[3] || '1,2,3,4,6,8,10,12,14,16,20').split(',').map(Number);
  const list = (v, d) => (v ?? d).split(',').filter((x) => x !== '');
  const LAYERS = list(process.env.LAYERS, 'top,2,3,4,mid,low3,bottom');
  const MOUTHS = list(process.env.MOUTHS, '0.15,0.35,0.6,follow,top+0.5,top+1.2');
  const RATIOS = list(process.env.RATIOS, '0.7,0.9,1.1').map(Number);
  const DIRS = list(process.env.DIRS, '-z,+z');
  const SUB_LATS = list(process.env.SUB_LATS, '0.4,-0.4').map(Number);
  const SUB_LAYERS = list(process.env.SUB_LAYERS, '3,mid,low3');
  const SUB_MOUTHS = list(process.env.SUB_MOUTHS, '0.15,0.35,follow');
  const SUB_RATIOS = list(process.env.SUB_RATIOS, '0.9,1.1').map(Number);
  const DIST = !!process.env.DIST;
  const tune = process.env.TUNE_JSON ? JSON.parse(process.env.TUNE_JSON) : {};
  const W = +(process.env.WORKERS || cpus().length);
  const cacheFile = process.env.LEVEL_CACHE;
  if (cacheFile && Object.keys(tune).some((k) => !k.startsWith('lip'))) { console.error('TUNE_JSON 에 lip* 밖의 손잡이가 있음 → follow 캐시를 쓰면 안 됨'); process.exit(1); }
  const key = (j) => [j.n, j.layer, j.mouth, j.ratio, j.lat, S, DIRS.join('/')].join('|') + (j.seedOff ? '|+' + j.seedOff : '');
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const results = new Map();
  const t0 = Date.now();

  async function runJobs(jobs) {
    const todo = [];
    for (const j of jobs) {
      if (results.has(key(j))) continue;
      const c = j.mouth === 'follow' ? cache[key(j)] : null;
      if (c) results.set(key(j), { job: j, ...c }); else todo.push(j);
    }
    todo.sort((a, b) => b.n - a.n); // 무거운 작업(큰 n)부터
    await new Promise((resolve) => {
      if (!todo.length) return resolve();
      let next = 0, done = 0, alive = 0;
      const file = fileURLToPath(import.meta.url);
      for (let w = 0; w < Math.min(W, todo.length); w++) {
        const wk = new Worker(file, { workerData: { S, DIRS, tune } });
        alive++;
        const feed = () => wk.postMessage(next < todo.length ? todo[next++] : null);
        wk.on('message', (m) => {
          results.set(key(m.job), m);
          if (m.job.mouth === 'follow') cache[key(m.job)] = { flips: m.flips, outs: m.outs, apex: m.apex };
          done++;
          if (!process.env.QUIET && done % 50 === 0) process.stderr.write(`  ${done}/${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
          feed();
        });
        wk.on('exit', () => { if (--alive === 0) resolve(); });
        wk.on('error', (e) => { console.error(e); process.exit(1); });
        feed();
      }
    });
    if (cacheFile) writeFileSync(cacheFile, JSON.stringify(cache));
  }

  // 적은 장수에선 층이 겹친다 → 같은 층 인덱스는 처음 이름만
  const layersFor = (n, Ls = LAYERS) => { const seen = new Set(); return Ls.filter((L) => { const i = layerIndex(L, n); if (seen.has(i)) return false; seen.add(i); return true; }); };
  const canon = (n, L) => layersFor(n).find((M) => layerIndex(M, n) === layerIndex(L, n)) ?? L; // 겹친 층 이름 → 처음 이름
  const jobs = [];
  for (const n of Ns) for (const ratio of RATIOS) for (const layer of layersFor(n)) for (const mouth of MOUTHS) jobs.push({ n, layer, mouth, ratio, lat: 0 });
  for (const n of Ns) for (const ratio of SUB_RATIOS) for (const layer of layersFor(n, SUB_LAYERS)) for (const mouth of SUB_MOUTHS) for (const lat of SUB_LATS) jobs.push({ n, layer, mouth, ratio, lat });
  await runJobs(jobs);

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const cellOf = (j) => {
    const r = results.get(key(j));
    if (!r) return null;
    return { ...j, flip: mean(r.flips), zero: r.flips.filter((f) => f === 0).length / r.flips.length, out: mean(r.outs), apex: mean(r.apex), tilt: r.tilt ?? 0, flips: r.flips };
  };
  const get = (n, layer, mouth, ratio, lat = 0) => cellOf({ n, layer: lat ? layer : canon(n, layer), mouth, ratio, lat });
  const f1 = (v) => (v == null ? '   - ' : v.toFixed(1).padStart(5));
  const f2 = (v) => (v == null ? '   - ' : v.toFixed(2).padStart(5));
  const pc = (v) => (v == null ? '  - ' : `${Math.round(v * 100)}%`.padStart(4));
  const isLevel = (m) => m === 'follow';
  const LOW = MOUTHS.filter((m) => m === '0.15' || m === '0.35');
  const HIGH = MOUTHS.filter((m) => m.startsWith('top+'));
  const NONLEVEL = MOUTHS.filter((m) => !isLevel(m) && m !== 'fol9');
  const bestOf = (cells) => cells.filter(Boolean).reduce((b, c) => (!b || c.flip > b.flip ? c : b), null);
  const bestAt = (n, ratio, mouths) => bestOf(layersFor(n).flatMap((L) => mouths.map((m) => get(n, L, m, ratio))));

  console.log(`\n== 입술 높이 지도  (${S}시드 × ${DIRS.join('/')}, lat 0)  TUNE ${JSON.stringify(tune)}`);
  const head = (lab, w = 7) => `  n  층      | ${MOUTHS.map((m) => (m === 'follow' ? 'level' : m).padStart(w)).join(' ')}   ${lab}`;
  for (const ratio of RATIOS) {
    console.log(`\n-- 숨 ${ratio}: 평균 뒤집힌 장수 [0장 비율]`);
    console.log(head('', 9));
    for (const n of Ns) for (const L of layersFor(n)) {
      console.log(`  ${String(n).padStart(2)} ${L.padEnd(7)} | ${MOUTHS.map((m) => { const c = get(n, L, m, ratio); return c ? `${c.flip.toFixed(1).padStart(4)} ${pc(c.zero)}` : '        -'; }).join(' ')}`);
    }
  }
  const metricTable = (title, ratio, f) => {
    console.log(`\n-- ${title}`);
    console.log(head(''));
    for (const n of Ns) for (const L of layersFor(n)) console.log(`  ${String(n).padStart(2)} ${L.padEnd(7)} | ${MOUTHS.map((m) => { const c = get(n, L, m, ratio); return c ? f(c).padStart(7) : '      -'; }).join(' ')}`);
  };
  if (RATIOS.includes(0.9)) metricTable('숨 0.9: 솟은 높이 apex (뒤집힌 딱지, R)', 0.9, (c) => f2(c.apex));
  if (RATIOS.includes(1.1)) metricTable('숨 1.1: 원 밖 장수', 1.1, (c) => f2(c.out));
  // 좌우 부분 지도
  const subJobs = jobs.filter((j) => j.lat !== 0);
  if (subJobs.length) {
    console.log(`\n-- 좌우 ±${SUB_LATS.map(Math.abs).filter((v, i, a) => a.indexOf(v) === i).join('/')} 부분 지도: 뒤집힌 장수 (lat 0 | ${SUB_LATS.join(' | ')})`);
    for (const ratio of SUB_RATIOS) for (const n of Ns) for (const L of layersFor(n, SUB_LAYERS)) {
      console.log(`  숨${ratio} ${String(n).padStart(2)} ${L.padEnd(5)} ${SUB_MOUTHS.map((m) => `${(m === 'follow' ? 'level' : m).padStart(6)}: ${[0, ...SUB_LATS].map((lat) => f1(get(n, L, m, ratio, lat)?.flip)).join('')}`).join('  ')}`);
    }
  }

  // 장수별 요약: 입 높이마다 가장 좋은 층
  const label = (c) => (c ? `${c.layer}` : '-');
  console.log(`\n== 장수별 최고 (lat 0): 입 높이마다 가장 좋은 층의 뒤집힌 장수  (칸 = 장수@층 [0장%] out ↑apex)`);
  for (const ratio of RATIOS) {
    console.log(`-- 숨 ${ratio}`);
    for (const n of Ns) {
      const cells = MOUTHS.map((m) => bestAt(n, ratio, [m]));
      console.log(`  n=${String(n).padStart(2)} | ${cells.map((c, i) => `${(MOUTHS[i] === 'follow' ? 'level' : MOUTHS[i]).padStart(7)} ${c ? `${c.flip.toFixed(2)}@${label(c)}[${Math.round(c.zero * 100)}%] o${c.out.toFixed(1)} ↑${c.apex == null ? '-' : c.apex.toFixed(2)}` : '-'}`).join(' | ')}`);
    }
  }

  // ── G6: 숨 분포 기대값 (장수별 '수평 최고' vs '입 높이 최고' 칸)
  const g6 = {};
  if (DIST && RATIOS.includes(0.9)) {
    const GRID = [0.45, 0.55, 0.65, 0.72, 0.76, 1.03, 1.07, 1.15, 1.2, 1.3];
    const picks = {};
    for (const n of Ns) picks[n] = { level: bestAt(n, 0.9, ['follow']), mouth: bestAt(n, 0.9, NONLEVEL) };
    const dj = [];
    for (const n of Ns) for (const k of ['level', 'mouth']) { const c = picks[n][k]; if (c) for (const r of GRID) dj.push({ n, layer: c.layer, mouth: c.mouth, ratio: r, lat: 0 }); }
    await runJobs(dj);
    // flips(r): 측정점 사이 선형, 초록 0.78~1.0 은 0.9 칸과 같은 물리(규칙상 정확히 같음), 0.45 밑은 0.45, 1.3 위는 1.3
    const curve = (c) => {
      const pts = [...[...GRID.filter((r) => r < 0.78), ...(RATIOS.includes(0.7) ? [0.7] : [])].sort((a, b) => a - b).map((r) => [r, get(c.n, c.layer, c.mouth, r).flip]), [0.78, c.flip], [1.0, c.flip],
        ...[...GRID.filter((r) => r > 1), ...(RATIOS.includes(1.1) ? [1.1] : [])].sort((a, b) => a - b).map((r) => [r, get(c.n, c.layer, c.mouth, r).flip])];
      return (r) => { if (r <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (r <= pts[i][0]) { const [a, fa] = pts[i - 1], [b, fb] = pts[i]; return fa + ((fb - fa) * (r - a)) / (b - a); } return pts[pts.length - 1][1]; };
    };
    const expect = (fn, mu, sd) => { let s = 0, w = 0; for (let r = 0.2; r <= 1.6; r += 0.0025) { const p = Math.exp(-0.5 * ((r - mu) / sd) ** 2); s += p * fn(r); w += p; } return s / w; };
    console.log(`\n== G6 숨 분포 기대값 (장수별 0.9 최고 칸으로): 콩닥(차분) N(0.89, 0.07) / 지금 학습자 N(0.89, 0.14)`);
    console.log(`  n  | 수평 최고(층)      E.07   E.14 | 입 높이 최고(입@층)        E.07   E.14 | 입/수평 .07  .14`);
    for (const n of Ns) {
      const { level, mouth } = picks[n];
      const el = level ? [expect(curve(level), 0.89, 0.07), expect(curve(level), 0.89, 0.14)] : [null, null];
      const em = mouth ? [expect(curve(mouth), 0.89, 0.07), expect(curve(mouth), 0.89, 0.14)] : [null, null];
      g6[n] = { level: level && { layer: level.layer, flip: level.flip, e07: el[0], e14: el[1] }, mouth: mouth && { mouth: mouth.mouth, layer: mouth.layer, flip: mouth.flip, e07: em[0], e14: em[1] } };
      console.log(`  ${String(n).padStart(2)} | ${f2(level?.flip)} (${label(level).padEnd(6)})  ${f2(el[0])}  ${f2(el[1])} | ${f2(mouth?.flip)} (${(mouth ? mouth.mouth + '@' + mouth.layer : '-').padEnd(13)})  ${f2(em[0])}  ${f2(em[1])} | ${el[0] ? (em[0] / el[0]).toFixed(2) : '-'} ${el[1] ? (em[1] / el[1]).toFixed(2).padStart(5) : '-'}`);
    }
    console.log('  (숨 비율 → 장수 곡선:)');
    for (const n of Ns) for (const k of ['level', 'mouth']) {
      const c = picks[n][k]; if (!c) continue;
      const rs = [...GRID.filter((r) => r < 0.78), 0.9, ...[...GRID.filter((r) => r > 1), ...(RATIOS.includes(1.1) ? [1.1] : [])].sort((a, b) => a - b)];
      console.log(`  n=${String(n).padStart(2)} ${k.padEnd(5)} ${(c.mouth === 'follow' ? 'level' : c.mouth).padStart(7)}@${c.layer.padEnd(6)} ${rs.map((r) => `${r}:${get(n, c.layer, c.mouth, r).flip.toFixed(1)}`).join(' ')}`);
    }
  }

  // ── 설계 목표 판정
  const lines = [];
  const crit = (name, rows) => {
    const ok = rows.every((r) => r.ok);
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    for (const r of rows) lines.push(`        ${r.ok ? 'ok ' : 'NO '} ${r.txt}`);
  };
  const x = (a, b) => (b > 0 ? (a / b).toFixed(2) : a > 0 ? 'inf' : '0/0');
  const big = Ns.filter((n) => n >= 6);
  if (RATIOS.includes(0.9) && LOW.length && MOUTHS.includes('follow')) {
    crit('G1 퍼올림: n≥6, 가운데·아래 1/3 을 낮은 입(0.15/0.35)으로 = 같은 층 수평 대비 ≥ ×1.2 이고 솟은 높이 ≥ ×1.1 (둘 중 좋은 층)', big.map((n) => {
      // 층(가운데·아래 1/3) × 낮은 입(0.15·0.35) 중 '장수 ×1.2 와 솟은 높이 ×1.1 을 함께' 넘는 칸이 하나라도 있으면 통과. 표시는 층마다 가장 좋은 칸
      const all = [...new Set(['mid', 'low3'].map((L) => canon(n, L)))].flatMap((L) => {
        const lv = get(n, L, 'follow', 0.9);
        return LOW.map((m) => { const lo = get(n, L, m, 0.9); return { L, lv, lo, r: lv.flip > 0 ? lo.flip / lv.flip : lo.flip > 0 ? Infinity : 0, ar: lv.apex ? (lo.apex ?? 0) / lv.apex : 0 }; });
      });
      const pass = (c) => c.r >= 1.2 && c.ar >= 1.1;
      const ok = all.some(pass);
      const cands = [...new Set(all.map((c) => c.L))].map((L) => { const cs = all.filter((c) => c.L === L); return cs.find(pass) ?? cs.reduce((p, c) => (c.r * Math.min(1, c.ar / 1.1) > p.r * Math.min(1, p.ar / 1.1) ? c : p), cs[0]); });
      return { ok, txt: `n=${n}: ${cands.map((c) => `${c.L} ${c.lo.mouth} ${c.lo.flip.toFixed(2)} vs level ${c.lv.flip.toFixed(2)} (×${x(c.lo.flip, c.lv.flip)}) ↑${(c.lo.apex ?? 0).toFixed(2)} vs ↑${(c.lv.apex ?? 0).toFixed(2)} (×${c.ar.toFixed(2)})`).join('  /  ')}` };
    }));
  }
  if (RATIOS.includes(0.9) && RATIOS.includes(1.1)) {
    crit('G2 정답 하나 아님: 입 높이(수평 밖 전부) 최고 ≤ 수평 최고 ×1.15 (0.9), ≤ ×1.0 (1.1)', Ns.map((n) => {
      const a = bestAt(n, 0.9, NONLEVEL), al = bestAt(n, 0.9, ['follow']), b = bestAt(n, 1.1, NONLEVEL), bl = bestAt(n, 1.1, ['follow']);
      return { ok: a.flip <= al.flip * 1.15 + 1e-9 && b.flip <= bl.flip + 1e-9, txt: `n=${n}: 0.9 ${a.flip.toFixed(2)} (${a.mouth}@${a.layer}) vs ${al.flip.toFixed(2)} (${al.layer}) ×${x(a.flip, al.flip)} / 1.1 ${b.flip.toFixed(2)} (${b.mouth}@${b.layer}) vs ${bl.flip.toFixed(2)} (${bl.layer}) ×${x(b.flip, bl.flip)}` };
    }));
    crit("G2' '위에서 3장째·수평'은 여전히 강한 선택: n≥3 에서 ≥ 전체 최고(0.9)의 ×0.85", Ns.filter((n) => n >= 3).map((n) => {
      const r3 = get(n, layersFor(n).find((L) => layerIndex(L, n) === Math.min(2, n - 1)), 'follow', 0.9), all = bestAt(n, 0.9, MOUTHS);
      return { ok: r3.flip >= 0.85 * all.flip - 1e-9, txt: `n=${n}: 3장째·수평 ${r3.flip.toFixed(2)} vs 최고 ${all.flip.toFixed(2)} (${all.mouth}@${all.layer}) ×${x(r3.flip, all.flip)}` };
    }));
  }
  if (HIGH.length && RATIOS.includes(0.9) && RATIOS.includes(1.1)) {
    crit('G3 위에서 = 보수적: n≥3, 높은 입(top+1.2)은 같은 층 수평보다 초록에서 덜 뒤집고(층 평균), 1.1 에서 원 밖도 적다(층 평균)', Ns.filter((n) => n >= 3).map((n) => {
      const Ls = layersFor(n);
      const avg = (m, r, f) => mean(Ls.map((L) => f(get(n, L, m, r))));
      const hm = HIGH[HIGH.length - 1];
      const fH = avg(hm, 0.9, (c) => c.flip), fL = avg('follow', 0.9, (c) => c.flip), oH = avg(hm, 1.1, (c) => c.out), oL = avg('follow', 1.1, (c) => c.out);
      const fH5 = HIGH.length > 1 ? avg(HIGH[0], 0.9, (c) => c.flip) : null, oH5 = HIGH.length > 1 ? avg(HIGH[0], 1.1, (c) => c.out) : null;
      return { ok: fH < fL && oH < oL, txt: `n=${n}: 초록 ${hm} ${fH.toFixed(2)} vs 수평 ${fL.toFixed(2)} (×${x(fH, fL)}) / 1.1 원 밖 ${oH.toFixed(2)} vs ${oL.toFixed(2)} (×${x(oH, oL)})${fH5 != null ? `   [${HIGH[0]}: ${fH5.toFixed(2)}, 원 밖 ${oH5.toFixed(2)}]` : ''}` };
    }));
  }
  if (RATIOS.includes(0.7) && RATIOS.includes(0.9)) {
    crit('G4 약한 숨 0.7 은 어느 입 높이로도 못 살림: 입 높이 최고(0.7) ≤ 수평 최고(0.7) ×1.1 + 0.25 (잡음 몫; 0.7 의 수평 자체 크기는 숨 규칙 몫)', Ns.map((n) => {
      const a = bestAt(n, 0.7, NONLEVEL), l = bestAt(n, 0.7, ['follow']), g = bestAt(n, 0.9, ['follow']);
      return { ok: a.flip <= l.flip * 1.1 + 0.25, txt: `n=${n}: ${a.flip.toFixed(2)} (${a.mouth}@${a.layer}) vs 수평 0.7 ${l.flip.toFixed(2)} (×${x(a.flip, l.flip)}) / 수평 초록 ${g.flip.toFixed(2)}` };
    }));
  }
  if (RATIOS.includes(0.9)) {
    // 엇나감 = 기울기가 노린 층과 반대 방향으로 가파름: 낮은 입이 맨 위·2장째를 가파르게 올려 붊(위로 갈 바람이 더미 위로 빠짐) /
    //          높은 입이 가운데 이하를 가파르게 내리 붊(아래로 갈 바람이 책상으로). 높은 입 → 맨 위는 '위에서 = 보수적'(G3) 선택이라 엇나감 아님
    const STEEP = 0.3; // 지금 입 대비 17° (퍼올림 정석: 책상 입 → 20장 가운데 = 0.21)
    crit(`G5 실력: n≥6, 엇나간 입(맨 위·2장째를 기울기 ≥ +${STEEP} 로 / 가운데 이하를 ≤ −${STEEP} 로) ≤ 그 층 최고 입의 ×0.75 (그 층 최고 ≥ 1장)`, big.map((n) => {
      const bad = [];
      let cnt = 0;
      const midI = layerIndex('mid', n);
      for (const L of layersFor(n)) {
        const li = layerIndex(L, n);
        const cs = MOUTHS.map((m) => get(n, L, m, 0.9)).filter(Boolean), b = bestOf(cs);
        if (!b || b.flip < 1) continue;
        for (const c of cs) {
          const mis = (li <= 1 && c.tilt >= STEEP) || (li >= midI && c.tilt <= -STEEP);
          if (!mis) continue;
          cnt++;
          if (c.flip > 0.75 * b.flip + 1e-9) bad.push(`${L}←${c.mouth} ${c.flip.toFixed(2)} vs ${b.flip.toFixed(2)} (${b.mouth}) ×${x(c.flip, b.flip)} 기울기 ${c.tilt.toFixed(2)}`);
        }
      }
      const worst = (() => { let w = null; for (const L of layersFor(n)) { const li = layerIndex(L, n); const cs = MOUTHS.map((m) => get(n, L, m, 0.9)).filter(Boolean), b = bestOf(cs); if (!b || b.flip < 1) continue; for (const c of cs) { const mis = (li <= 1 && c.tilt >= STEEP) || (li >= midI && c.tilt <= -STEEP); if (mis) { const r = c.flip / b.flip; if (!w || r > w.r) w = { r, t: `${L}←${c.mouth} ×${r.toFixed(2)}` }; } } } return w; })();
      return { ok: !bad.length, txt: `n=${n}: 엇나간 칸 ${cnt}개, ×0.75 넘은 칸 ${bad.length}개${worst ? ` (가장 덜 손해: ${worst.t})` : ''}${bad.length ? ' — ' + bad.join(' / ') : ''}` };
    }));
  }
  // G2 선택 편향 없이: 고른 칸을 새 시드로
  if (process.env.HOLDOUT && RATIOS.includes(0.9) && RATIOS.includes(1.1)) {
    const picks = [];
    for (const n of Ns) for (const r of [0.9, 1.1]) for (const k of ['level', 'mouth']) { const c = bestAt(n, r, k === 'level' ? ['follow'] : NONLEVEL); picks.push({ n, r, k, c }); }
    const hj = picks.map(({ c }) => ({ n: c.n, layer: c.layer, mouth: c.mouth, ratio: c.ratio, lat: 0, seedOff: S }));
    await runJobs(hj);
    const ho = (c) => cellOf({ n: c.n, layer: c.layer, mouth: c.mouth, ratio: c.ratio, lat: 0, seedOff: S });
    crit(`G2 새 시드(${S + 1}..${2 * S})로 다시 잰 최고 칸: 입 높이 ≤ 수평 ×1.15 (0.9), ≤ ×1.0 (1.1)`, Ns.map((n) => {
      const g = (r, k) => picks.find((p) => p.n === n && p.r === r && p.k === k).c;
      const a = ho(g(0.9, 'mouth')), al = ho(g(0.9, 'level')), b = ho(g(1.1, 'mouth')), bl = ho(g(1.1, 'level'));
      return { ok: a.flip <= al.flip * 1.15 + 1e-9 && b.flip <= bl.flip + 1e-9, txt: `n=${n}: 0.9 ${a.flip.toFixed(2)} (${a.mouth}@${a.layer}) vs ${al.flip.toFixed(2)} (${al.layer}) ×${x(a.flip, al.flip)} / 1.1 ${b.flip.toFixed(2)} (${b.mouth}@${b.layer}) vs ${bl.flip.toFixed(2)} (${bl.layer}) ×${x(b.flip, bl.flip)}` };
    }));
  }
  console.log('\n== 설계 목표 판정');
  for (const l of lines) console.log(l);
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify({ S, DIRS, tune, g6, cells: [...results.values()].map((r) => cellOf(r.job)) }));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

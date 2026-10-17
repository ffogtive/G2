// scoopmap.mjs — '책상 퍼올림'(blow({ tableScoop })) vs 지금 수평 옆 샷: 장수 × 책상 누른 거리 s × 좌우 × 숨 → 물리 반응 지도 + 합격 기준 판정
// (재윤님 8차: '밑에서 입을 퍼올려서 넘기면 잘 넘어가거든 포물선으로' / 심사단 지적 4건 반영 후 정직한 모델로 다시 잼)
//
// 사용: node tools/scoopmap.mjs [시드=16] [장수들=1,2,3,4,6,8,10,12,14,16,20]
//   env SS='0.1,0.3,0.5,0.7,0.9'   책상 누른 거리(더미 발치에서 입 쪽으로, 반지름 단위)
//       LATS='0,0.4,-0.4'          좌우(발치 원 위 옆 위치, 게임 조준과 같은 기하)
//       RATIOS='0.7,0.9,1.0,1.1'   정답 숨 대비 비율 → rules.js resolveShot/physSweetFor (게임과 같음. 돌풍이면 s·좌우도 흔들림: s 를 h 자리에, 상한 1.15)
//       DIRS='-z,+z'               부는 방향(같은 더미를 앞·뒤에서 = 거울 짝)
//       SIDE_LAYERS='top,2,3,4,mid'  비교용 '가장 좋은 옆 샷' 후보 층(위에서 k장째 / mid), SIDE_LATS='0,0.4,-0.4'
//       TUNE_JSON='{"reflLoss":0.8}'  sim TUNE 덮어쓰기(퍼올림 쪽 손잡이만 바꿀 땐 옆 샷 캐시를 그대로 써도 됨)
//       SIDE_CACHE=file.json        옆 샷 결과 캐시(같은 시드·장수·층·좌우·숨이면 재사용; 수평 샷은 퍼올림 손잡이와 무관)
//       WORKERS=4  JSON=out.json  QUIET=1
//       STACK=1 [PS='0.35,...,0.95']  1~2장 전용 stackpower 방식(숨 규칙 없이 물리 세기 직접): 옆(0.6·꼭대기) vs 퍼올림(s별)
// 지표: flip = 원 안에서 뒤집힌 장수 평균(시드 × 방향), apex = 뒤집힌 딱지 무게중심이 시작보다 가장 높이 솟은 높이(반지름 단위),
//       jack = 한 번에 더미의 90% 이상 뒤집힌 샷 비율, out = 분필 원 밖 장수
// 기하(sim.blowTable): 발치 = c − D·√(1−lat²) + side·lat (책상 높이), 누른 점 F = 발치 − D·s, 진짜 입 M = 발치 − D·Lm + 위로 m,
//       반사 뒤 올라가는 각 θ(s) = atan(m/(Lm − s)), 더미 면 닿는 높이 h = s·tanθ (m 0.6, Lm 2.6 → s 0.1: 13.5°/0.02 … s 0.9: 19.4°/0.32)
// 합격 기준(재윤님 8차 심사): n=10..20 ≤ 옆×1.15(초록)·≤ 옆(1.1배) / n=1 ≥ 수평 / n=3..6 옆×1.0~1.25 / n=8..10 옆×0.85~1.0 /
//       0.7배는 못 살림 / s 를 0.2 넘게 빗나가면 ≤ 0.6×최고 / n≥8 한방(90%↑) ≤ 10% / 솟은 높이 ≥ 2×옆
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const S_MAX = 1.15; // 책상 누를 수 있는 가장 먼 거리(발치에서)
const DIRV = { '-z': { x: 0, z: -1 }, '+z': { x: 0, z: 1 }, '+x': { x: 1, z: 0 }, '-x': { x: -1, z: 0 } };
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function layerIndex(L, n) {
  if (L === 'top') return 0;
  if (L === 'mid') return Math.floor((n - 1) / 2);
  if (L === 'bottom') return n - 1;
  return Math.min(n - 1, Math.max(0, +L - 1)); // 숫자 = 위에서 k장째
}

if (!isMainThread) {
  // ── 일꾼: 작업 하나 = (n, 종류, 칸, 숨) 의 모든 시드 × 방향
  const { initPhysics, Table } = await import('../mockup/src/sim.js');
  const { sweetHiFor, resolveShot } = await import('../mockup/src/rules.js');
  await initPhysics();
  const OV = workerData.tune || {};
  function shot(job, seed, dk) {
    const { n, kind, ratio } = job;
    const t = new Table(seed * 7907 + n, OV);
    t.addPile(Array.from({ length: n }, (_, i) => i));
    t.settle();
    const c = t.pileCenter();
    const D = DIRV[dk];
    const side = { x: -D.z, z: D.x };
    const rng = mul(seed * 31 + n);
    let args;
    // STACK 모드(stackpower 방식): 숨 규칙 없이 물리 세기 job.raw 를 그대로
    const rs = (shot0, top) => (job.raw != null ? { ...shot0, power: job.raw, blast: 0 } : resolveShot({ ...shot0, power: sweetHiFor(n) * ratio }, n, top, rng, 1));
    if (kind === 'scoop') {
      const sh = rs({ lat: job.lat, h: job.s }, S_MAX);
      const back = Math.sqrt(1 - sh.lat * sh.lat);
      const foot = { x: c.x - D.x * back + side.x * sh.lat, z: c.z - D.z * back + side.z * sh.lat };
      args = { aim: { x: foot.x - D.x * sh.h, y: 0, z: foot.z - D.z * sh.h }, dir: D, power: sh.power, blast: sh.blast || 0, tableScoop: { s: sh.h } };
    } else {
      const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a);
      const sh = rs({ lat: job.lat, h: job.layer === 'stack' ? t.columnTop() * 0.6 : ys[layerIndex(job.layer, n)] }, t.columnTop());
      const back = Math.sqrt(1 - sh.lat * sh.lat);
      args = { aim: { x: c.x - D.x * back + side.x * sh.lat, y: sh.h, z: c.z - D.z * back + side.z * sh.lat }, dir: D, power: sh.power, blast: sh.blast || 0 };
    }
    const y0 = new Map(), maxY = new Map();
    for (const d of t.liveDiscs()) { const y = d.body.translation().y; y0.set(d.id, y); maxY.set(d.id, y); }
    t.blow(args);
    const steps = Math.ceil(4 / t.T.dt); // runUntilSettled(4) 와 같은 루프 + 솟은 높이 기록
    for (let i = 0; i < steps; i++) {
      t.step();
      for (const d of t.liveDiscs()) { if (d.off) continue; const y = d.body.translation().y; if (y > maxY.get(d.id)) maxY.set(d.id, y); }
      if (!t.puff && i > 30 && t.isSettled()) break;
    }
    const flipped = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d));
    return { flip: flipped.length, out: t.liveDiscs().filter((d) => !t.inCircle(d)).length, apex: flipped.map((d) => maxY.get(d.id) - y0.get(d.id)) };
  }
  parentPort.on('message', (job) => {
    if (job === null) return process.exit(0);
    const flips = [], outs = [], apex = [];
    for (let s = 1; s <= workerData.S; s++) for (const dk of workerData.DIRS) { const r = shot(job, s, dk); flips.push(r.flip); outs.push(r.out); apex.push(...r.apex); }
    parentPort.postMessage({ job, flips, outs, apex });
  });
} else {
  const S = +(process.argv[2] || 16);
  const Ns = (process.argv[3] || '1,2,3,4,6,8,10,12,14,16,20').split(',').map(Number);
  const SS = (process.env.SS || '0.1,0.3,0.5,0.7,0.9').split(',').map(Number);
  const LATS = (process.env.LATS || '0,0.4,-0.4').split(',').map(Number);
  const RATIOS = (process.env.RATIOS || '0.7,0.9,1.0,1.1').split(',').map(Number);
  const DIRS = (process.env.DIRS || '-z,+z').split(',');
  const SIDE_LAYERS = (process.env.SIDE_LAYERS || 'top,2,3,4,mid').split(',');
  const SIDE_LATS = (process.env.SIDE_LATS || '0,0.4,-0.4').split(',').map(Number);
  const tune = process.env.TUNE_JSON ? JSON.parse(process.env.TUNE_JSON) : {};
  const W = +(process.env.WORKERS || cpus().length);
  const cacheFile = process.env.SIDE_CACHE;
  const key = (j) => [j.kind, j.n, j.ratio, j.kind === 'scoop' ? j.s : j.layer, j.lat, S, DIRS.join('/')].join('|');
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  if (cacheFile && tune && Object.keys(tune).some((k) => !/^(scoop|refl)/.test(k))) console.log('주의: TUNE_JSON 에 수평 샷에도 쓰는 손잡이가 있음 → 옆 샷 캐시를 쓰면 안 됨');

  const STACK = !!process.env.STACK; // STACK=1: 1~2장 전용, stackpower 방식(물리 세기 PS 직접) — 옆(높이 0.6·꼭대기, 좌우 0/0.6) vs 퍼올림(s × 좌우 0/0.6)
  const PS = (process.env.PS || '0.35,0.45,0.55,0.65,0.75,0.85,0.95').split(',').map(Number);
  const jobs = [];
  if (STACK) for (const n of Ns) for (const raw of PS) for (const lat of [0, 0.6]) {
    jobs.push({ kind: 'side', n, ratio: 'raw' + raw, raw, layer: 'stack', lat });
    for (const s of SS) jobs.push({ kind: 'scoop', n, ratio: 'raw' + raw, raw, s, lat });
  }
  if (!STACK) for (const n of Ns) for (const ratio of RATIOS) {
    for (const s of SS) for (const lat of LATS) jobs.push({ kind: 'scoop', n, ratio, s, lat });
    const seen = new Set();
    for (const L of SIDE_LAYERS) {
      const li = layerIndex(L, n);
      if (seen.has(li)) continue; // 적은 장수에선 층이 겹침
      seen.add(li);
      for (const lat of SIDE_LATS) jobs.push({ kind: 'side', n, ratio, layer: L, lat });
    }
  }
  const results = new Map();
  const todo = [];
  for (const j of jobs) { const c = j.kind === 'side' ? cache[key(j)] : null; if (c) results.set(key(j), { job: j, ...c }); else todo.push(j); }
  // 무거운 작업(큰 n)부터 나눠 줌
  todo.sort((a, b) => b.n - a.n);
  const t0 = Date.now();
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
        if (m.job.kind === 'side') cache[key(m.job)] = { flips: m.flips, outs: m.outs, apex: m.apex };
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

  const f1 = (v) => (v == null ? '  - ' : v.toFixed(1).padStart(4));
  const f2 = (v) => (v == null ? '  -  ' : v.toFixed(2));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const cell = (j) => {
    const r = results.get(key(j));
    return { ...j, flip: mean(r.flips), out: mean(r.outs), apex: mean(r.apex), jack: r.flips.filter((f) => f >= 0.9 * j.n).length / r.flips.length, flips: r.flips };
  };
  const all = jobs.map(cell);
  if (STACK) {
    console.log(`\n== 1~2장 (stackpower 방식, 물리 세기 직접, ${S}시드 × ${DIRS.join('/')})  칸 = 뒤집힌 비율 %  TUNE ${JSON.stringify(tune)}`);
    console.log(`  n lat  세기 | 옆(0.6·꼭대기) | ${SS.map((s) => ('s' + s).padStart(5)).join(' ')} | 퍼올림 최고`);
    for (const n of Ns) for (const lat of [0, 0.6]) for (const raw of PS) {
      const cs = all.filter((c) => c.n === n && c.raw === raw && c.lat === lat);
      const sd = cs.find((c) => c.kind === 'side'), sc = cs.filter((c) => c.kind === 'scoop');
      const pc = (c) => `${((c.flip / n) * 100).toFixed(0)}%`.padStart(5);
      const b = sc.reduce((x, c) => (c.flip > x.flip ? c : x), sc[0]);
      console.log(`  ${n} ${lat.toFixed(1)} ${raw.toFixed(2)} | ${pc(sd).padStart(14)} | ${sc.map(pc).join(' ')} | ${pc(b)} (s${b.s})`);
    }
    // 장수·좌우별 최고 세기끼리
    for (const n of Ns) {
      const sd = all.filter((c) => c.n === n && c.kind === 'side'), sc = all.filter((c) => c.n === n && c.kind === 'scoop');
      const bd = sd.reduce((x, c) => (c.flip > x.flip ? c : x), sd[0]), bs = sc.reduce((x, c) => (c.flip > x.flip ? c : x), sc[0]);
      console.log(`  n=${n}: 옆 최고 ${((bd.flip / n) * 100).toFixed(0)}% (세기 ${bd.raw}, lat ${bd.lat}) / 퍼올림 최고 ${((bs.flip / n) * 100).toFixed(0)}% (세기 ${bs.raw}, s${bs.s}, lat ${bs.lat})  ↑${f2(bd.apex)} / ↑${f2(bs.apex)}`);
    }
    process.exit(0);
  }
  const pick =(n, ratio, kind) => all.filter((c) => c.n === n && c.ratio === ratio && c.kind === kind);
  const best = (cs) => cs.reduce((b, c) => (c.flip > b.flip ? c : b), cs[0]);
  const sideLabel = (c) => `${c.layer}${c.lat ? (c.lat > 0 ? '+' : '') + c.lat : ''}`;
  const scoopLabel = (c) => `s${c.s}${c.lat ? (c.lat > 0 ? '+' : '') + c.lat : ''}`;

  console.log(`\n== 책상 퍼올림 지도  (${S}시드 × ${DIRS.join('/')}, 칸 = 평균 뒤집힌 장수)  TUNE ${JSON.stringify(tune)}`);
  console.log(`   s 열 = 그 거리에서 좌우 중 가장 좋은 칸.  best = 가장 좋은 칸(좌우 포함) / 옆 = 가장 좋은 수평 옆 샷(층×좌우)  ×옆 = best/옆  ↑ = 솟은 높이(R)  jack = 90%↑ 한방 비율(퍼올림 전체 칸)`);
  console.log(`  n  숨  | ${SS.map((s) => ('s' + s).padStart(5)).join(' ')} | best(칸)        옆(칸)          ×옆   | ↑퍼올림 ↑옆   | jack  out(퍼/옆)`);
  const summary = {};
  for (const n of Ns) for (const ratio of RATIOS) {
    const sc = pick(n, ratio, 'scoop'), sd = pick(n, ratio, 'side');
    const perS = SS.map((s) => best(sc.filter((c) => c.s === s)));
    const bs = best(sc), bd = best(sd);
    const jackAll = sc.reduce((a, c) => a + c.jack, 0) / sc.length;
    summary[`${n}|${ratio}`] = { n, ratio, perS, bs, bd, jackAll };
    console.log(`  ${String(n).padStart(2)} ${ratio.toFixed(1)}  | ${perS.map((c) => f1(c.flip).padStart(5)).join(' ')} | ${f1(bs.flip)} ${scoopLabel(bs).padEnd(10)} ${f1(bd.flip)} ${sideLabel(bd).padEnd(10)} ${(bd.flip > 0 ? (bs.flip / bd.flip).toFixed(2) : bs.flip > 0 ? ' inf' : '  - ').padStart(5)} | ${f2(bs.apex).padStart(6)} ${f2(bd.apex).padStart(6)} | ${(jackAll * 100).toFixed(0).padStart(3)}%  ${bs.out.toFixed(1)}/${bd.out.toFixed(1)}`);
  }

  // ── 합격 기준
  const G = 0.9;
  const has = (n, r) => !!summary[`${n}|${r}`];
  const lines = [];
  const crit = (name, rows) => {
    const ok = rows.every((r) => r.ok);
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    for (const r of rows) lines.push(`        ${r.ok ? 'ok ' : 'NO '} ${r.txt}`);
    return ok;
  };
  const ratioTxt = (a, b) => (b > 0 ? (a / b).toFixed(2) : a > 0 ? 'inf' : '0/0');
  const big = Ns.filter((n) => n >= 10 && n <= 20);
  if (has(big[0], G) && has(big[0], 1.1)) crit('n=10..20: 퍼올림 ≤ 옆×1.15 (초록 0.9) 그리고 ≤ 옆 (1.1배)', big.map((n) => {
    const a = summary[`${n}|${G}`], b = summary[`${n}|1.1`];
    return { ok: a.bs.flip <= a.bd.flip * 1.15 + 1e-9 && b.bs.flip <= b.bd.flip + 1e-9, txt: `n=${n}: 0.9 ${a.bs.flip.toFixed(2)} vs ${a.bd.flip.toFixed(2)} (×${ratioTxt(a.bs.flip, a.bd.flip)}) / 1.1 ${b.bs.flip.toFixed(2)} vs ${b.bd.flip.toFixed(2)} (×${ratioTxt(b.bs.flip, b.bd.flip)})` };
  }));
  if (has(1, G)) { const a = summary[`1|${G}`]; crit('n=1: 퍼올림 ≥ 수평', [{ ok: a.bs.flip >= a.bd.flip - 1e-9, txt: `0.9: ${a.bs.flip.toFixed(2)} vs ${a.bd.flip.toFixed(2)} (×${ratioTxt(a.bs.flip, a.bd.flip)})` }]); }
  const band = (ns, lo, hi) => ns.filter((n) => has(n, G)).map((n) => { const a = summary[`${n}|${G}`]; const r = a.bd.flip > 0 ? a.bs.flip / a.bd.flip : Infinity; return { ok: r >= lo - 1e-9 && r <= hi + 1e-9, txt: `n=${n}: ${a.bs.flip.toFixed(2)} / ${a.bd.flip.toFixed(2)} = ×${ratioTxt(a.bs.flip, a.bd.flip)}  (목표 ${lo}~${hi})` }; });
  const b36 = band([3, 4, 5, 6], 1.0, 1.25);
  if (b36.length) crit('n=3..6: 퍼올림 = 옆 ×1.0~1.25 (초록 0.9)', b36);
  const b810 = band([8, 9, 10], 0.85, 1.0);
  if (b810.length) crit('n=8..10: 퍼올림 = 옆 ×0.85~1.0 (초록 0.9)', b810);
  if (RATIOS.includes(0.7)) crit('약한 숨 0.7배는 못 살림: 퍼올림 ≤ 옆 (0.7)', Ns.map((n) => { const a = summary[`${n}|0.7`]; return { ok: a.bs.flip <= a.bd.flip + 1e-9, txt: `n=${n}: ${a.bs.flip.toFixed(2)} vs ${a.bd.flip.toFixed(2)}` }; }));
  crit('실력: 최적 s 에서 0.2 넘게 빗나가면 ≤ 최고의 0.6배 (초록 0.9, 좌우는 각 s 에서 가장 좋은 쪽)', Ns.filter((n) => has(n, G)).map((n) => {
    const a = summary[`${n}|${G}`];
    const bi = a.perS.reduce((b, c, i) => (c.flip > a.perS[b].flip ? i : b), 0);
    const sStar = SS[bi];
    const far = a.perS.filter((c, i) => Math.abs(SS[i] - sStar) > 0.2 + 1e-9);
    const worst = far.length ? Math.max(...far.map((c) => c.flip)) : 0;
    const ok = a.perS[bi].flip <= 0 ? true : worst <= 0.6 * a.perS[bi].flip + 1e-9;
    return { ok, txt: `n=${n}: s*=${sStar} ${a.perS[bi].flip.toFixed(2)}, 0.2 넘게 빗나간 칸 중 최고 ${worst.toFixed(2)} (×${ratioTxt(worst, a.perS[bi].flip)})` };
  }));
  const big8 = Ns.filter((n) => n >= 8);
  crit('n≥8: 한 방에 90%↑ 뒤집힘은 퍼올림 샷의 ≤10% (모든 s·좌우·숨)', big8.map((n) => {
    const sc = all.filter((c) => c.n === n && c.kind === 'scoop');
    const j = sc.reduce((a, c) => a + c.jack, 0) / sc.length;
    const bj = summary[`${n}|${G}`].bs.jack;
    return { ok: j <= 0.1 + 1e-9, txt: `n=${n}: 전체 ${(j * 100).toFixed(1)}%  (초록 최고 칸 ${(bj * 100).toFixed(0)}%)` };
  }));
  const apexRows = Ns.filter((n) => has(n, G)).map((n) => {
    const a = summary[`${n}|${G}`];
    return { ok: a.bs.apex != null && a.bd.apex != null && a.bs.apex >= 2 * a.bd.apex, txt: `n=${n}: 퍼올림 최고 칸 ↑${f2(a.bs.apex)} vs 옆 최고 칸 ↑${f2(a.bd.apex)} (×${a.bs.apex != null && a.bd.apex ? (a.bs.apex / a.bd.apex).toFixed(2) : '-'})` };
  });
  crit('포물선: 퍼올림 솟은 높이 ≥ 2 × 옆 (초록 0.9, 각 최고 칸)', apexRows);
  console.log('\n== 합격 기준');
  for (const l of lines) console.log(l);
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify({ S, DIRS, tune, cells: all.map(({ flips, ...c }) => ({ ...c, flips })) }));
}

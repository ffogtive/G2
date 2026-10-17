// jsref.mjs — JS 물리(mockup/src/sim.js, Rapier JS 0.12)로 parity 다섯 도구를 돌려 '시드별 값' JSON 을 만든다.
// tools/powercurve·fromtop·aimmap·stackpower·mouthmap 과 같은 시드·같은 기하·같은 출력 줄(평균) — 그 도구들은 평균만 찍어서
// 잡음 판정(표준오차)을 못 하므로 여기서 시드별로 모은다. Rust 쪽 짝 = `puff_parity all` (JSON=…).
// 사용: node native/puff_sim/parity/jsref.mjs [시드=16] > js.txt   (env JSON=js.json, SIM=다른 sim.js 경로, ONLY=powercurve,fromtop, SEED_OFF=16)
// sim.js·rules.js 는 읽기만 한다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const simPath = resolve(process.env.SIM || resolve(here, '../../../mockup/src/sim.js'));
const rulesPath = resolve(dirname(simPath), 'rules.js');
const { initPhysics, Table, DISC_H } = await import(pathToFileURL(simPath).href);
const { sweetHiFor, resolveShot } = await import(pathToFileURL(rulesPath).href);
await initPhysics();

const S = +(process.argv[2] || 16);
const OFF = +(process.env.SEED_OFF || 0); // 시드 밀기: 16 이면 시드 17..32 (튜닝에 안 쓴 새 시드)
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const pile = (seed, n) => { const t = new Table(seed); t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle(); return t; };
const outs = (t) => t.liveDiscs().filter((d) => !t.inCircle(d)).length;
const suites = [];
const t0 = Date.now();

if (want('powercurve')) {
  console.log('## powercurve');
  const cells = [];
  const RATIOS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.05, 1.1, 1.2, 1.3];
  for (const n of [8, 12, 20]) for (const hf of [0.95, 0.75, 0.5]) {
    const line = [];
    for (const r of RATIOS) {
      const c = { key: `n=${n}|aim=${hf}|r=${r.toFixed(2)}`, flips: [], outs: [] };
      for (let s = 1 + OFF; s <= S + OFF; s++) {
        const t = pile(s * 7907 + n, n);
        const top = t.columnTop();
        const sh = resolveShot({ lat: 0, h: Math.max(0.03, top * hf), power: sweetHiFor(n) * r }, n, top, mul(s * 31 + n), 1);
        const p = t.pileCenter();
        t.blow({ aim: { x: p.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: p.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
        c.flips.push(t.runUntilSettled(4).flipped.length); c.outs.push(outs(t));
      }
      cells.push(c);
      const o = mean(c.outs);
      line.push(`${r.toFixed(2)}:${mean(c.flips).toFixed(1)}${o ? '/out' + o.toFixed(1) : ''}`);
    }
    console.log(`n=${String(n).padStart(2)} aim=${hf} | ${line.join('  ')}`);
  }
  suites.push({ tool: 'powercurve', cells });
}

if (want('fromtop')) {
  console.log('## fromtop');
  const cells = [];
  for (const n of [3, 5, 8, 12, 16, 20]) {
    const row = [];
    for (const k of [0.5, 1, 2, 3, 4, 5, 6, 8].filter((k) => k <= n)) {
      const c = { key: `n=${n}|k=${k}`, flips: [] };
      for (let s = 1 + OFF; s <= S + OFF; s++) {
        const t = pile(s * 7907 + n, n);
        const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a);
        const top = t.columnTop();
        const h = k < 1 ? top - DISC_H * 0.25 : ys[Math.min(n - 1, Math.round(k) - 1)];
        const sh = resolveShot({ lat: 0, h, power: sweetHiFor(n) * 0.9 }, n, top, mul(s * 31 + n), 1);
        const p = t.pileCenter();
        t.blow({ aim: { x: p.x - 1, y: sh.h, z: p.z }, dir: { x: 1, z: 0 }, power: sh.power, blast: 0 });
        c.flips.push(t.runUntilSettled(4).flipped.length);
      }
      cells.push(c);
      row.push(`${k}장째:${mean(c.flips).toFixed(1)}(꽝${Math.round((c.flips.filter((f) => !f).length / S) * 100)}%)`);
    }
    console.log(`n=${n} | ${row.join('  ')}`);
  }
  suites.push({ tool: 'fromtop', cells });
}

if (want('aimmap')) {
  console.log('## aimmap (LATS=-0.6,0,0.6 N=12 R=0.9)');
  const cells = [];
  const N = 12, R = 0.9, LATS = [-0.6, 0, 0.6];
  for (const hf of [0.95, 0.75, 0.5]) {
    const line = [];
    for (const lat of LATS) {
      const c = { key: `N=${N}|R=${R}|h=${hf}|lat=${lat}`, flip: [], out: [], spin: [], side: [], fwd: [], moved: [], roll: [], rollN: [] };
      for (let s = 1 + OFF; s <= S + OFF; s++) {
        const t = pile(s * 7907 + N, N);
        const top = t.columnTop();
        const sh = resolveShot({ lat, h: Math.max(0.03, top * hf), power: sweetHiFor(N) * R }, N, top, mul(s * 31 + N), 1);
        const p = t.pileCenter();
        const p0 = new Map(t.liveDiscs().map((d) => [d.id, { ...d.body.translation() }]));
        t.blow({ aim: { x: p.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: p.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
        for (let i = 0; i < 30; i++) t.step();
        let spin = 0; for (const d of t.liveDiscs()) spin += Math.abs(d.body.angvel().y) / N;
        const res = t.runUntilSettled(4);
        let side = 0, fwd = 0, moved = 0, out = 0, roll = 0, rollN = 0;
        for (const d of t.liveDiscs()) {
          const q = d.body.translation(), o = p0.get(d.id), dx = q.x - o.x, dz = q.z - o.z;
          if (Math.hypot(dx, dz) > 0.3) { moved++; side += dz; fwd += dx; }
          if (!t.inCircle(d)) out++;
        }
        for (const d of res.flipped) { const q = d.body.translation(), o = p0.get(d.id), dx = q.x - o.x, dz = q.z - o.z, L = Math.hypot(dx, dz); if (L > 0.2) { roll += Math.abs(dz) / L; rollN++; } }
        c.flip.push(res.flipped.length); c.out.push(out); c.spin.push(spin); c.side.push(side); c.fwd.push(fwd); c.moved.push(moved); c.roll.push(roll); c.rollN.push(rollN);
      }
      cells.push(c);
      const mv = sum(c.moved), rn = sum(c.rollN);
      line.push({ lat, flip: mean(c.flip), side: mv ? sum(c.side) / mv : 0, fwd: mv ? sum(c.fwd) / mv : 0, spin: mean(c.spin), roll: rn ? sum(c.roll) / rn : 0, out: mean(c.out) });
    }
    console.log(`h=${hf}`);
    for (const k of ['flip', 'side', 'fwd', 'spin', 'roll', 'out']) console.log(`  ${k.padEnd(4)} | ${line.map((c) => `${(c.lat >= 0 ? '+' : '') + c.lat.toFixed(1)}:${c[k].toFixed(2).padStart(5)}`).join('  ')}`);
  }
  suites.push({ tool: 'aimmap', cells });
}

if (want('stackpower')) {
  console.log('## stackpower');
  const cells = [];
  const PS = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  for (const n of [1, 2, 3, 5, 8]) for (const lat of [0, 0.6]) {
    const parts = [];
    for (const pw of PS) {
      const c = { key: `n=${n}|lat=${lat}|pw=${pw}`, flips: [], outs: [] };
      for (let s = 1 + OFF; s <= S + OFF; s++) {
        const t = pile(s * 7907 + n, n);
        const top = t.columnTop(), p = t.pileCenter();
        t.blow({ aim: { x: p.x - Math.sqrt(1 - lat * lat), y: top * 0.6, z: p.z + lat }, dir: { x: 1, z: 0 }, power: pw, blast: 0 });
        c.flips.push(t.runUntilSettled(4).flipped.length); c.outs.push(outs(t));
      }
      cells.push(c);
      const o = sum(c.outs);
      parts.push(`${pw}:${((sum(c.flips) / S / n) * 100).toFixed(0)}%${o ? '/o' + (o / S).toFixed(1) : ''}`);
    }
    console.log(`n=${n} lat=${lat} | ${parts.join(' ')}`);
  }
  suites.push({ tool: 'stackpower', cells });
}

if (want('mouthmap')) {
  const cells = [];
  const LAYERS = ['top', '3', 'mid', 'low3'], MOUTHS = ['0.15', 'follow'], RATIO = 0.9;
  const DIRS = [{ x: 0, z: -1 }, { x: 0, z: 1 }];
  const li = (L, n) => (L === 'top' ? 0 : L === 'mid' ? Math.floor((n - 1) / 2) : L === 'low3' ? Math.round(((n - 1) * 2) / 3) : L === 'bottom' ? n - 1 : Math.min(n - 1, Math.max(0, +L - 1)));
  console.log(`\n== 입술 높이 지도  (${S}시드 × -z/+z, lat 0, 숨 ${RATIO})`);
  console.log(`  n  층      | ${MOUTHS.map((m) => (m === 'follow' ? 'level' : m).padStart(9)).join(' ')}`);
  for (const n of [14, 20]) {
    const seen = new Set();
    for (const L of LAYERS) {
      const idx = li(L, n); if (seen.has(idx)) continue; seen.add(idx);
      const parts = [];
      for (const m of MOUTHS) {
        const c = { key: `n=${n}|layer=${L}|mouth=${m}|r=${RATIO}`, flips: [], outs: [], apex: [] };
        for (let s = 1 + OFF; s <= S + OFF; s++) for (const D of DIRS) {
          const t = pile(s * 7907 + n, n);
          const p = t.pileCenter(), side = { x: -D.z, z: D.x };
          const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a);
          const top = t.columnTop();
          const sh = resolveShot({ lat: 0, h: ys[idx], power: sweetHiFor(n) * RATIO }, n, top, mul(s * 31 + n), 1);
          const back = Math.sqrt(1 - sh.lat * sh.lat);
          const args = { aim: { x: p.x - D.x * back + side.x * sh.lat, y: sh.h, z: p.z - D.z * back + side.z * sh.lat }, dir: D, power: sh.power, blast: sh.blast || 0 };
          if (m !== 'follow') args.mouthY = +m;
          const y0 = new Map(), maxY = new Map();
          for (const d of t.liveDiscs()) { const y = d.body.translation().y; y0.set(d.id, y); maxY.set(d.id, y); }
          t.blow(args);
          const steps = Math.ceil(4 / t.T.dt);
          for (let i = 0; i < steps; i++) {
            t.step();
            for (const d of t.liveDiscs()) { if (d.off) continue; const y = d.body.translation().y; if (y > maxY.get(d.id)) maxY.set(d.id, y); }
            if (!t.puff && i > 30 && t.isSettled()) break;
          }
          const fl = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d));
          c.flips.push(fl.length); c.outs.push(outs(t)); for (const d of fl) c.apex.push(maxY.get(d.id) - y0.get(d.id));
        }
        cells.push(c);
        parts.push(`${mean(c.flips).toFixed(1).padStart(4)} ${`${Math.round((c.flips.filter((f) => !f).length / c.flips.length) * 100)}%`.padStart(4)}`);
      }
      console.log(`  ${String(n).padStart(2)} ${L.padEnd(7)} | ${parts.join(' ')}`);
    }
  }
  suites.push({ tool: 'mouthmap', cells });
}

if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify({ engine: 'js', sim: simPath, suites }));
console.error(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`);

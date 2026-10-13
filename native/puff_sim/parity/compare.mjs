// compare.mjs — JS(Rapier JS 0.12) vs Rust(rapier3d 0.36) parity 판정.
// 입력 = 두 JSON (jsref.mjs / `puff_parity all` 의 JSON=…). 칸마다 시드별 평균·표준오차 → z = (rust − js) / √(se_js² + se_rs²)
// '잡음 안' = |z| < 2 (칸 수가 많으니 5% 쯤은 우연히 밖). 헤드라인 = 손맛을 정하는 다섯 가지 모양.
// 사용: node native/puff_sim/parity/compare.mjs js.json rust.json [--quiet] [--md]
import { readFileSync } from 'node:fs';

const [jsPath, rsPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const QUIET = process.argv.includes('--quiet');
const MD = process.argv.includes('--md');
const js = JSON.parse(readFileSync(jsPath, 'utf8'));
const rs = JSON.parse(readFileSync(rsPath, 'utf8'));
const mean = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => (a ? a.reduce((x, y) => x + y, 0) : 0);
const se = (a) => { if (!a || a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length); };
const f = (v, d = 2) => (v == null || Number.isNaN(v) ? '-' : v.toFixed(d));
const suite = (doc, tool) => new Map((doc.suites.find((s) => s.tool === tool)?.cells ?? []).map((c) => [c.key, c]));

function zcell(a, b) {
  const s = Math.sqrt(se(a) ** 2 + se(b) ** 2);
  const d = mean(b) - mean(a);
  return { js: mean(a), rs: mean(b), d, z: s > 0 ? d / s : d === 0 ? 0 : Infinity };
}

const report = { suites: {}, headline: [] };
let lossSum = 0, lossN = 0;
function scoreSuite(tool, metrics) {
  const J = suite(js, tool), R = suite(rs, tool);
  const rows = [];
  for (const [key, cj] of J) {
    const cr = R.get(key);
    if (!cr) continue;
    for (const m of metrics) {
      if (!cj[m]) continue;
      const z = zcell(cj[m], cr[m]);
      rows.push({ key, m, ...z });
      if (Number.isFinite(z.z)) { lossSum += Math.min(z.z * z.z, 25); lossN++; }
    }
  }
  const ok = rows.filter((r) => Math.abs(r.z) < 2).length;
  const rms = Math.sqrt(mean(rows.map((r) => r.d * r.d)));
  report.suites[tool] = { cells: rows.length, inNoise: ok, frac: rows.length ? ok / rows.length : 0, rms, rows };
  return rows;
}

const pcRows = scoreSuite('powercurve', ['flips', 'outs']);
const ftRows = scoreSuite('fromtop', ['flips']);
const amRows = scoreSuite('aimmap', ['flip', 'out']);
const spRows = scoreSuite('stackpower', ['flips']);
const mmRows = scoreSuite('mouthmap', ['flips']);

// ── 헤드라인 (손맛을 정하는 모양) ──
const H = (name, js_, rs_, pass, note = '') => report.headline.push({ name, js: js_, rs: rs_, pass, note });
{ // 1. 숨 곡선: 초록 고원·약함·돌풍. n·조준 9줄 평균
  const J = suite(js, 'powercurve'), R = suite(rs, 'powercurve');
  const avg = (M, r, m) => mean([...M.values()].filter((c) => c.key.endsWith(`r=${r}`)).map((c) => mean(c[m])));
  for (const [r, lab] of [['0.60', '약함 0.6'], ['0.90', '초록 0.9'], ['1.10', '돌풍 1.1'], ['1.20', '돌풍 1.2'], ['1.30', '돌풍 1.3']]) {
    const a = avg(J, r, 'flips'), b = avg(R, r, 'flips'), ao = avg(J, r, 'outs'), bo = avg(R, r, 'outs');
    H(`powercurve ${lab}: 뒤집힘/원 밖 (9줄 평균)`, `${f(a, 1)} / ${f(ao, 1)}`, `${f(b, 1)} / ${f(bo, 1)}`, Math.abs(b - a) <= Math.max(0.6, 0.15 * a) && Math.abs(bo - ao) <= Math.max(0.6, 0.2 * ao));
  }
  // 돌풍 감소율 (1.2 / 초록)
  const g = (M) => avg(M, '1.20', 'flips') / Math.max(1e-9, avg(M, '0.90', 'flips'));
  H('powercurve 1.2 ÷ 초록 (돌풍 손해)', f(g(J)), f(g(R)), Math.abs(g(R) - g(J)) <= 0.15);
}
{ // 2. fromtop: 장수별 최고 층(위에서 k장째)과 그 값
  const J = suite(js, 'fromtop'), R = suite(rs, 'fromtop');
  for (const n of [3, 5, 8, 12, 16, 20]) {
    const cs = (M) => [...M.values()].filter((c) => c.key.startsWith(`n=${n}|`));
    const best = (M) => cs(M).reduce((b, c) => (!b || mean(c.flips) > mean(b.flips) ? c : b), null);
    const bj = best(J), br = best(R);
    if (!bj || !br) continue;
    const kj = bj.key.split('k=')[1], kr = br.key.split('k=')[1];
    // 통과: Rust 의 최고 층이 JS 최고 층과 같거나, JS 에서 그 층이 최고와 잡음 안(|z|<2)
    const jsAtR = J.get(br.key);
    const zz = zcell(bj.flips, jsAtR.flips).z;
    H(`fromtop n=${n}: 최고 층(장째) [값]`, `${kj} [${f(mean(bj.flips), 1)}]`, `${kr} [${f(mean(br.flips), 1)}]`, kj === kr || Math.abs(zz) < 2, kj === kr ? '' : `JS 에서 ${kr}장째 = ${f(mean(jsAtR.flips), 1)} (z ${f(zz, 1)})`);
  }
}
{ // 3. aimmap: 가운데 vs 옆 ±0.6 (높이별) — 가운데가 이기는가 + 옆 이동 방향
  const J = suite(js, 'aimmap'), R = suite(rs, 'aimmap');
  for (const h of ['0.95', '0.75', '0.5']) {
    const g = (M, lat) => M.get(`N=12|R=0.9|h=${h}|lat=${lat}`);
    const adv = (M) => mean(g(M, 0).flip) - (mean(g(M, -0.6).flip) + mean(g(M, 0.6).flip)) / 2;
    const sideOf = (c) => (sum(c.moved) ? sum(c.side) / sum(c.moved) : 0);
    const sj = [sideOf(g(J, -0.6)), sideOf(g(J, 0.6))], sr = [sideOf(g(R, -0.6)), sideOf(g(R, 0.6))];
    H(`aimmap h=${h}: 가운데 − 옆 평균 (장) · 옆 이동 −0.6/+0.6`, `${f(adv(J))} · ${f(sj[0])}/${f(sj[1])}`, `${f(adv(R))} · ${f(sr[0])}/${f(sr[1])}`,
      Math.sign(adv(J)) === Math.sign(adv(R)) && Math.sign(sj[0]) === Math.sign(sr[0]) && Math.sign(sj[1]) === Math.sign(sr[1]));
  }
}
{ // 4. stackpower: 1장 0.75 정점 (rules PHYS_SWEET_ONE 의 근거)
  const J = suite(js, 'stackpower'), R = suite(rs, 'stackpower');
  const pct = (M, pw, lat = 0) => (mean(M.get(`n=1|lat=${lat}|pw=${pw}`)?.flips ?? []) * 100);
  const peak = (M, lat) => [0.55, 0.65, 0.75, 0.85, 0.95].reduce((b, p) => (pct(M, p, lat) > pct(M, b, lat) ? p : b), 0.55);
  for (const lat of [0, 0.6]) H(`stackpower n=1 lat=${lat}: 0.75 / 0.95 성공률 · 정점`, `${f(pct(J, 0.75, lat), 0)}% / ${f(pct(J, 0.95, lat), 0)}% · ${peak(J, lat)}`, `${f(pct(R, 0.75, lat), 0)}% / ${f(pct(R, 0.95, lat), 0)}% · ${peak(R, lat)}`,
    pct(R, 0.75, lat) > pct(R, 0.95, lat) + 15 && Math.abs(peak(R, lat) - 0.75) <= 0.1 + 1e-9);
  // 2장 이상은 0.95 까지 오른다
  const up = (M, n) => mean(M.get(`n=${n}|lat=0|pw=0.95`).flips) >= mean(M.get(`n=${n}|lat=0|pw=0.75`).flips);
  H('stackpower n=2,3,5,8: 0.95 ≥ 0.75 (계속 오름)', [2, 3, 5, 8].map((n) => (up(J, n) ? 'Y' : 'N')).join(''), [2, 3, 5, 8].map((n) => (up(R, n) ? 'Y' : 'N')).join(''), [2, 3, 5, 8].every((n) => up(R, n)));
}
{ // 5. mouthmap: 낮은 입(0.15)의 가운데 층 이득 n=14/20, 수평 최고 층
  const J = suite(js, 'mouthmap'), R = suite(rs, 'mouthmap');
  for (const n of [14, 20]) {
    const k = (M, L, m) => M.get(`n=${n}|layer=${L}|mouth=${m}|r=0.9`);
    const gain = (M) => mean(k(M, 'mid', '0.15').flips) / Math.max(1e-9, mean(k(M, 'mid', 'follow').flips));
    H(`mouthmap n=${n}: 가운데 층 낮은 입 ÷ 수평`, `${f(gain(J))} (${f(mean(k(J, 'mid', '0.15').flips), 1)}/${f(mean(k(J, 'mid', 'follow').flips), 1)})`, `${f(gain(R))} (${f(mean(k(R, 'mid', '0.15').flips), 1)}/${f(mean(k(R, 'mid', 'follow').flips), 1)})`, gain(R) >= 1.2 && (gain(J) >= 1.2) === (gain(R) >= 1.2) && Math.abs(Math.log(gain(R) / gain(J))) < Math.log(2), '낮은 입이 이기는가 + 이득 배수가 2배 안');
    const bestLv = (M) => ['top', '3', 'mid', 'low3'].map((L) => [L, k(M, L, 'follow')]).filter(([, c]) => c).reduce((b, x) => (!b || mean(x[1].flips) > mean(b[1].flips) ? x : b), null);
    const bj = bestLv(J), br = bestLv(R);
    H(`mouthmap n=${n}: 수평 최고 층`, `${bj[0]} [${f(mean(bj[1].flips), 1)}]`, `${br[0]} [${f(mean(br[1].flips), 1)}]`, bj[0] === br[0] || Math.abs(zcell(bj[1].flips, k(J, br[0], 'follow').flips).z) < 2);
  }
}

const loss = lossN ? lossSum / lossN : 0;
if (QUIET) {
  const hp = report.headline.filter((h) => h.pass).length;
  console.log(`loss(mean z², cap 25) ${loss.toFixed(3)} | 잡음 안 ${Object.entries(report.suites).map(([k, s]) => `${k} ${s.inNoise}/${s.cells}`).join(' ')} | 헤드라인 ${hp}/${report.headline.length}`);
  process.exit(0);
}

const line = (cells) => (MD ? `| ${cells.join(' | ')} |` : cells.join('  '));
console.log(MD ? '### 칸별 일치 (|z| < 2 = 16시드 잡음 안)\n' : '== 칸별 일치 (|z| < 2 = 16시드 잡음 안)');
if (MD) console.log('| 도구 | 칸 | 잡음 안 | 비율 | 평균 차 RMS |\n|---|---|---|---|---|');
for (const [k, s] of Object.entries(report.suites)) console.log(line([k, s.cells, s.inNoise, `${Math.round(s.frac * 100)}%`, f(s.rms)]));
console.log(MD ? '\n### 헤드라인 (손맛을 정하는 모양)\n' : '\n== 헤드라인');
if (MD) console.log('| 항목 | JS (Rapier JS 0.12) | Rust (rapier3d 0.36) | 판정 | 메모 |\n|---|---|---|---|---|');
for (const h of report.headline) console.log(line([h.name, h.js, h.rs, h.pass ? '맞음' : '다름', h.note]));
console.log(`\nloss(mean z², cap 25) = ${loss.toFixed(3)}`);
if (process.argv.includes('--cells')) {
  console.log('\n== 잡음 밖 칸 (|z| ≥ 2)');
  for (const [k, s] of Object.entries(report.suites)) for (const r of s.rows) if (Math.abs(r.z) >= 2) console.log(`  ${k} ${r.key} ${r.m}: js ${f(r.js)} rs ${f(r.rs)} z ${f(r.z, 1)}`);
}

// ── --table: 사람이 읽는 나란히 표 (README 용, markdown) ──
if (process.argv.includes('--table')) {
  const cellMean = (doc, tool, key, m) => { const c = suite(doc, tool).get(key); return c ? mean(c[m]) : null; };
  const zOf = (tool, key, m) => { const a = suite(js, tool).get(key)?.[m], b = suite(rs, tool).get(key)?.[m]; return a && b ? zcell(a, b).z : 0; };
  const mark = (tool, key, m) => (Math.abs(zOf(tool, key, m)) >= 2 ? '**' : '');
  const pair = (tool, key, m, d = 1) => { const k = mark(tool, key, m); return `${k}${f(cellMean(js, tool, key, m), d)}→${f(cellMean(rs, tool, key, m), d)}${k}`; };
  console.log('\n#### powercurve — 뒤집힌 장수 / 원 밖 장수 (JS→Rust, **굵게** = 잡음 밖 |z|≥2)\n');
  const R = ['0.50', '0.60', '0.70', '0.90', '1.05', '1.10', '1.20', '1.30'];
  console.log(`| n · 조준 | ${R.join(' | ')} |\n|---|${R.map(() => '---').join('|')}|`);
  for (const n of [8, 12, 20]) for (const h of [0.95, 0.75, 0.5]) {
    const key = (r) => `n=${n}|aim=${h}|r=${r}`;
    console.log(`| ${n} · ${h} | ${R.map((r) => `${pair('powercurve', key(r), 'flips')} / ${pair('powercurve', key(r), 'outs')}`).join(' | ')} |`);
  }
  console.log('\n#### fromtop — 위에서 k장째를 초록 숨(0.9)으로 (JS→Rust)\n');
  const K = [0.5, 1, 2, 3, 4, 5, 6, 8];
  console.log(`| n | ${K.map((k) => `${k}장째`).join(' | ')} |\n|---|${K.map(() => '---').join('|')}|`);
  for (const n of [3, 5, 8, 12, 16, 20]) console.log(`| ${n} | ${K.map((k) => (k <= n ? pair('fromtop', `n=${n}|k=${k}`, 'flips') : '')).join(' | ')} |`);
  console.log('\n#### aimmap — 12장, 숨 0.9: 뒤집힘 / 원 밖 (JS→Rust)\n');
  console.log('| 높이 | lat −0.6 | lat 0 | lat +0.6 |\n|---|---|---|---|');
  for (const h of ['0.95', '0.75', '0.5']) console.log(`| ${h} | ${['-0.6', '0', '0.6'].map((l) => `${pair('aimmap', `N=12|R=0.9|h=${h}|lat=${l}`, 'flip', 2)} / ${pair('aimmap', `N=12|R=0.9|h=${h}|lat=${l}`, 'out', 2)}`).join(' | ')} |`);
  console.log('\n#### stackpower — 물리 세기별 뒤집힌 비율 % (JS→Rust)\n');
  const P = [0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  console.log(`| n · lat | ${P.join(' | ')} |\n|---|${P.map(() => '---').join('|')}|`);
  for (const n of [1, 2, 3, 5, 8]) for (const lat of [0, 0.6]) {
    console.log(`| ${n} · ${lat} | ${P.map((p) => { const key = `n=${n}|lat=${lat}|pw=${p}`; const k = mark('stackpower', key, 'flips'); return `${k}${f(cellMean(js, 'stackpower', key, 'flips') / n * 100, 0)}→${f(cellMean(rs, 'stackpower', key, 'flips') / n * 100, 0)}${k}`; }).join(' | ')} |`);
  }
  console.log('\n#### mouthmap — 숨 0.9, 두 방향: 낮은 입(0.15) / 수평(지금 입) 뒤집힌 장수 (JS→Rust)\n');
  console.log('| n · 층 | 낮은 입 0.15 | 수평 |\n|---|---|---|');
  for (const n of [14, 20]) for (const L of ['top', '3', 'mid', 'low3']) console.log(`| ${n} · ${L} | ${pair('mouthmap', `n=${n}|layer=${L}|mouth=0.15|r=0.9`, 'flips', 2)} | ${pair('mouthmap', `n=${n}|layer=${L}|mouth=follow|r=0.9`, 'flips', 2)} |`);
}

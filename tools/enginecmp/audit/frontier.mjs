// audit/frontier.mjs — 모든 B 원자료에서 두께별로 '서기(settle 뒤 높이/명목, 20장↑ 최소) × 5 s 안 완전 멈춤(<0.08) 판 수' 를 엔진 무리별로 모아 앞선 줄(파레토)을 뽑는다.
//   node audit/frontier.mjs [두께=0.055] [--all]
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const DATA = new URL('../data/', import.meta.url).pathname;
const h = +(process.argv[2] ?? 0.055), all = process.argv.includes('--all');
const fam = (name, meta) => /^R21/.test(name) ? 'Rapier JS 0.21' : /^R36/.test(name) ? 'Rapier 0.36 (앱)' : /^R-/.test(name) ? 'Rapier JS 0.12 (게임)' : /^sim\.js/.test(name) ? 'sim.js' : /^J-/.test(name) ? 'Jolt 5.6 CPD' : '?';
const rows = new Map();
for (const f of readdirSync(DATA).filter((f) => /^cmp-.*\.json\.gz$/.test(f))) {
  const d = JSON.parse(gunzipSync(readFileSync(DATA + f)));
  if (d.kind !== 'shot' || (d.props && Object.keys(d.props).length)) continue; // 반발 바꾼 판은 따로
  if (/repro/.test(f)) continue;
  for (const r of d.rows) {
    const ts = r.trials.filter((t) => t.h === h);
    if (!ts.length) continue;
    const key = r.name + (/-oos/.test(f) ? ' (새 시드)' : '');
    const big = ts.filter((t) => t.n >= 20);
    const k = { quiet: 0, late: 0, cap: 0 }; for (const t of ts) if (t.judge?.kind in k) k[t.judge.kind]++;
    const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
    rows.set(key + '|' + f, { name: key, file: f, fam: fam(r.name), n: ts.length, hMin: Math.min(...big.map((t) => t.heightRatio)), hMean: big.reduce((s, t) => s + t.heightRatio, 0) / big.length, stop: ts.filter((t) => t.rest08 != null && t.rest08 <= 600).length, cap: k.cap, judgeMed: med(ts.map((t) => t.judge?.steps)) / 120, flips: ts.reduce((s, t) => s + (t.judge?.flipped ?? 0), 0) / ts.length });
  }
}
const list = [...rows.values()];
const front = list.filter((a) => !list.some((b) => b.fam === a.fam && b !== a && b.hMin >= a.hMin && b.stop >= a.stop && (b.hMin > a.hMin || b.stop > a.stop)));
const show = (all ? list : front).sort((a, b) => a.fam.localeCompare(b.fam) || b.hMin - a.hMin);
console.log(`두께 ${h}: 설정 ${list.length}개 (${[...new Set(list.map((x) => x.fam))].map((f) => `${f} ${list.filter((x) => x.fam === f).length}`).join(' · ')})${all ? '' : ' → 무리별 앞선 줄만'}`);
console.log('| 무리 | 설정 | 높이/명목 20장↑ 최소 · 평균 | 5 s 안 완전 멈춤 | 판정 상한 | 판정 중앙 | 뒤집힘 평균 | 원자료 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of show) console.log(`| ${r.fam} | ${r.name} | ${r.hMin.toFixed(3)} · ${r.hMean.toFixed(3)} | ${r.stop}/${r.n} | ${r.cap} | ${r.judgeMed.toFixed(2)} s | ${r.flips.toFixed(1)} | ${r.file.replace(/^cmp-|\.json\.gz$/g, '')} |`);
const both = list.filter((r) => r.hMin >= 0.9 && r.stop >= 0.75 * r.n);
console.log(`\n'서기(최소 ≥ 0.9) + 멈춤(≥ 75%)' 을 함께 만족: ${both.length ? both.map((r) => `${r.name}(${r.fam}) ${r.hMin.toFixed(3)}·${r.stop}/${r.n}`).join(', ') : '없음'}`);
for (const f of [...new Set(list.map((x) => x.fam))]) { const s = list.filter((x) => x.fam === f && x.hMin >= 0.9); console.log(`  ${f}: 서는 설정 ${s.length}개 중 멈춤 최대 ${s.length ? Math.max(...s.map((x) => x.stop)) : '—'}/48`); }

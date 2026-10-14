// ana2.mjs out_p2.jsonl — (n, q) 마다 시작 t0 × 속도 w 표 (A4 / A8), 고정 D0.6 대비. 칸 = 평균 뒤집힘(원 밖)
import { readFileSync } from 'node:fs';
import { pairedRatio } from './stats.mjs';
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const M = new Map();
for (const r of rows) { const k = `${r.key}|n${r.n}`; if (!M.has(k)) M.set(k, new Map()); M.get(k).set(r.seed, r); }
const mean = (m, f = (r) => r.flip) => { const a = [...m.values()]; return a.reduce((s, r) => s + f(r), 0) / a.length; };
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
for (const n of [10, 20, 30]) {
  console.log(`\n######## n${n}  고정 숨(시드 101~116): ` + [0.45, 0.6, 1.0].map((D) => `D${D}: ` + [0.55, 0.7, 0.85, 0.93].map((q) => { const m = M.get(`p2|D${D}|q${q}|A0|w0|t0|n${n}`); return m ? `q${q} ${mean(m).toFixed(1)}(${mean(m, (r) => r.out).toFixed(1)})` : ''; }).join(' ')).join(' | '));
  for (const q of [0.55, 0.7, 0.85]) {
    const base = M.get(`p2|D0.6|q${q}|A0|w0|t0|n${n}`);
    console.log(`  -- q${q}, D0.6 고정 ${mean(base).toFixed(2)} (원 밖 ${mean(base, (r) => r.out).toFixed(1)}, 통째 ${(100 * mean(base, (r) => r.whole)).toFixed(0)}%)`);
    for (const A of [4, 8]) {
      console.log(`     A${A}  t0\\w   w15            w40            w120`);
      for (const t0 of [0.1, 0.2, 0.3, 0.4]) {
        const cells = [15, 40, 120].map((w) => {
          const m = M.get(`p2|D0.6|q${q}|A${A}|w${w}|t${t0}|n${n}`);
          if (!m) return '-';
          const seeds = [...base.keys()].filter((s) => m.has(s));
          const pr = pairedRatio(seeds.map((s) => base.get(s).flip), seeds.map((s) => m.get(s).flip), 1000);
          return `${pr.my.toFixed(1)}(${mean(m, (r) => r.out).toFixed(1)}) ×${f2(pr.r)}${pr.lo > 1 ? '+' : pr.hi < 1 ? '−' : ' '}`;
        });
        console.log(`          ${t0.toFixed(1)}   ${cells.map((c) => c.padEnd(15)).join('')}`);
      }
    }
  }
}

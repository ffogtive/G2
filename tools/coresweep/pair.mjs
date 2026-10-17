// pair.mjs file keyA keyB [n...] — 같은 시드 짝 비교
import { readFileSync } from 'node:fs';
import { pairedRatio } from './stats.mjs';
const [f, A, B, ...ns] = process.argv.slice(2);
const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const files = f.split(',');
for (const n of ns.map(Number)) {
  const a = new Map(), b = new Map();
  for (const r of rows) if (r.n === n) { if (r.key === A) a.set(r.seed, r); if (r.key === B) b.set(r.seed, r); }
  const s = [...a.keys()].filter((x) => b.has(x));
  const pr = pairedRatio(s.map((x) => a.get(x).flip), s.map((x) => b.get(x).flip));
  console.log(`n${n} ${B} ÷ ${A}: ${pr.my.toFixed(2)} / ${pr.mx.toFixed(2)} = ${pr.r.toFixed(2)} [${pr.lo.toFixed(2)}, ${pr.hi.toFixed(2)}]  차 ${pr.d.toFixed(2)} [${pr.dlo.toFixed(2)}, ${pr.dhi.toFixed(2)}]  N${s.length}`);
}

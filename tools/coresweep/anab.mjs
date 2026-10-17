// anab.mjs out.jsonl 기준키접두 [비교키정규식] — n 마다 팔별 평균·원 밖·통째, 기준 대비 짝 비 [95%], 차 [95%]
// 기준키는 같은 '그룹'(키의 둘째·셋째 칸) 안에서 BASE 로 끝나는 키. BASE 환경변수(기본 'fixLow')
import { readFileSync } from 'node:fs';
import { pairedRatio } from './stats.mjs';
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const BASE = process.env.BASE || 'fixLow';
const GRP = +(process.env.GRP ?? 3); // 키 앞 몇 칸이 그룹인가
const M = new Map();
for (const r of rows) { const k = `${r.key}`; const kk = `n${r.n}|${k}`; if (!M.has(kk)) M.set(kk, new Map()); M.get(kk).set(r.seed, r); }
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const mean = (m, f) => { const a = [...m.values()]; return a.reduce((s, r) => s + f(r), 0) / a.length; };
const keys = [...M.keys()].sort((a, b) => +a.split('|')[0].slice(1) - +b.split('|')[0].slice(1) || a.localeCompare(b, undefined, { numeric: true }));
let last = '';
for (const kk of keys) {
  const [nk, ...rest] = kk.split('|');
  const grp = rest.slice(0, GRP - 1).join('|');
  const baseKey = process.env.BASEKEY ? `${nk}|${process.env.BASEKEY}` : [...M.keys()].find((x) => x.startsWith(`${nk}|${grp}|`) && x.endsWith(BASE));
  if (`${nk}|${grp}` !== last) { last = `${nk}|${grp}`; console.log(`\n== ${nk} ${grp}   (기준 ${baseKey ? baseKey.split('|').slice(1).join('|') : '-'})`); }
  const m = M.get(kk);
  let s = `  ${rest.join('|').padEnd(34)} ${mean(m, (r) => r.flip).toFixed(2).padStart(6)}장  원밖 ${mean(m, (r) => r.out).toFixed(1).padStart(4)}  통째 ${(100 * mean(m, (r) => r.whole)).toFixed(0).padStart(3)}%  0장 ${(100 * mean(m, (r) => (r.flip === 0 ? 1 : 0))).toFixed(0).padStart(3)}%  N${m.size}`;
  if (baseKey && baseKey !== kk) {
    const B = M.get(baseKey);
    const seeds = [...m.keys()].filter((x) => B.has(x));
    const pr = pairedRatio(seeds.map((x) => B.get(x).flip), seeds.map((x) => m.get(x).flip));
    s += `   비 ${f2(pr.r)} [${f2(pr.lo)}, ${f2(pr.hi)}]  차 ${pr.d >= 0 ? '+' : ''}${pr.d.toFixed(2)} [${pr.dlo.toFixed(2)}, ${pr.dhi.toFixed(2)}]`;
  }
  console.log(s);
}

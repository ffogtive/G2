// 고정 숨에서 더미가 언제 기울고 되돌아오는가 (반동 a 진단) — 위 절반·아래 절반 평균 기울기(0 = 그대로, 180 = 뒤집힘)
import * as L from './lib.mjs';
await L.SW.initPhysics();
const [n, q, D] = [+(process.argv[2] || 30), +(process.argv[3] || 0.7), +(process.argv[4] || 0.6)];
const sweep = process.argv[5] ? JSON.parse(process.argv[5]) : {};
const S = 8, acc = new Map();
for (let s = 101; s <= 100 + S; s++) {
  const r = L.shot({ n, seed: s, breath: { kind: 'pueok', D }, q, kin: 'c', sweep, trace: true });
  for (const [t, , tb, tt] of r.series) { const k = Math.round(t * 20) / 20; if (!acc.has(k)) acc.set(k, [0, 0, 0]); const a = acc.get(k); a[0] += tb; a[1] += tt; a[2]++; }
}
const ks = [...acc.keys()].sort((a, b) => a - b).filter((k) => k <= 1.6);
console.log(`n${n} q${q} D${D} ${JSON.stringify(sweep)}  t: 아래절반/위절반 평균 기울기(°)`);
console.log(ks.filter((k, i) => i % 2 === 0).map((k) => { const a = acc.get(k); return `${k.toFixed(2)}:${(a[0] / a[2]).toFixed(0)}/${(a[1] / a[2]).toFixed(0)}`; }).join('  '));

// audit/cmphash.mjs — 다시 돌린 원자료가 커밋된 원자료와 settle·판정·끝 해시까지 같은지
//   node audit/cmphash.mjs data/cmp-<새>.json.gz data/cmp-B.json.gz [더 …]
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
const L = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString());
const [mine, ...refs] = process.argv.slice(2);
const a = L(mine); const R = refs.map(L);
let same = 0, tot = 0, miss = 0;
for (const row of a.rows) for (const t of row.trials) {
  let ref = null;
  for (const d of R) for (const r of d.rows) if (r.name === row.name) for (const u of r.trials) if (u.n === t.n && u.h === t.h && u.seed === t.seed) ref = u;
  if (!ref) { miss++; continue; }
  tot++;
  const eq = ref.settleHash === t.settleHash && ref.judge?.hash === t.judge?.hash && ref.end?.hash === t.end?.hash;
  if (eq) same++;
  else console.log('다름', row.name, t.n, t.h, t.seed, ref.judge?.hash, t.judge?.hash);
}
console.log(`같음 ${same}/${tot} (원자료 없음 ${miss})`);

// summarize.mjs — tune-jolt 결과(json 여러 개)를 '설정 × 두께' 로 묶어 표로
//   node summarize.mjs data/tune-stage2.json.gz data/tune-final-a.json.gz [--only 'R v1|R thin|jolt-fair|jolt-1x']   (.json 도 됨)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const load = (f) => JSON.parse((f.endsWith('.gz') ? gunzipSync(readFileSync(f)) : readFileSync(f)).toString('utf8'));
const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--only');
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? process.argv[oi + 1].split('|') : null;
const R = files.flatMap(load);
const groups = new Map();
for (const r of R) {
  if (only && !only.some((o) => r.name.startsWith(o))) continue;
  const key = `${r.name} | h${r.h}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log('| 설정 | 두께 | 판 수 | 더미 높이/명목 평균(최소) | 가라앉힘 정지 | 쏜 뒤 판정 멈춤/느슨/상한 | 끝 속도 중앙 | 뒤집힘 평균 | 원 밖 평균 | ms/스텝 가라앉힘·샷 (WASM, 참고) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [k, a] of groups) {
  const [name, h] = k.split(' | ');
  const kinds = { quiet: 0, late: 0, cap: 0 }; a.forEach((r) => kinds[r.shot.judgeKind]++);
  const es = a.map((r) => r.shot.endSpeed).sort((x, y) => x - y);
  console.log(`| ${name} | ${h.slice(1)} | ${a.length} | ${avg(a.map((r) => r.settle.heightRatio)).toFixed(3)} (${Math.min(...a.map((r) => r.settle.heightRatio)).toFixed(3)}) | ${a.filter((r) => r.settle.quietStep != null).length}/${a.length} | ${kinds.quiet}/${kinds.late}/${kinds.cap} | ${es[es.length >> 1].toFixed(3)} | ${avg(a.map((r) => r.shot.flipped)).toFixed(1)} | ${avg(a.map((r) => r.shot.outs)).toFixed(1)} | ${avg(a.map((r) => r.settle.msPerStep)).toFixed(2)} · ${avg(a.map((r) => r.shot.msPerStep)).toFixed(2)} |`);
}

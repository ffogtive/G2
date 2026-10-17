// native/puffthin/tojson.mjs <출력 폴더> — run-grid.sh 의 JSONL → data/cmp-r36B.json.gz (compare.mjs 원자료와 같은 모양, cmpsum 이 읽음)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { loadavg, cpus } from 'node:os';
const dir = process.argv[2];
const HERE = new URL('.', import.meta.url).pathname;
const grid = readFileSync(HERE + 'grid.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [name, preset, tune, extra, h] = l.split(';'); return { name, preset, tune, extra, h }; });
const rows = [];
for (const g of grid) {
  const f = `${dir}/${g.name}-${g.h}.jsonl`;
  if (!existsSync(f)) { console.log('없음', f); continue; }
  const trials = readFileSync(f, 'utf8').trim().split('\n').map((l) => ({ ...JSON.parse(l), name: g.name }));
  let row = rows.find((r) => r.name === g.name);
  if (!row) { row = { name: g.name, cfg: { engine: 'rapier-0.36-native', preset: g.preset, tune: g.tune, extra: g.extra }, trials: [] }; rows.push(row); }
  row.trials.push(...trials);
}
const meta = { date: new Date().toISOString(), load: loadavg().map((x) => +x.toFixed(2)), cpus: cpus().length, jolt: '—', engine: 'rapier3d 0.36.0 enhanced-determinism, native x86_64 — native/puffthin(= native/puff_sim 복사본, 두께만 PUFF_DISC_H) + bthin' };
writeFileSync(HERE + '../../data/cmp-r36B.json.gz', gzipSync(JSON.stringify({ meta, kind: 'shot', props: {}, rows })));
console.log(rows.length, '설정', rows.reduce((s, r) => s + r.trials.length, 0), '판');

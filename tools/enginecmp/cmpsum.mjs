// cmpsum.mjs — compare.mjs 원자료(data/cmp-*.json.gz) → 마크다운 표 (data/cmp-summary.md 에 쓰고 화면에도)
//   node cmpsum.mjs A B [B2 …]   (첫 인자 = 쌓기 태그(쉼표로 여럿), 나머지 = 샷 태그. 없는 파일은 건너뜀)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const DATA = new URL('./data/', import.meta.url).pathname;
const load = (t) => (existsSync(DATA + `cmp-${t}.json.gz`) ? JSON.parse(gunzipSync(readFileSync(DATA + `cmp-${t}.json.gz`))) : null);
const f = (x, d = 2) => (x == null || Number.isNaN(+x) ? '—' : (+x).toFixed(d));
const mean = (a) => { const s = a.filter((x) => x != null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const sd = (a) => { const m = mean(a); return m == null ? null : Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const groupBy = (a, k) => { const m = new Map(); for (const x of a) { const v = k(x); if (!m.has(v)) m.set(v, []); m.get(v).push(x); } return m; };
const out = [];
const P = (s = '') => { out.push(s); console.log(s); };

const [aTags, ...bTags] = process.argv.slice(2);
for (const aTag of (aTags ?? '').split(',').filter(Boolean)) {
  const A = load(aTag);
  if (!A) continue;
  P(`## A. 쌓기·가라앉힘 (${aTag}: ${A.meta.date.slice(0, 16)}, 부하 ${A.meta.load.join('/')}, Jolt ${A.meta.jolt}, Rapier ${A.meta.rapier ?? '0.12.0'})`);
  P('');
  const all = A.rows.flatMap((r) => r.trials);
  const uniq = (k) => [...new Set(all.map((t) => t[k]))].sort((a, b) => a - b);
  P(`판 = 두께 {${uniq('h').join(',')}} × 장수 {${uniq('n').join(',')}} × 시드 {${uniq('seed').join(',')}}, 5 s(600스텝). 쉼 = 그 뒤 끝까지 최대 속도 < 0.02 u/s. 떨림 = 마지막 1초 최대 속도. 무너짐 = 기울기 > 10° 또는 중심에서 0.5 u 넘게 벗어난 딱지가 있는 판.`);
  P('');
  P('| 설정 | 두께 | 높이/명목 (20장↑ 최소 · 평균) | 30장 한 장 몫 | 맨 아래 묻힘 최대 | 쉼 판 수 · 가장 늦은 쉼 | 떨림 남은 판 (최대 u/s) | 잠 | 무너짐 | ms/스텝 45장 |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of A.rows) {
    for (const [h, ts] of groupBy(row.trials, (t) => t.h)) {
      const big = ts.filter((t) => t.n >= 20);
      const rested = ts.filter((t) => t.rest02 != null);
      const jit = ts.filter((t) => t.jitterMax > 0.02);
      const col = ts.filter((t) => t.maxTilt > 10 || t.maxOff > 0.5);
      const s30 = mean(ts.filter((t) => t.n === 30).map((t) => t.spacing));
      P(`| ${row.name} | ${h} | ${f(Math.min(...big.map((t) => t.heightRatio)), 3)} · ${f(mean(big.map((t) => t.heightRatio)), 3)} | ${f(s30, 4)} | ${f(Math.max(...ts.map((t) => t.floorPen)), 3)} | ${rested.length}/${ts.length} · ${rested.length === ts.length ? f(Math.max(...ts.map((t) => t.rest02)) / 120, 2) + ' s' : '>5 s'} | ${jit.length} (${f(Math.max(0, ...jit.map((t) => t.jitterMax)), 2)}) | ${ts.reduce((s, t) => s + t.sleeping, 0)}/${ts.reduce((s, t) => s + t.n, 0)} | ${col.length} | ${f(mean(ts.filter((t) => t.n === 45).map((t) => t.msStep)), 2)} |`);
    }
  }
  P('');
}

for (const tag of bTags) {
  const B = load(tag);
  if (!B) continue;
  P(`## B. 쏜 뒤 (${tag}: ${B.meta.date.slice(0, 16)}, 부하 ${B.meta.load.join('/')}, Jolt ${B.meta.jolt}, Rapier ${B.meta.rapier ?? '0.12.0'}${B.props && Object.keys(B.props).length ? ', 딱지 ' + JSON.stringify(B.props) : ''})`);
  P('');
  const allB = B.rows.flatMap((r) => r.trials);
  const uniqB = (k) => [...new Set(allB.map((t) => t[k]))].sort((a, b) => a - b);
  P(`판 = 두께 {${uniqB('h').join(',')}} × 장수 {${uniqB('n').join(',')}} × 시드 {${uniqB('seed').join(',')}} → 게임 settle → 표준 초록 숨(위에서 3장째, 가운데, 세기 0.95) → 게임 판정(stepJudge) → 6 s 까지 더 돌림.`);
  P('판정: 멈춤 = <0.08 u/s 로 판정 / 느슨 = 2.5 s 뒤 <0.5 u/s 로 판정(아직 움직임) / 상한 = 5 s. 완전 멈춤 = 그 뒤 6 s 끝까지 <0.02 u/s.');
  P('');
  P('| 설정 | 두께 | 판정 멈춤/느슨/상한 | 판정 시각 중앙 | 5 s 안 <0.08 | 6 s 안 <0.02 (중앙 시각) | 5 s 속도 중앙 · 최대 | 3→6 s 이동 중앙 · 최대 | 판정 뒤 결과 바뀜 | 뒤집힘 평균 | 원 밖 평균 | 잠(6 s) | ms/스텝 |');
  P('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of B.rows) {
    for (const [h, ts] of groupBy(row.trials, (t) => t.h)) {
      const k = { quiet: 0, late: 0, cap: 0 };
      for (const t of ts) if (t.judge?.kind in k) k[t.judge.kind]++;
      const kinds = ts[0].judge?.kind === '?' ? '—' : `${k.quiet}/${k.late}/${k.cap}`;
      const r08 = ts.filter((t) => t.rest08 != null && t.rest08 <= 600).length;
      const r02 = ts.filter((t) => t.rest02 != null);
      const changed = ts.filter((t) => t.judge && (t.judge.flipped !== t.end.flipped || t.judge.outs !== t.end.outs)).length;
      P(`| ${row.name} | ${h} | ${kinds} | ${f(med(ts.map((t) => t.judge?.steps)) / 120, 2)} s | ${r08}/${ts.length} | ${r02.length}/${ts.length} (${f(med(r02.map((t) => t.rest02)) / 120, 2)} s) | ${f(med(ts.map((t) => t.v5s)), 3)} · ${f(Math.max(...ts.map((t) => t.v5s)), 3)} | ${f(med(ts.map((t) => t.drift3to6)), 3)} · ${f(Math.max(...ts.map((t) => t.drift3to6)), 3)} | ${changed}/${ts.length} | ${f(mean(ts.map((t) => t.judge?.flipped)), 1)} | ${f(mean(ts.map((t) => t.judge?.outs)), 1)} | ${ts.reduce((s, t) => s + (t.sleeping ?? 0), 0)}/${ts.reduce((s, t) => s + t.n, 0)} | ${f(mean(ts.map((t) => t.msPost)), 2)} |`);
    }
  }
  P('');
  P(`### B 분포 (${tag}): 장수별 뒤집힘·원 밖 평균 ± 표준편차 [최소~최대]`);
  P('');
  const hs = [...new Set(B.rows.flatMap((r) => r.trials.map((t) => t.h)))];
  for (const h of hs) {
    const ns = [...new Set(B.rows.flatMap((r) => r.trials.filter((t) => t.h === h).map((t) => t.n)))].sort((a, b) => a - b);
    P(`두께 ${h}`);
    P('');
    P(`| 설정 | ${ns.map((n) => `${n}장 뒤집힘`).join(' | ')} | ${ns.map((n) => `${n}장 원 밖`).join(' | ')} |`);
    P(`|---|${ns.map(() => '---').join('|')}|${ns.map(() => '---').join('|')}|`);
    for (const row of B.rows) {
      const cells = (key) => ns.map((n) => { const v = row.trials.filter((t) => t.h === h && t.n === n).map((t) => t.judge?.[key]); return v.length ? `${f(mean(v), 1)}±${f(sd(v), 1)} [${Math.min(...v)}~${Math.max(...v)}]` : '—'; });
      if (!row.trials.some((t) => t.h === h)) continue;
      P(`| ${row.name} | ${cells('flipped').join(' | ')} | ${cells('outs').join(' | ')} |`);
    }
    P('');
  }
}
writeFileSync(DATA + 'cmp-summary.md', out.join('\n') + '\n');

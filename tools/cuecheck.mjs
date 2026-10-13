// cuecheck.mjs — 공략 단서(cues.js)가 물리 실측·규칙과 맞는지 (5차). 사용: node tools/cuecheck.mjs
import { readFileSync, existsSync } from 'node:fs';
import { tideDiscs, tideFill, idealWindow, classifyShot, BRIM } from '../mockup/src/cues.js';
import { sweetHiFor } from '../mockup/src/rules.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } else console.log('✓', m); };
// 1) 물결 = sweetHiFor 의 역함수, 0.9·hi 에서 정확히 꼭대기
let maxErr = 0, maxFill = 0;
for (let n = 1; n <= 24; n++) { maxErr = Math.max(maxErr, Math.abs(tideDiscs(sweetHiFor(n)) - n)); maxFill = Math.max(maxFill, Math.abs(tideFill(BRIM * sweetHiFor(n), n) - 1)); }
ok(maxErr < 1e-9, `tideDiscs(sweetHiFor(n)) == n (최대 오차 ${maxErr.toExponential(1)})`);
ok(maxFill < 1e-9, `tideFill(0.9·hi, n) == 1 (최대 오차 ${maxFill.toExponential(1)})`);
for (const n of [3, 12, 24]) console.log(`   n=${n}: 0.6배 ${tideFill(0.6 * sweetHiFor(n), n).toFixed(2)} / 0.78배 ${tideFill(0.78 * sweetHiFor(n), n).toFixed(2)} / 1.0배 ${tideFill(sweetHiFor(n), n).toFixed(2)}`);
// 2) 높이 창이 atlas 실측에서 창 밖보다 낫다 (가운데·초록)
for (const n of [6, 12, 20]) {
  const f = `tools/scratch/atlas/a${n}.json`;
  if (!existsSync(f)) { console.log(`- atlas a${n}.json 없음(건너뜀)`); continue; }
  const cells = JSON.parse(readFileSync(f, 'utf8')).filter((c) => c.r === 0.9 && c.lat === 0);
  const w = idealWindow(n, 'flip');
  const inW = cells.filter((c) => { const k = Math.max(1, Math.round((1 - c.hf) * n + 0.5)); return k >= w[0] && k <= w[1]; });
  const outW = cells.filter((c) => !inW.includes(c));
  const avg = (a) => a.reduce((s, c) => s + c.mean, 0) / Math.max(1, a.length);
  ok(inW.length === 0 || avg(inW) >= avg(outW), `n=${n} 창[${w}] 안 평균 ${avg(inW).toFixed(1)} ≥ 밖 ${avg(outW).toFixed(1)}${inW.length ? '' : ' (창에 든 칸 없음)'}`);
}
// 3) ★ 부호: 칸이 오른쪽(pocketLatSign=+1)인데 왼쪽(lat<0)을 불었으면 지적 없음, 오른쪽을 불었으면 'side'
ok(classifyShot({ n: 12, k: 4, ratio: 0.9, lat: -0.8, flips: 2, outs: 0, type: 'goldenSide', pocketLatSign: 1, pocketOk: false }) === null, '★오른쪽 + 왼쪽 옆 조준 → 옆 지적 없음');
ok(classifyShot({ n: 12, k: 4, ratio: 0.9, lat: 0.8, flips: 2, outs: 0, type: 'goldenSide', pocketLatSign: 1, pocketOk: false }) === 'side', '★오른쪽 + 오른쪽 옆 조준 → side');
ok(classifyShot({ n: 12, k: 3, ratio: 0.5, lat: 0, flips: 0, outs: 0, type: 'flip' }) === 'breath', '약한 숨 → breath');
ok(classifyShot({ n: 12, k: 9, ratio: 0.9, lat: 0, flips: 1, outs: 0, type: 'flip' }) === 'height', '너무 아래 → height');
ok(classifyShot({ n: 12, k: 9, ratio: 0.9, lat: 0, flips: 8, outs: 0, type: 'flip' }) === null, '절반 이상 넘겼으면 지적 없음');
console.log(fail ? `실패 ${fail}` : '모두 통과');
process.exit(fail ? 1 : 0);

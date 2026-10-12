// levelbot.mjs — 물리 봇으로 레벨 클리어율 측정 (King 식 봇 플레이테스트의 축소판)
// 사용: node tools/levelbot.mjs [시작=1] [끝=40] [판당 시도=20] [봇=learner]
import { initPhysics, clearRate, BOTS } from './botlib.mjs';
import { levelSpec } from '../mockup/src/levels.js';
await initPhysics();
const [from = 1, to = 40, tries = 20, botName = 'learner'] = process.argv.slice(2);
const rows = [];
for (let n = +from; n <= +to; n++) {
  const spec = levelSpec(n);
  const rate = clearRate(spec, +tries, BOTS[botName], 99991);
  const goal = spec.type === 'flip' ? `flip ${spec.target}/${spec.N} in ${spec.puffs}` : spec.type === 'golden' ? `golden@${spec.goldenDepth} N${spec.N} in ${spec.puffs}` : `rival ${spec.rival} x${spec.stake} skill${spec.aiSkill}`;
  rows.push({ n, tier: spec.tier, role: spec.role, want: spec.rate, rate });
  console.log(`${String(n).padStart(3)} ${spec.role.padEnd(9)} ${spec.tier.padEnd(9)} ${goal.padEnd(32)} want ${(spec.rate * 100).toFixed(0).padStart(3)}%  got ${(rate * 100).toFixed(0).padStart(3)}% ${'#'.repeat(Math.round(rate * 20))}`);
}
const by = {};
for (const r of rows) (by[r.role] = by[r.role] || []).push([r.want, r.rate]);
console.log('ROLE MEANS (want→got)', JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, `${(v.reduce((a, b) => a + b[0], 0) / v.length).toFixed(2)}→${(v.reduce((a, b) => a + b[1], 0) / v.length).toFixed(2)}`]))));

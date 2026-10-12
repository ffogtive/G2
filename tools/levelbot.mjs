// levelbot.mjs — 물리 봇으로 레벨 클리어율 측정 (King 식 봇 플레이테스트의 축소판)
// 사용: node tools/levelbot.mjs [시작=1] [끝=40] [판당 시도=20] [봇=typical]
//  봇 typical: 맨 위 근처 조준, 더미 양에 맞는 숨(±8%) — '감 잡은 보통 플레이어'
//  목표 곡선(가설): normal 70~85% / hard 40~55% / superhard 25~35% / relief 90%+
import { initPhysics, Table, DISC_H } from '../mockup/src/sim.js';
import { levelSpec } from '../mockup/src/levels.js';
import { sweetHiFor, resolveShot, gauss } from '../mockup/src/rules.js';

await initPhysics();
const [from = 1, to = 40, tries = 20, botName = 'typical'] = process.argv.slice(2);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const BOTS = {
  typical: { hMean: 0.86, hSd: 0.08, latSd: 0.25, pMean: 0.95, pSd: 0.08 },
  novice: { hMean: 0.6, hSd: 0.25, latSd: 0.5, pMean: 0.9, pSd: 0.25 },
  expert: { hMean: 0.9, hSd: 0.04, latSd: 0.12, pMean: 0.97, pSd: 0.04 },
};
const bot = BOTS[botName];

// 한 번 불기: 플레이어 정책 → 규칙 → 물리 (main.js 의 shotGeometry 와 같은 기하: 접평면 x=-R, 방향 +x)
function puff(t, rng, pol, aimH) {
  const n = t.liveDiscs().length;
  const top = t.columnTop();
  const raw = {
    lat: gauss(rng) * pol.latSd,
    h: clamp(aimH ?? top * clamp(pol.hMean + gauss(rng) * pol.hSd, 0.03, 1), 0.03, top),
    power: sweetHiFor(n) * clamp(pol.pMean + gauss(rng) * pol.pSd, 0.2, 1.3),
  };
  const s = resolveShot(raw, n, top, rng, 1);
  const c = t.pileCenter();
  t.blow({ aim: { x: c.x - 1, y: s.h, z: c.z + s.lat }, dir: { x: 1, z: 0 }, power: s.power });
  const flipped = t.runUntilSettled(4).flipped;
  for (const d of flipped) t.remove(d);
  return flipped;
}

function buildTable(spec, rng) {
  const ids = Array.from({ length: spec.N }, (_, i) => 'c' + i);
  let goldenIdx = -1;
  if (spec.type === 'golden') { goldenIdx = Math.round((1 - spec.goldenDepth) * (spec.N - 1)); ids[goldenIdx] = 'golden'; }
  const heavy = new Set();
  while (heavy.size < Math.min(spec.heavy || 0, spec.N - 1)) { const i = Math.floor(rng() * spec.N); if (i !== goldenIdx) heavy.add(i); }
  const t = new Table(spec.seed >>> 0);
  t.addPile(ids, { heavy });
  t.settle();
  return t;
}

function playSolo(spec, rng) {
  const t = buildTable(spec, rng);
  let flipped = 0, golden = false, puffs = spec.puffs;
  while (puffs > 0) {
    let aimH;
    if (spec.type === 'golden') {
      const g = t.liveDiscs().find((d) => d.cardId === 'golden');
      if (g) aimH = clamp(g.body.translation().y - DISC_H * 0.3 + gauss(rng) * bot.hSd * 0.5, 0.03, t.columnTop());
    }
    const f = puff(t, rng, bot, aimH);
    puffs--;
    flipped += f.length;
    if (f.some((d) => d.cardId === 'golden')) golden = true;
    if ((spec.type === 'flip' && flipped >= spec.target) || golden || !t.liveDiscs().length) break;
    t.restack();
    t.settle(240);
  }
  return spec.type === 'flip' ? flipped >= spec.target : golden;
}

function playRival(spec, rng) {
  const t = buildTable(spec, rng);
  const ai = { hMean: 0.68, hSd: 0.17 / spec.aiSkill, latSd: 0.35 / spec.aiSkill, pMean: 0.92, pSd: 0.14 / spec.aiSkill };
  let me = 0, them = 0, turn = 0;
  while (t.liveDiscs().length && turn < 18) {
    const f = puff(t, rng, turn % 2 === 0 ? bot : ai);
    if (turn % 2 === 0) me += f.length; else them += f.length;
    turn++;
    if (!t.liveDiscs().length) break;
    t.restack();
    t.settle(240);
  }
  return me > them;
}

const rows = [];
for (let n = +from; n <= +to; n++) {
  const spec = levelSpec(n);
  let win = 0;
  for (let k = 0; k < +tries; k++) {
    const rng = mulberry32((spec.seed ^ (k * 7919 + 13)) >>> 0);
    if (spec.type === 'rival' ? playRival(spec, rng) : playSolo(spec, rng)) win++;
  }
  const rate = win / +tries;
  const goal = spec.type === 'flip' ? `flip ${spec.target}/${spec.N} in ${spec.puffs}` : spec.type === 'golden' ? `golden@${spec.goldenDepth} N${spec.N} in ${spec.puffs}` : `rival ${spec.rival} x${spec.stake} skill${spec.aiSkill}`;
  rows.push({ n, tier: spec.tier, d: spec.d, goal, heavy: spec.heavy, rate });
  console.log(`${String(n).padStart(3)} ${spec.tier.padEnd(9)} d=${spec.d.toFixed(2)} ${goal.padEnd(34)} heavy=${spec.heavy}  clear ${(rate * 100).toFixed(0).padStart(3)}% ${'#'.repeat(Math.round(rate * 20))}`);
}
const by = {};
for (const r of rows) (by[r.tier] = by[r.tier] || []).push(r.rate);
console.log('TIER MEANS', JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)]))));

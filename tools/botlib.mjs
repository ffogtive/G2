// botlib.mjs — 레벨 봇 공용: 플레이어 정책 → rules.js → sim.js (main.js 와 같은 기하·규칙)
import { initPhysics, Table, DISC_H } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot, gauss } from '../mockup/src/rules.js';
export { initPhysics };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 정책: h=조준 높이 비율, p=더미 양에 맞는 숨 대비 비율
export const BOTS = {
  learner: { hMean: 0.82, hSd: 0.12, latSd: 0.3, pMean: 0.95, pSd: 0.15 }, // 보정 기준: 감 익히는 중인 보통 사람
  typical: { hMean: 0.86, hSd: 0.08, latSd: 0.25, pMean: 0.95, pSd: 0.08 },
  novice: { hMean: 0.6, hSd: 0.25, latSd: 0.5, pMean: 0.9, pSd: 0.25 },
  expert: { hMean: 0.9, hSd: 0.04, latSd: 0.12, pMean: 0.97, pSd: 0.04 },
};

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

export function playLevel(spec, rng, bot) {
  const t = buildTable(spec, rng);
  if (spec.type === 'rival') {
    const ai = { hMean: 0.68, hSd: 0.17 / spec.aiSkill, latSd: 0.35 / spec.aiSkill, pMean: 0.92, pSd: 0.14 / spec.aiSkill };
    let me = 0, them = 0, turn = 0;
    while (t.liveDiscs().length && turn < 18) {
      const f = puff(t, rng, turn % 2 === 0 ? bot : ai);
      if (turn % 2 === 0) me += f.length; else them += f.length;
      turn++;
      if (!t.liveDiscs().length) break;
      t.restack(); t.settle(240);
    }
    return me > them;
  }
  let flipped = 0, golden = false, puffs = spec.puffs;
  while (puffs > 0) {
    let aimH;
    if (spec.type === 'golden') {
      const g = t.liveDiscs().find((d) => d.cardId === 'golden');
      if (g) aimH = clamp(g.body.translation().y - DISC_H * 0.3 + gauss(rng) * bot.hSd * 0.6, 0.03, t.columnTop());
    }
    const f = puff(t, rng, bot, aimH);
    puffs--;
    flipped += f.length;
    if (f.some((d) => d.cardId === 'golden')) golden = true;
    if ((spec.type === 'flip' && flipped >= spec.target) || golden || !t.liveDiscs().length) break;
    t.restack(); t.settle(240);
  }
  return spec.type === 'flip' ? flipped >= spec.target : golden;
}

export function clearRate(spec, tries, bot, salt = 0) {
  let win = 0;
  for (let k = 0; k < tries; k++) {
    const rng = mulberry32((spec.seed ^ (k * 7919 + 13 + salt)) >>> 0);
    if (playLevel(spec, rng, bot)) win++;
  }
  return win / tries;
}

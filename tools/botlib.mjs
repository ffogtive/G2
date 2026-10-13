// botlib.mjs — 레벨 봇 공용: 플레이어 정책 → rules.js → sim.js (main.js 와 같은 기하·규칙)
import { initPhysics, Table, DISC_H } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot, gauss, POWER_MAX, pickProtrusion } from '../mockup/src/rules.js';
export { initPhysics };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 정책: h=조준 높이 비율, p=더미 양에 맞는 숨 대비 비율 (초록 구간 0.78~1.0 의 가운데 0.89 를 노린다)
// 4차: 좌우 조준 부활 — latSd = 좌우 오차. seek(삐져나온 딱지 노리기)는 교차 검토에서 이득 없음·역효과로 확인돼 모두 0
export const BOTS = {
  learner: { hMean: 0.82, hSd: 0.12, latSd: 0.25, pMean: 0.89, pSd: 0.15, seek: 0 }, // 보정 기준: 감 익히는 중인 보통 사람(가운데 언저리)
  typical: { hMean: 0.86, hSd: 0.08, latSd: 0.18, pMean: 0.89, pSd: 0.08, seek: 0 },
  novice: { hMean: 0.6, hSd: 0.25, latSd: 0.45, pMean: 0.85, pSd: 0.25, seek: 0 },
  expert: { hMean: 0.9, hSd: 0.04, latSd: 0.1, pMean: 0.9, pSd: 0.04, seek: 0 },
};

// keep(d) 가 true 인 뒤집힌 딱지는 가져가지 않는다(황금 옆으로: ★칸 밖은 무효 → 다시 쌓기)
function puff(t, rng, pol, aimH, aimLat = 0, keep = null) {
  const n = t.liveDiscs().length;
  const top = t.columnTop();
  const tg = aimH == null && pol.seek ? pickProtrusion(t, { x: -1, z: 0 }, pol.seek, rng) : null; // 바람은 +x 로 분다
  const raw = {
    lat: clamp((tg ? tg.lat : aimLat) + gauss(rng) * (pol.latSd ?? 0.25), -0.9, 0.9),
    h: clamp(aimH ?? (tg ? tg.h + gauss(rng) * 0.05 : top * clamp(pol.hMean + gauss(rng) * pol.hSd, 0.03, 1)), 0.03, top),
    power: Math.min(POWER_MAX, sweetHiFor(n) * clamp(pol.pMean + gauss(rng) * pol.pSd, 0.2, 1.3)), // 숨 주머니 벽(POWER_MAX) 너머는 없다
  };
  const s = resolveShot(raw, n, top, rng, 1);
  const c = t.pileCenter();
  // main.js shotGeometry 와 같은 기하: 표적은 원기둥 곡면 위(옆을 노리면 곡면을 따라 뒤로)
  const lat = clamp(s.lat || 0, -0.95, 0.95);
  t.blow({ aim: { x: c.x - Math.sqrt(1 - lat * lat), y: s.h, z: c.z + lat }, dir: { x: 1, z: 0 }, power: s.power, blast: s.blast || 0 });
  let flipped = t.runUntilSettled(4).flipped;
  if (keep) flipped = flipped.filter((d) => !keep(d));
  for (const d of flipped) t.remove(d);
  return flipped;
}

// 황금 옆으로: ★칸 = 분필 원 안에서 옆으로 0.6 이상 (봇 좌표: 바람 +x, 화면 오른쪽 = +z). main.js inPocket 과 같은 규칙
export const POCKET_MIN = 0.6;
export function inPocketBot(t, d, which) {
  if (!t.inCircle(d)) return false;
  const z = d.body.translation().z;
  return (which === 'left' ? -z : z) >= POCKET_MIN;
}

function buildTable(spec, rng) {
  const ids = Array.from({ length: spec.N }, (_, i) => 'c' + i);
  let goldenIdx = -1;
  if (spec.type === 'golden' || spec.type === 'goldenSide') { goldenIdx = Math.round((1 - spec.goldenDepth) * (spec.N - 1)); ids[goldenIdx] = 'golden'; }
  const heavy = new Set();
  while (heavy.size < Math.min(spec.heavy || 0, spec.N - 1)) { const i = Math.floor(rng() * spec.N); if (i !== goldenIdx) heavy.add(i); }
  const t = new Table(spec.seed >>> 0);
  t.addPile(ids, { heavy });
  t.settle();
  return t;
}

// 상대 AI 정책 (main.js aiShot 과 동일): 실력이 오르면 조준 높이도 맨 위 근처로 (고수는 위를 노린다)
export function aiPolicy(skill) {
  return { hMean: 0.68 + 0.18 * clamp((skill - 1) / 1.2, 0, 1), hSd: 0.17 / skill, latSd: 0.3 / skill, pMean: 0.89, pSd: 0.14 / skill, seek: 0 }; // seek 끔(4차 교차 검토)
}

export function playLevel(spec, rng, bot) {
  const t = buildTable(spec, rng);
  if (spec.type === 'rival') {
    const ai = aiPolicy(spec.aiSkill);
    let me = 0, them = 0, turn = 0;
    const aiFirst = spec.role === 'boss' ? 1 : rng() < 0.5 ? 1 : 0; // 보스판은 보스 선공, 라이벌판은 가위바위보 (main.js 와 동일)
    while (t.liveDiscs().length && turn < 18) {
      const mine = (turn + aiFirst) % 2 === 0;
      const f = puff(t, rng, mine ? bot : ai);
      if (mine) me += f.length; else them += f.length;
      turn++;
      if (!t.liveDiscs().length) break;
      t.restack(); t.settle(240);
    }
    return me > them;
  }
  let flipped = 0, golden = false, puffs = spec.puffs;
  const side = spec.type === 'goldenSide';
  // 학습자는 '반대쪽 옆을 분다'를 알고 노리지만 좌우·높이 오차가 있다 (★칸이 오른쪽(+z)이면 왼쪽(−z) 옆을 분다)
  const sideLat = side ? (spec.pocket === 'left' ? 0.75 : -0.75) : 0;
  const keep = side ? (d) => d.cardId === 'golden' && !inPocketBot(t, d, spec.pocket) : null;
  while (puffs > 0) {
    let aimH;
    if (spec.type === 'golden' || side) {
      const g = t.liveDiscs().find((d) => d.cardId === 'golden');
      if (g) aimH = clamp(g.body.translation().y - DISC_H * 0.3 + gauss(rng) * bot.hSd * 0.6, 0.03, t.columnTop());
    }
    const f = puff(t, rng, bot, aimH, sideLat, keep);
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

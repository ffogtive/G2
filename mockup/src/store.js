// store.js — 내 딱지 보관함(로컬 저장). 저장이 막힌 환경에서도 게임은 돈다.
import { CARDS, CARD_BY_ID, rollCard } from './art.js';

const KEY = 'g2-ddakji-profile-v1';

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newProfile() {
  const rng = rngFrom(20261012);
  const inv = {};
  // 시작 딱지 30장: 대부분 일반, 레어 2장 보장
  for (let i = 0; i < 28; i++) {
    const id = rollCard(rng, null);
    const c = CARD_BY_ID[id];
    const pick = c.rarity === 'common' ? id : CARDS.filter((x) => x.rarity === 'common')[Math.floor(rng() * 12)].id;
    inv[pick] = (inv[pick] || 0) + 1;
  }
  inv.kkachi = (inv.kkachi || 0) + 1;
  inv.geobuk = (inv.geobuk || 0) + 1;
  return { v: 1, inv, stats: { matches: 0, wins: 0, bestTurn: 0, totalFlips: 0 }, firstPlay: true, settings: { sound: true, mic: false, lang: null } };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 1 && p.inv) return p;
    }
  } catch (e) { /* 저장소 차단 → 새 프로필 */ }
  return newProfile();
}

export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ }
}

export function total(p) {
  return Object.values(p.inv).reduce((a, b) => a + b, 0);
}

export function ownedKinds(p) {
  return Object.keys(p.inv).filter((k) => p.inv[k] > 0).length;
}

// 판돈 고르기: 중복(2장 이상)부터 → 마지막 한 장은 보호(앨범 보호 규칙). 부족하면 일반 단일까지.
export function pickStake(p, n, rng) {
  const pool = [];
  for (const [id, cnt] of Object.entries(p.inv)) for (let i = 1; i < cnt; i++) pool.push(id);
  const singles = Object.entries(p.inv).filter(([id, cnt]) => cnt >= 1 && CARD_BY_ID[id].rarity === 'common').map(([id]) => id);
  const out = [];
  const shuffled = pool.sort(() => rng() - 0.5);
  while (out.length < n && shuffled.length) out.push(shuffled.pop());
  const s2 = singles.sort(() => rng() - 0.5);
  while (out.length < n && s2.length) out.push(s2.pop());
  return out;
}

export function maxStake(p) {
  let dup = 0;
  for (const cnt of Object.values(p.inv)) dup += Math.max(0, cnt - 1);
  const singlesCommon = Object.entries(p.inv).filter(([id, cnt]) => cnt >= 1 && CARD_BY_ID[id].rarity === 'common').length;
  return dup + singlesCommon;
}

export { rngFrom };

// pvp.js — 친선 대결(3판 1세트)의 규칙·문서 경로·상태 복원. 렌더러 독립(게임과 Node 시험이 같은 코드).
//
// 🧭 가설: 매치 상태 = (매치 문서 + 양쪽 샷 문서)의 순수 함수로 두면, 새로고침·재접속은 '다시 계산'일 뿐이고
//   두 화면의 턴별 상태(남은 딱지·점수·해시 사슬)는 같은 문서에서 같은 값으로 나온다. 판가름 = pvp-check 의 턴별 해시 100%.
//   docs/design/items-pvp.md §2.1 (흐름·재접속·데이터 구조)
import { mulberry32, hash32 } from './sim.js';
import { hashBytes } from './turn.js';

export const GAMES = 3; // 3판 1세트 (단판 선공 승률 ≈70% → 판마다 선공 교대)
export const MAX_TURNS = 18; // 한 판의 숨 상한(솔로와 같음)
export const SHOT_CLOCK = 30; // 초. 넘기면 자동 헛숨(누르고 있었으면 그 숨으로)
export const SIZES = [5, 10, 20]; // 각자 판에 까는 딱지 수
export const other = (s) => (s === 'a' ? 'b' : 'a');

// 문서 경로 (db 경로 문법: 문서 = 짝수 마디)
export const paths = {
  match: (code) => `matches/${code}`,
  seat: (uid, code, seat) => `p/${uid}/m/${code}-${seat}`,
  shots: (uid, code, seat) => `p/${uid}/m/${code}-${seat}/t`,
  shot: (uid, code, seat, key) => `p/${uid}/m/${code}-${seat}/t/${key}`,
  active: (uid) => `data/users/${uid}/pvp`,
};
export const shotKey = (g, t) => `${g}${String(t).padStart(2, '0')}`;
export const parseKey = (k) => ({ g: +k[0], t: +k.slice(1) });

// 선공: 1판 = 가위바위보 승자, 그 뒤로 판마다 교대. 한 판 안에서는 숨마다 교대
export const firstOf = (first, g) => (g % 2 === 0 ? first : other(first));
export const shooterOf = (first, g, t) => (t % 2 === 0 ? firstOf(first, g) : other(firstOf(first, g)));

// 판 = 양쪽 '보여 줄 딱지' 사본을 시드로 섞은 순서. 판 id = 이 배열의 자리
export function makePot(seed, cardsA, cardsB) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const pot = [...cardsA.map((c) => ({ c, s: 'a' })), ...cardsB.map((c) => ({ c, s: 'b' }))];
  for (let i = pot.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pot[i], pot[j]] = [pot[j], pot[i]]; }
  return pot;
}

// 문서들 → 지금 상태. docs: Map(key → 샷 문서). 쏜 자리가 규칙과 다른 문서는 무시
export function replayState(match, docs) {
  const N = match.pot.length, all = Array.from({ length: N }, (_, i) => i);
  const games = [], applied = [];
  let prev = '00000000';
  for (let g = 0; g < GAMES; g++) {
    let live = all.slice();
    const score = { a: 0, b: 0 };
    for (let t = 0; ; t++) {
      if (!live.length || t >= MAX_TURNS) break;
      const key = shotKey(g, t), shooter = shooterOf(match.first, g, t), d = docs.get(key);
      if (!d || d.seat !== shooter) return { g, t, live, score, games, prev, applied, over: false };
      const fl = new Set(d.res.flipped);
      live = live.filter((id) => !fl.has(id));
      score[shooter] += d.res.flipped.length;
      prev = String(d.qhash).slice(0, 8);
      applied.push({ key, g, t, seat: shooter, doc: d, live: live.slice(), score: { ...score } });
    }
    games.push({ ...score });
  }
  return { g: GAMES, t: 0, live: [], score: { a: 0, b: 0 }, games, prev, applied, over: true };
}

// 세트 결과: 이긴 판 수 → 같으면 뒤집은 장수 합 → 같으면 무승부
export function setResult(games) {
  const won = { a: 0, b: 0 }, flips = { a: 0, b: 0 };
  for (const s of games) { flips.a += s.a; flips.b += s.b; if (s.a > s.b) won.a++; else if (s.b > s.a) won.b++; }
  const winner = won.a !== won.b ? (won.a > won.b ? 'a' : 'b') : flips.a !== flips.b ? (flips.a > flips.b ? 'a' : 'b') : null;
  return { won, flips, winner };
}

// 턴 상태 지문(두 화면 비교용): 남은 판 id + 점수 + 표시된 끝 자세 해시
export function stateTag(live, score, qhash) { return `${hash32(live.join(','))}:${score.a}-${score.b}:${qhash}`; }

// ── 가위바위보: 커밋 sha256(hand:nonce16:code:round) → 둘 다 커밋하면 리빌 → 상대 것을 검증 ─────
export const HANDS = ['rock', 'scissors', 'paper'];
export const beats = (x, y) => (x === 'rock' && y === 'scissors') || (x === 'scissors' && y === 'paper') || (x === 'paper' && y === 'rock');
export function randomHex(n = 16) {
  const r = new Uint8Array(Math.ceil(n / 2));
  globalThis.crypto?.getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 256; });
  return [...r].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, n);
}
export async function commitHash(hand, nonce, code, r) {
  const s = `${hand}:${nonce}:${code}:${r}`;
  const bytes = new TextEncoder().encode(s);
  try {
    if (globalThis.crypto?.subtle) {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* 보안 문맥 아님 → 아래 */ }
  return 'h64:' + hashBytes(bytes); // 비보안 문맥 대체(친선 전용)
}
// 3번 비기면 시드 1비트
export const rpsTiebreak = (seed) => ((hash32((seed >>> 0) + '|rps') & 1) ? 'a' : 'b');

// ── 자리 상태(seat state): db 자리 문서가 진실, presence 의 같은 값은 빠른 길. sv 가 큰 쪽을 쓴다 ─────
export function newerSeat(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return (b.sv || 0) > (a.sv || 0) ? b : a;
}

// ── 시험용 자동 플레이(?pvpbot): 학습자 봇 분포(botlib learner: 높이 0.82±0.12, 좌우 ±0.25, 숨 0.89±0.15) ─────
export function botPlan(rng) {
  const g = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  return { hf: clamp(0.82 + g() * 0.12, 0.08, 0.98), lat: clamp(g() * 0.25, -0.85, 0.85), ratio: clamp(0.89 + g() * 0.15, 0.4, 1.25), holdMs: 350 + rng() * 700, thinkMs: 500 + rng() * 900 };
}

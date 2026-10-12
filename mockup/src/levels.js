// levels.js — 레벨 1 ~ 10,000+ 결정론적 생성 규칙 (렌더러 독립 → 봇으로 난이도 측정 가능)
//
// 🧭 가설 (미검증 — 2라운드 리서치로 재조정 예정)
//  - 1만 판을 버티게 하는 건 캐릭터 성장이 아니라 ① 톱니형 난이도(어려운 판 → 쉬운 '안도' 판)
//    ② 주기적인 새 기믹 ③ 맵/동네 진척(메타)이다. (캔디크러시·로얄킹덤에서 배운 구조)
//  - 레벨 = 시드 + 규칙. 같은 번호는 누구에게나 같은 판. 난이도는 물리 봇 성공률로 측정해 곡선에 맞춘다.

export const CHAPTER_LEN = 20;

export const CHAPTERS = [
  { id: 'alley', ko: '골목길', en: 'Back Alley', color: '#7cc46a' },
  { id: 'shop', ko: '문방구 앞', en: 'Corner Shop', color: '#ffb84d' },
  { id: 'playground', ko: '놀이터', en: 'Playground', color: '#5fc8ff' },
  { id: 'school', ko: '학교 운동장', en: 'Schoolyard', color: '#ff8fa8' },
  { id: 'town', ko: '동네 딱지대회', en: 'Town Cup', color: '#b36bff' },
  { id: 'tokyo', ko: '도쿄 멘코 골목', en: 'Tokyo Menko Lane', color: '#ff6b6b' },
  { id: 'la', ko: 'LA 밀크캡 해변', en: 'LA Milk-cap Beach', color: '#4dd0c8' },
  { id: 'cdmx', ko: '멕시코시티 타조 시장', en: 'Mexico City Tazo Market', color: '#ffd23f' },
];

export const RIVALS = [
  { id: 'minsu', ko: '민수', en: 'Minsu', card: 'tteok' },
  { id: 'jiwoo', ko: '지우', en: 'Jiwoo', card: 'tokki' },
  { id: 'boss', ko: '골목대장', en: 'Alley Boss', card: 'horangi' },
  { id: 'grandma', ko: '문방구 할머니', en: 'Shop Grandma', card: 'dokkaebi' },
  { id: 'twins', ko: '쌍둥이', en: 'The Twins', card: 'kkachi' },
  { id: 'champ', ko: '딱지왕', en: 'Ddakji Champ', card: 'king' },
];

// 기믹 도입 스케줄 (처음 등장하는 판에선 소개 카드)
export const INTRO = { 4: 'rival', 6: 'golden', 11: 'heavy' };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 톱니형 난이도: 완만히 오르는 기본선 + 10판 주기의 톱니 (5번째 하드, 10번째 슈퍼하드, 하드 직후 안도)
export function difficulty(n) {
  const base = 0.12 + 0.5 * (1 - Math.exp(-n / 150)) + 0.12 * (1 - Math.exp(-n / 2000));
  const pos = (n - 1) % 10; // 0..9
  const saw = [0, 0.03, 0.06, 0.09, 0.2, -0.08, 0.02, 0.05, 0.09, 0.3][pos];
  const tier = pos === 9 ? 'superhard' : pos === 4 ? 'hard' : pos === 5 ? 'relief' : 'normal';
  return { d: clamp(base + saw, 0.05, 0.98), tier };
}

export function chapterOf(n) {
  const ci = Math.floor((n - 1) / CHAPTER_LEN);
  return { ci, chapter: CHAPTERS[ci % CHAPTERS.length], lap: Math.floor(ci / CHAPTERS.length), idx: ((n - 1) % CHAPTER_LEN) + 1 };
}

export function levelSpec(n) {
  const rng = mulberry32(0x9e3779b1 ^ (n * 2654435761));
  const { d, tier } = difficulty(n);
  const ch = chapterOf(n);
  const unlocked = { rival: n >= 4, golden: n >= 6, heavy: n >= 11 };
  // 목표 종류: 챕터 마지막(20)과 4·14번째는 라이벌, 나머지는 섞기
  let type = 'flip';
  if (n === 4 || (n > 4 && (ch.idx === 20 || ch.idx === 14 || (ch.idx === 4 && n > 20)))) type = 'rival';
  else if (n === 6 || (unlocked.golden && rng() < 0.35)) type = 'golden';
  const N = Math.round(clamp(7 + 15 * d + (rng() - 0.5) * 3, 6, 24));
  const heavy = unlocked.heavy && (n === 11 || rng() < 0.3 + 0.3 * d) ? Math.round(N * (0.12 + 0.3 * d)) : 0;
  const spec = { n, tier, d: +d.toFixed(3), chapter: ch.chapter.id, chapterIdx: ch.ci, idx: ch.idx, type, N, heavy, intro: INTRO[n] || null, seed: (rng() * 2 ** 31) | 0 };
  if (type === 'flip') {
    spec.puffs = d < 0.3 ? 3 : d < 0.55 ? 3 : 2;
    spec.target = Math.max(2, Math.round(N * clamp(0.36 + 0.42 * d, 0.3, 0.85)));
  } else if (type === 'golden') {
    spec.puffs = d < 0.45 ? 3 : 2;
    spec.goldenDepth = +clamp(0.15 + 0.7 * d + (rng() - 0.5) * 0.15, 0.1, 0.9).toFixed(2); // 위에서부터 깊이 비율
  } else {
    const r = RIVALS[(ch.ci + (ch.idx === 20 ? 2 : 0)) % RIVALS.length];
    spec.rival = r.id;
    spec.stake = Math.round(clamp(4 + 8 * d, 4, 12));
    spec.N = spec.stake * 2;
    spec.aiSkill = +clamp(0.5 + 1.3 * d, 0.4, 2).toFixed(2);
  }
  return spec;
}

// 별: 목표 달성 1★ + 여유(남은 숨/초과 달성)로 2·3★
export function starsFor(spec, res) {
  if (!res.win) return 0;
  if (spec.type === 'flip') return 1 + (res.puffsLeft >= 1 || res.flipped >= Math.ceil(spec.target * 1.35) ? 1 : 0) + (res.puffsLeft >= 1 && res.flipped >= Math.ceil(spec.target * 1.35) ? 1 : 0);
  if (spec.type === 'golden') return 1 + Math.min(2, res.puffsLeft);
  const share = res.me / Math.max(1, res.me + res.ai);
  return share >= 0.75 ? 3 : share >= 0.6 ? 2 : 1;
}

// levels.js — 레벨 1 ~ 10,000+ 결정론적 생성 규칙 (렌더러 독립 → 봇으로 난이도 측정·보정)
//
// 🧭 가설 (2라운드 리서치 반영, 미검증)
//  - 1만 판은 '난이도 계단'이 아니라 ① 10판 톱니 템플릿(로얄 매치 x5 하드 / x9 슈퍼하드 / 직후 휴식)
//    ② 주기적인 새 요소(복잡도 계단) ③ 잃지 않는 메타(동네 재건)로 버틴다. 캐릭터 성장은 없다.
//  - 난이도 '손잡이'는 레벨마다 하나(목표 비율 / 황금 깊이 / 상대 실력). 값은 물리 봇 클리어율로 보정한다
//    (King 식: 봇 예측 → 사람 큐레이션). 보정표 levels-cal.json 이 있으면 그 값을 쓴다.
//  - 플레이어 쪽 물리는 절대 보정하지 않는다 ('감'의 공정성). 보정은 판 구성과 AI 에서만.

import CAL from './levels-cal.json' with { type: 'json' };

export const CHAPTER_LEN = 50; // 동네 1곳 = 10판 블록 5개, 50번째 = 골목대장전 (리서치)

export const CHAPTERS = [
  { id: 'alley', ko: '골목길', en: 'Back Alley', color: '#7cc46a' },
  { id: 'shop', ko: '문방구 앞', en: 'Corner Shop', color: '#ffb84d' },
  { id: 'playground', ko: '놀이터', en: 'Playground', color: '#5fc8ff' },
  { id: 'school', ko: '학교 운동장', en: 'Schoolyard', color: '#ff8fa8' },
  { id: 'market', ko: '시장 골목', en: 'Market Lane', color: '#b36bff' },
  { id: 'beach', ko: '바닷가 마을', en: 'Seaside Town', color: '#4dd0c8' },
  { id: 'tokyo', ko: '도쿄 멘코 골목', en: 'Tokyo Menko Lane', color: '#ff6b6b' },
  { id: 'la', ko: 'LA 밀크캡 해변', en: 'LA Milk-cap Beach', color: '#ffd23f' },
];

export const RIVALS = [
  { id: 'kongi', ko: '콩이', en: 'Kongi', card: 'mandu' },
  { id: 'minsu', ko: '민수', en: 'Minsu', card: 'tteok' },
  { id: 'jiwoo', ko: '지우', en: 'Jiwoo', card: 'tokki' },
  { id: 'twins', ko: '쌍둥이', en: 'The Twins', card: 'kkachi' },
  { id: 'grandma', ko: '문방구 할머니', en: 'Shop Grandma', card: 'dokkaebi' },
  { id: 'boss', ko: '골목대장', en: 'Alley Boss', card: 'horangi' },
];

// 10판 블록 템플릿 (2라운드 리서치: 로얄 매치 패턴 + PUFF! 적용). rate = 학습자 봇 목표 클리어율
export const SLOTS = {
  1: { role: 'new', rate: 0.92, puffs: 3 },
  2: { role: 'practice', rate: 0.85, puffs: 3 },
  3: { role: 'practice2', rate: 0.75, puffs: 3 },
  4: { role: 'rival', rate: 0.6 },
  5: { role: 'hard', rate: 0.4, puffs: 2 }, // L35 전에는 'normal'(0.65)
  6: { role: 'relief', rate: 0.93, puffs: 3 }, // 대박 휴식판(싹쓸이 쾌감)
  7: { role: 'applied', rate: 0.68, puffs: 3 },
  8: { role: 'precision', rate: 0.6, puffs: 3 }, // 황금 딱지 깊숙이
  9: { role: 'boss', rate: 0.25 }, // L59 전에는 0.5
  10: { role: 'reward', rate: 0.93, puffs: 3 },
};
export const FIRST_HARD = 35;
export const FIRST_SUPERHARD = 59;

// 새 요소 '복잡도 계단' (처음 등장하는 판에서 소개 카드)
export const INTRO = { 4: 'rival', 11: 'golden', 18: 'goldenSide', 21: 'heavy' };

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

export function chapterOf(n) {
  const ci = Math.floor((n - 1) / CHAPTER_LEN);
  return { ci, chapter: CHAPTERS[ci % CHAPTERS.length], idx: ((n - 1) % CHAPTER_LEN) + 1 };
}

// 슬롯 → 티어/목표 클리어율 (첫 하드·슈퍼하드 전에는 진폭을 작게)
export function slotOf(n) {
  const slot = ((n - 1) % 10) + 1;
  const base = SLOTS[slot];
  let tier = 'normal', rate = base.rate, role = base.role;
  if (role === 'hard') { if (n >= FIRST_HARD) tier = 'hard'; else { rate = 0.65; role = 'applied'; } }
  if (role === 'boss') { if (n >= FIRST_SUPERHARD) tier = 'superhard'; else rate = 0.5; }
  if (role === 'relief' || role === 'reward' || role === 'new') tier = 'relief';
  if (n % CHAPTER_LEN === 0) { role = 'boss'; tier = n >= FIRST_SUPERHARD ? 'superhard' : 'hard'; rate = n >= FIRST_SUPERHARD ? 0.25 : 0.45; }
  return { slot, role, tier, rate, puffs: base.puffs };
}

export function levelSpec(n, kOverride) {
  const rng = mulberry32(0x9e3779b1 ^ Math.imul(n, 2654435761));
  const s = slotOf(n);
  const ch = chapterOf(n);
  const has = { rival: n >= 4, golden: n >= 11, goldenSide: n >= 18, heavy: n >= 21 };
  // 목표 종류: 4번칸·보스 = 라이벌, 정밀칸 = 황금(해금 후), 나머지는 섞기
  let type = 'flip';
  if (s.role === 'rival' && has.rival) type = 'rival';
  else if (s.role === 'boss' && has.rival) type = 'rival';
  else if (s.role === 'precision' && has.goldenSide && Math.floor(n / 10) % 2 === 1) type = 'goldenSide'; // 정밀 칸: 황금 ↔ 황금 옆으로 번갈아
  else if (s.role === 'precision' && has.golden) type = 'golden';
  else if (has.golden && (s.role === 'applied' || s.role === 'practice2') && rng() < 0.4) type = 'golden';
  if (INTRO[n] === 'golden') type = 'golden'; // 새 요소를 소개하는 판은 반드시 그 요소가 나온다
  if (INTRO[n] === 'rival') type = 'rival';
  if (INTRO[n] === 'goldenSide') type = 'goldenSide';
  // 더미 크기: L1~10 은 3→16장으로 커지며 '양에 따라 숨'을 익힌다. 휴식/보상판은 크게(싹쓸이 쾌감)
  let N = Math.round(clamp(6 + 13 * (1 - Math.exp(-n / 28)) + (rng() - 0.5) * 4, 3, 22));
  if (n <= 10) N = [3, 5, 4, 8, 7, 12, 10, 9, 14, 16][n - 1];
  if (s.role === 'relief' || s.role === 'reward') N = Math.max(N, 12);
  if (s.role === 'precision' && type === 'flip') N = Math.max(4, Math.round(N * 0.7));
  const heavy = has.heavy && (n === 21 || (s.role !== 'relief' && s.role !== 'reward' && rng() < 0.35)) ? Math.max(1, Math.round(N * (0.12 + 0.2 * rng()))) : 0;
  const spec = { n, tier: s.tier, role: s.role, rate: s.rate, chapter: ch.chapter.id, chapterIdx: ch.ci, idx: ch.idx, type, N, heavy, intro: INTRO[n] || null, seed: (rng() * 2 ** 31) | 0 };
  // 난이도 손잡이 k (0=쉬움 … 1=어려움): 보정표 → 없으면 목표 클리어율로 추정
  const k = kOverride ?? CAL[n] ?? clamp(1.05 - s.rate, 0.02, 0.98);
  spec.k = +k.toFixed(3);
  if (type === 'flip') {
    spec.puffs = s.puffs || 3;
    if (spec.puffs === 2 && k > 0.6 && (s.tier === 'hard' || s.tier === 'superhard')) {
      // 하드: 물리가 후해서(리서치 9장) 숨 2번으로는 40%까지 안 내려감 → 손잡이 상단은 '숨 1번'
      // 3차: 0.6 경계에서 클리어율이 튀지 않게(이분 탐색이 깨짐) 숨 1번 목표를 0.45N 부터 시작
      spec.puffs = 1;
      spec.target = Math.max(1, Math.min(N, Math.round(N * (0.45 + 0.45 * ((k - 0.6) / 0.4)))));
    } else {
      // 3차 재보정 실측: 숨 3번이면 손잡이 끝(전부 뒤집기)도 학습자 87~90% → 손잡이 상단은 숨 2번 (어려운 쪽으로만 꺾여 이분 탐색 유지)
      // 숨 2번 구간은 목표 0.45N 부터 시작해 낙차를 줄인다 (0.7 경계에서 93% → 40%대로 떨어져 중간 목표가 안 잡혔음)
      if (spec.puffs === 3 && k > 0.7) {
        spec.puffs = 2;
        spec.target = Math.max(1, Math.min(N, Math.round(N * (0.45 + 0.5 * ((k - 0.7) / 0.3)))));
      } else spec.target = Math.max(1, Math.min(N, Math.round(N * (0.2 + 0.75 * (s.puffs === 2 ? k / 0.6 : k)))));
    }
  } else if (type === 'golden') {
    spec.puffs = s.puffs || 3;
    spec.goldenDepth = +clamp(0.1 + 0.85 * k, 0.1, 0.95).toFixed(2); // 위에서부터 깊이 비율
  } else if (type === 'goldenSide') {
    // 황금 딱지 옆으로 넘기기 (재윤님 5차): 분필 원 안 ★칸(왼/오른쪽 반달)에 그림이 위로 오게 넘겨야 클리어.
    // 가운데를 불면 제자리에 떨어져 칸에 못 감(0%) → 반대쪽 옆을 불어야 그쪽으로 굴러감 (tools/goldenside.mjs)
    spec.puffs = k > 0.7 ? 2 : s.puffs || 3;
    spec.goldenDepth = +clamp(0.1 + 0.6 * k, 0.1, 0.7).toFixed(2);
    spec.pocket = Math.floor(n / 10) % 4 < 2 ? 'right' : 'left'; // 화면 기준, 판마다 번갈아 (18 오른쪽, 38 왼쪽, 58 오른쪽 …)
  } else {
    const ri = s.role === 'boss' ? 5 : Math.min(4, Math.floor(n / 25));
    spec.rival = RIVALS[ri].id;
    spec.stake = Math.round(clamp(4 + n / 12, 4, 12));
    spec.N = spec.stake * 2;
    spec.aiSkill = +clamp(0.3 + 2.2 * k, 0.3, 2.5).toFixed(2);
  }
  return spec;
}

// 별: 목표 달성 1★ + 여유(남은 숨/초과 달성)로 2·3★
export function starsFor(spec, res) {
  if (!res.win) return 0;
  if (spec.type === 'flip') {
    const extra = res.flipped >= Math.min(spec.N, Math.ceil(spec.target * 1.35));
    return 1 + (res.puffsLeft >= 1 || extra ? 1 : 0) + (res.puffsLeft >= 1 && extra ? 1 : 0);
  }
  if (spec.type === 'golden' || spec.type === 'goldenSide') return 1 + Math.min(2, res.puffsLeft);
  const share = res.me / Math.max(1, res.me + res.ai);
  return share >= 0.75 ? 3 : share >= 0.6 ? 2 : 1;
}

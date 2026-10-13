// rules.js — 화면(main.js)과 레벨 봇(tools/levelbot.mjs)이 함께 쓰는 '숨 규칙'. 렌더러 독립.
//
// 가설: 정답 숨 세기는 '쌓인 양'에 비례해야 사람이 감으로 익힌다 (재윤님 피드백 1).
//       많이 쌓이면 크게, 적으면 살짝. 물리로 넘길 때는 그 양에 맞는 숨을 0.95 로 정규화한다.

export const POWER_MAX = 1.25;
export const PHYS_SWEET = 0.95;
// 마지막 한 장(재윤님 4차: '1장 남으면 죽어도 안 넘어감'): 초록 숨을 장수와 상관없이 0.95 로 쓰면 1장은 2~3 높이로 솟아
// 빙글빙글 돌다 동전 던지기로 떨어졌다(뒤집힘 25%). 장수별 물리 세기 실측(tools/stackpower.mjs, 16시드):
// 1장은 0.75 에서 69%(옆 63%)로 정점, 2장 이상은 0.95 까지 계속 오름 → 1장만 낮춘다.
export const PHYS_SWEET_ONE = 0.75;
export const physSweetFor = (n) => (n <= 1 ? PHYS_SWEET_ONE : PHYS_SWEET);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 1장 ≈ 0.45, 20장 = 0.95, 40장 ≈ 1.12 — 차이를 넓혀 '양에 따라 다르게 분다'가 손가락으로 느껴지게 (2라운드 리서치: 기존 폭은 손가락 한 개 폭)
export function sweetHiFor(n) {
  return clamp(0.45 + 0.5 * Math.sqrt((Math.max(1, n) - 1) / 19), 0.45, 1.12);
}
export function sweetLoFor(n) {
  return sweetHiFor(n) * 0.78;
}

function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 숨 해석 (재윤님 3차 피드백: '딱 좋은 숨'인데 안 넘어가고 빨강이 더 넘어간다 / 세기별 차이가 안 보인다)
//  - 약한 숨(초록 아래): 들어 올리는 힘이 급격히 줄어 '들썩'만 → 거의 안 넘어감
//  - 초록 구간(정답의 0.78~1.0배): 전부 최대로 들어 올림 → 초록이면 확실히 넘어간다
//  - 너무 센 숨(1.0배 초과): 들어 올리기보다 '밀어 날려 버리는' 돌풍(blast) → 딱지가 분필 원 밖으로 날아가 무효
//  + 숨이 차서 조준이 약간 흔들림
export const GREEN_LO = 0.78;
export const WEAK_ZERO = +(globalThis.process?.env?.WEAK_ZERO ?? 0.45); // 이 비율 이하는 들썩도 거의 없음
export const WEAK_FLOOR = +(globalThis.process?.env?.WEAK_FLOOR ?? 0.3); // 아주 약한 숨의 물리 세기(들썩)
export const WEAK_EXP = +(globalThis.process?.env?.WEAK_EXP ?? 2.0);
export const BLAST_SPAN = +(globalThis.process?.env?.BLAST_SPAN ?? 0.4); // 초록 끝에서 이만큼 더 세면 돌풍 최대
export function resolveShot(shot, n, top, rng, overShake = 1) {
  const hi = sweetHiFor(n);
  const ratio = shot.power / hi;
  const PS = physSweetFor(n);
  if (ratio < GREEN_LO) {
    const lift = Math.pow(clamp((ratio - WEAK_ZERO) / (GREEN_LO - WEAK_ZERO), 0, 1), WEAK_EXP);
    return { ...shot, power: WEAK_FLOOR + (PS - WEAK_FLOOR) * lift, ratio, blast: 0 };
  }
  if (ratio <= 1.0) return { ...shot, power: PS, ratio, blast: 0 };
  const ex = ratio - 1.0;
  const k = overShake;
  return {
    ...shot,
    power: PS,
    blast: clamp(ex / BLAST_SPAN, 0, 1.4),
    h: clamp(shot.h + gauss(rng) * ex * 1.2 * k, 0.03, top),
    lat: clamp((shot.lat || 0) + gauss(rng) * ex * 1.0 * k, -0.95, 0.95), // 숨이 넘치면 조준도 조금 흔들림
    over: true,
    ratio,
  };
}

export { gauss };

// ── 숨 주머니 (재윤님 3차: "숨도 무한으로 모을 수는 없고, 제한된 숨 주머니 속에서 스탑포인트를") ──
// 설계 패널 4안 → 심사 3명 만장일치 A안 '볼 주머니: 꽉 → 버팀 → 콜록'.
// 🧭 가설(미검증): 주머니 끝 '꽉'(F)은 모든 판의 정답보다 위에 고정된 절대 자다. 꽉에 닿는 순간(소리 끊김·손끝 걸림·숨 줄기 멈춤)이
//   멈춤점이 되고, 정답은 언제나 꽉 아래 '더미 양에 비례한 자리'라서 감이 실력으로 남는다.
//   틀렸다는 신호: 꽉 ±5% 에서 놓는 비율이 10%↑ (꽉을 정답으로 착각) / 장수와 놓은 숨의 상관이 약함.
export const POUCH_FULL = 1.12; // 꽉 = sweetHiFor 상한. 지금 판(N ≤ 24)의 정답(hi ≤ 1.0)보다 항상 위 → 꽉에서 놓으면 늘 손해(돌풍)
export const POUCH_DETENT = 0.08; // 꽉에서 손가락이 이만큼(당김 단위) 더 가도 숨이 안 늘어남 = 손끝 멈춤 신호
export const POUCH_GAIN = 0.4; // 그 너머는 고무줄처럼 뻑뻑하게(0.4배) 우겨넣기 → 벽 POWER_MAX
export const STRAIN_MS = 1400; // 꽉에서 버틸 수 있는 시간(벽에서는 절반). 넘으면 콜록 = 취소(숨·차례 안 씀, 재윤님 4차 결정)
export const STRAIN_RECOVER_MS = 900;
export const LEAK_AT = 0.35; // 버팀이 이만큼 차면 입꼬리로 김이 샘(연출만, 숨은 그대로)

// 당긴 거리(u, 1 = 화면 짧은 변 × pull) → 숨. 꽉 아래는 지금과 1:1 (정답 당김 거리 불변)
export function pouchPower(u) {
  u = Math.max(0, u);
  if (u <= POUCH_FULL) return u;
  if (u <= POUCH_FULL + POUCH_DETENT) return POUCH_FULL;
  return Math.min(POWER_MAX, POUCH_FULL + (u - POUCH_FULL - POUCH_DETENT) * POUCH_GAIN);
}
// 꽉 래치(히스테리시스: 꽉 근처에서 깜빡이지 않게)
export function fullLatch(p, was) {
  return was ? p >= POUCH_FULL - 0.03 : p >= POUCH_FULL - 0.005;
}
// 버팀 s(0..1): 꽉인 동안 차오르고(벽에 가까울수록 빨리), 꽉에서 내려오면 천천히 풀린다
export function strainStep(s, p, dtMs, full, strainMs = STRAIN_MS) {
  if (full) {
    const k = clamp((p - POUCH_FULL) / (POWER_MAX - POUCH_FULL), 0, 1);
    return Math.min(1, s + dtMs / (strainMs * (1 - 0.5 * k)));
  }
  return Math.max(0, s - dtMs / STRAIN_RECOVER_MS);
}

// ── 삐져나온 딱지 노리기 (4차) ──────────────────────────────
// ⚠ 실험용, 지금은 아무도 안 씀(AI·봇 seek 0). 4차 교차 검토: 처음 근거(한쪽 6시드 8.3 vs 6.8 vs 3.3)는 거울 짝 비교에서
//   재현되지 않았고(옆 삐져나옴 +1장 정도), 이 함수는 아래쪽 딱지 높이를 골라 고수 AI 를 오히려 약하게 만들었다.
// 다시 쌓은 더미에서 '부는 사람 쪽'으로 삐져나온 딱지를 찾는다.
// toward = 더미 → 부는 사람 수평 단위벡터. 반환 { lat, h, amount } 또는 null. 실력이 높을수록 자주 찾는다.
// lat 부호는 main.js shotGeometry 와 같다: 바람 방향 D 기준 side = (−D.z, D.x).
export function pickProtrusion(table, toward, skill, rng) {
  if (rng() > clamp((skill - 0.9) / 1.4, 0, 0.85)) return null;
  const c = table.pileCenter();
  const side = { x: toward.z, z: -toward.x };
  let best = null;
  for (const d of table.liveDiscs()) {
    const p = d.body.translation();
    const ox = p.x - c.x, oz = p.z - c.z, m = Math.hypot(ox, oz);
    if (m < 0.1) continue;
    const ux = ox / m, uz = oz / m;
    const facing = ux * toward.x + uz * toward.z; // 1 = 부는 사람 쪽으로 튀어나옴
    if (facing < 0.15) continue;
    const score = m * (0.4 + 0.6 * facing);
    if (!best || score > best.score) best = { score, lat: clamp(ux * side.x + uz * side.z, -0.9, 0.9), h: p.y, amount: m };
  }
  return best;
}

// ── 콩닥 숨 (8차 시험 토글, 재윤님: "숨 레인지가 왔다갔다할 때 순간 놓아 초록에 닿게 — 재밌으려나?") ──
// 당긴 길이가 박동의 '가운데', 놓는 순간이 박동의 어디인지가 숨을 정한다. 크기는 정답 숨 hi(n) 대비 비율이라 장수와 무관.
// 원안(0↔꽉 그네)은 초록 체류 47~110ms 로 아이·어르신이 20~45% → 기각(8차 설계 패널). 창이 150ms 밑인 등급은 두지 않는다.
// 봇·상대·레벨 보정에는 들어가지 않는다(튜닝 beat 기본 0).
export const BEAT_TIERS = { 1: { A: 0.08, T: 1500, f: 0 }, 2: { A: 0.18, T: 1100, f: 0.15 } }; // 1 차분 / 2 보통
// 파형: 부드러운 삼각파(0.75·삼각 + 0.25·사인), 위상 0 = 골(−1), 0.5 = 마루(+1). 순수 사인은 마루에 오래 머물러 '마루 노리기'가 공짜
export function beatWave(ph) {
  const x = ph - Math.floor(ph);
  const tri = x < 0.5 ? -1 + 4 * x : 3 - 4 * x;
  return 0.75 * tri + 0.25 * -Math.cos(2 * Math.PI * x);
}
// st = { ph, k, u } 를 dtMs 만큼 진행하고 오프셋(정답 대비 비율)을 돌려준다.
// 오래 들수록(0.6s 뒤 2s 동안) 크기 ×1.5·주기 ×0.8, 꽉에 가까울수록 크기 최대 ×2.5·꽉이면 주기 ×0.7 (숨 참으면 심장이 빨라짐)
// 들쭉날쭉: 박동마다 마루만 (1 + f·u), u ∈ [−1, 1] 는 rng(경기 시드) — 오르는 동안 보이므로 숨긴 정보가 아니다
export function beatStep(st, dtMs, holdMs, fullness, tier, rng) {
  const b = BEAT_TIERS[tier];
  if (!b) return 0;
  const g = clamp((holdMs - 600) / 2000, 0, 1);
  const boost = 1 + 1.5 * clamp((fullness - 0.8) / 0.2, 0, 1);
  const T = b.T * (1 - 0.2 * g) * (fullness >= 1 ? 0.7 : 1);
  st.ph += dtMs / T;
  const k = Math.floor(st.ph + 0.5); // 마루마다 새 들쭉날쭉
  if (k !== st.k) { st.k = k; st.u = b.f ? rng() * 2 - 1 : 0; }
  const w = beatWave(st.ph);
  return b.A * (1 + 0.5 * g) * boost * (w > 0 ? w * (1 + b.f * st.u) : w);
}

// ── 입술 높이 (9차, 재윤님: '입술의 y축 위치는 컨트롤 못하나?') ──
// 물리가 구분하는 자세는 둘(tools/mouthmap.mjs 16시드): 눈높이 = 지금 입(조준 높이를 따라감, sim 기본 경로·비트 동일) / 책상 = 입술을 책상에 댐.
// 책상 입은 8장↑ 가운데 층을 ×1.2~3.3 넘기지만(퍼올림), 맨 위를 노리면 손해(14장 ×0.67) → 정답 하나가 아니다.
export const LIP_BACK = 2.6; // 입 ~ 조준점 수평 거리(sim TUNE.lipBack 과 같음)
export const LIP_MIN = 0.15; // 책상에 댄 입술 높이(sim TUNE.lipMinY)
export const LOW_POSE_MIN_N = 6; // 6장 미만은 퍼올릴 각이 없다(6장 더미 높이 0.36 vs 입 0.15)
export const mouthYFor = (pose) => (pose === 'low' ? LIP_MIN : null); // null = mouthY 를 아예 넘기지 않음(눈높이)

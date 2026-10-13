// creatures.js — 수집 테마 시안 (2라운드 리서치 1순위): 동물 기반 오리지널 크리처 × 시즌 의상 × 시크릿
//
// 🧭 가설 (미검증): 원형 딱지 = 둥근 얼굴. '실존 동물 모티프 + 귀여운 얼굴 + 시즌 의상 + 시크릿'이
//    음식 크리처보다 남녀노소·지역을 넘어 수집욕이 강하다 (라부부·산리오·Squishmallows·포켓몬 근거).
//    현재의 한국 분식 24종은 캐릭터가 아니라 '시즌 1 의상(모자)'으로 재활용한다.
// 시리즈 = 9종 + 시크릿 1 (Monopoly GO 9장 세트 + Pop Mart 시크릿 문법)

const INK = '#2a1a12';

export const SERIES_A = {
  id: 'S1A', ko: '시즌1 · 분식 의상', en: 'Season 1 · Snack-bar Outfits',
  items: [
    { id: 'jindo-mandu', sp: 'jindo', hat: 'mandu', ko: '진돗개 × 만두', en: 'Jindo × Mandu' },
    { id: 'shiba-tteok', sp: 'shiba', hat: 'tteok', ko: '시바 × 떡볶이', en: 'Shiba × Tteokbokki' },
    { id: 'corgi-kimbap', sp: 'corgi', hat: 'kimbap', ko: '코기 × 김밥', en: 'Corgi × Kimbap' },
    { id: 'cat-hotteok', sp: 'cheesecat', hat: 'hotteok', ko: '치즈냥 × 호떡', en: 'Cheese Cat × Hotteok' },
    { id: 'rabbit-dubu', sp: 'rabbit', hat: 'dubu', ko: '토끼 × 두부', en: 'Rabbit × Tofu' },
    { id: 'hamster-bungeo', sp: 'hamster', hat: 'bungeo', ko: '햄스터 × 붕어빵', en: 'Hamster × Fish Bun' },
    { id: 'panda-kimchi', sp: 'panda', hat: 'kimchi', ko: '판다 × 김치', en: 'Panda × Kimchi' },
    { id: 'penguin-sikhye', sp: 'penguin', hat: 'sikhye', ko: '펭귄 × 식혜', en: 'Penguin × Sikhye' },
    { id: 'capy-yakgwa', sp: 'capybara', hat: 'yakgwa', ko: '카피바라 × 약과', en: 'Capybara × Yakgwa' },
    { id: 'secret-dokkaebi', sp: 'jindo', hat: 'horns', secret: true, ko: '시크릿: 도깨비 진돗개', en: 'Secret: Dokkaebi Jindo' },
  ],
};

const SPECIES = {
  jindo: { fur: '#f6efe4', inner: '#ffd9c2', muzzle: '#ffffff', ears: 'pointy', nose: '#3a2a22' },
  shiba: { fur: '#e8954a', inner: '#fff1de', muzzle: '#fff6ea', ears: 'pointy', nose: '#3a2a22', mask: true },
  corgi: { fur: '#f0a04b', inner: '#ffd2b0', muzzle: '#ffffff', ears: 'big', nose: '#3a2a22', blaze: true },
  cheesecat: { fur: '#ffc56b', inner: '#ffb3a7', muzzle: '#fff6e0', ears: 'cat', nose: '#ff8fa8', stripes: true, whiskers: true },
  rabbit: { fur: '#fbf7f3', inner: '#ffc0d6', muzzle: '#ffffff', ears: 'bunny', nose: '#ff8fa8' },
  hamster: { fur: '#f2c48d', inner: '#ffb3a7', muzzle: '#fff8ec', ears: 'round', nose: '#ff8fa8', cheeks: true },
  panda: { fur: '#ffffff', inner: '#2a1a12', muzzle: '#ffffff', ears: 'roundDark', nose: '#2a1a12', patches: true },
  penguin: { fur: '#2f3b55', inner: '#2f3b55', muzzle: '#ffffff', ears: 'none', nose: '#ffb02e', face: 'penguin' },
  capybara: { fur: '#b07c4f', inner: '#8a5a35', muzzle: '#c9946a', ears: 'tiny', nose: '#3a2a22', snout: true },
};

function circle(ctx, x, y, r, fill, line = 0.035) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line) { ctx.lineWidth = line; ctx.strokeStyle = INK; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, rot, fill, line = 0.03) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line) { ctx.lineWidth = line; ctx.strokeStyle = INK; ctx.stroke(); }
}
function poly(ctx, pts, fill, line = 0.03) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line) { ctx.lineWidth = line; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); }
}

function ears(ctx, s) {
  const f = s.fur, i = s.inner;
  switch (s.ears) {
    case 'pointy': for (const k of [-1, 1]) { poly(ctx, [k * 0.38, -0.12, k * 0.36, -0.5, k * 0.12, -0.34], f); poly(ctx, [k * 0.32, -0.18, k * 0.32, -0.42, k * 0.18, -0.32], i, 0); } break;
    case 'big': for (const k of [-1, 1]) { poly(ctx, [k * 0.42, -0.08, k * 0.46, -0.58, k * 0.12, -0.32], f); poly(ctx, [k * 0.36, -0.16, k * 0.4, -0.48, k * 0.2, -0.32], i, 0); } break;
    case 'cat': for (const k of [-1, 1]) { poly(ctx, [k * 0.4, -0.16, k * 0.34, -0.5, k * 0.12, -0.36], f); poly(ctx, [k * 0.33, -0.22, k * 0.31, -0.42, k * 0.19, -0.35], i, 0); } break;
    case 'bunny': for (const k of [-1, 1]) { ellipse(ctx, k * 0.16, -0.5, 0.09, 0.26, k * 0.12, f); ellipse(ctx, k * 0.16, -0.48, 0.045, 0.17, k * 0.12, i, 0); } break;
    case 'round': for (const k of [-1, 1]) { circle(ctx, k * 0.3, -0.3, 0.1, f); circle(ctx, k * 0.3, -0.3, 0.05, i, 0); } break;
    case 'roundDark': for (const k of [-1, 1]) circle(ctx, k * 0.3, -0.3, 0.11, INK); break;
    case 'tiny': for (const k of [-1, 1]) circle(ctx, k * 0.3, -0.3, 0.06, s.inner); break;
    default: break;
  }
}

function hat(ctx, h) {
  switch (h) {
    case 'mandu': // 만두 모자: 주름 잡힌 반달
      ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.quadraticCurveTo(0, -0.72, 0.3, -0.3); ctx.closePath();
      ctx.fillStyle = '#fbf4e4'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 0.018; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 0.06, -0.32); ctx.quadraticCurveTo(k * 0.05, -0.45, k * 0.03, -0.55); ctx.stroke(); }
      break;
    case 'tteok': // 떡볶이 머리띠: 빨간 떡 3개
      ctx.lineWidth = 0.05; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, -0.05, 0.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.lineWidth = 0.03; ctx.strokeStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(0, -0.05, 0.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      for (const a of [1.32, 1.5, 1.68]) { ctx.save(); ctx.translate(Math.cos(a * Math.PI) * 0.4, -0.05 + Math.sin(a * Math.PI) * 0.4); ctx.rotate(a * Math.PI + Math.PI / 2); ellipse(ctx, 0, -0.06, 0.04, 0.09, 0, '#ff6b4a', 0.022); ctx.restore(); }
      break;
    case 'kimbap': // 김밥 두건: 김 띠 + 단면 장식
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.42, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(0.3, -0.26); ctx.quadraticCurveTo(0, -0.36, -0.3, -0.26); ctx.closePath();
      ctx.fillStyle = '#2f3a2c'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
      circle(ctx, 0.18, -0.36, 0.08, '#fffaf0', 0.02); circle(ctx, 0.18, -0.36, 0.03, '#ff8c2e', 0); circle(ctx, 0.15, -0.38, 0.015, '#46c75a', 0);
      break;
    case 'hotteok': // 호떡 베레모
      ellipse(ctx, -0.04, -0.4, 0.3, 0.12, -0.15, '#d9913d'); ellipse(ctx, -0.08, -0.44, 0.1, 0.035, -0.15, '#8a4b14', 0); circle(ctx, 0.18, -0.48, 0.035, '#8a4b14', 0.015);
      break;
    case 'dubu': // 두부 모자: 작은 네모를 귀 사이에 비스듬히
      ctx.save(); ctx.translate(0.02, -0.4); ctx.rotate(-0.12);
      ctx.beginPath(); ctx.roundRect(-0.11, -0.09, 0.22, 0.15, 0.03); ctx.fillStyle = '#fffdf4'; ctx.fill(); ctx.lineWidth = 0.025; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = 'rgba(200,190,170,0.6)'; ctx.fillRect(-0.1, 0.01, 0.2, 0.02);
      ctx.restore();
      break;
    case 'bungeo': // 붕어빵 모자
      ellipse(ctx, 0, -0.42, 0.26, 0.12, 0, '#e3a14a'); poly(ctx, [0.24, -0.42, 0.38, -0.52, 0.38, -0.32], '#e3a14a', 0.025); circle(ctx, -0.14, -0.44, 0.025, INK, 0);
      ctx.lineWidth = 0.015; ctx.strokeStyle = '#a5651f'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0.02 + k * 0.06, -0.42, 0.05, -1, 1); ctx.stroke(); }
      break;
    case 'kimchi': // 김치 잎 후드
      ellipse(ctx, -0.12, -0.42, 0.18, 0.09, -0.4, '#e8402f'); ellipse(ctx, 0.12, -0.42, 0.18, 0.09, 0.4, '#e8402f'); ellipse(ctx, 0, -0.5, 0.12, 0.08, 0, '#f6e6b4', 0.02);
      break;
    case 'sikhye': // 식혜 컵 모자 + 빨대
      poly(ctx, [-0.14, -0.36, 0.14, -0.36, 0.11, -0.62, -0.11, -0.62], 'rgba(255,248,220,0.95)'); ellipse(ctx, 0, -0.5, 0.1, 0.02, 0, '#f2e6c4', 0);
      ctx.lineWidth = 0.025; ctx.strokeStyle = '#ff4d5e'; ctx.beginPath(); ctx.moveTo(0.04, -0.6); ctx.lineTo(0.12, -0.74); ctx.stroke();
      break;
    case 'yakgwa': // 약과 왕관
      for (let k = 0; k < 5; k++) circle(ctx, -0.2 + k * 0.1, -0.44 + Math.abs(k - 2) * 0.03, 0.065, '#a8582a', 0.02);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(-0.21 + k * 0.1, -0.46 + Math.abs(k - 2) * 0.03, 0.02, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'horns': // 시크릿: 도깨비 뿔 + 방망이
      for (const k of [-1, 1]) poly(ctx, [k * 0.08, -0.36, k * 0.16, -0.66, k * 0.24, -0.34], '#ffe9a0');
      ctx.save(); ctx.translate(0.36, 0.2); ctx.rotate(-0.5); ellipse(ctx, 0, -0.12, 0.06, 0.18, 0, '#b07a3c', 0.025); ctx.restore();
      break;
  }
}

// 원판 지름 = 얼굴 지름. 눈은 세로 55~60% 지점, 지름의 12~15% (2라운드 리서치 아트 규칙)
export function drawCreature(ctx, size, item, { silhouette = false } = {}) {
  const s = SPECIES[item.sp];
  const secret = item.secret;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.scale(size, size);
  ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, Math.PI * 2); ctx.clip();
  // 배경: 시리즈 색 + 망점
  const bg = ctx.createRadialGradient(0, -0.1, 0.05, 0, 0, 0.6);
  bg.addColorStop(0, secret ? '#5a3d8c' : '#fff3c2'); bg.addColorStop(1, secret ? '#24133f' : '#ffcf5a');
  ctx.fillStyle = bg; ctx.fillRect(-0.5, -0.5, 1, 1);
  ctx.fillStyle = secret ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  for (let y = -0.5; y < 0.5; y += 0.035) for (let x = -0.5; x < 0.5; x += 0.035) { ctx.beginPath(); ctx.arc(x, y, 0.006, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(0, 0.06);
  ctx.scale(0.86, 0.86);
  if (silhouette) ctx.filter = 'brightness(0)';
  if (s.ears !== 'bunny') ears(ctx, s);
  // 머리
  const fur = secret ? '#cfe3ff' : s.fur;
  const g = ctx.createRadialGradient(-0.12, -0.18, 0.05, 0, 0, 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0, fur); g.addColorStop(1, fur);
  circle(ctx, 0, 0, 0.42, fur, 0.045);
  // 은은한 하이라이트 (과한 광택 제거)
  ellipse(ctx, -0.16, -0.2, 0.12, 0.06, -0.6, 'rgba(255,255,255,0.35)', 0);
  if (s.face === 'penguin') { ctx.beginPath(); ctx.moveTo(-0.3, 0.05); ctx.bezierCurveTo(-0.3, -0.25, -0.05, -0.2, 0, -0.08); ctx.bezierCurveTo(0.05, -0.2, 0.3, -0.25, 0.3, 0.05); ctx.bezierCurveTo(0.3, 0.32, -0.3, 0.32, -0.3, 0.05); ctx.fillStyle = '#ffffff'; ctx.fill(); }
  if (s.mask) { ctx.beginPath(); ctx.moveTo(-0.36, 0.1); ctx.quadraticCurveTo(-0.2, -0.05, 0, 0.02); ctx.quadraticCurveTo(0.2, -0.05, 0.36, 0.1); ctx.quadraticCurveTo(0, 0.48, -0.36, 0.1); ctx.fillStyle = s.inner; ctx.fill(); }
  if (s.blaze) { ctx.beginPath(); ctx.moveTo(-0.05, -0.42); ctx.lineTo(0.05, -0.42); ctx.lineTo(0.14, 0.1); ctx.lineTo(-0.14, 0.1); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); }
  if (s.stripes) { ctx.fillStyle = '#e8902e'; for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(k * 0.09 - 0.03, -0.42); ctx.lineTo(k * 0.09 + 0.03, -0.42); ctx.lineTo(k * 0.06, -0.26); ctx.closePath(); ctx.fill(); } }
  if (s.patches) for (const k of [-1, 1]) ellipse(ctx, k * 0.15, 0.04, 0.1, 0.13, k * -0.5, INK, 0);
  if (s.cheeks) for (const k of [-1, 1]) circle(ctx, k * 0.27, 0.14, 0.1, '#fff1dc', 0.02);
  // 주둥이
  if (s.face !== 'penguin') ellipse(ctx, 0, 0.17, s.snout ? 0.2 : 0.15, s.snout ? 0.13 : 0.1, 0, s.muzzle, 0.025);
  // 눈 (세로 55~60% 지점 = y≈0.03~0.05, 지름 12~15%)
  for (const k of [-1, 1]) {
    if (secret) { ctx.lineWidth = 0.035; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(k * 0.2, -0.02); ctx.lineTo(k * 0.08, 0.04); ctx.stroke(); }
    circle(ctx, k * 0.15, 0.04, 0.062, INK, 0);
    circle(ctx, k * 0.15 + 0.02, 0.02, 0.022, '#ffffff', 0);
  }
  // 코·입
  if (s.face === 'penguin') poly(ctx, [-0.06, 0.12, 0.06, 0.12, 0, 0.21], s.nose, 0.02);
  else {
    ellipse(ctx, 0, 0.12, 0.045, 0.032, 0, s.nose, 0.015);
    ctx.lineWidth = 0.022; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0.15); ctx.quadraticCurveTo(-0.05, 0.22, -0.09, 0.18); ctx.moveTo(0, 0.15); ctx.quadraticCurveTo(0.05, 0.22, 0.09, 0.18); ctx.stroke();
    if (secret) { poly(ctx, [-0.05, 0.18, -0.02, 0.18, -0.035, 0.24], '#ffffff', 0.012); poly(ctx, [0.05, 0.18, 0.02, 0.18, 0.035, 0.24], '#ffffff', 0.012); }
  }
  if (s.whiskers) { ctx.lineWidth = 0.012; ctx.strokeStyle = 'rgba(42,26,18,0.6)'; for (const k of [-1, 1]) for (const dy of [-0.02, 0.03]) { ctx.beginPath(); ctx.moveTo(k * 0.16, 0.16 + dy); ctx.lineTo(k * 0.34, 0.12 + dy * 2); ctx.stroke(); } }
  // 볼 터치
  for (const k of [-1, 1]) circle(ctx, k * 0.27, 0.16, 0.05, 'rgba(255,120,140,0.4)', 0);
  if (s.ears === 'bunny') { for (const k of [-1, 1]) { ellipse(ctx, k * 0.17, -0.5, 0.085, 0.24, k * 0.18, s.fur); ellipse(ctx, k * 0.17, -0.48, 0.04, 0.16, k * 0.18, s.inner, 0); } }
  hat(ctx, item.hat);
  ctx.filter = 'none';
  ctx.restore();
  // 테두리: 시리즈 링 (+시크릿은 보라 홀로)
  ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(size, size);
  ctx.lineWidth = 0.055; ctx.strokeStyle = secret ? '#b36bff' : '#ff8a3c';
  ctx.beginPath(); ctx.arc(0, 0, 0.47, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.012; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, 0.497, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 0.443, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

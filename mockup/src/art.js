// art.js — 딱지 앞/뒷면 텍스처를 캔버스로 절차 생성 (외부 이미지 0개)
//
// 가설: 원형 딱지 = 둥근 몸통 캐릭터(앵그리버드식)가 가장 잘 맞는다. 한국 음식·설화 크리처로
//       "귀엽다 → 이름이 궁금하다 → K-컬처 입구" 흐름을 만든다. (최종 아트는 3D/AI 생성으로 교체 예정)

export const RARITY = {
  common: { label: 'COMMON', ko: '일반', stars: 1, ring: ['#f4f1e8', '#cfc6b0'], rays: ['#ffe9a8', '#ffd76a'], weight: 60 },
  rare: { label: 'RARE', ko: '레어', stars: 2, ring: ['#8fd3ff', '#2f7fd6'], rays: ['#c9ecff', '#7cc7ff'], weight: 28 },
  epic: { label: 'EPIC', ko: '에픽', stars: 3, ring: ['#e6a6ff', '#8a3ad6'], rays: ['#f2d2ff', '#cf8cff'], weight: 10 },
  legendary: { label: 'LEGEND', ko: '전설', stars: 5, ring: ['#ffe066', '#e08a00'], rays: ['#fff3b0', '#ffc93c'], weight: 2 },
};

// 24종 — 공통 12 / 레어 7 / 에픽 4 / 전설 1
export const CARDS = [
  { id: 'mandu', name: 'Mandu', ko: '만두', rarity: 'common', body: '#f6efe1', belly: '#ffffff', ears: 'pleats', eyes: 'round', brow: 'happy', mouth: 'smile', extra: 'steam' },
  { id: 'tteok', name: 'Tteokki', ko: '떡이', rarity: 'common', body: '#ff7a59', belly: '#ffd2c2', ears: 'none', eyes: 'round', brow: 'angry', mouth: 'open', extra: 'sesame' },
  { id: 'kimbap', name: 'Kimbap', ko: '김밥', rarity: 'common', body: '#2f3a2c', belly: '#fffaf0', ears: 'none', eyes: 'round', brow: 'none', mouth: 'smile', extra: 'kimbap' },
  { id: 'hotteok', name: 'Hotteok', ko: '호떡', rarity: 'common', body: '#d9913d', belly: '#f5c27a', ears: 'none', eyes: 'sleepy', brow: 'none', mouth: 'smile', extra: 'syrup' },
  { id: 'dubu', name: 'Dubu', ko: '두부', rarity: 'common', body: '#fbfaf3', belly: '#ffffff', ears: 'square', eyes: 'dot', brow: 'none', mouth: 'tiny', extra: 'blush' },
  { id: 'bungeo', name: 'Bungeo', ko: '붕어', rarity: 'common', body: '#e3a14a', belly: '#f7cf86', ears: 'fin', eyes: 'round', brow: 'happy', mouth: 'beak', extra: 'scales' },
  { id: 'pajeon', name: 'Pajeon', ko: '파전', rarity: 'common', body: '#f0c55a', belly: '#f8de8f', ears: 'leaf', eyes: 'round', brow: 'angry', mouth: 'grin', extra: 'greens' },
  { id: 'kimchi', name: 'Kimchi', ko: '김치', rarity: 'common', body: '#e8402f', belly: '#ff9b7a', ears: 'leaf', eyes: 'angry', brow: 'angry', mouth: 'fang', extra: 'flakes' },
  { id: 'gamja', name: 'Gamja', ko: '감자', rarity: 'common', body: '#c8a26a', belly: '#e2c48f', ears: 'none', eyes: 'dot', brow: 'happy', mouth: 'smile', extra: 'spots' },
  { id: 'sikhye', name: 'Sikhye', ko: '식혜', rarity: 'common', body: '#f2e6c4', belly: '#fff8e2', ears: 'none', eyes: 'sparkle', brow: 'none', mouth: 'open', extra: 'rice' },
  { id: 'yakgwa', name: 'Yakgwa', ko: '약과', rarity: 'common', body: '#a8582a', belly: '#cf8146', ears: 'petal', eyes: 'round', brow: 'happy', mouth: 'smile', extra: 'glaze' },
  { id: 'japchae', name: 'Japchae', ko: '잡채', rarity: 'common', body: '#b98f6b', belly: '#dcc0a2', ears: 'none', eyes: 'swirl', brow: 'none', mouth: 'open', extra: 'noodles' },
  { id: 'kkachi', name: 'Kkachi', ko: '까치', rarity: 'rare', body: '#1f2a44', belly: '#ffffff', ears: 'tuft', eyes: 'round', brow: 'angry', mouth: 'beak', extra: 'wingtips' },
  { id: 'horangi', name: 'Horangi', ko: '호랑이', rarity: 'rare', body: '#ff9a1f', belly: '#fff1d6', ears: 'cat', eyes: 'angry', brow: 'angry', mouth: 'fang', extra: 'stripes' },
  { id: 'haetae', name: 'Haetae', ko: '해태', rarity: 'rare', body: '#5cc6a6', belly: '#d9fff2', ears: 'horn1', eyes: 'round', brow: 'angry', mouth: 'grin', extra: 'mane' },
  { id: 'dokkaebi', name: 'Dokkaebi', ko: '도깨비', rarity: 'rare', body: '#4f6cff', belly: '#a9b8ff', ears: 'horns', eyes: 'angry', brow: 'angry', mouth: 'fang', extra: 'club' },
  { id: 'tokki', name: 'Dal-Tokki', ko: '달토끼', rarity: 'rare', body: '#fff7fb', belly: '#ffe0ee', ears: 'bunny', eyes: 'sparkle', brow: 'none', mouth: 'tiny', extra: 'moon' },
  { id: 'durumi', name: 'Durumi', ko: '두루미', rarity: 'rare', body: '#f7f7f2', belly: '#ffffff', ears: 'crest', eyes: 'sleepy', brow: 'none', mouth: 'beak', extra: 'redcap' },
  { id: 'geobuk', name: 'Geobuk', ko: '거북', rarity: 'rare', body: '#4f9d4a', belly: '#c9e8a8', ears: 'none', eyes: 'round', brow: 'happy', mouth: 'smile', extra: 'shell' },
  { id: 'gumiho', name: 'Gumiho', ko: '구미호', rarity: 'epic', body: '#fff3e6', belly: '#ffffff', ears: 'fox', eyes: 'sly', brow: 'none', mouth: 'smirk', extra: 'tails' },
  { id: 'yong', name: 'Yong', ko: '용', rarity: 'epic', body: '#2fbf71', belly: '#f6e27a', ears: 'antler', eyes: 'angry', brow: 'angry', mouth: 'fang', extra: 'whiskers' },
  { id: 'bonghwang', name: 'Bonghwang', ko: '봉황', rarity: 'epic', body: '#ff5470', belly: '#ffd166', ears: 'plume', eyes: 'sparkle', brow: 'happy', mouth: 'beak', extra: 'flames' },
  { id: 'bulgasari', name: 'Bulgasari', ko: '불가사리', rarity: 'epic', body: '#6b6f80', belly: '#a7abbb', ears: 'spikes', eyes: 'angry', brow: 'angry', mouth: 'grin', extra: 'bolts' },
  { id: 'king', name: 'Ddakji King', ko: '왕딱지', rarity: 'legendary', body: '#ffcf33', belly: '#fff2b3', ears: 'crown', eyes: 'sparkle', brow: 'happy', mouth: 'grin', extra: 'aura' },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

const INK = '#2a1a12';

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}

function blob(ctx, x, y, r, fill, line = 0.045) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) {
    ctx.lineWidth = line;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function ellipse(ctx, x, y, rx, ry, rot, fill, line = 0.035) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (line) { ctx.lineWidth = line; ctx.strokeStyle = INK; ctx.stroke(); }
}

function tri(ctx, pts, fill, line = 0.035) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) { ctx.lineWidth = line; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); }
}

// 좌표계: 중심 (0,0), 몸통 반지름 ~0.5 (단위 정규화)
function drawEars(ctx, c) {
  const b = c.body, d = shade(c.body, -0.25);
  switch (c.ears) {
    case 'cat':
      tri(ctx, [-0.42, -0.22, -0.36, -0.62, -0.12, -0.42], b); tri(ctx, [0.42, -0.22, 0.36, -0.62, 0.12, -0.42], b);
      tri(ctx, [-0.34, -0.3, -0.32, -0.52, -0.18, -0.4], '#ffb3a7', 0); tri(ctx, [0.34, -0.3, 0.32, -0.52, 0.18, -0.4], '#ffb3a7', 0);
      break;
    case 'fox':
      tri(ctx, [-0.46, -0.16, -0.42, -0.72, -0.1, -0.42], b); tri(ctx, [0.46, -0.16, 0.42, -0.72, 0.1, -0.42], b);
      tri(ctx, [-0.4, -0.28, -0.39, -0.6, -0.2, -0.42], '#ff9a6a', 0); tri(ctx, [0.4, -0.28, 0.39, -0.6, 0.2, -0.42], '#ff9a6a', 0);
      break;
    case 'bunny':
      ellipse(ctx, -0.18, -0.68, 0.1, 0.3, -0.15, b); ellipse(ctx, 0.18, -0.68, 0.1, 0.3, 0.15, b);
      ellipse(ctx, -0.18, -0.66, 0.05, 0.2, -0.15, '#ffc0d6', 0); ellipse(ctx, 0.18, -0.66, 0.05, 0.2, 0.15, '#ffc0d6', 0);
      break;
    case 'horns':
      tri(ctx, [-0.3, -0.38, -0.24, -0.72, -0.1, -0.44], '#ffe9a0'); tri(ctx, [0.3, -0.38, 0.24, -0.72, 0.1, -0.44], '#ffe9a0');
      break;
    case 'horn1':
      tri(ctx, [-0.08, -0.45, 0, -0.78, 0.08, -0.45], '#ffd34d');
      break;
    case 'antler':
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.lineWidth = 0.075; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(0.18 * s, -0.42); ctx.lineTo(0.3 * s, -0.72); ctx.moveTo(0.25 * s, -0.6); ctx.lineTo(0.42 * s, -0.66); ctx.stroke();
        ctx.lineWidth = 0.04; ctx.strokeStyle = '#ffdf7a';
        ctx.beginPath(); ctx.moveTo(0.18 * s, -0.42); ctx.lineTo(0.3 * s, -0.72); ctx.moveTo(0.25 * s, -0.6); ctx.lineTo(0.42 * s, -0.66); ctx.stroke();
      }
      break;
    case 'crown':
      tri(ctx, [-0.3, -0.42, -0.34, -0.74, -0.16, -0.58, 0, -0.8, 0.16, -0.58, 0.34, -0.74, 0.3, -0.42], '#ffd21f');
      blob(ctx, 0, -0.62, 0.05, '#ff3d6e', 0.025); blob(ctx, -0.22, -0.56, 0.035, '#3dd6ff', 0.02); blob(ctx, 0.22, -0.56, 0.035, '#3dd6ff', 0.02);
      break;
    case 'tuft':
      tri(ctx, [-0.06, -0.46, -0.16, -0.68, 0.02, -0.52, 0.12, -0.7, 0.1, -0.46], b);
      break;
    case 'crest':
      blob(ctx, 0, -0.5, 0.11, '#ff3b3b');
      break;
    case 'plume':
      for (const [x, r, col] of [[-0.14, -0.3, '#ffd166'], [0, 0, '#ff5470'], [0.14, 0.3, '#ffd166']]) ellipse(ctx, x, -0.66, 0.07, 0.2, r, col);
      break;
    case 'spikes':
      for (let i = -2; i <= 2; i++) tri(ctx, [i * 0.13 - 0.06, -0.44 + Math.abs(i) * 0.04, i * 0.13, -0.66 + Math.abs(i) * 0.06, i * 0.13 + 0.06, -0.44 + Math.abs(i) * 0.04], d);
      break;
    case 'leaf':
      ellipse(ctx, 0.08, -0.6, 0.08, 0.18, 0.5, '#46c75a');
      break;
    case 'petal':
      for (let i = 0; i < 4; i++) ellipse(ctx, -0.18 + i * 0.12, -0.5, 0.06, 0.1, 0, shade(c.body, 0.15));
      break;
    case 'pleats':
      ctx.lineWidth = 0.03; ctx.strokeStyle = shade(c.body, -0.3);
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 0.07, -0.5); ctx.quadraticCurveTo(i * 0.05, -0.38, i * 0.03, -0.3); ctx.stroke(); }
      break;
    case 'fin':
      tri(ctx, [-0.1, -0.46, 0.06, -0.7, 0.2, -0.44], shade(c.body, -0.15));
      break;
    case 'square':
      break;
  }
}

function drawEye(ctx, x, y, style, side) {
  switch (style) {
    case 'dot':
      blob(ctx, x, y, 0.045, INK, 0);
      blob(ctx, x + 0.015, y - 0.015, 0.014, '#fff', 0);
      return;
    case 'sleepy':
      ctx.lineWidth = 0.04; ctx.strokeStyle = INK; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y - 0.02, 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      return;
    case 'swirl':
      blob(ctx, x, y, 0.1, '#fff');
      ctx.lineWidth = 0.025; ctx.strokeStyle = INK;
      ctx.beginPath();
      for (let t = 0; t < 12; t += 0.2) { const r = 0.006 * t; ctx.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
      ctx.stroke();
      return;
    case 'sly':
      ellipse(ctx, x, y, 0.1, 0.06, 0.2 * side, '#fff');
      blob(ctx, x + 0.02 * side, y, 0.035, INK, 0);
      return;
    default: {
      const big = style === 'sparkle' ? 0.12 : 0.105;
      blob(ctx, x, y, big, '#fff');
      blob(ctx, x + 0.02 * side, y + 0.01, big * 0.55, INK, 0);
      blob(ctx, x + 0.045 * side, y - 0.025, big * 0.2, '#fff', 0);
      if (style === 'sparkle') blob(ctx, x - 0.015 * side, y + 0.035, big * 0.1, '#fff', 0);
      if (style === 'angry') {
        ctx.fillStyle = shade('#000000', 0);
      }
    }
  }
}

function drawBrow(ctx, x, y, kind, side) {
  if (kind === 'none') return;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.065;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  if (kind === 'angry') { ctx.moveTo(x - 0.1 * side, y + 0.03); ctx.lineTo(x + 0.1 * side, y - 0.06); } // 안쪽 낮게·바깥 높게 = 화남
  else { ctx.moveTo(x - 0.09, y - 0.02); ctx.quadraticCurveTo(x, y - 0.09, x + 0.09, y - 0.02); }
  ctx.stroke();
}

function drawMouth(ctx, c) {
  const y = 0.18;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (c.mouth) {
    case 'beak':
      tri(ctx, [-0.12, 0.06, 0.12, 0.06, 0, 0.24], '#ffb02e');
      ctx.lineWidth = 0.025; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-0.1, 0.1); ctx.lineTo(0.1, 0.1); ctx.stroke();
      return;
    case 'open':
      ctx.beginPath(); ctx.ellipse(0, y, 0.09, 0.075, 0, 0, Math.PI * 2); ctx.fillStyle = '#7a1f2b'; ctx.fill();
      ctx.lineWidth = 0.035; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, y + 0.035, 0.05, 0.03, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff7a8a'; ctx.fill();
      return;
    case 'grin':
      ctx.beginPath(); ctx.moveTo(-0.16, y - 0.03); ctx.quadraticCurveTo(0, y + 0.16, 0.16, y - 0.03); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 0.035; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.15, y + 0.005); ctx.lineTo(0.15, y + 0.005); ctx.lineWidth = 0.02; ctx.stroke();
      return;
    case 'fang':
      ctx.beginPath(); ctx.moveTo(-0.13, y - 0.02); ctx.quadraticCurveTo(0, y + 0.1, 0.13, y - 0.02); ctx.lineWidth = 0.04; ctx.strokeStyle = INK; ctx.stroke();
      tri(ctx, [-0.08, y + 0.02, -0.04, y + 0.03, -0.065, y + 0.1], '#fff', 0.02);
      tri(ctx, [0.08, y + 0.02, 0.04, y + 0.03, 0.065, y + 0.1], '#fff', 0.02);
      return;
    case 'tiny':
      ctx.beginPath(); ctx.arc(-0.03, y - 0.02, 0.03, 0, Math.PI); ctx.arc(0.03, y - 0.02, 0.03, 0, Math.PI); ctx.lineWidth = 0.028; ctx.strokeStyle = INK; ctx.stroke();
      return;
    case 'smirk':
      ctx.beginPath(); ctx.moveTo(-0.1, y); ctx.quadraticCurveTo(0.04, y + 0.06, 0.13, y - 0.05); ctx.lineWidth = 0.04; ctx.strokeStyle = INK; ctx.stroke();
      return;
    default:
      ctx.beginPath(); ctx.arc(0, y - 0.05, 0.11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 0.045; ctx.strokeStyle = INK; ctx.stroke();
  }
}

function drawExtraBack(ctx, c) {
  switch (c.extra) {
    case 'tails':
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.62 + i * 0.095);
        ellipse(ctx, Math.cos(a) * 0.5, Math.sin(a) * -0.42 + 0.15, 0.09, 0.2, a + Math.PI / 2, i % 2 ? '#fff' : '#ffe2c8', 0.03);
      }
      break;
    case 'flames':
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.32;
        tri(ctx, [Math.cos(a - 0.12) * 0.42, Math.sin(a - 0.12) * 0.42, Math.cos(a) * 0.68, Math.sin(a) * 0.68, Math.cos(a + 0.12) * 0.42, Math.sin(a + 0.12) * 0.42], i % 2 ? '#ffd166' : '#ff7a45', 0.03);
      }
      break;
    case 'aura':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        tri(ctx, [Math.cos(a - 0.08) * 0.48, Math.sin(a - 0.08) * 0.48, Math.cos(a) * 0.66, Math.sin(a) * 0.66, Math.cos(a + 0.08) * 0.48, Math.sin(a + 0.08) * 0.48], '#fff1a1', 0.02);
      }
      break;
    case 'shell':
      ellipse(ctx, 0, 0.05, 0.56, 0.5, 0, '#2f6d2c');
      break;
    case 'mane':
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; blob(ctx, Math.cos(a) * 0.46, Math.sin(a) * 0.44, 0.13, '#2e8f73', 0.03); }
      break;
    case 'club':
      ctx.save(); ctx.translate(0.42, 0.18); ctx.rotate(-0.6);
      ellipse(ctx, 0, -0.12, 0.07, 0.2, 0, '#b07a3c'); ctx.restore();
      break;
    case 'whiskers':
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.lineWidth = 0.05; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(0.3 * s, 0.12); ctx.bezierCurveTo(0.55 * s, 0.05, 0.62 * s, 0.3, 0.7 * s, 0.22); ctx.stroke();
        ctx.lineWidth = 0.025; ctx.strokeStyle = '#ffe17a';
        ctx.beginPath(); ctx.moveTo(0.3 * s, 0.12); ctx.bezierCurveTo(0.55 * s, 0.05, 0.62 * s, 0.3, 0.7 * s, 0.22); ctx.stroke();
      }
      break;
  }
}

function drawExtraFront(ctx, c) {
  switch (c.extra) {
    case 'steam':
      ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineCap = 'round';
      for (const x of [-0.12, 0.04, 0.2]) { ctx.beginPath(); ctx.moveTo(x, -0.56); ctx.bezierCurveTo(x + 0.06, -0.62, x - 0.06, -0.68, x, -0.76); ctx.stroke(); }
      break;
    case 'sesame':
      for (const [x, y] of [[-0.3, -0.25], [0.28, -0.3], [0.33, 0.05], [-0.34, 0.08]]) ellipse(ctx, x, y, 0.03, 0.018, 0.6, '#fff4cf', 0.012);
      break;
    case 'kimbap':
      // 김 테두리 안의 밥 + 속재료
      blob(ctx, 0, 0.05, 0.36, '#fffaf0', 0.03);
      break;
    case 'syrup':
      ellipse(ctx, 0.2, -0.28, 0.12, 0.06, 0.3, '#8a4b14', 0.02);
      break;
    case 'blush':
    case 'rice':
      blob(ctx, -0.27, 0.08, 0.06, 'rgba(255,120,140,0.45)', 0); blob(ctx, 0.27, 0.08, 0.06, 'rgba(255,120,140,0.45)', 0);
      if (c.extra === 'rice') for (const [x, y] of [[-0.2, -0.3], [0.15, -0.34], [0.3, -0.18]]) ellipse(ctx, x, y, 0.035, 0.02, 0.4, '#fff', 0.012);
      break;
    case 'scales':
      ctx.lineWidth = 0.022; ctx.strokeStyle = shade(c.body, -0.3);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(-0.12 + i * 0.12, 0.34 + j * 0.06, 0.06, 0, Math.PI); ctx.stroke(); }
      break;
    case 'greens':
      for (const [x, y, r] of [[-0.32, -0.12, 0.3], [0.3, 0.22, -0.4], [-0.18, 0.36, 0.9]]) ellipse(ctx, x, y, 0.035, 0.12, r, '#3fae4a', 0.02);
      break;
    case 'flakes':
      for (const [x, y] of [[-0.34, -0.2], [0.31, -0.25], [0.36, 0.18], [-0.3, 0.3]]) tri(ctx, [x, y, x + 0.04, y + 0.02, x + 0.01, y + 0.05], '#b3160b', 0);
      break;
    case 'spots':
      for (const [x, y] of [[-0.3, -0.2], [0.3, 0.25], [0.28, -0.3]]) blob(ctx, x, y, 0.03, shade(c.body, -0.25), 0);
      break;
    case 'glaze':
      ellipse(ctx, -0.18, -0.3, 0.12, 0.05, -0.4, 'rgba(255,255,255,0.45)', 0);
      break;
    case 'noodles':
      ctx.lineWidth = 0.02; ctx.strokeStyle = '#7a5a3a';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-0.42, -0.1 + i * 0.07); ctx.bezierCurveTo(-0.3, -0.2 + i * 0.07, -0.25, 0 + i * 0.07, -0.18, -0.08 + i * 0.07); ctx.stroke(); }
      break;
    case 'stripes':
      ctx.fillStyle = INK;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) tri(ctx, [0.48 * s, -0.2 + i * 0.16, 0.3 * s, -0.16 + i * 0.16, 0.48 * s, -0.12 + i * 0.16], INK, 0);
      tri(ctx, [-0.06, -0.48, 0, -0.32, 0.06, -0.48], INK, 0);
      break;
    case 'wingtips':
      ellipse(ctx, -0.46, 0.15, 0.1, 0.2, 0.5, '#2c6bd6'); ellipse(ctx, 0.46, 0.15, 0.1, 0.2, -0.5, '#2c6bd6');
      break;
    case 'moon':
      ctx.beginPath(); ctx.arc(0.32, -0.3, 0.09, 0, Math.PI * 2); ctx.fillStyle = '#ffe680'; ctx.fill();
      ctx.beginPath(); ctx.arc(0.36, -0.33, 0.08, 0, Math.PI * 2); ctx.fillStyle = shade(c.body, 0); ctx.fill();
      break;
    case 'redcap':
      break;
    case 'bolts':
      tri(ctx, [-0.4, -0.1, -0.32, -0.1, -0.36, 0, -0.3, 0, -0.42, 0.14, -0.38, 0.03, -0.44, 0.03], '#ffd21f', 0.015);
      break;
  }
}

// 캐릭터만 그리기 (정규화 좌표, 반지름 ~0.5)
export function drawCharacter(ctx, c) {
  drawExtraBack(ctx, c);
  drawEars(ctx, c);
  // 몸통 (그라디언트 + 굵은 외곽선)
  const g = ctx.createRadialGradient(-0.15, -0.2, 0.05, 0, 0, 0.55);
  g.addColorStop(0, shade(c.body, 0.25));
  g.addColorStop(0.7, c.body);
  g.addColorStop(1, shade(c.body, -0.22));
  if (c.ears === 'square') {
    ctx.beginPath(); ctx.roundRect(-0.45, -0.42, 0.9, 0.84, 0.16);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.05; ctx.strokeStyle = INK; ctx.stroke();
  } else {
    blob(ctx, 0, 0.02, 0.47, g, 0.05);
  }
  if (c.extra === 'kimbap') {
    blob(ctx, 0, 0.02, 0.36, '#fffaf0', 0.025);
    for (const [x, y, col] of [[-0.12, 0.14, '#ff8c2e'], [0.13, 0.15, '#ffd23f'], [0, 0.26, '#46c75a'], [0.22, 0.0, '#e8402f']]) blob(ctx, x, y, 0.06, col, 0.02);
  } else {
    // 배
    ellipse(ctx, 0, 0.2, 0.3, 0.22, 0, c.belly, 0);
  }
  if (c.extra === 'redcap') blob(ctx, 0, -0.42, 0.1, '#ff3b3b', 0.03);
  if (c.extra === 'shell') {
    ctx.lineWidth = 0.025; ctx.strokeStyle = shade(c.body, -0.4);
    for (const [x, y] of [[-0.25, -0.25], [0.25, -0.25]]) { ctx.beginPath(); ctx.arc(x, y, 0.09, 0, Math.PI * 2); ctx.stroke(); }
  }
  drawExtraFront(ctx, c);
  // 얼굴
  const ey = c.extra === 'kimbap' ? -0.06 : -0.08;
  drawEye(ctx, -0.17, ey, c.eyes, -1);
  drawEye(ctx, 0.17, ey, c.eyes, 1);
  drawBrow(ctx, -0.17, ey - 0.14, c.brow, -1);
  drawBrow(ctx, 0.17, ey - 0.14, c.brow, 1);
  drawMouth(ctx, c);
  // 광택
  ellipse(ctx, -0.2, -0.28, 0.12, 0.06, -0.6, 'rgba(255,255,255,0.55)', 0);
}

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 0.008; ctx.strokeStyle = INK; ctx.stroke();
}

// 90년대 문방구 딱지 인쇄 느낌: 방사형 줄무늬 + 망점 + 굵은 테두리 + 이름 띠
export function drawFace(ctx, size, c) {
  const R = RARITY[c.rarity];
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.scale(size, size);
  // 바탕 원
  ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = R.rays[0]; ctx.fillRect(-0.5, -0.5, 1, 1);
  ctx.fillStyle = R.rays[1];
  for (let i = 0; i < 24; i++) {
    if (i % 2) continue;
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 0.75, a0, a1); ctx.closePath(); ctx.fill();
  }
  // 망점(인쇄 도트)
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = -0.5; y < 0.5; y += 0.03) for (let x = -0.5; x < 0.5; x += 0.03) {
    const r = 0.006 + 0.004 * Math.sin(x * 9) * Math.cos(y * 7);
    ctx.beginPath(); ctx.arc(x + (Math.round(y / 0.03) % 2) * 0.015, y, Math.max(0.002, r), 0, Math.PI * 2); ctx.fill();
  }
  // 캐릭터
  ctx.save(); ctx.translate(0, -0.02); ctx.scale(0.68, 0.68);
  drawCharacter(ctx, c);
  ctx.restore();
  // 이름 띠
  ctx.save();
  ctx.fillStyle = '#d7263d';
  ctx.beginPath(); ctx.roundRect(-0.3, 0.27, 0.6, 0.11, 0.05); ctx.fill();
  ctx.lineWidth = 0.012; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 0.075px "Lilita One", "Black Han Sans", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(c.name.toUpperCase(), 0, 0.327);
  ctx.restore();
  ctx.restore();
  // 테두리 링 (희귀도 색)
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size, size);
  const rg = ctx.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
  rg.addColorStop(0, R.ring[0]); rg.addColorStop(1, R.ring[1]);
  ctx.lineWidth = 0.06; ctx.strokeStyle = rg;
  ctx.beginPath(); ctx.arc(0, 0, 0.465, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.012; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(0, 0, 0.435, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 0.497, 0, Math.PI * 2); ctx.stroke();
  // 링 위 점 + 상단 별(★) 개수 = 희귀도. 원조 동그란 딱지 테두리에 인쇄되던 '별 개수' 문화(리서치 확인)
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (Math.abs(a - Math.PI * 1.5) < 0.75) continue; ctx.beginPath(); ctx.arc(Math.cos(a) * 0.465, Math.sin(a) * 0.465, 0.009, 0, Math.PI * 2); ctx.fill(); }
  const n = R.stars;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 1.5 + (i - (n - 1) / 2) * 0.2;
    star(ctx, Math.cos(a) * 0.465, Math.sin(a) * 0.465, 0.034, '#ffe14d');
  }
  ctx.restore();
}

// 뒷면: 누런 마분지 + 빨간 별 + "딱지" 로고 (모든 딱지 공통 → 뒤집히기 전엔 정체를 모름 = 공개의 쾌감)
export function drawBack(ctx, size) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size, size);
  ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(-0.1, -0.1, 0.05, 0, 0, 0.6);
  g.addColorStop(0, '#f1dcae'); g.addColorStop(1, '#d7b77a');
  ctx.fillStyle = g; ctx.fillRect(-0.5, -0.5, 1, 1);
  // 종이 섬유 노이즈
  for (let i = 0; i < 900; i++) {
    const x = Math.random() - 0.5, y = Math.random() - 0.5;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,30,0.07)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, 0.012, 0.003);
  }
  // 동심원 인쇄 링
  ctx.lineWidth = 0.02; ctx.strokeStyle = '#2f5bd3';
  ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.stroke();
  // 별
  ctx.fillStyle = '#e23b2e';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.12 : 0.3;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.03);
  }
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = 0.014; ctx.strokeStyle = '#7a160f'; ctx.stroke();
  ctx.fillStyle = '#2f5bd3';
  ctx.font = '900 0.09px "Black Han Sans", "Lilita One", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('딱지', 0, 0.3);
  ctx.restore();
}

export function drawEdge(ctx, w, h) {
  // 종이 단면: 여러 겹 레이어
  ctx.fillStyle = '#e2c793';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(140,100,50,0.25)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, (i / 6) * h, w, h / 12);
  }
}

// 희귀도 가중 추첨
export function rollCard(rng, minRarity) {
  const order = ['common', 'rare', 'epic', 'legendary'];
  const allowed = minRarity ? order.slice(order.indexOf(minRarity)) : order;
  const total = allowed.reduce((s, r) => s + RARITY[r].weight, 0);
  let x = rng() * total;
  let rar = allowed[0];
  for (const r of allowed) { x -= RARITY[r].weight; if (x <= 0) { rar = r; break; } }
  const pool = CARDS.filter((c) => c.rarity === rar);
  return pool[Math.floor(rng() * pool.length)].id;
}

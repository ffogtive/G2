// face.js — 부는 얼굴 (얼굴 시안 B "뽀뽀 입 클로즈업" 채택, 3차 피드백: 표정에서부터 '바람을 분다'가 읽혀야 함)
// + 숨 주머니(3차 설계 패널 A안): 충전 중 볼 = 주머니에 찬 숨(절대값, 정답과 무관), 빨개짐·땀·새는 김 = '꽉'에서 버틴 시간(strain)
//
// st = { mode: 'idle'|'charge'|'blow'|'cough', t, who,
//        p     : charge = 주머니 채움 비율(0..~1.12, 1 = 꽉) / blow = 결과 숨 비율(정답 대비, 약함·적정·돌풍 표정)
//        fill  : blow 시작 때 볼 크기(주머니 비율), strain: 0..1 버팀, full: 꽉 래치, windAng: 바람 방향(기본 위) }
//
// 얼굴을 크게, 빨간 오므린 입술을 주인공으로. 바람은 입에서 원뿔로 퍼지는 줄무늬 + 링(충격파) + 머리 쪽 바람 덩어리.
//   charge : 들숨(p<0.42, 입꼬리로 빨려드는 숨 줄) → 참기(볼 풍선이 얼굴 밖으로, 뽀뽀 입이 쭉, 눈 질끈, 콧구멍 벌름)
//            p>1.05 부터 얼굴이 빨개지고 떨림·땀·콧김·입꼬리로 새는 김 (= 너무 많이 참음)
//   blow   : 입이 O 로 열리며 발사, 볼이 0.16초에 꺼지고 머리가 반동. p<0.7 피식 / 0.8~1.0 곧은 원뿔 / >1.1 돌풍+침+머리 날림
//   idle   : 편안한 미소, 3.3초마다 깜박임
// 좌표: S×S 를 0..1 로 정규화. 얼굴은 하단 2/3(머리 중심 y=0.655), 바람은 위 1/3 까지.
// st.aimX(선택, -1..1): 조준 원의 좌우 위치. 고개·눈동자·바람 원뿔이 그쪽으로 기운다 (원 ↔ 얼굴 연결).

const INK = '#2a1a12';
const LW = 0.012; // 기본 잉크 두께 (S 대비)
const TAU = Math.PI * 2;
const HX = 0.5, HY = 0.655, RX = 0.27, RY = 0.255; // 머리 중심·반지름
const MOUTH_Y = 0.14; // 머리 중심 기준 입 위치

const PAL = {
  me: { hair: '#4b2a17', hairHi: '#8a5631', skin: '#ffd09c', skinHi: '#fff0da', skinDk: '#eaa877', shirt: '#3d8bfd', shirtDk: '#235fc4' },
  ai: { hair: '#1e1c2e', hairHi: '#59567f', skin: '#efb47f', skinHi: '#ffe2c2', skinDk: '#d18f5d', shirt: '#ff5a4d', shirtDk: '#c2382c', band: '#ff3b3b' },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function mixHex(c1, c2, k) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = (sh) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const circ = (ctx, x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); };
const ell = (ctx, x, y, rx, ry) => { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); };

// 공기 선: 하늘색 테두리 + 흰 심 (나무 바닥에서도, 피부 위에서도 읽힘)
function airStroke(ctx, build, w, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  build();
  ctx.strokeStyle = '#3fa4ea'; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.48; ctx.stroke();
  ctx.restore();
}

function wavy(ctx, rx, ry, amp, n, ph) {
  ctx.beginPath();
  for (let i = 0; i <= 56; i++) {
    const a = (i / 56) * TAU;
    const w = 1 + amp * Math.sin(a * n + ph);
    const x = Math.cos(a) * rx * w, y = Math.sin(a) * ry * w;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drop(ctx, x, y, r, alpha = 1) {
  if (r <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.8);
  ctx.quadraticCurveTo(x + r * 1.05, y - r * 0.4, x + r, y + r * 0.15);
  ctx.arc(x, y + r * 0.15, r, 0, Math.PI);
  ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.4, x, y - r * 1.8);
  ctx.fillStyle = '#bfe8ff'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.007; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, y, r * 0.22, r * 0.35, 0.3, 0, TAU); ctx.fill();
  ctx.restore();
}

function puffBall(ctx, x, y, r, alpha) {
  if (alpha <= 0.01 || r <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); circ(ctx, x, y, r); circ(ctx, x + r * 0.8, y + r * 0.25, r * 0.7); circ(ctx, x - r * 0.75, y + r * 0.3, r * 0.65);
  ctx.strokeStyle = INK; ctx.lineWidth = clamp(r * 0.4, 0.004, 0.012); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

// ── 몸통(어깨·옷깃) — 나 = 파랑, 상대 = 빨강 (딱지 소유 색과 같음) ──
function drawBody(ctx, pal) {
  ctx.lineWidth = LW * 1.6; ctx.strokeStyle = INK;
  ctx.fillStyle = pal.skinDk;
  ctx.beginPath(); ctx.rect(HX - 0.06, 0.84, 0.12, 0.12); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(HX, 1.1, 0.4, 0.2, 0, 0, TAU);
  ctx.fillStyle = pal.shirt; ctx.fill(); ctx.stroke();
  ctx.fillStyle = pal.shirtDk;
  ctx.beginPath(); ctx.ellipse(HX, 1.13, 0.3, 0.12, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  for (const sg of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(HX, 0.955); ctx.lineTo(HX + sg * 0.1, 0.915); ctx.lineTo(HX + sg * 0.085, 0.985); ctx.closePath();
    ctx.fill(); ctx.lineWidth = LW; ctx.stroke();
  }
}

// ── 머리 실루엣: 뒷머리 뽀글 + 얼굴 + 볼 풍선을 하나의 잉크 외곽선으로 ──
export const CHEEK_R0 = 0.055, CHEEK_R1 = 0.137;
const cheekR = (puff) => Math.sqrt(CHEEK_R0 * CHEEK_R0 + (CHEEK_R1 * CHEEK_R1 - CHEEK_R0 * CHEEK_R0) * clamp(puff, 0, 1.15));
function drawHead(ctx, pal, skin, skinHi, puff, hairFly) {
  const cr = cheekR(puff), k = (cr - CHEEK_R0) / (CHEEK_R1 - CHEEK_R0), cx = 0.17 + 0.085 * k, cy = 0.075;
  const hair = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = ((-190 + (200 * i) / (N - 1)) * Math.PI) / 180;
    const fly = hairFly * (0.035 + 0.035 * hash(i + 3));
    hair.push([Math.cos(a) * (RX + fly * 1.2), Math.sin(a) * (RY + 0.012 + fly) - fly * 0.5, 0.066 + 0.012 * hash(i)]);
  }
  const shape = (withHair) => {
    ctx.beginPath();
    if (withHair) for (const [x, y, r] of hair) circ(ctx, x, y, r);
    ell(ctx, 0, 0, RX, RY);
    circ(ctx, -cx, cy, cr); circ(ctx, cx, cy, cr);
  };
  shape(true);
  ctx.strokeStyle = INK; ctx.lineWidth = LW * 3; ctx.stroke();
  ctx.beginPath(); for (const [x, y, r] of hair) circ(ctx, x, y, r);
  ctx.fillStyle = pal.hair; ctx.fill();
  ctx.strokeStyle = pal.hairHi; ctx.lineWidth = 0.009;
  for (const [x, y, r] of hair) { ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.1, r * 0.5, Math.PI * 1.05, Math.PI * 1.8); ctx.stroke(); }
  shape(false);
  const g = ctx.createRadialGradient(-0.09, -0.1, 0.02, 0, 0.02, 0.44);
  g.addColorStop(0, skinHi); g.addColorStop(1, skin);
  ctx.fillStyle = g; ctx.fill();
  return { cx, cr, cy };
}

function drawCheeks(ctx, geo, puff, heat, charge, t) {
  const { cx, cr, cy } = geo;
  for (const sg of [-1, 1]) {
    const gg = Math.round(lerp(105, 55, heat)), bb = Math.round(lerp(115, 65, heat));
    ctx.fillStyle = `rgba(255,${gg},${bb},${0.36 + 0.22 * Math.min(1, puff) + 0.25 * heat})`;
    ctx.beginPath(); ctx.ellipse(sg * cx * 0.97, cy + 0.014, cr * 0.62, cr * 0.42, 0, 0, TAU); ctx.fill();
    // 볼과 얼굴 사이 주름 — 볼이 '얼굴 밖으로 튀어나온 풍선'으로 읽히게
    const k = smooth(0.3, 0.8, puff);
    if (k > 0) {
      ctx.strokeStyle = `rgba(42,26,18,${0.8 * k})`; ctx.lineWidth = LW * 0.9;
      ctx.beginPath();
      if (sg < 0) ctx.arc(-cx, cy, cr, -0.55, 0.8); else ctx.arc(cx, cy, cr, Math.PI - 0.8, Math.PI + 0.55);
      ctx.stroke();
    }
    // 풍선 반짝임
    const s = smooth(0.3, 0.9, puff);
    if (s > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * s})`;
      ctx.beginPath(); ctx.ellipse(sg * (cx + cr * 0.3), cy - cr * 0.5, cr * 0.26, cr * 0.12, sg * 0.55, 0, TAU); ctx.fill();
    }
    // 압력선 (빵빵)
    if (charge) {
      const a = smooth(0.7, 1.0, puff);
      if (a > 0) {
        ctx.strokeStyle = `rgba(42,26,18,${0.85 * a})`; ctx.lineWidth = LW * 0.85;
        const c = sg < 0 ? Math.PI : 0;
        const pulse = 0.004 * Math.sin(t * 20);
        ctx.beginPath(); ctx.arc(sg * cx, cy, cr + 0.026 + pulse, c - 0.38, c + 0.38); ctx.stroke();
        ctx.beginPath(); ctx.arc(sg * cx, cy, cr + 0.05 + pulse, c - 0.22, c + 0.22); ctx.stroke();
      }
    }
  }
}

function drawBangs(ctx, pal, ai, hairFly) {
  const B = [[-0.175, -0.185, 0.056], [-0.09, -0.212, 0.062], [0, -0.222, 0.064], [0.09, -0.212, 0.062], [0.175, -0.185, 0.056]];
  const lift = hairFly * 0.025;
  ctx.beginPath(); for (const [x, y, r] of B) circ(ctx, x, y - lift, r);
  ctx.strokeStyle = INK; ctx.lineWidth = LW * 2.2; ctx.stroke();
  ctx.fillStyle = pal.hair; ctx.fill();
  ctx.strokeStyle = pal.hairHi; ctx.lineWidth = 0.009;
  for (const [x, y, r] of B) { ctx.beginPath(); ctx.arc(x - r * 0.1, y - lift - r * 0.05, r * 0.5, Math.PI * 1.05, Math.PI * 1.8); ctx.stroke(); }
  if (ai) {
    // 상대: 빨간 머리띠 + 매듭
    ctx.beginPath(); ctx.moveTo(-0.285, -0.095); ctx.quadraticCurveTo(0, -0.275, 0.285, -0.095);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.064; ctx.stroke();
    ctx.strokeStyle = pal.band; ctx.lineWidth = 0.04; ctx.stroke();
    ctx.fillStyle = pal.band; ctx.strokeStyle = INK; ctx.lineWidth = LW;
    for (const [dx, dy] of [[0.1, -0.05], [0.085, 0.03]]) {
      ctx.beginPath(); ctx.moveTo(0.27, -0.11); ctx.lineTo(0.27 + dx, -0.11 + dy - 0.02); ctx.lineTo(0.27 + dx * 0.9, -0.11 + dy + 0.025); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0.27, -0.11, 0.022, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

function drawBrows(ctx, inner, outer) {
  ctx.strokeStyle = INK; ctx.lineWidth = 0.025;
  for (const sg of [-1, 1]) {
    const by = -0.118;
    const x0 = sg * 0.05, x1 = sg * 0.155, y0 = by + inner, y1 = by + outer;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 0.014, x1, y1); ctx.stroke();
  }
}

// kind: open | blink | up | squeeze | half | focus | bulge
function drawEyes(ctx, kind, skin, aimX, heat) {
  for (const sg of [-1, 1]) {
    ctx.save();
    ctx.translate(sg * 0.105, -0.045);
    ctx.strokeStyle = INK; ctx.fillStyle = INK;
    if (kind === 'blink') {
      ctx.lineWidth = LW * 1.6;
      ctx.beginPath(); ctx.moveTo(-0.036, 0); ctx.quadraticCurveTo(0, 0.024, 0.036, 0); ctx.stroke();
    } else if (kind === 'squeeze') {
      // 질끈 > <
      const k = 1 + heat * 0.2;
      ctx.lineWidth = LW * 1.9;
      ctx.beginPath();
      ctx.moveTo(-sg * 0.036 * k, -0.03 * k); ctx.lineTo(sg * 0.026, 0); ctx.lineTo(-sg * 0.036 * k, 0.027 * k);
      ctx.stroke();
      ctx.lineWidth = LW * 0.8;
      ctx.beginPath();
      ctx.moveTo(sg * 0.044, -0.012); ctx.lineTo(sg * 0.062, -0.022);
      ctx.moveTo(sg * 0.046, 0.012); ctx.lineTo(sg * 0.064, 0.02);
      ctx.stroke();
    } else {
      const big = kind === 'bulge';
      const rx = big ? 0.056 : 0.042, ry = big ? 0.066 : 0.052;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = LW * 1.25; ctx.stroke();
      const pr = big ? 0.012 : 0.022;
      const px = aimX * 0.013 + (big ? sg * -0.006 : 0);
      const py = kind === 'up' || kind === 'focus' ? -0.017 : kind === 'half' ? -0.004 : big ? -0.01 : 0;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.36, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      if (kind === 'half' || kind === 'focus') {
        // 윗눈꺼풀: half = 맥 빠짐(바깥쪽 처짐) / focus = 집중(안쪽이 내려옴)
        const yl = -ry + 2 * ry * (kind === 'half' ? 0.48 : 0.3);
        const yIn = yl + (kind === 'focus' ? 0.016 : -0.006), yOut = yl + (kind === 'focus' ? -0.01 : 0.01);
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
        ctx.beginPath(); ctx.moveTo(-sg * rx * 1.2, -ry * 1.2); ctx.lineTo(sg * rx * 1.2, -ry * 1.2);
        ctx.lineTo(sg * rx * 1.2, yOut); ctx.lineTo(-sg * rx * 1.2, yIn); ctx.closePath();
        ctx.fillStyle = skin; ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.lineWidth = LW * 1.25; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-sg * rx, yIn); ctx.lineTo(sg * rx, yOut); ctx.lineWidth = LW * 1.5; ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawNose(ctx, skinDk, flare) {
  const w = 0.026 + 0.012 * flare;
  ctx.fillStyle = skinDk;
  ctx.beginPath(); ctx.ellipse(0, 0.028, w, 0.021, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = LW;
  ctx.beginPath(); ctx.moveTo(-w, 0.024); ctx.quadraticCurveTo(-w * 0.95, 0.051, 0, 0.051); ctx.quadraticCurveTo(w * 0.95, 0.051, w, 0.024); ctx.stroke();
  const nr = 0.004 + 0.009 * flare;
  ctx.fillStyle = INK;
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sg * (0.011 + 0.006 * flare), 0.038, nr, nr * 0.7, sg * 0.4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-w * 0.35, 0.018, w * 0.25, 0.006, -0.3, 0, TAU); ctx.fill();
}

// 입 — 주인공. 반환값 = 입구멍 반지름(바람 원뿔의 시작 폭)
function drawMouth(ctx, mode, p, t, heat) {
  ctx.save();
  ctx.translate(0, MOUTH_Y);
  let hole = 0.012;
  if (mode === 'idle') {
    ctx.beginPath();
    ctx.moveTo(-0.046, 0);
    ctx.quadraticCurveTo(-0.022, -0.024, 0, -0.011);
    ctx.quadraticCurveTo(0.022, -0.024, 0.046, 0);
    ctx.quadraticCurveTo(0, 0.044, -0.046, 0);
    ctx.closePath();
    ctx.fillStyle = '#e8304a'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = LW * 1.1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.04, 0.001); ctx.quadraticCurveTo(0, 0.013, 0.04, 0.001);
    ctx.strokeStyle = '#7a1020'; ctx.lineWidth = 0.006; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-0.018, -0.011, 0.01, 0.004, -0.3, 0, TAU); ctx.fill();
    ctx.restore();
    return hole;
  }
  const pk = smooth(0, 1, p);
  const pr = 0.042 + 0.036 * pk; // 오므린 입술 크기 — 참을수록 쭉 나옴
  let ro = pr, holeK = 0.2, wav = 0.075, open = 0, ryK = 0.86;
  if (mode === 'blow') {
    open = ease(t / 0.05);
    const target = p < 0.7 ? 0.046 : p > 1.1 ? 0.09 : 0.064 + 0.016 * smooth(0.8, 1.1, p);
    ro = lerp(pr, target, open) * (1 - 0.22 * smooth(0.4, 0.62, t));
    holeK = lerp(0.2, p < 0.7 ? 0.34 : p > 1.1 ? 0.64 : 0.56, open);
    wav = lerp(0.075, 0.035, open);
    ryK = lerp(0.86, 0.95, open);
    if (p < 0.7) { ctx.translate(0.012, 0.004); ctx.rotate(0.24); } // 피식: 입이 한쪽으로 삐죽
  } else if (heat > 0) {
    ctx.translate(Math.sin(t * 90) * 0.004 * heat, 0); // 참다 못해 입술 떨림
  }
  const rx = ro * 1.06, ry = ro * ryK;
  // 앞으로 튀어나온 그림자
  ctx.fillStyle = 'rgba(140,50,30,0.25)';
  ctx.beginPath(); ctx.ellipse(0, ry * 0.5, rx * 1.12, ry * 0.82, 0, 0, TAU); ctx.fill();
  // 입술
  wavy(ctx, rx, ry, wav, 7, 0.4);
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.45, ro * 0.08, 0, 0, ro * 1.15);
  g.addColorStop(0, '#ff8a92'); g.addColorStop(0.55, '#e8304a'); g.addColorStop(1, '#a8172f');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = LW * 1.25; ctx.stroke();
  // 오므림 주름
  const hrx = Math.max(0.01, rx * holeK), hry = Math.max(0.007, ry * holeK * 0.9);
  ctx.strokeStyle = 'rgba(95,10,28,0.55)'; ctx.lineWidth = 0.0055;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.35, c = Math.cos(a), s = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(c * (hrx + 0.006), s * (hry + 0.006)); ctx.lineTo(c * rx * 0.7, s * ry * 0.7); ctx.stroke();
  }
  // 구멍
  ctx.beginPath(); ctx.ellipse(0, 0, hrx, hry, 0, 0, TAU);
  const hg = ctx.createRadialGradient(0, hry * 0.3, 0, 0, 0, Math.max(hrx, hry));
  hg.addColorStop(0, '#1a0206'); hg.addColorStop(1, '#5a0d1a');
  ctx.fillStyle = hg; ctx.fill();
  if (mode === 'blow' && p > 1.1 && open > 0.5) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ff6f86'; ctx.beginPath(); ctx.ellipse(0, hry * 0.85, hrx * 0.7, hry * 0.45, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = LW * 0.8; ctx.stroke();
  // 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.beginPath(); ctx.ellipse(-rx * 0.45, -ry * 0.52, rx * 0.2, ry * 0.11, -0.6, 0, TAU); ctx.fill();
  // 참다 못해 입꼬리로 새는 김 (과호흡)
  if (mode === 'charge' && heat > 0.35) {
    const ph = (t * 2.4) % 1, a = (heat - 0.35) / 0.65;
    puffBall(ctx, rx + 0.012 + ph * 0.05, -ry * 0.25 - ph * 0.03, 0.012 + ph * 0.012, a * (1 - ph * 0.7));
    airStroke(ctx, () => { ctx.beginPath(); ctx.moveTo(rx * 0.9, -ry * 0.05); ctx.lineTo(rx + 0.05, -ry * 0.25); }, 0.012, a);
  }
  hole = Math.min(hrx, hry * 1.1);
  ctx.restore();
  return hole;
}

// 들숨: 양옆에서 입꼬리로 빨려 들어오는 점선 숨 (p<0.42)
function drawInhale(ctx, p, t) {
  const a = 1 - smooth(0.2, 0.42, p);
  if (a <= 0) return;
  for (const sg of [-1, 1]) for (let j = 0; j < 2; j++) {
    const y0 = 0.02 + j * 0.1, ex = sg * 0.075, ey = MOUTH_Y + 0.004, qx = sg * 0.27, qy = y0 + 0.08;
    airStroke(ctx, () => {
      ctx.setLineDash([0.034, 0.022]); ctx.lineDashOffset = -t * 0.25;
      ctx.beginPath(); ctx.moveTo(sg * 0.47, y0); ctx.quadraticCurveTo(qx, qy, ex, ey);
    }, 0.02, 0.9 * a);
    const dx = ex - qx, dy = ey - qy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    airStroke(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(ex - ux * 0.026 - uy * 0.018, ey - uy * 0.026 + ux * 0.018); ctx.lineTo(ex, ey);
      ctx.lineTo(ex - ux * 0.026 + uy * 0.018, ey - uy * 0.026 - ux * 0.018);
    }, 0.02, 0.9 * a);
  }
}

// 과호흡 참기: 떨림선·땀·빡침 마크·콧김
function drawStrain(ctx, heat, t, geo) {
  ctx.strokeStyle = `rgba(42,26,18,${heat})`; ctx.lineWidth = LW * 0.9;
  const ox = Math.max(RX, geo.cx + geo.cr) + 0.03;
  for (const sg of [-1, 1]) for (let j = 0; j < 2; j++) {
    const x = sg * (ox + j * 0.024);
    ctx.beginPath(); ctx.moveTo(x, -0.06 + j * 0.012); ctx.quadraticCurveTo(x + sg * 0.014, 0.0, x, 0.06 - j * 0.012); ctx.stroke();
  }
  drop(ctx, 0.235, -0.07 + ((t * 0.12) % 0.04), 0.022 * heat);
  drop(ctx, -0.235, -0.06, 0.016 * heat);
  drop(ctx, 0.37 + ((t * 0.3) % 0.06), -0.2, 0.017 * heat, heat);
  // 빡침 마크
  const vx = -0.2, vy = -0.27, s = 0.034 * heat;
  for (const [col, w] of [[INK, s * 0.62], ['#ff3048', s * 0.32]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath(); ctx.arc(vx + Math.cos(a) * s * 0.95, vy + Math.sin(a) * s * 0.95, s * 0.6, a + Math.PI * 0.62, a + Math.PI * 1.38); ctx.stroke();
    }
  }
  // 콧김
  if (heat > 0.3) for (const sg of [-1, 1]) {
    const ph = (t * 1.8 + (sg > 0 ? 0.5 : 0)) % 1;
    puffBall(ctx, sg * (0.05 + 0.07 * ph), 0.042 - 0.012 * ph, 0.01 + 0.012 * ph, heat * (1 - ph * 0.8));
  }
}

// 콜록: 너무 오래 참아서 숨이 터져 나감 — 회색 구름이 양옆으로, 볼이 푹 꺼짐
function drawCough(ctx, t) {
  for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
    const k = clamp(t * 2.2 - i * 0.18, 0, 1);
    if (k <= 0) continue;
    const x = sg * (0.06 + 0.3 * ease(k)), y = MOUTH_Y - 0.01 - 0.06 * k + i * 0.03;
    ctx.save(); ctx.globalAlpha = 1 - k * 0.7;
    ctx.beginPath(); circ(ctx, x, y, 0.03 + 0.03 * k); circ(ctx, x + sg * 0.03, y + 0.01, 0.022 + 0.02 * k);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.008; ctx.stroke(); ctx.fillStyle = '#d9d4cf'; ctx.fill();
    ctx.restore();
  }
}

// 돌풍: 머리카락이 뒤로 휘날림 + 뜯겨 나가는 곱슬
function drawHairWhip(ctx, pal, t, k) {
  ctx.strokeStyle = `rgba(42,26,18,${0.85 * k})`; ctx.lineWidth = LW * 0.9;
  for (let i = 0; i < 7; i++) {
    const a = ((-165 + i * 25) * Math.PI) / 180;
    const r0 = 0.38 + 0.02 * hash(i + 9), r1 = r0 + 0.05 + 0.04 * hash(i + 11);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.95); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.95); ctx.stroke();
  }
}

// ── 바람 ──────────────────────────────────────────────
// (ox,oy) = 입 위치(월드), ang = 진행 방향, w0 = 입구멍 반지름
function drawWind(ctx, ox, oy, ang, p, t, w0) {
  const fade = 1 - smooth(0.4, 0.62, t);
  if (fade <= 0.001) return;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(ang + Math.PI / 2); // 로컬 -y = 바람 진행 방향
  if (p < 0.7) weakWisp(ctx, p, t, w0, fade);
  else jet(ctx, p, t, w0, fade);
  ctx.restore();
}

// 입술 앞 충격파 고리 — '퍽' 하는 순간 입을 중심으로 퍼짐
function muzzleRing(ctx, w0, t, size, dur) {
  const k = ease(t / dur), al = 1 - smooth(dur * 0.45, dur, t);
  const r = w0 + 0.02 + size * k;
  airStroke(ctx, () => { ctx.beginPath(); ctx.ellipse(0, -r * 0.12, r, r * 0.86, 0, 0, TAU); }, 0.018, al);
}

// 약함: '피식' — 짧은 김이 조금 오르다 옆으로 꺾여 처지고, 조각으로 흩어짐
function weakWisp(ctx, p, t, w0, fade) {
  const k = p / 0.7;
  const grow = ease(t / 0.12);
  const broke = smooth(0.1, 0.32, t);
  const al = fade * (1 - 0.55 * broke);
  const Lw = (0.07 + 0.06 * k) * grow;
  const ex = Lw * 0.95, ey = -Lw * 0.55 + broke * 0.03;
  muzzleRing(ctx, w0, t, 0.035 * k, 0.16);
  airStroke(ctx, () => {
    if (broke > 0) ctx.setLineDash([0.026 * (1 - broke * 0.5), 0.01 + 0.03 * broke]);
    ctx.beginPath();
    ctx.moveTo(0, -w0 - 0.004);
    ctx.quadraticCurveTo(0.004, -Lw * 1.35, ex, ey);
    ctx.arc(ex, ey + 0.014, 0.014, -Math.PI / 2, Math.PI * 0.9, false); // 맥없이 말려 처짐
  }, 0.016, al);
  const sp = 0.01 + broke * 0.045;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI * 0.35 + (i - 1) * 1.2;
    puffBall(ctx, ex + 0.01 + Math.cos(a) * sp, ey - 0.012 + Math.sin(a) * sp + broke * 0.02, (0.015 - i * 0.002) * grow * (1 - 0.45 * broke), al);
  }
}

// 적정/과함: 얼굴 위는 좁은 분사(얼굴을 가리지 않게) → 머리 위에서 원뿔로 확 퍼짐 + 줄무늬 + 링 + 바람 덩어리
function jet(ctx, p, t, w0, fade) {
  const over = p > 1.1;
  const ok = smooth(0.7, 0.85, p);
  const L = over ? 0.76 : lerp(0.46, 0.63, ok);
  const NECK = 0.4; // 입→머리 꼭대기 거리쯤. 여기부터 원뿔이 벌어진다
  const B = over ? 0.3 : lerp(0.08, 0.15, ok);
  const head = L * ease(t / 0.2);
  const tail = L * 0.9 * smooth(0.22, 0.55, t);
  const turb = over ? 1 : 0;
  const W = (s) => w0 * 0.85 + s * 0.05 + B * smooth(NECK - 0.12, L, s);
  const jx = (s, f) => turb * Math.sin(s * 20 - t * 45 + f * 2.5) * 0.026 * smooth(0.25, L, s);
  muzzleRing(ctx, w0, t, over ? 0.17 : 0.12 * p, 0.15);
  // 1) 원뿔 몸통 — 머리 위로 갈수록 진해지다 끝(바람 덩어리 뒤)에서 사라짐
  if (head > tail + 0.02) {
    ctx.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) { const s = lerp(tail, head, i / steps); ctx.lineTo(-W(s) + jx(s, -1), -s); }
    for (let i = steps; i >= 0; i--) { const s = lerp(tail, head, i / steps); ctx.lineTo(W(s) + jx(s, 1), -s); }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, -head);
    g.addColorStop(0, `rgba(255,255,255,${0.05 * fade})`);
    g.addColorStop(0.5, `rgba(255,255,255,${0.12 * fade})`);
    g.addColorStop(0.85, `rgba(255,255,255,${0.32 * fade})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fill();
  }
  // 2) 분사 심지 — 입에서 머리 위까지 이어지는 빠른 점선 (흐름 방향으로 움직임)
  const lanes = over ? [-0.55, 0, 0.55] : [-0.4, 0.4];
  for (const f of lanes) {
    const s0 = Math.max(tail, w0 + 0.012), s1 = head - 0.02;
    if (s1 <= s0 + 0.02) continue;
    airStroke(ctx, () => {
      ctx.setLineDash([0.07, 0.035]); ctx.lineDashOffset = -t * 1.6 + f;
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) { const s = lerp(s0, s1, k / 14); const x = f * W(s) * 0.75 + jx(s, f); if (k) ctx.lineTo(x, -s); else ctx.moveTo(x, -s); }
    }, 0.02, fade);
  }
  // 3) 퍼지는 줄무늬 (머리 위 원뿔 안)
  const N = over ? 9 : 7;
  for (let i = 0; i < N; i++) {
    const f = lerp(-0.85, 0.85, i / (N - 1)) + (hash(i) - 0.5) * 0.1;
    const s1 = head - (0.03 + hash(i + 7) * 0.18) * L;
    const len = (0.06 + 0.06 * p) * (0.7 + hash(i + 3) * 0.6);
    const s0 = Math.max(tail + 0.01, NECK - 0.04, s1 - len);
    if (s1 <= s0 + 0.015) continue;
    airStroke(ctx, () => {
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const s = lerp(s0, s1, k / 6); const x = f * W(s) * 0.85 + jx(s, f); if (k) ctx.lineTo(x, -s); else ctx.moveTo(x, -s); }
    }, 0.02, fade);
  }
  // 4) 링(충격파) — 이마 위에서부터 차례로 커지며 올라감 (얼굴을 덮지 않게)
  const nR = over ? 4 : 2;
  for (let j = 0; j < nR; j++) {
    const a = t - 0.03 - j * 0.07;
    if (a <= 0) continue;
    const s = lerp(0.3, L * 0.93, ease(a / 0.22));
    if (s > head) continue;
    const al = fade * (1 - smooth(0.16, 0.3, a));
    const rx = W(s) * 1.12, ry = rx * 0.34, cx = jx(s, 0);
    // 앞쪽 호(아래)는 진하게, 뒤쪽 호(위)는 흐리게 → '날아가는 고리'로 읽힘 (깔때기 X)
    for (const [th0, th1, k] of [[Math.PI, TAU, 0.4], [0, Math.PI, 1]]) {
      airStroke(ctx, () => {
        ctx.beginPath();
        for (let q = 0; q <= 20; q++) {
          const th = lerp(th0, th1, q / 20), w = 1 + turb * 0.12 * Math.sin(th * 3 + j * 1.7 + t * 30);
          const x = cx + Math.cos(th) * rx * w, y = -s + Math.sin(th) * ry * w;
          if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
      }, (over ? 0.026 : 0.024) * (0.7 + 0.3 * k), al * k);
    }
  }
  // 5) 바람 덩어리 (원뿔 머리) + 소용돌이
  const cb = (over ? 0.125 : lerp(0.06, 0.088, ok)) * ease(t / 0.12);
  if (cb > 0.004 && head > 0.05) {
    const shakeX = over ? Math.sin(t * 60) * 0.02 : 0;
    const ccx = jx(head, 0) + shakeX, ccy = -head - cb * 0.2;
    const nL = over ? 9 : 7;
    const lobes = [[ccx, ccy, cb * 0.62]];
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * TAU + 0.3;
      const jit = over ? Math.sin(t * 55 + i * 2) * 0.012 : 0;
      lobes.push([ccx + Math.cos(a) * cb * 0.72 + jit, ccy + Math.sin(a) * cb * 0.5 + jit, cb * (0.36 + 0.14 * hash(i + 21))]);
    }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath(); for (const [x, y, r] of lobes) circ(ctx, x, y, r);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.018; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#c8ebff';
    ctx.beginPath(); ctx.ellipse(ccx - cb * 0.15, ccy + cb * 0.55, cb * 1.2, cb * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#3fa4ea'; ctx.lineWidth = 0.009;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const u = k / 30, th = u * TAU * 1.6 + t * (over ? 30 : 14), r = cb * 0.5 * u;
      const x = ccx + Math.cos(th) * r * 1.3, y = ccy + Math.sin(th) * r * 0.8;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 6) 과함: 침방울이 사방으로 튐 (콜록)
  if (over) {
    for (let i = 0; i < 9; i++) {
      const a = (hash(i + 20) - 0.5) * 2.4, sp = 0.7 + hash(i + 30) * 0.8, tt = t - hash(i + 40) * 0.05;
      if (tt <= 0) continue;
      const x = Math.sin(a) * sp * tt, y = -Math.cos(a) * sp * tt + 1.4 * tt * tt;
      drop(ctx, x, y, 0.009 + hash(i + 50) * 0.008, fade * (1 - smooth(0.28, 0.48, tt)));
    }
  }
}

// ── 공개 함수 ─────────────────────────────────────────
export function drawBlowFace(ctx, S, st = {}) {
  const mode = st.mode === 'charge' || st.mode === 'blow' || st.mode === 'cough' ? st.mode : 'idle';
  const charge = mode === 'charge', blow = mode === 'blow', cough = mode === 'cough';
  const p = clamp(Number(st.p) || 0, 0, 1.3);
  const strain = clamp(Number(st.strain) || 0, 0, 1);
  const fill = clamp(st.fill ?? p, 0, 1.15);
  const t = Math.max(0, Number(st.t) || 0);
  const ai = st.who === 'ai';
  const pal = ai ? PAL.ai : PAL.me;
  const aimX = clamp(Number(st.aimX) || 0, -1, 1);
  const weakB = blow && p < 0.7, overB = blow && p > 1.1;

  // 빨개짐은 '정답 대비 숨'이 아니라 '꽉에서 버틴 시간'에서만 (정답 누설 금지 — 3차 설계 패널)
  const heat = charge ? strain : overB ? 0.8 * (1 - smooth(0.1, 0.5, t)) : cough ? 0.6 * (1 - smooth(0.2, 0.7, t)) : 0;
  const puff = charge ? (st.full ? 1 : Math.min(1, p)) : blow ? fill * (1 - ease(t / 0.16)) : 0;
  const recoil = blow ? (0.012 + 0.035 * smooth(0.8, 1.25, p)) * smooth(0, 0.035, t) * (1 - smooth(0.1, 0.45, t)) : 0;
  const shake = charge ? Math.sin(t * 73) * (0.002 + 0.01 * heat) * (st.full ? 1 : heat > 0 ? 1 : 0) : overB ? Math.sin(t * 61) * 0.007 * (1 - smooth(0.15, 0.45, t)) : cough ? Math.sin(t * 50) * 0.012 * (1 - smooth(0.2, 0.6, t)) : 0;
  const bob = mode === 'idle' ? Math.sin(t * 2.2) * 0.004 : 0;
  const tilt = aimX * 0.12;
  const hairFly = overB ? smooth(0, 0.05, t) * (1 - smooth(0.3, 0.6, t)) : 0;
  const skin = mixHex(pal.skin, '#ff6f5a', heat * 0.85);
  const skinHi = mixHex(pal.skinHi, '#ffb3a0', heat * 0.8);

  // 표정 결정
  let eye = 'open', bIn = -0.004, bOut = 0;
  if (mode === 'idle') {
    if ((t + 0.6) % 3.3 > 3.16) eye = 'blink';
  } else if (cough) {
    eye = 'squeeze'; bIn = 0.03; bOut = -0.02;
  } else if (charge) {
    if (p < 0.4) { eye = 'up'; bIn = -0.016; bOut = -0.006; }
    else { eye = 'squeeze'; bIn = lerp(0.008, 0.03, smooth(0.4, 1.2, p)); bOut = -0.012; }
  } else {
    const sq = weakB ? 0.04 : 0.1;
    if (t < sq) { eye = 'squeeze'; bIn = 0.022; bOut = -0.012; }
    else if (weakB) { eye = 'half'; bIn = -0.022; bOut = 0.01; }
    else if (overB) { eye = 'bulge'; bIn = -0.034; bOut = -0.03; }
    else { eye = 'focus'; bIn = 0.018; bOut = -0.01; }
  }
  const flare = charge ? smooth(0.2, 1.1, p) : blow ? 0.35 * (1 - smooth(0.1, 0.4, t)) : 0;

  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.scale(S, S);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  drawBody(ctx, pal);

  ctx.save();
  ctx.translate(HX + shake, HY + recoil + bob);
  ctx.rotate(tilt);
  if (hairFly > 0) drawHairWhip(ctx, pal, t, hairFly);
  const geo = drawHead(ctx, pal, skin, skinHi, puff, hairFly);
  drawCheeks(ctx, geo, puff, heat, charge, t);
  drawBangs(ctx, pal, ai, hairFly);
  drawBrows(ctx, bIn, bOut);
  drawEyes(ctx, eye, skin, aimX, heat);
  drawNose(ctx, mixHex(pal.skinDk, '#e0503e', heat * 0.7), flare);
  const hole = drawMouth(ctx, cough ? 'blow' : mode, cough ? 0.5 : p, t, heat);
  if (charge && heat > 0) drawStrain(ctx, heat, t, geo);
  if (charge && p < 0.42) drawInhale(ctx, p, t);
  if (cough) drawCough(ctx, t);
  ctx.restore();

  if (blow) {
    const mx = HX + shake - Math.sin(tilt) * MOUTH_Y;
    const my = HY + recoil + Math.cos(tilt) * MOUTH_Y;
    drawWind(ctx, mx, my, (st.windAng ?? -Math.PI / 2) + aimX * 0.38, p, t, hole);
  }
  ctx.restore();
}

// ── 숨 주머니 고리 (3차 설계 패널 A안) ─────────────────────────
// 얼굴 둘레의 큰 고리 = 한 번에 들이쉴 수 있는 숨의 끝('꽉'). 볼이 부풀어 고리에 닿으면 꽉 찬 것.
// 고정된 절대 자 — 판(더미 양)에 따라 움직이지 않으므로 정답을 알려 주지 않는다.
// st = { fill: 0..~1.12, full, over(꽉 너머로 우겨넣는 중), strain, t }
export const RING_RX = 0.4, RING_RY = 0.37;
export function drawPouchRing(ctx, S, st = {}) {
  const fill = clamp(Number(st.fill) || 0, 0, 1.2);
  const t = Number(st.t) || 0;
  ctx.save();
  ctx.scale(S, S);
  ctx.translate(HX, HY);
  const wob = st.over ? 1 + 0.012 * Math.sin(t * 40) : 1;
  ctx.beginPath(); ctx.ellipse(0, 0, RING_RX * wob, RING_RY * wob, 0, 0, TAU);
  if (st.over) {
    ctx.setLineDash([]); ctx.strokeStyle = INK; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.strokeStyle = '#e8304a'; ctx.lineWidth = 0.016; ctx.stroke();
  } else if (st.full) {
    ctx.setLineDash([]); ctx.strokeStyle = INK; ctx.lineWidth = 0.026; ctx.stroke();
    ctx.strokeStyle = mixHex('#f3e3c8', '#ff8f7a', clamp(Number(st.strain) || 0, 0, 1)); ctx.lineWidth = 0.012; ctx.stroke();
  } else {
    ctx.setLineDash([0.03, 0.022]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = `rgba(42,26,18,${0.35 + 0.35 * smooth(0.5, 1, fill)})`; ctx.lineWidth = 0.012; ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

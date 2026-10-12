// 방향 A — "풍선 볼" 부는 얼굴.
// 볼이 풍선처럼 얼굴 윤곽 밖으로 부풀고(charge), 입이 O로 열리며 굵은 만화 소용돌이 바람 덩어리가 위로 뿜어진다(blow).
//
// drawBlowFace(ctx, S, st)
//   ctx : S×S 캔버스 2D 컨텍스트 (투명 배경으로 그림)
//   st  : { mode: 'idle'|'charge'|'blow', p: 0..1.3 (정답 숨 대비), t: mode 진입 후 초, who: 'me'|'ai' }
// 내부 좌표는 0..100 단위. 얼굴 = 하단 2/3, 바람 구름 = 상단 1/3 (+ 넘치면 화면 밖).
// 외부 이미지·라이브러리 없음. 시간은 st.t 만 사용 (performance.now 안 씀).

const INK = '#2a1a12';
const W = 2.1; // 기본 잉크 두께(단위)
const HX = 50, HY = 63.5, HRX = 20.5, HRY = 19.5; // 머리
const EY = 60.5; // 눈 높이
const NY = 68.2; // 코
const MY = 76.2; // 입

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, clamp(k, 0, 1)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// 바람 레이어(반투명 합성용) — 매 프레임 재사용
let layer = null;
function getLayer(S) {
  try {
    if (!layer) layer = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : document.createElement('canvas');
    if (layer.width !== S || layer.height !== S) { layer.width = S; layer.height = S; }
    return layer;
  } catch { return null; }
}

// 여러 원의 합집합을 두꺼운 잉크 외곽선 하나로 (먼저 2배 두께로 칠하고 그 위를 채움)
function blob(ctx, lobes, fill, lw = W) {
  ctx.beginPath();
  for (const [x, y, r] of lobes) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
  ctx.lineWidth = lw * 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}

function spiral(ctx, x, y, r, turns, rot, lw) {
  ctx.beginPath();
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const k = i / N, a = rot + k * turns * Math.PI * 2, rr = r * (1 - k * 0.82);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}

// 물방울(땀·침·눈물). ang = 뾰족한 쪽 방향(0 = 위)
function drop(ctx, x, y, s, ang = 0, fill = '#a8e0ff') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.9);
  ctx.bezierCurveTo(s * 0.5, -s * 0.9, s, -s * 0.35, s, s * 0.15);
  ctx.arc(0, s * 0.15, s, 0, Math.PI);
  ctx.bezierCurveTo(-s, -s * 0.35, -s * 0.5, -s * 0.9, 0, -s * 1.9);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = Math.max(0.8, s * 0.42); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(-s * 0.35, -s * 0.05, s * 0.22, s * 0.36, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 잉크 테 두른 흰 선 (바람 속도선)
function inkLine(ctx, pts, w, color = '#ffffff') {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = w + 1.8; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
}

// ── 몸통(어깨) ────────────────────────────────────────
function drawBody(ctx, who, lift, skin) {
  const shirt = who === 'ai' ? '#e2483a' : '#3f86e8';
  const dark = who === 'ai' ? '#b5302a' : '#2c64b8';
  const y0 = 86.5 - lift;
  // 목
  ctx.fillStyle = skin; ctx.strokeStyle = INK; ctx.lineWidth = W;
  ctx.beginPath(); ctx.rect(44, 78, 12, y0 - 76); ctx.fill(); ctx.stroke();
  // 상체
  ctx.beginPath();
  ctx.moveTo(14, 104);
  ctx.bezierCurveTo(14, y0 + 5, 25, y0, 38, y0 - 0.5);
  ctx.lineTo(62, y0 - 0.5);
  ctx.bezierCurveTo(75, y0, 86, y0 + 5, 86, 104);
  ctx.closePath();
  ctx.fillStyle = shirt; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, y0 + 7.5, 100, 3.2); // 90년대 줄무늬 티
  ctx.fillStyle = dark; ctx.globalAlpha = 0.35; ctx.fillRect(0, y0 + 11.5, 100, 20); ctx.globalAlpha = 1;
  ctx.restore();
  ctx.lineWidth = W; ctx.strokeStyle = INK; ctx.stroke();
  // 둥근 깃
  ctx.beginPath(); ctx.ellipse(50, y0 - 0.2, 8.5, 3.6, 0, 0, Math.PI);
  ctx.lineWidth = 1.6; ctx.stroke();
}

// ── 머리카락 ──────────────────────────────────────────
function curlList(hb, t) {
  // 뽀글 머리: 머리 윗부분을 두르는 고리 + 정수리 채움
  const out = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (1.09 + (0.82 * i) / (N - 1));
    let x = HX + Math.cos(a) * (HRX - 1.5), y = HY - 5 + Math.sin(a) * (HRY - 1);
    const r = 6.4 + hash(i) * 1.2;
    if (hb > 0) { // 돌풍 반동: 바깥으로 튀고 바르르 떨림
      const k = hb * (2.2 + hash(i + 5) * 2.2);
      x += Math.cos(a) * k + Math.sin(t * 47 + i) * hb * 0.8;
      y += Math.sin(a) * k * 0.7 + hb * 1.8;
    }
    out.push([x, y, r]);
  }
  for (let i = 0; i < 4; i++) out.push([HX - 9 + i * 6, HY - HRY - 1 - (hb ? hb * 2 : 0), 6.2]);
  return out;
}

function drawHairMe(ctx, hb, t) {
  const curls = curlList(hb, t);
  blob(ctx, curls, '#4a2e22');
  ctx.lineWidth = 1.3; ctx.strokeStyle = '#7a4f38';
  curls.forEach(([x, y, r], i) => {
    ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.1, r * 0.45, Math.PI * (0.9 + hash(i) * 0.4), Math.PI * (2.1 + hash(i) * 0.4)); ctx.stroke();
  });
  if (hb > 0.05) { // 머리 날림 속도선
    ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(42,26,18,${0.8 * hb})`;
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
      const x0 = HX + s * (HRX + 4 + j * 1.5), y0 = HY - 12 + j * 6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + s * (5 + j), y0 + 3 + j); ctx.stroke();
    }
  }
}

function drawHairAi(ctx, hb, t) {
  // 바가지 머리
  const lift = hb * 2;
  ctx.beginPath();
  ctx.moveTo(HX + HRX + 2, HY - 1);
  ctx.ellipse(HX, HY - 1 - lift, HRX + 2, HRY + 3.5, 0, 0, Math.PI, true);
  ctx.lineTo(HX - HRX - 1, HY + 2.5);
  ctx.lineTo(HX - HRX + 4.5, HY + 2.5);
  ctx.lineTo(HX - HRX + 5.5, 52.5 - lift);
  const n = 7;
  for (let i = 0; i <= n; i++) { // 앞머리 톱니
    const x = lerp(HX - HRX + 5.5, HX + HRX - 5.5, i / n);
    ctx.lineTo(x, (i % 2 ? 54 : 52) - lift + Math.sin(t * 50 + i) * hb);
  }
  ctx.lineTo(HX + HRX - 4.5, HY + 2.5);
  ctx.lineTo(HX + HRX + 1, HY + 2.5);
  ctx.closePath();
  ctx.fillStyle = '#2b2220'; ctx.fill();
  ctx.lineWidth = W; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(HX - 3, HY - 15 - lift, 11, 4, -0.15, Math.PI * 1.1, Math.PI * 1.75);
  ctx.lineWidth = 2; ctx.strokeStyle = '#5a4a44'; ctx.stroke();
}

// ── 눈 / 눈썹 ─────────────────────────────────────────
function drawEyes(ctx, kind, q, lookUp, skin) {
  for (const s of [-1, 1]) {
    const ex = HX + s * 9.2;
    ctx.save(); ctx.translate(ex, EY);
    ctx.strokeStyle = INK; ctx.fillStyle = INK;
    if (kind === 'open' || kind === 'wide' || kind === 'worried') {
      const rx = kind === 'wide' ? 5 : 3.7, ry = kind === 'wide' ? 5.9 : 4.5;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.7; ctx.stroke();
      const pr = kind === 'wide' ? 1.5 : 2.3;
      const px = kind === 'worried' ? s * 0.6 : -s * 0.3, py = -lookUp * (ry - pr - 0.7);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.38, 0, Math.PI * 2); ctx.fill();
      if (kind === 'worried') { // 반쯤 내려온 눈꺼풀
        ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = skin; ctx.fillRect(-rx - 1, -ry - 1, rx * 2 + 2, ry * 0.75 + 1);
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(-rx, -ry * 0.25 - s * 0.6); ctx.lineTo(rx, -ry * 0.25 + s * 0.6);
        ctx.lineWidth = 1.8; ctx.stroke();
      }
      if (kind === 'wide') { // 놀람 힘줄
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(214,38,42,0.8)';
        ctx.beginPath(); ctx.moveTo(-rx * 0.9, 1); ctx.lineTo(-rx * 0.45, 0.4); ctx.moveTo(rx * 0.9, 1.4); ctx.lineTo(rx * 0.5, 0.6); ctx.stroke();
      }
    } else if (kind === 'blink') {
      ctx.beginPath(); ctx.moveTo(-3.6, 0.4); ctx.quadraticCurveTo(0, 2.8, 3.6, 0.4);
      ctx.lineWidth = 2.1; ctx.stroke();
    } else { // squeeze: > <  (질끈)
      const d = -s; // 꼭짓점이 코 쪽
      const h = 2.3 + q * 1.2, w = 3.8;
      ctx.beginPath(); ctx.moveTo(-d * w, -h); ctx.lineTo(d * w * 0.85, 0.2); ctx.lineTo(-d * w, h);
      ctx.lineWidth = 2.4; ctx.stroke();
      if (q > 0.35) { // 눈가 주름
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-d * (w + 1.2), -h - 0.4); ctx.lineTo(-d * (w + 2.8), -h - 1.6);
        ctx.moveTo(-d * (w + 1.4), h + 0.4); ctx.lineTo(-d * (w + 2.9), h + 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawBrows(ctx, tilt, raise, color, jit = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.9; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const bx = HX + s * 9.2, by = 53.4 - raise + jit * s;
    ctx.beginPath();
    ctx.moveTo(bx - s * 4.2, by + tilt * 2.2);
    ctx.quadraticCurveTo(bx, by - 1.7 + tilt * 0.4, bx + s * 4.4, by - tilt * 1.1 + 0.4);
    ctx.stroke();
  }
}

// ── 코 ───────────────────────────────────────────────
function drawNose(ctx, flare, skin) {
  const rx = 2.8 + flare * 1.4;
  ctx.beginPath(); ctx.ellipse(HX, NY - 0.6, rx, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin; ctx.fill();
  ctx.beginPath(); ctx.ellipse(HX, NY - 0.6, rx, 2.6, 0, Math.PI * 0.05, Math.PI * 0.95);
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(HX + s * (1.5 + flare * 0.7), NY + 0.6, 0.6 + flare * 0.85, 0.7 + flare * 0.42, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── 입 ───────────────────────────────────────────────
const LIP = '#ee6b78', MOUTH_IN = '#5a1520';
function drawMouth(ctx, mode, p, t, weak, over) {
  ctx.strokeStyle = INK;
  if (mode === 'idle') {
    ctx.beginPath(); ctx.moveTo(HX - 4.2, MY - 0.8); ctx.quadraticCurveTo(HX, MY + 2.6, HX + 4.2, MY - 0.8);
    ctx.lineWidth = 2; ctx.stroke();
    return;
  }
  if (mode === 'charge') {
    if (p < 0.4) { // 들숨: 작은 o
      const r = 1.8 + p * 2.4;
      ctx.beginPath(); ctx.ellipse(HX, MY, r * 0.85, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = MOUTH_IN; ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
      return;
    }
    // 뽀뽀 입술: 꽉 오므린 링 + 쭈글 주름
    const k = smooth(0.4, 1.15, p);
    const lw = 4.9 - k * 1.1, lh = 3.9 + k * 0.5;
    ctx.beginPath(); ctx.ellipse(HX, MY, lw, lh, 0, 0, Math.PI * 2);
    ctx.fillStyle = LIP; ctx.fill(); ctx.lineWidth = 1.9; ctx.stroke();
    ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(90,21,32,0.7)';
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      ctx.beginPath(); ctx.moveTo(HX + Math.cos(a) * lw * 0.32, MY + Math.sin(a) * lh * 0.32);
      ctx.lineTo(HX + Math.cos(a) * lw * 0.78, MY + Math.sin(a) * lh * 0.78); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(HX, MY, 1.1 - k * 0.55, 0.85 - k * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = MOUTH_IN; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(HX - lw * 0.42, MY - lh * 0.5, 1.1, 0.6, -0.5, 0, Math.PI * 2); ctx.fill();
    // 입가 바깥 주름
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(HX + s * (lw + 1.2), MY - 1.4); ctx.lineTo(HX + s * (lw + 2.6), MY - 2.2);
      ctx.moveTo(HX + s * (lw + 1.2), MY + 1.4); ctx.lineTo(HX + s * (lw + 2.6), MY + 2.2);
      ctx.stroke();
    }
    return;
  }
  // blow: O 입
  const open = easeOut(t / 0.06) * (1 - smooth(0.42, 0.62, t) * 0.65);
  let sz = weak > 0.5 ? 0.5 + p * 0.35 : 0.9 + p * 0.3 + over * 0.15;
  if (over > 0.5 && t > 0.18) sz *= 0.8 + 0.12 * Math.sin(t * 60); // 콜록
  const ro = Math.max(1.6, 5 * sz * open);
  const ox = weak > 0.5 ? 1.2 : 0; // 약하면 입이 한쪽으로 삐죽
  ctx.beginPath(); ctx.ellipse(HX + ox, MY, ro, ro * 1.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = LIP; ctx.fill(); ctx.lineWidth = 1.9; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(HX + ox, MY + 0.2, ro * 0.62, ro * 0.74, 0, 0, Math.PI * 2);
  ctx.fillStyle = MOUTH_IN; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.ellipse(HX + ox - ro * 0.55, MY - ro * 0.6, ro * 0.22, ro * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
}

// ── 바람 ─────────────────────────────────────────────
function drawWisp(g, p, t, mx, my) {
  // 약한 숨: 입 바로 앞에서 '피식' 작은 김 한 덩이가 조금 뜨다 힘없이 점으로 부서짐 (위로 못 감)
  const k = 0.75 + p * 0.5;
  const rise = easeOut(t / 0.16);
  const brk = smooth(0.13, 0.3, t);
  const x = mx + 4.5 + rise * 3, y = my - 5 - rise * 4 + brk * 2.5;
  const r = (1 + rise * 1.9) * k;
  if (brk < 0.4) {
    blob(g, [[x, y, r], [x + r * 0.8, y - r * 0.5, r * 0.72], [x - r * 0.7, y - r * 0.35, r * 0.66], [x + r * 0.1, y - r * 0.9, r * 0.6]], '#f6f6f6', 1.15);
  } else for (let j = 0; j < 5; j++) { // 점으로 부서짐
    const a = j * 1.3 + 0.4, d = r * (0.4 + brk * 1.2);
    blob(g, [[x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7 + brk * 2, r * 0.3 * (1.3 - brk * 0.5)]], '#f6f6f6', 0.8);
  }
}

function drawCloud(g, p, t, mx, my, over) {
  const big = 1 + over * 0.3;
  const Rf = (6.5 + p * 7) * big; // p .95 → 13.2, p 1.25 → 21
  const e = easeOut(t / 0.2);
  const R = lerp(3, Rf, e);
  const wob = over * (1 - smooth(0.48, 0.62, t));
  const yEnd = 17 + over * 5;
  const cx = mx + wob * Math.sin(t * 29) * 2.6;
  const cy = lerp(my - 9, yEnd, e) - t * 5;
  const bottom = cy + R * 0.8;
  const tail = lerp(my - 3.2, bottom, smooth(0.3, 0.5, t)); // 숨이 끝나야 입에서 떨어짐 // 시간이 지나면 꼬리가 구름 쪽으로 걷힘

  // 꼬리(입 → 구름)와 구름 몸통을 한 외곽선으로: '입에서 나온 덩어리'로 읽히게
  const w0 = lerp(2.4 + over * 1.6, 0.9 + over, smooth(0.1, 0.3, t)), w1 = R * 0.8; // 숨 끝물엔 가늘어짐
  const edge = (side) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const w = lerp(w0, w1, Math.pow(u, 2.2));
      const jit = wob * Math.sin(t * 45 + u * 9) * 1.1;
      pts.push([lerp(mx, cx, u) + side * w + jit, lerp(tail, bottom, u)]);
    }
    return pts;
  };
  const L = edge(-1), Rr = edge(1).reverse();
  const n = over > 0.5 ? 11 : 8;
  const lobes = [[cx, cy, R * 0.9]];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const top = 0.5 - 0.5 * Math.sin(a); // 1 = 앞(위), 0 = 뒤(아래)
    const rr = R * (0.7 + 0.08 * hash(i) + over * 0.22 * hash(i + 3));
    const lr = R * (0.4 + 0.2 * top + 0.08 * hash(i + 7) + over * 0.12 * hash(i + 11));
    const j = wob * 1.8 * Math.sin(t * 41 + i * 1.7);
    lobes.push([cx + Math.cos(a) * rr * 1.08 + j, cy + Math.sin(a) * rr * 0.86 + j * 0.6, lr]);
  }
  const path = () => {
    g.beginPath();
    if (tail > bottom + 1) { g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (const q of Rr) g.lineTo(...q); g.closePath(); }
    for (const [x, y, r] of lobes) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
  };
  path();
  g.lineWidth = (W + over * 0.4) * 2; g.strokeStyle = INK; g.stroke();
  const grad = g.createLinearGradient(0, cy - R * 1.4, 0, my);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, '#f4fbff'); grad.addColorStop(1, '#cfeaff');
  g.fillStyle = grad; g.fill();
  // 구름 아랫배 그림자
  g.save(); path(); g.clip();
  g.fillStyle = 'rgba(110,170,225,0.22)';
  g.beginPath(); g.ellipse(cx, cy + R * 1.15, R * 1.7, R * 0.62, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  // 얼굴 위를 지나는 꼬리는 반투명 (눈·코가 비치게)
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const mg = g.createLinearGradient(0, 40, 0, 56);
  mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(0,0,0,0.68)');
  g.fillStyle = mg; g.fillRect(0, 40, 100, my - 40 - 1);
  g.restore();
  // 꼬리 안 흐름 표시 (위로 흘러가는 짧은 선)
  if (tail > bottom + 6) {
    g.strokeStyle = 'rgba(42,26,18,0.55)'; g.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) {
      const u = (i / 4 + t * 2.2) % 1;
      const y = lerp(tail, bottom, u), w = lerp(w0, w1, Math.pow(u, 2.2));
      const x = lerp(mx, cx, u) + (i % 2 ? 0.45 : -0.45) * w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 2.5 - u * 3); g.stroke();
    }
  }
  // 소용돌이
  const sw = 1.6 + over * 0.5;
  spiral(g, cx - R * 0.3, cy + R * 0.05, R * 0.44, 1.55, t * 16, sw);
  spiral(g, cx + R * 0.4, cy - R * 0.25, R * 0.3, 1.35, -t * 13 + 2, sw * 0.9);
  if (over > 0.5) spiral(g, cx + R * 0.32, cy + R * 0.42, R * 0.22, 1.3, t * 18 + 4, sw * 0.8);
  // 구름 뒤로 남는 속도선 (가늘게, 잉크만)
  g.strokeStyle = INK; g.lineWidth = 1.2;
  for (const s of [-1, 1]) for (let j = 0; j < 2; j++) {
    const x = cx + s * (R * (0.95 + j * 0.3)), y0 = cy + R * (0.55 + j * 0.2);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x - s * 0.8, y0 + R * (0.55 - j * 0.15) + 3); g.stroke();
  }
  if (over < 0.5) { // 적정: 위로 말려 올라가는 작은 바람 꼬리 (잉크 선)
    for (const s of [-1, 1]) {
      const x0 = cx + s * R * 1.32, y0 = cy + R * 0.5;
      const pts = [];
      for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push([x0 + Math.sin(u * 3 + t * 20) * 0.8, y0 - u * R * 0.75]); }
      const [ex, ey] = pts[14], cr = R * 0.16;
      for (let i = 1; i <= 14; i++) { const u = i / 14, a = (s > 0 ? Math.PI : 0) + s * u * Math.PI * 1.4; pts.push([ex + s * cr + Math.cos(a) * cr * (1 - u * 0.45), ey + Math.sin(a) * cr * (1 - u * 0.45)]); }
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
    }
  } else { // 너무 셈: 구름이 부들부들 — 흔들림 괄호선
    g.strokeStyle = INK; g.lineWidth = 1.5;
    for (const s of [-1, 1]) for (let j = 0; j < 2; j++) {
      const r = R * (1.45 + j * 0.16) + Math.sin(t * 60 + j) * 0.6 * wob;
      g.beginPath(); g.arc(cx, cy, r, s > 0 ? -0.35 : Math.PI - 0.35, s > 0 ? 0.35 : Math.PI + 0.35); g.stroke();
    }
  }
  // 입에서 '퍽' 방사선 (짧게)
  if (t < 0.16) {
    const k = t / 0.16;
    g.strokeStyle = INK; g.lineWidth = 1.8;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.05 + (0.9 * i) / 5);
      const r0 = 7.5 + k * 4, r1 = r0 + 4.5 * (1 - k * 0.5);
      if (Math.abs(Math.cos(a)) < 0.35) continue; // 꼬리와 겹치는 위쪽은 비움
      g.beginPath(); g.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0 * 0.8); g.lineTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1 * 0.8); g.stroke();
    }
  }
}

function drawSpit(ctx, t, mx, my, over) {
  // 침방울: 사방으로 튀고 중력으로 떨어짐
  if (t > 0.5) return;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (hash(i + 20) - 0.5) * Math.PI * 1.1;
    const v = 55 + hash(i + 31) * 55;
    const tt = Math.max(0, t - hash(i + 40) * 0.05);
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v + 140 * tt;
    const x = mx + Math.cos(a) * v * tt, y = my - 2 + Math.sin(a) * v * tt + 70 * tt * tt;
    const s = (0.9 + hash(i + 50) * 0.9) * over;
    if (tt <= 0) continue;
    drop(ctx, x, y, s, Math.atan2(vy, vx) - Math.PI / 2 + Math.PI, '#c8ecff');
  }
}

function drawGust(ctx, S, p, t, mx, my, over, weak) {
  const L = getLayer(S);
  if (!L) return;
  const g = L.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
  g.setTransform(S / 100, 0, 0, S / 100, 0, 0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  let fade;
  if (weak > 0.5) { fade = 1 - smooth(0.2, 0.45, t); drawWisp(g, p, t, mx, my); }
  else { fade = 1 - smooth(over > 0.5 ? 0.44 : 0.38, 0.6, t); drawCloud(g, p, t, mx, my, over); }
  if (fade > 0.01) { ctx.save(); ctx.globalAlpha = fade; ctx.drawImage(L, 0, 0, 100, 100); ctx.restore(); }
  if (over > 0.05) drawSpit(ctx, t, mx, my, over);
}

// ── 본체 ─────────────────────────────────────────────
export function drawBlowFace(ctx, S, st = {}) {
  const mode = st.mode === 'charge' || st.mode === 'blow' ? st.mode : 'idle';
  const p = clamp(+st.p || 0, 0, 1.3);
  const t = Math.max(0, +st.t || 0);
  const who = st.who === 'ai' ? 'ai' : 'me';
  const charge = mode === 'charge', blow = mode === 'blow', idle = mode === 'idle';

  const strain = charge ? smooth(1.08, 1.2, p) : 0; // 과호흡 신호(참는 중)
  const over = blow ? smooth(1.08, 1.18, p) : 0; // 너무 센 숨
  const weak = blow ? 1 - smooth(0.6, 0.75, p) : 0; // 약한 숨
  const puff = charge ? p : blow ? p * (1 - easeOut(t / 0.15)) : 0; // 볼 부풂
  const hb = over * (1 - smooth(0.35, 0.6, t)); // 머리 날림
  const redK = Math.max(strain, charge ? smooth(0.75, 1.1, p) * 0.25 : 0, over * (1 - smooth(0.35, 0.6, t)) * 0.8);

  let ox = 0, oy = 0;
  if (idle) oy = Math.sin(t * 2.4) * 0.5;
  if (charge) { oy = -p * 1.2 + strain * Math.cos(t * 63) * 0.5; ox = strain * Math.sin(t * 77) * 1.0; }
  if (blow) {
    oy = Math.sin(clamp(t / 0.24, 0, 1) * Math.PI) * (0.5 + p * 1.8); // 반동
    ox = over * Math.sin(t * 58) * 1.4 * (1 - smooth(0.25, 0.5, t));
  }

  const skin = mix('#ffd29e', '#ff8a6c', redK);
  const skinHi = mix('#fff1dc', '#ffc2ae', redK);

  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.scale(S / 100, S / 100);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(ox, oy);

  drawBody(ctx, who, charge ? p * 1.6 : 0, skin);

  // 머리 실루엣 = 머리 + 귀 + 풍선 볼 (외곽선 하나로)
  const cR = 5 + puff * 8.6, cX = 10 + puff * 7, cY = 73 + puff * 3;
  const cheeks = puff > 0.12 ? [[HX - cX, cY, cR], [HX + cX, cY, cR]] : [];
  ctx.beginPath();
  ctx.ellipse(HX, HY, HRX, HRY, 0, 0, Math.PI * 2);
  for (const s of [-1, 1]) { ctx.moveTo(HX + s * (HRX - 0.5) + 4.6, HY + 1); ctx.arc(HX + s * (HRX - 0.5), HY + 1, 4.6, 0, Math.PI * 2); }
  for (const [x, y, r] of cheeks) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
  ctx.lineWidth = W * 2; ctx.strokeStyle = INK; ctx.stroke();
  const hg = ctx.createRadialGradient(HX - 6, HY - 8, 2, HX, HY, HRX + 6);
  hg.addColorStop(0, skinHi); hg.addColorStop(1, skin);
  ctx.fillStyle = hg; ctx.fill();
  // 귀 안쪽
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(42,26,18,0.6)';
  for (const s of [-1, 1]) { const a0 = s > 0 ? 0 : Math.PI; ctx.beginPath(); ctx.arc(HX + s * (HRX - 0.2), HY + 1, 2.2, a0 - 1.2, a0 + 1.2); ctx.stroke(); }

  // 풍선 볼 (광택 + 홍조 + 안쪽 주름선)
  if (cheeks.length) {
    const blush = mix('#ffa98c', '#ff5a4a', redK);
    cheeks.forEach(([x, y, r], i) => {
      const s = i ? 1 : -1;
      const cg = ctx.createRadialGradient(x + s * r * 0.15, y - r * 0.25, r * 0.1, x, y, r);
      cg.addColorStop(0, skinHi); cg.addColorStop(0.6, skin); cg.addColorStop(1, mix('#ffc49a', '#ff6a50', redK));
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
      if (puff > 0.55) { // 얼굴 안쪽 경계 (위쪽만 살짝)
        ctx.beginPath();
        if (s < 0) ctx.arc(x, y, r, -1.5, -0.55); else ctx.arc(x, y, r, Math.PI + 0.55, Math.PI + 1.5);
        ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(42,26,18,${0.5 * smooth(0.55, 0.9, puff)})`; ctx.stroke();
      }
      ctx.fillStyle = blush; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(x - s * r * 0.05, y + r * 0.1, r * 0.42, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 광택
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(x + s * r * 0.42, y - r * 0.45, r * 0.24, r * 0.13, s * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + s * r * 0.6, y - r * 0.16, r * 0.06, 0, Math.PI * 2); ctx.fill();
      // 터질 듯한 긴장선
      if (strain > 0.05) {
        ctx.strokeStyle = `rgba(42,26,18,${0.9 * strain})`; ctx.lineWidth = 1.3;
        for (let j = 0; j < 3; j++) {
          const a = (s < 0 ? Math.PI : 0) + (j - 1) * 0.5 - s * 0.2;
          const r0 = r + 1.8 + Math.sin(t * 40 + j) * 0.5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * (r0 + 3), y + Math.sin(a) * (r0 + 3)); ctx.stroke();
        }
      }
    });
  } else {
    ctx.fillStyle = 'rgba(255,130,120,0.45)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(HX + s * 12.5, 70, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  // 머리카락
  if (who === 'ai') drawHairAi(ctx, hb, t); else drawHairMe(ctx, hb, t);
  const browCol = who === 'ai' ? '#2b2220' : '#3a2318';

  // 눈·눈썹 (상태별)
  let eye = 'open', q = 0, look = 0.35, tilt = -0.15, raise = 0;
  if (idle) {
    if (t % 3.3 > 3.16) eye = 'blink';
  } else if (charge) {
    if (p < 0.38) { look = 0.6; raise = 1.2; tilt = -0.3; }
    else { eye = 'squeeze'; q = smooth(0.38, 1.1, p); tilt = 0.45 + q * 0.7 + strain * 0.2; raise = -q * 0.6; }
  } else if (weak > 0.5) {
    eye = 'worried'; look = 0.7; tilt = -0.85; raise = 1.4;
  } else if (over > 0.5) {
    if (t < 0.18) { eye = 'wide'; look = 0.6; tilt = -0.6; raise = 2.2; } else { eye = 'squeeze'; q = 1; tilt = 0.9; }
  } else if (t < 0.2) { eye = 'squeeze'; q = 0.8; tilt = 0.8; } else { eye = 'open'; look = 1; tilt = 0.25; raise = 0.6; }
  drawEyes(ctx, eye, q, look, skin);
  drawBrows(ctx, tilt, raise, browCol, strain * Math.sin(t * 70) * 0.4);

  // 코 (콧구멍 벌름)
  const flare = charge ? smooth(0.2, 1.1, p) * 1.3 + strain * 0.3 : blow ? 0.8 - weak * 0.5 : 0.1;
  drawNose(ctx, flare, skin);

  // 입
  drawMouth(ctx, mode, p, t, weak, over);

  // 과호흡(참는 중): 땀 + 이마 힘줄
  if (strain > 0.05) {
    for (const s of [-1, 1]) {
      const ph = (t * 1.8 + (s > 0 ? 0.5 : 0)) % 1;
      drop(ctx, HX + s * (HRX + 2 + ph * 6), 50 - ph * 3 + ph * ph * 10, 1.6 * strain, s * (0.9 + ph * 0.5));
    }
    ctx.save(); ctx.translate(HX + 13.5, 47.5); ctx.scale(strain, strain);
    ctx.strokeStyle = '#d6262a'; ctx.lineWidth = 1.6;
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(1, -3.2); ctx.quadraticCurveTo(1, -1, 3.2, -1); ctx.stroke();
    }
    ctx.restore();
  }
  // 약한 숨: 민망한 땀 한 방울
  if (weak > 0.5) drop(ctx, HX + HRX + 1, 52 + smooth(0, 0.4, t) * 4, 1.7, 0.15);
  // 너무 센 숨 뒤 콜록: 눈물 + 입가 기침 김
  if (over > 0.5 && t > 0.18) {
    const k = smooth(0.18, 0.3, t);
    for (const s of [-1, 1]) drop(ctx, HX + s * 12.5, EY + 3 + k * 3, 1.2 * k, 0, '#bfe6ff');
    const ct = t - 0.18;
    for (const s of [-1, 1]) {
      const x = HX + s * (8 + ct * 30), y = MY + 1 - ct * 12;
      blob(ctx, [[x, y, 2.4], [x + s * 1.8, y - 1.2, 1.8], [x + s * 0.6, y + 1.4, 1.6]], 'rgba(255,255,255,0.95)', 1);
    }
  }
  ctx.restore();

  // 바람 (얼굴 위에, 반투명 합성)
  if (blow) drawGust(ctx, S, p, t, HX + ox, MY + oy, over, weak);
  ctx.restore();
}

// tools/coresweep/gestnoise.mjs — 한 엄지 인식기(gesture.mjs)를 손 잡음 모델로 잰다 (docs/design/core-sweep.md §4.1).
//
// 🧭 가설(확인됨, 아래 손 잡음 모델 안에서 · 모델 자체는 미검증): '푸' 시작의 300 ms 는 굴러가는 창(최근 300 ms 에 12 px = 40 px/s 바닥)이지 마감이 아니다.
//   '시작 지연'은 밀기 '움직임이 시작된 때'부터 잰다(100 ms 평활 지연 + 최소 저크의 느린 출발 포함). 그래서 지연 617 ms 와 놓침 0% 가 함께 성립한다.
//   남는 위험(확인됨): 40 px/s 를 끝까지 못 넘는 밀기는 '푸'가 안 되고 떼면 퍽이 된다(speed). 고침 후보는 fix.
//   결론(fix): 바닥은 손 흘림(가정 ±30 px/s)을 막는 장치라 낮추면 퍽 → 잘못 시작이 는다. 가장 작은 고침 = '떼기 40 px → 취소'(새 '푸'를 열지 않음).
//
// 손 잡음 모델(가정, 미검증 — 2안 시제품 그대로)
//   떨림 = 8~12 Hz 사인(진폭 1.4·trem) + 가우스(σ 0.5·trem), 느린 흘림 ±15·drift px/s(멈춰 있는 동안), 떼는 순간 접점 이동 N(0, 5 px), 터치 사건 60 Hz.
//   손: 보통 trem 1.5·drift 1·당김 느림 1·쓸기 최고 300 px/s / 느린 손(어르신) 3·2·2·100 / 아이(흔들림 큼) 4·2·1.2·250. 쓸기 속도는 ×0.7~1.3.
//   한 번 = 누르기 → 당김(0.3~0.9 × 당김 1.0, 300 + 500·느림 ms, 최소 저크) → 멈춤(150~1,050 ms, 흘림) →
//     퍽: 그 자리에서 뗀다 → '푸'로 시작했으면 '잘못 시작'
//     쓸기: 40~180 px 를 위로(최소 저크, 최고 속도 = 쓸기 속도) 밀고 뗀다 → 끝까지 '푸'가 안 열리면 '놓침'(= 퍽으로 처리됨)
//   시작 지연 = 쓸기 움직임 시작 → '푸' 시작. 멈춤 동안 이미 열린 경우('이른 시작')는 지연에서 뺀다(table 은 옛 셈 그대로).
//
// 명령 (한 코어, 저장 없음, 같은 명령이면 같은 출력)
//   node tools/coresweep/gestnoise.mjs table     # §4.1 인식기 표(평활·창·문턱 5칸). 레포 밖 2안 시제품 출력과 숫자 대조함(출처 메모). 약 7초
//   node tools/coresweep/gestnoise.mjs speed     # 밀기 속도 훑기: 기본 인식기, 속도 15~80 px/s × 모양 3(고른·점점 빨라짐·최소 저크) × 손 3. 약 1분
//   node tools/coresweep/gestnoise.mjs fix       # 고침 후보 9개(둘째 창 · 누적 → 푸 · 떼기 → 취소) × 손 3: 퍽(멈춤 ~1 s / 긴 멈춤 ~3 s) · 표 모델 쓸기 · 느린 밀기 6칸. 약 3분
//   node tools/coresweep/gestnoise.mjs short     # 짧은 느린 밀기(길이 12~80 px 고정, 20·30 px/s): 지금 / slowCancel 40 에서 퍽·취소·푸. 약 1분
//   N=1000 … 으로 칸당 횟수 바꾸기(기본 4,000). ONLY=0,8 … 으로 fix 후보 거르기. DMIN=12 … 으로 fix 의 느린 밀기 길이 하한 바꾸기(기본 40 px)
import { Gesture, GCFG } from './gesture.mjs';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const mj = (u) => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5; // 최소 저크(최고 속도 = 1.875 × 평균)
const hashSeed = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h ^ 20261014) >>> 0; };
const W = 390, H = 844, PULL = 390 * 0.42;
export const PL = {
  보통: { trem: 1.5, drift: 1, slow: 1, v: 300 },
  '느린 손(어르신)': { trem: 3, drift: 2, slow: 2, v: 100 },
  '아이(흔들림 큼)': { trem: 4, drift: 2, slow: 1.2, v: 250 },
};
// opt: holdMax(ms, 기본 1050) / prof: 'mj'(기본, 최고 속도 = v) | 'const'(v 그대로) | 'easein'(0 → v 로 고르게 빨라짐) / vFix: 속도 고정(px/s, 없으면 손 속도 × 0.7~1.3)
//      D: 밀기 길이 고정(px) / Dmin·Dmax: 밀기 길이 범위(기본 40~180 px)
export function run(kind, cfg, r, pl, opt = {}) {
  const g = new Gesture(W, H, cfg);
  const x0 = 195, y0 = 520, hz = 60, dt = 1000 / hz;
  const holdMax = opt.holdMax ?? 1050;
  const pT = 0.3 + 0.6 * r(), pullMs = 300 + 500 * r() * pl.slow, holdMs = 150 + (holdMax - 150) * r();
  const drift = (r() * 2 - 1) * 15 * pl.drift, f = 8 + 4 * r(), ph = r() * 6.28;
  let t = 0; g.down(x0, y0, t); let early = false, out;
  const tremor = (tt) => pl.trem * Math.sin(2 * Math.PI * f * tt / 1000 + ph) * 1.4 + gauss(r) * pl.trem * 0.5;
  const yPull = y0 + pT * PULL;
  for (; t <= pullMs; t += dt) { const y = y0 + (yPull - y0) * mj(t / pullMs) + tremor(t); const e = g.move(x0 + tremor(t + 50), y, t); if (e?.ev === 'blowStart') early = true; }
  const tH = t;
  for (; t <= tH + holdMs; t += dt) { const y = yPull + drift * (t - tH) / 1000 + tremor(t); const e = g.move(x0 + tremor(t + 50), y, t); if (e?.ev === 'blowStart') early = true; }
  const yE = yPull + drift * holdMs / 1000;
  if (kind === 'puff') {
    const lift = gauss(r) * 5; // 떼는 순간 접점 이동(위·아래)
    g.move(x0, yE + lift * 0.6, t);
    out = g.up(x0, yE + lift, t + 8);
    return { falseStart: out.kind !== 'puff', kind: out.kind, why: out.why, slow: !!out.slow };
  }
  const prof = opt.prof ?? 'mj';
  // 밀기 길이: 기본 40~180 px 고르게. opt.D = 고정, opt.Dmin·Dmax = 범위 바꾸기(기본값이면 예전과 비트까지 같은 난수열·값)
  const v = opt.vFix ?? pl.v * (0.7 + 0.6 * r()), rD = r(), D = opt.D ?? ((opt.Dmin ?? 40) + ((opt.Dmax ?? 180) - (opt.Dmin ?? 40)) * rD);
  const ms = prof === 'mj' ? 1.875 * D / v * 1000 : prof === 'const' ? D / v * 1000 : 2 * D / v * 1000;
  const pos = prof === 'mj' ? mj : prof === 'const' ? (u) => u : (u) => u * u;
  const tS = t; let lat = null, why = null, t12 = null;
  for (; t <= tS + ms; t += dt) {
    const rise = D * pos((t - tS) / ms); if (t12 == null && rise >= cfg.upStart) t12 = t - tS; // 손(잡음 없는 원신호)이 12 px 오른 첫 프레임
    const y = yE - rise + tremor(t); const e = g.move(x0 + tremor(t + 50), y, t); if (e?.ev === 'blowStart' && lat == null) { lat = t - tS; why = e.why; }
  }
  out = g.up(x0, yE - D, t);
  return { miss: out.kind !== 'pueok', kind: out.kind, early, lat, why, t12, u: out.u, D, v };
}
const pct = (a, n) => (100 * a / n).toFixed(2) + '%';
const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
// 한 칸: 퍽 n 번 → 쓸기 n 번(같은 난수열, 2안 시제품과 같은 순서)
export function cell(cfg, pl, seed, n, opt = {}, legacy = false) {
  const r = rng(seed);
  let fs = 0, fsBlow = 0, fsCancel = 0;
  if (!opt.sweepOnly) for (let i = 0; i < n; i++) {
    const o = run('puff', cfg, r, pl, opt);
    if (o.falseStart) { fs++; if (o.kind === 'pueok') fsBlow++; else fsCancel++; }
  }
  let miss = 0, missPuff = 0, missCancel = 0, early = 0; const lats = [], t12s = [], lags = [];
  if (!opt.puffOnly) for (let i = 0; i < n; i++) {
    const o = run('sweep', cfg, r, pl, opt);
    if (o.miss) { miss++; if (o.kind === 'puff') missPuff++; else missCancel++; continue; }
    if (legacy) { lats.push(o.lat); continue; } // 2안 시제품 셈: 멈춤 중 이른 시작(lat null)도 0 으로 들어갔다
    if (o.lat == null) { early++; continue; }
    lats.push(o.lat);
    if (o.t12 != null) { t12s.push(o.t12); lags.push(o.lat - o.t12); }
  }
  for (const a of [lats, t12s, lags]) a.sort((x, y) => x - y);
  return { n, fs, fsBlow, fsCancel, miss, missPuff, missCancel, early, med: q(lats, 0.5), p90: q(lats, 0.9), lats, t12med: q(t12s, 0.5), lagMed: q(lags, 0.5), lagP90: q(lags, 0.9) };
}
const N = Number(process.env.N || 4000);
const fmtLat = (c) => Number.isFinite(c.med) ? `${c.med.toFixed(0)} [${c.p90.toFixed(0)}] ms` : '—';

function table() {
  console.log(`# §4.1 인식기 표 — 칸당 퍽 ${N} + 쓸기 ${N}, 난수 씨 20261014 (2안 시제품 gesttune 과 같은 셈)`);
  for (const [sm, up, win] of [[0, 12, 160], [50, 12, 300], [100, 12, 160], [100, 12, 300], [100, 16, 300]]) {
    const cfg = { ...GCFG, smoothMs: sm, upStart: up, upWin: win };
    for (const [pk, pl] of Object.entries(PL)) {
      const c = cell(cfg, pl, 20261014, N, {}, true);
      console.log(`평활 ${String(sm).padStart(3)} ms · 시작 ${up} px · 창 ${win} ms | ${pk.padEnd(10)} 퍽→잘못 시작 ${pct(c.fs, N)} | 쓸기 놓침 ${pct(c.miss, N)} · 시작 지연 중앙 [90%] ${fmtLat(c)}`);
    }
  }
  console.log(`\n# 지연 분해(채택 평활 100 ms · 12 px · 창 300 ms, 같은 씨, 멈춤 중 이른 시작은 뺌): 시작 지연 = 손이 12 px 오르는 시간(밀기 시작부터, 잡음 없는 원신호) + 인식기 지연(평활·창)`);
  for (const [pk, pl] of Object.entries(PL)) {
    const c = cell(GCFG, pl, 20261014, N);
    console.log(`${pk.padEnd(10)} 지연 중앙 ${c.med.toFixed(0)} ms = 손 12 px 중앙 ${c.t12med.toFixed(0)} ms + 인식기 지연 중앙 ${c.lagMed.toFixed(0)} ms [90% ${c.lagP90.toFixed(0)}] · 이른 시작 ${c.early}번`);
  }
}
const SPEEDS = [15, 20, 30, 40, 50, 60, 80];
const PROFS = { const: '고른 속도', easein: '점점 빨라짐(0→v)', mj: '최소 저크(최고 v)' };
function speed() {
  console.log(`\n## 밀기 속도 훑기 — 기본(평활 100 ms · 12 px / 최근 300 ms). 칸당 쓸기 ${N}번(40~180 px), 속도 고정. 칸: 놓침(→퍽) · 지연 중앙 [90%]`);
  console.log(`모양 | 손 | ` + SPEEDS.map((v) => `${v} px/s`).join(' | '));
  for (const [pk, plab] of Object.entries(PROFS)) for (const [hk, pl] of Object.entries(PL)) {
    const cells = SPEEDS.map((v) => cell(GCFG, pl, hashSeed(`speed|${pk}|${hk}|${v}`), N, { sweepOnly: true, prof: pk, vFix: v }));
    console.log(`${plab} | ${hk} | ` + cells.map((c) => `${pct(c.miss, N)} · ${fmtLat(c)}`).join(' | '));
  }
}

const FIXES = [
  ['기본(12 px / 최근 300 ms)', {}],
  ['+ 둘째 창 24 px / 최근 1,000 ms', { roll2: [24, 1000] }],
  ['+ 누적 24 px → 푸', { upCum: 24 }],
  ['+ 누적 32 px → 푸', { upCum: 32 }],
  ['+ 누적 40 px → 푸', { upCum: 40 }],
  ['+ 누적 48 px → 푸', { upCum: 48 }],
  ['+ 떼기 24 px → 취소', { slowCancel: 24 }],
  ['+ 떼기 32 px → 취소', { slowCancel: 32 }],
  ['+ 떼기 40 px → 취소', { slowCancel: 40 }],
];
const SLOW = [['const', 15], ['const', 20], ['const', 30], ['easein', 15], ['easein', 20], ['easein', 30]];
const DMIN = process.env.DMIN != null ? Number(process.env.DMIN) : null; // fix 의 느린 밀기 길이 하한(기본 40 px). 예: DMIN=12
function fix() {
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  console.log(`# 느린 밀기 고침 후보 — 칸당 ${N}번.`);
  console.log(`#  퍽 = 당김 뒤 멈춤 150~1,050 ms(표와 같은 모델) / 긴 멈춤 150~3,000 ms(스트레스, 흘림 ±30 px/s 가 3초 이어지는 비관 가정). 퍽→푸 = '푸'로 잘못 시작, 퍽→취소 = 떼기 규칙에 걸림`);
  console.log(`#  쓸기 = 표와 같은 모델(최소 저크, 손 속도 ×0.7~1.3): 놓침 · 지연 중앙 [90%]`);
  console.log(`#  느린 밀기 = 고른 속도·점점 빨라짐 × 15/20/30 px/s 여섯 칸(각 ${N}번) 합, 밀기 길이 ${DMIN ?? 40}~180 px: 푸 · 취소 · 퍽(= 잘못 분류) / 가장 나쁜 칸의 퍽`);
  for (const [i, [name, extra]] of FIXES.entries()) {
    if (only && !only.includes(i)) continue;
    const cfg = { ...GCFG, ...extra };
    console.log(`\n## ${i} ${name}`);
    for (const [hk, pl] of Object.entries(PL)) {
      const a = cell(cfg, pl, 20261014, N);
      const b = cell(cfg, pl, hashSeed(`long|${hk}`), N, { puffOnly: true, holdMax: 3000 });
      let blow = 0, cancel = 0, puff = 0, worst = 0, tot = 0;
      for (const [pk, v] of SLOW) {
        const c = cell(cfg, pl, hashSeed(`speed|${pk}|${hk}|${v}`), N, { sweepOnly: true, prof: pk, vFix: v, ...(DMIN != null ? { Dmin: DMIN } : {}) });
        blow += N - c.miss; cancel += c.missCancel; puff += c.missPuff; tot += N; worst = Math.max(worst, c.missPuff / N);
      }
      console.log(`${hk.padEnd(10)} 퍽→푸 ${pct(a.fsBlow, N)} · 퍽→취소 ${pct(a.fsCancel, N)} | 긴 멈춤 퍽→푸 ${pct(b.fsBlow, N)} · 퍽→취소 ${pct(b.fsCancel, N)} | 쓸기 놓침 ${pct(a.miss, N)} · ${fmtLat(a)} | 느린 밀기 푸 ${pct(blow, tot)} · 취소 ${pct(cancel, tot)} · 퍽 ${pct(puff, tot)} (나쁜 칸 퍽 ${(100 * worst).toFixed(2)}%)`);
    }
  }
}
// 짧은 느린 밀기: 'slowCancel 40' 은 40 px 이상 민 느린 밀기만 취소로 돌린다. 그보다 짧게 민 밀기는 지금도 말없이 퍽인가
const SHORT_D = [12, 20, 30, 38, 50, 80];
function short() {
  console.log(`# 짧은 느린 밀기 — 밀기 길이 고정 × 고른 속도 20·30 px/s × 손 3, 칸당 ${N}번. 칸: 퍽 · 취소 · 푸 (지금 = 떼기 규칙 없음 / 제안 = slowCancel 40)`);
  for (const [name, extra] of [['지금', {}], ['제안 slowCancel 40', { slowCancel: 40 }]]) {
    const cfg = { ...GCFG, ...extra };
    console.log(`\n## ${name}`);
    console.log(`속도 | 손 | ` + SHORT_D.map((d) => `${d} px`).join(' | '));
    for (const v of [20, 30]) for (const [hk, pl] of Object.entries(PL)) {
      const cs = SHORT_D.map((d) => cell(cfg, pl, hashSeed(`short|${hk}|${v}|${d}`), N, { sweepOnly: true, prof: 'const', vFix: v, D: d }));
      console.log(`${v} px/s | ${hk} | ` + cs.map((c) => `퍽 ${pct(c.missPuff, N)} · 취소 ${pct(c.missCancel, N)} · 푸 ${pct(N - c.miss, N)}`).join(' | '));
    }
  }
}
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gestnoise.mjs');
if (isMain) {
  const cmd = process.argv[2] || 'table';
  if (cmd === 'table') table();
  else if (cmd === 'speed') speed();
  else if (cmd === 'fix') fix();
  else if (cmd === 'short') short();
  else { console.error('명령: table | speed | fix | short'); process.exit(1); }
}

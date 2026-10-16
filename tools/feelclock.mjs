// tools/feelclock.mjs — 06 §8.11 '실험: 바람 도달 시간' 손맛 실측: 놓기 기준 벽시계 ms(단서·멈칫·슬로모·보이는 첫 움직임)를
//   Playwright 가짜 시계(page.clock, rAF 16 ms 간격 ≈ 60 Hz)로 프레임 단위로 잰다. 원자료 = tools/coresweep/data/feel/*.jsonl.gz
//
// 🧭 가설(확인 대상): 지연(jetLag 0.02)만 켜면 더미 쪽 단서가 움직임보다 훨씬 먼저 나와 렉으로 읽히고(②), 공기 앞머리 연출로 단서·멈칫을
//   도달에 맞추면(③) 보이는 첫 움직임이 물리 지연만큼만 늦고, 멈칫을 이동 시간만큼 줄이면(④) 오늘(①)과 같거나 조금 빠르다.
//   → 판가름 = 아래 표의 ①~④ '보이는 첫 움직임' 열. 손맛(공기냐 렉이냐)은 이 도구가 아니라 재윤님이 정한다(BLOCKERS G12).
//
// 하는 일
//   1) 지금 mockup 을 임시 폴더(os.tmpdir()/puff-feelclock-*)에 복사해 main.js 에 기록 훅만 넣고(PATCHES — 자리마다 '정확히 1번'
//      바꾸기, 훅 자리가 바뀌어 0번·2번이면 곧바로 멈추고 임시 폴더를 지운다) build.mjs 와 같은 esbuild 설정으로 단일 HTML 을 만든다.
//      레포 파일은 안 건드린다. 훅 자리 밖의 main.js 변경은 멈추지 않는다 — check 가 결과(report 출력)로 잡는다(결과가 같으면 통과).
//   2) Chromium 을 가짜 시계로 돌려 샷마다: 레벨(1 = 3장, 7 = 10장) 또는 오늘의 판(20장)을 열고, 자세(눈높이·책상 입)를 고르고,
//      엄지를 당겨(초록 0.9 · 약한 0.45 · 센 1.4) 마지막 프레임 뒤 ph ms(0·5·11)에 놓는다. 놓은 뒤 75프레임 동안 매 프레임
//      딱지 테두리 16점의 화면 이동(px)·슬로모·멈칫·고리·바람 줄기·카메라와 단서 호출(효과음·진동·충격파·번쩍) 시각을 적는다.
//   3) 원자료 한 줄 = 한 샷 → <OUT>/<묶음>.jsonl.gz (gzip -n 과 같은 머리: mtime 0·이름 없음). 맨 앞 줄 = meta(소스 해시·Chromium 판).
//   4) §8.11 표를 찍는다(마크다운 그대로). 그 아래 세부·'프레임 맞춤'(고리 멈춤 = 도달 프레임, 슬로모 = 카메라 물러남,
//      움직임 − 슬로모, 대조 ≡ ①) 줄이 §8.11 본문 주장의 근거다.
//
// 묶음(SETS) — §8.11 이 인용하는 것 전부
//   main : 모드 5(① v1 · ② lag · ③ air · ④ cut · 대조 v1air) × 판 5(1:eye · 7:eye · 7:low · d:eye · d:low) × 위상 3(0·5·11) = 75샷, 숨 0.9
//   bw   : 모드 4(①~④) × 숨 2(0.45 · 1.4, 레벨 7 눈높이) × 위상 2(0·11) = 16샷
//
// 쓰기
//   PW=$(npm root -g)/playwright node tools/feelclock.mjs run        # 원자료를 data/feel 에 다시 쓰고 표 출력(약 15분, 샷당 약 9초)
//   PW=$(npm root -g)/playwright node tools/feelclock.mjs check      # 임시 폴더에 다시 재서 회귀 검사: 판정 = 커밋 원자료와 다시 잰 원자료의 report 출력
//                                                                    #   (표·세부·프레임 맞춤·판별 줄) 글자 대조, 다르면 exit 1. 샷마다 모든 필드 대조는 참고로 찍음
//   node tools/feelclock.mjs report                                  # 커밋된 원자료로 표만(브라우저 없음, 1초). 원자료를 잰 mockup 과 지금 mockup 이 다르면 경고
//   첫 인자(run · check · report)는 꼭 써야 한다 — 없거나 모르는 값이면 아무것도 안 하고 exit 2(커밋된 원자료를 실수로 덮어쓰지 않게).
//   두 번째 인자 = 묶음(main · bw · main,bw, 기본 main,bw). OUT=폴더 = run 의 출력 폴더. KEEP=1 = 계측 사본 지우지 않음(경로 출력)
//
// 결정성: 가짜 시계·고정 날짜(2026-10-15)·물리(Rapier WASM)는 결정적이다. 남는 흔들림 두 가지를 막았다
//   (a) 놓는 순간의 프레임 위상 — rAF 시각을 재서 '마지막 프레임 + ph ms'에 정확히 놓는다(phReal·f1 로 기록·검사)
//   (b) 화면 흔들림·입자의 Math.random — 놓는 순간 고정 시드(mulberry32)로 다시 심는다
//   부팅(WASM 컴파일)이 실제 시간이라 놓기 전 대기 프레임 수는 실행마다 다를 수 있다 → 놓기 전 기다림을 모두 16 ms 의 배수로 둬서
//   놓는 순간의 상태가 같게 했다. 그래도 완전하지 않다: check 다섯 번 중 세 번은 91/91 샷 모든 필드가 같았지만, 다른 무거운 작업과 함께 돈
//   check 두 번에서 1샷·2샷(모두 레벨 7)이 첫 움직임 뒤만 갈라졌다(원인 미확인, 06 §8.11). 그래서 check 의 판정은 문서가 인용하는
//   report 출력(첫 움직임까지의 값)으로 하고, 샷 모든 필드는 참고로 찍는다. Chromium 판·글꼴이 바뀌면 화면 좌표가 달라질 수 있다(meta 에 판 기록).
// 한계: 120 Hz·실기기 햅틱·소리 출력 지연은 재지 않는다. 그리기는 끈다(window.__norender — 프레임 루프·카메라 행렬은 그대로 돈다).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, cpSync, rmSync, mkdtempSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'tools/coresweep/data/feel');
const SETS = {
  main: { combos: ['v1', 'lag', 'air', 'cut', 'v1air'], cfg: ['1:eye', '7:eye', '7:low', 'd:eye', 'd:low'], ph: [0, 5, 11], pull: 0.9 },
  bw: { combos: ['v1', 'lag', 'air', 'cut'], cfg: ['7:eye:0.45', '7:eye:1.4'], ph: [0, 11], pull: 0.9 },
};
const QS = { v1: 'airlog=1', lag: 'jetlag=0.02&airlog=1', air: 'jetlag=0.02&airfx=1&airlog=1', cut: 'jetlag=0.02&airfx=1&hscut=1&airlog=1', v1air: 'airfx=1&hscut=1&airlog=1' };
const NAME = { v1: '① 모두 끔 = 오늘', lag: '② 도달 지연만', air: '③ 지연 + 공기 앞머리', cut: '④ ③ + 멈칫 줄이기', v1air: '대조: 연출만(지연 끔)' };
const VW = 390, VH = 844, DSF = 2, FRAMES = 75, SEED = 0x9e3779b9;
const TR = 40, TR_COLS = ['t ms', 'timeScale', 'hitstop', 'sim ms', 'mp px', 'camAim', 'cam z']; // 샷마다 앞 40프레임(640 ms) 자취 — '왜 빠른가' 같은 설명을 원자료로 다시 볼 수 있게

// ── 1) 계측 사본 ──────────────────────────────────────────────────────────────
// 훅: 단서 호출 시각(__cue) · 매 프레임 기록(__rec ← __fr) · 기준 자세(__setBase 놓기 직전, __setBaseA 지연 숨의 도달 스텝)
const TAIL = `
const __RIM = Array.from({ length: 16 }, (_, j) => new THREE.Vector3(Math.cos((j >> 1) * Math.PI / 4) * DISC_R, (j & 1 ? 0.5 : -0.5) * DISC_H, Math.sin((j >> 1) * Math.PI / 4) * DISC_R));
function __rim(m) { return __RIM.map((v) => v.clone().applyQuaternion(m.quaternion).add(m.position)); }
window.__setBase = () => { window.__base = new Map(); window.__baseA = null; for (const [id, m] of meshes) window.__base.set(id, __rim(m)); };
window.__setBaseA = () => { window.__baseA = new Map(); for (const [id, m] of meshes) window.__baseA.set(id, __rim(m)); };
function __px(v) { const p = v.clone().project(camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; }
window.__fr = (now) => {
  let mw = 0, mp = 0, mpA = null;
  if (window.__baseA) { mpA = 0; for (const [id, m] of meshes) { const b = window.__baseA.get(id); if (!b) continue; const c = __rim(m); for (let j = 0; j < 16; j++) { const p0 = __px(b[j]), p1 = __px(c[j]); mpA = Math.max(mpA, Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); } } }
  if (window.__base) for (const [id, m] of meshes) { const b = window.__base.get(id); if (!b) continue; const c = __rim(m); for (let j = 0; j < 16; j++) { mw = Math.max(mw, c[j].distanceTo(b[j])); const p0 = __px(b[j]), p1 = __px(c[j]); mp = Math.max(mp, Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); } }
  const Rg = airShot?.ring;
  let ring = null;
  if (Rg && Rg.grp.visible) { const pos = Rg.grp.position, sc = Rg.grp.scale.x; const c = __px(pos); const e = __px(pos.clone().add(new THREE.Vector3(sc, 0, 0))); const e2 = __px(pos.clone().add(new THREE.Vector3(0, sc, 0))); ring = { op: +Rg.core.material.opacity.toFixed(3), r: +sc.toFixed(3), px: c.map(Math.round), rpx: Math.round(Math.max(Math.hypot(e[0] - c[0], e[1] - c[1]), Math.hypot(e2[0] - c[0], e2[1] - c[1]))), dist: +pos.distanceTo(camera.position).toFixed(2) }; }
  return { now, ts: +timeScale.toFixed(3), slow: slowUntil > now, hstop: hitStopUntil > now, shake: +shake.toFixed(3), puffer: puffer.mode, simT: +simWatch.simTime.toFixed(4), mw: +mw.toFixed(4), mp: +mp.toFixed(2), mpA: mpA == null ? null : +mpA.toFixed(2), ring, streaks: fx.streaks.filter((m) => m.visible).length, cam: camera.position.toArray().map((v) => +v.toFixed(2)), camAim: +camAim.toFixed(3), fpv: fpvOn(), pose, ratio: breath.ratio, flashOp: +getComputedStyle($('#flash')).opacity, gizmo: reticle.visible };
};
`;
const PATCHES = [
  ['const sfx = new Sfx();', `const sfx = new Sfx();
window.__cue = [];
function __L(k, x) { window.__cue.push({ k, t: performance.now(), ...(x || {}) }); }
for (const k of ['puff', 'airHit', 'whoosh', 'flip', 'clack', 'tone', 'pop']) { const g = sfx[k]?.bind(sfx); if (g) sfx[k] = (...a) => { __L('sfx.' + k, { a0: a[0] }); return g(...a); }; }`],
  ['function flash(a = 0.5) {', "function flash(a = 0.5) { __L('flash', { a });"],
  ['function shockwave(c, power) {', "function shockwave(c, power) { __L('shockwave');"],
  ['function ringStart(A) {', "function ringStart(A) { __L('ringStart');"],
  ['function breathFeedback(ratio, who, forceKey) {', "function breathFeedback(ratio, who, forceKey) { __L('breathFb');"],
  ['function expArrive(A) {', "function expArrive(A) { __L('expArrive', { air: A.air }); window.__setBaseA?.();"],
  ["fx = new Fx(scene, camera, $('#fxl'));", `fx = new Fx(scene, camera, $('#fxl'));
  { const w = fx.wind.bind(fx), e = fx.emit.bind(fx); fx.wind = (...a) => { __L('fx.wind', { clock: !!a[4] }); return w(...a); }; fx.emit = (o) => { if (o.n >= 14) __L('fx.emit', { n: o.n, c: o.color }); return e(o); }; }`],
  ['  frame._last = now;\n  renderer.render(scene, camera);', '  frame._last = now;\n  if (window.__norender) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); } else renderer.render(scene, camera);\n  if (window.__rec) window.__rec.push(window.__fr(now));'],
  ['  A.hs = hs;\n', "  A.hs = hs; __L('hs', { hs });\n"],
  ['\nboot();', TAIL + '\nboot();'],
];
export function patchMain(src) {
  let s = src;
  for (const [a, b] of PATCHES) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`feelclock: mockup/src/main.js 훅 자리가 ${n}번 나온다(정확히 1번이어야 함) — main.js 가 바뀌었다. tools/feelclock.mjs PATCHES 를 고칠 것: ${JSON.stringify(a.slice(0, 70))}`);
    s = s.replace(a, () => b);
  }
  return s;
}
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
function srcInfo() {
  const rd = (f) => readFileSync(join(ROOT, 'mockup/src', f), 'utf8').replace(/\r\n/g, '\n');
  const simSrc = sha(['sim.js', 'rules.js', 'turn.js'].map(rd).join('\0')); // build.mjs 와 같은 식(PvP 버전 해시)
  const files = readdirSync(join(ROOT, 'mockup/src')).filter((f) => f.endsWith('.js')).sort();
  const mockup = sha(files.map((f) => f + '\0' + rd(f)).join('\0') + '\0' + readFileSync(join(ROOT, 'mockup/index.html'), 'utf8'));
  return { simSrc, mockup, main: sha(rd('main.js')) };
}
async function buildInst(info) {
  const D = mkdtempSync(join(tmpdir(), 'puff-feelclock-'));
  try { await buildInto(D, info); } catch (e) { if (!process.env.KEEP) rmSync(D, { recursive: true, force: true }); throw e; } // 훅 자리 틀림 등 → 임시 폴더를 남기지 않음
  return D;
}
async function buildInto(D, info) {
  cpSync(join(ROOT, 'mockup'), join(D, 'mockup'), { recursive: true });
  const f = join(D, 'mockup/src/main.js');
  writeFileSync(f, patchMain(readFileSync(f, 'utf8')));
  const tpl = readFileSync(join(D, 'mockup/index.html'), 'utf8');
  const out = await esbuild.build({ entryPoints: [f], bundle: true, format: 'iife', minify: false, write: false, target: 'es2020', legalComments: 'none', define: { __PUFF_SIMSRC__: JSON.stringify(info.simSrc) }, nodePaths: [join(ROOT, 'node_modules')], logLevel: 'error' });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // 효과음 샘플(build.mjs sfxScript 와 같은 규칙) — 없으면 합성음. 단서 시각은 훅이 메서드 호출에서 재므로 어느 쪽이든 같다
  const sdir = join(ROOT, 'mockup/assets/sfx'), map = {};
  if (existsSync(sdir)) for (const g of readdirSync(sdir).sort()) { const m = /^([a-z]+)-?\d*\.(mp3|ogg|wav)$/i.exec(g); if (m) (map[m[1]] ||= []).push(`data:${{ mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' }[m[2].toLowerCase()]};base64,${readFileSync(join(sdir, g)).toString('base64')}`); }
  const sfx = Object.keys(map).length ? `<script>window.__PUFF_SFX__=${JSON.stringify(map)}</script>` : '';
  const html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + tpl.replace('<!--APP-->', () => `${sfx}<script>${js}</script>`) + '\n</body>\n</html>\n';
  writeFileSync(join(D, 'puff-inst.html'), html);
}

// ── 2) 가짜 시계로 돌리기 ──────────────────────────────────────────────────────
const PROFILE = 'g2-ddakji-profile-v1';
async function runSet(browser, file, setName, log = console.log) {
  const T0 = Date.now();
  const S = SETS[setName];
  const cfgs = S.cfg.map((s) => { const [lv, pose, pull] = s.split(':'); return { lv, pose, pull: pull ? +pull : S.pull }; });
  const rows = [];
  for (const combo of S.combos) {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    // 그리기 끔 · 진동 기록 · 다시 심을 수 있는 Math.random(놓는 순간 __reseed — 흔들림·입자 난수 고정)
    await page.addInitScript(() => {
      window.__norender = true; window.__vib = [];
      navigator.vibrate = (p) => { window.__vib.push({ t: performance.now(), p }); return true; };
      let a = 1;
      Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.__reseed = (s) => { a = s | 0; };
    });
    await page.clock.install({ time: new Date('2026-10-15T10:00:00') });
    await page.clock.pauseAt(new Date('2026-10-15T10:00:01'));
    const run = (ms) => page.clock.runFor(ms); // 놓기 전 기다림은 모두 16 ms 의 배수(프레임 격자와 사건 시각의 어긋남이 실행마다 같게)
    const until = async (fn, max = 60000, step = 208) => { for (let t = 0; t < max; t += step) { if (await page.evaluate(fn).catch(() => false)) return true; await run(step); } return false; };
    const url = (extra = '') => 'file://' + file + '?' + QS[combo] + extra;
    await page.goto(url());
    await until(() => window.__puffBooted);
    await page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k) || '{}'); p.tutorialPuffs = 40; p.firstPlay = false; p.settings = { ...(p.settings || {}), feelV: 9, feel: { ...((p.settings || {}).feel || {}), beat: 0 } }; localStorage.setItem(k, JSON.stringify(p)); }, PROFILE);
    let rep = 0;
    for (const cfg of cfgs) for (const ph of S.ph) {
      rep++;
      if (cfg.lv === 'd') { // 오늘의 판(20장): 오늘 기록을 지우고 다시 연다
        await page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k) || '{}'); delete p.daily; localStorage.setItem(k, JSON.stringify(p)); }, PROFILE);
        await page.goto(url('&r=' + rep));
        await until(() => window.__puffBooted);
        await run(608);
        await page.$eval('#dailyBtn', (e) => e.click());
      } else {
        await page.goto(url('&r=' + rep + '#lv' + cfg.lv));
        await until(() => window.__puffBooted);
        await until(() => !document.querySelector('#lvIntro').hidden, 60000, 16);
        await page.$eval('#liPlay', (e) => e.click());
      }
      if (!(await until(() => window.__puff().state === 'match' && !document.querySelector('#hint').hidden, 30000, 16))) { errs.push('no turn ' + JSON.stringify(cfg)); continue; }
      await run(400);
      if (cfg.pose === 'low') {
        await until(() => !document.querySelector('#lipRail').hidden, 5000, 16);
        await page.keyboard.press('ArrowDown');
        await run(912);
      }
      const st = await page.evaluate(() => window.__puff());
      const hPx = st.frontBottom.y - st.frontTop.y, x = st.frontTop.x, y = st.frontTop.y + hPx * 0.25;
      const hi = Math.min(1.12, Math.max(0.45, 0.45 + 0.5 * Math.sqrt((st.live - 1) / 19))); // main.js 엄지 당김 → 숨 비율(당김 = 비율)
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + 0.42 * Math.min(VW, VH) * hi * cfg.pull * i / 8); await run(32); }
      await run(144);
      // 위상 맞춤: rAF 한 번의 시각 F 를 재고 '마지막 프레임 + ph ms' 에 놓는다
      await page.evaluate(() => { window.__ft = null; requestAnimationFrame(() => { window.__ft = performance.now(); }); });
      await run(16);
      const { F, N } = await page.evaluate(() => ({ F: window.__ft, N: performance.now() }));
      let T = F + ph; while (T < N) T += 16;
      if (T > N) await run(T - N);
      const t0 = await page.evaluate((seed) => { window.__setBase(); window.__rec = []; window.__cue = []; window.__vib = []; window.__reseed(seed); return performance.now(); }, SEED);
      await page.mouse.up();
      await run(FRAMES * 16); // 프레임 기록은 페이지 안(__rec)에서 — 한 번에 돌려도 rAF 는 16 ms 마다 하나씩 돈다
      const d = await page.evaluate(() => ({ rec: window.__rec, cue: window.__cue, vib: window.__vib, exp: window.__puffExp() }));
      await page.evaluate(() => { window.__rec = null; });
      const R = (v) => (v == null ? null : Math.round(v - t0));
      const cue = {};
      for (const c of d.cue) { const k = c.k + (c.k === 'fx.emit' ? ':' + c.n : ''); (cue[k] ||= []).push(R(c.t)); }
      const fr = d.rec, L = d.exp.last;
      const first = (pred) => { const q = fr.find(pred); return q ? R(q.now) : null; };
      const ringFr = fr.filter((q) => q.ring);
      const row = {
        set: setName, combo, n: st.live, lv: cfg.lv, pose: cfg.pose, pull: cfg.pull, ph, phReal: Math.round(t0 - F) % 16, f1: fr[0] ? R(fr[0].now) : null,
        ratio: fr[fr.length - 1]?.ratio != null ? +fr[fr.length - 1].ratio.toFixed(2) : null,
        hs: L?.hs ?? null, hsI: L?.hsImpact ?? null, moveWallGame: L?.moveWall != null ? Math.round(L.moveWall) : null, arrWall: L?.arrWall != null ? Math.round(L.arrWall) : null,
        physHit: L?.hitPhys != null ? Math.round(L.hitPhys * 1000) : null, physMove: L?.movePhys != null ? Math.round(L.movePhys * 1000) : null,
        firstSimFrame: first((q) => q.simT > 0), slowStart: first((q) => q.ts < 0.95), slowFlag: first((q) => q.slow), tsMin: Math.min(...fr.map((q) => q.ts)),
        move03: first((q) => q.mw >= 0.03), px1: first((q) => q.mp >= 1), px3: first((q) => q.mp >= 3), px3A: first((q) => (q.mpA ?? (L?.lag ? -1 : q.mp)) >= 3), px8: first((q) => q.mp >= 8),
        ringFirst: ringFr.length ? R(ringFr[0].now) : null, ringLast: ringFr.length ? R(ringFr[ringFr.length - 1].now) : null, ringN: ringFr.length,
        ringPath: ringFr.map((q) => `${R(q.now)}ms r${q.ring.rpx}px op${q.ring.op} @${q.ring.px.join(',')} d${q.ring.dist}`),
        streakFirst: first((q) => q.streaks > 0), streakMax: Math.max(0, ...fr.map((q) => q.streaks)),
        camMove: first((q) => fr[0] && Math.hypot(q.cam[0] - fr[0].cam[0], q.cam[1] - fr[0].cam[1], q.cam[2] - fr[0].cam[2]) > 0.02), gizmoOff: first((q) => !q.gizmo),
        hstopFrames: fr.filter((q) => q.hstop).map((q) => R(q.now)), faceIdle: first((q) => q.puffer === 'idle'), camStart: fr[0]?.cam ?? null, fpv: fr[0]?.fpv ?? null, posePlayed: fr[0]?.pose ?? null,
        flashVisible: first((q) => q.flashOp > 0.05),
        cue, vib: d.vib.map((v) => `${R(v.t)}:${v.p}`),
        tr: fr.slice(0, TR).map((q) => [R(q.now), q.ts, q.hstop ? 1 : 0, Math.round(q.simT * 1000), q.mp, q.camAim, q.cam[2]]), // 프레임 자취(TR_COLS)
      };
      rows.push(row);
      log(`  (${((Date.now() - T0) / 1000).toFixed(0)}s) [${setName} ${combo}] n=${row.n} ${row.pose} 숨${row.pull} 위상${ph}(${row.phReal}) | 멈칫 ${row.hs}/${row.hsI} | 도달 ${row.arrWall} 충격파 ${cue.shockwave} 푸 ${cue['sfx.puff']} 진동 ${row.vib.slice(0, 2).join(' ')} | 슬로모 ${row.slowStart} | 보이는 첫 움직임 ${row.px3}(화면 ${row.moveWallGame}) | 고리 ${row.ringFirst}~${row.ringLast}`);
    }
    rows.push({ set: setName, combo, errs });
    if (errs.length) log(`  [${setName} ${combo}] 오류: ${errs.join(' | ')}`);
    await ctx.close();
  }
  return rows;
}

// ── 3) 원자료 읽고 쓰기 ────────────────────────────────────────────────────────
const writeRows = (f, rows) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 })); };
const readRows = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)) : readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const shots = (rows) => rows.filter((r) => !r.meta && !r.errs);
const keyOf = (r) => `${r.set}|${r.combo}|${r.lv}|${r.pose}|${r.pull}|${r.ph}`;

// ── 4) 표 ──────────────────────────────────────────────────────────────────────
const rng = (v) => { v = v.filter((x) => x != null); if (!v.length) return '-'; const a = Math.min(...v), b = Math.max(...v); return a === b ? `${a}` : `${a}~${b}`; };
const med = (v) => { v = v.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[(v.length - 1) >> 1] : null; };
const sgn = (x) => (x == null ? '?' : x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '±0');
const c0 = (r, k) => r.cue[k]?.[0] ?? null;
const vibAt = (r, i) => (r.vib[i] ? +r.vib[i].split(':')[0] : null), vibP = (r, i) => (r.vib[i] ? +r.vib[i].split(':')[1] : null);
const strongVib = (r) => { const v = r.vib.map((s) => s.split(':').map(Number)).find(([, p]) => p >= 40); return v ? v[0] : null; };
// 공기 고리가 멈춘 프레임: ringPath 의 카메라 거리(d)가 다음 프레임에 0.05 u 미만으로만 늘어나는 첫 프레임(날 때는 프레임당 약 0.5 u)
const ringStop = (r) => { const p = r.ringPath.map((x) => { const m = /^(-?\d+)ms .* d([\d.]+)$/.exec(x); return m ? [+m[1], +m[2]] : null; }).filter(Boolean); for (let i = 0; i + 1 < p.length; i++) if (p[i + 1][1] - p[i][1] < 0.05) return p[i][0]; return null; };
// 카메라 물러남 시작: 프레임 자취(tr)의 camAim 이 그때까지의 최댓값보다 0.02 넘게 떨어진 첫 프레임
const camRetreat = (r) => { let mx = -1; for (const x of r.tr) { if (x[5] < mx - 0.02) return x[0]; mx = Math.max(mx, x[5]); } return null; };
const sansCombo = (r) => { const { combo, ...x } = r; return JSON.stringify(x); };
// 표·세부·프레임 맞춤이 읽는 값(놓기 → 보이는 첫 움직임 창 + 타이머로 정해지는 고리 사라짐·얼굴 쉼). 첫 움직임 뒤 물리(자취 뒤쪽·1초 무렵 뒤집힘 소리)는 뺀다
const tableVals = (r) => { const at = r.tr.find((x) => x[0] === r.px3); return JSON.stringify([r.n, r.phReal, r.f1, r.ratio, r.hs, r.hsI, r.moveWallGame, r.arrWall, r.physHit, r.physMove, r.slowStart, r.px3, r.gizmoOff, r.streakFirst, r.ringFirst, r.ringLast, r.ringN, r.camMove, r.faceIdle, r.flashVisible, c0(r, 'sfx.puff'), c0(r, 'shockwave'), c0(r, 'flash'), c0(r, 'sfx.airHit'), vibAt(r, 0), vibP(r, 0), strongVib(r), camRetreat(r), r.ringN ? ringStop(r) : null, at ? [at[3], at[5]] : null, r.tr.filter((x) => x[1] < 0.95 && x[0] < r.px3).length]); };
const META_KEYS = [['mockup', (m) => m.src.mockup], ['main.js', (m) => m.src.main], ['sim src', (m) => m.src.simSrc], ['브라우저', (m) => m.browser], ['화면', (m) => `${m.vw}×${m.vh}@${m.dsf}`], ['프레임 수', (m) => m.frames], ['시드', (m) => m.seed], ['자취 열', (m) => JSON.stringify(m.tr)], ['묶음 설정', (m) => JSON.stringify(m.cfg)]];
export const metaDiff = (a, b) => META_KEYS.filter(([, f]) => f(a) !== f(b)).map(([k, f]) => `${k} ${f(a)} → ${f(b)}`);
export function report(all, log = console.log) {
  const rows = shots(all), metas = all.filter((r) => r.meta), errs = all.filter((r) => r.errs);
  const cur = srcInfo();
  for (const m of metas) {
    log(`원자료 ${m.set}: 샷 ${rows.filter((r) => r.set === m.set).length} · mockup ${m.src.mockup} · main.js ${m.src.main} · sim src ${m.src.simSrc} · ${m.browser} · ${m.vw}×${m.vh}@${m.dsf} · 프레임 16 ms`);
    if (m.src.mockup !== cur.mockup) log(`  주의: 이 원자료는 지금과 다른 mockup 으로 쟀다(mockup ${m.src.mockup} → 지금 ${cur.mockup}${m.src.main !== cur.main ? ` · main.js ${m.src.main} → ${cur.main}` : ''}). 표는 원자료를 잰 코드 기준이다 — 지금 코드로는 check 로 확인할 것(결과가 같으면 통과).`);
  }
  const nErr = errs.reduce((s, r) => s + r.errs.length, 0);
  const phOk = rows.filter((r) => r.phReal === r.ph && r.f1 === (r.ph ? 16 - r.ph : 16)).length;
  const scr = rows.filter((r) => r.px3 === r.moveWallGame).length;
  log(`콘솔 오류 ${nErr} · 놓기 위상 맞음 ${phOk}/${rows.length} · 계측 '보이는 첫 움직임' = 게임 화면 수치 ${scr}/${rows.length}`);
  const pair = (R, base) => R.map((r) => { const b = base.find((q) => q.lv === r.lv && q.pose === r.pose && q.pull === r.pull && q.ph === r.ph); return b && r.px3 != null && b.px3 != null ? r.px3 - b.px3 : null; });
  // main: §8.11 표
  const M = rows.filter((r) => r.set === 'main');
  if (M.length) {
    const V1 = M.filter((r) => r.combo === 'v1');
    log('\n#### main: 초록 숨 0.9, 놓기 기준 벽시계 ms (범위 = 판 5 × 위상 3, 괄호 = 같은 판·자세·위상 ① 대비 차이의 중앙값)\n');
    log("| 모드 | 입 쪽 단서('푸'·진동) | 더미 쪽 단서(충격파·번쩍·퍽·강한 진동) | 멈칫 | 슬로모 시작 | 보이는 첫 움직임 10·20장 | 3장 |");
    log('|---|---|---|---|---|---|---|');
    for (const c of SETS.main.combos) {
      const R = M.filter((r) => r.combo === c); if (!R.length) continue;
      const big = R.filter((r) => r.n >= 10), sm = R.filter((r) => r.n === 3);
      const air = R.some((r) => r.hsI != null);
      const puff = rng(R.map((r) => c0(r, 'sfx.puff'))), vib = rng(R.map((r) => vibAt(r, 0)));
      const mouth = `${puff}${vib !== puff ? ` (진동 ${vib})` : ''}`;
      const shock = rng(R.map((r) => c0(r, 'shockwave')));
      const lead = (S) => rng(S.map((r) => (r.px3 != null && c0(r, 'shockwave') != null ? r.px3 - c0(r, 'shockwave') : null)));
      const pile = air ? `도달 ${shock}` : R.some((r) => r.arrWall != null) ? `${shock} (움직임보다 10·20장 ${lead(big)} · 3장 ${lead(sm)} ms 먼저)` : shock;
      const hs = air ? `도달 뒤 ${rng(R.map((r) => r.hsI))}` : `놓은 뒤 ${rng(R.map((r) => r.hs))}`;
      const d = (S) => (c === 'v1' ? '' : ` (${sgn(med(pair(S, V1)))})`);
      log(`| ${NAME[c]} | ${mouth} | ${pile} | ${hs} | ${rng(R.map((r) => r.slowStart))} | ${rng(big.map((r) => r.px3))}${d(big)} | ${rng(sm.map((r) => r.px3))}${d(sm)} |`);
    }
    log('\n세부(범위):');
    for (const c of SETS.main.combos) {
      const R = M.filter((r) => r.combo === c); if (!R.length) continue;
      const same = R.filter((r) => { const s = c0(r, 'shockwave'); return s != null && c0(r, 'flash') === s && strongVib(r) === s && (r.hsI == null || c0(r, 'sfx.airHit') === s); }).length;
      const phys = ['3', '10·20'].map((g) => { const S = R.filter((r) => (g === '3' ? r.n === 3 : r.n >= 10)); return `${g}장 닿음 ${rng(S.map((r) => r.physHit))}·첫 움직임 ${rng(S.map((r) => r.physMove))}`; }).join(' / ');
      log(`  ${NAME[c]}: 단서 같은 프레임(충격파=번쩍=강한 진동${R.some((r) => r.hsI != null) ? '=퍽' : ''}) ${same}/${R.length} · 조준 고리 숨김 ${rng(R.map((r) => r.gizmoOff))} · 바람 줄기 ${rng(R.map((r) => r.streakFirst))} · 공기 고리 ${rng(R.map((r) => r.ringFirst))}..${rng(R.map((r) => r.ringLast))} · 카메라 움직임 ${rng(R.map((r) => r.camMove))} · 부는 얼굴 쉼 ${rng(R.map((r) => r.faceIdle))} | 물리(ms) ${phys}`);
    }
    log('\n프레임 맞춤(원자료로 셈 — §8.11 ③·④ 세부의 근거):');
    for (const c of SETS.main.combos) {
      const R = M.filter((r) => r.combo === c); if (!R.length) continue;
      const big = R.filter((r) => r.n >= 10), sm = R.filter((r) => r.n === 3), rg = R.filter((r) => r.ringN && c0(r, 'shockwave') != null);
      const gap = (S) => `${rng(S.map((r) => (r.px3 != null && r.slowStart != null ? r.px3 - r.slowStart : null)))}(${S.length}샷)`;
      log(`  ${NAME[c]}: 슬로모 시작 = 카메라 물러남 시작 ${R.filter((r) => r.slowStart != null && camRetreat(r) === r.slowStart).length}/${R.length} · 보이는 첫 움직임 − 슬로모 시작 10·20장 ${gap(big)} · 3장 ${gap(sm)} ms${rg.length ? ` · 공기 고리 멈춤 = 도달(충격파) 프레임 ${rg.filter((r) => ringStop(r) === c0(r, 'shockwave')).length}/${rg.length}` : ''}`);
    }
    const C = M.filter((r) => r.combo === 'v1air');
    if (C.length && V1.length) {
      const twin = (r) => V1.find((q) => keyOf({ ...q, combo: 'v1air' }) === keyOf(r));
      log(`  ${NAME.v1air} ≡ ${NAME.v1}: 같은 판·자세·위상 샷의 표·세부 값(첫 움직임까지 + 고리·얼굴 타이머) 같음 ${C.filter((r) => twin(r) && tableVals(twin(r)) === tableVals(r)).length}/${C.length}`);
      log(`  (참고) 같은 쌍의 모든 필드(combo 빼고, 첫 움직임 뒤 물리까지) 같음 ${C.filter((r) => twin(r) && sansCombo(twin(r)) === sansCombo(r)).length}/${C.length} — 부하 아래 첫 움직임 뒤 물리가 가끔 갈라진다(06 §8.11 결정성), check 판정에서 뺌`);
    }
    log('\n보이는 첫 움직임 프레임에서(프레임 자취 tr): 물리 시각 · 그 전에 슬로모로 보인 프레임 수 · camAim(1 = 조준 시점, 0 = 물러난 시점):');
    for (const c of SETS.main.combos) {
      const R = M.filter((r) => r.combo === c); if (!R.length) continue;
      log(`  ${NAME[c]}: ` + [['3장', R.filter((r) => r.n === 3)], ['10·20장', R.filter((r) => r.n >= 10)]].map(([g, S]) => {
        const at = S.map((r) => r.tr.find((x) => x[0] === r.px3)).filter(Boolean);
        return `${g} 물리 ${rng(at.map((x) => x[3]))} ms · 슬로모 프레임 ${rng(S.map((r) => r.tr.filter((x) => x[1] < 0.95 && x[0] < r.px3).length))} · camAim ${rng(at.map((x) => x[5]))}`;
      }).join(' / '));
    }
    log('\n판별(범위, 보이는 첫 움직임 / 슬로모 시작 / 멈칫):');
    for (const cfg of SETS.main.cfg) {
      const [lv, pose] = cfg.split(':');
      log(`  ${lv === 'd' ? '오늘의 판' : '레벨 ' + lv} ${pose}: ` + SETS.main.combos.map((c) => { const R = M.filter((r) => r.combo === c && r.lv === lv && r.pose === pose); return R.length ? `${c} n${R[0].n} ${rng(R.map((r) => r.px3))}/${rng(R.map((r) => r.slowStart))}/${rng(R.map((r) => r.hsI ?? r.hs))}` : ''; }).filter(Boolean).join(' · '));
    }
  }
  // bw: 약한·센 숨
  const B = rows.filter((r) => r.set === 'bw');
  if (B.length) {
    log('\n#### bw: 약한 0.45 · 센 1.4 (레벨 7 = 10장 눈높이, 위상 0·11)\n');
    log('| 숨 | 모드 | 멈칫 | 더미 쪽 단서 | 진동(세기) | 공기 고리 사라짐 | 보이는 첫 움직임 |');
    log('|---|---|---|---|---|---|---|');
    for (const pull of [0.45, 1.4]) for (const c of SETS.bw.combos) {
      const R = B.filter((r) => r.combo === c && r.pull === pull); if (!R.length) continue;
      const air = R.some((r) => r.hsI != null);
      const vibs = [...new Set(R.flatMap((r) => r.vib.filter((s) => +s.split(':')[0] < 400).map((s) => s.split(':')[1])))].join('·');
      log(`| ${pull} | ${NAME[c]} | ${air ? `도달 뒤 ${rng(R.map((r) => r.hsI))} (원래 ${rng(R.map((r) => r.hs))})` : `놓은 뒤 ${rng(R.map((r) => r.hs))}`} | ${air ? '도달 ' : ''}${rng(R.map((r) => c0(r, 'shockwave')))}${R.some((r) => c0(r, 'sfx.airHit') != null) ? ' · 퍽' : air ? ' · 퍽 없음' : ''} | ${vibs} | ${rng(R.map((r) => (r.ringN ? r.ringLast : null)))} | ${rng(R.map((r) => r.px3))} |`);
    }
  }
  return { nErr, phOk, scr, n: rows.length };
}
// check 의 판정: 두 원자료로 찍은 report 출력(원자료 머리 줄·'주의'·'(참고)' 줄 빼고)이 글자까지 같은가 — 문서가 인용하는 것 전부
export function reportDiff(refRows, nowRows) {
  const lines = (rows) => { const L = []; report(rows, (x) => L.push(x)); return L.join('\n').split('\n').filter((l) => !/^원자료 |^  주의:|^  \(참고\)/.test(l)); };
  const a = lines(refRows), b = lines(nowRows), diffs = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(`줄 ${i + 1}: ${JSON.stringify(a[i] ?? null).slice(0, 160)} → ${JSON.stringify(b[i] ?? null).slice(0, 160)}`);
  return { same: diffs.length === 0, n: a.length, diffs };
}

// ── 실행 ───────────────────────────────────────────────────────────────────────
const dataFile = (dir, s) => join(dir, `${s}.jsonl.gz`);
const USAGE = '쓰기: node tools/feelclock.mjs <run|check|report> [main|bw|main,bw]  (run·check 는 PW=$(npm root -g)/playwright 필요, run 은 tools/coresweep/data/feel/ 을 다시 씀)';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2];
  if (!['run', 'check', 'report'].includes(mode)) { // 없거나 모르는 첫 인자(묶음 이름·오타 포함)는 run 으로 떨어지지 않는다
    console.error(`feelclock: 첫 인자 ${mode == null ? '없음' : `'${mode}'`}${SETS[mode] ? ' — 묶음은 두 번째 인자다(예: run bw)' : ''}\n${USAGE}`);
    process.exit(2);
  }
  const sets = (process.argv[3] || 'main,bw').split(',').filter(Boolean);
  for (const s of sets) if (!SETS[s]) { console.error(`feelclock: 모르는 묶음 '${s}' (main · bw)\n${USAGE}`); process.exit(2); }
  if (process.argv.length > 4) { console.error(`feelclock: 인자가 너무 많다\n${USAGE}`); process.exit(2); }
  if (mode === 'report') {
    const all = sets.flatMap((s) => readRows(dataFile(DATA, s)));
    report(all);
  } else {
    if (!process.env.PW) throw new Error('feelclock: PW=$(npm root -g)/playwright 가 필요하다');
    const { chromium } = createRequire(import.meta.url)(process.env.PW);
    const t0 = Date.now();
    const info = srcInfo();
    const D = await buildInst(info);
    const clean = () => { if (!process.env.KEEP) rmSync(D, { recursive: true, force: true }); };
    process.on('exit', clean); for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
    console.log(`계측 사본 ${process.env.KEEP ? D : '(임시 폴더)'} · mockup ${info.mockup} · main.js ${info.main} · sim src ${info.simSrc}`);
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const outDir = mode === 'check' ? join(D, 'out') : process.env.OUT || DATA;
    const all = [];
    try {
      for (const s of sets) {
        const rows = [{ meta: 1, set: s, src: info, browser: `chromium ${browser.version()}`, vw: VW, vh: VH, dsf: DSF, frames: FRAMES, seed: SEED, tr: TR_COLS, cfg: SETS[s] }, ...(await runSet(browser, join(D, 'puff-inst.html'), s))];
        writeRows(dataFile(outDir, s), rows);
        all.push(...rows);
      }
    } finally { await browser.close(); }
    console.log('');
    const rep = report(all);
    let bad = rep.nErr > 0 || rep.phOk !== rep.n;
    if (mode === 'check') {
      const ref = sets.flatMap((s) => readRows(dataFile(DATA, s)));
      const rd = reportDiff(ref, all);
      console.log(`\n회귀 대조 1 — 판정(exit): 커밋된 원자료의 report 출력 ≡ 다시 잰 것의 report 출력(표·세부·프레임 맞춤·판별 줄 전부, 원자료 머리 줄·(참고) 줄 빼고 글자 대조): ${rd.same ? '같음' : '다름'} (${rd.n}줄)`);
      for (const x of rd.diffs.slice(0, 12)) console.log('    ' + x);
      if (!rd.same) bad = true;
      console.log('회귀 대조 2 — 참고(판정 아님): 샷마다 모든 필드(첫 움직임 뒤 물리·1초 무렵 뒤집힘 소리 시각까지):');
      for (const s of sets) {
        const refAll = ref.filter((r) => r.set === s), refMeta = refAll.find((r) => r.meta), nowMeta = all.find((r) => r.meta && r.set === s);
        const md = refMeta && nowMeta ? metaDiff(refMeta, nowMeta) : ['meta 줄 없음'];
        console.log(`  ${s} meta(잰 조건): ${md.length ? '다름 — ' + md.join(' · ') + (md.some((x) => x.startsWith('브라우저') || x.startsWith('화면')) ? ' (브라우저·화면이 다르면 화면 좌표 → 3 px 프레임이 달라질 수 있다)' : '') + ' (조건이 달라도 아래 샷이 모두 같으면 통과)' : '같음'}`);
        const refS = shots(refAll), now = shots(all.filter((r) => r.set === s));
        const byKey = new Map(refS.map((r) => [keyOf(r), r]));
        let same = 0; const diffs = [];
        for (const r of now) {
          const q = byKey.get(keyOf(r));
          if (q && JSON.stringify(q) === JSON.stringify(r)) { same++; continue; }
          diffs.push(q ? `${keyOf(r)}: ` + Object.keys(r).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(q[k])).map((k) => `${k} ${JSON.stringify(q[k]).slice(0, 40)} → ${JSON.stringify(r[k]).slice(0, 40)}`).join(' · ') : `${keyOf(r)}: 커밋본에 없음`);
        }
        console.log(`  ${s}: 같음 ${same}/${refS.length}${now.length !== refS.length ? ` (지금 ${now.length}샷)` : ''}`);
        for (const x of diffs.slice(0, 12)) console.log('    ' + x);
        if (now.length !== refS.length) bad = true; // 샷 수가 다르면 판정도 틀림
      }
    } else console.log(`\n원자료: ${sets.map((s) => dataFile(outDir, s).replace(ROOT + '/', '')).join(' · ')}`);
    console.log(`feelclock ${mode} ${bad ? '틀림' : '끝'} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
    if (bad) process.exitCode = 1;
  }
}

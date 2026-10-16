// tools/sweepplay.mjs — 고개 쓸기 연습판 브라우저 게이트 (docs/design/core-sweep.md §9 4번 줄). dist/puff.html 을 Playwright 가짜 시계(rAF 16 ms)로 돈다.
//
// 🧭 가설(확인 대상): 게임 연습판의 쓸기 숨은 측정 물리 그대로다(주입 훅 샷 = Node 기준 비트 동일), 엄지 조작은 스펙 §4 대로 열리고 닫히며,
//   레벨·일일·대결·보상·실험 토글에는 새지 않는다. → 판가름 = 아래 (1)~(8) 모두 맞음.
//  (1) #p30 시드 601 주입 t0 0.05/0.25/0.45 · #p40 시드 401 주입 t0 0.10/0.35: 뒤집힘·원 밖·D·스텝·정지 해시 = node tools/sweepgame.mjs ref (같은 프로세스에서 계산)
//  (2) 합성 엄지(당김 200 px/300 ms → 멈춤 → 300 px/s 로 150 px → 떼기): '푸' 1번 열림 · 숨 동안 프레임당 ≤ 1스텝(대부분 1) · 뒤 ≤ 2스텝(대부분 2)
//      · 고개 α 단조·≤ 24° · D 잠금 · 숨 끝 = D + 0.04
//  (3) 20 px/s 로 60 px 밀고 떼기 → 취소(숨 안 씀, 손가락 시범 뜸)  (4) 밀기 없이 떼기 → 퍽(α 0 · 숨 0.131 s)
//  (5) 연습판 뒤 프로필(별·레벨·도감·튜토리얼 수·단서 수 …) 바이트 동일  (6) ?core=sweep 이어도 레벨 1·일일은 고전 경로(playerShot·blow)
//  (7) 실험 jetLag·airFx·hsCut 켬 + 연습판 → table.air 없음 · 지연 0  (8) 콘솔 오류 0
// 쓰기: npm run build && PW=$(npm root -g)/playwright node tools/sweepplay.mjs   (약 3~5분, 소프트웨어 렌더)
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refRows } from './sweepgame.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'dist/puff.html');
if (!existsSync(FILE)) throw new Error('dist/puff.html 없음 — npm run build');
const PROFILE = 'g2-ddakji-profile-v1';
const VW = 390, VH = 844;
let FAIL = 0;
const ok = (name, cond, info = '') => { if (!cond) FAIL++; console.log(`  ${cond ? '맞음' : '틀림'}  ${name}${info ? ' — ' + info : ''}`); return cond; };
const t0 = Date.now();
const REF = await refRows();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const allErrs = [];

async function open(query = '', hash = '', init) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, locale: 'ko-KR', hasTouch: false });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push({ t: performance.now(), p }); return true; }; });
  if (init) await page.addInitScript(init);
  await page.clock.install({ time: new Date('2026-10-16T10:00:00') });
  await page.clock.pauseAt(new Date('2026-10-16T10:00:01'));
  const run = (ms) => page.clock.runFor(ms);
  const until = async (fn, arg, max = 90000, step = 208) => { for (let t = 0; t < max; t += step) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await run(step); } return false; };
  await page.goto('file://' + FILE + '?norender' + (query ? '&' + query : '') + hash);
  if (!(await until(() => window.__puffBooted))) errs.push('부팅 안 됨');
  return { ctx, page, errs, run, until };
}
const st = (page) => page.evaluate(() => window.__puffSweep?.state?.() ?? null);
async function waitTurn(P, max = 60000) { return P.until(() => window.__puffSweep?.state?.()?.waiting === true, null, max, 16); }
async function waitCard(P, max = 60000) { return P.until(() => window.__puffSweep?.state?.()?.card === true, null, max, 32); }

// ── (1) 주입 훅 = Node 기준 ──
console.log('(1) 주입 훅 샷 = Node 기준(sweepgame ref)');
{
  for (const N of [30, 40]) {
    const P = await open('core=sweep', `#p${N}`);
    const cells = REF.filter((r) => r.N === N);
    let first = true;
    for (const r of cells) {
      if (!first) { await P.page.$eval('#swSame', (e) => e.click()); }
      first = false;
      const okTurn = await waitTurn(P);
      const s0 = await st(P.page);
      await P.page.evaluate((pl) => { window.__sweepPlan = pl; }, { q: r.q, A: 'top', w: r.plan.w, t0: r.plan.t0, D: 'top' });
      const fired = await P.page.evaluate(() => window.__sweepFire());
      const done = await waitCard(P);
      const L = await P.page.evaluate(() => window.__puffSweep.last);
      const same = L && L.flips === r.flips && L.outs === r.outs && L.hash === r.hash && L.D === r.D && L.steps === r.steps;
      ok(`${N}장 시드 ${r.seed} t0 ${r.plan.t0}: 뒤집힘·원 밖·D·스텝·해시 = Node`, okTurn && fired && done && s0?.seed === r.seed && same,
        `게임 ${L ? `${L.flips}/${L.outs} D ${L.D} 스텝 ${L.steps} ${L.hash}` : '없음'} · Node ${r.flips}/${r.outs} D ${r.D} 스텝 ${r.steps} ${r.hash} · 시드 ${s0?.seed}`);
    }
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
}

// ── (2)~(5), (7): 엄지 · 취소 · 퍽 · 프로필 · 실험 토글 무시 ──
console.log('(2)~(5)·(7) 합성 엄지 · 느린 밀기 취소 · 퍽 · 보상 없음 · 실험 지연 무시');
{
  const P = await open('core=sweep&jetlag=0.02&airfx=1&hscut=1');
  const { page, run } = P;
  const prof0 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  await page.evaluate(() => { document.querySelector('#sweepBtn').click(); });
  await run(160);
  const sheet = await page.evaluate(() => !document.querySelector('#sweepSheet').hidden && !document.querySelector('#sweepBtn').hidden);
  await page.evaluate(() => document.querySelector('#swP30').click());
  ok("홈 '쓸기 연습' 단추 → 30/40 시트 → 30장 연습판", sheet && (await waitTurn(P)), JSON.stringify(await st(page)));
  // (2) 합성 엄지
  const X = 195, Y = 520;
  const drag = async (pts, dtMs = 16) => { for (const [x, y] of pts) { await page.mouse.move(x, y); await run(dtMs); } };
  await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
  await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (200 * (i + 1)) / 19])); // 당김 200 px / 300 ms
  await run(208); // 멈춤
  const yLow = Y + 200;
  await drag(Array.from({ length: 31 }, (_, i) => [X, yLow - (150 * (i + 1)) / 31])); // 300 px/s 로 150 px (500 ms)
  await page.mouse.up();
  await waitCard(P);
  const L = await page.evaluate(() => window.__puffSweep.last);
  const fr = L?.fr || [];
  const during = fr.filter((f) => f[1] === 1).map((f) => f[0]), after = fr.filter((f) => f[1] === 0).map((f) => f[0]);
  const share = (a, v) => (a.length ? a.filter((x) => x === v).length / a.length : 0);
  ok("합성 엄지: '푸' 1번 열림 · 고개 α 단조 · ≤ 24° · 0 보다 큼", L?.kind === 'pueok' && L.opens === 1 && L.alphaMono && L.alphaMax <= 24 && L.alphaMax > 1, `kind ${L?.kind} · 열림 ${L?.opens} · 최대 α ${L?.alphaMax}° · 단조 ${L?.alphaMono}`);
  ok('숨 동안 프레임당 ≤ 1스텝(90% 이상 1) · 뒤 ≤ 2스텝(80% 이상 2)', during.length > 10 && Math.max(...during) <= 1 && share(during, 1) >= 0.9 && Math.max(...after) <= 2 && share(after, 2) >= 0.8,
    `숨 동안 ${during.length}프레임 1스텝 ${(100 * share(during, 1)).toFixed(0)}% · 뒤 ${after.length}프레임 2스텝 ${(100 * share(after, 2)).toFixed(0)}%`);
  ok('D 잠금(떼기 뒤 첫 스텝, 0.131~1.0) · 숨 끝 = D + 0.04', L?.D >= 0.131 && L.D <= 1.0 && L.dur === L.D + 0.04 && L.endT < L.dur && L.endT >= L.dur - 1 / 120 - 1e-9, `D ${L?.D} · dur ${L?.dur} · 마지막 숨 스텝 t ${L?.endT}`);
  ok('쓸기 숨: 실험 지연 저장값(jetlag 0.02·airfx·hscut) 무시 → table.air 없음 · 지연 0', (await st(page)).air === false && (await st(page)).lag === 0 && (await page.evaluate(() => window.__puffExp().feel.jetLag)) === 0.02);
  const vib = await page.evaluate(() => window.__vib.map((v) => v.p));
  ok("쓸기 진동: '푸 시작' 15 가 감", vib.includes(15), JSON.stringify(vib.slice(0, 12)));
  // (3) 느린 밀기 → 취소
  await page.$eval('#swSame', (e) => e.click());
  await waitTurn(P);
  const shots0 = await page.evaluate(() => window.__puffSweep.shots);
  await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
  await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (160 * (i + 1)) / 19]));
  await run(208);
  await drag(Array.from({ length: 188 }, (_, i) => [X, Y + 160 - (60 * (i + 1)) / 188])); // 20 px/s 로 60 px (3 s)
  await page.mouse.up();
  await run(64);
  const sc = await st(page);
  const shots1 = await page.evaluate(() => window.__puffSweep.shots);
  ok('느린 밀기(20 px/s · 60 px) → 취소: 숨 안 씀 · 다시 기다림 · 손가락 시범 뜸', shots1 === shots0 && sc.waiting && sc.guide && !sc.clock, `숨 ${shots0}→${shots1} · ${JSON.stringify(sc)}`);
  // (4) 밀기 없이 떼기 → 퍽
  await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
  await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (150 * (i + 1)) / 19]));
  await run(208);
  await page.mouse.up();
  await waitCard(P);
  const K = await page.evaluate(() => window.__puffSweep.last);
  ok('밀기 없이 떼기 → 퍽: α 0 · 숨 0.131 s', K?.kind === 'puck' && K.alphaMax === 0 && K.dur === 0.131 && K.D === 0.131, `kind ${K?.kind} · α ${K?.alphaMax} · dur ${K?.dur}`);
  // (5) 보상 없음 — 홈으로 나간 뒤 프로필 문자열 그대로
  await page.$eval('#swHome', (e) => e.click());
  await run(320);
  const prof1 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  ok('연습판 뒤 프로필(별·레벨·도감·튜토리얼·단서 수 …) 바이트 동일', prof0 === prof1 && (await page.evaluate(() => !document.querySelector('#home').hidden)), `${prof0?.length}B → ${prof1?.length}B`);
  allErrs.push(...P.errs);
  await P.ctx.close();
}

// ── (6) ?core=sweep 이어도 레벨 1·일일은 고전 ──
console.log('(6) 레벨·일일은 고전 조작·고전 물리');
{
  const P = await open('core=sweep', '#lv1');
  const { page, run, until } = P;
  await until(() => !document.querySelector('#lvIntro').hidden, null, 30000, 16);
  await page.$eval('#liPlay', (e) => e.click());
  const turn = await until(() => window.__puff?.().state === 'match' && !document.querySelector('#hint').hidden, null, 40000, 16);
  const s0 = await st(page);
  const pt = await page.evaluate(() => window.__puff());
  const x = pt.frontTop.x, y = pt.frontTop.y + (pt.frontBottom.y - pt.frontTop.y) * 0.25;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + 0.42 * VW * 0.5 * i / 8); await run(32); }
  await run(160);
  await page.mouse.up();
  await run(900);
  const ls = await page.evaluate(() => ({ last: window.__lastShot ?? null, shots: window.__puffSweep.shots, on: window.__puffSweep.state().on }));
  ok('레벨 1: 쓸기 문지기 꺼짐 · 고전 숨(blow → __lastShot) · 쓸기 숨 0', turn && s0.on === false && !!ls.last && ls.shots === 0 && ls.on === false, `${JSON.stringify(ls)}`);
  await page.$eval('#quitBtn', (e) => e.click());
  await run(400);
  await page.goto('file://' + FILE + '?norender&core=sweep&r=2');
  await until(() => window.__puffBooted);
  await run(608);
  await page.$eval('#dailyBtn', (e) => e.click());
  const dturn = await until(() => window.__puff?.().state === 'match' && !document.querySelector('#hint').hidden, null, 40000, 16);
  const ds = await st(page);
  ok('일일: 쓸기 문지기 꺼짐(고전 playerShot 대기)', dturn && ds.on === false && ds.input === false, JSON.stringify(ds));
  allErrs.push(...P.errs);
  await P.ctx.close();
}

ok('콘솔 오류 0', !allErrs.length, allErrs.slice(0, 6).join(' | '));
await browser.close();
console.log(`\nsweepplay: ${FAIL ? `틀림 ${FAIL}` : '맞음'} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
process.exit(FAIL ? 1 : 0);

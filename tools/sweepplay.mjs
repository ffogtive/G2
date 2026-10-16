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
//  (9) 검토 고침(2026-10-16): 시트 40장이 먼저 · '푸 시작' 톡 35(iOS 강) · 다른 손가락 pointercancel 은 숨을 안 끝냄 · 고전 조준 고리 불투명도 그대로 0.95
//      · 시범 그대로의 툭(28 px/105 ms)은 밀기 시작 200 ms 안에 열림 · 느린 툭(28 px/300 ms)도 쓸기 전에 열림 · 작은 툭(10 px)은 안 열림 넛지 → 떼면 퍽(칩 '퍽')
//      · 옆모습 창: 연습판 동안 보이고 홈에서 숨김 · 코치(첫 3숨) 켜짐
//  (2)~(5)·(9) 의 엄지 시험은 문법 A('누른 채 쓸기(옛)', ?swg=a)로 돈다. 기본은 문법 B(아래 (10)).
//  (10) 문법 B '놓고 쓸기'(기본, 2026-10-16 재윤님 실기기 기록): 기본 문법 = B · 힌트(바탕 띠, '다시 눌러')·시트 한 줄 · 주입 { kind: 'gb', q, ts } = Node(sweepgame ref, (1) 안)
//      · 놓기만: 놓을 때 퍼— 시작, D(q) + 0.04 까지 저절로 · 해시 = Node 안 휙 · 코치 '놓으면 퍼—' → '퍼— 기다려…' → 위 절반 10° 스텝부터 '들렸다 — 다시 눌러 휙!' · 칩 '안 쓸었어요 — 놓은 뒤 다시 눌러 휙!'
//      · 자연스러운 한 획(당김 → 빠른 휙 → 뗌)은 숨을 안 죽이고 휙으로 안 센다 → 숨 동안 '그 휙은 안 세요 — 기다려…' · 칩 🔁 '그 휙은 안 세요 — 놓고 다시 눌러 휙!'
//      · 꽉 당긴 한 획(q 1) + 휙 동안 옆 125 px = 취소 아님 · 카드 글 '다시 눌러'(검토 blocker: 재윤님 버릇 q 1 한 획 = 40장 0장)
//      · 당김 → 놓기 → 벽시계 0/0.3/0.6/1.0 s 뒤 다시 눌러 휙: t0 ≈ 휙 ÷ 2(화면) · α 단조 ≤ 24° · 해시 = Node planShot(그 t0) · 0 s = 이름(💨 덧칩 없음) · 0.6 s = 좋아요
//      · 두 번째 휙 무시 · 숨 끝 뒤 0.5 s 안 휙 = 물리 그대로 + 칩 '늦었어요' · 그 뒤(판정 기다림) 누름 = '잠깐…'만, 칩 '안 쓸었어요'
//      · 탭 = '위로 휙!' 신호 · 머무는 손가락 + 다른 손가락 휙 = 받음 · 진동 35·20, 꼭대기 25 없음 · 프로필 바이트 동일 · ⚙ 문법 단추(놓고 쓸기 ↔ 누른 채 쓸기)
// 쓰기: npm run build && PW=$(npm root -g)/playwright node tools/sweepplay.mjs   (약 4~6분, 소프트웨어 렌더)
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refRows, refRowsGB } from './sweepgame.mjs';
import * as V1 from '../mockup/src/sim.js';
import * as G from '../mockup/src/sweep.js';

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
const REF_GB = await refRowsGB();
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
    // 문법 B 주입 { kind: 'gb', q, ts } = Node flickShot (같은 판, 이어서 '같은 더미 다시')
    for (const r of REF_GB.filter((x) => x.N === N)) {
      await P.page.$eval('#swSame', (e) => e.click());
      const okTurn = await waitTurn(P);
      const s0 = await st(P.page);
      await P.page.evaluate((pl) => { window.__sweepPlan = pl; }, { kind: 'gb', q: r.q, ts: r.ts });
      const fired = await P.page.evaluate(() => window.__sweepFire());
      const done = await waitCard(P);
      const L = await P.page.evaluate(() => window.__puffSweep.last);
      const same = L && L.flips === r.flips && L.outs === r.outs && L.hash === r.hash && L.D === r.D && L.steps === r.steps && L.t0 === r.t0 && L.ttF === r.ttF && L.cueT === r.cueT && L.chip === r.chip;
      ok(`B 주입 ${N}장 시드 ${r.seed} q${r.q} ts ${r.ts ?? '안 휙'}: 뒤집힘·원 밖·D·스텝·t0·ttF·단서·칩·해시 = Node`, okTurn && fired && done && s0?.seed === r.seed && same,
        `게임 ${L ? `${L.flips}/${L.outs} D ${L.D} 스텝 ${L.steps} t0 ${L.t0} ttF ${L.ttF} 단서 ${L.cueT} ${L.chip} ${L.hash}` : '없음'} · Node ${r.flips}/${r.outs} D ${r.D} 스텝 ${r.steps} t0 ${r.t0} ttF ${r.ttF} 단서 ${r.cueT} ${r.chip} ${r.hash}`);
    }
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
}

// ── (2)~(5), (7): 엄지 · 취소 · 퍽 · 프로필 · 실험 토글 무시 ──
console.log('(2)~(5)·(7) 합성 엄지(문법 A, ?swg=a) · 느린 밀기 취소 · 퍽 · 보상 없음 · 실험 지연 무시');
{
  const P = await open('core=sweep&swg=a&jetlag=0.02&airfx=1&hscut=1');
  const { page, run } = P;
  const prof0 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  await page.evaluate(() => { document.querySelector('#sweepBtn').click(); });
  await run(160);
  const sheet = await page.evaluate(() => !document.querySelector('#sweepSheet').hidden && !document.querySelector('#sweepBtn').hidden && document.querySelector('#sweepSheet .row button')?.id === 'swP40');
  await page.evaluate(() => document.querySelector('#swP30').click());
  ok("홈 '쓸기 연습' 단추 → 시트(40장이 먼저) → 30장 연습판", sheet && (await waitTurn(P)), JSON.stringify(await st(page)));
  const sv0 = await st(page);
  ok('연습판: 옆모습 창 보임 · 코치 켜짐(첫 3숨) · 고전 조준 고리 0.95 · ?swg=a = 문법 A', sv0.side && sv0.coach && sv0.reticle?.op === 0.95 && sv0.grammar === 'A', JSON.stringify({ side: sv0.side, coach: sv0.coach, reticle: sv0.reticle, grammar: sv0.grammar }));
  // (2) 합성 엄지
  const X = 195, Y = 520;
  const drag = async (pts, dtMs = 16) => { for (const [x, y] of pts) { await page.mouse.move(x, y); await run(dtMs); } };
  await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
  await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (200 * (i + 1)) / 19])); // 당김 200 px / 300 ms
  await run(208); // 멈춤
  const yLow = Y + 200;
  await drag(Array.from({ length: 15 }, (_, i) => [X, yLow - (72 * (i + 1)) / 31])); // 300 px/s 로 150 px (500 ms) — 앞 절반
  // 다른 손가락(포인터 77)의 pointercancel 은 이 숨을 끝내지 않는다(검토 1: 예전엔 '푸'가 0.133 s 로 끝남)
  const cancel77 = await page.evaluate(() => { window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 77, bubbles: true })); return window.__puffSweep.state(); });
  await drag(Array.from({ length: 16 }, (_, i) => [X, yLow - 72 - (78 * (i + 1)) / 16])); // 뒤 절반
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
  ok("쓸기 진동: '푸 시작' 35(iOS 강 tapHeavy)가 감(예전 15 = 가장 약한 톡 아님)", vib.includes(35) && !vib.includes(15), JSON.stringify(vib.slice(0, 12)));
  ok('다른 손가락 pointercancel → 숨 계속(떼기는 진짜 손가락 떼기에서: 푸 시작→떼기 > 300 ms)', cancel77.clock === true && L.stats.blowMs > 300, `cancel 뒤 clock ${cancel77.clock} · 푸 시작→떼기 ${L.stats.blowMs} ms`);
  ok('연습판 뒤에도 고전 조준 고리 불투명도 0.95(연습판 자국은 자기 메시)', (await st(page)).reticle?.op === 0.95, JSON.stringify((await st(page)).reticle));
  // 시범 그대로의 툭: 당김 → 28 px 를 105 ms(7프레임) → 열림이 밀기 시작 200 ms 안
  const flickTest = async (px, ms) => {
    await page.$eval('#swSame', (e) => e.click());
    await waitTurn(P);
    await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
    await drag(Array.from({ length: 30 }, (_, i) => [X, Y + (170 * (i + 1)) / 30])); // 당김 170 px / 480 ms (빠른 당김 바로 뒤 툭 — 검토 3 이 실패를 본 경우)
    const n = Math.max(1, Math.round(ms / 16));
    const t0 = await page.evaluate(() => performance.now());
    let openAt = null;
    for (let i = 1; i <= n; i++) { await page.mouse.move(X, Y + 170 - (px * i) / n); await run(16); if (openAt == null && (await st(page)).clock) openAt = (await page.evaluate(() => performance.now())) - t0; }
    for (let k = 0; k < 40 && openAt == null; k++) { await run(16); if ((await st(page)).clock) openAt = (await page.evaluate(() => performance.now())) - t0; }
    await run(500);
    await drag(Array.from({ length: 12 }, (_, i) => [X, Y + 170 - px - (110 * (i + 1)) / 12]));
    await page.mouse.up();
    await waitCard(P);
    return { openAt, last: await page.evaluate(() => window.__puffSweep.last) };
  };
  const fA = await flickTest(28, 105);
  ok("시범 그대로의 툭(28 px/105 ms, 빠른 당김 직후) → '푸'가 밀기 시작 200 ms 안에 열림 · 푸어억", fA.openAt != null && fA.openAt <= 200 && fA.last.kind === 'pueok' && fA.last.opens === 1, `열림 ${fA.openAt == null ? '안 됨' : Math.round(fA.openAt) + ' ms'} · ${fA.last.kind}`);
  const fB = await flickTest(28, 300);
  ok("느린 툭(28 px/300 ms)도 쓸기 전에 열림(500 ms 안)", fB.openAt != null && fB.openAt <= 500 && fB.last.kind === 'pueok', `열림 ${fB.openAt == null ? '안 됨' : Math.round(fB.openAt) + ' ms'} · ${fB.last.kind}`);
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
  // (4) 작은 툭(10 px, 안 열림) → 넛지 → 떼면 퍽(칩 '퍽')
  await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
  await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (150 * (i + 1)) / 19]));
  await run(208);
  await drag(Array.from({ length: 5 }, (_, i) => [X, Y + 150 - (10 * (i + 1)) / 5]), 32);
  await run(480);
  const nd = await st(page);
  await page.mouse.up();
  await waitCard(P);
  const K = await page.evaluate(() => window.__puffSweep.last);
  ok("작은 툭(10 px) → '아직 안 열렸어요' 넛지(푸 안 열림)", nd.nudge === true && nd.clock === false, JSON.stringify({ nudge: nd.nudge, clock: nd.clock }));
  ok("그대로 떼기 → 퍽: α 0 · 숨 0.131 s · 칩 '퍽'", K?.kind === 'puck' && K.alphaMax === 0 && K.dur === 0.131 && K.D === 0.131 && K.chip === 'puck', `kind ${K?.kind} · α ${K?.alphaMax} · dur ${K?.dur} · 칩 ${K?.chip}`);
  // (5) 보상 없음 — 홈으로 나간 뒤 프로필 문자열 그대로
  await page.$eval('#swHome', (e) => e.click());
  await run(320);
  const prof1 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  ok('연습판 뒤 프로필(별·레벨·도감·튜토리얼·단서 수 …) 바이트 동일', prof0 === prof1 && (await page.evaluate(() => !document.querySelector('#home').hidden)), `${prof0?.length}B → ${prof1?.length}B`);
  const sh = await st(page);
  ok('홈: 옆모습 창·바람 자국 숨김 · 문지기 꺼짐', !sh.side && !sh.mark && !sh.on, JSON.stringify({ side: sh.side, mark: sh.mark, on: sh.on }));
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

// ── (10) 문법 B '놓고 쓸기'(기본) ──
console.log("(10) 문법 B '놓고 쓸기'(기본): 놓기만 · 한 획 · 꽉 한 획 + 옆 흐름 · 놓고 0/0.3/0.6/1.0 s 뒤 휙 · 두 번째 휙 · 숨 끝 뒤 휙(창 안·밖) · 머무는 손가락 · 탭 · 코치 · ⚙ 단추");
{
  const P = await open('core=sweep');
  const { page, run } = P;
  const prof0 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  await page.evaluate(() => { document.querySelector('#sweepBtn').click(); });
  await run(160);
  const note = await page.evaluate(() => document.querySelector('#swGNote').textContent);
  await page.evaluate(() => document.querySelector('#swP40').click());
  const ready = await waitTurn(P);
  const s0 = await st(page);
  const hint = await page.evaluate(() => ({ txt: document.querySelector('#hintText').textContent, cls: document.querySelector('#hint').className, bg: getComputedStyle(document.querySelector('#hint')).backgroundColor }));
  ok("기본 문법 = B · 힌트 '꾹 당겼다 놓으면 퍼— → 들리면 다시 눌러 위로 휙!'(바탕 띠) · 시트 한 줄 = 놓고 쓸기", ready && s0.grammar === 'B' && /놓으면 퍼/.test(hint.txt) && /다시 눌러/.test(hint.txt) && /놓으면 퍼/.test(note) && /sw/.test(hint.cls) && hint.bg !== 'rgba(0, 0, 0, 0)',
    `${s0.grammar} · 힌트 '${hint.txt}' ${hint.cls} ${hint.bg} · 시트 '${note}'`);
  const X = 195, Y = 520, PULL = 156; // 당김 156 px = 꽉의 0.85 쯤(q ≈ 0.85 → D 0.8)
  const drag = async (pts, dtMs = 16) => { for (const [x, y] of pts) { await page.mouse.move(x, y); await run(dtMs); } };
  const pull = async (px = PULL) => { await page.mouse.move(X, Y); await page.mouse.down(); await run(16); await drag(Array.from({ length: 19 }, (_, i) => [X, Y + (px * (i + 1)) / 19])); };
  // 휙: 다른 자리에서 다시 눌러 위로 px 를 n 프레임에
  const flick = async (px = 40, n = 3, x = 230, y = 430) => { await page.mouse.move(x, y); await page.mouse.down(); await run(16); await drag(Array.from({ length: n }, (_, i) => [x, y - (px * (i + 1)) / n])); await page.mouse.up(); };
  const nodeOf = (L) => (L.t0 == null ? G.flickShot(V1.Table, { N: 40, seed: L.seed, q: L.qRaw }) : G.planShot(V1.Table, { N: 40, seed: L.seed, q: L.qRaw, plan: { A: 24, w: 80, t0: L.t0, D: G.gbD(L.qRaw) } }));
  const shapeOk = (L) => L && L.kind === 'gb' && L.g === 'B' && L.D === G.gbD(L.qRaw) && L.dur === L.D + 0.04 && L.endT < L.dur && L.endT >= L.dur - 1 / 120 - 1e-9 && L.alphaMono && L.alphaMax <= 24 + 1e-9;
  const watch = async () => { // 숨 동안 코치 말 순서 · 단서 시각
    const keys = []; let cueAt = null, goBeforeCue = false;
    for (let k = 0; k < 160 && (await st(page)).clock; k++) {
      await run(16);
      const sx = await st(page);
      if (sx.coachKey && keys.at(-1) !== sx.coachKey) keys.push(sx.coachKey);
      if (sx.coachKey === 'swCoachGoB' && !(sx.cueT >= 0)) goBeforeCue = true;
      if (cueAt == null && sx.cueT >= 0) cueAt = sx.cueT;
    }
    return { keys, cueAt, goBeforeCue };
  };
  const card = () => page.evaluate(() => ({ L: window.__puffSweep.last, cause: document.querySelector('#swCause').textContent }));
  const same = async () => { await page.$eval('#swSame', (e) => e.click()); await waitTurn(P); };
  // (a0) 당겼다 놓기만: 퍼—가 D(q) + 0.04 까지 저절로 · 코치 '놓으면 퍼—' → '퍼— 기다려…'(휙 없음) → 위 절반 10° 스텝부터 '들렸다 — 다시 눌러 휙!' · 칩 '안 쓸었어요 — 놓은 뒤 다시 눌러 휙!'
  await pull();
  const coachPull = (await st(page)).coachKey;
  await page.mouse.up();
  const sUp = await st(page);
  const w0 = await watch();
  await waitCard(P);
  const { L: A0, cause: c0 } = await card();
  const N0 = nodeOf(A0);
  const fr = A0?.fr || [], during = fr.filter((f) => f[1] === 1).map((f) => f[0]);
  ok('놓기만: 놓을 때 퍼— 시작 · 숨이 D(q) + 0.04 까지 저절로 · 안 휙(t0 없음) = Node 해시·뒤집힘·스텝 · 숨 동안 프레임당 ≤ 1스텝',
    sUp.clock === true && sUp.mode === 'flick' && shapeOk(A0) && A0.t0 == null && A0.alphaMax === 0 && A0.hash === N0.hash && A0.flips === N0.flips && A0.steps === N0.steps && during.length > 10 && Math.max(...during) <= 1,
    `놓은 직후 clock ${sUp.clock} ${sUp.mode} · q ${A0?.q} D ${A0?.D} dur ${A0?.dur} · t0 ${A0?.t0} · 게임 ${A0.flips}장 ${A0.hash} · Node ${N0.flips}장 ${N0.hash} · 숨 동안 ${during.length}프레임`);
  ok("코치(첫 숨): 당기는 동안 '놓으면 퍼—' → '퍼— 기다려…'(단서 전 말에 '휙' 없음) → 위 절반 10° 스텝부터 '들렸다 — 다시 눌러 휙!' · 칩 '안 쓸었어요 — 놓은 뒤 다시 눌러 휙!'",
    coachPull === 'swCoachRel' && w0.keys[0] === 'swCoachWaitB' && w0.keys.includes('swCoachGoB') && !w0.goBeforeCue && w0.cueAt > 0.1 && w0.cueAt < 0.3 && A0.chip === 'none' && A0.stroke === false && /다시 눌러/.test(c0),
    `당김 ${coachPull} · 숨 ${w0.keys.join(' → ')} · 단서 ${w0.cueAt} s(화면) · 칩 ${A0.chip} '${c0}'`);
  // (a) 자연스러운 한 획(재윤님 버릇): 당김 → 곧바로 빠른 휙(80 px / 4프레임) → 뗌. 숨은 안 죽고, 그 휙은 쓸기로 안 센다 → 숨 동안 '그 휙은 안 세요 — 기다려…' → 단서 뒤 '다시 눌러 휙!' · 칩 🔁
  await same();
  await pull();
  await drag(Array.from({ length: 4 }, (_, i) => [X, Y + PULL - (80 * (i + 1)) / 4]));
  await page.mouse.up();
  const sA = await st(page);
  const w1 = await watch();
  await waitCard(P);
  const { L: A1, cause: c1 } = await card();
  const N1 = nodeOf(A1);
  ok("자연스러운 한 획(당김 → 빠른 휙 → 뗌): 숨이 안 죽음(D(q) + 0.04) · 휙으로 안 셈(t0 없음) · 해시 = Node 안 휙 · 숨 동안 '그 휙은 안 세요 — 기다려…' → '들렸다 — 다시 눌러 휙!' · 칩 🔁 '그 휙은 안 세요 — 놓고 다시 눌러 휙!'",
    sA.clock === true && sA.stroke === true && shapeOk(A1) && A1.t0 == null && A1.hash === N1.hash && A1.stats.maxPxS > 1000 && w1.keys[0] === 'swCoachStrokeB' && w1.keys.includes('swCoachGoB') && !w1.goBeforeCue && A1.chip === 'stroke' && /다시 눌러/.test(c1),
    `한 획 ${sA.stroke} · q ${A1?.q} D ${A1?.D} · t0 ${A1?.t0} · ${A1?.flips}장(Node ${N1.flips}) · 같은 획 밀기 ${A1?.stats.maxPxS} px/s · 숨 ${w1.keys.join(' → ')} · 칩 ${A1?.chip} '${c1}'`);
  // (b) 당김 → 놓기 → W ms 뒤 휙(속도 여럿). t0 ≈ 휙 ÷ 2 · 해시 = Node planShot(그 t0)
  const res = {};
  for (const [W, px, n] of [[0, 40, 3], [300, 40, 3], [600, 24, 10], [1000, 60, 2]]) {
    await same();
    await pull();
    await page.mouse.up();
    if (W) await run(W);
    await flick(px, n);
    let second = null;
    if (W === 300) { await run(200); await flick(50, 3, 160, 470); second = true; }
    await waitCard(P);
    const L = await page.evaluate(() => window.__puffSweep.last);
    const Nd = nodeOf(L);
    const tw = L.stats.flickMs / 2000;
    const good = shapeOk(L) && L.t0 != null && Math.abs(L.t0 - tw) <= 0.03 && L.hash === Nd.hash && L.flips === Nd.flips && L.steps === Nd.steps && L.alphaMax > 5 && (second ? L.flicks === 2 : L.flicks === 1);
    res[W] = L;
    ok(`놓고 ${W} ms 뒤 휙(${px} px / ${n}프레임${second ? ' + 0.2 s 뒤 두 번째 휙(무시)' : ''}): t0 ≈ 휙 ÷ 2 · α 단조 ≤ 24° · 해시 = Node planShot(t0)`, good,
      `놓고→휙 ${L.stats.flickMs} ms → t0 ${L.t0?.toFixed(4)} s(화면) · ttF ${L.ttF}° · 최대 α ${L.alphaMax}° · ${L.flips}장(Node ${Nd.flips}) · 칩 ${L.chip}${L.chip2 ? '+' + L.chip2 : ''} · 휙 ${L.flicks}번 · 휙 속도 ${L.stats.flickPxS} px/s`);
  }
  ok("휙 때가 실력: 놓자마자 휙 = '일렀어요'(이름, 💨 덧칩 없음) · 0.6 s = '좋아요' · 0.6 s 뒤집힘 > 0 s 뒤집힘",
    res[0].chip === 'early' && res[0].chip2 == null && res[600].chip === 'good' && res[600].flips > res[0].flips, `0 s ${res[0].flips}장 ${res[0].chip} · 0.3 s ${res[300].flips}장 ${res[300].chip} · 0.6 s ${res[600].flips}장 ${res[600].chip} · 1.0 s ${res[1000].flips}장 ${res[1000].chip}`);
  const vib = await page.evaluate(() => window.__vib.map((v) => v.p));
  ok("진동: 놓기 '퍼' 35(강) · 휙 받음 20(중) · B 는 꼭대기 넘음 25 를 안 냄(휙 20 과 겹침)", vib.includes(35) && vib.includes(20) && !vib.includes(25), JSON.stringify(vib.slice(0, 16)));
  // (a3) 꽉 당긴 한 획(q 1, 재윤님 기록 3/4숨) + 휙 동안 옆으로 125 px 흐름: 취소 안 됨 · 칩 🔁(카드 글에 '다시 눌러') · 해시 = Node 안 휙 q1
  await same();
  await pull(200);
  await drag(Array.from({ length: 8 }, (_, i) => [X + (125 * (i + 1)) / 8, Y + 200 - (220 * (i + 1)) / 8]));
  await page.mouse.up();
  const sF = await st(page);
  await waitCard(P);
  const { L: AF, cause: cF } = await card();
  const NF = nodeOf(AF);
  ok("꽉 당긴 한 획 + 휙 동안 옆 125 px(엄지 호): 숨 나감(취소 아님) · q 1 · 칩 🔁 · 카드 글 '다시 눌러' · 해시 = Node 안 휙",
    sF.clock === true && AF.q === 1 && AF.t0 == null && AF.chip === 'stroke' && /다시 눌러/.test(cF) && AF.hash === NF.hash,
    `clock ${sF.clock} · q ${AF.q} · ${AF.flips}장 원 밖 ${AF.outs}(Node ${NF.flips}/${NF.outs}) · 칩 ${AF.chip}${AF.chip2 ? '+' + AF.chip2 : ''} '${cF}'`);
  // (c) 숨 끝 뒤 휙: 끝난 뒤 0.5 s 창 안(놓고 1.85 s) = 물리 그대로(안 휙 해시) + 칩 '늦었어요' · 창 밖(놓고 2.6 s, 판정 기다림) = '잠깐…'만, 기록 없음 → 칩 '안 쓸었어요'
  await same();
  await pull();
  await page.mouse.up();
  await run(1850);
  const sLate = await st(page);
  await flick(40, 3);
  await waitCard(P);
  const LL = await page.evaluate(() => window.__puffSweep.last);
  const NL = nodeOf(LL);
  ok("숨 끝 뒤 0.5 s 안 휙(놓고 1.85 s): 물리 그대로(안 휙 해시) · 칩 '늦었어요' · 기록에 늦은 휙 시각", sLate.clock === false && LL.t0 == null && LL.hash === NL.hash && LL.chip === 'late' && LL.stats.lateMs >= 1800 && LL.stats.lateMs < 2300,
    `휙 때 clock ${sLate.clock} · t0 ${LL.t0} · ${LL.chip} · 늦은 휙 ${LL.stats.lateMs} ms · 해시 ${LL.hash === NL.hash}`);
  const log = await page.evaluate(() => window.__puffSweep.log[0]);
  ok("기록 복사 줄(B): g 'B' · ts · flickMs · ttF · cueMs · stroke · chip", log?.g === 'B' && 'ts' in log && 'flickMs' in log && 'ttF' in log && 'cueMs' in log && 'stroke' in log && log.chip === 'late', JSON.stringify(log));
  await same();
  await pull();
  await page.mouse.up();
  await run(2600);
  await page.mouse.move(230, 430); await page.mouse.down(); await run(16);
  const popW = (await st(page)).pop;
  await drag(Array.from({ length: 3 }, (_, i) => [230, 430 - (40 * (i + 1)) / 3])); await page.mouse.up();
  await waitCard(P);
  const LW = await page.evaluate(() => window.__puffSweep.last);
  ok("판정 기다림(숨 끝 + 0.5 s 뒤, 놓고 2.6 s) 누름: '잠깐…' · 휙으로 안 셈 · 칩 '안 쓸었어요'(늦었어요 아님) · 다음 숨 정상", popW === 'swJudgeWait' && LW.flicks === 0 && LW.chip === 'none' && LW.stats.lateMs == null,
    `신호 ${popW} · 휙 ${LW.flicks} · 칩 ${LW.chip} · 늦은 휙 ${LW.stats.lateMs}`);
  // (e) 탭(휙 아님) → '위로 휙!' · 머무는 손가락(포인터 7)이 있어도 다른 손가락(포인터 8) 휙을 받음
  await same();
  await pull();
  await page.mouse.up();
  await run(150);
  await page.mouse.move(230, 430); await page.mouse.down(); await run(32); await page.mouse.up(); await run(16);
  const popT = (await st(page)).pop;
  await run(150);
  const ptr = (type, id, x, y) => page.evaluate(([type, id, x, y]) => { const t = document.elementFromPoint(x, y); t.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: false, pointerType: 'touch' })); }, [type, id, x, y]);
  await ptr('pointerdown', 7, 120, 680); await run(16);
  await run(260);
  await ptr('pointerdown', 8, 250, 450); await run(16);
  const touches = (await st(page)).touches;
  for (let i = 1; i <= 3; i++) { await ptr('pointermove', 8, 250, 450 - 20 * i); await run(16); }
  await ptr('pointerup', 8, 250, 390);
  await waitCard(P);
  const LM = await page.evaluate(() => window.__puffSweep.last);
  const NM = nodeOf(LM);
  ok("탭(움직임 없음) → '위로 휙!' 신호 · 머무는 손가락 + 다른 손가락 휙 = 받음(t0 · 해시 = Node planShot(t0))", popT === 'swUpFlick' && touches === 2 && LM.t0 != null && LM.flicks === 1 && LM.hash === NM.hash,
    `탭 신호 ${popT} · 누른 손가락 ${touches} · t0 ${LM.t0} · 휙 ${LM.flicks} · ${LM.flips}장(Node ${NM.flips}) · 칩 ${LM.chip}`);
  // (d) 보상 없음 · ⚙ 문법 단추
  await page.$eval('#swHome', (e) => e.click());
  await run(320);
  const prof1 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  const sH = await st(page);
  ok('B 연습판 뒤 프로필 바이트 동일 · 홈에서 리스너 꺼짐', prof0 === prof1 && !sH.listening && !sH.input, `${prof0?.length}B → ${prof1?.length}B · listening ${sH.listening}`);
  await page.$eval('#tuneBtn', (e) => e.click());
  await run(64);
  const g0 = await page.evaluate(() => ({ gb: document.querySelector('#core-gb')?.getAttribute('aria-pressed'), ga: document.querySelector('#core-ga')?.getAttribute('aria-pressed'), swg: window.__puffExp().feel.swg }));
  await page.$eval('#core-ga', (e) => e.click());
  await run(32);
  const g1 = await page.evaluate(() => ({ gb: document.querySelector('#core-gb')?.getAttribute('aria-pressed'), ga: document.querySelector('#core-ga')?.getAttribute('aria-pressed'), swg: window.__puffExp().feel.swg, grammar: window.__puffSweep.state().grammar }));
  await page.$eval('#core-gb', (e) => e.click());
  await run(32);
  const g2 = await page.evaluate(() => ({ swg: window.__puffExp().feel.swg, grammar: window.__puffSweep.state().grammar }));
  ok("⚙ 문법 단추: 기본 '놓고 쓸기' 켜짐 → '누른 채 쓸기(옛)' = A → 다시 B", g0.gb === 'true' && g0.ga === 'false' && g0.swg === 0 && g1.ga === 'true' && g1.swg === 1 && g1.grammar === 'A' && g2.swg === 0 && g2.grammar === 'B', JSON.stringify({ g0, g1, g2 }));
  allErrs.push(...P.errs);
  await P.ctx.close();
}

ok('콘솔 오류 0', !allErrs.length, allErrs.slice(0, 6).join(' | '));
await browser.close();
console.log(`\nsweepplay: ${FAIL ? `틀림 ${FAIL}` : '맞음'} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
process.exit(FAIL ? 1 : 0);

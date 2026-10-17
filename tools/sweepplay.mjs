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
//  (2)~(5)·(9) 의 엄지 시험은 문법 A('누른 채 쓸기(옛)', ?swg=a)로 돈다. 기본은 문법 D(아래 (12)) — (10) 은 ?swg=b 로 B, (11) 은 ?swg=c 로 C 를 연다.
//  (10) 문법 B '놓고 쓸기'(?swg=b · 비교용, 2026-10-16 저녁 기본 · 재윤님 실기기 기록): 문법 = B · 힌트(바탕 띠, '다시 눌러')·시트 한 줄 · 주입 { kind: 'gb', q, ts } = Node(sweepgame ref, (1) 안)
//      · 놓기만: 놓을 때 퍼— 시작, D(q) + 0.04 까지 저절로 · 해시 = Node 안 휙 · 코치 '놓으면 퍼—' → '퍼— 기다려…' → 위 절반 10° 스텝부터 '들렸다 — 다시 눌러 휙!' · 칩 '안 쓸었어요 — 놓은 뒤 다시 눌러 휙!'
//      · 자연스러운 한 획(당김 → 빠른 휙 → 뗌)은 숨을 안 죽이고 휙으로 안 센다 → 숨 동안 '그 휙은 안 세요 — 기다려…' · 칩 🔁 '그 휙은 안 세요 — 놓고 다시 눌러 휙!'
//      · 꽉 당긴 한 획(q 1) + 휙 동안 옆 125 px = 취소 아님 · 카드 글 '다시 눌러'(검토 blocker: 재윤님 버릇 q 1 한 획 = 40장 0장)
//      · 당김 → 놓기 → 벽시계 0/0.3/0.6/1.0 s 뒤 다시 눌러 휙: t0 ≈ 휙 ÷ 2(화면) · α 단조 ≤ 24° · 해시 = Node planShot(그 t0) · 0 s = 이름(💨 덧칩 없음) · 0.6 s = 좋아요
//      · 두 번째 휙 무시 · 숨 끝 뒤 0.5 s 안 휙 = 물리 그대로 + 칩 '늦었어요' · 그 뒤(판정 기다림) 누름 = '잠깐…'만, 칩 '안 쓸었어요'
//      · 탭 = '위로 휙!' 신호 · 머무는 손가락 + 다른 손가락 휙 = 받음 · 진동 35·20, 꼭대기 25 없음 · 프로필 바이트 동일 · ⚙ 문법 단추(놓고 쓸기 ↔ 누른 채 쓸기)
//  (11) 문법 C '영점 조준'(?swg=c · 비교용, 2026-10-16 밤 기본 · 재윤님 설계 · 측정 tools/sweepgc.mjs): ?swg=c 문법 = C · ⚙ 문법 4(#core-gd 꺼짐 · #core-gc 켜짐) + 눈금 4 + 빠르기 3 단추 · 주입 { kind: 'gc', s, q, th } 4칸 = Node(sweepgame ref, (1) 안)
//      · 영점 눈금: 창 확대(400 ms 안) · 준비 400 ms 탭 무시('잠깐…') · sLive = meterAt 식(표본 3개) · 띠 가운데 시각 탭 → s 0.55 ± 0.01 · '딱!' · 350 ms 뒤 2단계 · 축소 400 ms 안
//      · 2단계 한 획(당김 156 px → 90 px 위 → 놓기): q = 당김 식 ± 1e-9 · θ = thOfRise ± 1e-9 · 해시 = Node zeroShot(같은 s·q·θ) · 코치 말 차례(당겨 숨 → 위로 밀어 → 놓으면 퍼—)
//      · 자동 쓸기: tUp = 단서 + 0.15(또는 0.55) · α 단조 · 진동 35 뒤 20 한 번 · 25 없음 · 카드 칩 = Node gcChip · 미니 기둥 · 기록 줄 g 'C'
//      · 옆 빼기·덜 당김 취소 뒤 영점 유지 · '📍 영점 다시' → 1단계 · 띠·코치: 첫 3숨 켜짐 · 넷째 숨 꺼짐 · 영점 칩(zHigh) 다음 숨 다시 켜짐
//      · ?swm=off 끌기(창 안 누름 = 그 높이 → 상대 끌기) s 0.6 ± 0.01 · ?swm=th·?swm=q 놓는 순간 값 = 식 · 해시 = Node · 실험 토글 켬에도 table.air 없음 · 프로필 바이트 동일
//      · 검토 고침(2026-10-16): 눈금은 꼭대기에서 출발 · 탭 값 = meterAt(탭 − 화면 지연 16 ms) · 코치 '준비…' → '점이 초록 띠에 올 때 톡!'(코치 숨은 힌트 띠 숨김)
//        · 1단계 2D 겹침이 어둡게 깐 층 위 · '영점 다시'는 창이 다 줄어든 뒤 · 시범 = 꽉까지(q ≥ 0.95, '읍') · 쓸기 각 화살표 16° = 꼭대기(8.5° 는 아래·주황)
//        · ⚙ 저장·다시 열기 · 창 밖 톡(끌기) = 확정 아님 · 화면 끝 당김 덧말 · 각도 눈금 밀기 무시·콜록 없음 · 눈금별 힌트·코치
//        · 문법별 첫 3숨(B 3숨 뒤 C 첫 숨 코치) · 중간에 홈 다섯 경우 정리
//  (12) 문법 D '세 박자'(기본, 2026-10-17 · sweep.js GD 절 · 시제품 최소 4칸): (a) 설정: 새 프로필 = D · ⚙ 문법 4단추 · ?swg=d|c · 빠르기 줄(C·D) · 눈금 줄 없음
//      (b) 주입 { kind: 'gd', s, q, th } 4칸(q 0.9 · 돌풍 1.2 · 30장 · 볼 θ 5 = 헛스윙) = Node gdShot(책상 판정): 뒤집힘·책상 밖·걸침·스텝·해시·칩 · 분필 원 숨김
//          · 첫 판 인트로·배너 동안(① 전)에도 분필 원 숨김
//      (c) 손 경로(가짜 시계): ① 띠 가운데 때 톡 → s = gdMeterAt(탭 − 16 ms) · 머묾 중 톡 = '잠깐…' · ② 30° 때 톡 → θ = 식 · ③ 5 px 당김 = 취소 · '📐 각도 다시'
//          · ② 머묾 중 톡 뒤 '📐 각도 다시' → 준비 중 톡 = '잠깐…' 다시(박자마다 한 번 — 다시 연 박자도) · ③ 80 px 당겼다 48 ms 에 0 px 로 되돌려 놓기 = 취소(숨 안 나감)
//          · 당기다 pointercancel = 말 없는 취소(sysCancels, 취소 수·'아래로 당겨요' 안 셈) · 오른쪽 단추 누름 = 무시 · contextmenu 막힘
//          · 80 px 당김 → 마지막 40 ms 에 3 px 올라가 놓기 → q = qOfPull(80) · 해시 = Node gdShot(같은 s·q·θ) · 큰 영점 창 한 번도 안 열림(MutationObserver 로 셈) · 기록 줄 g 'D'(coachBeats · sysCancels)
//      (d) 판·배치: D 판 분필 원 숨김 → 레벨 1 은 보임 · 390×844 ③ 에서 HUD·부채꼴·게이지·다시 단추 사각형 교차 0
//          · 같은 페이지: D 카드 → 홈(분필 원 다시 보임 · 책상 판정 끔) → ⚙ '영점 조준'(C) → 40장 더미 1(같은 더미) = 분필 원 보임 · C 주입 = Node zeroShot(원 판정)
//          · HUD 홈 왕복 4번(① 2번 · 숨 도중 1번 · 앱 '뒤로' 1번) → Rapier 월드(rawphysicspipeline) 새로 만듦 − 반납 = 0
//      (e) 비교 토글(⚙ '숨 난이도' 보통|어려움 × '아웃 범위' 책상|반지름 5 — D 만): 새 프로필 = 보통·책상 · ⚙ 두 줄은 D 에서만(C 면 없음) · 누르면 feel · 완료 = 저장 → 다시 열어도 그대로
//          · 주소 ?gdq=normal&gdout=desk 가 저장값을 이김 · 조합마다 페이지 하나(?gdq=…&gdout=…) 주입 1칸 = Node gdShot(mode)(sweepgame ref gdm):
//          뒤집힘·밖·걸침·원 밖·스텝·칩·해시 · 기록 줄 mode · 카드 조합 글 · 넓은 점선 원은 반지름 5 일 때만 보임(옛 분필 원은 늘 숨김)
//  (1)·(11) 은 ?swg=c 로 C 를 연다(기본이 D 로 바뀜). C·B·A 는 분필 원 판정 그대로(비교용 — 측정·칩 기준이 원)
// 쓰기: npm run build && PW=$(npm root -g)/playwright node tools/sweepplay.mjs   (약 5~7분, 소프트웨어 렌더)
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refRows, refRowsGB, refRowsGC, refRowsGD, refRowsGDModes } from './sweepgame.mjs';
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
const REF_GC = await refRowsGC();
const REF_GD = await refRowsGD();
const REF_GDM = await refRowsGDModes();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const allErrs = [];

async function open(query = '', hash = '', init) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, locale: 'ko-KR', hasTouch: false });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  // 진동 기록 · C 눈금 탭 시각 = 처리기 시각(사건 시각 ev.timeStamp 는 진짜 시계라 가짜 시계와 섞지 않는다)
  await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push({ t: performance.now(), p }); return true; }; window.__sweepEvTs = false; });
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
    const P = await open('core=sweep&swg=c', `#p${N}`);
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
    // 문법 C 주입 { kind: 'gc', s, q, th } = Node zeroShot (같은 판, 이어서 '같은 더미 다시') — (11) 의 주입 칸
    for (const r of REF_GC.filter((x) => x.N === N)) {
      await P.page.$eval('#swSame', (e) => e.click());
      const okTurn = await waitTurn(P);
      const s0 = await st(P.page);
      await P.page.evaluate((pl) => { window.__sweepPlan = pl; }, { kind: 'gc', s: r.s, q: r.q, th: r.th });
      const fired = await P.page.evaluate(() => window.__sweepFire());
      const done = await waitCard(P);
      const L = await P.page.evaluate(() => window.__puffSweep.last);
      const same = L && L.g === 'C' && L.flips === r.flips && L.outs === r.outs && L.hash === r.hash && L.D === r.D && L.steps === r.steps && L.a0 === r.a0 && L.tUp === r.tUp && L.cueT === r.cueT && L.ttUp === r.ttUp && L.chip === r.chip && L.chip2 === r.chip2;
      ok(`C 주입 ${N}장 시드 ${r.seed} (s ${r.s}, q ${r.q}, θ ${r.th}°): 뒤집힘·원 밖·D·스텝·α0·tUp·단서·ttUp·칩·해시 = Node`, okTurn && fired && done && s0?.seed === r.seed && s0?.grammar === 'C' && same,
        `게임 ${L ? `${L.flips}/${L.outs} D ${L.D} 스텝 ${L.steps} α0 ${L.a0} tUp ${L.tUp} 단서 ${L.cueT} ${L.chip}${L.chip2 ? '+' + L.chip2 : ''} ${L.hash}` : '없음'} · Node ${r.flips}/${r.outs} D ${r.D} 스텝 ${r.steps} α0 ${r.a0} tUp ${r.tUp} 단서 ${r.cueT} ${r.chip} ${r.hash}`);
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

// ── (10) 문법 B '놓고 쓸기'(?swg=b · 비교용) ──
console.log("(10) 문법 B '놓고 쓸기'(?swg=b): 놓기만 · 한 획 · 꽉 한 획 + 옆 흐름 · 놓고 0/0.3/0.6/1.0 s 뒤 휙 · 두 번째 휙 · 숨 끝 뒤 휙(창 안·밖) · 머무는 손가락 · 탭 · 코치 · ⚙ 단추");
{
  const P = await open('core=sweep&swg=b');
  const { page, run } = P;
  const prof0 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
  await page.evaluate(() => { document.querySelector('#sweepBtn').click(); });
  await run(160);
  const note = await page.evaluate(() => document.querySelector('#swGNote').textContent);
  await page.evaluate(() => document.querySelector('#swP40').click());
  const ready = await waitTurn(P);
  const s0 = await st(page);
  const hint = await page.evaluate(() => ({ txt: document.querySelector('#hintText').textContent, cls: document.querySelector('#hint').className, bg: getComputedStyle(document.querySelector('#hint')).backgroundColor }));
  ok("?swg=b = 문법 B · 힌트 '꾹 당겼다 놓으면 퍼— → 들리면 다시 눌러 위로 휙!'(바탕 띠) · 시트 한 줄 = 놓고 쓸기", ready && s0.grammar === 'B' && /놓으면 퍼/.test(hint.txt) && /다시 눌러/.test(hint.txt) && /놓으면 퍼/.test(note) && /sw/.test(hint.cls) && hint.bg !== 'rgba(0, 0, 0, 0)',
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
  const g0 = await page.evaluate(() => ({ gb: document.querySelector('#core-gb')?.getAttribute('aria-pressed'), ga: document.querySelector('#core-ga')?.getAttribute('aria-pressed'), gc: document.querySelector('#core-gc')?.getAttribute('aria-pressed'), swg: window.__puffExp().feel.swg }));
  await page.$eval('#core-ga', (e) => e.click());
  await run(32);
  const g1 = await page.evaluate(() => ({ gb: document.querySelector('#core-gb')?.getAttribute('aria-pressed'), ga: document.querySelector('#core-ga')?.getAttribute('aria-pressed'), swg: window.__puffExp().feel.swg, grammar: window.__puffSweep.state().grammar }));
  await page.$eval('#core-gb', (e) => e.click());
  await run(32);
  const g2 = await page.evaluate(() => ({ swg: window.__puffExp().feel.swg, grammar: window.__puffSweep.state().grammar }));
  ok("⚙ 문법 단추(?swg=b): '놓고 쓸기' 켜짐(swg 2) → '누른 채 쓸기(옛)' = A(swg 1) → 다시 B", g0.gb === 'true' && g0.ga === 'false' && g0.gc === 'false' && g0.swg === 2 && g1.ga === 'true' && g1.swg === 1 && g1.grammar === 'A' && g2.swg === 2 && g2.grammar === 'B', JSON.stringify({ g0, g1, g2 }));
  allErrs.push(...P.errs);
  await P.ctx.close();
}

// ── (11) 문법 C '영점 조준'(?swg=c · 비교용) ──
console.log("(11) 문법 C '영점 조준'(?swg=c): ⚙ 단추 · 영점 눈금(창 확대·준비·표본·띠 가운데 탭·축소) · 한 획 = Node · 자동 쓸기 · 취소·영점 다시 · 띠/코치 · 끌기 · 각도·세기 눈금 = Node · 실험 토글 무시");
{
  const T = 1200, PULL = 156, PUSH = 90, X = 195, Y = 520;
  const qOf = (px) => G.pouchPower(px / (VW * 0.42)) / G.POUCH_FULL;
  const nodeC = (L) => G.zeroShot(V1.Table, { N: L.n, seed: L.seed, s: L.s, q: L.qRaw, th: L.th });
  const mk = async (q, hash) => {
    const P = await open('core=sweep' + (/swg=/.test(q) ? '' : '&swg=c') + q, hash); // 기본이 D 로 바뀜 → C 는 ?swg=c
    const page = P.page, run = P.run;
    const drag = async (pts, dtMs = 16) => { for (const [x, y] of pts) { await page.mouse.move(x, y); await run(dtMs); } };
    const pull = async (px = PULL, x = X) => { await page.mouse.move(x, Y); await page.mouse.down(); await run(16); await drag(Array.from({ length: 19 }, (_, i) => [x, Y + (px * (i + 1)) / 19])); };
    const now = () => page.evaluate(() => performance.now());
    const runTo = async (t) => { const n = await now(); if (t > n) await run(Math.round(t - n)); };
    const card = () => page.evaluate(() => ({ L: window.__puffSweep.last, cause: document.querySelector('#swCause').textContent, zcol: document.querySelector('#swZCol').dataset.drawn, zcolShown: !document.querySelector('#swZCol').hidden }));
    const same = async () => { await page.$eval('#swSame', (e) => e.click()); await waitTurn(P); };
    // 1단계 끌기(창 안 누름 = 그 높이 → 상대 끌기): s0 높이에서 눌러 s1 높이로 끌어 놓기
    const dragZero = async (s0, s1) => {
      const x = await page.evaluate(() => window.__puffSweep.zeroX());
      const y0 = await page.evaluate((s) => window.__puffSweep.zeroY(s), s0), y1 = await page.evaluate((s) => window.__puffSweep.zeroY(s), s1);
      await page.mouse.move(x, y0); await page.mouse.down(); await run(16);
      await drag(Array.from({ length: 6 }, (_, i) => [x, y0 + ((y1 - y0) * (i + 1)) / 6]));
      await page.mouse.up(); await run(16);
    };
    const toAim = async () => { for (let k = 0; k < 60 && (await st(page)).stage !== 'aim'; k++) await run(16); await run(400); };
    return { ...P, drag, pull, now, runTo, card, same, dragZero, toAim };
  };

  // (a) ?swg=c = C · ⚙ 문법 4(세 박자 꺼짐 · 영점 조준 켜짐) · 눈금 4 · 빠르기 3 단추 · B 로 바꾸면 눈금 줄이 사라짐 · 시트 한 줄
  {
    const P = await mk('');
    const { page, run } = P;
    await page.evaluate(() => { document.querySelector('#sweepBtn').click(); });
    await run(160);
    const note = await page.evaluate(() => document.querySelector('#swGNote').textContent);
    await page.$eval('#swClose', (e) => e.click());
    await page.$eval('#tuneBtn', (e) => e.click());
    await run(64);
    const btns = () => page.evaluate(() => ({ g: ['gd', 'gc', 'gb', 'ga'].map((k) => document.querySelector('#core-' + k)?.getAttribute('aria-pressed')), m: [0, 1, 2, 3].map((i) => document.querySelector('#core-m' + i)?.getAttribute('aria-pressed') ?? null), t: [0, 1, 2].map((i) => document.querySelector('#core-t' + i)?.getAttribute('aria-pressed') ?? null), feel: window.__puffExp().feel, grammar: window.__puffSweep.state().grammar }));
    const b0 = await btns();
    await page.$eval('#core-m1', (e) => e.click()); await page.$eval('#core-t0', (e) => e.click()); await run(32);
    const b1 = await btns();
    await page.$eval('#core-gb', (e) => e.click()); await run(32);
    const b2 = await btns();
    await page.$eval('#core-gc', (e) => e.click()); await page.$eval('#core-m0', (e) => e.click()); await page.$eval('#core-t1', (e) => e.click()); await run(32);
    const b3 = await btns();
    ok("?swg=c 문법 = C · ⚙ 문법 4단추(#core-gd 꺼짐 · 영점 조준 켜짐) + 눈금 4(영점 켜짐) + 빠르기 3(보통 켜짐) · 각도·느림 누름 = 저장값 · B 면 눈금 줄 없음 · 시트 한 줄 = 영점 톡",
      b0.grammar === 'C' && b0.g.join() === 'false,true,false,false' && b0.m.join() === 'true,false,false,false' && b0.t.join() === 'false,true,false'
        && b1.m.join() === 'false,true,false,false' && b1.t.join() === 'true,false,false' && b2.grammar === 'B' && b2.m.every((x) => x === null) && b3.grammar === 'C' && b3.m[0] === 'true' && b3.t[1] === 'true' && /영점 톡/.test(note),
      JSON.stringify({ b0: [b0.g, b0.m, b0.t], b1: [b1.m, b1.t], b2: [b2.grammar, b2.m], b3: [b3.grammar, b3.m, b3.t], note }));
    const pick = await page.evaluate(() => document.querySelector('#swPickNote').textContent);
    // 저장: 눈금 '끔'·'느림' 누르고 완료 → 프로필 feel.swm 3 · swmT 1.6 → 다시 열어도 ⚙ 단추·연습판 눈금이 그대로
    await page.$eval('#core-m3', (e) => e.click()); await page.$eval('#core-t0', (e) => e.click()); await page.$eval('#tuneClose', (e) => e.click()); await run(32);
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.settings?.feel ?? null, PROFILE);
    await page.goto('file://' + FILE + '?norender&core=sweep&r=2');
    await P.until(() => window.__puffBooted);
    await run(400);
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    const b4 = await btns();
    await page.$eval('#tuneClose', (e) => e.click()); await run(32);
    await page.evaluate(() => { document.querySelector('#sweepBtn').click(); }); await run(160);
    await page.evaluate(() => document.querySelector('#swP40').click());
    await waitTurn(P);
    const s4 = await st(page);
    ok("⚙ 저장: 눈금 '끔'·'느림' + 완료 → 프로필 swg 3(C) · swm 3 · swmT 1.6 → 다시 열어도 단추 그대로 · 연습판 눈금 끔(끌기)·1.6 s · 시트 C 줄 '40장 먼저'",
      saved?.swg === 3 && saved?.swm === 3 && saved?.swmT === 1.6 && b4.m.join() === 'false,false,false,true' && b4.t.join() === 'true,false,false' && s4.grammar === 'C' && s4.meter === 'off' && s4.meterT === 1600 && /40장 먼저/.test(pick),
      JSON.stringify({ saved: saved && { swg: saved.swg, swm: saved.swm, swmT: saved.swmT }, m: b4.m, t: b4.t, meter: s4.meter, T: s4.meterT, pick }));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }

  // (b) #p40 영점 눈금(기본 · 1.2 s) — 첫 숨 손으로, 그 뒤 취소·영점 다시·주입으로 띠/코치 숨 세기
  {
    const P = await mk('&jetlag=0.02&airfx=1&hscut=1', '#p40');
    const { page, run, now, runTo, card, same, pull, drag } = P;
    const prof0 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
    const ready = await waitTurn(P);
    const s0 = await st(page);
    const tEnter = s0.meterT0 - 300;
    await runTo(tEnter + 380);
    const sz = await st(page);
    ok("숨 1: 1단계 = 영점 창 크게(확대 400 ms 안) · 눈금 영점 1.2 s · 띠·코치 켜짐(첫 숨) · 준비 동안 코치 '준비…' · 코치 숨이면 힌트 띠 숨김(같은 말 두 번 없음) · 2D 겹침이 어둡게 깐 층 위 · 옆모습 작은 창 숨김",
      ready && s0.grammar === 'C' && s0.stage === 'zero' && s0.meter === 's' && s0.meterT === T && sz.zoomP === 1 && sz.zeroBig && sz.band && sz.coach1 && !sz.side && sz.coachKey === 'swCoachC1p' && sz.hint === null && sz.breathOver,
      JSON.stringify({ stage: s0.stage, meter: s0.meter, T: s0.meterT, zoomP: sz.zoomP, big: sz.zeroBig, band: sz.band, coach: sz.coachKey, hint: sz.hint, over: sz.breathOver, side: sz.side }));
    // 준비 400 ms 안 탭 = 무시('잠깐…') · 눈금은 꼭대기(s 1)에서 기다림
    await runTo(s0.meterT0 + 200);
    await page.mouse.move(195, 640); await page.mouse.down(); await page.mouse.up();
    const sp = await st(page);
    ok("준비 400 ms 안 탭 → 무시(1단계 그대로 · '잠깐…') · 눈금은 꼭대기에서 출발(아래 끝 출발이면 띠가 '움직이면 바로 톡'이 됨 — 검토)", sp.stage === 'zero' && sp.pop === 'swJudgeWait' && sp.sLive === 1 && !sp.locked, JSON.stringify({ stage: sp.stage, pop: sp.pop, sLive: sp.sLive }));
    // 표본 3개 = meterAt 식(그리기 값 — 지연 보정 없음)
    const smp = [];
    for (const dt of [500, 1000, 1300]) { await runTo(s0.meterT0 + dt); const x = await st(page); const n = await now(); smp.push([dt, x.sLive, G.meterAt('s', n - s0.meterT0, T), x.coachKey]); }
    ok("눈금 sLive = meterAt 식(눈금 시작 + 0.5/1.0/1.3 s → 0.9/0.4/0.7, 꼭대기에서 내려옴) · 준비 뒤 코치 '점이 초록 띠에 올 때 톡!'", smp.every(([, a, b]) => Math.abs(a - b) < 1e-12) && Math.abs(smp[0][1] - 0.9) < 1e-9 && Math.abs(smp[1][1] - 0.4) < 1e-9 && Math.abs(smp[2][1] - 0.7) < 1e-9 && smp[0][3] === 'swCoachC1', JSON.stringify(smp));
    // 띠 가운데(s 0.55, 둘째 바퀴 내려오는 반쪽) 탭 — 잠기는 값 = meterAt(탭 − 화면 지연 보정 SWM_LAG)
    const lag = s0.swmLag;
    await runTo(s0.meterT0 + 400 + T + 450 + lag);
    const tTap = await now();
    await page.mouse.move(80, 700); await page.mouse.down(); await page.mouse.up();
    const sl = await st(page);
    await run(336);
    const sl2 = await st(page);
    await run(32);
    const sa = await st(page);
    let shrinkAt = null;
    for (let k = 0; k < 40; k++) { const x = await st(page); if (!x.zeroShown) { shrinkAt = (await now()) - tTap; break; } await run(16); }
    const sShr = await st(page);
    await run(32);
    const sAim = await st(page);
    ok("띠 가운데 시각 탭 → s = meterAt(탭 − 16 ms) = 0.55 ± 0.01 · '딱!' · 350 ms 머문 뒤 2단계 · 창 축소 400 ms 안 · '영점 다시'는 줄어든 뒤에만 · 옆모습 창 · 시점 α0 · 겹침 층 원래대로",
      lag === 16 && Math.abs(sl.s - 0.55) <= 0.01 && Math.abs(sl.s - G.meterAt('s', tTap - s0.meterT0 - lag, T)) < 1e-12 && sl.tap?.src === 'now' && sl.pop === 'swPopLock' && sl.stage === 'zero' && sl2.stage === 'zero' && sa.stage === 'aim' && !sa.again
        && shrinkAt != null && shrinkAt <= 350 + 400 && sAim.side && sAim.again && Number.isFinite(sAim.a0) && sAim.a0 < 0 && !sAim.breathOver,
      `s ${sl.s} · 지연 보정 ${lag} ms · 탭 ${JSON.stringify(sl.tap)} · 신호 ${sl.pop} · 탭 뒤 336 ms ${sl2.stage} → 368 ms ${sa.stage}(다시 ${sa.again}) · 창 숨김 ${shrinkAt} ms(그때 다시 ${sShr.again}) · 옆 ${sAim.side} · 다시 ${sAim.again} · α0 ${sAim.a0}`);
    // 손가락 시범(C): 꽉까지 당김(q 1, '읍') → 90 px 밀기(θ 31°) · 각도 눈금 = 당김만 · 세기 눈금 = 밀기만
    const demo = await page.evaluate(() => ['s', 'th', 'q'].map((m) => { let qMax = 0, thMax = 0, full = false, push = 0; const keys = []; for (let ms = 0; ms < 4000; ms += 20) { const g = window.__puffSweep.demoC(ms, m); qMax = Math.max(qMax, g.q); thMax = Math.max(thMax, g.th); full ||= g.full; push = Math.max(push, g.PUSH); if (g.key && keys.at(-1) !== g.key) keys.push(g.key); } return { m, qMax, thMax, full, push, keys }; }));
    ok("손가락 시범: 영점 = 꽉까지(q ≥ 0.95 · '읍') + 밀기(θ ≥ 16°) · 각도 눈금 = 꽉 당김만(밀기 0) · 세기 눈금 = 밀기만(당김 없음) — 코치 '꽉까지'와 같은 숫자(검토: 예전 시범 q 0.76)",
      demo[0].qMax >= 0.95 && demo[0].full && demo[0].thMax >= 16 && demo[1].qMax >= 0.95 && demo[1].push === 0 && demo[2].push === 90 && !demo[2].full,
      JSON.stringify(demo.map((d) => ({ m: d.m, q: +d.qMax.toFixed(3), th: +d.thMax.toFixed(1), full: d.full, push: d.push, keys: d.keys.join('→') }))));
    // 쓸기 각 화살표: 꼭대기에 닿음 = 16°(좋은 쪽 시작) · 8.5°(예전 화살표가 꼭대기에 딱 닿던 각 = 40장 19.5장)는 꼭대기 아래·주황 · 40° = 꼭대기 위 0.35 × 높이
    const arr = await page.evaluate(() => [8.5, 16, 40].map((th) => window.__puffSweep.arrowC(0.55, th)));
    ok("쓸기 각 화살표: θ 8.5° 는 꼭대기 아래·초록 아님 · 16° 에 꼭대기·초록 · 40° 는 꼭대기 위 0.35 × 높이(점선 없음) — 예전 '꼭대기에 딱 닿는 8.5°'가 정답처럼 보이던 것(검토)",
      arr[0].tip < arr[0].top - 0.1 && !arr[0].good && Math.abs(arr[1].tip - arr[1].top) < 1e-9 && arr[1].good && Math.abs(arr[2].tip - 1.35 * arr[2].top) < 1e-9 && arr[2].good,
      arr.map((a) => `끝 ${a.tip.toFixed(3)}/꼭대기 ${a.top.toFixed(3)} ${a.good ? '초록' : '주황'}`).join(' · '));
    // 2단계 한 획: 당김 156 px → 90 px 위 → 놓기
    const vib0 = (await page.evaluate(() => window.__vib.length));
    const k0 = (await st(page)).coachKey;
    await pull();
    const k1 = (await st(page)).coachKey;
    await drag(Array.from({ length: 6 }, (_, i) => [X, Y + PULL - (PUSH * (i + 1)) / 6]));
    const k2 = (await st(page)).coachKey;
    await page.mouse.up();
    const sF = await st(page);
    await waitCard(P);
    const { L, cause, zcol, zcolShown } = await card();
    const Nd = nodeC(L);
    const qW = qOf(PULL), thW = G.thOfRise(PUSH, VW);
    ok("2단계 한 획(당김 156 px → 90 px 위 → 놓기): q = 당김 식 ± 1e-9 · θ = thOfRise(90 px) ± 1e-9 · 놓는 순간 발사 · 해시·뒤집힘·스텝·tUp = Node zeroShot(같은 s·q·θ)",
      sF.stage === 'blow' && sF.clock && sF.mode === 'zero' && L.g === 'C' && Math.abs(L.qRaw - qW) <= 1e-9 && Math.abs(L.th - thW) <= 1e-9 && L.s === sl.s && L.hash === Nd.hash && L.flips === Nd.flips && L.steps === Nd.steps && L.tUp === Nd.tUp,
      `s ${L.s} q ${L.qRaw.toFixed(6)}(식 ${qW.toFixed(6)}) θ ${L.th.toFixed(4)}(식 ${thW.toFixed(4)}) · 게임 ${L.flips}장 ${L.hash} · Node ${Nd.flips}장 ${Nd.hash} · tUp ${L.tUp}`);
    ok("코치 말 차례(첫 숨): 누르기 전 '아래로 당겨 숨' → 당김 '꽉까지 → 위로 밀어 쓸기 각' → θ ≥ 16° '놓으면 퍼—!'", k0 === 'swCoachC2a' && k1 === 'swCoachC2b' && k2 === 'swCoachC2c', `${k0} → ${k1} → ${k2}`);
    const vib = (await page.evaluate(() => window.__vib.map((v) => v.p))).slice(vib0);
    const after35 = vib.slice(vib.indexOf(35) + 1);
    const tUpOk = L.cueT >= 0 && L.cueT <= 0.4 ? L.tUp === +(L.cueT + 0.15).toFixed(4) : L.tUp === 0.55;
    ok("자동 쓸기: tUp = 단서 + 0.15 s(또는 0.55) · 실제 시작 ≥ tUp · α 단조 · 최대 α ≤ α0 + θ · 진동 35 뒤 20 한 번 · 25 없음(꼭대기)",
      tUpOk && L.upAt >= L.tUp && L.alphaMono && L.alphaMax <= L.a0 + L.th + 1e-6 && vib.includes(35) && after35.filter((v) => v === 20).length === 1 && !after35.includes(25),
      `단서 ${L.cueT} → tUp ${L.tUp} · 실제 ${L.upAt?.toFixed(4)} · α ${L.a0}° → ${L.alphaMax}° · 진동 ${JSON.stringify(vib.slice(0, 12))}`);
    const gcW = G.gcChip({ n: 40, s: L.s, q: L.qRaw, th: L.th, flip: L.flips });
    const log = await page.evaluate(() => window.__puffSweep.log[0]);
    ok("카드: 칩 = Node gcChip · 미니 기둥 그려짐(내 영점) · 기록 줄 g 'C'(s·눈금·탭 ms·띠 안·q·θ·α0·tUp·단서·당김/밀기 px·프레임)",
      L.chip === gcW && L.chip === Nd.chip && zcolShown && +zcol === L.s && log.g === 'C' && log.meter === 's' && log.T === T && log.tapMs != null && log.tapSrc === 'now' && log.lag === 16 && 'evLagMs' in log && log.inBand === true && log.pullPx === PULL && log.pushPx === PUSH && log.edgePx === VH - (Y + PULL) && 'frameP95' in log && 'tUp' in log && 'a0' in log,
      `칩 ${L.chip}(Node ${gcW}) '${cause}' · 미니 기둥 ${zcol} · 기록 ${JSON.stringify(log)}`);
    ok('C 연습판: 실험 지연 저장값(jetlag 0.02·airfx·hscut) 무시 → table.air 없음 · 지연 0', (await st(page)).air === false && (await st(page)).lag === 0 && (await page.evaluate(() => window.__puffExp().feel.jetLag)) === 0.02);
    // 숨 2: 취소(옆 빼기·덜 당김) 뒤 영점 유지 · '영점 다시' → 1단계 · 띠 켜짐(둘째 숨)
    await same();
    const b2 = await st(page);
    await runTo(b2.meterT0 + 400 + 200); // s = 0.6
    await page.mouse.move(80, 700); await page.mouse.down(); await page.mouse.up();
    await P.toAim();
    const s2 = (await st(page)).s;
    await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
    await drag(Array.from({ length: 19 }, (_, i) => [X + (130 * (i + 1)) / 19, Y + (PULL * (i + 1)) / 19]));
    await page.mouse.up(); await run(32);
    const c1 = await st(page);
    await page.mouse.move(X, Y); await page.mouse.down(); await run(16); await page.mouse.move(X, Y + 5); await run(16); await page.mouse.up(); await run(32);
    const c2 = await st(page);
    const shots2 = await page.evaluate(() => window.__puffSweep.shots);
    await page.$eval('#swZeroAgain', (e) => e.click());
    await run(32);
    const c3 = await st(page);
    ok("숨 2: 옆 빼기·덜 당김 = 취소(숨 안 씀) · 영점 유지 · '📍 영점 다시' → 1단계(창 다시 큼) · 띠 켜짐(둘째 숨)",
      b2.band && c1.stage === 'aim' && c1.s === s2 && !c1.clock && c2.stage === 'aim' && c2.s === s2 && !c2.clock && c3.stage === 'zero' && c3.zeroShown && shots2 === 1,
      `영점 ${s2} · 옆 빼기 뒤 ${c1.stage}/${c1.s} · 덜 당김 뒤 ${c2.stage}/${c2.s} · 다시 → ${c3.stage} · 숨 ${shots2}`);
    const inj = async (pl) => { await page.evaluate((x) => { window.__sweepPlan = x; }, pl); const f = await page.evaluate(() => window.__sweepFire()); await waitCard(P); return f; };
    await inj({ kind: 'gc', s: 0.55, q: 0.9, th: 40 });
    await same();
    const b3 = await st(page);
    await inj({ kind: 'gc', s: 0.55, q: 0.9, th: 40 });
    await same();
    const b4 = await st(page);
    await inj({ kind: 'gc', s: 0.8, q: 0.9, th: 40 });
    const L4 = await page.evaluate(() => window.__puffSweep.last);
    await same();
    const b5 = await st(page);
    ok("띠·1단계 코치: 첫 3숨 켜짐 · 넷째 숨 꺼짐(힌트 띠 '점이 지나갈 때 아무 데나 톡!'이 대신) · 영점 칩(zHigh) 다음 숨 다시 켜짐 · C 숨 수 = 4", b3.band && b3.coach1 && !b4.band && !b4.coach1 && /지나갈 때/.test(b4.hint || '') && L4.chip === 'zHigh' && b5.band && b5.coach1 && b5.total === 4 && b5.totalBy?.C === 4,
      `숨 3 ${b3.band} · 숨 4 ${b4.band} 힌트 '${b4.hint}' · 숨 4 칩 ${L4.chip} · 숨 5 ${b5.band} (total ${b5.total} · ${JSON.stringify(b5.totalBy)})`);
    await inj({ kind: 'gc', s: 0.55, q: 0.9, th: 40 });
    await page.$eval('#swHome', (e) => e.click());
    await run(320);
    const prof1 = await page.evaluate((k) => localStorage.getItem(k), PROFILE);
    const sH = await st(page);
    ok('C 연습판 뒤 프로필 바이트 동일 · 홈에서 영점 창·옆모습 창 숨김 · 리스너 꺼짐', prof0 === prof1 && !sH.zeroShown && !sH.side && !sH.listening && !sH.input, `${prof0?.length}B → ${prof1?.length}B · ${JSON.stringify({ z: sH.zeroShown, side: sH.side, l: sH.listening })}`);
    allErrs.push(...P.errs);
    await P.ctx.close();
  }

  // (c) ?swm=off 끌기: 창 안 0.7 높이에서 눌러 0.6 높이로 끌어 놓기 → s 0.6 ± 0.01 · 한 획 = Node
  {
    const P = await mk('&swm=off', '#p40');
    const { page, pull, drag, dragZero, toAim, card } = P;
    await waitTurn(P);
    await P.run(400);
    const z0 = await st(page);
    // 창 밖 톡(움직임 없음) = 확정 아님('곡선을 끌어요') — 실수 탭이 지난 값 0.7 로 바로 정해지던 것(검토)
    await page.mouse.move(195, 760); await page.mouse.down(); await P.run(16); await page.mouse.up(); await P.run(16);
    const zt = await st(page);
    await dragZero(0.7, 0.6);
    const z1 = await st(page);
    await toAim();
    await pull();
    await drag(Array.from({ length: 6 }, (_, i) => [X, Y + PULL - (PUSH * (i + 1)) / 6]));
    await page.mouse.up();
    await waitCard(P);
    const { L } = await card();
    const Nd = nodeC(L);
    ok("?swm=off 끌기: 창 밖 톡 = 확정 아님('곡선을 끌어요') · 창 안 누름 = 그 높이 · 상대 끌기 → s 0.6 ± 0.01 · 코치 '곡선을 끌어' · 한 획 해시 = Node",
      z0.meter === 'off' && z0.coachKey === 'swCoachC1d' && zt.stage === 'zero' && !zt.locked && zt.pop === 'swPopDrag' && Math.abs(z1.s - 0.6) <= 0.01 && L.s === z1.s && L.hash === Nd.hash && L.flips === Nd.flips,
      `창 밖 톡 → ${zt.stage}/${zt.locked}/${zt.pop} · s ${z1.s} · ${L.flips}장(Node ${Nd.flips}) · 코치 ${z0.coachKey}`);
    // 화면 아래쪽(y 760)에서 눌러 끝까지 당김(83 px, q 0.45) → 칩 + 덧말 '조금 더 위에서 눌러 시작해요'(검토: '꽉까지 당겨요'만으로는 따를 수 없었다)
    await P.same();
    await P.run(400);
    await dragZero(0.6, 0.6);
    await toAim();
    await page.mouse.move(X, 760); await page.mouse.down(); await P.run(16);
    await drag(Array.from({ length: 10 }, (_, i) => [X, 760 + (83 * (i + 1)) / 10]));
    await drag(Array.from({ length: 6 }, (_, i) => [X, 843 - (60 * (i + 1)) / 6]));
    await page.mouse.up();
    await waitCard(P);
    const E = await card();
    ok("화면 끝 당김(아래 24 px 안 · q < 0.85) → 카드 덧말 '화면 끝에 닿았어요 — 조금 더 위에서 눌러 시작해요' · 기록 edgePx", E.L.q < 0.85 && E.L.edgePx < 24 && /위에서 눌러/.test(E.cause),
      `q ${E.L.q} · 끝까지 ${E.L.edgePx} px · 칩 ${E.L.chip} '${E.cause}'`);
    allErrs.push(...P.errs);
    await P.ctx.close();
  }

  // (d) ?swm=th 각도 눈금: 당김 ≥ 0.06 부터 θ 가 0 ↔ 40° · 놓는 순간 값 = 식 · 위로 밀기 무시 · 해시 = Node
  // (e) ?swm=q 세기 눈금: 누르는 동안 q 가 0.6 ↔ 1.0 · 놓는 순간 값 = 식 · θ = 위로 밀기 · 해시 = Node
  for (const [m, label] of [['th', '각도'], ['q', '세기']]) {
    const P = await mk('&swm=' + m, '#p40');
    const { page, run, pull, drag, dragZero, toAim, card, now } = P;
    await waitTurn(P);
    await run(400);
    await dragZero(0.55, 0.55);
    await toAim();
    const hint = (await st(page)).hint;
    const k0 = (await st(page)).coachKey;
    await pull();
    await drag(Array.from({ length: 6 }, (_, i) => [X, Y + PULL - (PUSH * (i + 1)) / 6])); // 두 눈금 모두 위로 밀기(각도 눈금은 무시돼야)
    const sm = await st(page);
    await run(700);
    const tUpAt = await now();
    const sm2 = await st(page);
    await page.mouse.up();
    await waitCard(P);
    const { L } = await card();
    const Nd = nodeC(L);
    const want = G.meterAt(m, tUpAt - sm2.aimT0, T);
    const got = m === 'th' ? L.th : L.qRaw;
    const other = m === 'th' ? Math.abs(L.qRaw - qOf(PULL)) <= 1e-9 : Math.abs(L.th - G.thOfRise(PUSH, VW)) <= 1e-9;
    const hintOk = m === 'th' ? /각도가 초록/.test(hint || '') : /세기가 초록/.test(hint || '');
    // 코치(눈금별): 각도 = '아래로 꽉 당겨 숨 — 각도는 저절로' → 각 < 16° '당긴 채 — 각도가 초록일 때' → '놓으면 퍼—!' · 세기 = '꾹 누른 채 위로 밀어' → 세기 < 0.85 '세기가 초록일 때' → '놓으면 퍼—!'
    const coachOk = m === 'th' ? k0 === 'swCoachC2aTh' && sm.coachKey === 'swCoachC2bTh' && sm2.coachKey === 'swCoachC2c' : k0 === 'swCoachC2aQ' && sm.coachKey === 'swCoachC2bQ' && sm2.coachKey === 'swCoachC2c';
    ok(`?swm=${m} ${label} 눈금: 눈금 시작 ${m === 'th' ? '당김 ≥ 0.06' : '누름'} · 놓는 순간 값 = meterAt 식 ± 1e-9 · ${m === 'th' ? '위로 밀기 무시(90 px 밀어도) · q = 당김' : 'θ = 위로 밀기 · 당김 무시'} · 해시 = Node · 눈금별 힌트·코치`,
      sm.meter === m && sm2.aimT0 != null && Math.abs(got - want) <= 1e-9 && other && L.hash === Nd.hash && L.flips === Nd.flips && L.meter === m && hintOk && coachOk,
      `${m} ${got.toFixed(4)}(식 ${want.toFixed(4)}) · θ ${L.th.toFixed(2)} · q ${L.qRaw.toFixed(3)} · ${L.flips}장(Node ${Nd.flips}) ${L.chip} · 힌트 '${hint}' · 코치 ${k0} → ${sm.coachKey} → ${sm2.coachKey}`);
    if (m === 'th') {
      // 각도 눈금: 꽉 당긴 채 2.2 s 기다려도 콜록 없음(버팀 꺼짐 — 검토: 첫 꼭대기를 놓치면 콜록 취소)
      await P.same();
      await run(400);
      await dragZero(0.55, 0.55);
      await toAim();
      await pull(200);
      await run(2200);
      const sh = await st(page);
      await page.mouse.up();
      const done = await waitCard(P);
      ok('각도 눈금: 꽉(200 px) 당긴 채 2.2 s → 콜록 없음(아직 누르는 중) · 놓으면 발사', sh.stage === 'aim' && sh.pressed && done, JSON.stringify({ stage: sh.stage, pressed: sh.pressed, q: sh.q, th: sh.th }));
    }
    allErrs.push(...P.errs);
    await P.ctx.close();
  }

  // (f) 문법별 첫 3숨: B 로 3숨 분 뒤 ⚙ 에서 C 로 바꾸면 C 첫 숨에 띠·코치가 나온다(검토: 공통 숨 수라 하나도 안 나왔다)
  {
    const P = await mk('&swg=b', '#p40');
    const { page, run } = P;
    await waitTurn(P);
    for (let i = 0; i < 3; i++) {
      if (i) await P.same();
      await page.evaluate(() => { window.__sweepPlan = { kind: 'gb', q: 0.85, ts: 0.3 }; });
      await page.evaluate(() => window.__sweepFire());
      await waitCard(P);
    }
    await page.$eval('#swHome', (e) => e.click()); await run(320);
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    await page.$eval('#core-gc', (e) => e.click()); await page.$eval('#tuneClose', (e) => e.click()); await run(32);
    await page.evaluate(() => { document.querySelector('#sweepBtn').click(); }); await run(160);
    await page.evaluate(() => document.querySelector('#swP40').click());
    await waitTurn(P);
    const sc = await st(page);
    ok('문법별 첫 3숨: B 3숨 뒤 ⚙ 에서 C → C 첫 숨 띠·1단계·2단계 코치 켜짐 · 숨 수 B 3 · C 0', sc.grammar === 'C' && sc.band && sc.coach1 && sc.coach2 && sc.totalBy?.B === 3 && sc.totalBy?.C === 0, JSON.stringify({ g: sc.grammar, band: sc.band, c1: sc.coach1, c2: sc.coach2, by: sc.totalBy }));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }

  // (g) 중간에 홈: 1단계 눈금 중 · 확정 머묾 중 · 축소 중 · 당기는 중 · 숨 중 → 리스너 꺼짐 · 영점 창·'영점 다시'·힌트 숨김 · 입력 없음 · 카드 안 뜸
  {
    const P = await mk('', '#p40');
    const { page, run, pull } = P;
    const enter = async () => { await page.evaluate(() => { document.querySelector('#sweepBtn').click(); }); await run(160); await page.evaluate(() => document.querySelector('#swP40').click()); await waitTurn(P); };
    const quit = async () => { await page.$eval('#quitBtn', (e) => e.click()); await run(160); const x = await st(page); const hint = await page.evaluate(() => !document.querySelector('#hint').hidden); return { listening: x.listening, input: x.input, zero: x.zeroShown, again: x.again, side: x.side, hint, card: x.card, on: x.on, over: x.breathOver }; };
    const clean = (x) => !x.listening && !x.input && !x.zero && !x.again && !x.side && !x.hint && !x.card && !x.on && !x.over;
    const res = {};
    await waitTurn(P);
    const s0 = await st(page);
    await P.runTo(s0.meterT0 + 700);
    res.meter = await quit();
    await enter();
    let s1 = await st(page);
    await P.runTo(s1.meterT0 + 900);
    await page.mouse.move(80, 700); await page.mouse.down(); await page.mouse.up(); await run(100);
    res.hold = await quit();
    await enter();
    s1 = await st(page);
    await P.runTo(s1.meterT0 + 900);
    await page.mouse.move(80, 700); await page.mouse.down(); await page.mouse.up(); await run(400);
    res.shrink = await quit();
    await enter();
    s1 = await st(page);
    await P.runTo(s1.meterT0 + 900);
    await page.mouse.move(80, 700); await page.mouse.down(); await page.mouse.up(); await P.toAim();
    await pull();
    res.pull = await quit();
    await page.mouse.up(); await run(32);
    await enter();
    await page.evaluate(() => { window.__sweepPlan = { kind: 'gc', s: 0.55, q: 0.9, th: 40 }; });
    await page.evaluate(() => window.__sweepFire());
    await run(200);
    const blowing = (await st(page)).clock;
    res.blow = await quit();
    await run(2000);
    const after = await st(page);
    ok('중간에 홈(눈금 중 · 확정 머묾 · 축소 중 · 당기는 중 · 숨 중): 리스너 꺼짐 · 영점 창·영점 다시·힌트·옆모습 숨김 · 입력 없음 · 카드 안 뜸',
      Object.values(res).every(clean) && blowing && !after.card && !after.input, JSON.stringify(res));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
}

// ── (12) 문법 D '세 박자'(기본) ──
console.log("(12) 문법 D '세 박자'(기본): 설정 · 주입 = Node gdShot(책상) · 손 경로(① 톡 → ② 톡 → ③ 당겼다 놓기) = Node · 분필 원(인트로 · 같은 페이지 D → 홈 → C) · 배치 · HUD 홈 왕복 월드 반납");
{
  // (a) 설정
  {
    const P = await open('core=sweep');
    const { page, run } = P;
    const g0 = await page.evaluate(() => window.__puffSweep.state().grammar);
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    const btns = () => page.evaluate(() => ({ g: ['gd', 'gc', 'gb', 'ga'].map((k) => document.querySelector('#core-' + k)?.getAttribute('aria-pressed')), m0: document.querySelector('#core-m0') ? 1 : 0, t: [0, 1, 2].map((i) => document.querySelector('#core-t' + i)?.getAttribute('aria-pressed') ?? null), swg: window.__puffExp().feel.swg, grammar: window.__puffSweep.state().grammar }));
    const b0 = await btns();
    await page.$eval('#core-gc', (e) => e.click()); await run(32);
    const b1 = await btns();
    await page.$eval('#core-gd', (e) => e.click()); await run(32);
    const b2 = await btns();
    await P.ctx.close();
    const Q = await open('core=sweep&swg=c'), gc = await Q.page.evaluate(() => [window.__puffSweep.state().grammar, window.__puffExp().feel.swg]); allErrs.push(...Q.errs); await Q.ctx.close();
    const R = await open('core=sweep&swg=d'), gdq = await R.page.evaluate(() => [window.__puffSweep.state().grammar, window.__puffExp().feel.swg]); allErrs.push(...R.errs); await R.ctx.close();
    ok("새 프로필 = D(swg 0) · ⚙ 문법 4단추(세 박자 켜짐) · 빠르기 줄 있음(보통) · 눈금 줄 없음 · '영점 조준' = C(swg 3) → '세 박자' = D · ?swg=c = C(3) · ?swg=d = D(0)",
      g0 === 'D' && b0.g.join() === 'true,false,false,false' && b0.m0 === 0 && b0.t.join() === 'false,true,false' && b1.grammar === 'C' && b1.swg === 3 && b1.m0 === 1 && b2.grammar === 'D' && b2.swg === 0 && gc.join() === 'C,3' && gdq.join() === 'D,0',
      JSON.stringify({ g0, b0, b1: [b1.grammar, b1.swg, b1.m0], b2: [b2.grammar, b2.swg], gc, gdq }));
    allErrs.push(...P.errs);
  }
  // (b) 주입 = Node gdShot(책상 판정)
  for (const N of [40, 30]) {
    const P = await open('core=sweep', `#p${N}`);
    let first = true;
    // 첫 판 인트로·배너(① 전) 동안 분필 원: 판이 열린 뒤 첫 그리기 프레임부터 ① 까지 32 ms 마다 표본 — 모두 숨김이어야 한다(예전엔 ① 이 열려야 숨었다).
    //   분필 원 보임은 프레임마다 sweepDraw 가 render 바로 앞에서 정한다 → 판이 열린(state 'match') 그 순간·첫 프레임 전 값은 화면에 안 그려짐 — 한 프레임(16 ms) 뒤부터 잰다
    { const samp = [];
      await P.until(() => window.__puffSweep?.state?.()?.state === 'match', null, 60000, 16);
      await P.run(16);
      for (let k = 0; k < 400; k++) { const s = await st(P.page); if (s?.waiting) break; samp.push({ chalk: s?.chalk, desk: s?.desk, d: !!s?.d }); await P.run(32); }
      const pre = samp.filter((x) => !x.d);
      ok(`${N}장 첫 판 인트로·배너 동안(① 전 표본 ${pre.length}개) 분필 원 숨김 · 책상 판정`, pre.length >= 10 && pre.every((x) => x.chalk === false && x.desk === true), JSON.stringify(samp.filter((x, i) => i % 15 === 0 || x.chalk !== false))); }
    for (const r of REF_GD.filter((x) => x.N === N)) {
      if (!first) await P.page.$eval('#swSame', (e) => e.click());
      first = false;
      const okTurn = await waitTurn(P);
      await P.run(32); // 분필 원 숨김은 다음 그리기 프레임에
      const s0 = await st(P.page);
      await P.page.evaluate((pl) => { window.__sweepPlan = pl; }, { kind: 'gd', s: r.s, q: r.q, th: r.th });
      const fired = await P.page.evaluate(() => window.__sweepFire());
      await P.run(160);
      const chalkBlow = (await st(P.page)).chalk;
      const done = await waitCard(P);
      const L = await P.page.evaluate(() => window.__puffSweep.last);
      const same = L && L.g === 'D' && L.flips === r.flips && L.outs === r.outs && L.hang === r.hang && L.hash === r.hash && L.steps === r.steps && L.D === r.D && L.tUp === r.tUp && L.chip === r.chip;
      ok(`D 주입 ${N}장 시드 ${r.seed} (s ${r.s}, q ${r.q}, θ ${r.th}°): 뒤집힘·책상 밖·걸침·스텝·D·tUp·칩·해시 = Node gdShot · 분필 원 숨김`, okTurn && fired && done && s0?.seed === r.seed && s0?.grammar === 'D' && same && chalkBlow === false && s0?.chalk === false,
        `게임 ${L ? `${L.flips}/${L.outs} 걸침 ${L.hang} 스텝 ${L.steps} ${L.chip} ${L.hash}` : '없음'} · Node ${r.flips}/${r.outs} 걸침 ${r.hang} 스텝 ${r.steps} ${r.chip} ${r.hash} · 원 ${s0?.chalk}/${chalkBlow}`);
    }
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
  // (c) 손 경로
  {
    const P = await open('core=sweep', '#p40');
    const { page, run } = P;
    const now = () => page.evaluate(() => performance.now());
    const runTo = async (t) => { const n = await now(); if (t > n) await run(Math.round(t - n)); };
    const sd = async () => (await st(page))?.d;
    await waitTurn(P);
    let big = false;
    const watchBig = async () => { const d = await sd(); if (d?.zeroBig) big = true; return d; };
    // 큰 영점 창(#swZero)이 열린 횟수를 사건으로 센다(표본 시점 사이에 잠깐 열렸다 닫혀도 잡힘)
    await page.evaluate(() => { const z = document.querySelector('#swZero'); window.__bigOpen = z.hidden ? 0 : 1; new MutationObserver(() => { if (!z.hidden) window.__bigOpen++; }).observe(z, { attributes: true, attributeFilter: ['hidden'] }); });
    const d0 = await watchBig();
    const T = d0.T;
    // ① 띠 가운데(s 0.55) 때 + 화면 지연 16 ms
    const msS = 400 + T * ((1 - 0.55) / 0.6 / 2) + 16;
    await runTo(d0.meterT0 + msS);
    const tS = await now();
    await page.mouse.click(195, 300);
    const d1 = await watchBig();
    const wantS = G.gdMeterAt('s', tS - d0.meterT0 - 16, T);
    await run(100);
    await page.mouse.click(195, 300); // 머묾 중 톡 = '잠깐…'
    const popHold = (await st(page)).pop, waitTaps = (await sd()).waitTaps;
    for (let k = 0; k < 40 && (await sd()).stage !== 'angle'; k++) await run(16);
    const dA = await watchBig();
    // ② 30° 때
    const msT = 400 + (T / 2) * (30 / 45) + 16;
    await runTo(dA.meterT0 + msT);
    const tT = await now();
    await page.mouse.click(195, 300);
    const wantTh = G.gdMeterAt('th', tT - dA.meterT0 - 16, T);
    await run(100);
    await page.mouse.click(195, 300); // ② 머묾 중 톡 = '잠깐…'(이 박자의 한 번) — 아래 '📐 각도 다시' 뒤에 다시 한 번 떠야 한다
    const popHoldA = (await st(page)).pop;
    for (let k = 0; k < 40 && (await sd()).stage !== 'breath'; k++) await run(16);
    await run(100);
    const dB = await watchBig();
    // ③ 5 px 당김 = 취소 · '📐 각도 다시' → ② (영점 유지) → 다시 30° 톡
    await page.mouse.move(240, 560); await page.mouse.down(); await run(16); await page.mouse.move(240, 565); await run(16); await page.mouse.up(); await run(32);
    const dC = await watchBig(), popC = (await st(page)).pop;
    await run(700); // 'swD3Tiny' 글이 사라질 때까지
    // ③ 80 px 당김 → 200 ms 멈춤 → 48 ms 에 40 · 2 · 0 px 로 되돌려 바로 놓기 = 취소(창 앞 깊이 80 px 로 숨이 나가면 안 됨)
    { const X = 300, Y = 450;
      await page.mouse.move(X, Y); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await run(16); await page.mouse.move(X, Y + 8 * i); }
      await run(200);
      for (const y of [Y + 40, Y + 2, Y]) { await run(16); await page.mouse.move(X, y); }
      await page.mouse.up(); await run(16); }
    const dRet = await watchBig(), popRet = (await st(page)).pop, shotsRet = await page.evaluate(() => window.__puffSweep.shots);
    await run(700);
    // ③ 당기다 pointercancel(시스템) = 말 없는 취소: 취소 수·'아래로 당겨요' 안 늘고 sysCancels 만 · 그 뒤 뗌은 발사 안 함
    { const X = 300, Y = 450;
      await page.mouse.move(X, Y); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await run(16); await page.mouse.move(X, Y + 8 * i); }
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
      await run(16); }
    const dSys = await watchBig(), popSys = (await st(page)).pop;
    await page.mouse.up(); await run(32);
    const shotsSys = await page.evaluate(() => window.__puffSweep.shots);
    // 오른쪽 단추 누름·끌기 = 무시(당김 안 시작) · contextmenu = 막힘(연습판 동안)
    await page.mouse.move(300, 450); await page.mouse.down({ button: 'right' }); await run(16); await page.mouse.move(300, 530); await run(16);
    const dRight = await watchBig();
    await page.mouse.up({ button: 'right' }); await run(16);
    const ctxPrevented = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); document.querySelector('canvas')?.dispatchEvent(e) ?? window.dispatchEvent(e); return e.defaultPrevented; });
    const dRight2 = await watchBig();
    await page.$eval('#swAngleAgain', (e) => e.click()); await run(32);
    const dR = await watchBig();
    await runTo(dR.meterT0 + 100);
    await page.mouse.click(195, 300); // 다시 연 ② 의 준비 중 톡 = '잠깐…' 다시(예전엔 waitStage 가 남아 말 없이 버려짐)
    const popPrepA = (await st(page)).pop, dPrep = await sd();
    await runTo(dR.meterT0 + msT);
    const tT2 = await now();
    await page.mouse.click(195, 300);
    const wantTh2 = G.gdMeterAt('th', tT2 - dR.meterT0 - 16, T);
    for (let k = 0; k < 40 && (await sd()).stage !== 'breath'; k++) await run(16);
    await run(100);
    // 80 px 당김 → 마지막 40 ms 에 3 px 올라가 놓기 (놓기 직전 60 ms 안 가장 깊은 당김 = 80)
    const X = 240, Y = 520;
    await page.mouse.move(X, Y); await page.mouse.down(); await run(16);
    for (let i = 1; i <= 10; i++) { await page.mouse.move(X, Y + 8 * i); await run(16); }
    const dP = await watchBig();
    await run(60);
    await page.mouse.move(X, Y + 78.5); await run(16); await page.mouse.move(X, Y + 77); await run(16);
    await page.mouse.up();
    await run(64);
    const sBlow = await st(page);
    await waitCard(P);
    const L = await page.evaluate(() => window.__puffSweep.last), log = await page.evaluate(() => window.__puffSweep.log[0]);
    const bigN = await page.evaluate(() => window.__bigOpen);
    const wantQ = G.qOfPull(80, 390);
    const nd = G.gdShot(V1.Table, { N: 40, seed: L.seed, s: L.s, q: L.qRaw, th: L.th });
    ok("손 경로: ① 띠 가운데 톡 → s = gdMeterAt(탭 − 16) · 머묾 중 톡 '잠깐…' · ② 30° 톡 → θ = 식 · ③ 5 px = 취소 · '📐 각도 다시' → ② (영점 유지) · 80 px → 3 px 올려 놓기 → q = qOfPull(80) · 해시 = Node gdShot · 큰 영점 창 0번(사건) · 기록 g 'D'(coachBeats · sysCancels)",
      Math.abs(d1.s - wantS) <= 1e-9 && Math.abs(d1.s - 0.55) < 0.01 && popHold === 'swJudgeWait' && waitTaps === 1 && dA.stage === 'angle' && dA.s === d1.s && popHoldA === 'swJudgeWait'
        && dB.stage === 'breath' && Math.abs(dB.th - wantTh) <= 1e-9 && dB.again.zero && dB.again.angle && dC.stage === 'breath' && dC.cancels === 1 && popC === 'swD3Tiny'
        && dR.stage === 'angle' && dR.s === d1.s && dR.redo.angle === 1 && dP.qLive > 0.9 && sBlow.clock && sBlow.mode === 'zero'
        && L.g === 'D' && L.s === d1.s && Math.abs(L.th - wantTh2) <= 1e-9 && Math.abs(L.qRaw - wantQ) <= 1e-9 && L.pullPx === 80 && L.hash === nd.hash && L.flips === nd.flips && L.outs === nd.outs && !big && bigN === 0
        && log.g === 'D' && log.redo?.angle === 1 && log.cancels === 2 && log.sysCancels === 1 && log.zoneS === 'green' && log.zoneTh === 'strike' && log.zoneQ === 'green'
        && log.coachBeats && log.coachBeats.s === true && log.coachBeats.th === true && log.coachBeats.q === true && log.coach === true,
      `s ${d1.s}(식 ${wantS.toFixed(6)}) · 잠깐 ${popHold}/${waitTaps} · ② 머묾 ${popHoldA} · θ ${dB.th?.toFixed(3)}(식 ${wantTh.toFixed(3)}) · 취소 ${dC.cancels} ${popC} · 각도 다시 ${dR.stage} · q ${L.qRaw}(식 ${wantQ.toFixed(6)}) 당김 ${L.pullPx} · 게임 ${L.flips}/${L.outs} ${L.hash} · Node ${nd.flips}/${nd.outs} ${nd.hash} · 큰 창 ${big}/${bigN}번 · 칸 ${log.zoneS}/${log.zoneTh}/${log.zoneQ} · 취소 ${log.cancels}/시스템 ${log.sysCancels} · 박자 코치 ${JSON.stringify(log.coachBeats)}`);
    ok("③ 되돌려 놓기·시스템 취소·오른쪽 단추·다시 연 박자: 80 px → 48 ms 에 0 px 로 놓기 = 취소(숨 안 나감 · '아래로 당겨요' · 취소 2) · pointercancel = 말 없는 취소(취소 수 그대로 · sysCancels 1 · 뒤 뗌 발사 없음) · 오른쪽 단추 = 당김 없음 · contextmenu 막힘 · 다시 연 ② 준비 중 톡 = '잠깐…'",
      dRet.stage === 'breath' && dRet.cancels === 2 && popRet === 'swD3Tiny' && shotsRet === 0 && dSys.stage === 'breath' && dSys.cancels === 2 && dSys.sysCancels === 1 && popSys !== 'swD3Tiny' && shotsSys === 0
        && dRight.stage === 'breath' && dRight.pullPx == null && dRight2.cancels === 2 && ctxPrevented === true && popPrepA === 'swJudgeWait' && dPrep.stage === 'angle' && dPrep.locked == null,
      JSON.stringify({ ret: [dRet.stage, dRet.cancels, popRet, shotsRet], sys: [dSys.stage, dSys.cancels, dSys.sysCancels, popSys, shotsSys], right: [dRight.stage, dRight.pullPx], ctxPrevented, prep: [popPrepA, dPrep.stage, dPrep.locked] }));
    nd.table.world.free();
    // (d) 배치: 390×844 ③ 사각형 교차 0 (다음 숨, '같은 더미 다시')
    await page.$eval('#swSame', (e) => e.click());
    await waitTurn(P);
    let dd = await sd();
    await runTo(dd.meterT0 + msS); await page.mouse.click(195, 300);
    for (let k = 0; k < 40 && (await sd()).stage !== 'angle'; k++) await run(16);
    dd = await sd(); await runTo(dd.meterT0 + msT); await page.mouse.click(195, 300);
    for (let k = 0; k < 40 && (await sd()).stage !== 'breath'; k++) await run(16);
    await run(200);
    const rc = (await sd()).rects;
    const box = Object.entries(rc || {}).filter(([, r]) => r);
    const hit = [];
    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) { const [na, a] = box[i], [nb, b] = box[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hit.push(`${na}×${nb}`); }
    const inside = box.every(([, r]) => r.x >= -1 && r.x + r.w <= VW + 1);
    ok('배치(390×844, ③): HUD·부채꼴·게이지·다시 단추 2개·힌트 사각형 교차 0 · 모두 화면 안', box.length >= 5 && !hit.length && inside, `${box.map(([n, r]) => `${n} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`).join(' · ')}${hit.length ? ' · 교차 ' + hit.join(',') : ''}`);
    // (d2) 같은 페이지 D → 홈 → ⚙ '영점 조준'(C) → 40장 더미 1(같은 더미): 분필 원이 돌아오고(홈 · C 인트로 · C 숨) C 주입 = Node zeroShot(원 판정)
    await page.evaluate(() => { window.__sweepPlan = { kind: 'gd', s: 0.55, q: 0.9, th: 40 }; });
    const firedD = await page.evaluate(() => window.__sweepFire());
    await waitCard(P);
    await page.$eval('#swHome', (e) => e.click()); await run(200);
    const sHome = await st(page);
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    await page.$eval('#core-gc', (e) => e.click()); await run(32);
    await page.$eval('#tuneClose', (e) => e.click()); await run(64);
    await page.$eval('#sweepBtn', (e) => e.click()); await run(160);
    await page.$eval('#swP40', (e) => e.click());
    await P.until(() => window.__puffSweep.state().state === 'match', null, 60000, 16);
    await run(64);
    const sIntroC = await st(page);
    await waitTurn(P); await run(32);
    const sC = await st(page);
    const rC = REF_GC.find((x) => x.N === 40 && x.seed === 401 && x.s === 0.55 && x.q === 0.9 && x.th === 40);
    await page.evaluate((pl) => { window.__sweepPlan = pl; }, { kind: 'gc', s: rC.s, q: rC.q, th: rC.th });
    const firedC = await page.evaluate(() => window.__sweepFire());
    await run(160);
    const sCB = await st(page);
    await waitCard(P);
    const LC = await page.evaluate(() => window.__puffSweep.last);
    ok("같은 페이지 D → 홈 → ⚙ C → 같은 더미: 홈 분필 원 보임·책상 판정 끔 · C 인트로·숨 전·숨 동안 분필 원 보임 · C 주입(40장 401 · 0.55, 0.9, 40°) = Node zeroShot(원 판정)",
      firedD && sHome.state === 'home' && sHome.chalk === true && sHome.desk === false && sIntroC.chalk === true && sIntroC.desk === false && sC.grammar === 'C' && sC.seed === 401 && sC.chalk === true && sC.desk === false
        && firedC && sCB.chalk === true && sCB.desk === false && LC?.g === 'C' && LC.flips === rC.flips && LC.outs === rC.outs && LC.hash === rC.hash && LC.steps === rC.steps,
      JSON.stringify({ home: [sHome.state, sHome.chalk, sHome.desk], introC: [sIntroC.chalk, sIntroC.desk], C: [sC.grammar, sC.seed, sC.chalk, sCB.chalk], game: LC && [LC.flips, LC.outs, LC.hash], node: [rC.flips, rC.outs, rC.hash] }));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
  // (d3) HUD 홈 왕복 4번 → Rapier 월드 반납: WASM 내보내기(rawphysicspipeline_new · __wbg_rawphysicspipeline_free)를 감싸 직접 센다.
  //      ① 에서 HUD 홈 2번(40·30장) · 숨 도중 HUD 홈 1번 · 앱 '뒤로'(__puffBack → HUD 홈) 1번 — 홈으로 돌아올 때마다 새로 만듦 − 반납 = 처음 값
  {
    const INIT = () => {
      window.__pp = { n: 0, f: 0 };
      const oi = WebAssembly.instantiate;
      WebAssembly.instantiate = async function (...a) {
        const r = await oi.apply(this, a);
        const ex = (r.instance || r).exports;
        if (!ex || !ex.rawphysicspipeline_new) return r;
        const px = {};
        for (const k of Object.keys(ex)) px[k] = ex[k];
        px.rawphysicspipeline_new = (...x) => { window.__pp.n++; return ex.rawphysicspipeline_new(...x); };
        px.__wbg_rawphysicspipeline_free = (...x) => { window.__pp.f++; return ex.__wbg_rawphysicspipeline_free(...x); };
        const ni = { exports: px };
        return r.instance ? { instance: ni, module: r.module } : ni;
      };
    };
    const P = await open('core=sweep', '', INIT);
    const { page, run } = P;
    const live = () => page.evaluate(() => (window.__pp ? window.__pp.n - window.__pp.f : null));
    const hooked = await page.evaluate(() => !!window.__pp && window.__pp.n >= 0);
    const live0 = await live();
    const rows = [];
    for (const [i, how] of ['quit', 'quit', 'blow', 'back'].entries()) {
      await page.$eval('#sweepBtn', (e) => e.click()); await run(160);
      await page.$eval(i % 2 ? '#swP30' : '#swP40', (e) => e.click());
      const z = await P.until(() => window.__puffSweep.state()?.d?.stage === 'zero', null, 60000, 32);
      const inMatch = await live();
      if (how === 'blow') { await page.evaluate(() => { window.__sweepPlan = { kind: 'gd', s: 0.55, q: 0.9, th: 30 }; }); await page.evaluate(() => window.__sweepFire()); await run(200); }
      const clock = (await st(page)).clock;
      if (how === 'back') await page.evaluate(() => window.__puffBack()); else await page.$eval('#quitBtn', (e) => e.click());
      await run(200);
      rows.push({ how, z, inMatch, clock, state: (await st(page)).state, live: await live() });
    }
    const pp = await page.evaluate(() => window.__pp);
    ok("HUD 홈 왕복 4번(① 40·30장 · 숨 도중 · 앱 '뒤로'): Rapier 월드 새로 만듦 − 반납 = 처음 값(남는 월드 0) · 판마다 월드가 있었음 · 숨 도중 나감 오류 없음",
      hooked && live0 != null && rows.every((r) => r.z && r.state === 'home' && r.live === live0 && r.inMatch >= live0 + 1) && rows[2].clock === true && pp.n >= live0 + 4,
      `처음 ${live0} · ${rows.map((r) => `${r.how}: 판 ${r.inMatch} → 홈 ${r.live}${r.how === 'blow' ? `(숨 ${r.clock})` : ''}`).join(' · ')} · 만듦 ${pp.n} 반납 ${pp.f}`);
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
  // (d) 분필 원: D 판 숨김 → 레벨 1 보임
  {
    const P = await open('core=sweep', '#lv1');
    await P.until(() => window.__puffSweep.state().state === 'match' && window.__puffSweep.state().chalk === true, null, 60000);
    const s = await st(P.page);
    ok('분필 원: 레벨 1(쓸기 깃발 켬) = 보임 · 책상 판정 아님', s.chalk === true && s.desk === false && !s.on, JSON.stringify({ chalk: s.chalk, desk: s.desk, on: s.on }));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
}

// ── (12e) 문법 D 비교 토글 ──
console.log("(12e) 문법 D 비교 토글(⚙ 숨 난이도 × 아웃 범위): 설정·저장·주소 · 조합마다 주입 = Node gdShot(mode) · 카드 글 · 반지름 5 원");
{
  {
    const P = await open('core=sweep');
    const { page, run } = P;
    const tb = () => page.evaluate(() => ({ q: [0, 1].map((i) => document.querySelector('#core-q' + i)?.getAttribute('aria-pressed') ?? null), o: [0, 1].map((i) => document.querySelector('#core-o' + i)?.getAttribute('aria-pressed') ?? null), f: [window.__puffExp().feel.gdQ, window.__puffExp().feel.gdOut], m: window.__puffSweep.state().gdMode }));
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    const b0 = await tb();
    await page.$eval('#core-q1', (e) => e.click()); await run(32);
    await page.$eval('#core-o1', (e) => e.click()); await run(32);
    const b1 = await tb();
    await page.$eval('#core-gc', (e) => e.click()); await run(32);
    const inC = await page.evaluate(() => [!!document.querySelector('#core-q0'), !!document.querySelector('#core-o0')]);
    await page.$eval('#core-gd', (e) => e.click()); await run(32);
    await page.$eval('#tuneClose', (e) => e.click()); await run(64);
    await page.reload();
    await P.until(() => window.__puffBooted);
    await page.$eval('#tuneBtn', (e) => e.click()); await run(64);
    const b2 = await tb();
    await P.ctx.close(); allErrs.push(...P.errs);
    const Q = await open('core=sweep&gdq=hard&gdout=r5'), q1 = await Q.page.evaluate(() => [window.__puffExp().feel.gdQ, window.__puffExp().feel.gdOut, window.__puffSweep.state().gdMode]); allErrs.push(...Q.errs); await Q.ctx.close();
    const R = await open('core=sweep&gdq=bogus&gdout=desk'), q2 = await R.page.evaluate(() => [window.__puffExp().feel.gdQ, window.__puffExp().feel.gdOut]); allErrs.push(...R.errs.filter((e) => !/gdq 값 무시/.test(e))); await R.ctx.close();
    ok("비교 토글 설정: 새 프로필 = 보통·책상(0/0) · ⚙ D 두 줄 · 어려움·반지름 5 누름 → feel 1/1 · C 에선 두 줄 없음 · 완료 → 다시 열어도 1/1(저장) · ?gdq=hard&gdout=r5 = r5|hard · 모르는 값 무시",
      b0.q.join() === 'true,false' && b0.o.join() === 'true,false' && b0.f.join() === '0,0' && b0.m === 'desk|normal' && b1.q.join() === 'false,true' && b1.o.join() === 'false,true' && b1.f.join() === '1,1'
        && inC.join() === 'false,false' && b2.f.join() === '1,1' && b2.q.join() === 'false,true' && b2.o.join() === 'false,true' && b2.m === 'r5|hard' && q1.join() === '1,1,r5|hard' && q2.join() === '0,0',
      JSON.stringify({ b0, b1, inC, b2, q1, q2 }));
  }
  for (const r of REF_GDM) {
    const P = await open(`core=sweep&gdq=${r.q_}&gdout=${r.out_}`, `#p${r.N}`);
    const okTurn = await waitTurn(P);
    await P.run(48);
    const s0 = await st(P.page);
    await P.page.evaluate((pl) => { window.__sweepPlan = pl; }, { kind: 'gd', s: r.s, q: r.q, th: r.th });
    const fired = await P.page.evaluate(() => window.__sweepFire());
    await P.run(160);
    const sB = await st(P.page);
    const done = await waitCard(P);
    const L = await P.page.evaluate(() => window.__puffSweep.last), log = await P.page.evaluate(() => window.__puffSweep.log[0]);
    const combo = await P.page.evaluate(() => document.querySelector('#swCombo')?.textContent ?? null);
    const wantTxt = `숨 난이도 ${r.q_ === 'hard' ? '어려움' : '보통'} · 아웃 범위 ${r.out_ === 'r5' ? '반지름 5' : '책상'}`;
    const same = L && L.g === 'D' && L.mode === r.mode && L.flips === r.flips && L.outs === r.outs && L.hang === r.hang && L.ring === r.ring && L.hash === r.hash && L.steps === r.steps && L.chip === r.chip && Math.abs(L.blast - r.blast) < 1e-12;
    const ringWant = r.out_ === 'r5';
    ok(`D 조합 ${r.mode} 주입 ${r.N}장 ${r.seed} (${r.s}, ${r.q}, ${r.th}°): 뒤집힘·밖·걸침·원 밖·스텝·칩·해시 = Node gdShot(mode) · 기록 mode · 카드 '${wantTxt}' · 넓은 원 ${ringWant ? '보임' : '숨김'} · 분필 원 숨김`,
      okTurn && fired && done && s0?.gdMode === r.mode && same && log?.mode === r.mode && combo === wantTxt && s0?.ring === ringWant && sB?.ring === ringWant && s0?.chalk === false,
      `게임 ${L ? `${L.flips}/${L.outs} 걸침 ${L.hang} 원 밖 ${L.ring} ${L.chip} ${L.hash}` : '없음'} · Node ${r.flips}/${r.outs} 걸침 ${r.hang} 원 밖 ${r.ring} ${r.chip} ${r.hash} · 글 ${combo} · 원 ${s0?.ring}/${sB?.ring}`);
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
  // 레벨 1 은 넓은 원 없음(?gdout=r5 여도)
  {
    const P = await open('core=sweep&gdout=r5', '#lv1');
    await P.until(() => window.__puffSweep.state().state === 'match' && window.__puffSweep.state().chalk === true, null, 60000);
    const s = await st(P.page);
    ok('레벨 1(?gdout=r5): 분필 원 보임 · 넓은 원 숨김 · 책상 판정 아님', s.chalk === true && s.ring === false && s.desk === false, JSON.stringify({ chalk: s.chalk, ring: s.ring, desk: s.desk }));
    allErrs.push(...P.errs);
    await P.ctx.close();
  }
}

ok('콘솔 오류 0', !allErrs.length, allErrs.slice(0, 6).join(' | '));
await browser.close();
console.log(`\nsweepplay: ${FAIL ? `틀림 ${FAIL}` : '맞음'} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
process.exit(FAIL ? 1 : 0);

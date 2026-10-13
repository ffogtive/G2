// 아티팩트 버전 재현 테스트: jsDelivr 요청을 node_modules 로 돌려주고, 아티팩트 스켈레톤과 같은 형태로 감싸서 부팅 확인.
// 사용: PW=$(npm root -g)/playwright node tools/artifact-check.mjs [dist/puff-artifact.html]
//   PLAY=1   솔로 자유 대전 첫 턴까지
//   ONLY=0   첫 경우(claude 없음)만 — 빠른 부팅 확인
// P0.5b 경우 4가지(docs/design/items-pvp.md §2.1 시험 방법 3 — 'claude 가 없을 때 PvP 버튼이 숨고 부팅되는가. 가짜 net 으로도 부팅되는가'):
//   none    window.claude 없음(저장한 파일·다른 호스트)                → 부팅 · PvP 숨김
//   null    claude.use() 가 모두 null(권한 없음·공개 링크·top-level)    → 부팅 · PvP 숨김
//   viewer  user.can('data.write') = false(보기 전용)                 → 부팅 · PvP 숨김
//   full    가짜 호스트(db·room·user)                                  → 부팅 · 'VS 친구' 보임 · 방 만들기 → 6자 코드 · 매치 문서 · 닫기 → abandoned
import { createRequire } from 'module';
import { join } from 'node:path';
import { wrapArtifact, routeCdn, fakeClaude, root } from './artifact-host.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const tmp = wrapArtifact(process.argv[2] || undefined);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(mode) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
  await routeCdn(page, logs);
  if (mode !== 'none') await page.addInitScript({ content: await fakeClaude({ mode }) });
  await page.goto('file://' + tmp);
  await page.waitForFunction(() => window.__puffBooted, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(mode === 'none' ? 1500 : 2500); // use() 가 풀리고 netBoot 가 버튼을 켤 시간
  const homeShown = await page.$eval('#home', (e) => !e.hidden).catch(() => false);
  const bootMsg = await page.$eval('#bootMsg', (e) => e.textContent).catch(() => '?');
  const pvpHidden = await page.$eval('#pvpBtn', (e) => e.hidden).catch(() => false);
  const pvpText = await page.$eval('#pvpBtn', (e) => e.textContent).catch(() => '?');
  const netKind = await page.evaluate(() => window.__pvpNet ?? null);
  return { ctx, page, logs, homeShown, bootMsg, pvpHidden, pvpText, netKind };
}

const results = [];
const modes = process.env.ONLY === '0' ? ['none'] : ['none', 'null', 'viewer', 'full'];
for (const mode of modes) {
  const r = await boot(mode);
  let ok = r.homeShown && !r.logs.length;
  let extra = '';
  if (mode === 'none' && r.homeShown && process.env.PLAY) {
    await r.page.click('#freeBtn');
    for (let i = 0; i < 40; i++) {
      await r.page.waitForTimeout(500);
      if (await r.page.$eval('#rps', (e) => !e.hidden && !e.querySelector('button').disabled)) await r.page.click('#rps button[data-h="rock"]');
      if (await r.page.$eval('#hint', (e) => !e.hidden)) break;
    }
    const st = await r.page.evaluate(() => window.__puff());
    extra += ` | in match: ${JSON.stringify({ state: st.state, live: st.live, turn: st.turn })}`;
  }
  if (mode === 'full') {
    ok &&= !r.pvpHidden && r.netKind === 'artifact';
    // 로비: 방 만들기 → 6자 코드 + 매치 문서(가짜 db = localStorage 'pn1:') → 닫기 → abandoned
    const tap = (sel) => r.page.$eval(sel, (e) => e.click());
    await tap('#pvpBtn');
    await tap('#pvpChips button[data-n="5"]');
    await tap('#pvpCreate');
    const code = await r.page.waitForFunction(() => { const c = document.querySelector('#pvpCode')?.textContent || ''; return /^[A-Z0-9]{6}$/.test(c) ? c : null; }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
    const doc = code ? await r.page.evaluate((c) => JSON.parse(localStorage.getItem('pn1:matches/' + c) || 'null'), code) : null;
    await tap('#pvpClose');
    await r.page.waitForTimeout(800);
    const after = code ? await r.page.evaluate((c) => JSON.parse(localStorage.getItem('pn1:matches/' + c) || 'null'), code) : null;
    const fakeV = await r.page.evaluate(() => window.__fakeMeter?.()?.violations?.length ?? null);
    const lobbyOk = !!code && doc?.status === 'open' && doc?.sim && doc?.seats?.a?.uid && after?.status === 'abandoned' && !fakeV;
    ok &&= lobbyOk;
    extra += ` | lobby: code ${code} · match doc ${doc?.status}→${after?.status} · sim ${doc?.sim} · host limit violations ${fakeV}`;
  } else ok &&= r.pvpHidden;
  console.log(`[${mode}] home shown: ${r.homeShown} | boot msg: ${r.bootMsg} | PvP button ${r.pvpHidden ? 'hidden' : `shown "${r.pvpText}"`} | net ${r.netKind}${extra} → ${ok ? 'ok' : 'FAIL'}`);
  if (r.logs.length) console.log('  ' + r.logs.join('\n  '));
  if (mode === 'none') await r.page.screenshot({ path: join(root, 'tools/scratch/artifact-check.png') });
  if (mode === 'full') await r.page.screenshot({ path: join(root, 'tools/scratch/artifact-check-pvp.png') });
  await r.ctx.close();
  results.push(ok);
}
await browser.close();
const pass = results.every(Boolean);
console.log(pass ? 'artifact-check: PASS (no errors)' : 'artifact-check: FAIL');
process.exit(pass ? 0 : 1);

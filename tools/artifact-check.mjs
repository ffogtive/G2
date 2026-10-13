// 아티팩트 버전 재현 테스트: jsDelivr 요청을 node_modules 로 돌려주고, 아티팩트 스켈레톤과 같은 형태로 감싸서 부팅 확인.
// 사용: PW=$(npm root -g)/playwright node tools/artifact-check.mjs [dist/puff-artifact.html]
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(root, 'dist/puff-artifact.html');
const body = readFileSync(src, 'utf8');
const wrapped = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const tmp = join(root, 'tools/scratch/_artifact-wrapped.html');
writeFileSync(tmp, wrapped);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await page.route('https://cdn.jsdelivr.net/**', (route) => {
  const u = new URL(route.request().url());
  const m = u.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/);
  const file = m && join(root, 'node_modules', m[1], m[2]);
  if (file && existsSync(file)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(file) });
  logs.push('[404] ' + u.pathname);
  return route.fulfill({ status: 404, body: 'not found' });
});
await page.goto('file://' + tmp);
await page.waitForTimeout(6000);
const homeShown = await page.$eval('#home', (e) => !e.hidden).catch(() => false);
const bootMsg = await page.$eval('#bootMsg', (e) => e.textContent).catch(() => '?');
// PvP(P0.5a): ?pvplocal 이 없고 claude capability 도 아직 안 씀 → PvP 버튼은 숨어 있어야 한다(혼자서도 다 돈다)
const pvpHidden = await page.$eval('#pvpBtn', (e) => e.hidden).catch(() => false);
console.log('home shown:', homeShown, '| boot msg:', bootMsg, '| PvP button hidden:', pvpHidden);
if (homeShown && process.env.PLAY) {
  await page.click('#playBtn');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (await page.$eval('#rps', (e) => !e.hidden && !e.querySelector('button').disabled)) await page.click('#rps button[data-h="rock"]');
    if (await page.$eval('#hint', (e) => !e.hidden)) break;
  }
  const st = await page.evaluate(() => window.__puff());
  console.log('in match:', JSON.stringify({ state: st.state, live: st.live, turn: st.turn }));
}
console.log(logs.join('\n') || 'no errors');
await page.screenshot({ path: join(root, 'tools/scratch/artifact-check.png') });
await browser.close();
process.exit(homeShown && pvpHidden ? 0 : 1);

// B 시제품 데모를 이 컨테이너(맥·GPU 없음)에서 '눈으로' 확인하는 길: flutter_scene 의 WebGL2 백엔드로 웹 빌드 →
// 헤드리스 Chromium(SwiftShader, CPU 렌더) → 누르고 당겼다 놓는 시나리오 화면 찍기.
//   PW=$(npm root -g)/playwright node app/tool/web_check.mjs [출력 폴더]
// ⚠ 여기서 재는 FPS 는 CPU 렌더라 의미 없다(실기기 Metal 과 무관). 보는 것: 장면이 뜨는가 · 좌우/그림이 거울로 안 뒤집혔나 ·
//   조준 광선이 맞는 층을 고르나 · 볼 오버레이 · 녹화 재생 끝 판정이 웹 판정과 같은가(화면 아래 줄).
// app/ 에 web 플랫폼 폴더를 만들지 않으려고 임시 폴더에 lib·assets·pubspec 만 복사해 `flutter create --platforms web` 한다.
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(process.argv[2] || join(tmpdir(), 'puff-native-webcheck'));
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'puff-native-web-'));
const sh = (cmd, cwd = work) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env } });
const flutter = existsSync('/opt/flutter-sdk/flutter/bin/flutter') ? '/opt/flutter-sdk/flutter/bin/flutter' : 'flutter';

console.log('작업 폴더', work);
sh(`tar -C "${app}" --exclude=./assets/www -cf - lib assets pubspec.yaml pubspec.lock analysis_options.yaml | tar -xf -`);
mkdirSync(join(work, 'assets/www'), { recursive: true });
writeFileSync(join(work, 'assets/www/index.html'), '<html></html>'); // 웹뷰 게임 묶음 자리(데모는 안 씀)
sh(`${flutter} create . --platforms web --project-name puff >/dev/null`);
sh(`${flutter} build web -t lib/native/demo_main.dart --release --no-web-resources-cdn`);

const root = join(work, 'build/web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf', '.bin': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const exe = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(existsSync);
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ko-KR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /boot failed/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
const snap = async (name) => { await page.screenshot({ path: join(out, name), timeout: 240000 }); console.log('→', join(out, name)); };
await page.waitForTimeout(+(process.env.READY_MS || 60000)); // CPU 렌더라 장면 준비에 수십 초
await snap('0-ready.png');
// 위에서 2~3장째 가운데를 누르고(초록 숨 ×0.9 만큼) 당겼다 놓기 → 'green' 녹화
const [x, y, dy] = [195, +(process.env.PRESS_Y || 360), 140];
await page.mouse.move(x, y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + (dy * i) / 8); await page.waitForTimeout(60); }
await page.waitForTimeout(400);
await snap('1-pull.png');
await page.mouse.up();
await page.waitForTimeout(+(process.env.END_MS || 3000));
await snap('2-end.png');
await browser.close();
server.close();
if (errors.length) { console.log('콘솔 오류:\n' + errors.join('\n')); process.exitCode = 1; }
console.log('끝. 화면 아래 줄의 "뒤집힘 N장 · 원 밖 M장 (웹 판정 a·b)" 가 같으면 재생·판정 일치');

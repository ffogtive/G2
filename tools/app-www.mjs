// app-www.mjs — 앱(Flutter) 에셋 만들기: dist/puff.html(오프라인 단일 파일) + 앱 다리 코드(mockup/app/bridge.js) → app/assets/www/index.html
// 사용: npm run app:www  (= npm run build + 이 스크립트). 그다음 cd app && flutter run (docs/app/ios-local.md)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const SRC = process.argv[2] || 'dist/puff.html'; // 다른 곳에서 빌드한 게임 파일을 넣을 때: node tools/app-www.mjs <경로>
if (!existsSync(SRC)) { console.error(SRC + ' 이 없습니다 — 먼저 npm run build'); process.exit(1); }
const js = readFileSync('mockup/app/bridge.js', 'utf8').replace(/<\/script/gi, '<\\/script');
let html = readFileSync(SRC, 'utf8');
html = html.replace('<body>', () => `<body>\n<script>${js}</script>`); // 게임 스크립트보다 먼저
mkdirSync('app/assets/www', { recursive: true });
writeFileSync('app/assets/www/index.html', html);
console.log(`app/assets/www/index.html ${(html.length / 1024).toFixed(0)} KB`);

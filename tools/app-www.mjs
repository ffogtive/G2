// app-www.mjs — 앱(Capacitor) 웹 폴더 만들기: dist/puff.html(오프라인 단일 파일) + 앱 전용 접착 코드(mockup/app/native.js) → app/www/index.html
// 사용: npm run app:www  (= npm run build + 이 스크립트). npm run app:ios 는 이어서 npx cap sync ios
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as esbuild from 'esbuild';
if (!existsSync('dist/puff.html')) { console.error('dist/puff.html 이 없습니다 — 먼저 npm run build'); process.exit(1); }
const nat = await esbuild.build({ entryPoints: ['mockup/app/native.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
const js = nat.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = readFileSync('dist/puff.html', 'utf8');
// 게임 스크립트보다 먼저 실행되도록 <body> 바로 뒤에 넣는다
html = html.replace('<body>', () => `<body>\n<script>${js}</script>`);
mkdirSync('app/www', { recursive: true });
writeFileSync('app/www/index.html', html);
console.log(`app/www/index.html ${(html.length / 1024).toFixed(0)} KB (native.js ${(js.length / 1024).toFixed(1)} KB)`);

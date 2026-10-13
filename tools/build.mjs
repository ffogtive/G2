// build.mjs — 목업을 단일 HTML 두 벌로 묶는다.
//   dist/puff.html          : 완전 오프라인(라이브러리 인라인). 더블클릭으로 실행. 마이크 불기 지원.
//   dist/puff-artifact.html : claude.ai 아티팩트 게시용(라이브러리는 jsDelivr import map, 스켈레톤 태그 없음).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'mockup/src/main.js');
const tpl = readFileSync(join(root, 'mockup/index.html'), 'utf8');
mkdirSync(join(root, 'dist'), { recursive: true });

const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

// 효과음 샘플(일레븐랩스 등): mockup/assets/sfx/<이름>-<번호>.(mp3|ogg|wav) → window.__PUFF_SFX__ = { 이름: [데이터 URL…] }
// 없으면 audio.js 의 합성음을 쓴다
function sfxScript() {
  const dir = join(root, 'mockup/assets/sfx');
  if (!existsSync(dir)) return '';
  const map = {};
  for (const f of readdirSync(dir).sort()) {
    const m = /^([a-z]+)-?\d*\.(mp3|ogg|wav)$/i.exec(f);
    if (!m) continue;
    const mime = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' }[m[2].toLowerCase()];
    (map[m[1]] ||= []).push(`data:${mime};base64,${readFileSync(join(dir, f)).toString('base64')}`);
  }
  return Object.keys(map).length ? `<script>window.__PUFF_SFX__=${JSON.stringify(map)}</script>` : '';
}

async function build() {
  const sfx = sfxScript();
  const offline = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
  const offJs = offline.outputFiles[0].text;
  const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + tpl.replace('<!--APP-->', () => `${sfx}<script>${safe(offJs)}</script>`) + '\n</body>\n</html>\n';
  writeFileSync(join(root, 'dist/puff.html'), full);

  const art = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', minify: true, write: false, target: 'es2020', external: ['three', '@dimforge/rapier3d-compat'], legalComments: 'none' });
  const importmap = {
    imports: {
      three: 'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.min.js',
      'three/examples/jsm/': 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/',
      '@dimforge/rapier3d-compat': 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js',
    },
  };
  // 재발 방지: 번들에 남은 bare import 가 import map 으로 풀리지 않으면 빌드 실패 (2026-10-12 아티팩트 부팅 멈춤 사고)
  const keys = Object.keys(importmap.imports);
  const bare = [...art.outputFiles[0].text.matchAll(/(?:from|import)\s*\(?\s*["']([^"'./][^"']*)["']/g)].map((m) => m[1]);
  const unresolved = [...new Set(bare)].filter((spec) => !keys.some((k) => (k.endsWith('/') ? spec.startsWith(k) : spec === k)));
  if (unresolved.length) throw new Error('import map 에 없는 모듈: ' + unresolved.join(', '));
  const artHtml = tpl.replace('<!--APP-->', () => `${sfx}<script type="importmap">${JSON.stringify(importmap)}</script>\n<script type="module">${safe(art.outputFiles[0].text)}</script>`);
  writeFileSync(join(root, 'dist/puff-artifact.html'), artHtml);
  console.log(`built dist/puff.html (${(full.length / 1024).toFixed(0)} KB), dist/puff-artifact.html (${(artHtml.length / 1024).toFixed(0)} KB)`);
}

await build();

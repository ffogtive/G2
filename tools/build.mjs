// build.mjs — 목업을 단일 HTML 두 벌로 묶는다.
//   dist/puff.html          : 완전 오프라인(라이브러리 인라인). 더블클릭으로 실행. 마이크 불기 지원.
//   dist/puff-artifact.html : claude.ai 아티팩트 게시용(라이브러리는 jsDelivr import map, 스켈레톤 태그 없음).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'mockup/src/main.js');
const tpl = readFileSync(join(root, 'mockup/index.html'), 'utf8');
mkdirSync(join(root, 'dist'), { recursive: true });

const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

async function build() {
  const offline = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
  const offJs = offline.outputFiles[0].text;
  const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + tpl.replace('<!--APP-->', () => `<script>${safe(offJs)}</script>`) + '\n</body>\n</html>\n';
  writeFileSync(join(root, 'dist/puff.html'), full);

  const art = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', minify: true, write: false, target: 'es2020', external: ['three', '@dimforge/rapier3d-compat'], legalComments: 'none' });
  const importmap = {
    imports: {
      three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
      '@dimforge/rapier3d-compat': 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js',
    },
  };
  const artHtml = tpl.replace('<!--APP-->', () => `<script type="importmap">${JSON.stringify(importmap)}</script>\n<script type="module">${safe(art.outputFiles[0].text)}</script>`);
  writeFileSync(join(root, 'dist/puff-artifact.html'), artHtml);
  console.log(`built dist/puff.html (${(full.length / 1024).toFixed(0)} KB), dist/puff-artifact.html (${(artHtml.length / 1024).toFixed(0)} KB)`);
}

await build();

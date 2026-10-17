// artifact-host.mjs — 아티팩트 빌드를 '게시된 것처럼' 띄우는 시험 도우미 (artifact-check·pvp-check 공용)
//   wrapArtifact(): dist/puff-artifact.html 을 아티팩트 스켈레톤과 같은 형태로 감싼 파일 경로
//   routeCdn(target): jsDelivr 요청을 node_modules 로 돌려준다(오프라인 재현)
//   fakeClaude(cfg): 가짜 claude.ai 호스트(tools/fake-claude.js 를 묶은 init script 문자열). cfg = { mode, delay, lag }
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function wrapArtifact(src = join(root, 'dist/puff-artifact.html'), out = join(root, 'tools/scratch/_artifact-wrapped.html')) {
  const body = readFileSync(src, 'utf8');
  const wrapped = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, wrapped);
  return out;
}

export async function routeCdn(target, logs = []) {
  await target.route('https://cdn.jsdelivr.net/**', (route) => {
    const u = new URL(route.request().url());
    const m = u.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.*)$/);
    const file = m && join(root, 'node_modules', m[1], m[2]);
    if (file && existsSync(file)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(file) });
    logs.push('[404] ' + u.pathname);
    return route.fulfill({ status: 404, body: 'not found' });
  });
}

let bundled = null;
export async function fakeClaude(cfg = {}) {
  if (!bundled) {
    const r = await esbuild.build({ entryPoints: [join(root, 'tools/fake-claude.js')], bundle: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
    bundled = r.outputFiles[0].text;
  }
  return `window.__FAKE_CLAUDE__=${JSON.stringify(cfg)};\n${bundled}`;
}

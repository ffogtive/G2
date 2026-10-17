// 숨 해석(rules.js resolveShot) · gauss 의 JS 표본 → app/test/fixtures/resolve_js.json
// Dart 포팅(app/lib/native/rules.dart resolveShot + detmath.dart)이 웹 게임과 비트 단위로 같은지 test/native_resolve_test.dart 가 본다.
//   node app/tool/make_resolve_fixture.mjs      (저장소 뿌리에서. mockup/src/*.js 는 읽기만)
// JSON 숫자는 최단 왕복 표기라 Dart double.parse 가 같은 비트를 되살린다(−0 은 안 쓴다).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../mockup/src/sim.js';
import { resolveShot, gauss, sweetHiFor, physSweetFor } from '../../mockup/src/rules.js';

const gen = mulberry32(2026);
const cases = [];
for (let i = 0; i < 500; i++) {
  const n = 1 + Math.floor(gen() * 40);
  const top = 0.1 + gen() * 3;
  const lat = +(gen() * 1.8 - 0.9).toFixed(6) || 0.25;
  const h = +(gen() * top).toFixed(6) || 0.05;
  const hi = sweetHiFor(n);
  // 절반은 넘치는 숨(돌풍 + gauss 흔들림), 나머지는 약함~초록
  const power = i % 2 ? hi * (1 + gen() * 0.6) : gen() * hi;
  const seed = Math.floor(gen() * 4294967296) >>> 0;
  const rng = mulberry32(seed);
  const r = resolveShot({ h, lat, power }, n, top, rng);
  cases.push({ n, top, lat, h, power, seed, out: { lat: r.lat, h: r.h, power: r.power, ratio: r.ratio, blast: r.blast, over: !!r.over }, next: rng() });
}
const g = mulberry32(7);
const gs = Array.from({ length: 2000 }, () => gauss(g));
const sweet = Array.from({ length: 41 }, (_, n) => [sweetHiFor(n), physSweetFor(n)]);
const out = fileURLToPath(new URL('../test/fixtures/resolve_js.json', import.meta.url));
writeFileSync(out, JSON.stringify({ note: 'node app/tool/make_resolve_fixture.mjs — rules.js resolveShot·gauss 표본', cases, gauss7: gs, sweet }));
console.log(`${out}: ${cases.length} 샷 · gauss ${gs.length} · over ${cases.filter((c) => c.out.over).length}`);

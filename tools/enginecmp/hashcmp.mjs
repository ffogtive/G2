// hashcmp.mjs — 같은 판을 Jolt WASM(JS 어댑터)과 네이티브 벤치(들)에서 돌려 60스텝마다 상태 해시를 비교한다.
//   node hashcmp.mjs [--n 30] [--h 0.11] [--seed 1] [--steps 976] [--cfg '{"preset":"jolt-fair"}'] [--native bin1,bin2,...] [--nojs]
//                    [--rnative rbin1,rbin2] [--rcfg '{"erp":0.26}']
//   --native  = native/jolt-bench joltbench (JS 어댑터의 Jolt 설정을 그대로 옮겨 넘김)
//   --rnative = native/rapier-bench rapier_bench (Rapier 0.36. 설정은 puff_sim 기본 = 게임 v1 짝, --rcfg 로 키 덮어쓰기)
//   bin 앞에 'qemu-aarch64-static:' 를 붙이면 그 에뮬레이터로 돈다.
// 출력: 줄마다 { who, final, msPerStep, firstDiff(기준 = 같은 엔진 무리의 첫 줄) }
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createWorld, addPileTo, normalizeParams } from './adapters/index.mjs';
import { makePile, pileToText, defaultShot, applyShotStep, handleOffDesk } from './adapters/common.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const n = +arg('n', 30), h = +arg('h', 0.11), seed = +arg('seed', 1), steps = +arg('steps', 976), every = +arg('every', 60);
const cfgIn = JSON.parse(arg('cfg', '{}'));
const cfg = cfgIn.preset || cfgIn.engine ? cfgIn : { engine: 'jolt', ...cfgIn };
const natives = (arg('native', '') || '').split(',').filter(Boolean);
const rnatives = (arg('rnative', '') || '').split(',').filter(Boolean);
const rcfg = JSON.parse(arg('rcfg', '{}'));

const pile = makePile({ n, seed, h });
const shot = defaultShot(pile);
mkdirSync('out', { recursive: true });
const pileFile = `out/pile-n${n}-h${h}-s${seed}.txt`;
writeFileSync(pileFile, pileToText(pile));

const rows = [];

if (!has('nojs')) {
  const w = await createWorld(cfg);
  w.addFloor();
  addPileTo(w, pile);
  const off = new Set();
  const hashes = [];
  const t0 = performance.now();
  for (let st = 0; st < steps; st++) {
    applyShotStep(w, shot, st);
    w.step();
    handleOffDesk(w, n, off);
    if ((st + 1) % every === 0) hashes.push(w.hashState());
  }
  const ms = (performance.now() - t0) / steps;
  rows.push({ fam: cfg.engine ?? w.engine, who: `${w.engine}-wasm(js)`, final: w.hashState(), msPerStep: +ms.toFixed(3), sleeping: w.sleepingCount(), off: off.size, hashes, combine: w.info().combine });
  w.destroy();
}

// 네이티브 인자 (adapters/index.mjs normalizeParams → bench.cpp 키)
const P = normalizeParams(cfg);
const J = P.jolt;
const nargs = {
  dt: P.dt, substeps: P.substeps, gravity: P.gravity, hh: h / 2, r: 1, vs: J.velocitySteps, ps: J.positionSteps, baumgarte: J.baumgarte,
  slop: J.penetrationSlop, spec: J.speculativeContactDistance, maxpen: J.maxPenetrationDistance, lct: J.linearCastThreshold,
  lcmp: J.linearCastMaxPenetration, mtol: J.manifoldTolerance, minrest: J.minVelocityForRestitution, cachepos: J.bodyPairCacheMaxDeltaPosition,
  preserve: J.contactPointPreserveLambdaMaxDist, crfrac: J.convexRadiusFrac, crmax: J.convexRadiusMax, split: J.useLargeIslandSplitter ? 1 : 0,
  sleep: P.sleep.enabled ? 1 : 0, sleepvel: P.sleep.pointVelocity, sleeptime: P.sleep.time, maxang: J.maxAngularVelocity, maxlin: J.maxLinearVelocity,
  ccd: P.ccd ? 1 : 0, combine: rows[0]?.combine === 'listener' ? 'average' : (P.combine === 'native' ? 'native' : 'material'),
  steps, hashEvery: every, shotStart: shot.start, shotSteps: shot.steps, lo: shot.lo, hi: shot.hi, lift: shot.lift, push: shot.push,
  mx: shot.mouth[0], my: shot.mouth[1], mz: shot.mouth[2], shield: shot.shield,
};
// 숫자는 JS 가 WASM 에 넘기는 double 그대로(최단 왕복 표기) → C++ atof 가 같은 double 을 읽는다
const argv = Object.entries(nargs).map(([k, v]) => `${k}=${v}`);
for (const spec of natives) {
  const [emu, bin] = spec.includes(':') ? spec.split(':') : [null, spec];
  const cmd = emu ? emu : bin;
  const a = emu ? [bin, pileFile, ...argv] : [pileFile, ...argv];
  const out = JSON.parse(execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 24 }));
  rows.push({ fam: 'jolt', who: spec, final: out.final, msPerStep: out.msPerStep, sleeping: out.sleeping, off: out.off, hashes: out.hashes, cpd: out.cpd });
}
// Rapier 네이티브: 판·샷은 같고, 솔버는 rapier_bench 기본(puff_sim 게임 v1 짝) + --rcfg
const rargs = Object.entries({
  dt: P.dt, substeps: P.substeps, gravity: P.gravity, hh: h / 2, r: 1, ccd: P.ccd ? 1 : 0, sleep: P.sleep.enabled ? 1 : 0,
  steps, hashEvery: every, shotStart: shot.start, shotSteps: shot.steps, lo: shot.lo, hi: shot.hi, lift: shot.lift, push: shot.push,
  mx: shot.mouth[0], my: shot.mouth[1], mz: shot.mouth[2], shield: shot.shield, ...rcfg,
}).map(([k, v]) => `${k}=${v}`);
for (const spec of rnatives) {
  const [emu, bin] = spec.includes(':') ? spec.split(':') : [null, spec];
  const out = JSON.parse(execFileSync(emu ?? bin, emu ? [bin, pileFile, ...rargs] : [pileFile, ...rargs], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  rows.push({ fam: 'rapier-native', who: spec, final: out.final, msPerStep: out.msPerStep, sleeping: out.sleeping, off: out.off, hashes: out.hashes, arch: out.arch });
}

const famBase = new Map();
for (const r of rows) {
  const fam = r.fam === 'rapier' ? 'rapier-js' : r.fam;
  if (!famBase.has(fam)) famBase.set(fam, r);
  const base = famBase.get(fam);
  let firstDiff = null;
  for (let i = 0; i < Math.max(base.hashes.length, r.hashes.length); i++) if (base.hashes[i] !== r.hashes[i]) { firstDiff = (i + 1) * every; break; }
  console.log(JSON.stringify({ who: r.who, cpd: r.cpd, arch: r.arch, final: r.final, sameAsFamilyFirst: firstDiff == null, firstDiffStep: firstDiff, msPerStep: r.msPerStep, sleeping: r.sleeping, off: r.off }));
}
if (has('verbose')) console.log(JSON.stringify({ joltArgs: argv.join(' '), rapierArgs: rargs.join(' ') }));

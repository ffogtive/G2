// tools/jetlagcheck.mjs — 실험 '바람 도달 시간'(jetLag, 06 §8.10 · BLOCKERS G12) 게임 이식 대조. 약 20초.
//
// 🧭 가설(확인 대상): mockup/src/sim.js 에 숨 하나짜리 인자로 옮긴 jetLag 는 사전 등록·판정에 쓴 연구 사본
//   tools/coresweep/simsweep.js(tune.jetLag, 상수 자세 경로)와 게임 경로에서 비트까지 같다. 안 넘기거나 0 이면 v1 과 비트까지 같다.
//   → 판가름 = 아래 (a)~(f) 가 모두 맞음. 하나라도 틀리면 게임 토글이 판정 통과한 모델이 아니다(토글을 내보내지 말 것).
//
// (a) 게임 경로 jetLag 0.02: sim.js blow({ ..., jetLag }) ≡ simsweep Table(tune { jetLag }) — 두 월드를 나란히 돌려 매 스텝 모든 딱지의
//     위치·회전(Object.is) + off 깃발, 숨 길이·판정 스텝·판정 결과까지. 기하 = turn.js fire()·react3 shotG 와 같음(정규 −z, 곡면 위 표적,
//     resolveShot 이 물리 세기·돌풍). 자세 eye(눈높이 blow 기본, dist 2.6) · low(책상 입 blowLip, mouthY LIP_MIN, 6장↑).
//     장수 1~22 · 설계 시드 361~390(판정에 안 쓴 시드) · 조준 높이·옆 · 숨 초록 0.89 + 숨 규칙(약함 0.6 · 돌풍 1.1 · 1.2, 조준 흔들림 난수까지)
// (a2) 게임 실제 경로의 변형(검토 반영 — (a) 는 정규 −z·기본 tune·LIP_MIN·숨 한 번뿐): 바람 방향(AI 맞은편 π · 0.65 · 3.6 rad),
//      바람 손잡이 ⚙ wind(main.js 새 Table 의 lift 519.59 × 0.6·1.35), 테이프(heavy) 딱지, 입 높이 mouthY 0.4·0.9, 무더기(heap),
//      같은 테이블에서 가져가기 + restack + settle(240) 뒤 두 번째 숨(게임 순서), 그 뒤 v1 숨에 air·lag 가 안 남음
// (b) 격자 다른 값(0.01 · 0.03) 몇 샷 — 연구 사본과 같은 코드 경로인지만(게임 토글은 0.02 만 받음)
// (c) jetLag 0 · 안 넘김 · undefined ≡ v1(sim.js 기존 경로) ≡ simsweep 키 없음
// (d) blowTable(반사 바람) + jetLag 거부 · 범위 밖 jetLag 거부 · PvP ShotRun 에 jetLag(입력·tune) 거부
// (e) 렌더러용 도달 정보(table.air)는 읽기만: 도달 스텝 전에는 숨 없는 쌍둥이와 매 스텝 같음 · arrivedT = 처음 바람이 처리된 스텝 · 예상 도달(aMin·jetLag)과 1스텝 안
// (f) 숨 길이 = puffDuration + 12·jetLag 스텝 수
import * as SW from './coresweep/simsweep.js';
import * as V1 from '../mockup/src/sim.js';
import * as Rules from '../mockup/src/rules.js';
import { ShotRun } from '../mockup/src/turn.js';

const J0 = 0.02; // 사전 등록이 고른 값(choice3.json)
const rng32 = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = (t) => t.liveDiscs().flatMap((d) => { const p = d.body.translation(), q = d.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, d.off ? 1 : 0]; });
const eq = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const thr = (f) => { try { f(); return false; } catch { return true; } };

// 게임 샷 준비(react3 shotG 와 같은 식). lagSW = simsweep 에 tune 으로, lagV1 = sim.js 에 숨 인자로
function mk(Mo, job, lagTune) {
  if (Mo.setDiscH) Mo.setDiscH(0.11);
  const t = new Mo.Table(job.seed * 7907 + job.n, lagTune ? { jetLag: lagTune } : {});
  t.addPile(Array.from({ length: job.n }, (_, i) => i));
  t.settle();
  return t;
}
function fire(t, job, lagArg) {
  const n = t.liveDiscs().length, top = t.columnTop();
  const ratio = job.ratio ?? 0.89;
  const rng = ratio > 1 ? rng32((Math.imul(job.seed, 7919) ^ Math.imul(job.n, 104729) ^ Math.round(ratio * 1000)) >>> 0) : () => { throw new Error('초록·약한 숨은 난수를 안 씀'); };
  const s = Rules.resolveShot({ h: top * job.hf, lat: job.lat, power: Rules.sweetHiFor(n) * ratio }, n, top, rng, 1);
  const D = { x: 0, z: -1 }, side = { x: -D.z, z: D.x }, c = t.pileCenter();
  const lat = clamp(s.lat || 0, -0.95 * V1.DISC_R, 0.95 * V1.DISC_R), back = Math.sqrt(V1.DISC_R * V1.DISC_R - lat * lat);
  const aim = { x: c.x - D.x * back + side.x * lat, y: s.h, z: c.z - D.z * back + side.z * lat };
  t.blow({ aim, dir: { x: D.x, z: D.z }, power: s.power, blast: s.blast || 0, ...(job.pose === 'low' ? { mouthY: Rules.mouthYFor('low') } : {}), ...(lagArg !== undefined ? { jetLag: lagArg } : {}) });
  return s;
}
// 두 월드를 나란히: 매 스텝 자세 비교, 판정까지. 반환 = { ok, steps, puffSteps, why }
function lockstep(A, B, job, { lagA, lagB } = {}) {
  fire(A, job, lagA); fire(B, job, lagB);
  if (!eq(snap(A), snap(B))) return { ok: false, why: 'blow 직후' };
  const ja = { n: 0, quiet: 0 }, jb = { n: 0, quiet: 0 };
  let k = 0, puffA = 0, puffB = 0;
  for (;;) {
    if (A.puff) puffA++;
    if (B.puff) puffB++;
    A.step(); B.step(); k++;
    if (!eq(snap(A), snap(B))) return { ok: false, why: `스텝 ${k} 자세` };
    const ea = A.stepJudge(ja), eb = B.stepJudge(jb);
    if (ea !== eb) return { ok: false, why: `스텝 ${k} 판정 시점` };
    if (ea) break;
  }
  const ra = A.judgeResult(), rb = B.judgeResult();
  const ids = (r) => JSON.stringify([r.flipped.map((d) => d.id), r.outs.map((d) => d.id)]);
  if (puffA !== puffB) return { ok: false, why: `숨 길이 ${puffA} ≠ ${puffB}` };
  if (ids(ra) !== ids(rb)) return { ok: false, why: '판정 결과' };
  return { ok: true, steps: k, puffSteps: puffA, flip: ra.flipped.length, out: ra.outs.length };
}

await SW.initPhysics();
await V1.initPhysics();
const out = [];
const t0 = Date.now();

// (a) 게임 경로 jetLag 0.02: sim.js(숨 인자) ≡ simsweep(tune)
{ let ok = 0, tot = 0; const fl = { v1: 0, j: 0 };
  const NS = [1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 20, 22];
  const AIMS = [[0.82, 0], [0.6, 0.4], [0.95, -0.4]];
  NS.forEach((n, i) => {
    for (const pose of ['eye', 'low']) {
      if (pose === 'low' && n < Rules.LOW_POSE_MIN_N) continue;
      for (let r = 0; r < 2; r++) {
        const seed = 361 + ((i * 7 + r * 13 + (pose === 'low' ? 5 : 0)) % 30);
        const [hf, lat] = AIMS[(i + r + (pose === 'low' ? 1 : 0)) % AIMS.length];
        const job = { n, seed, pose, hf, lat };
        const res = lockstep(mk(V1, job), mk(SW, job, J0), job, { lagA: J0 });
        tot++; if (res.ok) { ok++; fl.j += res.flip; } else console.log('  (a) 실패', job, res.why);
      }
    }
  });
  // 숨 규칙(약함·돌풍): 돌풍은 조준 흔들림 난수까지 같은 줄기
  for (const [n, ratio, seed] of [[4, 0.6, 362], [9, 1.1, 371], [14, 1.2, 377], [20, 1.2, 385], [22, 1.05, 390]]) {
    const job = { n, seed, pose: 'eye', hf: 0.82, lat: 0, ratio };
    const res = lockstep(mk(V1, job), mk(SW, job, J0), job, { lagA: J0 });
    tot++; if (res.ok) ok++; else console.log('  (a) 실패(숨 규칙)', job, res.why);
  }
  out.push([`(a) 게임 경로 jetLag ${J0}: sim.js(숨 인자) ≡ simsweep(tune) — 매 스텝 위치·회전 비트 동일 · 숨 길이 · 판정`, ok, tot]); }

// (a2) 게임 실제 경로의 변형
{ let ok = 0, tot = 0;
  const mk2 = (Mo, job, lag) => {
    if (Mo.setDiscH) Mo.setDiscH(0.11);
    const t = new Mo.Table(job.seed * 7907 + job.n, { lift: 519.59 * (job.wind ?? 1), ...(lag ? { jetLag: lag } : {}) });
    t.addPile(Array.from({ length: job.n }, (_, i) => i), { heavy: new Set(job.heavy || []), ...(job.mode ? { mode: job.mode } : {}) });
    t.settle();
    return t;
  };
  const shot2 = (t, job, k) => {
    const n = t.liveDiscs().length, top = t.columnTop(), ratio = job.ratio ?? 0.89;
    const rng = rng32((Math.imul(job.seed, 31) + k * 977 + Math.round(ratio * 1000)) >>> 0);
    const s = Rules.resolveShot({ h: top * job.hf, lat: job.lat, power: Rules.sweetHiFor(n) * ratio }, n, top, rng, 1);
    const th = job.th ?? 0, D = { x: Math.sin(th), z: -Math.cos(th) }, side = { x: -D.z, z: D.x }, c = t.pileCenter();
    const lat = clamp(s.lat || 0, -0.95 * V1.DISC_R, 0.95 * V1.DISC_R), back = Math.sqrt(V1.DISC_R * V1.DISC_R - lat * lat);
    return { aim: { x: c.x - D.x * back + side.x * lat, y: s.h, z: c.z - D.z * back + side.z * lat }, dir: { x: D.x, z: D.z }, power: s.power, blast: s.blast || 0, ...(job.mouthY != null ? { mouthY: job.mouthY } : {}) };
  };
  const run2 = (A, B, job, k) => { // A = sim.js(숨 인자), B = simsweep(tune)
    const sh = shot2(A, job, k);
    if (JSON.stringify(sh) !== JSON.stringify(shot2(B, job, k))) return 'shot 다름';
    A.blow({ ...sh, jetLag: J0 }); B.blow(sh);
    if (!eq(snap(A), snap(B))) return 'blow 직후';
    const ja = { n: 0, quiet: 0 }, jb = { n: 0, quiet: 0 };
    let st = 0, pa = 0, pb = 0;
    for (;;) {
      if (A.puff) pa++; if (B.puff) pb++;
      A.step(); B.step(); st++;
      if (!eq(snap(A), snap(B))) return `스텝 ${st}`;
      const ea = A.stepJudge(ja), eb = B.stepJudge(jb);
      if (ea !== eb) return '판정 시점';
      if (ea) break;
    }
    if (pa !== pb) return `숨 ${pa}≠${pb}`;
    return null;
  };
  const restack = (t) => { const r = t.judgeResult(); for (const d of r.flipped) t.remove(d); t.applyRestack(t.restackTargets({ x: 0, z: 0 })); t.settle(240); };
  for (const job of [
    { n: 5, seed: 382, th: Math.PI, hf: 0.82, lat: 0 }, // AI 맞은편
    { n: 7, seed: 383, th: 0.65, hf: 0.6, lat: 0.5, wind: 1.35 },
    { n: 9, seed: 384, th: 3.6, hf: 0.82, lat: 0, wind: 0.6, heavy: [0, 3, 7] },
    { n: 11, seed: 386, hf: 0.7, lat: 0, mode: 'heap' },
    { n: 12, seed: 387, hf: 0.82, lat: 0, mouthY: 0.4, th: 1.1 },
    { n: 14, seed: 388, hf: 0.82, lat: 0.6, mouthY: 0.9 },
    { n: 18, seed: 389, hf: 0.82, lat: 0, ratio: 1.2, th: 2.2, heavy: [17] },
  ]) {
    const A = mk2(V1, job), B = mk2(SW, job, J0);
    tot++; if (!eq(snap(A), snap(B))) { console.log('  (a2) 더미 다름', job); continue; }
    const r1 = run2(A, B, job, 0);
    if (r1) { console.log('  (a2) 1샷 실패', job, r1); continue; }
    ok++;
    restack(A); restack(B);
    if (!A.liveDiscs().length) continue;
    tot++;
    const r2 = eq(snap(A), snap(B)) ? run2(A, B, job, 1) : 'restack 다름';
    if (r2) { console.log('  (a2) restack 뒤 2샷 실패', job, r2); continue; }
    ok++;
    restack(A);
    if (A.liveDiscs().length) { tot++; A.blow(shot2(A, job, 2)); if (A.air === null && !A.puff.lag) ok++; else console.log('  (a2) v1 숨에 air·lag 남음', job); }
  }
  out.push([`(a2) 게임 변형(방향 π·0.65·3.6 · wind 0.6·1.35 · 테이프 · heap · mouthY 0.4·0.9 · 돌풍) + restack 뒤 2샷 + v1 숨 잔여 없음`, ok, tot]); }

// (b) 격자의 다른 값
{ let ok = 0, tot = 0;
  for (const L of [0.01, 0.03]) for (const [n, pose, seed] of [[5, 'eye', 364], [12, 'low', 368], [21, 'eye', 373]]) {
    const job = { n, seed, pose, hf: 0.82, lat: 0 };
    const res = lockstep(mk(V1, job), mk(SW, job, L), job, { lagA: L });
    tot++; if (res.ok) ok++; else console.log('  (b) 실패', L, job, res.why);
  }
  out.push(['(b) jetLag 0.01 · 0.03 도 같음(연구 격자 — 게임 토글은 0.02 만)', ok, tot]); }

// (c) jetLag 0 · 안 넘김 · undefined ≡ v1 ≡ simsweep 키 없음
{ let ok = 0, tot = 0;
  for (const [n, pose, seed, ratio] of [[1, 'eye', 365, undefined], [7, 'low', 366, undefined], [16, 'eye', 369, 1.2], [22, 'low', 380, undefined]]) {
    const job = { n, seed, pose, hf: 0.82, lat: 0.4, ...(ratio ? { ratio } : {}) };
    const a = lockstep(mk(V1, job), mk(V1, job), job, { lagA: 0 }); // 0 ≡ 안 넘김
    const b = lockstep(mk(V1, job), mk(V1, job), job, { lagA: undefined, lagB: undefined });
    const c = lockstep(mk(V1, job), mk(SW, job), job, { lagA: 0 }); // sim.js 0 ≡ simsweep 키 없음
    tot++; if (a.ok && b.ok && c.ok) ok++; else console.log('  (c) 실패', job, a.why, b.why, c.why);
  }
  { const job = { n: 8, seed: 370, pose: 'eye', hf: 0.82, lat: 0 }; const t = mk(V1, job); fire(t, job, 0); tot++; if (t.air === null && !t.puff.lag) ok++; }
  out.push(['(c) jetLag 0 · 안 넘김 ≡ v1 ≡ simsweep 키 없음 (0 이면 table.air 없음)', ok, tot]); }

// (d) 거부
{ let ok = 0, tot = 0;
  const job = { n: 8, seed: 371, pose: 'eye', hf: 0.82, lat: 0 };
  const scoop = (L) => { const t = mk(V1, job), c = t.pileCenter(); t.blow({ aim: { x: c.x, y: 0, z: c.z + 1.2 }, dir: { x: 0, z: -1 }, power: 0.9, tableScoop: { s: 0.5 }, jetLag: L }); for (let k = 0; k < 3; k++) t.step(); };
  tot++; if (thr(() => scoop(J0)) && !thr(() => scoop(undefined))) ok++; else console.log('  (d) blowTable');
  tot++; if (thr(() => fire(mk(V1, job), job, 0.2)) && thr(() => fire(mk(V1, job), job, -0.01)) && thr(() => fire(mk(V1, job), job, NaN)) && !thr(() => fire(mk(V1, job), job, 0.03))) ok++; else console.log('  (d) 범위');
  // PvP: ShotRun 은 jetLag 를 입력으로도 tune 으로도 못 받는다
  const seeds = { stack: 12345, puff: 777, beat: 1 };
  const ids = Array.from({ length: 10 }, (_, i) => i);
  const okRun = !thr(() => { const r = new ShotRun({ ids, seeds }); r.fire({ h: 0.6, lat: 0, power: 0.7 }); r.advance(); r.free(); });
  const inRef = thr(() => { const r = new ShotRun({ ids, seeds }); try { r.fire({ h: 0.6, lat: 0, power: 0.7, jetLag: J0 }); } finally { r.free(); } });
  const tuneRef = thr(() => new ShotRun({ ids, seeds, tune: { jetLag: J0 } }));
  tot++; if (okRun && inRef && tuneRef) ok++; else console.log('  (d) ShotRun', { okRun, inRef, tuneRef });
  out.push(['(d) blowTable+jetLag · 범위 밖 jetLag · PvP ShotRun(입력·tune) 거부', ok, tot]); }

// (e) 도달 정보는 읽기만 · 도달 전 무변화
{ let ok = 0, tot = 0;
  for (const [n, pose, seed] of [[1, 'eye', 375], [6, 'low', 376], [13, 'eye', 378], [22, 'low', 379]]) {
    const job = { n, seed, pose, hf: 0.82, lat: 0 };
    const a = mk(V1, job), b = mk(V1, job);
    fire(a, job, J0);
    const air = a.air, dt = a.T.dt;
    let k = 0, first = -1, pre = true, firstT = null;
    while (a.puff && first < 0) { const tBefore = a.puff.t; a.step(); k++; if (a.lastHits && a.lastHits.length) { first = k; firstT = tBefore; } else { b.step(); if (!eq(snap(a), snap(b))) pre = false; } }
    const expect = Math.ceil(air.aMin * J0 / dt - 1e-9) * dt; // 숨 시각이 aMin·jetLag 이상인 첫 스텝
    const near = Math.abs(air.arrivedT - expect) <= dt + 1e-12;
    const r = pre && first > 1 && air.arrivedT === firstT && near && air.at.size === a.liveDiscs().length && air.aMax >= air.aMin;
    tot++; if (r) ok++; else console.log('  (e) 실패', job, { pre, first, arrivedT: air.arrivedT, firstT, expect });
  }
  out.push(['(e) table.air 읽기만 · 도달 전 숨 없는 쌍둥이와 같음 · arrivedT = 첫 바람 스텝 ≈ aMin·jetLag', ok, tot]); }

// (f) 숨 길이
{ let ok = 0, tot = 0;
  for (const L of [0.01, J0, 0.03]) {
    const job = { n: 10, seed: 381, pose: 'eye', hf: 0.82, lat: 0 };
    const t = mk(V1, job); fire(t, job, L);
    let n = 0; while (t.puff) { t.step(); n++; }
    let tt = 0, want = 0; while (tt < t.T.puffDuration + L * 12) { want++; tt += t.T.dt; }
    tot++; if (n === want) ok++; else console.log('  (f) 실패', L, n, want);
  }
  out.push(['(f) 숨 길이 = puffDuration + 12·jetLag', ok, tot]); }

let all = true;
for (const [nm, ok, tot] of out) { console.log(`  ${nm}: ${ok}/${tot}`); if (ok !== tot) all = false; }
console.log(`jetlagcheck ${all ? '맞음' : '틀림'} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
if (!all) process.exitCode = 1;

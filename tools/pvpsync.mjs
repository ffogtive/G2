// pvpsync.mjs — PvP P0 게이트 (네트워크 없음). docs/design/items-pvp.md §2.1 '시험 방법 1'
// 사용: node tools/pvpsync.mjs [칸당 샷=40] [d 시드=8]      (PVP_D=0 이면 (d) 생략 — (d) 는 powercurve 와 같은 격자라 수 분)
//
// 🧭 가설: 쏜 사람이 심판(새 월드·턴별 시드·스텝 판정)이고 받는 쪽은 궤적만 재생하면, 같은 엔진끼리는 해시가 100% 같고
//          화면 끝 자세는 post 와 바이트 단위로 같다. 판가름 = 아래 (a)~(e) 가 전부 통과하는가.
//  (a) 크기: 20장 궤적 b64 p90 ≤ 11KB(문서), 평균은 문서식 '프레임 사이 0.002' 와 같은 표본에서 비교. room 조각 하나 ≤ 3,800B, blow ≤ 1KB
//  (b) 받는 쪽 재생 끝(조각 순서대로, 60Hz 화면 보간 포함) = post. 조각 하나를 빼면 db 궤적으로 이어서 = post
//  (c) 받는 쪽(별도 worker = 새 WASM 인스턴스, 받은 JSON 만 씀)이 같은 입력으로 새 월드에서 다시 시뮬 → 원값 해시·res·post 100% 같음
//  (d) 스텝 판정(stepJudge, PvP) vs 솔로·봇 판정(runUntilSettled): powercurve 격자에서 장수 분포가 그대로인가
//  (e) 미리 시뮬(simulate-ahead) 프레임 독립: advance(1)/(2)/(8) 로 쪼개 돌려도 기록이 바이트 단위로 같다 + 콩닥 30Hz 하위 스텝
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { initPhysics, Table, turnSeeds, mulberry32 } from '../mockup/src/sim.js';
import { ShotRun, TrackPlayer, TrackChunker, chunkTrack, jsonBytes, toB64, encodeState, hashBytes, BeatClock, runShot, pidOf, CHUNK_MAX } from '../mockup/src/turn.js';
import { sweetHiFor, resolveShot, gauss, LIP_MIN, POUCH_FULL, LOW_POSE_MIN_N } from '../mockup/src/rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

// ── 받는 쪽 (worker) ─────────────────────────────────
// 받는 것: 자기 매치 상태(ctx: matchSeed·g·turn·seat·남은 id) + room 으로 온 JSON 문자열들 + (조각이 빠졌을 때) db 샷 문서 궤적
function receive({ ctx, wire, drop, dbTrack }) {
  const seeds = turnSeeds(ctx.matchSeed, ctx.g, ctx.turn, ctx.seat);
  let player = null, blow = null, done = null, gap = false;
  for (const { topic, json } of wire) {
    const m = JSON.parse(json);
    if (topic === 'blow') { blow = m; player = new TrackPlayer(m.pre, { mirror: true }); }
    else if (topic === 'trk') { if (m.seq === drop || gap) continue; if (!player.push(m.b, m.f)) gap = true; }
    else if (topic === 'done') done = m;
  }
  const gotLive = player.received;
  let resumed = false;
  if (player.received < done.frames) { player.resume(dbTrack); resumed = true; }
  // 60Hz 화면: 프레임 사이 보간으로 끝까지 (mirror = 받는 쪽 화면 좌표)
  let tf = 0, draws = 0;
  while (!player.done || tf < done.frames) { tf += 0.5; player.poseAt(tf); draws++; }
  const end = player.endBytes();
  const mine = Table.fromTurnState(ctx.ids, seeds.stack);
  const preSame = toB64(encodeState(mine)) === blow.pre;
  // 뒤 검증: 같은 입력, 자기 새 월드
  const { record: v } = runShot({ ids: ctx.ids, seeds, input: blow.in });
  return {
    b: toB64(end) === done.post && hashBytes(end) === done.qhash,
    c: v.hash === done.hash && v.post === done.post && JSON.stringify(v.res) === JSON.stringify(done.res),
    preSame, gap, resumed, gotLive, draws,
  };
}
if (!isMainThread) {
  await initPhysics();
  parentPort.on('message', (m) => parentPort.postMessage({ id: m.id, ...receive(m) }));
} else {
  await main();
}

async function main() {
  await initPhysics();
  const K = +(process.argv[2] || 40), DS = +(process.argv[3] || 8);
  const t0 = Date.now();
  const workers = Array.from({ length: 2 }, () => new Worker(fileURLToPath(import.meta.url)));
  const pending = new Map();
  for (const w of workers) w.on('message', (r) => { pending.get(r.id)(r); pending.delete(r.id); });
  let wi = 0, nextId = 0;
  const send = (m) => new Promise((res) => { const id = nextId++; pending.set(id, res); workers[wi++ % workers.length].postMessage({ id, ...m }); });

  // 쏜 사람: 학습자 봇 분포(botlib learner: 높이 0.82±0.12, 좌우 ±0.25, 숨 0.89±0.15) + 섞인 판(중간 판·책상 입·돌풍·약한 숨·끝 옆)
  const matchSeed = 0x5eed1234;
  const shots = [];
  let turnNo = 0;
  const mk = (kind, ids, rng, opts = {}) => {
    const turn = turnNo++, g = turn % 3, seat = turn % 2 ? 'b' : 'a';
    const seeds = turnSeeds(matchSeed, g, turn, seat);
    const top = Table.fromTurnState(ids, seeds.stack).columnTop(); // 쏜 사람 화면의 더미(같은 새 월드) 꼭대기
    const n = ids.length;
    const ratio = opts.ratio ?? clamp(0.89 + gauss(rng) * 0.15, 0.2, 1.3);
    const power = sweetHiFor(n) * ratio;
    const input = { h: clamp(top * (opts.hf ?? 0.82 + gauss(rng) * 0.12), 0.03, top), lat: clamp(opts.lat ?? gauss(rng) * 0.25, -0.9, 0.9), power, eff: power, mode: 'fun', beat: 1, item: 0, auto: 0 };
    if (opts.low) input.mouthY = LIP_MIN;
    shots.push({ kind, ctx: { matchSeed, g, turn, seat, ids }, input, seeds });
  };
  for (const n of [10, 20, 40]) for (let k = 0; k < K; k++) mk('full' + n, Array.from({ length: n }, (_, i) => i), mulberry32(1000 + k * 7919 + n));
  for (let k = 0; k < K; k++) {
    const rng = mulberry32(5000 + k * 104729);
    const all = Array.from({ length: 40 }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const m = 1 + Math.floor(rng() * 20);
    const ids = all.slice(0, m).sort((a, b) => a - b); // 중간 판: 듬성듬성한 판 id
    const v = k % 5;
    mk('mid', ids, rng, v === 0 ? { ratio: 1.05 + rng() * 0.25 } : v === 1 ? { ratio: 0.4 + rng() * 0.35 } : v === 2 ? { lat: (rng() < 0.5 ? -1 : 1) * 0.9, hf: 0.5 + rng() * 0.5 } : v === 3 && m >= LOW_POSE_MIN_N ? { low: true, hf: 0.3 + rng() * 0.5 } : {});
  }

  // 쏜 사람: 녹화 → 보낼 메시지(JSON) — room 주제 blow / trk / done, db 샷 문서
  const S = { trk: {}, blow: [], done: [], doc: {}, chunkMax: 0, chunkN: {}, docStyle: {}, simMs: {}, stackMs: {}, steps: {}, chunkWhole: {} };
  const results = [];
  const jobs = [];
  let prevHash = '00000000';
  for (const [i, s] of shots.entries()) {
    const tStart = performance.now();
    const run = new ShotRun({ ids: s.ctx.ids, seeds: s.seeds, input: s.input }); // 새 월드 쌓기·가라앉히기(턴 시작, 조준 전)
    const tShot = performance.now();
    // 미리 시뮬: 프레임당 8스텝 예산(20장 ≈ 8ms, 문서). 녹화되는 대로 조각에 흘려 넣고 8프레임(0.27초)마다 보낸다 = 받는 쪽 0.25초 뒤 재생 시작
    const t = `g${s.ctx.g}t${s.ctx.turn}`;
    const chunker = new TrackChunker(t, { max: CHUNK_MAX, maxFrames: 8 }), chunks = [];
    let fed = 0;
    while (!run.done) {
      run.advance(8);
      for (; fed < run.rec.frames.length; fed++) chunks.push(...chunker.add(run.rec.frames[fed]));
    }
    { const last = chunker.flush(); if (last) chunks.push(last); }
    const ms = performance.now() - tShot;
    // 한 번에 자른 조각(크기 상한만)과 흘려보낸 조각의 바이트 합이 같은가(조각 경계만 다르고 내용은 같아야 함)
    const whole = chunkTrack(run.rec.frames, t);
    (S.chunkWhole[s.kind] ||= []).push(whole.length);
    (S.stackMs[s.kind] ||= []).push(tShot - tStart);
    const rec = run.record;
    // 문서식 크기(프레임 사이 위치 0.002 넘게 움직인 딱지만, 비교용): 같은 샷을 다시 돌려 4스텝마다 잰다 — 결정론이라 같은 궤적(해시로 확인)
    if (s.kind.startsWith('full')) {
      const r2 = new ShotRun({ ids: s.ctx.ids, seeds: s.seeds, input: s.input });
      const prev = new Map(r2.table.liveDiscs().map((d) => [pidOf(d), { ...d.body.translation() }]));
      let docB = 0;
      while (!r2.done) {
        r2.advance(1);
        if (r2.steps % 4 === 0 || r2.done) {
          let c = 0;
          for (const d of r2.table.liveDiscs()) { const p = d.body.translation(), o = prev.get(pidOf(d)); if (Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y), Math.abs(p.z - o.z)) > 0.002) c++; prev.set(pidOf(d), { ...p }); }
          docB += 1 + c * 13;
        }
      }
      (S.docStyle[s.kind] ||= []).push(Math.ceil(docB / 3) * 4);
      if (r2.record.hash !== rec.hash) throw new Error('같은 프로세스 재실행 해시 불일치');
    }
    const blow = { t, in: s.input, pre: rec.pre };
    const done = { t, res: rec.res, post: rec.post, hash: rec.hash, qhash: rec.qhash, steps: rec.track.steps, frames: rec.track.frames };
    const doc = { v: 1, g: s.ctx.g, turn: s.ctx.turn, seat: s.ctx.seat, by: 'u_0123456789abcdef', simV: rec.simV, seeds: rec.seeds, in: rec.in, pre: rec.pre, post: rec.post, track: { hz: rec.track.hz, b: rec.track.b }, res: rec.res, score: { a: 7, b: 5 }, hash: rec.hash, prev: prevHash, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', at: 1760000000000 };
    prevHash = rec.hash.slice(0, 8);
    (S.trk[s.kind] ||= []).push(rec.track.b.length);
    (S.chunkN[s.kind] ||= []).push(chunks.length);
    (S.doc[s.kind] ||= []).push(jsonBytes(doc));
    (S.simMs[s.kind] ||= []).push(ms);
    (S.steps[s.kind] ||= []).push(rec.track.steps);
    S.blow.push(jsonBytes(blow));
    S.done.push(jsonBytes(done));
    for (const c of chunks) S.chunkMax = Math.max(S.chunkMax, jsonBytes(c));
    const wire = [{ topic: 'blow', json: JSON.stringify(blow) }, ...chunks.map((c) => ({ topic: 'trk', json: JSON.stringify(c) })), { topic: 'done', json: JSON.stringify(done) }];
    const drop = i % 5 === 4 && chunks.length >= 2 ? 1 : null; // 다섯 샷마다 조각 하나 빠짐 → db 로 이어서
    jobs.push(send({ ctx: s.ctx, wire, drop, dbTrack: rec.track.b }).then((r) => results.push({ kind: s.kind, drop, ...r })));
  }
  await Promise.all(jobs);
  for (const w of workers) await w.terminate();

  // (e) 미리 시뮬 프레임 독립: 같은 샷을 advance(1)/(2)/(8)/(∞) 로 → 기록 JSON 이 바이트 단위로 같은가
  let eSame = 0, eN = 0;
  for (const s of shots.filter((_, i) => i % 9 === 0)) {
    const recs = [1, 2, 8, Infinity].map((k) => { const r = new ShotRun({ ids: s.ctx.ids, seeds: s.seeds, input: s.input }); while (!r.advance(k)); return JSON.stringify(r.record); });
    eN++;
    if (recs.every((x) => x === recs[0])) eSame++;
  }
  // 콩닥 30Hz 하위 스텝: 60Hz·120Hz(흔들리는 프레임 간격)로 당기고 버티다 놓기 → 유효 숨이 같고, trace 로 다시 계산해도 같은가
  let beatSame = 0, beatReplay = 0, beatN = 0;
  for (let k = 0; k < 200; k++) {
    const rng = mulberry32(9000 + k);
    const tier = 1 + (k % 2), n = 1 + Math.floor(rng() * 20), seed = (rng() * 2 ** 32) >>> 0;
    const p = POUCH_FULL * (0.3 + rng() * 0.45); // 꽉의 0.8배 아래(꽉 근처는 박동 주기가 당긴 숨에 따라 바뀌어 당기는 도중 샘플이 갈린다)
    const ramp = 150 + rng() * 300, T = ramp + 200 + rng() * 2200;
    const pull = (t) => p * Math.min(1, t / ramp);
    const live = (hz) => {
      const c = new BeatClock(seed, tier, n), fr = mulberry32(seed ^ hz);
      let t = 0, eff = 0;
      while (t < T) { t = Math.min(T, t + (1000 / hz) * (0.8 + 0.4 * fr())); eff = c.to(t, pull(t)); }
      return { eff, trace: c.trace };
    };
    const a = live(60), b = live(120);
    beatN++;
    if (a.eff === b.eff) beatSame++;
    if (BeatClock.replay(seed, tier, n, a.trace) === a.eff && BeatClock.replay(seed, tier, n, b.trace) === b.eff) beatReplay++;
  }

  // ── 보고 ──
  const KB = (v) => (v / 1024).toFixed(1) + 'KB';
  console.log(`PvP P0 sync — 샷 ${shots.length} (칸당 ${K}), worker 2 (받는 쪽 = 새 WASM)\n`);
  console.log('(a) 크기 (궤적 = base64 문자 수 = 보내는 바이트)');
  for (const kind of ['full10', 'full20', 'full40', 'mid']) {
    const a = S.trk[kind];
    const ds = S.docStyle[kind];
    console.log(`  ${kind.padEnd(6)} 궤적 평균 ${KB(mean(a))} p90 ${KB(q(a, 0.9))} 최대 ${KB(Math.max(...a))}${ds ? ` | 문서식(프레임 사이 0.002) 평균 ${KB(mean(ds))} p90 ${KB(q(ds, 0.9))}` : ''} | 조각(8프레임씩 흘림) 평균 ${mean(S.chunkN[kind]).toFixed(1)}개 최대 ${Math.max(...S.chunkN[kind])} · 크기로만 자르면 평균 ${mean(S.chunkWhole[kind]).toFixed(1)}개 | 샷 문서 평균 ${KB(mean(S.doc[kind]))} p90 ${KB(q(S.doc[kind], 0.9))} | 판정 ${mean(S.steps[kind]).toFixed(0)}스텝(p90 ${q(S.steps[kind], 0.9)}) | 놓은 뒤 시뮬 ${mean(S.simMs[kind]).toFixed(0)}ms(p90 ${q(S.simMs[kind], 0.9).toFixed(0)}, 스텝당 ${(mean(S.simMs[kind]) / mean(S.steps[kind])).toFixed(2)}ms) · 턴 시작 쌓기 ${mean(S.stackMs[kind]).toFixed(0)}ms`);
  }
  console.log(`  room 조각 JSON 최대 ${S.chunkMax}B (상한 ${CHUNK_MAX}) | blow 최대 ${Math.max(...S.blow)}B (40장) | done 최대 ${Math.max(...S.done)}B`);
  const p90_20 = q(S.trk.full20, 0.9);
  const gateA = p90_20 <= 11 * 1024 && mean(S.trk.full20) <= mean(S.docStyle.full20) * 1.1 && S.chunkMax <= CHUNK_MAX && Math.max(...S.blow) <= 1024 && Math.max(...S.done) <= 4096;

  const nb = results.filter((r) => r.b).length, nc = results.filter((r) => r.c).length, np = results.filter((r) => r.preSame).length;
  const dropped = results.filter((r) => r.drop != null), resumedOk = dropped.filter((r) => r.resumed && r.b).length;
  console.log(`\n(b) 재생 끝 = post: ${nb}/${results.length}  (조각 빠짐 ${dropped.length}건 → db 궤적으로 이어서 ${resumedOk}/${dropped.length})`);
  console.log(`(c) 새 월드 재시뮬 해시·res·post 같음: ${nc}/${results.length}  | 받는 쪽 자기 새 월드 pre = 쏜 사람 pre: ${np}/${results.length}`);
  const gateB = nb === results.length && resumedOk === dropped.length;
  const gateC = nc === results.length && np === results.length;

  console.log(`(e) 미리 시뮬 advance(1/2/8/∞) 기록 동일: ${eSame}/${eN} | 콩닥 30Hz: 60Hz=120Hz 유효 숨 ${beatSame}/${beatN}, trace 재계산 = 실시간 ${beatReplay}/${beatN}`);
  const gateE = eSame === eN && beatSame === beatN && beatReplay === beatN;

  let gateD = true;
  if (process.env.PVP_D !== '0') gateD = powercurveJudge(DS);
  console.log(`\n게이트: (a) ${gateA ? '통과' : '실패'}  (b) ${gateB ? '통과' : '실패'}  (c) ${gateC ? '통과' : '실패'}  (d) ${process.env.PVP_D === '0' ? '생략' : gateD ? '통과' : '실패'}  (e) ${gateE ? '통과' : '실패'}   (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  process.exit(gateA && gateB && gateC && gateD && gateE ? 0 : 1);
}

// (d) powercurve.mjs 와 같은 격자·같은 샷: 솔로·봇 판정(runUntilSettled 4초) vs 스텝 판정(stepJudge). 위 줄은 powercurve 출력과 글자까지 같다
function powercurveJudge(S) {
  const Ns = [6, 12, 20], Hs = [0.95, 0.75, 0.5];
  const RATIOS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.05, 1.1, 1.2, 1.3];
  const mul = mulberry32;
  let cases = 0, sameF = 0, sameO = 0, worst = 0, stA = 0, stB = 0;
  console.log(`\n(d) powercurve ${S}시드: 위 = 솔로·봇 판정(runUntilSettled), 아래 = 스텝 판정(stepJudge)`);
  for (const n of Ns) for (const hf of Hs) {
    const ca = [], cb = [];
    for (const r of RATIOS) {
      let fa = 0, oa = 0, fb = 0, ob = 0;
      for (let s = 1; s <= S; s++) {
        const go = (judge) => {
          const t = new Table(s * 7907 + n);
          t.addPile(Array.from({ length: n }, (_, i) => i)); t.settle();
          const top = t.columnTop();
          const sh = resolveShot({ lat: 0, h: Math.max(0.03, top * hf), power: sweetHiFor(n) * r }, n, top, mul(s * 31 + n), 1);
          const c = t.pileCenter();
          t.blow({ aim: { x: c.x - Math.sqrt(1 - sh.lat * sh.lat), y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
          if (judge) { const j = { n: 0, quiet: 0 }; do t.step(); while (!t.stepJudge(j)); const res = t.judgeResult(); return { f: res.flipped.length, o: res.outs.length, steps: j.n }; }
          const res = t.runUntilSettled(4);
          return { f: res.flipped.length, o: t.liveDiscs().filter((d) => !t.inCircle(d)).length, steps: res.steps };
        };
        const a = go(false), b = go(true);
        fa += a.f; oa += a.o; fb += b.f; ob += b.o; cases++; stA += a.steps; stB += b.steps;
        if (a.f === b.f) sameF++;
        if (a.o === b.o) sameO++;
      }
      worst = Math.max(worst, Math.abs(fa - fb) / S, Math.abs(oa - ob) / S);
      ca.push(`${r.toFixed(2)}:${(fa / S).toFixed(1)}${oa ? '/out' + (oa / S).toFixed(1) : ''}`);
      cb.push(`${r.toFixed(2)}:${(fb / S).toFixed(1)}${ob ? '/out' + (ob / S).toFixed(1) : ''}`);
    }
    console.log(`n=${String(n).padStart(2)} aim=${hf} | ${ca.join('  ')}`);
    console.log(`           step | ${cb.join('  ')}`);
  }
  console.log(`  사례 ${cases}: 뒤집힌 장수 같음 ${sameF} (${((sameF / cases) * 100).toFixed(1)}%), 원 밖 같음 ${sameO} (${((sameO / cases) * 100).toFixed(1)}%), 칸 평균 차 최대 ${worst.toFixed(2)}장 | 판정까지 평균 ${(stA / cases).toFixed(0)} → ${(stB / cases).toFixed(0)}스텝`);
  return sameF / cases >= 0.97 && worst <= 0.5;
}

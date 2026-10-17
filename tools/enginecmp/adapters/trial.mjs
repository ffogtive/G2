// trial.mjs — 엔진 독립 한 판: 더미 쌓기 → 가라앉힘 → 합성 샷 → 스텝 판정(JUDGE)까지. 두 엔진·모든 설정이 같은 절차.
import { createWorld, addPileTo } from './index.mjs';
import { makePile, defaultShot, applyShotStep, handleOffDesk, judge, maxSpeedLive, JUDGE } from './common.mjs';

// cfg = createWorld 파라미터, o = { n, h, seed, gap, shot:{...}, props }
export async function runTrial(cfg, o = {}) {
  const n = o.n ?? 30, h = o.h ?? 0.11, seed = o.seed ?? 1;
  const w = await createWorld(cfg);
  const pile = makePile({ n, seed, h, gap: o.gap ?? 0.004 });
  w.addFloor(o.floor ?? {});
  addPileTo(w, pile, { props: o.props ?? {} });
  const shot = defaultShot(pile, o.shot ?? {});
  const off = new Set();
  const r = { n, h, seed };
  // 1) 가라앉힘: shot.start 스텝까지. 조용해진 첫 스텝(최대 속도 < 0.06 이 24스텝 연속)
  let quiet = 0, settleAt = null;
  const t0 = performance.now();
  for (let s = 0; s < shot.start; s++) {
    w.step();
    handleOffDesk(w, n, off);
    const ms = maxSpeedLive(w, n, off);
    quiet = ms < 0.06 ? quiet + 1 : 0;
    if (settleAt == null && quiet >= 24) settleAt = s + 1 - 24;
  }
  const tSettle = performance.now() - t0;
  let top = 0, bottom = Infinity;
  for (let i = 0; i < n; i++) { const y = w.getPose(i).p.y; top = Math.max(top, y + h / 2); bottom = Math.min(bottom, y); }
  r.settle = {
    quietStep: settleAt, heightRatio: +(top / (n * h)).toFixed(4), floorPen: +(h / 2 - bottom).toFixed(4),
    restSpeed: +maxSpeedLive(w, n, off).toFixed(4), sleeping: w.sleepingCount(), msPerStep: +(tSettle / shot.start).toFixed(3),
    hash: w.hashState(),
  };
  // 2) 샷 + 스텝 판정
  const j = { n: 0, quiet: 0, strict: 0 };
  let judgeAt = null, s = shot.start, shielded = 0;
  const t1 = performance.now();
  const maxPost = shot.steps + JUDGE.maxSteps;
  for (let k = 0; k < maxPost; k++, s++) {
    shielded += applyShotStep(w, shot, s);
    w.step();
    handleOffDesk(w, n, off);
    if (k >= shot.steps) {
      j.n++;
      const ms = maxSpeedLive(w, n, off);
      const ok = j.n > JUDGE.minSteps && (ms < JUDGE.eps || (j.n > JUDGE.lateSteps && ms < JUDGE.lateEps));
      j.quiet = ok ? j.quiet + 1 : 0;
      j.strict = j.n > JUDGE.minSteps && ms < JUDGE.eps ? j.strict + 1 : 0;
      if (j.quiet > JUDGE.quietSteps || j.n >= JUDGE.maxSteps) { judgeAt = j.n; break; }
    }
  }
  const tPost = performance.now() - t1;
  const res = judge(w, n, off);
  r.shot = {
    judgeSteps: judgeAt, capped: judgeAt >= JUDGE.maxSteps,
    // quiet = 진짜 멈춤(<0.08), late = 2.5초 뒤 느슨한 문턱(<0.5)으로 통과(기어가는 중), cap = 5초 상한
    judgeKind: judgeAt >= JUDGE.maxSteps ? 'cap' : j.strict > JUDGE.quietSteps ? 'quiet' : 'late',
    flipped: res.flipped, outs: res.outs, offDesk: off.size, shielded,
    endSpeed: +maxSpeedLive(w, n, off).toFixed(4), sleeping: w.sleepingCount(), msPerStep: +(tPost / Math.max(1, s - shot.start)).toFixed(3),
    hash: w.hashState(),
  };
  r.info = w.info();
  w.destroy();
  return r;
}

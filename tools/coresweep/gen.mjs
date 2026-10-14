// gen.mjs — 코어 쓸기 측정의 작업 목록(jobs_*.json)을 만든다. 사용: node tools/coresweep/gen.mjs <p1|p2|p2b|c|t> > jobs.json
//   돌리기: node tools/coresweep/run.mjs jobs.json out.jsonl 2   (2 일꾼, 이어 돌리기 가능)
//   보기:   GRP=1 BASEKEY='c|fix|q0.7' node tools/coresweep/anab.mjs out_c.jsonl  /  node tools/coresweep/ana2.mjs out_p2.jsonl
//           node tools/coresweep/pair.mjs out_c.jsonl 'c|fix|q0.93' 'c|w40|q0.7|t0.25' 30
// 시드: p0·p1 1~8(고르기), p2·p2b 101~116, c 201~248(확인, 미리 정한 칸), t 301~316(얇은 딱지)
const ph = process.argv[2];
const jobs = [];
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const P = (D) => ({ kind: 'pueok', D });
if (ph === 'p0') for (const n of [5, 10, 20, 30]) for (const b of [['puff', 0], ['pueok', 0.6], ['pueok', 1.0], ['pueok', 1.5]]) for (const q of [0.4, 0.55, 0.7, 0.85, 0.93]) for (const s of R(1, 8)) jobs.push({ key: `p0|${b[0]}${b[1]}|q${q}`, n, seed: s, breath: { kind: b[0], D: b[1] }, q, kin: 'c', sweep: {} });
if (ph === 'p1') for (const n of [5, 10, 20, 30]) {
  for (const D of [0.6, 1.0]) for (const q of [0.55, 0.7, 0.85]) {
    const cells = [{ A: 0, w: 0, t0: 0 }];
    for (const A of [4, 8, 15, 30]) for (const w of [15, 40, 120]) for (const t0 of [0, 0.25]) cells.push({ A, w, t0 });
    for (const c of cells) for (const s of R(1, 8)) jobs.push({ key: `p1|D${D}|q${q}|A${c.A}|w${c.w}|t${c.t0}`, n, seed: s, breath: P(D), q, kin: 'c', sweep: c });
  }
  for (const A of [0, 8, 15]) for (const s of R(1, 8)) jobs.push({ key: `p1|puff|q0.93|A${A}|w120|t0`, n, seed: s, breath: { kind: 'puff' }, q: 0.93, kin: 'c', sweep: { A, w: 120, t0: 0 } });
}
if (ph === 'p2') for (const n of [10, 20, 30]) for (const s of R(101, 116)) {
  for (const D of [0.45, 0.6, 1.0]) for (const q of [0.55, 0.7, 0.85, 0.93]) jobs.push({ key: `p2|D${D}|q${q}|A0|w0|t0`, n, seed: s, breath: P(D), q, kin: 'c', sweep: {} });
  for (const q of [0.55, 0.7, 0.85]) for (const t0 of [0.1, 0.2, 0.3, 0.4]) for (const w of [15, 40, 120]) for (const A of [4, 8]) jobs.push({ key: `p2|D0.6|q${q}|A${A}|w${w}|t${t0}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: { A, w, t0 } });
}
if (ph === 'p2b') for (const n of [20, 30]) for (const s of R(101, 116)) {
  for (const [D, q] of [[0.6, 0.7], [1.0, 0.85], [0.6, 0.55]]) {
    const b = P(D);
    jobs.push({ key: `d|D${D}|q${q}|fixLow`, n, seed: s, breath: b, q, kin: 'c', sweep: {} });
    for (const ym of [0.9, 1.3]) jobs.push({ key: `d|D${D}|q${q}|fixHigh${ym}`, n, seed: s, breath: b, q, kin: 'c', sweep: {}, geo: { ym } });
    for (const kin of ['c', 'a', 'b']) for (const t0 of [0.25, 0.3]) jobs.push({ key: `d|D${D}|q${q}|kin${kin}|t${t0}`, n, seed: s, breath: b, q, kin, sweep: { A: 8, w: 40, t0 } });
    jobs.push({ key: `d|D${D}|q${q}|L1.6fix`, n, seed: s, breath: b, q, kin: 'c', sweep: {}, geo: { L: 1.6 } });
    for (const A of [8, 20]) jobs.push({ key: `d|D${D}|q${q}|L1.6A${A}`, n, seed: s, breath: b, q, kin: 'c', sweep: { A, w: 40, t0: 0.25 }, geo: { L: 1.6 } });
    for (const A of [8, 20]) jobs.push({ key: `d|D${D}|q${q}|chinA${A}`, n, seed: s, breath: b, q, kin: 'c', sweep: { A, w: 40, t0: 0.25 }, geo: { PY: -1.6, PZ: 0.6 } });
  }
  for (const g of [0.1, 0.25, 0.4, 0.6]) jobs.push({ key: `d|pulse0.3+${g}+0.3|q0.7|two`, n, seed: s, breath: { kind: 'pulse2', D: [0.3, g, 0.3] }, q: 0.7, kin: 'c', sweep: {} });
  jobs.push({ key: `d|pulse0.3|q0.7|one`, n, seed: s, breath: { kind: 'pulse2', D: [0.3, 0, 0] }, q: 0.7, kin: 'c', sweep: {} });
}
const conf = (pre, seeds, ns, extra = {}) => { for (const n of ns) for (const s of seeds) {
  for (const q of [0.55, 0.7, 0.85, 0.93]) jobs.push({ key: `${pre}|fix|q${q}`, n, seed: s, breath: P(0.6), q, kin: 'c', sweep: {}, ...extra });
  for (const t0 of pre === 'c' ? [0.05, 0.15, 0.25, 0.35, 0.45] : [0.05, 0.25, 0.45]) jobs.push({ key: `${pre}|w40|q0.7|t${t0}`, n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 40, t0 }, ...extra });
  if (pre === 'c') for (const t0 of [0.25, 0.35]) jobs.push({ key: `c|w40|q0.85|t${t0}`, n, seed: s, breath: P(0.6), q: 0.85, kin: 'c', sweep: { A: 8, w: 40, t0 } });
  jobs.push({ key: `${pre}|w120|q0.7|t0.3`, n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 120, t0: 0.3 }, ...extra });
  if (pre === 'c') jobs.push({ key: `c|w15|q0.7|t0.1`, n, seed: s, breath: P(0.6), q: 0.7, kin: 'c', sweep: { A: 8, w: 15, t0: 0.1 } });
  if (pre === 't') jobs.push({ key: `t|puff|q0.93`, n, seed: s, breath: { kind: 'puff' }, q: 0.93, kin: 'c', sweep: {}, ...extra });
} };
if (ph === 'c') conf('c', R(201, 248), [5, 10, 20, 30]);
if (ph === 't') conf('t', R(301, 316), [10, 20, 30], { H: 0.04, tune: { erp: 0.8, dt: 1 / 240 } });
process.stdout.write(JSON.stringify(jobs));

// tools/balloon-check.mjs — rules.js 숨 풍선(BALLOON·balloonCost·balloonStep·balloonRefill)이 기준 구현 econ.mjs 와 같은가.
// 설계서: docs/design/core-sweep.md §6.3 · §9 3번 (재윤님 §10-3 '오케이', 2026-10-15)
//
// 🧭 가설: rules.js 의 풍선 식은 econ.mjs 'new' 규칙(1,6,0,0.5,2@6,1,3)과 비트까지 같고, 그 수치로 econ gate 네 판정을 넘는다.
//   틀렸다는 신호: 아래 ①~⑤ 중 하나라도 '실패' (종료 코드 1).
//
// ① 상수: BALLOON == econ RULES_DEF 'new' (econ 웃돈 식은 0.8·0.2 를 박아 두었으므로 taxFrom·taxSpan 도 확인)
// ② 비용 격자: q 0.50~1.25(0.01 간격) × D 0.130~1.000(0.001 간격) × 퍽/푸어억(econ 'fix'·'flick') — Object.is 로 비트 대조
//    + 원자료의 실제 D(장수별 보간값)
// ③ 풍선 상태: 손 계산 몇 개(가득·모자람·상한·0.1칸 정수)
// ④ DP 대조: econ solve 를 rules.js 의 balloonInit/balloonStep/balloonRefill/balloonCost 로 다시 짠 것이
//    20장·숨 2 / 30장·숨 3 / 45장·숨 3 × 3판(쉬기 허용·금지)에서 값·계획이 econ 과 같다 → 차례마다 +1 · 3판 이음의 뜻까지 같다
// ⑤ 게이트: `node tools/coresweep/econ.mjs gate <원자료>` 를 BALLOON 수치(RULES)로 돌려 네 판정 모두 통과
//
// 명령: node tools/balloon-check.mjs            (1초 안쪽. 숨 풍선 식·econ.mjs 를 바꾸면 필수)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../mockup/src/rules.js';
import { cost, parseRules, RULES_DEF, load, summarize, solve, interp, judge } from './coresweep/econ.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['tools/coresweep/data/vf/chk601.jsonl.gz', 'tools/coresweep/data/f2/econ601.jsonl.gz'];
const FILES = DATA.map((f) => join(root, f)).join(',');
const BOARDS = [[20, 2], [30, 3], [45, 3]]; // econ 기본 판(levels.js 숨 2~3번)
const B = R.BALLOON;

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '통과' : '실패'} ${msg}`); if (!cond) fails++; };

// ① 상수
console.log('① 상수: rules.js BALLOON == econ.mjs RULES_DEF new');
const NEW = parseRules(RULES_DEF).find((r) => r.name === 'new');
ok(NEW && NEW.a === B.base && NEW.b === B.perSec && NEW.p === 0 && NEW.P === B.puck && NEW.k === B.tax && !NEW.all,
  `비용: 퍽 ${B.puck} · 푸어억 ${B.base} + ${B.perSec}·D + ${B.tax}·((q−${B.taxFrom})₊/${B.taxSpan})²  (econ: a ${NEW?.a}, b ${NEW?.b}, p ${NEW?.p}, P ${NEW?.P}, k ${NEW?.k}, all ${NEW?.all})`);
ok(NEW?.env && NEW.env.BAL === B.max && NEW.env.REG === B.regen && NEW.env.K === B.rounds,
  `풍선: ${B.max}칸 · 차례마다 +${B.regen} · ${B.rounds}판 이음  (econ: ${NEW?.env?.BAL}·+${NEW?.env?.REG}·K ${NEW?.env?.K})`);
ok(B.taxFrom === 0.8 && B.taxSpan === 0.2, `웃돈 시작 ${B.taxFrom}·폭 ${B.taxSpan} = econ cost() 에 박힌 0.8·0.2`);
ok(Object.isFrozen(B), 'BALLOON 은 얼려 있다(게임 중 실수로 바꾸지 못함)');

// ② 비용 격자
console.log('② 비용 격자: rules.js balloonCost ≡ econ cost(new) (Object.is)');
let n = 0, bad = [];
const cmp = (q, D) => {
  for (const ek of ['puck', 'fix', 'flick']) {
    const rk = ek === 'puck' ? 'puck' : 'pueok';
    const e = cost(NEW, { kind: ek, q }, D), r = R.balloonCost({ kind: rk, q, D });
    n++;
    if (!Object.is(e, r)) bad.push(`${ek} q ${q} D ${D}: econ ${e} rules ${r}`);
  }
};
for (let i = 50; i <= 125; i++) for (let j = 130; j <= 1000; j++) cmp(i / 100, j / 1000);
const nGrid = n;
const { acts } = load(FILES);
const S = summarize(acts);
const Ns = [...new Set(S.flatMap((a) => a.pts.map((p) => p.n)))];
for (const a of S) for (let N = 1; N <= Math.max(...Ns); N++) { const D = interp(a, N, 'D'); if (D != null) cmp(a.q, D); }
ok(!bad.length, `격자 ${nGrid}칸 + 원자료 실제 D ${n - nGrid}칸 = ${n}칸, 어긋남 ${bad.length}${bad.length ? ' → ' + bad.slice(0, 3).join(' | ') : ''}`);
const ex = [['퍽 q 1.0', { kind: 'puck', q: 1 }, 0.5], ['퍽 q 0.55', { kind: 'puck', q: 0.55 }, 0.5],
  ['푸어억 q 0.8·D 0.44 (웃돈 0)', { kind: 'pueok', q: 0.8, D: 0.44 }, 3.6], ['푸어억 q 0.93·D 0.44 (§6.3 센 고정 0.93·0.4초)', { kind: 'pueok', q: 0.93, D: 0.44 }, 4.5],
  ['푸어억 q 1.0·D 0 (끝까지 +2)', { kind: 'pueok', q: 1, D: 0 }, 3]];
for (const [lb, a, want] of ex) ok(R.balloonCost(a) === want, `${lb} = ${R.balloonCost(a)}칸 (기대 ${want})`);

// ③ 풍선 상태
console.log('③ 풍선 상태 (0.1칸 정수)');
const s0 = R.balloonInit();
ok(R.balloonCells(s0) === 6, `시작 ${R.balloonCells(s0)}칸`);
const s1 = R.balloonStep(s0, 3.9);
ok(s1 && R.balloonCells(s1) === 3.1, `6 − 3.9 + 1 = ${s1 && R.balloonCells(s1)}`);
ok(R.balloonStep(s1, 4.5) === null && !R.balloonCanPay(s1, 4.5) && R.balloonCanPay(s1, 3.1), '3.1칸에 4.5칸 숨은 못 쉼(null), 3.1칸은 됨');
const s2 = R.balloonStep(s0, 0.5);
ok(R.balloonCells(s2) === 6, `가득에서 퍽 0.5 → 상한 ${R.balloonCells(s2)}칸`);
let s = R.balloonInit();
for (let k = 0; k < 30; k++) s = R.balloonStep(s, 0.7) ?? R.balloonRefill(s);
ok(Number.isInteger(s.t), `0.7칸 숨 30번 뒤에도 정수 상태 t = ${s.t}`);
ok(R.balloonCells(R.balloonRefill({ t: 55 })) === 6, '5.5 + 1 → 상한 6');

// ④ DP 대조 — econ solve 를 rules.js 함수로 다시 짠다
console.log('④ DP 대조: rules.js 풍선으로 푼 3판 DP ≡ econ solve(new)');
const kindOf = (a) => (a.kind === 'puck' ? 'puck' : 'pueok');
function solveR(N, T, Sx, REST) {
  const K = B.rounds, memo = new Map(), optC = new Map();
  const opts = (n) => {
    const o = [];
    for (const a of Sx) {
      const fr = interp(a, n, 'frac');
      if (fr == null) continue;
      const c = R.balloonCost({ kind: kindOf(a), q: a.q, D: interp(a, n, 'D') });
      o.push({ a, y: Math.min(n, fr * n), c });
    }
    return o;
  };
  const f = (n, t, st, k = 0) => {
    if (t === 0 || n <= 0) return k + 1 < K ? f(N, T, st, k + 1) : { v: 0, plan: [] }; // 판이 바뀌어도 풍선은 그대로
    const key = ((k * 100 + n) * 10 + t) * 10000 + st.t;
    if (memo.has(key)) return memo.get(key);
    if (!optC.has(n)) optC.set(n, opts(n));
    let best = { v: -1, plan: [] };
    if (REST) { const nx = f(n, t - 1, R.balloonRefill(st), k); best = { v: nx.v, plan: [{ k, n, label: '쉼', c: 0, b: R.balloonCells(st) }, ...nx.plan] }; }
    for (const o of optC.get(n)) {
      const st2 = R.balloonStep(st, o.c);
      if (!st2) continue;
      const nx = f(Math.round(n - o.y), t - 1, st2, k);
      const v = o.y + nx.v;
      if (v > best.v + 1e-9) best = { v, plan: [{ k, n, label: o.a.label, c: o.c, b: R.balloonCells(st) }, ...nx.plan] };
    }
    if (best.v < 0) best = { v: 0, plan: [] };
    memo.set(key, best);
    return best;
  };
  return f(N, T, R.balloonInit());
}
const pstr = (p) => p.map((x) => `${x.k}:${x.n}:${x.label}:${x.c}:${x.b}`).join('>');
for (const REST of [1, 0]) for (const [N, T] of BOARDS) {
  const env = { BAL: B.max, REG: B.regen, K: B.rounds, REST };
  const e = solve(N, T, S, NEW, S, env), r = solveR(N, T, S, REST);
  ok(Object.is(e.v, r.v) && pstr(e.plan) === pstr(r.plan), `${N}장·숨 ${T} × ${B.rounds}판 ${REST ? '쉬기 허용' : '쉬기 금지'}: econ ${e.v.toFixed(4)} · rules ${r.v.toFixed(4)} · 계획 ${e.plan.length}수 ${pstr(e.plan) === pstr(r.plan) ? '같음' : '다름'}`);
}

// ⑤ 게이트 — BALLOON 수치를 RULES 로 넘겨 econ gate 를 그대로 돌린다
console.log(`⑤ 게이트: node tools/coresweep/econ.mjs gate ${DATA.join(',')}`);
const RULES = `rules=${B.base},${B.perSec},0,${B.puck},${B.tax}@${B.max},${B.regen},${B.rounds}`;
const env = { ...process.env, RULES };
for (const k of ['BOARDS', 'BAL', 'REG', 'K', 'REST', 'EXCL', 'TOP']) delete env[k]; // econ 기본 판·쉬기 허용
const g = spawnSync(process.execPath, [join(root, 'tools/coresweep/econ.mjs'), 'gate', FILES], { env, encoding: 'utf8' });
const out = (g.stdout || '') + (g.stderr || '');
console.log(out.split('\n').filter(Boolean).map((l) => '    | ' + l).join('\n'));
ok(g.status === 0 && /→ 네 판정 모두 통과/.test(out), `RULES='${RULES}' — ${(out.match(/네 판정 [^·\n]*/) || ['(판정 줄 없음)'])[0].trim()}`);
for (const [N, T] of BOARDS) {
  const j = judge(S, NEW, N, T, { BAL: B.max, REG: B.regen, K: B.rounds, REST: 1 });
  const pc = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(0)}%`;
  ok(j.all, `${N}장·숨 ${T} × ${B.rounds}판: (i) 섞기 이득 ${pc(j.gain)} ${j.ok.i ? 'O' : 'X'} · (ii) 퍽 ${j.ok.ii ? 'O' : 'X'} · (iii) 세기 값 ${pc(j.qm)}${N >= 30 ? `·센 고정 지배 ${j.sfDom ? '예' : '아니오'}` : ''} ${j.ok.iii ? 'O' : 'X'} · (iv) 묶임 ${pc(j.bind)} ${j.ok.iv ? 'O' : 'X'}`);
}

console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과: rules.js 숨 풍선 ≡ econ.mjs new, 네 판정 통과');
process.exit(fails ? 1 : 0);

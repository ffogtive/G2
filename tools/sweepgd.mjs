// tools/sweepgd.mjs — 쓸기 문법 D '세 박자' Node 측정(보류 시드 확인 · 칩 근거 · G15 원 → 책상 · 숨 난이도 손잡이).
//   물리 = 게임 그대로(mockup/src/sim.js · sweep.js). 한 샷 = 게임 함수 G.gdShot(책상 판정 G.judgeDesk) 그대로 — 판정 식을 이 파일에 다시 쓰지 않는다.
//   같은 최종 월드를 분필 원(table.judgeResult)으로도 한 번 더 읽어 G15 표에 쓴다(읽기만 — 물리·해시 무변화). CLI 가드: 직접 실행할 때만 돈다.
//
// 🧭 가설(측정 전): 스크래치 시드(40장 401~412 · 30장 601~612)로 정한 sweep.js GD 잠정 숫자는 보류 시드(40장 413~424 · 30장 613~624)에서도
//   대체로 버틴다 — 판정이 책상이라 고원이 넓고(지배 칸 근처 ≥ 90%), 갈리는 곳은 절벽(돌풍 q ≥ 1.2 · 볼 θ < 10 · 높은 영점 s ≥ 0.75)뿐이다.
//   흔들릴 수 있는 곳 = 고원 '시작'(40장 q 0.8 · 30장 0.7)과 영점 띠 아래 끝(40장 0.45) — 스크래치 12판 표준오차 수준의 차이.
//   G15(같은 월드 원 → 책상): 연습판은 지배 칸에서 1.4배쯤 더 센다 · 돌풍 절벽이 원 q 1.0 → 책상 약 1.19 로 밀린다.
//   숨 난이도: 책상 판정이면 초록 띠가 넓어(40장 0.80~1.175 ≈ 81 px / 390 px 폰) 쉬움 — 돌풍 폭을 좁히면(blast = (q − 1)/0.25) 절벽이 약 1.1 로 당겨진다.
//   **가설 수정 (확인됨, 보류 40장 413~424 · 30장 613~624, 원자료 tools/coresweep/data/gd/ 2,166샷)**: 초록 띠(영점·숨 시작)는 버티고, 바뀌는 곳은 그 바깥 칸 경계(숨 회색 끝 · 돌풍 빨강 · 각도 아슬)다.
//     버팀: 영점 초록 40장 0.45~0.65 · 30장 0.40~0.65 · 영점 빨강 0.75(한 값으로는 최선 — 장수별이면 40장 0.75 · 30장 0.85) · 숨 초록 시작 40장 0.8 · 30장 0.7 · peak 40장 36(35.9 ± 0.5)
//     바꿈: 숨 회색 끝 40장 0.7 → 0.75(q 0.7 = 최고의 73%) · 30장 0.65 → 0.6(q 0.6 = 78% → 30장은 회색 칸 없음) · 돌풍 빨강 1.175 → 1.2(30장 1.175 = 96%)
//           · 각도 아슬 끝 15 → 10(θ 10~12 = 40장 96~98% · 30장 91~95% — 아슬 칸이 물리로는 스트라이크) · peak 30장 27 → 28(27.9 ± 0.2)
//     볼은 규칙이다: 볼 규칙 없이 θ 5 를 물리에 보내면 40장 99% · 30장 91%(gdSwing 이 θ 0 = 52% · 65% 로 만든다).
//     칩 5칸(영점 높음 0.85 · 영점 낮음 0.40 · 숨 약함 0.65 · 돌풍 1.22 · 볼 5): 그 칩이 나온 판에서 이름 붙은 손잡이만 지배 값으로 옮기면 100% 더 넘김(30장 s 0.4 는 초록이라 영점 칩이 안 나옴 = 맞음).
//   G15 (같은 월드, 확인됨): 연습판 지배 칸 원 → 책상 40장 25.3 → 35.9장(×1.42) · 30장 21.6 → 27.9장(×1.29) · 숨 초록 띠 위 끝 원 1.02 → 책상 1.17~1.19.
//     고전(powercurve 경로)은 BLOCKERS G15 표를 그대로 재현(스크래치 870판과 판마다 원·책상 수 같음 · 작은 더미라 책상 문턱 −0.11 → −0.5 도 차이 0).
//   숨 손잡이 (확인됨): 손잡이는 물리가 아니라 '당김 → 돌풍' 대응만 바꾼다(같은 세기·돌풍 칸 192묶음 정지 해시 같음). 초록(≥ 90%) 폭, 390 px 폰 당김 140 px 중:
//     (a) 지금 (q − 1)/0.4 → 40장 0.79~1.17 = 83 px · 30장 0.67~1.19 = 113 px(빨강 1.2) · (b) (q − 1)/0.25 → 67 · 96 px(빨강 1.125)
//     · (b2) (q − 0.95)/0.25 → 57 · 83 px(빨강 1.075) · (c) 그림만 ≥ 95% → 68 · 98 px(결과 무변화)
//   해석 한계: 칸마다 12판 → 칸 평균 표준오차 0.2~1장, 75%·90% 경계 칸(40장 q 1.175 = 89% · 30장 s 0.8 = 79%)은 한 판에 갈래가 바뀔 수 있다 · 줄은 지배 칸을 지나는 한 손잡이씩(맞물림 안 잼)
//   반영 (2026-10-17): sweep.js GD 를 위 '바꿈' 값으로 옮김(q.weak 40장 0.75 · 30장 0.6 · q.red 1.2 · th.near 10 = ball · peak 30장 28 — blastSpan 은 그대로, 손잡이는 재윤님 손맛 결정)
//     → report 의 잠정 비교가 13개 모두 '버팀'(`sweepgame ctl` 이 report --json 으로 확인). 줄에 칩·칸(chip · zs · zt · zq)이 기록되므로 held·knob 를 새 GD 로
//     다시 돌려 묶었다 — 물리 칸(뒤집힘·OUT·걸침·원·스텝·해시 …)은 옛 원자료와 줄마다 같고 칩·칸만 새 값(classic 은 GD 를 안 써 바이트 같음)
//
// 판정·용어
//   flip/out/hang = 책상 판정(G.judgeDesk: 떨어짐 · 판 옆으로 내려감 y < −0.5 · 중심이 책상 밖 = OUT, 걸침 = hang) — 게임 문법 D 숨의 판정
//   flipC/outC    = 같은 월드의 분필 원 판정(table.judgeResult, 반지름 3.2) — G15 비교용
//   띠: 줄 최고의 ≥ 90% = 초록/스트라이크 · ≥ 75% = 노랑(아슬·조금 약함·영점 높음/낮음) · < 75% = 빨강/회색(sweepgc band 그대로, 격자점 + 이웃 선형 보간)
//   잠정 비교 = 문턱 후보를 G.GD 에 잠깐 넣고(되돌림) 게임 gdZone 그대로 매긴 칸 ≠ 측정 갈래(≥ 90 · 75~90 · < 75)인 격자점 수를 센다 → 최소 집합에 잠정이 들면 '버팀',
//     아니면 그 집합에서 잠정에 가장 가까운 값(문턱 차례로 2바퀴 = 서로 맞는 한 벌) · 공유 문턱이 장수별로 더 잘 맞으면 '버팀*' + 장수별 값
//     숨 위쪽(q > 0.9)은 게임에 노랑 칸이 없어 75~90% 칸은 초록·빨강 어느 쪽도 맞음 · 영점 아래 노랑(low)은 측정 빨강도 맞음(곡선 끝)
//   칩 근거 = 칩이 이름 붙인 손잡이만 지배 값(s 0.55 · q 0.9 · θ 30)으로 옮긴 같은 시드 칸이 더 많이 넘긴 비율 ≥ 75% (sweepgc chips 와 같은 꼴, 판정만 책상)
//
// 명령 (CPU 4코어 — 다른 게이트(pvp-check·sweepplay·artifact-check·app-bridge-check)가 돌면 W=1, 아니면 W=2)
//   node tools/sweepgd.mjs self                      gdShot ≡ zeroShot(q ≤ 1) 해시 · q > 1 = gdArm 꼴(돌풍 (q − 1)/0.4) · 볼 θ < 10 ≡ θ 0 해시
//                                                   · 기록한 책상 수 = judgeDesk · 손잡이 샷(armShot) 'a' ≡ gdShot · 'b' ≡ gdShot(GD.blastSpan 0.25) (약 30초)
//   node tools/sweepgd.mjs list                      단계별 샷 수
//   node tools/sweepgd.mjs run <단계> <out.jsonl> [W=2]   이어 돌리기(있는 (장수, 시드, 키) 건너뜀) · 끝나면 키 순 정렬 → gzip -n -9 로 묶음
//        held     보류 시드 40장 413~424 · 30장 613~624(고르기에 안 쓴 판) · 지배 칸 (s 0.55 · θ 30 · q 0.9) 한 손잡이씩:
//                 s 0.40~0.95 · θ 0~45(+ GD.dom 40) · q 0.60~1.25 + 칩 칸(영점 높음 0.85 · 영점 낮음 0.40 · 숨 약함 0.65 · 돌풍 1.22 · 볼 5)
//                 + 'raw'(볼 규칙 없이 θ 5·8 을 물리에 그대로 = zeroShot) (744샷, 일꾼 2 약 5분)
//        knob     보류 시드 · 숨 손잡이: (a) 지금 gdArm 의 촘촘한 q 6칸 더 · (b) 돌풍 (q − 1)/0.25 · (b2) (q − 0.95)/0.25 — 연습판 숨 식만, sim.js 무변경 (552샷, 약 3분)
//        classic  고전(G15): tools/powercurve.mjs 와 같은 경로(Table(s·7907+n) · resolveShot · blow · runUntilSettled(4)) · 게임 방향 −z ·
//                 숨 비율 1.0/1.05/1.1/1.2/1.3 × 6·12·22장 × 조준 0.95/0.75/0.5 × 시드 1~16 + powercurve 방향 +x 조준 0.95 시드 1~10 (870샷, 약 1분)
//   node tools/sweepgd.mjs report [파일,…] [--json]   기본 = tools/coresweep/data/gd/{held,knob,classic}.jsonl.gz
//        지배 칸 · s/θ/q 줄 · 잠정(sweep.js GD) 비교 · 칩 근거 · G15(연습판 원 → 책상 · 고전 원 대 책상) · 숨 손잡이(초록 폭 px, 390 px 폰)
//   node tools/sweepgd.mjs same <단계> <원자료.jsonl[.gz]> [n=24]   고르게 n 개 다시 돌려 JSON 비트 대조
//   다시 만들기: D=tools/coresweep/data/gd; run held $D/held.jsonl · run knob $D/knob.jsonl · run classic $D/classic.jsonl → gzip -n -9 (같은 명령이면 같은 파일)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as V1 from '../mockup/src/sim.js';
import * as G from '../mockup/src/sweep.js';
import * as RU from '../mockup/src/rules.js';
import { band } from './sweepgc.mjs';

const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const NS = [40, 30];
export const SEEDS = { 40: R(413, 424), 30: R(613, 624) }; // 보류(PRACTICE_SEEDS 의 뒤 절반) — 스크래치 고르기 401~412 · 601~612 는 안 씀
export const DOM = { s: 0.55, q: 0.9, th: 30 }; // 지배 칸(θ 15° 위는 평평 → 30) · GD.dom 은 θ 40 — 줄에 40 을 넣어 같음을 본다
export const S_LINE = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 0.85, 0.95]; // 0.85 = 칩 칸 '영점 높음'
export const TH_LINE = [0, 5, 8, 10, 12, 15, 30, 40, 45]; // 5 = 칩 칸 '볼' · 40 = GD.dom
export const Q_LINE = [0.6, 0.65, 0.7, 0.8, 0.9, 1, 1.1, 1.15, 1.175, 1.2, 1.22, 1.25]; // 0.65 = '숨 약함' · 1.22 = '돌풍'
export const RAW_TH = [5, 8]; // 볼 규칙(gdSwing) 없이 물리에 그대로 보낸 θ — 볼이 물리가 아니라 규칙임을 보이는 줄
export const CHIP_CASES = [
  { name: '영점 높음', want: 'zHigh', knob: 's', v: 0.85 }, { name: '영점 낮음', want: 'zLow', knob: 's', v: 0.4 },
  { name: '숨 약함', want: 'qWeak', knob: 'q', v: 0.65 }, { name: '돌풍', want: 'qGust', knob: 'q', v: 1.22 }, { name: '볼', want: 'thBall', knob: 'th', v: 5 },
];
// 숨 손잡이(연습판 숨 식만): power = gdPower(q) = min(q, 1) 그대로 · 돌풍 blast = q > q0 이면 min(GD.blastMax, (q − q0)/span)
export const MAPS = { a: { q0: 1, span: 0.4, txt: '지금 gdArm (q − 1)/0.4' }, b: { q0: 1, span: 0.25, txt: '좁은 폭 (q − 1)/0.25' }, b2: { q0: 0.95, span: 0.25, txt: '일찍 + 좁은 폭 (q − 0.95)/0.25' } };
export const KNOB_Q = { a: [0.75, 0.85, 0.95, 1.05, 1.125, 1.225], b: [1.05, 1.1, 1.125, 1.15, 1.175, 1.2, 1.225, 1.25], b2: [1, 1.05, 1.1, 1.125, 1.15, 1.175, 1.2, 1.225, 1.25] };
export const CL = { N: [6, 12, 22], H: [0.95, 0.75, 0.5], R: [1, 1.05, 1.1, 1.2, 1.3], seeds: R(1, 16), xSeeds: R(1, 10) };
export const PHONE = 390; // 짧은 변 390 px 폰 — 당김 끝 GD.pullPx × 390 = 140.4 px 에 q 1.25
export const DATA = new URL('./coresweep/data/gd/', import.meta.url).pathname;

// ───────────────────────── 한 샷 ─────────────────────────
export const blastOf = (map, q) => { const m = MAPS[map]; return q > m.q0 ? Math.min(G.GD.blastMax, (q - m.q0) / m.span) : 0; };
// 손잡이 샷: G.gdShot 과 같은 호출 순서(Table(seed·7907 + N) → addPile → settle 600 → SweepCtl 'zero'(q = gdPower · θ = gdSwing) → blowProg → P.blast → step → after → stepJudge)
//   돌풍 식만 MAPS[map]. self 가 'a' ≡ G.gdShot · 'b' ≡ G.gdShot(GD.blastSpan 0.25 잠깐) 정지 해시로 대조. 판정 = G.judgeDesk
export function armShot({ N, seed, s, q, th, map }) {
  const t = new V1.Table(G.practiceTableSeed(N, seed), { lift: 519.59 });
  t.addPile(Array.from({ length: N }, (_, i) => i));
  t.settle(600);
  const power = G.gdPower(q), b = blastOf(map, q);
  const ctl = new G.SweepCtl(t, { mode: 'zero', s, q: power, th: G.gdSwing(th) });
  const P = t.blowProg({ prog: ctl.prog, power, dur: ctl.durCap });
  if (b > 0) P.blast = b;
  ctl.attach(P);
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do { t.step(); ctl.after(t); steps++; } while (!t.stepJudge(j));
  const J = G.judgeDesk(t), n = t.liveDiscs().length;
  return { table: t, steps, flips: J.flipped.length, outs: J.outs.length, hang: J.hang, hash: G.poseHash(t), tUp: ctl.tUp, cueT: ctl.rec.cueT, power, blast: b, chip: G.gdChip({ n, s, q, th, flip: J.flipped.length }) };
}
// 판 한 줄: kind 'gd'(map a = G.gdShot 그대로 · b/b2 = armShot) · 'raw'(G.zeroShot 책상 판정 — 볼 규칙 없이 θ 그대로) · 'classic'(고전 눈높이 blow)
export function shotRow(job) {
  if (job.kind === 'classic') return classicRow(job);
  const { N, seed, s, q, th } = job, map = job.map || 'a';
  const r = job.kind === 'raw' ? G.zeroShot(V1.Table, { N, seed, s, q, th, judge: 'desk' }) : map === 'a' ? G.gdShot(V1.Table, { N, seed, s, q, th }) : armShot({ N, seed, s, q, th, map });
  const t = r.table, J = G.judgeDesk(t), C = t.judgeResult();
  if (J.flipped.length !== r.flips || J.outs.length !== r.outs) throw new Error(`책상 판정 다름 ${N}/${seed} ${job.key}`);
  const row = {
    N, seed, key: job.key, kind: job.kind, map, s, q, th, swing: job.kind === 'raw' ? th : G.gdSwing(th),
    power: job.kind === 'raw' ? q : G.gdPower(q), blast: job.kind === 'raw' ? 0 : +(map === 'a' ? G.gdBlast(q) : blastOf(map, q)).toFixed(4),
    flip: r.flips, out: r.outs, hang: J.hang, off: t.liveDiscs().filter((d) => d.off).length, flipC: C.flipped.length, outC: C.outs.length,
    steps: r.steps, tUp: r.tUp, cueT: r.cueT, chip: job.kind === 'raw' ? null : r.chip,
    zs: G.gdZone('s', s, N), zt: G.gdZone('th', th, N), zq: G.gdZone('q', q, N), hash: r.hash,
  };
  t.world.free?.();
  return row;
}
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 고전(tools/powercurve.mjs 그대로): Table(seed·7907 + n) · settle() · resolveShot(정답 숨 × 비율, rng mul(seed·31 + n)) · blow · runUntilSettled(4)
//   dir 'z' = 게임 방향(main.js shotGeometry: c − dir·√(1−lat²) + side·lat) · 'x' = powercurve 방향. 같은 월드를 원·책상 두 판정으로
export function classicRow(job) {
  const { N, seed, hf, r: ratio, dir } = job;
  const t = new V1.Table(seed * 7907 + N);
  t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle();
  const top = t.columnTop();
  const sh = RU.resolveShot({ lat: 0, h: Math.max(0.03, top * hf), power: RU.sweetHiFor(N) * ratio }, N, top, mul(seed * 31 + N), 1);
  const c = t.pileCenter(), L = Math.sqrt(1 - sh.lat * sh.lat);
  if (dir === 'x') t.blow({ aim: { x: c.x - L, y: sh.h, z: c.z + sh.lat }, dir: { x: 1, z: 0 }, power: sh.power, blast: sh.blast || 0 });
  else t.blow({ aim: { x: c.x + sh.lat, y: sh.h, z: c.z + L }, dir: { x: 0, z: -1 }, power: sh.power, blast: sh.blast || 0 });
  const res = t.runUntilSettled(4);
  const C = t.judgeResult(), J = G.judgeDesk(t);
  if (res.flipped.length !== C.flipped.length) throw new Error(`원 판정 다름 ${N}/${seed} ${job.key}`);
  const row = {
    N, seed, key: job.key, kind: 'classic', dir, hf, r: ratio, power: +sh.power.toFixed(4), blast: +(sh.blast || 0).toFixed(4),
    flip: J.flipped.length, out: J.outs.length, hang: J.hang, off: t.liveDiscs().filter((d) => d.off).length, flipC: C.flipped.length, outC: C.outs.length,
    steps: res.steps, hash: G.poseHash(t),
  };
  t.world.free?.();
  return row;
}

// ───────────────────────── 작업 목록 ─────────────────────────
const gdJob = (N, seed, s, q, th, map = 'a') => ({ N, seed, kind: 'gd', map, s, q, th, key: `gd|${map}|s${s}|q${q}|th${th}` });
const rawJob = (N, seed, s, q, th) => ({ N, seed, kind: 'raw', map: 'a', s, q, th, key: `raw|s${s}|q${q}|th${th}` });
const clJob = (N, seed, dir, hf, r) => ({ N, seed, kind: 'classic', dir, hf, r, key: `classic|${dir}|h${hf}|r${r}` });
export function makeJobs(stage) {
  const J = [], seen = new Set();
  const push = (jb) => { const id = `${jb.N}|${jb.seed}|${jb.key}`; if (!seen.has(id)) { seen.add(id); J.push(jb); } };
  if (stage === 'held') {
    for (const N of NS) for (const seed of SEEDS[N]) {
      for (const s of S_LINE) push(gdJob(N, seed, s, DOM.q, DOM.th));
      for (const th of TH_LINE) push(gdJob(N, seed, DOM.s, DOM.q, th));
      for (const q of Q_LINE) push(gdJob(N, seed, DOM.s, q, DOM.th));
      for (const th of RAW_TH) push(rawJob(N, seed, DOM.s, DOM.q, th));
    }
  } else if (stage === 'knob') {
    for (const N of NS) for (const seed of SEEDS[N]) for (const map of ['a', 'b', 'b2']) for (const q of KNOB_Q[map]) push(gdJob(N, seed, DOM.s, q, DOM.th, map));
  } else if (stage === 'classic') {
    for (const N of CL.N) {
      for (const hf of CL.H) for (const r of CL.R) for (const seed of CL.seeds) push(clJob(N, seed, 'z', hf, r));
      for (const r of CL.R) for (const seed of CL.xSeeds) push(clJob(N, seed, 'x', 0.95, r));
    }
  } else throw new Error('단계 ' + stage);
  return J;
}

// ───────────────────────── 일꾼 · 이어 돌리기 ─────────────────────────
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
export const readRows = (files) => files.split(',').filter(Boolean).flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const tagOf = (r) => `${r.N}|${r.seed}|${r.key}`;
async function run(stage, out, W) {
  const jobs = makeJobs(stage);
  const done = new Set(existsSync(out) ? readText(out).split('\n').filter(Boolean).map((l) => tagOf(JSON.parse(l))) : []);
  const todo = jobs.filter((j) => !done.has(tagOf(j))).sort((a, b) => b.N - a.N); // 무거운 것(40장)부터
  console.log(`run ${stage}: 작업 ${jobs.length} · 이미 ${jobs.length - todo.length} · 남음 ${todo.length} · 일꾼 ${W}`);
  const t0 = Date.now();
  let k = 0, got = 0;
  await new Promise((res) => {
    const nW = Math.min(W, todo.length);
    let alive = nW;
    if (!nW) return res();
    for (let w = 0; w < nW; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepgdWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => {
        if (m.ready) return next();
        appendFileSync(out, JSON.stringify(m) + '\n');
        if (++got % 100 === 0) console.error(`  ${got}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        next();
      });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => { console.error(e); process.exitCode = 1; });
    }
  });
  const lines = readText(out).split('\n').filter(Boolean);
  const keyOf = (l) => { const r = JSON.parse(l); return [r.N, r.seed, r.key]; };
  lines.sort((a, b) => { const x = keyOf(a), y = keyOf(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`끝: ${got}샷 ${((Date.now() - t0) / 1000).toFixed(0)}초 → ${out} (${lines.length}줄)`);
}
async function same(stage, file, n) {
  await V1.initPhysics();
  const jobs = makeJobs(stage);
  const stored = new Map(readText(file).split('\n').filter(Boolean).map((l) => [tagOf(JSON.parse(l)), l]));
  const stride = Math.max(1, Math.floor(jobs.length / n));
  let good = 0, bad = 0, miss = 0;
  for (let i = 0; i < jobs.length && good + bad + miss < n; i += stride) {
    const j = jobs[i], l = stored.get(tagOf(j));
    if (l === undefined) { miss++; continue; }
    if (JSON.stringify(shotRow(j)) === l) good++; else { bad++; console.log(`  다름: ${j.N}장 ${j.seed} ${j.key}`); }
  }
  console.log(`sweepgd same ${stage}: 같음 ${good} · 다름 ${bad} · 원자료에 없음 ${miss} → ${bad || miss || !good ? '틀림' : '맞음'}`);
  if (bad || miss || !good) process.exitCode = 1;
}

// ───────────────────────── self ─────────────────────────
async function self() {
  await V1.initPhysics();
  let bad = 0;
  const ok = (name, cond, info = '') => { if (!cond) bad++; console.log(`  ${cond ? '맞음' : '틀림'}  ${name}${info ? ' — ' + info : ''}`); };
  const free = (...rs) => rs.forEach((r) => r.table.world.free?.());
  // (1) gdShot(q ≤ 1) ≡ zeroShot(같은 s·q·θ ≥ 10): 해시·스텝·tUp·단서 · 책상 판정 = zeroShot(judge desk) · 원 판정 = 같은 월드 judgeResult = zeroShot(judge circle)
  const cells = [{ N: 40, seed: 413, s: 0.55, q: 0.9, th: 30 }, { N: 30, seed: 613, s: 0.45, q: 0.8, th: 15 }, { N: 40, seed: 414, s: 0.7, q: 1, th: 45 }, { N: 30, seed: 614, s: 0.4, q: 0.65, th: 12 }];
  for (const c of cells) {
    const a = G.gdShot(V1.Table, c), zd = G.zeroShot(V1.Table, { ...c, judge: 'desk' }), zc = G.zeroShot(V1.Table, c);
    const C = a.table.judgeResult();
    ok(`gdShot ≡ zeroShot ${c.N}장 ${c.seed} (${c.s}, ${c.q}, ${c.th}°)`, a.hash === zd.hash && a.hash === zc.hash && a.steps === zd.steps && a.tUp === zd.tUp && a.cueT === zd.cueT && a.flips === zd.flips && a.outs === zd.outs && C.flipped.length === zc.flips && C.outs.length === zc.outs && a.blast === 0,
      `해시 ${a.hash} · 책상 ${a.flips}/${a.outs} · 원 ${C.flipped.length}/${C.outs.length} = ${zc.flips}/${zc.outs}`);
    free(a, zd, zc);
  }
  // (2) q > 1 = gdArm 꼴: armShot('a') ≡ G.gdShot 해시 · 세기 1 · 돌풍 (q − 1)/0.4 · 'b' ≡ G.gdShot(GD.blastSpan 0.25 잠깐) · 음성 대조 q 1.05 ≢ q 1.0
  ok('MAPS.a ≡ GD(blastSpan · q0 1) · GD.blastMax 1.4', MAPS.a.span === G.GD.blastSpan && MAPS.a.q0 === 1 && G.GD.blastMax === 1.4);
  for (const c of [{ N: 40, seed: 415, s: 0.55, q: 1.05, th: 30 }, { N: 30, seed: 615, s: 0.55, q: 1.2, th: 30 }, { N: 40, seed: 416, s: 0.6, q: 1.25, th: 40 }]) {
    const g = G.gdShot(V1.Table, c), a = armShot({ ...c, map: 'a' });
    ok(`q > 1 armShot('a') ≡ gdShot ${c.N}장 ${c.seed} q${c.q}`, g.hash === a.hash && g.steps === a.steps && g.flips === a.flips && g.outs === a.outs && g.hang === a.hang && g.chip === a.chip && g.power === 1 && Math.abs(g.blast - (c.q - 1) / 0.4) < 1e-12 && a.blast === g.blast,
      `해시 ${g.hash} · 세기 ${g.power} · 돌풍 ${g.blast.toFixed(3)} · 책상 ${g.flips}/${g.outs}(걸침 ${g.hang}) · 칩 ${g.chip}`);
    free(g, a);
  }
  { const c = { N: 30, seed: 616, s: 0.55, q: 1.15, th: 30 }, span0 = G.GD.blastSpan;
    const b = armShot({ ...c, map: 'b' });
    let g; try { G.GD.blastSpan = MAPS.b.span; g = G.gdShot(V1.Table, c); } finally { G.GD.blastSpan = span0; }
    const a = armShot({ ...c, map: 'a' });
    ok(`armShot('b') ≡ gdShot(GD.blastSpan ${MAPS.b.span}) · ≢ 'a' (30장 616 q 1.15)`, b.hash === g.hash && b.flips === g.flips && b.hash !== a.hash && G.GD.blastSpan === span0, `b ${b.hash} = ${g.hash} · a ${a.hash} · 돌풍 b ${b.blast.toFixed(2)} / a ${a.blast.toFixed(3)}`);
    free(b, g, a);
    const n1 = G.gdShot(V1.Table, { N: 40, seed: 417, s: 0.55, q: 1.05, th: 30 }), n0 = G.gdShot(V1.Table, { N: 40, seed: 417, s: 0.55, q: 1, th: 30 });
    ok('음성 대조: gdShot q 1.05 ≢ q 1.0 해시(40장 417)', n1.hash !== n0.hash, `${n1.hash} / ${n0.hash}`);
    free(n1, n0);
  }
  // (3) 볼 = 헛스윙: gdShot(θ 5 · 9.99) ≡ gdShot(θ 0) ≡ zeroShot(θ 0) 해시 · θ 10 ≢ θ 0 · raw θ 5(zeroShot) ≢ θ 0 (볼은 물리가 아니라 규칙)
  { const c = { N: 40, seed: 418, s: 0.55, q: 0.9 };
    const g5 = G.gdShot(V1.Table, { ...c, th: 5 }), g9 = G.gdShot(V1.Table, { ...c, th: 9.99 }), g0 = G.gdShot(V1.Table, { ...c, th: 0 }), z0 = G.zeroShot(V1.Table, { ...c, th: 0, judge: 'desk' });
    const g10 = G.gdShot(V1.Table, { ...c, th: 10 }), r5 = G.zeroShot(V1.Table, { ...c, th: 5, judge: 'desk' });
    ok('볼: gdShot θ 5 ≡ θ 9.99 ≡ θ 0 ≡ zeroShot θ 0 해시 · θ 10 ≢ θ 0 · raw θ 5 ≢ θ 0 · 칩 θ 5 = thBall',
      g5.hash === g0.hash && g9.hash === g0.hash && z0.hash === g0.hash && g10.hash !== g0.hash && r5.hash !== g0.hash && g5.chip === 'thBall',
      `θ0 ${g0.flips}장 ${g0.hash} · θ10 ${g10.flips}장 · raw θ5 ${r5.flips}장 · 칩 ${g5.chip}/${g9.chip}`);
    free(g5, g9, g0, z0, g10, r5);
  }
  // (4) 기록한 책상 수 = judgeDesk(같은 월드) · 원 수 = judgeResult: shotRow 로 한 줄을 만든 뒤 같은 칸을 G.gdShot 으로 다시 → 수·해시 같음 · 고전 줄도 같은 식
  for (const jb of [gdJob(40, 419, 0.55, 1.22, 30), gdJob(30, 619, 0.85, 0.9, 30), rawJob(40, 420, 0.55, 0.9, 8)]) {
    const row = shotRow(jb);
    const r = jb.kind === 'raw' ? G.zeroShot(V1.Table, { N: jb.N, seed: jb.seed, s: jb.s, q: jb.q, th: jb.th, judge: 'desk' }) : G.gdShot(V1.Table, jb);
    const J = G.judgeDesk(r.table), C = r.table.judgeResult();
    ok(`shotRow ${jb.N}장 ${jb.seed} ${jb.key}: 책상 = judgeDesk · 원 = judgeResult · 해시`, row.flip === J.flipped.length && row.out === J.outs.length && row.hang === J.hang && row.flipC === C.flipped.length && row.outC === C.outs.length && row.hash === r.hash,
      `책상 ${row.flip}/${row.out}(걸침 ${row.hang}) · 원 ${row.flipC}/${row.outC} · 칩 ${row.chip}`);
    free(r);
  }
  { const a = classicRow(clJob(12, 3, 'z', 0.95, 1.1)), b = classicRow(clJob(12, 3, 'z', 0.95, 1.1)), x = classicRow(clJob(6, 2, 'x', 0.95, 1));
    ok('고전 줄 두 번 = 같은 줄(결정적) · 원 = runUntilSettled · 책상 ≥ 원(뒤집힘)', JSON.stringify(a) === JSON.stringify(b) && a.flip >= a.flipC && x.flip >= x.flipC, `12장 1.1: 원 ${a.flipC}/${a.outC} · 책상 ${a.flip}/${a.out} · 6장 +x: 원 ${x.flipC} · 책상 ${x.flip}`);
  }
  console.log(`\nsweepgd self: ${bad ? `틀림 ${bad}` : '맞음'}`);
  if (bad) process.exitCode = 1;
}

// ───────────────────────── report ─────────────────────────
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);
const pct = (v) => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : '—');
const cls = (y, best) => (y >= 0.9 * best ? 'g' : y >= 0.75 * best ? 'y' : 'r');
// 게임 칸 → 측정 갈래: 초록·스트라이크 = g · 노랑(영점 높음/낮음 · 조금 약함 · 아슬) = y · 빨강(높은 영점 · 돌풍 · 볼)·회색(약한 숨) = r
const zoneCls = (z) => (z === 'green' || z === 'strike' ? 'g' : z === 'red' || z === 'ball' || z === 'weak' ? 'r' : 'y');
// 영점 아래 노랑(low)은 측정이 빨강이어도 맞음으로 친다(게임에 영점 아래 빨강 칸이 없다 — 기둥 아래 모서리가 곡선의 끝)
// 숨 위쪽(q > 지배 값)은 게임에 노랑 칸이 없다(초록 → 돌풍 빨강) → 측정 75~90% 경계 칸은 초록이든 빨강이든 맞음
const zoneOk = (knob, z, c, x) => zoneCls(z) === c || (knob === 's' && z === 'low' && c === 'r') || (knob === 'q' && x > DOM.q && c === 'y' && (z === 'green' || z === 'red'));
const DEF_FILES = ['held', 'knob', 'classic'].map((s) => `${DATA}${s}.jsonl.gz`).filter((f) => existsSync(f)).join(',');

// 줄: 지배 칸을 지나는 한 손잡이 줄(같은 kind·map) → [{ x, n, flip, flipC, out, outC, hang, rows }]
function lineOf(rows, N, knob, map = 'a', kind = 'gd') {
  const other = Object.keys(DOM).filter((k) => k !== knob);
  const rs = rows.filter((r) => r.kind === kind && r.N === N && (r.map || 'a') === map && other.every((k) => r[k] === DOM[k]));
  const xs = [...new Set(rs.map((r) => r[knob]))].sort((a, b) => a - b);
  return xs.map((x) => { const c = rs.filter((r) => r[knob] === x); const m = (f) => mean(c.map(f)); return { x, n: c.length, flip: m((r) => r.flip), flipC: m((r) => r.flipC), out: m((r) => r.out), outC: m((r) => r.outC), hang: m((r) => r.hang), off: m((r) => r.off), rows: c }; });
}
const bandOf = (L, frac) => band(L.map((c) => c.x), L.map((c) => c.flip), frac);
const bestOf = (L) => Math.max(...L.map((c) => c.flip));
// 숨 손잡이 줄: map 의 q0 이하는 'a' 와 같은 물리(돌풍 0 — 비트 동일)라 'a' 줄을 빌린다
function qLineMap(rows, N, map) {
  const a = lineOf(rows, N, 'q', 'a');
  if (map === 'a') return a;
  const m = lineOf(rows, N, 'q', map);
  return [...a.filter((c) => c.x <= MAPS[map].q0 && !m.some((d) => d.x === c.x)), ...m].sort((x, y) => x.x - y.x);
}
const pxOfQ = (q) => G.pullOfQ(q, PHONE);

function report(files, json) {
  const rows = readRows(files || DEF_FILES);
  const out = { files: files || DEF_FILES, zones: {}, chips: {}, g15: {}, knob: {} };
  const P = (...a) => { if (!json) console.log(...a); };
  const gd = rows.filter((r) => r.kind === 'gd' || r.kind === 'raw');
  const Ns = NS.filter((N) => gd.some((r) => r.N === N));
  const seedsTxt = (N) => { const s = [...new Set(gd.filter((r) => r.N === N).map((r) => r.seed))].sort((a, b) => a - b); return s.length ? `${s[0]}~${s.at(-1)}(${s.length})` : '—'; };
  P(`줄 ${rows.length} (연습판 ${gd.length} · 고전 ${rows.length - gd.length}) · 시드 ${Ns.map((N) => `${N}장 ${seedsTxt(N)}`).join(' · ')}`);
  const proposals = [];
  const verdict = (name, game, okk, nv, info, perN = null) => { proposals.push({ name, game, holds: okk, proposed: okk ? game : nv, perN, info }); P(`  ${okk ? (perN ? '버팀*' : '버팀') : '바꿈'}  ${name}: 잠정 ${JSON.stringify(game)}${okk ? '' : ` → ${JSON.stringify(nv)}`}${perN ? ` (한 값으로는 최선 · 장수별이면 ${JSON.stringify(perN)})` : ''} — ${info}`); };

  for (const N of Ns) {
    const D = lineOf(rows, N, 'th').find((c) => c.x === DOM.th), D40 = lineOf(rows, N, 'th').find((c) => c.x === 40);
    if (!D) continue;
    P(`\n━━ ${N}장 지배 칸 (s ${DOM.s} · q ${DOM.q} · θ ${DOM.th}) — 책상 ${f2(D.flip)}장 / OUT ${f2(D.out)}(걸침 ${f2(D.hang)}) · 같은 월드 원 ${f2(D.flipC)}장 / 원 밖 ${f2(D.outC)} · GD.dom θ 40 → ${f2(D40?.flip)}장 ━━`);
    // 줄 표
    for (const knob of ['s', 'th', 'q']) {
      const L = knob === 'q' ? qLineMap(rows, N, 'a') : lineOf(rows, N, knob);
      if (!L.length) continue;
      const best = bestOf(L), b9 = bandOf(L, 0.9), b75 = bandOf(L, 0.75);
      const z = (x) => G.gdZone(knob, x, N);
      P(`  ${knob} 줄 (최고 ${f1(best)} @ ${b9.best}) — 값: 책상 장수(% 최고)[측정 갈래/게임 칸] · 원 장수`);
      P('    ' + L.map((c) => `${c.x}: ${f1(c.flip)}(${pct(c.flip / best)})[${cls(c.flip, best)}/${z(c.x)}${zoneOk(knob, z(c.x), cls(c.flip, best), c.x) ? '' : '✗'}] 원 ${f1(c.flipC)}`).join(' · '));
      P(`    ≥ 90% ${b9.lo}~${b9.hi} (보간 ${f2(b9.loI)}~${f2(b9.hiI)}) · ≥ 75% ${b75.lo}~${b75.hi} (보간 ${f2(b75.loI)}~${f2(b75.hiI)})`);
      (out.zones[N] ||= {})[knob] = { best: f3(best), at: b9.best, g: [b9.lo, b9.hi], gI: [f3(b9.loI), f3(b9.hiI)], y: [b75.lo, b75.hi], yI: [f3(b75.loI), f3(b75.hiI)], line: L.map((c) => [c.x, f3(c.flip), f3(c.flipC)]) };
    }
    const raw = lineOf(rows, N, 'th', 'a', 'raw'), th0 = lineOf(rows, N, 'th').find((c) => c.x === 0), Lth = lineOf(rows, N, 'th'), bth = bestOf(Lth);
    if (raw.length) P(`  볼 규칙 없이(raw zeroShot): ${raw.map((c) => `θ ${c.x} → ${f1(c.flip)}(${pct(c.flip / bth)})`).join(' · ')} — 볼(θ 0 쓸기) ${f1(th0?.flip)}(${pct(th0?.flip / bth)})`);
  }

  // ━━ 잠정(sweep.js GD) 비교 ━━ 문턱 하나씩 후보 값을 G.GD 에 잠깐 넣고(끝나면 되돌림) 게임 gdZone 그대로 → 그 손잡이 줄에서 '게임 칸 ≠ 측정 갈래' 격자점 수.
  //   최소 개수의 후보 집합에 잠정 값이 들면 '버팀', 아니면 그 집합에서 잠정에 가장 가까운 값(최소 변경). 공유 문턱이 장수 사이에 못 맞으면 장수별 값도 보인다
  P(`\n━━ 잠정 숫자(sweep.js GD) ↔ 보류 시드 — 버팀 = 게임 칸(gdZone)이 측정 갈래(≥ 90 g · 75~90 y · < 75 r)와 어긋나는 격자점 수가 최소 ━━`);
  const lineC = (N, knob) => { const L = knob === 'q' ? qLineMap(rows, N, 'a') : lineOf(rows, N, knob), best = bestOf(L); return L.map((c) => ({ x: c.x, c: cls(c.flip, best) })); };
  const misOf = (N, knob) => lineC(N, knob).filter((p) => !zoneOk(knob, G.gdZone(knob, p.x, N), p.c, p.x));
  const withGD = (path, v, fn) => { let o = G.GD; for (const k of path.slice(0, -1)) o = o[k]; const last = path.at(-1), old = o[last]; o[last] = v; try { return fn(); } finally { o[last] = old; } };
  const getGD = (path) => path.reduce((o, k) => o[k], G.GD);
  const THR = [
    { name: '영점 초록 아래 끝 s.green[N][0] (≥)', path: (N) => ['s', 'green', N, 0], knob: 's', per: true, step: 0.05, lo: 0.4, hi: 0.95 },
    { name: '영점 초록 위 끝 s.green[N][1] (≤)', path: (N) => ['s', 'green', N, 1], knob: 's', per: true, step: 0.05, lo: 0.4, hi: 0.95 },
    { name: '영점 빨강 s.red (≥)', path: () => ['s', 'red'], knob: 's', per: false, step: 0.05, lo: 0.45, hi: 1 },
    { name: '숨 회색 끝 q.weak[N] (<)', path: (N) => ['q', 'weak', N], knob: 'q', per: true, step: 0.05, lo: 0.6, hi: 0.9 },
    { name: '숨 초록 시작 q.green[N] (≥)', path: (N) => ['q', 'green', N], knob: 'q', per: true, step: 0.05, lo: 0.6, hi: 1 },
    { name: '숨 빨강(돌풍) q.red (≥)', path: () => ['q', 'red'], knob: 'q', per: false, step: 0.025, lo: 1, hi: 1.3 },
    { name: '각도 스트라이크 th.near (≥)', path: () => ['th', 'near'], knob: 'th', per: false, step: 1, lo: 10, hi: 45 },
  ];
  const cands = (t) => Array.from({ length: Math.round((t.hi - t.lo) / t.step) + 1 }, (_, i) => +(t.lo + i * t.step).toFixed(3));
  const pick = (set, g) => set.reduce((a, v) => (Math.abs(v - g) < Math.abs(a - g) - 1e-9 ? v : a), set[0]);
  const rng = (set) => (set.length ? (set.length === 1 ? `${set[0]}` : `${set[0]}~${set.at(-1)}`) : '—');
  const fit = (t, Nlist) => {
    const sc = cands(t).map((v) => [v, Nlist.reduce((acc, N) => acc + withGD(t.path(N), v, () => misOf(N, t.knob).length), 0)]);
    const min = Math.min(...sc.map((x) => x[1]));
    return { min, set: sc.filter((x) => x[1] === min).map((x) => x[0]) };
  };
  // 좌표 하강 2바퀴: 문턱마다 (다른 문턱은 지금까지 고른 값으로) 최소 어긋남 집합에서 잠정에 가장 가까운 값 → 서로 맞는 한 벌. 끝나면 G.GD 를 원래대로
  const units = THR.flatMap((t) => (t.per ? Ns.map((N) => ({ t, N, path: t.path(N) })) : [{ t, N: null, path: t.path() }]));
  const orig = units.map((u) => getGD(u.path));
  const fitU = (u) => fit(u.t, u.N == null ? Ns : [u.N]);
  try {
    for (let pass = 0; pass < 2; pass++) for (const [i, u] of units.entries()) { const f = fitU(u); let o = G.GD; for (const k of u.path.slice(0, -1)) o = o[k]; o[u.path.at(-1)] = pick(f.set, orig[i]); }
    for (const [i, u] of units.entries()) {
      const g = orig[i], f = fitU(u), holds = f.set.some((v) => Math.abs(v - g) < 1e-9), nv = pick(f.set, g);
      const N = u.N, name = u.t.per ? u.t.name.replace('[N]', `[${N}]`) : u.t.name;
      let info = `(다른 문턱은 고른 값으로) 최소 어긋남 ${f.min}칸인 값 ${rng(f.set)}`;
      let perN = null;
      if (!u.t.per) { const per = Ns.map((M) => ({ M, f: fit(u.t, [M]) })); info += ` · 장수별 ${per.map(({ M, f: fM }) => `${M}장 ${rng(fM.set)}(${fM.min}칸)`).join(' · ')}`; if (f.min > per.reduce((acc, x) => acc + x.f.min, 0)) perN = Object.fromEntries(per.map(({ M, f: fM }) => [M, pick(fM.set, g)])); }
      const left = (u.N == null ? Ns : [u.N]).flatMap((M) => misOf(M, u.t.knob).map((p) => `${u.N == null ? `${M}장 ` : ''}${p.x}(측정 ${p.c} / 게임 ${G.gdZone(u.t.knob, p.x, M)})`));
      if (left.length) info += ` · 고른 값으로도 남는 칸 ${left.join(' ')}`;
      verdict(name, g, holds, nv, info, perN);
    }
  } finally { for (const [i, u] of units.entries()) { let o = G.GD; for (const k of u.path.slice(0, -1)) o = o[k]; o[u.path.at(-1)] = orig[i]; } }
  if (units.some((u, i) => getGD(u.path) !== orig[i])) throw new Error('G.GD 되돌리기 실패');
  for (const N of Ns) {
    const D = lineOf(rows, N, 'th').find((c) => c.x === DOM.th);
    const se = Math.sqrt(mean(D.rows.map((r) => (r.flip - D.flip) ** 2)) / Math.max(1, D.rows.length - 1));
    verdict(`좋아요 기준 peak[${N}]`, G.GD.peak[N], Math.abs(D.flip - G.GD.peak[N]) <= Math.max(0.5, 2 * se), Math.round(D.flip), `보류 지배 칸 평균 ${f2(D.flip)}장 ± ${f2(se)}(표준오차, 버팀 = 차 ≤ 2 표준오차) → 좋아요(≥ ${G.GD.good} ×) ${f1(G.GD.good * D.flip)}장 · 잠정이면 ${f1(G.GD.good * G.GD.peak[N])}장`);
  }
  P(`  참고  각도 볼 th.ball (<) ${G.GD.th.ball} = 규칙(gdSwing → 쓸기 0): θ 0 쓸기 ${Ns.map((N) => `${N}장 ${pct(lineOf(rows, N, 'th').find((c) => c.x === 0)?.flip / bestOf(lineOf(rows, N, 'th')))}`).join(' · ')} 최고 · 볼 규칙 없이 물리 그대로면 θ 5 ${Ns.map((N) => `${N}장 ${pct(lineOf(rows, N, 'th', 'a', 'raw').find((c) => c.x === 5)?.flip / bestOf(lineOf(rows, N, 'th')))}`).join(' · ')}`);
  out.proposals = proposals;

  // ━━ 칩 근거 ━━
  P(`\n━━ 칩 근거 (책상 판정 · 보류 시드) — 칩이 이름 붙인 손잡이만 지배 값으로 옮긴 같은 시드 칸이 더 많이 넘긴 비율 ≥ 75% ━━`);
  const KNOB = { zHigh: 's', zLow: 's', qWeak: 'q', qGust: 'q', thBall: 'th', thNear: 'th' };
  const by = new Map(gd.filter((r) => r.kind === 'gd' && r.map === 'a').map((r) => [`${r.N}|${r.seed}|${r.s}|${r.q}|${r.th}`, r]));
  for (const N of Ns) {
    const res = {};
    for (const c of CHIP_CASES) {
      const L = lineOf(rows, N, c.knob).find((x) => x.x === c.v); if (!L) continue;
      const chips = {}, A = { n: 0, up: 0, gain: 0 }, W = { n: 0, up: 0, gain: 0 }; // A = 모든 시드 · W = 그 칩이 실제로 나온 판
      for (const r of L.rows) {
        chips[r.chip] = (chips[r.chip] || 0) + 1;
        const o = by.get(`${N}|${r.seed}|${DOM.s}|${DOM.q}|${DOM.th}`); if (!o) continue;
        for (const h of r.chip === c.want ? [A, W] : [A]) { h.n++; if (o.flip > r.flip) h.up++; h.gain += o.flip - r.flip; }
      }
      const zone = G.gdZone(c.knob, c.v, N);
      res[c.want] = { name: c.name, v: c.v, zone, chips, flip: f3(L.flip), named: { n: W.n, up: W.n ? f3(W.up / W.n) : null, gain: W.n ? f3(W.gain / W.n) : null }, all: { n: A.n, up: f3(A.up / A.n), gain: f3(A.gain / A.n) } };
      const cTxt = Object.entries(chips).map(([k, v]) => `${k} ${v}`).join(' · ');
      const verd = W.n ? (W.up / W.n >= 0.75 ? '맞음' : '미달') : '없음';
      P(`  ${verd}  ${N}장 ${c.name}(${c.knob} ${c.v} [게임 칸 ${zone}] → ${DOM[c.knob]}): 칩 ${cTxt} · 칩 ${c.want} 판에서 옮기면 더 넘김 ${W.n ? `${W.up}/${W.n} = ${pct(W.up / W.n)} · 이득 ${f2(W.gain / W.n)}장` : '— (이 칩이 안 나옴)'} · 모든 시드 ${A.up}/${A.n} = ${pct(A.up / A.n)} · 이득 ${f2(A.gain / A.n)}장 (이 칸 ${f1(L.flip)}장)`);
    }
    // 모든 줄 칸: 칩별 도움 비율(칩이 이름 붙인 손잡이 = 줄 손잡이일 때만 옮긴 칸이 지배 칸)
    const all = {};
    for (const r of gd.filter((x) => x.kind === 'gd' && x.map === 'a' && x.N === N)) {
      const k = KNOB[r.chip]; if (!k) { (all[r.chip] ||= { n: 0 }).n++; continue; }
      const mv = { s: r.s, q: r.q, th: r.th, [k]: DOM[k] }, o = by.get(`${N}|${r.seed}|${mv.s}|${mv.q}|${mv.th}`);
      const h = (all[r.chip] ||= { n: 0, m: 0, up: 0, gain: 0 }); h.n++;
      if (o && o !== r) { h.m++; if (o.flip > r.flip) h.up++; h.gain += o.flip - r.flip; }
    }
    P(`    줄 전체 칩: ${Object.entries(all).map(([c, h]) => (h.m != null ? `${c} ${h.n}(옮김 ${h.m}: 도움 ${pct(h.up / h.m)} · 이득 ${f2(h.gain / h.m)})` : `${c} ${h.n}`)).join(' · ')}`);
    out.chips[N] = { cases: res, all: Object.fromEntries(Object.entries(all).map(([c, h]) => [c, h.m != null ? { n: h.n, moved: h.m, up: f3(h.up / h.m), gain: f3(h.gain / h.m) } : { n: h.n }])) };
  }

  // ━━ G15 연습판 원 → 책상 ━━
  P(`\n━━ G15 ① 연습판(문법 D, 같은 월드): 원 → 책상 뒤집힘 · 원 밖 → 책상 OUT(걸침) ━━`);
  for (const N of Ns) {
    const L = qLineMap(rows, N, 'a'); if (!L.length) continue;
    const D = L.find((c) => c.x === DOM.q);
    P(`  ${N}장 q 줄: ${L.map((c) => `${c.x}: ${f1(c.flipC)} → ${f1(c.flip)} (밖 ${f1(c.outC)} → ${f1(c.out)}/${f1(c.hang)})`).join(' · ')}`);
    const bC = band(L.map((c) => c.x), L.map((c) => c.flipC), 0.9), bD = bandOf(L, 0.9);
    P(`    지배 칸 원 ${f2(D.flipC)} → 책상 ${f2(D.flip)} (×${f2(D.flip / D.flipC)}) · ≥ 90% 띠 원 ${f2(bC.loI)}~${f2(bC.hiI)} → 책상 ${f2(bD.loI)}~${f2(bD.hiI)}`);
    const Ls = lineOf(rows, N, 's'), Lt = lineOf(rows, N, 'th');
    P(`    s 줄 원 → 책상: ${Ls.map((c) => `${c.x}: ${f1(c.flipC)}→${f1(c.flip)}`).join(' · ')}`);
    P(`    θ 줄 원 → 책상: ${Lt.map((c) => `${c.x}: ${f1(c.flipC)}→${f1(c.flip)}`).join(' · ')}`);
    out.g15.board = out.g15.board || {};
    out.g15.board[N] = { dom: { circle: f3(D.flipC), desk: f3(D.flip), outC: f3(D.outC), out: f3(D.out), hang: f3(D.hang) }, band90: { circle: [f3(bC.loI), f3(bC.hiI)], desk: [f3(bD.loI), f3(bD.hiI)] }, q: L.map((c) => [c.x, f3(c.flipC), f3(c.flip), f3(c.outC), f3(c.out), f3(c.hang)]) };
  }
  // ━━ G15 고전 ━━
  const cl = rows.filter((r) => r.kind === 'classic');
  if (cl.length) {
    P(`\n━━ G15 ② 고전 눈높이 blow (powercurve 경로 · 같은 월드): 숨 비율 → 원 / 책상 뒤집힘(밖) · 센 숨 ÷ 초록(1.0) ━━`);
    out.g15.classic = {};
    for (const dir of ['z', 'x']) for (const N of CL.N) for (const hf of CL.H) {
      const cs = cl.filter((r) => r.dir === dir && r.N === N && r.hf === hf); if (!cs.length) continue;
      const at = (r) => cs.filter((x) => x.r === r), m = (r, f) => mean(at(r).map(f));
      const g0C = m(1, (x) => x.flipC), g0D = m(1, (x) => x.flip);
      const txt = CL.R.map((r) => `${r}: ${f1(m(r, (x) => x.flipC))}/${f1(m(r, (x) => x.flip))}(밖 ${f1(m(r, (x) => x.outC))}/${f1(m(r, (x) => x.out))})`).join(' · ');
      const rat = CL.R.slice(1).map((r) => `${r} ${f2(m(r, (x) => x.flipC) / g0C)}/${f2(m(r, (x) => x.flip) / g0D)}`).join(' · ');
      P(`  ${dir === 'z' ? '−z(게임)' : '+x(powercurve)'} ${N}장 조준 ${hf} (${at(1).length}판): ${txt}\n    ÷ 초록 원/책상: ${rat}`);
      out.g15.classic[`${dir}|${N}|${hf}`] = CL.R.map((r) => [r, f3(m(r, (x) => x.flipC)), f3(m(r, (x) => x.flip)), f3(m(r, (x) => x.outC)), f3(m(r, (x) => x.out))]);
    }
    const sum = (r) => { const v = []; for (const N of CL.N) for (const hf of CL.H) { const cs = cl.filter((x) => x.dir === 'z' && x.N === N && x.hf === hf); if (!cs.length) continue; const m = (rr, f) => mean(cs.filter((x) => x.r === rr).map(f)); v.push([m(r, (x) => x.flipC) / m(1, (x) => x.flipC), m(r, (x) => x.flip) / m(1, (x) => x.flip)]); } return v; };
    P(`  범위(−z, 9칸) 센 숨 ÷ 초록: ${CL.R.slice(1).map((r) => { const v = sum(r); return `${r} 원 ${f2(Math.min(...v.map((x) => x[0])))}~${f2(Math.max(...v.map((x) => x[0])))} · 책상 ${f2(Math.min(...v.map((x) => x[1])))}~${f2(Math.max(...v.map((x) => x[1])))} (책상 ≥ 1.0 칸 ${v.filter((x) => x[1] >= 1).length}/${v.length})`; }).join('\n    ')}`);
    out.g15.classicRange = Object.fromEntries(CL.R.slice(1).map((r) => { const v = sum(r); return [r, { circle: [f3(Math.min(...v.map((x) => x[0]))), f3(Math.max(...v.map((x) => x[0])))], desk: [f3(Math.min(...v.map((x) => x[1]))), f3(Math.max(...v.map((x) => x[1])))], deskGe1: v.filter((x) => x[1] >= 1).length, cells: v.length }]; }));
  }

  // ━━ 숨 손잡이 ━━
  const kn = rows.filter((r) => r.kind === 'gd' && (r.map === 'b' || r.map === 'b2'));
  if (kn.length || rows.some((r) => r.kind === 'gd' && KNOB_Q.a.includes(r.q))) {
    P(`\n━━ 숨 난이도 손잡이 (책상 판정 · 보류 시드 · s ${DOM.s} θ ${DOM.th}) — 초록 폭 = ≥ 90% 보간 구간의 당김 px (${PHONE} px 폰, 당김 끝 ${f1(pxOfQ(G.GD.q.max))} px = q ${G.GD.q.max}) ━━`);
    for (const N of Ns) {
      out.knob[N] = {};
      for (const map of ['a', 'b', 'b2']) {
        const L = qLineMap(rows, N, map); if (L.length < 4) continue;
        const best = bestOf(L), b9 = bandOf(L, 0.9), b75 = bandOf(L, 0.75), b95 = bandOf(L, 0.95);
        const px = (b) => pxOfQ(Math.min(b.hiI, G.GD.q.max)) - pxOfQ(Math.max(b.loI, G.GD.q.min));
        P(`  ${N}장 (${map}) ${MAPS[map].txt}: ${L.map((c) => `${c.x}:${f1(c.flip)}`).join(' ')}`);
        P(`    최고 ${f1(best)} · ≥ 90% ${f2(b9.loI)}~${f2(b9.hiI)} = ${f1(px(b9))} px · ≥ 75% ${f2(b75.loI)}~${f2(b75.hiI)} = ${f1(px(b75))} px${map === 'a' ? ` · (c) 그림만 ≥ 95% ${f2(b95.loI)}~${f2(b95.hiI)} = ${f1(px(b95))} px` : ''} · 1.25 → ${pct(L.at(-1).flip / best)}`);
        // 빨강(돌풍) 문턱이 들어갈 구간: (≥ 90% 마지막 격자, 그 위 첫 < 75% 격자] — 사이 75~90% 칸은 어느 쪽이든 맞음(게임 숨 위쪽엔 노랑 칸 없음)
        const firstR = L.find((c) => c.x > b9.hi && c.flip < 0.75 * best)?.x ?? Infinity;
        out.knob[N][map] = { best: f3(best), g: [f3(b9.loI), f3(b9.hiI)], gPx: f3(px(b9)), y: [f3(b75.loI), f3(b75.hiI)], yPx: f3(px(b75)), g95: [f3(b95.loI), f3(b95.hiI)], g95Px: f3(px(b95)), redIn: [b9.hi, firstR], line: L.map((c) => [c.x, f3(c.flip), f3(c.out)]) };
      }
    }
    for (const map of ['a', 'b', 'b2']) {
      const iv = Ns.map((N) => out.knob[N]?.[map]?.redIn).filter(Boolean); if (!iv.length) continue;
      const lo = Math.max(...iv.map((x) => x[0])), hi = Math.min(...iv.map((x) => x[1])), cand = +(Math.floor(lo / 0.025 + 1e-9) * 0.025 + 0.025).toFixed(3);
      const red = cand <= hi + 1e-9 ? cand : null;
      P(`  (${map}) 빨강 문턱 q.red 구간 ${Ns.map((N) => `${N}장 (${out.knob[N][map].redIn[0]}, ${out.knob[N][map].redIn[1]}]`).join(' · ')} → ${red != null ? `한 값 ${red}` : '한 값 없음'} · 초록 폭(장수별 위 문턱 = 이 값) ${Ns.map((N) => `${N}장 ${f1(pxOfQ(Math.min(red ?? out.knob[N][map].g[1], G.GD.q.max)) - pxOfQ(G.GD.q.green[N]))} px`).join(' · ')}`);
      out.knob[map] = { red };
    }
    // 같은 물리 확인: 세기·돌풍이 같은 (a)·(b)·(b2) 칸은 정지 해시가 같다(손잡이 = 게이지 위 돌풍 구간의 이름표만 바꿈)
    const grp = new Map();
    for (const r of rows.filter((x) => x.kind === 'gd' && x.blast > 0)) { const k = `${r.N}|${r.seed}|${r.s}|${r.th}|${r.power}|${r.blast}`; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(r); }
    const multi = [...grp.values()].filter((v) => new Set(v.map((r) => r.map)).size > 1), eq = multi.filter((v) => new Set(v.map((r) => r.hash)).size === 1).length;
    P(`  같은 세기·돌풍인 다른 손잡이 칸 ${multi.length}묶음 중 정지 해시 같음 ${eq} → ${eq === multi.length ? '맞음' : '틀림'} (손잡이는 물리가 아니라 당김 → 돌풍 대응만 바꿈)`);
    out.knob.sameBlast = { groups: multi.length, equal: eq };
  }
  if (json) console.log(JSON.stringify(out));
  return out;
}

// ───────────────────────── 진입 ─────────────────────────
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepgdWorker) {
  await V1.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage(shotRow(job)); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  const t0 = Date.now();
  if (cmd === 'self') await self();
  else if (cmd === 'list') { for (const st of ['held', 'knob', 'classic']) console.log(`${st}: ${makeJobs(st).length}샷`); }
  else if (cmd === 'run') await run(a[0], a[1], +(a[2] || 2));
  else if (cmd === 'same') await same(a[0], a[1], +(a[2] || 24));
  else if (cmd === 'report') report(a.find((x) => !x.startsWith('--')), a.includes('--json'));
  else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}

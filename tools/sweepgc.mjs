// tools/sweepgc.mjs — 쓸기 문법 C '영점 조준' Node 측정 (구현 전). 물리 = 게임 그대로(mockup/src/sim.js blowProg = 9차 입술 경로, 새 힘 모델 없음),
//   더미·호출 순서 = G.flickShot 과 같음(Table 시드 = seed·7907 + N · settle 600 · blowProg · step → after → stepJudge). CLI 가드: 직접 실행할 때만 돈다.
//
// 🧭 가설(측정 전): 영점 s 는 기둥 옆면 위(모서리~꼭대기)에서만 정직하게 의미가 있고, 최적 s 는 장수마다 다르다(한 칸 지배 없음).
//   **가설 수정 (확인됨, 고르기 801~812 · 보류 813~824, 원자료 tools/coresweep/data/gc/)**: 자동 시작(위 절반 10° + 0.15 s)이면 지형이 평평하다 —
//     한 칸 (s 0.55, q 0.9, θ 40°) 이 모든 장수에서 최고의 94~100%(고르기 95~97% · 보류 94~100%) → '지배 칸 있음'. 장수별 최고 칸 차이는 고원 안 잡음 수준.
//     선택이 갈리는 곳은 절벽뿐: 영점 위쪽(s ≥ 0.7 → 76~90%, 0.8 → 51~75%, 꼭대기 모서리 15~30%) · 쓸기 없음(θ 0 → 31~52%, θ 12 는 10장 63~68%)
//     · 약한 숨(40장 q 0.7 → 57~70%, q 0.6 → 21~28%) · 약한 숨의 아래 모서리(q 0.7 에서 s 0.4 → 30장 5~11장 = 최고의 24~50% · 40장 1.4장).
//     숨이 약할수록 영점을 높여야 한다(40장: q 0.6 → s* 0.7 · q 0.7 → 0.6 · q ≥ 0.85 → 0.55) — 맞물림은 있지만 고원 안이다.
//   **바닥 영점 (확인됨)**: 정직한 길(wall = 책상 높이 수평 제트 × 0.8)로는 아래 모서리 영점과 같다(쓸기 있으면 바닥 최고 ÷ 기둥 최고 0.93~1.00, θ 0 이면 20~40장 0~3.6장).
//     하한(zero = 책상에 맞은 바람 0)은 wall 의 0.08~0.64배 — 결과가 '책상 흐름'이라는 잴 수 없는 가정에 달렸다 → 게임 곡선은 기둥 옆면(아래 모서리~꼭대기)으로 제한.
//     정직 아닌 두 모델은 들쭉날쭉(virtual ÷ wall 0.39~1.25, mirror 0.84~1.01) — 부풀림·빠짐이 장수마다 다르다.
//   **눈금(탭) 손잡이 (모의, 손 미검증)**: 영점 s(기둥 0.4~1)만 '아무 때나 탭'과 실력 탭의 차이가 크다 — 고른 칸 줄에서 아무 때나 63~82%(≥90% 확률 26~58%)
//     대 σ 60 ms·왕복 1.2 s 탭 89~96%(73~100%). q(아무 때나 85~96%)·θ(83~86%)는 고원이 넓어 눈금이 거의 공짜다.
//   **자동 시작 (확인됨, auto)**: 'cue10+0.15' 가 고정 0.3·0.35 s 와 3% 안이고 어느 장수에서도 최고 규칙의 0.97 이상(아래 RULE 주석).
//   **문법 B 대비**: 지배 칸 ÷ B 최고(사후 최고 q·휙 시각, B 에 유리) = 10장 1.56~1.69 · 20장 1.08 · 30장 0.97~1.06 · 40장 1.03 (보류 [0.96, 1.10]) — 때를 손이 안 맞춰도 B 의 완벽한 휙과 같다.
//   해석 한계: 시드 12개라 칸 평균 표준오차 0.2~0.7장 → ≥90% 띠 끝은 한 칸 흔들림에 민감(40장 고르기 s 띠 0.50~0.63 은 0.5 칸 하나가 0.2장 모자라서) · 손 오차 σ 는 가정
//
// 문법 C (재윤님 설계 2026-10-16): ① 옆모습에서 더미 기둥 → 앞 바닥으로 내려가는 곡선 위의 '영점' P(바람이 처음 닿는 곳)를 끌어 고른다.
//   ② 기둥 시점으로 돌아와 엄지 아래 = 숨 세기 q(D(q) 는 문법 B 그대로), 엄지 위 = 올려 쓸기 각 θ(영점에서 위로), 떼면 발사.
//   ③ 발사 뒤 때는 자동(이 도구가 규칙을 비교). 실력 = 영점 + 숨 + 각. 셋 중 하나는 '왔다 갔다 눈금 + 탭' 게임 요소(재윤님).
//
// 모델(이 도구의 정의 — 게임 구현은 이것을 옮긴다):
//   곡선 s ∈ [0, 1]: s < S_BASE(0.4) = 바닥, 더미 앞면(z_f = 중심 z + 1)에서 앞으로 d = D_FLOOR(2 u = 지름 1 D)·(1 − s/0.4) 인 책상 점.
//                    s ≥ 0.4 = 기둥 옆면, 높이 h = top·(s − 0.4)/0.6 (0.4 = 아래 모서리, 1 = 꼭대기 모서리).
//   입·자세: 문법 B 와 같은 목 축 기하(sweep.js GEO·poseAt 'c', 입 시작 (중심 x, 0.5 u, z_f + 4 u) = 실물 1번 판 거리 약 2 D, 06 §2).
//            영점 자세 α0 = 제트 축이 P 를 처음 지나는 고개 각(이분 60회, 소수 4자리 °). 기둥 h < 0.5 u 와 바닥 영점은 α0 < 0(고개 숙임, 입이 내려옴).
//            s = 0(1 D 앞 책상) → α0 ≈ −5.0°, 입 높이 ≈ 0.19 u(4.8 mm) ≥ lipMinY 0.15 — 입은 책상 밑에 안 간다.
//   올려 쓸기: α(t) = α0 + alphaOf({A: θ, w: 80 °/s, t0: tUp})(t) — 문법 B 의 휙과 같은 식·같은 속도(GB.w), 시작점만 α0, 폭만 θ.
//   숨: D(q) = gbD(q)(문법 B), 봉투 rel(0.26 s 오름 → 평평 → 0.04 s 끊김). 시각은 화면 초(물리 P.t, 놓은 순간 0).
//   자동 시작 tUp 규칙(rule): 'fixT' = 숨 시작 뒤 T 초 고정 · 'cueX+δ' = 위 절반 평균 기울기 ≥ X° 인 첫 스텝 끝 시각 + δ (FB 0.4 s 까지 안 뜨면 0.4 s 를 단서로 봄)
//   바닥 영점의 바람(제트 축이 앞면보다 먼저 책상에 닿는 동안, floor):
//     'wall'    정직(주 모델): 책상 따라 흐르는 바람 = 책상 높이(lipMinY 0.15 u) 수평 제트 · 자유 경로 길이 그대로 · 세기 × 0.8(v1 8차 reflLoss)
//               = ownclips 'wall' 그대로(06 §4). 입술 경로라 틈 0 테두리에 파고들기 없음(lipGap ≤ 진짜 틈), 가상 입 없음. '책상 입'(9차 blowLip 0.15)보다 약하거나 같다
//     'zero'    하한: 책상에 맞은 바람은 더미에 0 (정직한 반사는 약했다 — round9 scoopmap '약한 수평 불기')
//     'mirror'  참고(정직 아님 쪽): 책상 밑 거울 입에서 위로 꺾인 제트 × 0.8 (ownclips 'mirror', 7차 '책상 밑 가상 입'과 같은 꼴 — 감도 확인용)
//     'virtual' 참고(정직 아님): 아무것도 안 함 — 제트가 책상을 뚫고 지나가 맨 아래 장 밑동을 친다(입술 경로 가림은 딱지만). 부풀림 크기만 보려고
//   기둥 영점(s ≥ 0.4)은 처음부터 제트가 앞면에 바로 닿으므로 floor 와 무관(올려 쓸기는 위로만 → 바닥 단계 없음).
//   알려진 근사: 기둥 h < 0.5 u 칸은 제트가 아래로 2~4° 기울어, 축이 앞면 뒤(더미 안)에서 책상 밑으로 0.1~0.15 u 내려간다 — 힘 모델은 책상에서 안 끊음(기존 9차 경로와 같은 근사)
//
// 명령 (CPU 4코어, 일꾼 4 = 무거운 프로세스 1개)
//   node tools/sweepgc.mjs self                     기록·자동 시작 훅이 물리를 안 건드림: α0 0·θ 24·fixT ≡ G.flickShot(ts T) · θ 0 ≡ flickShot(안 휙) 해시 (약 15초)
//   node tools/sweepgc.mjs geo                      곡선 s → α0·입 높이·바닥 거리·앞면 높이 표(장수별 정착 꼭대기 · 시드 801)
//   node tools/sweepgc.mjs list                     단계별 샷 수
//   node tools/sweepgc.mjs run <단계> <out.jsonl> [W=4]   이어 돌리기(이미 있는 (장수, 시드, 키) 건너뜀) · 끝나면 키 순 정렬 (40장 한 샷 일꾼당 약 1~3 초)
//        pilot  참고 시드 901~904(판정·고르기 밖) · 격자 범위 정하기만 (1,632샷)
//        auto   고르기 시드 801~812 · 자동 시작 규칙 7개(RULES) × s 0.4~0.7 × q 0.7/0.85/1 × θ 0/12/24/40 (12,672샷, 약 75분)
//        map    고르기 시드 801~812 · 주 격자 s 10 × q 8 × θ 6 (고른 규칙 RULE) + 기준선(문법 B α0 0·24°·휙 0.25~0.4 · 안 휙 · 고전 눈높이) (23,904샷, 약 85분)
//        held   보류 시드 813~824 · choice.json(map 에서 choose)의 장수별 최고 칸 q*±1칸 s × θ 평면 + (s*, θ*) q 줄 + 고른 칸 3개 + 다른 장수 최고 칸 + 기준선 (9,912샷, 약 30분)
//        floor  고르기 시드 801~812 · 바닥 모델 4개(wall/zero/mirror/virtual) × s 0/0.2 × q 0.85/1 × θ 0/24/40 + 아래 모서리 기준 (2,592샷)
//   node tools/sweepgc.mjs choose <map.jsonl[.gz]> [choice.json]   고르기 시드 → 장수별 최고 칸·고른 칸 후보 3개 (held 격자의 중심)
//   node tools/sweepgc.mjs same <단계> <원자료.jsonl[.gz]> [n=24]   고르게 n 개 다시 돌려 JSON 비트 대조
//   node tools/sweepgc.mjs report <파일[,파일…]>      기준선·규칙 비교·바닥 모델·지도·최고 칸·≥90% 띠·지배 확인·눈금(탭) 모의·영점 눈금(q 별)·자동 시작 시각
//        CENTER=choice 면 띠·눈금 중심 = choice.json 의 고르기 시드 최고 칸(보류 시드 확인용)
//   node tools/sweepgc.mjs lines [--json]           게임 원인 칩 줄: 장수별 지배 칸 (0.55, 0.9, 40) 을 지나는 s·q·θ 1차원 줄(지배 칸 평균 대비, map 원자료)
//                                                   --json 출력 = mockup/src/sweep.js GC_LINES (sweepgame ctl 이 문자열 대조)
//   node tools/sweepgc.mjs chips [--json]            기둥 줄마다 칩(chipOf = 게임 gcChip 규칙) · 좋아요·mixed 아닌 칩 줄은 같은 시드에서 이름 붙은 손잡이만
//                                                   지배 값으로 옮긴 칸과 비교(도움 비율·평균 이득) — map 전부 · held 는 s·θ 칩만 (1초)
//   원자료 다시 보기: D=tools/coresweep/data/gc; report $D/auto.jsonl.gz · report $D/map.jsonl.gz · report $D/floor.jsonl.gz · CENTER=choice report $D/held.jsonl.gz
//   다시 만들기: run auto · run map · choose · run held · run floor (gzip -n -9 로 묶음) — 같은 명령이면 같은 파일(키 순 정렬)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as V1 from '../mockup/src/sim.js';
import * as G from '../mockup/src/sweep.js';
import { pairedRatio } from './sweepmap.mjs';

const D2R = Math.PI / 180;
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const S_BASE = 0.4, D_FLOOR = 2, W_UP = G.GB.w, FB = 0.4, LOSS = 0.8;
export const SEEDS = { pilot: R(901, 904), sel: R(801, 812), held: R(813, 824) };
export const NS = [10, 20, 30, 40];
// 주 격자(pilot 901~904 를 보고 정함, 판정 시드 밖): s 는 바닥 2칸(0·0.2 — pilot 에서 바닥 wall ≈ 모서리) + 모서리·0.5~0.7 촘촘(0.05, 절벽 자리) + 0.8·1(나쁜 끝)
//   θ 는 0(고정 바람)·12·16·20·24(띠 아래 끝이 16~24 사이)·40(위 끝, pilot 24 ≈ 40) · q 는 0.6~1.1 (q 만 양쪽 산이라 0.8~1.0 을 0.05 간격)
//   40장 한 샷이 일꾼당 약 2.8 초(auto 실측)라 칸 수를 480 으로 줄임(8 은 pilot 에서 0 보다 나쁜 '꼭대기 머묾' 칸이라 뺌)
export const S_GRID = (process.env.SG || '0,0.2,0.4,0.5,0.55,0.6,0.65,0.7,0.8,1').split(',').map(Number);
export const TH_GRID = (process.env.TG || '0,12,16,20,24,40').split(',').map(Number);
export const Q_GRID = (process.env.QG || '0.6,0.7,0.8,0.85,0.9,0.95,1,1.1').split(',').map(Number);
// 보류(held) 격자는 고르기(map) 결과 choice.json 에서: 장수마다 최고 칸 q* 와 이웃 q 2개의 s × θ 평면 + (s*, θ*) 의 q 줄 + 고른 '고른 칸' 후보
export const CHOICE = process.env.CHOICE || new URL('./coresweep/data/gc/choice.json', import.meta.url).pathname;
export const RULES = (process.env.RULES || 'fix0.25,fix0.3,fix0.35,fix0.4,cue10+0.1,cue10+0.15,cue10+0.2').split(',');
// 고른 자동 시작(auto 단계, 고르기 시드 801~812, 12,672샷): 'cue10+0.15' = 위 절반 평균 기울기 10° (= 들림) 뒤 0.15 s(화면, 벽시계 0.3 s).
//   같은 칸 짝 비(cue10+0.15 대비, 10/20/30/40장): fix0.3 0.97/1.03/1.00/0.97 · fix0.35 0.97/0.99/0.98/1.01 · cue10+0.1 0.81~0.95 · cue10+0.2 0.85~0.95 · fix0.25 0.76~0.88 · fix0.4 0.80~0.92
//   → 고정 0.3~0.35 s 와 3% 안이고 어느 장수에서도 최고 규칙의 0.97 이상. 더미가 '들릴 때' 시작이라 영점·숨·장수에 따라 저절로 맞춰지고, 옆모습 창에 그대로 보인다(문법 B 단서와 같은 10°)
//   (pilot 의 '고정 0.3 > 단서'는 단서 지연 0.06 이 짧았던 탓 — 가설 수정)
export const RULE = process.env.RULE || 'cue10+0.15';
export const FLOORS = ['wall', 'zero', 'mirror', 'virtual'];

// ───────────────────────── 곡선 기하 ─────────────────────────
// 앞면 z_f = 0 기준 자세(sweep.js hitC 와 같은 기준). faceH = 축이 앞면을 지나는 높이, floorD = 축이 책상(y 0)에 닿는 앞면 앞 거리(φ < 0 일 때)
const poseRel = (aDeg) => G.poseAt(aDeg * D2R, 'c', G.GEO, { x: 0, y: G.GEO.ym, z: G.GEO.L });
export const faceH = (aDeg) => G.hitC(aDeg);
export function floorD(aDeg) { const p = poseRel(aDeg); return p.phi < 0 ? p.o.z - p.o.y / Math.tan(-p.phi) : Infinity; }
function bis(f, target, lo, hi, up = true) { for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if ((f(m) > target) === up) hi = m; else lo = m; } return (lo + hi) / 2; }
export const A_BASE = bis(faceH, 0, -8, 0); // 축이 아래 모서리(앞면 y 0)를 지나는 각
export function a0Of(s, top) {
  const a = s >= S_BASE ? bis(faceH, (top * (s - S_BASE)) / (1 - S_BASE), -8, 60) : bis(floorD, D_FLOOR * (1 - s / S_BASE), -8, A_BASE, false);
  return +a.toFixed(4);
}

// ───────────────────────── 한 숨의 조종(문법 C) ─────────────────────────
// rule: { kind: 'fix', T } | { kind: 'cue', X, d } · floor: 'wall'|'zero'|'mirror'|'virtual'
export function parseRule(s) {
  let m = /^fix([\d.]+)$/.exec(s); if (m) return { kind: 'fix', T: +m[1] };
  m = /^cue(\d+)\+([\d.]+)$/.exec(s); if (m) return { kind: 'cue', X: +m[1], d: +m[2] };
  throw new Error('규칙 ' + s);
}
export class GcCtl {
  constructor(table, { a0, theta, q, rule, floor = 'wall' }) {
    const c = table.pileCenter();
    this.zf = c.z + 1;
    this.M0 = { x: c.x, y: G.GEO.ym, z: this.zf + G.GEO.L };
    this.top0 = table.columnTop();
    this.a0r = a0 * D2R; this.theta = theta; this.floor = floor;
    this.rule = typeof rule === 'string' ? parseRule(rule) : rule;
    this.D = G.gbD(q);
    this.br = G.breathOf('rel', this.D, G.SWEEP.off);
    this.dur = this.br.dur;
    this.tUp = null; this.al = null;
    if (this.rule.kind === 'fix') this.lock(this.rule.T);
    this.k = 0; this.calls = 0; this.seen = 0;
    this.rec = { cueT: -1, tUp: -1, ttUp: -1, floorSteps: 0, tTop: -1, maxTT: 0, maxTB: 0, yHit0: null };
    this.below = false; this.yHit = null;
    this.prog = (t) => this._prog(t);
  }
  lock(t0) { this.tUp = t0; this.al = this.theta > 0 ? G.alphaOf({ A: this.theta, w: W_UP, t0 }) : null; }
  _prog(t) {
    this.calls++;
    const aRad = this.a0r + (this.al ? this.al(t) : 0);
    const p = G.poseAt(aRad, 'c', G.GEO, this.M0);
    let o = p.o, phi = p.phi, env = this.br.env(t);
    this.yHit = p.o.y + Math.tan(p.phi) * (p.o.z - this.zf); // 앞면에서 축 높이(직진 기하)
    if (phi < 0) {
      const h = o.y, dist = o.z - this.zf, sImp = h / Math.tan(-phi);
      if (sImp < dist) { // 축이 앞면보다 먼저 책상에 닿음 = 바닥 단계
        this.rec.floorSteps++;
        if (this.floor === 'wall') { const free = h / Math.sin(-phi); o = { x: o.x, y: V1.TUNE.lipMinY, z: this.zf + (dist - sImp) + free }; phi = 0; env *= LOSS; }
        else if (this.floor === 'mirror') { o = { x: o.x, y: -h, z: o.z }; phi = -phi; env *= LOSS; }
        else if (this.floor === 'zero') env = 0;
        else if (this.floor !== 'virtual') throw new Error('floor ' + this.floor);
      }
    }
    return { o, phi, ux: 0, uz: -1, env };
  }
  // 매 table.step() 직후(게임 frame 루프와 같은 순서). 읽기만 — 자동 시작 잠금은 다음 스텝 prog 부터 쓰인다
  after(table) {
    const k = this.k++, R = this.rec, tk = +((k + 1) * table.T.dt).toFixed(4);
    if (this.calls > this.seen) {
      this.seen = this.calls;
      if (R.yHit0 == null) R.yHit0 = +this.yHit.toFixed(4);
      if (R.tTop < 0) { if (this.yHit <= this.top0) this.below = true; else if (this.below) R.tTop = tk; }
    }
    if (k < 240) {
      const [tb, tt] = G.halves(table);
      if (tt > R.maxTT) R.maxTT = tt;
      if (tb > R.maxTB) R.maxTB = tb;
      if (R.cueT < 0 && tt >= 10) R.cueT = tk;
      if (this.tUp == null && this.rule.kind === 'cue' && table.puff && (tt >= this.rule.X || tk >= FB)) this.lock(+(Math.min(tk, FB) + this.rule.d).toFixed(4));
      if (R.ttUp < 0 && this.tUp != null && tk >= this.tUp) R.ttUp = +tt.toFixed(1);
    }
  }
}

// ───────────────────────── 한 샷 ─────────────────────────
// job.kind: 'gc'(s, q, th, rule, floor) · 'a0'(α0 직접 — 문법 B 기준 α0 0: a0, q, th, rule) · 'classic'(지금 게임 눈높이: 위에서 k 장째, 초록 0.95)
export function gcShot(job) {
  const { N, seed } = job;
  const t = new V1.Table(G.practiceTableSeed(N, seed), { lift: 519.59 });
  t.addPile(Array.from({ length: N }, (_, i) => i));
  t.settle(600);
  const top = t.columnTop();
  let ctl = null, a0 = null;
  if (job.kind === 'classic') {
    const c = t.pileCenter(), pitch = top / N;
    t.blow({ aim: { x: c.x, y: top - (job.k - 0.5) * pitch, z: c.z + 1 }, dir: { x: 0, z: -1 }, power: 0.95, blast: 0 });
  } else {
    a0 = job.kind === 'a0' ? job.a0 : a0Of(job.s, top);
    ctl = new GcCtl(t, { a0, theta: job.th, q: job.q, rule: job.rule, floor: job.floor || 'wall' });
    t.blowProg({ prog: ctl.prog, power: job.q, dur: ctl.dur });
  }
  const j = { n: 0, quiet: 0 };
  let steps = 0;
  do { t.step(); ctl?.after(t); steps++; } while (!t.stepJudge(j));
  const Rj = t.judgeResult();
  const half = Math.floor(N / 2);
  const flipBot = Rj.flipped.filter((d) => d.id < half).length;
  const row = {
    N, seed, key: job.key, kind: job.kind, s: job.s ?? null, q: job.q ?? 0.95, th: job.th ?? null, rule: job.rule ?? null, floor: job.floor ?? null, k: job.k ?? null,
    top: +top.toFixed(4), a0, flip: Rj.flipped.length, flipAny: t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && !d.off).length, out: Rj.outs.length,
    flipBot, flipTop: Rj.flipped.length - flipBot, steps, hash: G.poseHash(t),
  };
  if (ctl) { const r = ctl.rec; Object.assign(row, { D: ctl.D, tUp: ctl.tUp, cueT: r.cueT, ttUp: r.ttUp, floorSteps: r.floorSteps, tTop: r.tTop, yHit0: r.yHit0, maxTT: +r.maxTT.toFixed(1), maxTB: +r.maxTB.toFixed(1) }); }
  return row;
}

// ───────────────────────── 작업 목록 ─────────────────────────
const gcJob = (N, seed, s, q, th, rule, floor = 'wall') => ({ N, seed, kind: 'gc', s, q, th, rule, floor, key: `gc|s${s}|q${q}|th${th}|${rule}|${floor}` });
const a0Job = (N, seed, a0, q, th, rule) => ({ N, seed, kind: 'a0', a0, q, th, rule, key: `a0|a${a0}|q${q}|th${th}|${rule}` });
const classicJob = (N, seed, k) => ({ N, seed, kind: 'classic', k, key: `classic|k${k}` });
const readText = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)).toString('utf8') : readFileSync(f, 'utf8'));
export const readRows = (files) => files.split(',').flatMap((f) => readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
// θ 0 이면 자동 시작 규칙이 물리에 안 들어간다(쓸기 없음) → 규칙 칸을 하나로 접어 같은 샷을 두 번 안 돌린다
const thRule = (th, rule) => (th === 0 ? 'fix0' : rule);

export function makeJobs(stage) {
  const J = [], seen = new Set();
  const push = (jb) => { const id = `${jb.N}|${jb.seed}|${jb.key}`; if (!seen.has(id)) { seen.add(id); J.push(jb); } };
  if (stage === 'pilot') {
    for (const N of NS) for (const seed of SEEDS.pilot) {
      for (const s of [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) for (const th of [0, 8, 16, 24, 40]) for (const rule of ['fix0.3', 'cue10+0.06']) push(gcJob(N, seed, s, 0.85, th, thRule(th, rule)));
      for (const q of [0.6, 1, 1.15]) for (const s of [0.4, 0.6, 0.8]) for (const th of [0, 24]) push(gcJob(N, seed, s, q, th, thRule(th, 'cue10+0.06')));
      for (const ts of [0.25, 0.3, 0.35]) push(a0Job(N, seed, 0, 0.85, 24, `fix${ts}`));
    }
  } else if (stage === 'auto') {
    for (const N of NS) for (const seed of SEEDS.sel) {
      for (const s of [0.4, 0.5, 0.6, 0.7]) for (const q of [0.7, 0.85, 1]) for (const th of [0, 12, 24, 40]) for (const rule of RULES) push(gcJob(N, seed, s, q, th, thRule(th, rule)));
    }
  } else if (stage === 'map' || stage === 'held') {
    const seeds = stage === 'map' ? SEEDS.sel : SEEDS.held;
    const ch = stage === 'held' ? JSON.parse(readFileSync(CHOICE, 'utf8')) : null;
    if (ch && ch.rule !== RULE) throw new Error(`held: choice.json 규칙 ${ch.rule} ≠ RULE ${RULE}`);
    for (const N of NS) for (const seed of seeds) {
      if (!ch) for (const s of S_GRID) for (const q of Q_GRID) for (const th of TH_GRID) push(gcJob(N, seed, s, q, th, thRule(th, RULE)));
      else {
        const b = ch.best[N], qi = Q_GRID.indexOf(b.q);
        for (const q of Q_GRID.slice(Math.max(0, qi - 1), qi + 2)) for (const s of S_GRID) for (const th of TH_GRID) push(gcJob(N, seed, s, q, th, thRule(th, RULE)));
        for (const q of Q_GRID) push(gcJob(N, seed, b.s, q, b.th, thRule(b.th, RULE)));
        for (const c of ch.uni) push(gcJob(N, seed, c.s, c.q, c.th, thRule(c.th, RULE)));
        for (const M2 of NS) { const o = ch.best[M2]; push(gcJob(N, seed, o.s, o.q, o.th, thRule(o.th, RULE))); } // 다른 장수의 최고 칸(손잡이 맞바꾸기 확인)
      }
      for (const q of [0.7, 0.85, 1]) for (const ts of [0.25, 0.3, 0.35, 0.4]) push(a0Job(N, seed, 0, q, 24, `fix${ts}`)); // 문법 B 기준(α0 0 · 24° · 휙 ts)
      for (const q of [0.7, 0.85, 1]) push(a0Job(N, seed, 0, q, 0, 'fix0')); // 문법 B 안 휙
      for (const k of [2, 3, 4]) push(classicJob(N, seed, k));
    }
  } else if (stage === 'floor') {
    for (const N of NS) for (const seed of SEEDS.sel) {
      for (const floor of FLOORS) for (const s of [0, 0.2]) for (const q of [0.85, 1]) for (const th of [0, 24, 40]) push(gcJob(N, seed, s, q, th, thRule(th, RULE), floor));
      for (const q of [0.85, 1]) for (const th of [0, 24, 40]) push(gcJob(N, seed, 0.4, q, th, thRule(th, RULE))); // 아래 모서리(바닥 단계 없음) 기준
    }
  } else throw new Error('단계 ' + stage);
  return J;
}

// ───────────────────────── 일꾼 ─────────────────────────
async function run(stage, out, W) {
  await V1.initPhysics();
  const jobs = makeJobs(stage);
  const tag = (r) => `${r.N}|${r.seed}|${r.key}`;
  const done = new Set(existsSync(out) ? readText(out).split('\n').filter(Boolean).map((l) => tag(JSON.parse(l))) : []);
  const todo = jobs.filter((j) => !done.has(tag(j)));
  // 무거운 것(40장)부터 → 끝 무렵 일꾼이 놀지 않게
  todo.sort((a, b) => b.N - a.N);
  console.log(`run ${stage}: 작업 ${jobs.length} · 이미 ${jobs.length - todo.length} · 남음 ${todo.length} · 일꾼 ${W} · RULE=${RULE}`);
  const t0 = Date.now();
  let k = 0, got = 0;
  await new Promise((res) => {
    const nW = Math.min(W, todo.length);
    let alive = nW;
    if (!nW) return res();
    for (let w = 0; w < nW; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sweepgcWorker: 1 } });
      const next = () => wk.postMessage(k < todo.length ? todo[k++] : null);
      wk.on('message', (m) => {
        if (m.ready) return next();
        appendFileSync(out, JSON.stringify(m) + '\n');
        if (++got % 500 === 0) console.error(`  ${got}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
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
  const stored = new Map(readText(file).split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [`${r.N}|${r.seed}|${r.key}`, l]; }));
  const stride = Math.max(1, Math.floor(jobs.length / n));
  let good = 0, bad = 0, miss = 0;
  for (let i = 0; i < jobs.length && good + bad + miss < n; i += stride) {
    const j = jobs[i], l = stored.get(`${j.N}|${j.seed}|${j.key}`);
    if (l === undefined) { miss++; continue; }
    if (JSON.stringify(gcShot(j)) === l) good++; else { bad++; console.log(`  다름: ${j.N}장 ${j.seed} ${j.key}`); }
  }
  console.log(`sweepgc same ${stage}: 같음 ${good} · 다름 ${bad} · 원자료에 없음 ${miss} → ${bad || miss ? '틀림' : '맞음'}`);
  if (bad || miss) process.exitCode = 1;
}

// self: α0 0 · θ 24 · fixT ≡ 문법 B flickShot(ts T) / θ 0 ≡ 안 휙 — 같은 일정이면 정지 해시까지 같아야 한다(기록·자동 시작 훅이 물리를 안 건드림)
async function self() {
  await V1.initPhysics();
  let bad = 0;
  const cells = [{ N: 30, seed: 801, q: 0.85, ts: 0.3 }, { N: 40, seed: 802, q: 1, ts: 0.35 }, { N: 10, seed: 803, q: 0.7, ts: 0.2 }, { N: 20, seed: 804, q: 0.9, ts: 0.25 }];
  for (const c of cells) {
    const r = gcShot({ N: c.N, seed: c.seed, kind: 'a0', a0: 0, q: c.q, th: 24, rule: `fix${c.ts}`, key: 'x' });
    const p = G.flickShot(V1.Table, { N: c.N, seed: c.seed, q: c.q, ts: c.ts });
    const ok = p.hash === r.hash && p.flips === r.flip && p.outs === r.out && p.steps === r.steps;
    if (!ok) bad++;
    console.log(`  ${ok ? '맞음' : '틀림'}  ${c.N}장 ${c.seed} q${c.q} 휙 ${c.ts} → 뒤집힘 ${r.flip}/${p.flips} 원 밖 ${r.out}/${p.outs} 스텝 ${r.steps}/${p.steps} 해시 ${r.hash}/${p.hash}`);
  }
  for (const c of [{ N: 40, seed: 805, q: 0.85 }, { N: 20, seed: 806, q: 1.1 }]) {
    const r = gcShot({ N: c.N, seed: c.seed, kind: 'a0', a0: 0, q: c.q, th: 0, rule: 'fix0', key: 'x' });
    const p = G.flickShot(V1.Table, { N: c.N, seed: c.seed, q: c.q });
    const ok = p.hash === r.hash && p.flips === r.flip;
    if (!ok) bad++;
    console.log(`  ${ok ? '맞음' : '틀림'}  안 휙 ${c.N}장 ${c.seed} q${c.q} → 뒤집힘 ${r.flip}/${p.flips} 해시 ${r.hash}/${p.hash}`);
  }
  // 자동 시작(cue)도 같은 일정이면 같은 샷: cue 로 잠긴 tUp 을 fix 로 다시 돌리면 해시 같음
  for (const c of [{ N: 30, seed: 807, s: 0.6, q: 0.85, th: 24 }, { N: 40, seed: 808, s: 0.2, q: 1, th: 16 }]) {
    const r = gcShot({ ...c, kind: 'gc', rule: 'cue10+0.06', floor: 'wall', key: 'x' });
    const f = gcShot({ ...c, kind: 'gc', rule: `fix${r.tUp}`, floor: 'wall', key: 'x' });
    const ok = r.hash === f.hash && r.flip === f.flip;
    if (!ok) bad++;
    console.log(`  ${ok ? '맞음' : '틀림'}  단서 시작 ≡ 고정 시작(tUp ${r.tUp}) ${c.N}장 ${c.seed} s${c.s} → 뒤집힘 ${r.flip}/${f.flip} 해시 ${r.hash}/${f.hash}`);
  }
  console.log(`\nsweepgc self: ${bad ? `틀림 ${bad}` : '맞음'}`);
  if (bad) process.exitCode = 1;
}

async function geo() {
  await V1.initPhysics();
  console.log(`아래 모서리 각 A_BASE ${A_BASE.toFixed(3)}° · 바닥 s 0 = 앞면 앞 ${D_FLOOR} u(1 D) · lipMinY ${V1.TUNE.lipMinY}`);
  const tops = {};
  for (const N of NS) { const t = new V1.Table(G.practiceTableSeed(N, 801), { lift: 519.59 }); t.addPile(Array.from({ length: N }, (_, i) => i)); t.settle(600); tops[N] = t.columnTop(); }
  console.log(`정착 꼭대기(시드 801): ${NS.map((N) => `${N}장 ${tops[N].toFixed(3)} u(${(tops[N] * 25).toFixed(0)} mm)`).join(' · ')}`);
  for (const N of NS) {
    console.log(`\n${N}장 (꼭대기 ${tops[N].toFixed(3)} u, 문법 B 입 0.5 u = s ${(S_BASE + (1 - S_BASE) * 0.5 / tops[N]).toFixed(2)}) — s: α0° / 입 높이 mm / 바닥 거리 u 또는 앞면 높이 mm / α0+24° 앞면 높이 mm`);
    console.log('  ' + S_GRID.map((s) => { const a = a0Of(s, tops[N]); const p = poseRel(a); const fl = s < S_BASE ? `바닥 ${floorD(a).toFixed(2)} u` : `앞면 ${(faceH(a) * 25).toFixed(1)}`; return `s${s}: ${a.toFixed(2)}° 입 ${(p.o.y * 25).toFixed(1)} ${fl} → +24° ${(faceH(a + 24) * 25).toFixed(0)}`; }).join('\n  '));
  }
}

// ───────────────────────── choose: 고르기 시드(map) → choice.json (보류 격자의 중심) ─────────────────────────
// 장수마다 최고 칸(원 안 뒤집힘 평균, 같으면 원 밖 적은 칸) · '고른 칸' 후보 = 모든 장수에서 (칸 ÷ 그 장수 최고) 의 최소가 큰 순 3칸
function choose(files, out) {
  const rows = readRows(files).filter((r) => r.kind === 'gc' && r.floor === 'wall');
  const rules = [...new Set(rows.filter((r) => r.th > 0).map((r) => r.rule))];
  if (rules.length !== 1 || rules[0] !== RULE) throw new Error(`choose: 규칙 ${rules.join(',')} ≠ RULE ${RULE}`);
  const seeds = [...new Set(rows.map((r) => r.seed))].sort((a, b) => a - b);
  if (seeds.some((x) => !SEEDS.sel.includes(x))) throw new Error('choose: 고르기 시드(801~812)만');
  const cell = new Map();
  for (const r of rows) { const k = `${r.N}|${r.s}|${r.q}|${r.th}`; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(r); }
  const best = {}, cube = {};
  for (const [k, rs] of cell) {
    const [N, sv, q, th] = k.split('|').map(Number);
    const v = mean(rs.map((r) => r.flip)), o = mean(rs.map((r) => r.out));
    (cube[N] ||= {})[`${sv}|${q}|${th}`] = v;
    if (!best[N] || v > best[N].v + 1e-12 || (Math.abs(v - best[N].v) <= 1e-12 && o < best[N].o)) best[N] = { s: sv, q, th, v: +v.toFixed(3), o: +o.toFixed(3), n: rs.length };
  }
  const keys = Object.keys(cube[NS[0]] || {});
  const uni = keys.map((k) => { const rs = NS.map((N) => (cube[N]?.[k] ?? 0) / best[N].v); const [sv, q, th] = k.split('|').map(Number); return { s: sv, q, th, min: +Math.min(...rs).toFixed(3), per: rs.map((x) => +x.toFixed(3)) }; }).sort((a, b) => b.min - a.min).slice(0, 3);
  const ch = { rule: RULE, floor: 'wall', from: files, seeds: `${seeds[0]}~${seeds.at(-1)}`, best, uni };
  writeFileSync(out, JSON.stringify(ch, null, 1) + '\n');
  console.log(JSON.stringify(ch, null, 1));
  console.log(`→ ${out}`);
}

// ───────────────────────── report ─────────────────────────
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const pct = (v) => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : '—');
function idx(rows) { const M = new Map(); for (const r of rows) { const k = `${r.N}|${r.key}`; if (!M.has(k)) M.set(k, new Map()); M.get(k).set(r.seed, r); } return M; }
const mOf = (m, f = (r) => r.flip) => (m ? mean([...m.values()].map(f)) : NaN);
const ci = (p) => (p ? `${f2(p.r)} [${f2(p.lo)}, ${f2(p.hi)}]` : '—');
function pair(mA, mB, f = (r) => r.flip) { if (!mA || !mB) return null; const s = [...mA.keys()].filter((x) => mB.has(x)).sort((a, b) => a - b); return s.length ? pairedRatio(s.map((x) => f(mA.get(x))), s.map((x) => f(mB.get(x)))) : null; }

// 1차원 띠: xs(정렬), ys → 최고 이웃으로 이어진 ≥ frac·최고 구간 [lo, hi](격자점) + 이웃 사이 선형 보간 폭
export function band(xs, ys, frac = 0.9, iBest = null) {
  if (iBest == null) { iBest = 0; ys.forEach((y, i) => { if (y > ys[iBest]) iBest = i; }); }
  const thr = frac * ys[iBest];
  let a = iBest, b = iBest;
  while (a > 0 && ys[a - 1] >= thr) a--;
  while (b < xs.length - 1 && ys[b + 1] >= thr) b++;
  // 보간 끝(밖 이웃과의 교차)
  const lo = a > 0 ? xs[a - 1] + ((thr - ys[a - 1]) / (ys[a] - ys[a - 1])) * (xs[a] - xs[a - 1]) : xs[a];
  const hi = b < xs.length - 1 ? xs[b] + ((ys[b] - thr) / (ys[b] - ys[b + 1])) * (xs[b + 1] - xs[b]) : xs[b];
  return { best: xs[iBest], lo: xs[a], hi: xs[b], loI: lo, hiI: hi, w: hi - lo, edgeLo: a === 0, edgeHi: b === xs.length - 1 };
}
const bandTxt = (b, u = '') => `${b.lo}~${b.hi}${u} (보간 ${f2(b.loI)}~${f2(b.hiI)}, 폭 ${f2(b.w)}${b.edgeLo ? ' · 아래 끝' : ''}${b.edgeHi ? ' · 위 끝' : ''})`;

// 눈금 모의: 범위 [lo, hi] 를 주기 T(왕복) 삼각파로 오가는 눈금 → 목표(최고) 를 노린 탭이 σ(ms) 정규 시각 오차 → 기대 % 최고·≥90% 확률
//   f(x) = 격자 선형 보간(범위 밖은 끝값). 탭 시각 오차 e → 눈금 위치 오차 = v·e, v = 2(hi − lo)/T, 끝에서 되접힘
export function meterSim(xs, ys, lo, hi, T, sigma, best) {
  const f = (x) => { if (x <= xs[0]) return ys[0]; if (x >= xs.at(-1)) return ys.at(-1); let i = 0; while (xs[i + 1] < x) i++; const u = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] * (1 - u) + ys[i + 1] * u; };
  const v = (2 * (hi - lo)) / T, peak = Math.max(...ys);
  const fold = (x) => { const L = hi - lo; let y = (x - lo) % (2 * L); if (y < 0) y += 2 * L; return lo + (y <= L ? y : 2 * L - y); };
  let acc = 0, in9 = 0, wsum = 0;
  for (let k = -400; k <= 400; k++) { const e = (k / 100) * sigma / 1000; const w = Math.exp(-0.5 * (k / 100) ** 2); const y = f(fold(best + v * e)); acc += w * y; in9 += w * (y >= 0.9 * peak ? 1 : 0); wsum += w; }
  // 아무 때나 탭(눈금 위치 균등) = 실력 0 기준선
  let ua = 0, u9 = 0; const K = 400; for (let k = 0; k <= K; k++) { const y = f(lo + ((hi - lo) * k) / K); ua += y; u9 += y >= 0.9 * peak ? 1 : 0; }
  return { exp: acc / wsum / peak, p90: in9 / wsum, v, rnd: ua / (K + 1) / peak, rnd90: u9 / (K + 1) };
}

function report(files) {
  const rows = readRows(files);
  const M = idx(rows);
  const Ns = [...new Set(rows.map((r) => r.N))].sort((a, b) => a - b);
  const gc = rows.filter((r) => r.kind === 'gc');
  const uniq = (f) => [...new Set(gc.map(f))].sort((a, b) => a - b);
  const Ss = uniq((r) => r.s), Qs = uniq((r) => r.q), Ths = uniq((r) => r.th);
  const rules = [...new Set(gc.filter((r) => r.th > 0).map((r) => r.rule))];
  const floors = [...new Set(gc.map((r) => r.floor))];
  const seedsTxt = (N) => { const s = [...new Set(rows.filter((r) => r.N === N).map((r) => r.seed))].sort((a, b) => a - b); return `${s[0]}~${s.at(-1)} (${s.length})`; };
  console.log(`줄 ${rows.length} · 장수 ${Ns.join('/')} · s ${Ss.length}칸 · q ${Qs.join('/')} · θ ${Ths.join('/')} · 규칙 ${rules.join(' ')} · 바닥 ${floors.join('/')}`);
  const key = (s, q, th, rule, floor = 'wall') => `gc|s${s}|q${q}|th${th}|${th === 0 ? 'fix0' : rule}|${floor}`;
  const cellM = (N, s, q, th, rule, floor) => M.get(`${N}|${key(s, q, th, rule, floor)}`);

  // ⓪ 기준선
  console.log(`\n━━ 기준선 (원 안 뒤집힘 / 원 밖) ━━`);
  for (const N of Ns) {
    const b = [0.7, 0.85, 1].map((q) => { const cs = [0.25, 0.3, 0.35, 0.4].map((ts) => [ts, M.get(`${N}|a0|a0|q${q}|th24|fix${ts}`)]).filter((x) => x[1]); if (!cs.length) return null; const bb = cs.reduce((a, c) => (mOf(c[1]) > mOf(a[1]) ? c : a)); const nv = M.get(`${N}|a0|a0|q${q}|th0|fix0`); return `q${q} 휙 ${cs.map(([ts, m]) => `${ts}:${f1(mOf(m))}`).join(' ')} (최고 ${bb[0]} ${f1(mOf(bb[1]))}/밖 ${f1(mOf(bb[1], (r) => r.out))}) · 안 휙 ${f1(mOf(nv))}`; }).filter(Boolean);
    const cl = [2, 3, 4].map((k) => M.get(`${N}|classic|k${k}`)).filter(Boolean);
    if (b.length || cl.length) console.log(`  ${N}장 시드 ${seedsTxt(N)}: 문법 B(α0 0·24°) ${b.join(' | ')}${cl.length ? ` · 고전 눈높이 k2/3/4 ${cl.map((m) => f1(mOf(m))).join('/')}` : ''}`);
  }

  // ① 자동 시작 규칙 비교: 규칙마다 장수별 (s, θ) 최고 칸 · 칸 평균 · 규칙 간 같은 칸 짝 비
  if (rules.length > 1) {
    console.log(`\n━━ 자동 시작 규칙 비교 (바닥 wall · q 칸마다) — 규칙: 장수별 최고 칸 (s, θ) 뒤집힘/원 밖 · θ>0 칸 평균 · tUp 평균 ━━`);
    for (const q of Qs) for (const N of Ns) {
      const line = rules.map((rule) => {
        let best = null, all = [];
        for (const s of Ss) for (const th of Ths) { const m = cellM(N, s, q, th, rule); if (!m) continue; const v = mOf(m); if (th > 0) all.push(v); if (!best || v > best.v) best = { s, th, v, o: mOf(m, (r) => r.out), tu: mOf(m, (r) => r.tUp) }; }
        return best ? `${rule}: (${best.s}, ${best.th}°) ${f1(best.v)}/${f1(best.o)} tUp ${f2(best.tu)} · 평균 ${f1(mean(all))}` : null;
      }).filter(Boolean);
      console.log(`  ${N}장 q${q}: ${line.join(' | ')}`);
    }
    // 규칙 짝: 기준 규칙(첫째) 대비 같은 (s, θ>0) 칸 전체 평균 비
    console.log(`  규칙 짝 비(같은 시드·같은 (s, θ>0) 칸 합, ${rules[0]} 대비):`);
    for (const N of Ns) {
      const parts = rules.slice(1).map((rule) => { const xs = [], ys = []; for (const q of Qs) for (const s of Ss) for (const th of Ths) { if (th === 0) continue; const a = cellM(N, s, q, th, rules[0]), b = cellM(N, s, q, th, rule); if (!a || !b) continue; for (const [sd, r] of a) if (b.has(sd)) { xs.push(r.flip); ys.push(b.get(sd).flip); } } return xs.length ? `${rule} ${ci(pairedRatio(xs, ys))}` : null; }).filter(Boolean);
      console.log(`    ${N}장: ${parts.join(' · ')}`);
    }
  }

  // ② 바닥 모델 비교
  if (floors.length > 1) {
    console.log(`\n━━ 바닥 영점 모델 (s < ${S_BASE}) — 칸: 원 안 뒤집힘/원 밖 · wall 대비 짝 비 ━━`);
    for (const N of Ns) for (const q of Qs) {
      const fs = Ss.filter((s) => s < S_BASE);
      if (!fs.length) continue;
      const lines = [];
      for (const th of Ths) {
        const cells = floors.map((fl) => `${fl} ${fs.map((s) => { const m = cellM(N, s, q, th, rules[0] || RULE, fl); return m ? `${f1(mOf(m))}/${f1(mOf(m, (r) => r.out))}` : '—'; }).join(' ')}`);
        lines.push(`θ${th}: ${cells.join(' | ')}`);
      }
      // 같은 시드·같은 칸 합 짝 비 (fl ÷ wall)
      const pr = floors.filter((f) => f !== 'wall').map((fl) => { const xs = [], ys = []; for (const s of fs) for (const th of Ths) { const a = cellM(N, s, q, th, rules[0] || RULE, 'wall'), b = cellM(N, s, q, th, rules[0] || RULE, fl); if (!a || !b) continue; for (const [sd, r] of a) if (b.has(sd)) { xs.push(r.flip); ys.push(b.get(sd).flip); } } return xs.length ? `${fl}÷wall ${ci(pairedRatio(xs, ys))}` : null; }).filter(Boolean);
      console.log(`  ${N}장 q${q} (s ${fs.join('/')}): ${lines.join(' ‖ ')}\n    ${pr.join(' · ')}`);
    }
  }

  // 이하: 주 규칙(가장 많은 줄의 규칙) · wall 로 지도
  const rule = rules.length === 1 ? rules[0] : rules.includes(RULE) ? RULE : rules[0];
  const flo = floors.includes('wall') ? 'wall' : floors[0];
  const cube = (N) => { const C = {}; for (const s of Ss) for (const q of Qs) for (const th of Ths) { const m = cellM(N, s, q, th, rule, flo); if (m) C[`${s}|${q}|${th}`] = { v: mOf(m), o: mOf(m, (r) => r.out), any: mOf(m, (r) => r.flipAny), n: m.size, m }; } return C; };
  const bestOf = (C) => { let b = null; for (const [k, c] of Object.entries(C)) if (!b || c.v > b.c.v) b = { k, c }; if (!b) return null; const [s, q, th] = b.k.split('|').map(Number); return { s, q, th, ...b.c }; };

  // ③ 지도: 장수 × q → s 행 × θ 열
  console.log(`\n━━ 지도 (규칙 ${rule} · 바닥 ${flo}) — 칸 = 원 안 뒤집힘 평균 (원 밖 평균) ━━`);
  const BEST = {};
  for (const N of Ns) {
    const C = cube(N), b = bestOf(C);
    if (!b) continue;
    BEST[N] = { b, C };
    console.log(`\n${N}장 시드 ${seedsTxt(N)} · 최고 칸 s ${b.s} · q ${b.q} · θ ${b.th}° → ${f1(b.v)}장 (원 밖 ${f1(b.o)} · 어디든 ${f1(b.any)})`);
    for (const q of Qs) {
      console.log(`  q${q} (D ${G.gbD(q)} s)   θ: ${Ths.map((t) => String(t).padStart(9)).join('')}`);
      for (const s of Ss) {
        const cells = Ths.map((th) => { const c = C[`${s}|${q}|${th}`]; return c ? `${f1(c.v)}(${f1(c.o)})`.padStart(9) : '        —'; });
        console.log(`    s${String(s).padEnd(5)}${s < S_BASE ? '바닥' : s === S_BASE ? '모서' : '    '} ${cells.join('')}`);
      }
    }
  }

  // ④ 최고 칸 · 띠(≥90%): 다른 둘을 최고에 두고 한 손잡이씩
  console.log(`\n━━ 최고 칸·≥90% 띠 (다른 둘은 최고 칸에 고정, 이웃으로 이어진 구간 · 보간 폭) ━━`);
  const TOL = {};
  // CENTER=choice 면 띠·눈금의 중심을 고르기 시드 최고 칸(choice.json)으로 — 보류 시드에서 '고른 칸 주변 너그러움'을 잰다
  const CH = process.env.CENTER === 'choice' ? JSON.parse(readFileSync(CHOICE, 'utf8')) : null;
  if (CH) console.log(`  중심 = choice.json(${CH.seeds} 최고 칸) · 규칙 ${CH.rule}`);
  for (const N of Ns) {
    if (!BEST[N]) continue;
    const { C } = BEST[N];
    let b = BEST[N].b;
    if (CH) { const cb = CH.best[N], c = C[`${cb.s}|${cb.q}|${cb.th}`]; if (!c) { console.log(`  ${N}장: 고른 칸 없음`); continue; } console.log(`  ${N}장 고른 칸 (${cb.s}, ${cb.q}, ${cb.th}°) 고르기 ${f1(cb.v)} → 이 자료 ${f1(c.v)} (이 자료 최고 ${f1(BEST[N].b.v)} (${BEST[N].b.s}, ${BEST[N].b.q}, ${BEST[N].b.th}°) 의 ${pct(c.v / BEST[N].b.v)} · 짝 ${ci(pair(BEST[N].b.m, c.m))})`); b = { s: cb.s, q: cb.q, th: cb.th, ...c }; }
    const sY = Ss.map((s) => C[`${s}|${b.q}|${b.th}`]?.v ?? NaN), qY = Qs.map((q) => C[`${b.s}|${q}|${b.th}`]?.v ?? NaN), tY = Ths.map((th) => C[`${b.s}|${b.q}|${th}`]?.v ?? NaN);
    const sb = band(Ss, sY, 0.9, Ss.indexOf(b.s)), qb = band(Qs, qY, 0.9, Qs.indexOf(b.q)), tb = band(Ths, tY, 0.9, Ths.indexOf(b.th));
    TOL[N] = { sb, qb, tb, sY, qY, tY };
    // 다른 둘을 그 손잡이 값마다 최적화했을 때(가장 너그러운 띠) — '그 손잡이만 틀렸을 때 최선으로 만회'
    const sMax = Ss.map((s) => Math.max(...Qs.flatMap((q) => Ths.map((th) => C[`${s}|${q}|${th}`]?.v ?? -1))));
    const qMax = Qs.map((q) => Math.max(...Ss.flatMap((s) => Ths.map((th) => C[`${s}|${q}|${th}`]?.v ?? -1))));
    const tMax = Ths.map((th) => Math.max(...Ss.flatMap((s) => Qs.map((q) => C[`${s}|${q}|${th}`]?.v ?? -1))));
    console.log(`  ${N}장 최고 (s ${b.s}, q ${b.q}, θ ${b.th}°) ${f1(b.v)}장 · 원 밖 ${f1(b.o)}`);
    console.log(`    s 띠 ${bandTxt(sb)} | s 줄: ${Ss.map((s, i) => `${s}:${f1(sY[i])}`).join(' ')}`);
    console.log(`    q 띠 ${bandTxt(qb)} | q 줄: ${Qs.map((q, i) => `${q}:${f1(qY[i])}`).join(' ')}`);
    console.log(`    θ 띠 ${bandTxt(tb, '°')} | θ 줄: ${Ths.map((t, i) => `${t}:${f1(tY[i])}`).join(' ')}`);
    console.log(`    (다른 둘 다시 고르면) s 줄: ${Ss.map((s, i) => `${s}:${f1(sMax[i])}`).join(' ')} · q 줄: ${Qs.map((q, i) => `${q}:${f1(qMax[i])}`).join(' ')} · θ 줄: ${Ths.map((t, i) => `${t}:${f1(tMax[i])}`).join(' ')}`);
    // 바닥 최고 vs 모서리 이상 최고
    let fb = null, cb = null;
    for (const [k, c] of Object.entries(C)) { const s = +k.split('|')[0]; if (s < S_BASE) { if (!fb || c.v > fb.v) fb = { k, v: c.v, o: c.o }; } else if (!cb || c.v > cb.v) cb = { k, v: c.v, o: c.o }; }
    if (fb && cb) console.log(`    바닥 영점 최고 ${fb.k} ${f1(fb.v)}/밖 ${f1(fb.o)} · 기둥 영점 최고 ${cb.k} ${f1(cb.v)}/밖 ${f1(cb.o)} · 바닥÷기둥 ${f2(fb.v / cb.v)}`);
    // θ 0(고정 바람) 최고 = '쓸기 없음' 기준
    let f0 = null; for (const [k, c] of Object.entries(C)) if (+k.split('|')[2] === 0 && (!f0 || c.v > f0.v)) f0 = { k, v: c.v };
    if (f0) console.log(`    θ 0(쓸기 없음) 최고 ${f0.k} ${f1(f0.v)} · 최고÷θ0 최고 ${ci(pair(C[f0.k].m, b.m))}`);
  }

  // ⑤ 지배 확인: 모든 장수에서 최고의 몇 % 인지 — 한 칸이 모든 장수 ≥ 90% 면 '지배'
  if (Object.keys(BEST).length > 1) {
    console.log(`\n━━ 지배 확인: 칸마다 장수별 (칸 ÷ 그 장수 최고) 의 최소 — 상위 8칸 ━━`);
    const keys = new Set(Object.values(BEST).flatMap(({ C }) => Object.keys(C)));
    const sc = [...keys].map((k) => { const rs = Object.entries(BEST).map(([N, { b, C }]) => (C[k] ? C[k].v / b.v : 0)); return { k, min: Math.min(...rs), rs }; }).sort((a, b) => b.min - a.min);
    for (const x of sc.slice(0, 8)) console.log(`  ${x.k}: 최소 ${pct(x.min)} · 장수별 ${x.rs.map(pct).join('/')}`);
    const dom = sc[0];
    console.log(`  → ${dom.min >= 0.9 ? `지배 칸 있음(${dom.k}, 모든 장수 ≥ 90%)` : `지배 칸 없음(가장 고른 칸 ${dom.k} 도 최소 ${pct(dom.min)})`}`);
    // 손잡이별: 장수별 최고 값이 다른가 + 다른 장수의 최고 값을 쓰면(다른 둘은 그 장수 최고) 몇 %
    for (const [nm, i] of [['s', 0], ['q', 1], ['θ', 2]]) {
      const parts = Object.entries(BEST).map(([N, { b, C }]) => {
        const others = Object.entries(BEST).filter(([M2]) => M2 !== N).map(([M2, B2]) => { const v = [b.s, b.q, b.th]; v[i] = [B2.b.s, B2.b.q, B2.b.th][i]; const c = C[v.join('|')]; return c ? `${M2}장값 ${pct(c.v / b.v)}` : null; }).filter(Boolean);
        return `${N}장 최고 ${[b.s, b.q, b.th][i]} (${others.join(' ')})`;
      });
      console.log(`  ${nm}: ${parts.join(' | ')}`);
    }
  }

  // ⑥ 눈금(탭) 모의: 손잡이마다 범위·주기 T·탭 오차 σ → 기대 % 최고 · ≥90% 확률 · 띠를 지나는 시간
  if (Object.keys(TOL).length) {
    const RANGE = { s: [0, 1], 's기둥': [S_BASE, 1], q: [Math.min(...Qs), Math.max(...Qs)], θ: [0, Math.max(...Ths)] };
    const Ts = [0.8, 1.0, 1.2, 1.6, 2.0], SIG = [40, 60, 80];
    console.log(`\n━━ 눈금 모의 (삼각파 왕복 주기 T 초 · 범위 s ${RANGE.s.join('~')} / q ${RANGE.q.join('~')} / θ ${RANGE.θ.join('~')}° · 다른 둘은 최고 칸 · 탭 시각 오차 σ ms 정규 · 목표 = 최고 값) ━━`);
    console.log(`  칸 = 기대 % 최고 / ≥90% 확률 (σ ${SIG.join('/')} ms) · 띠 시간 = ≥90% 띠 폭 ÷ 눈금 속도 (한 번 지나갈 때 ms)`);
    for (const N of Object.keys(TOL)) {
      const { sb, qb, tb, sY, qY, tY } = TOL[N];
      const ci0 = Ss.findIndex((x) => x >= S_BASE), sC = Ss.slice(ci0), sCY = sY.slice(ci0);
      const sCb = sb.best >= S_BASE ? band(sC, sCY, 0.9, sC.indexOf(sb.best)) : band(sC, sCY, 0.9);
      for (const [nm, xs, ys, bd] of [['s', Ss, sY, sb], ['s기둥', sC, sCY, sCb], ['q', Qs, qY, qb], ['θ', Ths, tY, tb]]) {
        const [lo, hi] = RANGE[nm];
        const cells = Ts.map((T) => { const rs = SIG.map((sg) => meterSim(xs, ys, lo, hi, T, sg, bd.best)); const v = rs[0].v; return `T${T}: ${rs.map((r) => `${pct(r.exp)}/${pct(r.p90)}`).join(' ')} 띠 ${Math.round((bd.w / v) * 1000)} ms`; });
        const r0 = meterSim(xs, ys, lo, hi, 1, 60, bd.best);
        console.log(`  ${N}장 ${nm} (띠 폭 ${f2(bd.w)} = 범위의 ${pct(bd.w / (hi - lo))} · 아무 때나 탭 ${pct(r0.rnd)}/${pct(r0.rnd90)}): ${cells.join(' · ')}`);
      }
    }
  }

  // ⑥' 영점 눈금(기둥 s 0.4~1) — 숨 q 마다(θ 는 그 q 의 최고): s* · 그 q 최고 ÷ 장수 최고 · s 띠 · 눈금 T 1.0/1.2/1.6 s 에서 σ 60 ms 기대/≥90% · 아무 때나 탭
  if (Object.keys(BEST).length) {
    console.log(`\n━━ 영점 눈금(기둥 s ${S_BASE}~1) — q 마다: s*(q) · 그 q 최고 ÷ 장수 최고 · s 띠(≥90% of 그 q 최고) · 눈금 σ 60 ms 기대/≥90% (T 1.0 / 1.2 / 1.6 s) · 아무 때나 탭 ━━`);
    for (const N of Object.keys(BEST)) {
      const { b, C } = BEST[N];
      const sC = Ss.filter((x) => x >= S_BASE);
      const parts = Qs.map((q) => {
        let thB = null, vB = -1; for (const th of Ths) for (const sv of sC) { const c = C[`${sv}|${q}|${th}`]; if (c && c.v > vB) { vB = c.v; thB = th; } }
        if (thB == null) return null;
        const ys = sC.map((sv) => C[`${sv}|${q}|${thB}`]?.v ?? NaN); if (ys.some((y) => !Number.isFinite(y))) return null;
        const bd = band(sC, ys);
        const ms = [1.0, 1.2, 1.6].map((T) => meterSim(sC, ys, S_BASE, 1, T, 60, bd.best));
        return `q${q}: s* ${bd.best}(θ${thB}) ${pct(Math.max(...ys) / b.v)} · 띠 ${f2(bd.loI)}~${f2(bd.hiI)} · ${ms.map((m) => `${pct(m.exp)}/${pct(m.p90)}`).join(' ')} · 아무 ${pct(ms[0].rnd)}/${pct(ms[0].rnd90)}`;
      }).filter(Boolean);
      console.log(`  ${N}장\n    ${parts.join('\n    ')}`);
    }
  }

  // ⑦ 자동 시작 시각·단서(주 규칙): 장수 × s 별 tUp · cueT · ttUp · 바닥 스텝
  console.log(`\n━━ 자동 시작 (규칙 ${rule}, θ>0 칸, q 칸 평균) — s: tUp / cueT(위 절반 10°) / ttUp(시작 때 위 절반°) / 단서 안 뜸 비율 ━━`);
  for (const N of Ns) {
    const parts = Ss.map((s) => { const rs = gc.filter((r) => r.N === N && r.s === s && r.th > 0 && r.rule === rule && r.floor === flo); if (!rs.length) return null; return `s${s} ${f2(mean(rs.map((r) => r.tUp)))}/${f2(mean(rs.filter((r) => r.cueT >= 0).map((r) => r.cueT)))}/${f1(mean(rs.map((r) => r.ttUp)))}/${pct(rs.filter((r) => r.cueT < 0).length / rs.length)}`; }).filter(Boolean);
    if (parts.length) console.log(`  ${N}장: ${parts.join(' · ')}`);
  }
}

// ───────────────────────── lines · chips (게임 원인 칩의 근거 — 물리·원자료 그대로) ─────────────────────────
// 지배 칸(DOM) 을 지나는 1차원 줄: 장수마다 s 줄(기둥 칸, q 0.9 · θ 40) · q 줄(s 0.55 · θ 40) · θ 줄(s 0.55 · q 0.9), 값 = 칸 평균 ÷ 지배 칸 평균(소수 3자리)
//   원자료 = map(고르기 시드 801~812). 게임 sweep.js GC_LINES 는 이 출력을 그대로 고정(sweepgame ctl 이 JSON 문자열로 대조)
export const DOM = { s: 0.55, q: 0.9, th: 40 };
export const LINE_S = [0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 1];
export const MAP_FILE = new URL('./coresweep/data/gc/map.jsonl.gz', import.meta.url).pathname;
export const HELD_FILE = new URL('./coresweep/data/gc/held.jsonl.gz', import.meta.url).pathname;
export function gcLines(rows) {
  const g = rows.filter((r) => r.kind === 'gc' && r.floor === 'wall');
  const cell = (N, s, q, th) => { const xs = g.filter((r) => r.N === N && r.s === s && r.q === q && r.th === th).map((r) => r.flip); return xs.length ? mean(xs) : NaN; };
  const out = {};
  for (const N of NS) {
    const d = cell(N, DOM.s, DOM.q, DOM.th);
    if (!Number.isFinite(d)) continue;
    const r3 = (v) => +(v / d).toFixed(3);
    out[N] = {
      s: LINE_S.map((s) => [s, r3(cell(N, s, DOM.q, DOM.th))]),
      q: Q_GRID.map((q) => [q, r3(cell(N, DOM.s, q, DOM.th))]),
      th: TH_GRID.map((th) => [th, r3(cell(N, DOM.s, DOM.q, th))]),
    };
  }
  return out;
}
// 원인 칩(게임 sweep.js gcChip 과 같은 규칙, 따로 적음): 좋아요 막대(문법 B 와 같은 0.85 × 기준 꼭대기: 30장 20 · 40장 25 · 그 밖 0.62n) → 줄 보간 최소 < 0.9 면 그 손잡이(같으면 s → q → θ)
//   영점이 초록 띠(0.50~0.65) 안이면 영점 칩 없음 · 셋 다 0.9 이상이어도 q < 0.85 이고 s < 0.5 면 qWeak(맞물림 '약한 숨 + 아래 모서리') · 그 밖 mixed
const lineAt = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; if (x >= pts.at(-1)[0]) return pts.at(-1)[1]; let i = 0; while (pts[i + 1][0] < x) i++; return pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * (x - pts[i][0])) / (pts[i + 1][0] - pts[i][0]); };
export function chipOf(r, lines) {
  const n = r.N, peak = { 30: 20, 40: 25 }[n] ?? 0.62 * n;
  if (r.flip >= 0.85 * peak) return 'good';
  const L = lines[n] ?? lines[[10, 20, 30, 40].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))];
  const v = { s: r.s >= CHIP_BAND[0] && r.s <= CHIP_BAND[1] ? Infinity : lineAt(L.s, r.s), q: lineAt(L.q, r.q), th: lineAt(L.th, r.th) };
  let k = 's';
  if (v.q < v[k]) k = 'q';
  if (v.th < v[k]) k = 'th';
  if (v[k] >= 0.9) return r.q < CHIP_WEAK.q && r.s < CHIP_WEAK.s ? 'qWeak' : 'mixed';
  return k === 's' ? (r.s > DOM.s ? 'zHigh' : 'zLow') : k === 'q' ? 'qWeak' : 'thLow';
}
const CHIP_BAND = [0.5, 0.65], CHIP_WEAK = { q: 0.85, s: 0.5 };
const KNOB = { zHigh: 's', zLow: 's', qWeak: 'q', thLow: 'th' };
// chips: 기둥 줄마다 칩 → 좋아요·mixed 아닌 칩 줄은 같은 시드에서 '이름 붙은 손잡이만 지배 값으로 옮긴 칸'과 비교(도움 비율 = 옮긴 칸이 더 많이 넘김 · 평균 이득)
//   map = 모든 칩 · held = s·θ 칩만(보류 격자는 q 평면이 장수마다 달라 q 칩의 옮긴 칸이 없을 수 있음). + s ≥ 0.8 · q ≥ 0.85 · θ ≥ 20 줄의 좋아요 아닌 칩 중 zHigh 비율
function chipsReport(json) {
  const lines = gcLines(readRows(MAP_FILE));
  const res = {};
  for (const [name, file, kinds] of [['map', MAP_FILE, ['zHigh', 'zLow', 'qWeak', 'thLow']], ['held', HELD_FILE, ['zHigh', 'zLow', 'thLow']]]) {
    const rows = readRows(file).filter((r) => r.kind === 'gc' && r.floor === 'wall' && r.s >= S_BASE);
    const by = new Map(rows.map((r) => [`${r.N}|${r.seed}|${r.s}|${r.q}|${r.th}`, r]));
    res[name] = {};
    for (const N of NS) {
      const rs = rows.filter((r) => r.N === N);
      if (!rs.length) continue;
      const cnt = {}, help = {};
      let hi = 0, hiZ = 0;
      for (const r of rs) {
        const c = chipOf(r, lines);
        cnt[c] = (cnt[c] || 0) + 1;
        if (r.s >= 0.8 && r.q >= 0.85 && r.th >= 20 && c !== 'good') { hi++; if (c === 'zHigh') hiZ++; }
        if (!kinds.includes(c)) continue;
        const kk = KNOB[c], mv = { s: r.s, q: r.q, th: r.th, [kk]: DOM[kk] };
        const o = by.get(`${N}|${r.seed}|${mv.s}|${mv.q}|${mv.th}`);
        if (!o) continue;
        const h = (help[c] ||= { n: 0, up: 0, gain: 0 });
        h.n++; if (o.flip > r.flip) h.up++; h.gain += o.flip - r.flip;
      }
      const all = Object.values(help).reduce((a, h) => ({ n: a.n + h.n, up: a.up + h.up, gain: a.gain + h.gain }), { n: 0, up: 0, gain: 0 });
      res[name][N] = { rows: rs.length, cnt, help: Object.fromEntries(Object.entries(help).map(([c, h]) => [c, { n: h.n, up: +(h.up / h.n).toFixed(3), gain: +(h.gain / h.n).toFixed(2) }])), all: { n: all.n, up: all.n ? +(all.up / all.n).toFixed(3) : null, gain: all.n ? +(all.gain / all.n).toFixed(2) : null }, hiZ: hi ? +(hiZ / hi).toFixed(3) : null, hiN: hi };
    }
  }
  if (json) { console.log(JSON.stringify(res)); return res; }
  console.log('━━ 원인 칩 근거 (기둥 줄 · 좋아요 막대 0.85 × 기준 꼭대기 · 줄 최소 < 0.9) ━━');
  console.log('  도움 = 이름 붙은 손잡이만 지배 값(s 0.55 · q 0.9 · θ 40)으로 옮긴 같은 시드 칸이 더 많이 넘긴 비율 · 이득 = 평균 장수 차');
  for (const name of ['map', 'held']) for (const [N, v] of Object.entries(res[name])) {
    const cnt = Object.entries(v.cnt).map(([c, k]) => `${c} ${k}`).join(' · ');
    const hp = Object.entries(v.help).map(([c, h]) => `${c} ${pct(h.up)}/${h.gain >= 0 ? '+' : ''}${h.gain}(${h.n})`).join(' · ');
    console.log(`  ${name} ${N}장 (${v.rows}줄): 칩 ${cnt}\n    도움 ${hp} → 전체 ${pct(v.all.up)} · 이득 ${v.all.gain >= 0 ? '+' : ''}${v.all.gain} (${v.all.n}줄)${v.hiN ? ` · 높은 영점·센 숨·큰 각(s ≥ 0.8 · q ≥ 0.85 · θ ≥ 20) 좋아요 아닌 칩 중 zHigh ${pct(v.hiZ)} (${v.hiN}줄)` : ''}`);
  }
  // 기준(스펙 gates): 30·40장 map 도움 ≥ 75% · 이득 > 0 · held(s·θ) ≥ 70% · 높은 영점 칸 zHigh ≥ 80%
  const g = [];
  for (const N of [30, 40]) {
    const m = res.map[N], h = res.held[N];
    if (m) g.push([`map ${N}장 도움 ≥ 75% · 이득 > 0`, m.all.up >= 0.75 && m.all.gain > 0, `${pct(m.all.up)} · ${m.all.gain}`]);
    if (h) g.push([`held ${N}장 (s·θ 칩) 도움 ≥ 70%`, h.all.up >= 0.7, `${pct(h.all.up)} · ${h.all.gain}`]);
    if (m?.hiN) g.push([`map ${N}장 높은 영점 칸 zHigh ≥ 80%`, m.hiZ >= 0.8, pct(m.hiZ)]);
  }
  for (const [nm, okk, info] of g) console.log(`  ${okk ? '맞음' : '미달'}  ${nm} — ${info}`);
  console.log(`\nsweepgc chips: ${g.every((x) => x[1]) ? '맞음' : '미달(칩 규칙을 바꾸기 전에 보고)'}`);
  return res;
}

// ───────────────────────── 진입 ─────────────────────────
const IS_CLI = isMainThread && !!process.argv[1] && (() => { try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } })();
if (!isMainThread && workerData?.sweepgcWorker) {
  await V1.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); parentPort.postMessage(gcShot(job)); });
  parentPort.postMessage({ ready: true });
} else if (IS_CLI) {
  const [cmd, ...a] = process.argv.slice(2);
  const t0 = Date.now();
  if (cmd === 'self') await self();
  else if (cmd === 'geo') await geo();
  else if (cmd === 'list') { for (const st of ['pilot', 'auto', 'map', 'held', 'floor']) { try { console.log(`${st}: ${makeJobs(st).length}샷`); } catch (e) { console.log(`${st}: — (${e.message.split('\n')[0]})`); } } }
  else if (cmd === 'choose') choose(a[0], a[1] || CHOICE);
  else if (cmd === 'run') await run(a[0], a[1], +(a[2] || 4));
  else if (cmd === 'same') await same(a[0], a[1], +(a[2] || 24));
  else if (cmd === 'report') report(a[0]);
  else if (cmd === 'lines') { const L = gcLines(readRows(MAP_FILE)); if (a.includes('--json')) console.log(JSON.stringify(L)); else for (const [N, v] of Object.entries(L)) console.log(`${N}장 — s: ${v.s.map(([x, y]) => `${x}:${y}`).join(' ')} | q: ${v.q.map(([x, y]) => `${x}:${y}`).join(' ')} | θ: ${v.th.map(([x, y]) => `${x}:${y}`).join(' ')}`); }
  else if (cmd === 'chips') chipsReport(a.includes('--json'));
  else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
}

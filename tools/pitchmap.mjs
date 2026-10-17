// pitchmap.mjs — 제트 위아래 기울기(퍼올림 ↔ 내리 불기) × 노리는 층 × 숨 → 물리 반응 지도
// (재윤님 7차: '밑에서 입을 퍼올려 불면 포물선으로 잘 넘어간다. 지금은 입이 딱지와 수평 고정이라 위·아래 공략이 안 통한다')
//
// 사용: node tools/pitchmap.mjs [시드=12] [장수들=3,6,10,14,20]
//   env PITCHES='-20,level,10,20,30'  기울기(도). + = 입이 조준점 아래에서 위로 퍼올림, level = 지금 게임 입(−5.7° 내려봄)
//       RATIOS='0.7,0.9,1.1'          정답 숨 대비 비율 → rules.js resolveShot/physSweetFor 로 물리 세기(게임과 같음)
//       LAYERS='top,3rd,mid,bottom'   노리는 딱지(그 딱지 중심 높이): 맨 위 / 위에서 3장째 / 가운데 / 맨 아래
//       DIRS='-z'                     부는 방향. 기본 = 게임 방향(−z). '-z,+z' = 같은 더미를 앞·뒤에서 한 번씩(짝 비교)
//       TUNE_JSON='{"scoopGap":0}'    sim TUNE 덮어쓰기(튜닝 실험) / JSON=out.json 결과 저장 / IDENT=1 기울기 안 넘김(기존 호출)
//   8차: PITCHES 에 'tbl0.5' 처럼 쓰면 그 칸은 '책상 퍼올림' blow({ tableScoop: { s: 0.5 } }) (층은 무시, 진짜 입은 책상 위 — sim.blowTable).
//        기울기 칸(jetPitch)은 8차부터 차폐를 딱지만으로 계산(책상 밑 가상 입이 차폐를 끄던 문제 수정)하고, 틈 0 테두리엔 파고듦 없음(scoopFlushWedge).
//        → 7차 커밋 때의 기울기 칸 숫자와 다르다. 전체 비교·합격 판정은 tools/scoopmap.mjs
// 지표: flip = 원 안에서 뒤집힌 장수 평균, sd = 판마다 흔들림(표준편차), zero = 꽝(0장) 비율, out = 분필 원 밖 장수,
//       apex = 뒤집힌 딱지의 무게중심이 시작보다 가장 높이 솟은 높이(딱지 반지름 단위, 제자리에서 세워 넘기면 ≈1)
//       fly = 뒤집힌 딱지가 착지까지 간 수평 거리(시작 대비, 반지름 단위)
// 끝에 장수 평균 요약(숨 × 층 × 기울기)을 찍는다. 여러 프로세스로 나눠 돌릴 땐 JSON 으로 모아서 볼 것
import { writeFileSync } from 'node:fs';
import { initPhysics, Table } from '../mockup/src/sim.js';
import { sweetHiFor, resolveShot } from '../mockup/src/rules.js';
await initPhysics();
const S = +(process.argv[2] || 12);
const Ns = (process.argv[3] || '3,6,10,14,20').split(',').map(Number);
const PITCHES = (process.env.PITCHES || '-20,level,10,20,30').split(',');
const RATIOS = (process.env.RATIOS || '0.7,0.9,1.1').split(',').map(Number);
const LAYERS = (process.env.LAYERS || 'top,3rd,mid,bottom').split(',');
const DIRS = (process.env.DIRS || '-z').split(',');
const OV = process.env.TUNE_JSON ? JSON.parse(process.env.TUNE_JSON) : {};
const IDENT = !!process.env.IDENT;
const LEVEL = -0.1; // 지금 게임(main.js shotGeometry / sim.blow 기본값)의 입: 0.1 rad 아래로
const pitchRad = (p) => (p === 'level' ? LEVEL : (+p * Math.PI) / 180);
const isTable = (p) => String(p).startsWith('tbl');
const pitchLabel = (p) => (p === 'level' ? 'level' : isTable(p) ? `책상 s${String(p).slice(3)}` : `${+p > 0 ? '+' : ''}${p}°`);
const DIRV = { '-z': { x: 0, z: -1 }, '+z': { x: 0, z: 1 }, '+x': { x: 1, z: 0 }, '-x': { x: -1, z: 0 } };
function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function layerIndex(L, n) {
  if (L === 'top') return 0;
  if (L === '3rd') return Math.min(2, n - 1);
  if (L === 'mid') return Math.floor((n - 1) / 2);
  if (L === 'bottom') return n - 1;
  return Math.min(n - 1, Math.max(0, +L - 1)); // 숫자 = 위에서 k장째
}

// 한 번 불기: 게임과 같은 숨 해석 → 게임과 같은 조준 기하(곡면 위 c − D·√(1−lat²) + side·lat) → runUntilSettled(4) 와 같은 루프
function shot(n, s, L, ratio, pitch, dirKey) {
  const t = new Table(s * 7907 + n, OV);
  t.addPile(Array.from({ length: n }, (_, i) => i));
  t.settle();
  const ys = t.liveDiscs().map((d) => d.body.translation().y).sort((a, b) => b - a); // 위에서부터
  const top = t.columnTop();
  const h = ys[layerIndex(L, n)];
  const sh = resolveShot({ lat: 0, h, power: sweetHiFor(n) * ratio }, n, top, mul(s * 31 + n), 1);
  const c = t.pileCenter();
  const D = DIRV[dirKey];
  const side = { x: -D.z, z: D.x };
  const back = Math.sqrt(1 - sh.lat * sh.lat);
  const aim = { x: c.x - D.x * back + side.x * sh.lat, y: sh.h, z: c.z - D.z * back + side.z * sh.lat };
  const args = { aim, dir: D, power: sh.power, blast: sh.blast || 0 };
  if (isTable(pitch)) {
    // 책상 퍼올림: 발치(곡면 위 c − D·√(1−lat²) + side·lat, 책상 높이)에서 입 쪽으로 s 떨어진 책상 점 F 를 누름
    const sv = +String(pitch).slice(3);
    args.aim = { x: aim.x - D.x * sv, y: 0, z: aim.z - D.z * sv };
    args.tableScoop = { s: sv };
  } else if (!IDENT) args.jetPitch = pitchRad(pitch);
  const y0 = new Map(), p0 = new Map(), maxY = new Map();
  for (const d of t.liveDiscs()) { const p = d.body.translation(); y0.set(d.id, p.y); p0.set(d.id, { x: p.x, z: p.z }); maxY.set(d.id, p.y); }
  t.blow(args);
  const steps = Math.ceil(4 / t.T.dt);
  for (let i = 0; i < steps; i++) {
    t.step();
    for (const d of t.liveDiscs()) { if (d.off) continue; const y = d.body.translation().y; if (y > maxY.get(d.id)) maxY.set(d.id, y); }
    if (!t.puff && i > 30 && t.isSettled()) break;
  }
  const flipped = t.liveDiscs().filter((d) => t.faceUp(d) > 0.2 && t.inCircle(d));
  const out = t.liveDiscs().filter((d) => !t.inCircle(d)).length;
  const apex = flipped.map((d) => maxY.get(d.id) - y0.get(d.id));
  const fly = flipped.map((d) => { const p = d.body.translation(), q = p0.get(d.id); return Math.hypot(p.x - q.x, p.z - q.z); });
  return { flip: flipped.length, out, apex, fly };
}

const results = [];
for (const n of Ns) {
  for (const ratio of RATIOS) {
    const lines = [];
    for (const L of LAYERS) {
      const cells = [];
      for (const pitch of PITCHES) {
        const fl = [], outs = [], apex = [], fly = [];
        for (let s = 1; s <= S; s++) for (const dk of DIRS) {
          const r = shot(n, s, L, ratio, pitch, dk);
          fl.push(r.flip); outs.push(r.out); apex.push(...r.apex); fly.push(...r.fly);
        }
        const k = fl.length;
        const mean = fl.reduce((a, b) => a + b, 0) / k;
        const sd = Math.sqrt(fl.reduce((a, b) => a + (b - mean) ** 2, 0) / k);
        const cell = {
          n, ratio, layer: L, pitch: pitchLabel(pitch), samples: k,
          flip: mean, sd, zero: fl.filter((v) => v === 0).length / k, out: outs.reduce((a, b) => a + b, 0) / k,
          apex: apex.length ? apex.reduce((a, b) => a + b, 0) / apex.length : null,
          fly: fly.length ? fly.reduce((a, b) => a + b, 0) / fly.length : null,
          flips: fl,
        };
        results.push(cell);
        cells.push(cell);
      }
      lines.push({ L, cells });
    }
    if (process.env.QUIET) continue;
    const W = 33;
    console.log(`\nn=${n}  숨 ${ratio}배  (${S}시드 × ${DIRS.join('/')})   칸 = 평균장수±sd  꽝%  원밖  ↑솟은높이 →날아간 거리`);
    console.log(`  ${'층'.padEnd(7)}| ${PITCHES.map((p) => pitchLabel(p).padEnd(W)).join('| ')}`);
    for (const { L, cells } of lines) {
      const f = (v) => (v == null ? '  - ' : v.toFixed(2));
      console.log(`  ${L.padEnd(7)}| ${cells.map((c) => `${c.flip.toFixed(1).padStart(4)}±${c.sd.toFixed(1).padEnd(4)} z${String(Math.round(c.zero * 100)).padStart(3)}% o${c.out.toFixed(1).padStart(4)} ↑${f(c.apex)} →${f(c.fly)}`.padEnd(W)).join('| ')}`);
    }
  }
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results));
// 장수 평균 요약: 숨 × 층 행, 기울기 열 — 평균장수 / 꽝% / 원밖 / 솟은높이
console.log(`\n== 요약 (n = ${Ns.join(',')} 평균)  칸 = 평균장수 꽝% 원밖 ↑솟은높이`);
console.log(`  ${'숨 층'.padEnd(11)}| ${PITCHES.map((p) => pitchLabel(p).padEnd(22)).join('| ')}`);
for (const ratio of RATIOS) for (const L of LAYERS) {
  const cells = PITCHES.map((p) => {
    const cs = results.filter((c) => c.ratio === ratio && c.layer === L && c.pitch === pitchLabel(p));
    const m = (k) => cs.reduce((a, c) => a + c[k], 0) / cs.length;
    const ap = cs.filter((c) => c.apex != null);
    const apex = ap.length ? ap.reduce((a, c) => a + c.apex, 0) / ap.length : null;
    return `${m('flip').toFixed(2).padStart(5)} z${String(Math.round(m('zero') * 100)).padStart(3)} o${m('out').toFixed(1)} ↑${apex == null ? ' - ' : apex.toFixed(2)}`.padEnd(22);
  });
  console.log(`  ${`${ratio} ${L}`.padEnd(11)}| ${cells.join('| ')}`);
}

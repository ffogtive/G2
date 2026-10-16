// tune-jolt.mjs — Jolt '공정' 설정 고르기 (기본값 그대로가 아니라, 게임 단위·얇은 딱지에 맞춰 손잡이를 훑음)
//   node tune-jolt.mjs stage1            30장·두께 0.11·시드 1 에서 격자 전부 (Rapier 기준 행 포함)
//   node tune-jolt.mjs stage2 [이름|...] 후보를 20·30·45장 × 두께 0.11·0.055 × 시드 1~3
//   node tune-jolt.mjs stage3            stage2 1등 주변(허용치 중간값·반복·하위 스텝 3/4/6·잠 문턱)
//   node tune-jolt.mjs stage4            길이 허용치 × 볼록 반경 분리(무엇이 효과였나)
//   node tune-jolt.mjs final [프리셋|...] 고른 프리셋(jolt-fair·jolt-1x)을 stage2 격자로
// 결과: out/tune-<stage>.json + 표. 무거운 프로세스 1개(단일 스레드 WASM).
import { writeFileSync, mkdirSync } from 'node:fs';
import { runTrial } from './adapters/trial.mjs';

const stage = process.argv[2] || 'stage1';

const RAPIER = {
  'R v1 (erp0.2,1/120)': { engine: 'rapier' },
  'R thin (erp0.8,1/240)': { engine: 'rapier', erp: 0.8, substeps: 2 },
  'R erp0.8,1/480': { engine: 'rapier', erp: 0.8, substeps: 4 },
};

function joltGrid() {
  const g = {};
  for (const sub of [1, 2, 4]) for (const [vs, ps] of [[6, 2], [10, 2], [10, 4]]) for (const tol of ['scaled', 'default']) for (const bg of [0.2, 0.4]) {
    const name = `J s${sub} v${vs}p${ps} ${tol} b${bg}`;
    g[name] = { engine: 'jolt', substeps: sub, joltPreset: tol === 'default' ? 'default' : 'scaled', jolt: { velocitySteps: vs, positionSteps: ps, baumgarte: bg } };
  }
  return g;
}

// stage1 에서 고른 후보 (+ 잠 문턱 변형). 이름 → createWorld 파라미터
const CANDIDATES = {
  'J s4 v6p2 default b0.4': { engine: 'jolt', substeps: 4, joltPreset: 'default', jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
  'J s4 v10p4 scaled b0.4': { engine: 'jolt', substeps: 4, jolt: { velocitySteps: 10, positionSteps: 4, baumgarte: 0.4 } },
  'J s4 v10p2 scaled b0.2': { engine: 'jolt', substeps: 4, jolt: { velocitySteps: 10, positionSteps: 2, baumgarte: 0.2 } },
  'J s4 v6p2 scaled b0.4': { engine: 'jolt', substeps: 4, jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
  'J s2 v10p4 default b0.4': { engine: 'jolt', substeps: 2, joltPreset: 'default', jolt: { velocitySteps: 10, positionSteps: 4, baumgarte: 0.4 } },
  'J s4 v6p2 scaled b0.4 sleep0.1': { engine: 'jolt', substeps: 4, sleep: { pointVelocity: 0.1, time: 0.5 }, jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
};

// stage3: stage2 1등(s4 v6p2 default b0.4) 주변. 'mid' = 허용 겹침만 줄이고(0.005) 미리 접촉·한 번 보정 최대는 기본(0.02·0.2)
const MID = { penetrationSlop: 0.005, speculativeContactDistance: 0.02, maxPenetrationDistance: 0.2 };
const STAGE3 = {
  'J s4 v6p2 default b0.4': CANDIDATES['J s4 v6p2 default b0.4'],
  'J s4 v6p2 mid b0.4': { engine: 'jolt', substeps: 4, jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4, ...MID } },
  'J s4 v10p4 default b0.4': { engine: 'jolt', substeps: 4, joltPreset: 'default', jolt: { velocitySteps: 10, positionSteps: 4, baumgarte: 0.4 } },
  'J s4 v6p2 default b0.4 sleep0.1': { engine: 'jolt', substeps: 4, joltPreset: 'default', sleep: { pointVelocity: 0.1, time: 0.5 }, jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
  'J s3 v6p2 default b0.4': { engine: 'jolt', substeps: 3, joltPreset: 'default', jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
  'J s6 v6p2 default b0.4': { engine: 'jolt', substeps: 6, joltPreset: 'default', jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4 } },
  'J s4 v6p2 mid b0.4 sleep0.1': { engine: 'jolt', substeps: 4, sleep: { pointVelocity: 0.1, time: 0.5 }, jolt: { velocitySteps: 6, positionSteps: 2, baumgarte: 0.4, ...MID } },
};

function row(name, r) {
  const s = r.settle, t = r.shot;
  return `${name.padEnd(30)} n${String(r.n).padEnd(3)} h${String(r.h).padEnd(5)} s${r.seed} | 높이 ${s.heightRatio.toFixed(3)} 바닥겹침 ${s.floorPen.toFixed(3)} 정지 ${String(s.quietStep ?? '—').padStart(4)} 잔떨림 ${s.restSpeed.toFixed(3)} 잠 ${String(s.sleeping).padStart(2)} ${s.msPerStep.toFixed(2)}ms | 판정 ${String(t.judgeSteps).padStart(3)}${t.judgeKind === 'cap' ? '(상한)' : t.judgeKind === 'late' ? '(느슨)' : '(멈춤)'} 뒤집 ${String(t.flipped).padStart(2)} 밖 ${String(t.outs).padStart(2)} 끝속 ${t.endSpeed.toFixed(3)} 잠 ${String(t.sleeping).padStart(2)} ${t.msPerStep.toFixed(2)}ms`;
}

// 이름에 'default' 가 없는 Jolt 후보의 바탕 = JOLT_SCALED (stage1~4 를 잴 때의 바탕. adapters 의 지금 JOLT_FAIR 는 이 결과로 고른 값)
for (const m of [CANDIDATES, STAGE3]) for (const c of Object.values(m)) if (c.engine === 'jolt' && !c.joltPreset) c.joltPreset = 'scaled';

mkdirSync('out', { recursive: true });
const results = [];
if (stage === 'stage1') {
  const cfgs = { ...RAPIER, ...joltGrid() };
  for (const [name, cfg] of Object.entries(cfgs)) {
    const r = await runTrial(cfg, { n: 30, h: 0.11, seed: 1 });
    results.push({ name, cfg, ...r });
    console.log(row(name, r));
  }
} else if (stage === 'stage4') {
  // 무엇이 효과였나: 길이 허용치(기본 vs 줄임) × 볼록 반경(두께의 절반 vs 두께 전부 = 둥근 테두리). s4 v10p4 b0.4 고정
  const base = { engine: 'jolt', substeps: 4, joltPreset: 'scaled' };
  const J0 = { velocitySteps: 10, positionSteps: 4, baumgarte: 0.4 };
  const DEF_TOL = { penetrationSlop: 0.02, speculativeContactDistance: 0.02, maxPenetrationDistance: 0.2 };
  const cfgs = {
    'tol기본 cr전부(=stage3 1등)': { ...base, joltPreset: 'default', jolt: J0 },
    'tol기본 cr절반': { ...base, jolt: { ...J0, ...DEF_TOL, convexRadiusFrac: 0.5 } },
    'tol줄임 cr전부': { ...base, jolt: { ...J0, convexRadiusFrac: 1.0 } },
    'tol줄임 cr절반(JOLT_FAIR)': { ...base, jolt: J0 },
  };
  for (const [name, cfg] of Object.entries(cfgs)) for (const h of [0.11, 0.055]) for (const n of [30, 45]) for (const seed of [1, 2, 3]) {
    const r = await runTrial(cfg, { n, h, seed });
    results.push({ name, cfg, ...r });
    console.log(row(name, r));
  }
} else if (stage === 'final') {
  // 고른 프리셋을 stage2 와 같은 격자로 (Rapier 줄은 stage2 와 비트 같아서 다시 안 돎: summarize.mjs 가 합침)
  for (const preset of (process.argv[3] || 'jolt-fair|jolt-1x').split('|')) for (const h of [0.11, 0.055]) for (const n of [20, 30, 45]) for (const seed of [1, 2, 3]) {
    const r = await runTrial({ preset }, { n, h, seed });
    results.push({ name: preset, cfg: { preset }, ...r });
    console.log(row(preset, r));
  }
} else if (stage === 'stage2' || stage === 'stage3') {
  const all = { ...RAPIER, ...joltGrid(), ...CANDIDATES, ...STAGE3 };
  const pick = process.argv[3] ? process.argv[3].split('|') : stage === 'stage3' ? Object.keys(STAGE3) : [...Object.keys(RAPIER), ...Object.keys(CANDIDATES)];
  for (const name of pick) {
    const cfg = all[name] ?? JSON.parse(name);
    for (const h of [0.11, 0.055]) for (const n of [20, 30, 45]) for (const seed of [1, 2, 3]) {
      const r = await runTrial(cfg, { n, h, seed });
      results.push({ name, cfg, ...r });
      console.log(row(name, r));
    }
  }
}
writeFileSync(`out/tune-${stage}.json`, JSON.stringify(results, null, 1));

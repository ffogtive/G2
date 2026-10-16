# enginecmp — Rapier ↔ Jolt 비교 틀 (엔진 독립 어댑터 + 게임 바람 이식 + 네이티브 벤치)

## 🧭 핵심 가설

**가설 (확인됨, 두께 0.055·0.04 · 기기 간은 qemu 까지)**: 종이처럼 얇은 딱지를 물리까지 넣으려면 Jolt(CPD 자체 빌드, 하위 스텝 4, Rapier 와 같은 잠 문턱 = 프리셋 `jolt-fair-rsleep`)로 가야 한다.
- Rapier 는 세 판(웹 0.12 · 최신 JS 0.21 · 앱 0.36)의 70가지 설정 어디서도 '서기 + 쏜 뒤 멈춤'을 함께 하지 못했다.
- → 결정은 "물리까지 얇게(Jolt)냐, 보이는 것만 얇게(Rapier 유지)냐"다.
- 보고서: [`docs/research/07-physics-engine-compare.md`](../../docs/research/07-physics-engine-compare.md). 결과·공정성 점검·바꾸는 비용이 모두 거기 있다.

**가설 수정 (2026-10-16 공정성 점검 뒤)**
1. 권고를 `J-b0.4-4x-v20` → `jolt-fair-rsleep`(= `J-b0.4-4x-rsleep`, v10)으로 바꿨다. v20 은 시드 1~3 과적합이었다.
2. 'Rapier 식 잠을 주면 Jolt 가 안 잔다'는 어댑터의 잠 시간 옮김 버그였다. 실제로는 8 s 타이머였다. 고쳤다(아래 '설정 짝 · 잠').
3. 'WASM 에서 Jolt 가 2~4배 빠르다'는 Rapier 0.12 대비로만 맞다. Rapier 0.21 은 Jolt 보다 1.5~2배 빠르다.
4. 'Rapier 는 한 점에서만 선다'는 두께 0.11 에서만 맞다.
5. '합성 샷 잠 수(Rapier 0.36 vs Jolt)'는 시드 1 한 판이라 근거에서 뺐다.

## 무엇이 들어 있나

| 경로 | 내용 |
|---|---|
| `adapters/index.mjs` | `createWorld(params)` 엔진 독립 API · Rapier↔Jolt 설정 짝(머리 주석) · `PRESETS` · `JOLT_FAIR`/`JOLT_SCALED`/`JOLT_DEFAULTS` |
| `adapters/rapier.mjs` | Rapier JS 쪽. 기본 `@dimforge/rapier3d-compat` 0.12.0 = 게임 웹 물리(저장소 루트 node_modules). `RAPIER_PATH` 로 0.13 이상(0.21 등)도 된다: `rapier: { naturalFrequency, lengthUnit, nAllowedLinearError, nPredictionDistance, skin }` |
| `adapters/jolt.mjs` | Jolt 쪽(JoltPhysics.js 1.1.0 = Jolt v5.6.0 WASM). 빌드 `cpd`(vendor/, 기본으로 쓸 것) / `wasm-compat`(npm, `JOLT_NPM`) / `JOLT_PATH` |
| `adapters/common.mjs` | 게임 기본값(sim.js TUNE 물리 부분) · 해시 · mulberry32 · 합성 더미·샷 · 책상 밖 · 판정 |
| `adapters/wind.mjs` | 게임 바람(sim.js applyWind 기본 경로)·더미 생성기·settle·stepJudge·judgeResult 의 엔진 독립 이식(`GameTable`·`standardShot`). Rapier 0.12 위에서 sim.js 와 48/48 비트 동일 |
| `adapters/trial.mjs` | 합성 샷 한 판(처음 튜닝용) |
| `compare.mjs` | 비교 실행기: `anchor` · `stack`(A) · `shot`(B) · `simshot` · `det`(C) · `speed`(D) · `report`. 설정 이름표 `CONFIGS` |
| `cfgs/*.json` | 이름표 밖 설정 묶음: Rapier 0.21 훑기(`r21A`·`r21B`·`r21C`), Rapier 0.12 허용치(`rtol`·`rtolB`), 속도(`spd12`·`spd21`·`speed-final`) |
| `cmpsum.mjs` | `data/cmp-*.json.gz` → `data/cmp-summary.md` |
| `audit/` | 공정성 점검: `sleepchk`(Jolt 잠 타이머 × 하위 스텝) · `masschk`(질량·광선·마찰 결합) · `cmphash`(다시 돌린 것 ≡ 커밋된 원자료) · `frontier`(엔진별 '서기 × 멈춤' 앞선 줄) |
| `diag.mjs` | 쏜 뒤 남는 움직임 진단(가장 빠른 딱지 3장의 속도·ω 축·기울기) |
| `hashcmp.mjs` | 같은 판(합성 샷)을 JS(WASM)·네이티브 Jolt·네이티브 Rapier 0.36 에서 돌려 60스텝마다 해시 대조. Jolt 기본 빌드 = cpd |
| `smoke.mjs` · `tune-jolt.mjs` · `summarize.mjs` | 어댑터 점검 · 처음 Jolt 손잡이 훑기(stage1~4) · 그 표. 이 둘은 `JOLT_FLAVOUR` 를 안 주면 npm 빌드(wasm-compat)를 쓴다 |
| `native/jolt-bench/` | Jolt v5.6.0 네이티브 벤치(CMake, CPD 켬) · `aarch64-zig.cmake` |
| `native/rapier-bench/` | Rapier 0.36 (enhanced-determinism) 네이티브 벤치(합성 샷, puff_sim 게임 v1 짝 솔버) |
| `native/puffthin/` | **앱 엔진 B**: `native/puff_sim`(Rapier 0.36 + 게임 바람 Rust) 복사본을 만들어 두께만 `PUFF_DISC_H` 로 바꾸고 `bthin`(B 실행기)을 붙인다. `setup.sh` · `run-grid.sh` · `grid.txt` · `tojson.mjs` |
| `native/build-jolt-cpd-wasm.sh` · `joltjs-cpd-glue.patch` | CPD WASM 다시 빌드(emsdk 6.0.2) + JoltPhysics.js 1.1.0 CMake 의 CPD define 누락 패치 |
| `native/make-zig-wrappers.sh` | aarch64 교차 빌드용 zig 감싸개 |
| `vendor/jolt-physics-1.1.0-cpd.wasm-compat.js.gz` | CPD WASM 빌드 결과(MIT, `vendor/LICENSE-jolt.txt`). 처음 쓸 때 자동으로 풀림 |
| `data/` | 원자료(`cmp-*.json.gz`) · 표(`cmp-summary.md`, `cmp-frontier.txt`) · 결정성·속도 기록 · 처음 튜닝(`tune-*`). 지도는 보고서 07 §10 |

## 설치 — 저장소 package.json 에 아무것도 넣지 않는다

- **기본은 설치가 필요 없다.** Jolt 는 `vendor/` 의 CPD 빌드를 쓴다. Rapier 0.12 는 저장소 루트 `npm install` 로 이미 있는 것을 쓴다.
  - 루트 node_modules 가 없는 워크트리라면 `/home/user/G2/node_modules` 를 찾아 쓴다(`adapters/rapier.mjs`).
- **npm Jolt(CPD 꺼짐)** 는 npm 빌드와 비교할 때(`JOLT_FLAVOUR=wasm-compat`)나 `smoke`·`tune-jolt` 를 기본값으로 돌릴 때만 필요하다. 스크래치 폴더에 깔고 경로로 가리킨다:
  ```bash
  npm install --prefix /tmp/jolt-npm --no-save jolt-physics@1.1.0
  export JOLT_NPM=/tmp/jolt-npm/node_modules/jolt-physics      # adapters/jolt.mjs 가 $JOLT_NPM/dist/jolt-physics.wasm-compat.js 를 읽음
  ```
- **최신 Rapier JS**(공정성 점검용)도 같은 방식이다:
  ```bash
  npm install --prefix /tmp/rapier021 --no-save @dimforge/rapier3d-compat@0.21.0
  export RAPIER_PATH=/tmp/rapier021/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs
  ```
- 한 프로세스에서는 Jolt 빌드 하나, Rapier 판 하나만 쓴다.

## API

```js
import { createWorld, addPileTo, PRESETS } from './adapters/index.mjs';
const w = await createWorld({ preset: 'jolt-fair-rsleep' });     // 또는 { engine: 'rapier'|'jolt', substeps, erp, jolt:{...}, sleep:{...}, rapier:{...} }
w.addFloor();                                                     // 책상(윗면 y=0, 마찰 0.9)
const i = w.addDisc(pos, rot, radius, halfHeight, { density, friction, restitution, linDamp, angDamp, ccd });
w.step();                         // dt(1/120) 한 스텝 = substeps 개 하위 스텝
w.getPose(i); w.getVel(i); w.mass(i);
w.applyImpulseAtPoint(i, J, P); w.applyImpulse(i, J); w.applyTorqueImpulse(i, T);
w.castRay(from, dir, max, { exclude: i, discsOnly: true });       // → { i(책상 -1), toi } | null  (바람 가림)
w.isSleeping(i); w.wake(i); w.sleepingCount();
w.setPose(i, p, q); w.setVel(i, v, ω); w.setGravityScale(i, s);
w.hashState();                    // 8자리 hex — 네이티브 벤치와 같은 식
w.info(); w.destroy();
```

프리셋:
- `rapier-v1`: 지금 게임.
- `rapier-thin`: core-sweep §7 의 erp 0.8, 1/240.
- `jolt-fair`: v10, 1/480, Jolt 기본 잠(0.03 u/s, 실제 2 s).
- **`jolt-fair-rsleep`**: 권고. jolt-fair + Rapier 와 같은 잠(0.4 u/s · 2 s).
- `jolt-1x`: 같은 값을 1/120 으로.

주의: Jolt WASM 의 `JoltInterface` 는 전역 Factory 를 만들고 지운다. 그래서 **Jolt 월드는 한 번에 하나만** 살려 두고, 차례로 만들고 destroy 한다.

## 설정 짝 (Rapier ↔ Jolt 5.6)

원본은 `adapters/index.mjs` 머리 주석이다.

- **erp ↔ mBaumgarte**
  - Rapier 0.12 는 접촉을 스프링처럼 무르게 푼다(erp 0.2 면 30장이 명목의 37%).
  - Rapier 0.13 이상은 erp 대신 `contact_natural_frequency`(Hz)를 쓴다.
  - Jolt 는 속도 단계에서 단단하고, 위치 단계마다 겹침의 baumgarte 비율을 고친다. 훑어서 0.4.
- **하위 스텝(`substeps`)**: 가장 큰 손잡이다. 두 엔진 모두 손잡이로 뒀다. Rapier 는 `ip.dt = dt/k` 를 k 번, Jolt 는 `Step(dt, k)`.
- **길이 허용치**: Jolt 기본(0.02·0.02·0.2)을 쓴다. 게임 단위로 줄인 값은 더미 높이가 같고, 잠이 덜 들고, 3~4배 비쌌다(stage4).
- **반복**: Rapier 8(+마찰 4) ↔ Jolt 속도 10·위치 4.
- **밀도**: Jolt 기본 1000 → 1 을 반드시 넣는다.
- **볼록 반경**: min(0.05, 반두께·0.5). h/20 으로 날카롭게 해도 결과 차이가 작았다.
- **마찰·반발 결합**: Rapier 는 평균, Jolt 는 √·max 다. `combine: 'average'` 로 맞춘다.
- **반발 문턱**: Rapier 는 '새 접촉 첫 스텝'에만, Jolt 는 다가오는 속도 > `mMinVelocityForRestitution`(0.5 u/s)일 때 튕긴다. 뜻이 달라 반발 표에만 영향이 있다.
- **각속도 상한**: Jolt 47 → 1000 rad/s.
- **CCD**: `ccd` ↔ LinearCast.
- **잠**: Rapier JS(0.12·0.21)는 문턱을 못 바꾼다(|v|<0.4·|ω|<0.5 를 2 s). Jolt 는 `mPointVelocitySleepThreshold`·`mTimeBeforeSleep` 이다.
  - **Jolt 5.6 은 잠 타이머를 바깥 스텝마다 '마지막 하위 스텝'에서 dt/하위 스텝만큼만 올린다.** 그래서 어댑터의 `sleep.time` 은 게임 시간(초)이고, Jolt 에는 `time / substeps`(`sleep.joltTime`)를 넣는다.
  - `sleep.time` 을 안 주면 Jolt 기본 0.5 를 그대로 넣는다. 실제로는 0.5 s × 하위 스텝이다(jolt-fair = 2 s).
  - 확인: `node audit/sleepchk.mjs` → `data/audit-sleepchk.txt` (Rapier 식 2 s → 실제 2.01 s).
  - 옛 원자료의 `J-b0.4-4x-v20-rsleep` 줄은 실제 8 s 였다. `cmp-A` 에서 `-rsleep8s` 로 이름을 바꿨다. `compare.mjs` 의 같은 이름 설정으로 8/8 해시가 재현된다.
- **감쇠**: Rapier v·1/(1+c·dt) ↔ Jolt v·(1−c·dt). 같은 값을 넣는다(차이 1e-5).

## 결과 요약 (자세히는 보고서 07)

두께 0.055, 게임 바람, 48판(장수 10·20·30·40 × 시드 1~12).

| 엔진 | 서는 설정 (높이 ≥ 0.9) | 그중 5 s 안 완전 멈춤 최대 |
|---|---|---|
| Jolt 5.6 CPD | 10/10 | 48/48 (`jolt-fair-rsleep`, 새 시드 13~24 도 48/48) |
| Rapier JS 0.21 | 11/12 | 10/48 |
| Rapier 0.36 (앱, `native/puffthin`) | 24/46 | 8/48 |
| Rapier JS 0.12 (게임) | 5/12 | 1/48 |

- 결정성: Jolt CPD WASM = x86_64 = aarch64(qemu) 이다. 권고 설정은 `007a29f2`. Rapier 0.36 은 x86_64 = aarch64. npm Jolt 와 CPD 는 섞으면 안 된다.
- 속도(같은 부하, 45장, ms/스텝): Rapier 0.12 1.4~3.9 · Jolt 0.4~0.8 · Rapier 0.21 0.25~0.54.

## 실행

```bash
cd tools/enginecmp      # 무거운 프로세스는 하나씩(nice)

# 비교 A~D (compare.mjs, Jolt 기본 빌드 cpd)
nice node compare.mjs anchor 10,20,30,40 1-12              # 바람 이식 ≡ sim.js (저장소 안에서, mockup/src/sim.js 필요)
nice node compare.mjs stack A R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20,J-b0.4-4x-rsleep,J-b0.4-4x-v20-rsleep
nice node compare.mjs shot B R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20
nice node compare.mjs simshot B0                           # B 기준점 = 진짜 sim.js
nice node compare.mjs shot Bpaper R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20 --hs 0.04
nice node compare.mjs shot Bbounce R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20 --hs 0.055 --props '{"restitution":0.2}'
nice node compare.mjs shot Bsleep J-b0.4-4x-rsleep,J-b0.4-4x-v20-rsleep --hs 0.11,0.055,0.04
nice node compare.mjs shot Bsleep-oos J-b0.4-4x-rsleep,J-b0.4-4x --hs 0.11,0.055 --seeds 13-24
nice node compare.mjs shot Bbounce-sleep J-b0.4-4x-rsleep --hs 0.055,0.04 --props '{"restitution":0.2}'
nice node compare.mjs det --cfgs R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20 --tag det-cpd-1
nice node compare.mjs speed R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-rsleep --tag final-r12

# 공정성 점검 (감사 단계에서 돌린 것과 같은 명령)
nice node compare.mjs stack joltA-oos J-b0.4-4x,J-b0.4-4x-v20 --hs 0.055,0.04 --seeds 4-9
nice node compare.mjs shot joltB-oos J-b0.4-4x,J-b0.4-4x-v20 --hs 0.055 --seeds 13-24
nice node compare.mjs shot rapier055 R-e0.8-2x-pgs2,R-e0.8-1x,R-e0.8-4x,R-e0.8-2x-i4,R-e0.8-2x-i16,R-e0.4-1x --hs 0.055
nice node compare.mjs stack rtolA cfgs/rtol.json --hs 0.055 && nice node compare.mjs shot rtolB cfgs/rtolB.json --hs 0.055
RAPIER_PATH=… nice node compare.mjs stack r21A cfgs/r21A.json --hs 0.055
RAPIER_PATH=… nice node compare.mjs shot r21B cfgs/r21B.json --hs 0.055
RAPIER_PATH=… nice node compare.mjs stack r21C-A cfgs/r21C.json --hs 0.055 && RAPIER_PATH=… nice node compare.mjs shot r21C-B cfgs/r21C.json --hs 0.055
RAPIER_PATH=… nice node compare.mjs speed cfgs/speed-final.json --tag final-r21
nice node compare.mjs shot repro2 R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20 --hs 0.055,0.11 --ns 30 --seeds 1-3
node audit/cmphash.mjs data/cmp-repro2.json.gz data/cmp-B.json.gz     # 24/24
node audit/sleepchk.mjs; node audit/masschk.mjs; node audit/frontier.mjs 0.055

# 앱 엔진(Rapier 0.36 + 게임 바람 Rust) B — 저장소 native/puff_sim 은 안 건드림
bash native/puffthin/setup.sh /tmp/puffthin
CARGO_TARGET_DIR=/tmp/puffthin/target cargo build --release --offline -j2 --manifest-path /tmp/puffthin/Cargo.toml   # 약 1분
bash native/puffthin/run-grid.sh /tmp/puffthin/target/release/bthin /tmp/puffthin/out    # 46 설정 × 48판, 약 6분
node native/puffthin/tojson.mjs /tmp/puffthin/out                                        # → data/cmp-r36B.json.gz

# 표
node cmpsum.mjs A,joltA-oos,r21A,r21C-A,rtolA B0 B B011 Bpaper Bbounce Bbounce-sleep Bsleep Bsleep-oos joltB-oos rapier055 rtolB r21B r21C-B r36B repro repro2

# 네이티브 Jolt (x86_64, g++, CPD 켬) — 약 2분(-j2)
git clone --depth 1 --branch v5.6.0 https://github.com/jrouwe/JoltPhysics /tmp/jolt
cmake -S native/jolt-bench -B build/jolt-gcc-avx2 -G Ninja -DCMAKE_CXX_COMPILER=g++ -DJOLT_SRC=/tmp/jolt -DCMAKE_BUILD_TYPE=Distribution
ninja -C build/jolt-gcc-avx2 -j2 joltbench
# aarch64: native/make-zig-wrappers.sh 머리말 (zig 0.13 + qemu-aarch64-static, 약 3분 + 첫 libc++ 빌드)

# Rapier 0.36 네이티브 벤치 (오프라인, 스크래치 target)
CARGO_TARGET_DIR=/tmp/rapier-bench-target cargo build --release --offline --manifest-path native/rapier-bench/Cargo.toml
CARGO_TARGET_DIR=/tmp/rapier-bench-target CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=rust-lld \
  cargo build --release --offline --target aarch64-unknown-linux-musl --manifest-path native/rapier-bench/Cargo.toml

# 해시 대조 (JS 어댑터 + 네이티브들). JOLT_FLAVOUR 기본 = cpd
node hashcmp.mjs --n 30 --h 0.055 --seed 11 --cfg '{"preset":"jolt-fair-rsleep"}' \
  --native build/jolt-gcc-avx2/joltbench,qemu-aarch64-static:build/jolt-zig-arm64/joltbench \
  --rnative /tmp/rapier-bench-target/release/rapier_bench,qemu-aarch64-static:/tmp/rapier-bench-target/aarch64-unknown-linux-musl/release/rapier_bench

# 처음 Jolt 튜닝 (JOLT_FLAVOUR 를 안 주면 npm 빌드 → JOLT_NPM 필요. CPD 로는 JOLT_FLAVOUR=cpd)
nice node tune-jolt.mjs stage1

# CPD WASM 다시 빌드 (emsdk 6.0.2 ≈ 300 MB 내려받기)
bash native/build-jolt-cpd-wasm.sh
```

- `hashcmp --rnative` 의 Rapier 솔버 값은 puff_sim 기본(게임 v1 짝: erp 0.26 스프링, 책상 erp 0.16·마찰 0.47, 반복 9)이다. 하위 스텝은 `--cfg` 프리셋을 따른다. 바꾸려면 `--rcfg '{"erp":0.8}'`.
- `anchor`·`simshot` 은 저장소 안에서만 돈다(`../../mockup/src/sim.js` + Rapier 0.12).

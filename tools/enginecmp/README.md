# enginecmp — Rapier ↔ Jolt 비교 틀 (엔진 독립 어댑터 + 네이티브 벤치)

## 🧭 핵심 가설

**가설**: 얇은 딱지 더미가 '눌리거나(Rapier v1) 쏜 뒤 안 멈추는(Rapier erp 0.8)' 건 접촉 무름과 한 스텝 길이 문제다. Jolt 의 단단한 접촉에 하위 스텝을 주면 더미가 서고 쏜 뒤에도 덜 기어갈 것이다 → 같은 판·같은 입력을 두 엔진에 넣는 어댑터로 잰다. PvP 비트 일치는 네이티브 해시로 판가름한다.
- 더미 서기 (확인됨): Jolt `jolt-fair`(1/480) 0.98~0.99. Rapier v1 은 0.25~0.37 로 눌린다. Jolt 도 1/120 한 스텝이면 0.39~0.49 로 무너진다.
- 쏜 뒤 멈춤 (부분 확인): Rapier thin 은 18판 모두 5초 상한에 걸린다. jolt-fair 는 18판 중 상한 3판, 느슨 통과(0.5 u/s 미만으로 기어가는 중) 12판, 진짜 멈춤 3판이다. 줄었지만 '완전히 멈춤'은 아니다.
- 기기 간 비트 일치 (확인됨, qemu 기준이며 실기는 미검증): Jolt CPD 빌드는 WASM = x86_64 = aarch64. npm 배포본은 CPD 가 꺼져 있어 26스텝째부터 갈라진다.

## 무엇이 들어 있나

| 경로 | 내용 |
|---|---|
| `adapters/index.mjs` | `createWorld(params)` 엔진 독립 API · Rapier↔Jolt 설정 짝(머리 주석) · `PRESETS` · `JOLT_FAIR`/`JOLT_SCALED`/`JOLT_DEFAULTS` |
| `adapters/rapier.mjs` | Rapier 쪽 (`@dimforge/rapier3d-compat` 0.12.0 = 게임 웹 물리 그대로, 루트 node_modules 에서 가져옴) |
| `adapters/jolt.mjs` | Jolt 쪽 (JoltPhysics.js 1.1.0 = Jolt v5.6.0 WASM). 빌드 `wasm-compat`(npm) / `cpd`(vendor/) |
| `adapters/common.mjs` | 게임 기본값(sim.js TUNE 물리 부분) · 해시 · mulberry32 · 더미 시나리오(float32 고정) · 합성 샷 · 책상 밖 · 판정 |
| `adapters/trial.mjs` | 한 판: 쌓기 → 가라앉힘 3 s → 합성 샷 → 스텝 판정(JUDGE). 두 엔진 같은 절차 |
| `smoke.mjs` | 어댑터 점검(질량·광선·더미·샷·해시 재현) |
| `tune-jolt.mjs` · `summarize.mjs` | Jolt 손잡이 훑기(stage1~4, final) · 결과 표 |
| `hashcmp.mjs` | 같은 판을 JS(WASM)·네이티브 Jolt·네이티브 Rapier 에서 돌려 60스텝마다 해시 대조 |
| `native/jolt-bench/` | Jolt v5.6.0 네이티브 벤치(CMake, CPD 켬) · `aarch64-zig.cmake` |
| `native/rapier-bench/` | Rapier 0.36 (enhanced-determinism) 네이티브 벤치. 판·샷·해시 식이 같고, 솔버는 puff_sim 의 게임 v1 짝 |
| `native/build-jolt-cpd-wasm.sh` · `joltjs-cpd-glue.patch` | CPD WASM 다시 빌드(emsdk 6.0.2) + JoltPhysics.js 1.1.0 바인딩 define 누락 패치 |
| `native/make-zig-wrappers.sh` | aarch64 교차 빌드용 zig 감싸개 |
| `vendor/jolt-physics-1.1.0-cpd.wasm-compat.js.gz` | CPD WASM 빌드 결과(MIT, `vendor/LICENSE-jolt.txt`). 처음 쓸 때 자동으로 풀림 |
| `data/` | 잰 결과(원자료 json.gz + 표 txt + `summary.md` + 결정성 기록) |

## API

```js
import { createWorld, addPileTo, PRESETS } from './adapters/index.mjs';
const w = await createWorld({ preset: 'jolt-fair' });            // 또는 { engine: 'rapier'|'jolt', substeps, erp, jolt:{...}, sleep:{...} }
w.addFloor();                                                     // 책상(윗면 y=0, 마찰 0.9)
const i = w.addDisc(pos, rot, radius, halfHeight, { density, friction, restitution, linDamp, angDamp, ccd });
w.step();                         // dt(1/120) 한 스텝 = substeps 개 하위 스텝
w.getPose(i); w.getVel(i); w.mass(i);
w.applyImpulseAtPoint(i, J, P); w.applyImpulse(i, J); w.applyTorqueImpulse(i, T);
w.castRay(from, dir, max, { exclude: i, discsOnly: true });       // → { i(책상 -1), toi } | null  (바람 가림)
w.isSleeping(i); w.wake(i); w.sleepingCount();
w.setPose(i, p, q); w.setVel(i, v, ω); w.setGravityScale(i, s);   // 다시 쌓기·책상 밖
w.hashState();                    // 8자리 hex — 네이티브 벤치와 같은 식
w.info(); w.destroy();
```

프리셋: `rapier-v1`(지금 게임) · `rapier-thin`(core-sweep §7: erp 0.8, 1/240) · `jolt-fair`(훑어서 고른 Jolt, 1/480) · `jolt-1x`(같은 값, 1/120) · `jolt-fair-rsleep`(잠 문턱을 Rapier 기본에 맞춤).

주의:
- Jolt WASM 의 `JoltInterface` 는 전역 Factory 를 만들고 지운다. **Jolt 월드는 한 번에 하나만** 살려 두고, 차례로 만들고 destroy 한다.
- 한 프로세스에서 Jolt 빌드는 하나만 쓴다(`JOLT_FLAVOUR=cpd` 또는 `wasm-compat`).

## 설정 짝 (Rapier 0.12 JS = rapier 0.18 ↔ Jolt 5.6)

원본은 `adapters/index.mjs` 머리 주석이다. 핵심만 적는다.

- **erp ↔ mBaumgarte**: Rapier 는 접촉을 스프링처럼 무르게 푼다. erp 0.2 면 30장 더미가 명목의 37% 로 눌린다. Jolt 는 속도 단계에서 단단하고, 위치 단계마다 겹침의 baumgarte 비율만큼 고친다. 뜻이 같은 0.2 에서 출발해 훑은 결과 0.4 를 쓴다.
- **한 스텝 길이(`substeps`)**: 이게 가장 큰 손잡이였다. Jolt 도 1/120 한 스텝이면 30장 더미를 못 세운다(0.28~0.50). 하위 스텝 4(1/480)에서 0.98~0.99 로 선다. Rapier 도 단단하게 세우려면 1/240 이 필요했다. 그래서 공정하게 둘 다 하위 스텝을 손잡이로 둔다(Rapier 는 `ip.dt = dt/k` 를 k 번, Jolt 는 `Step(dt, k)`).
- **길이 허용치**: Jolt 기본(허용 겹침 0.02, 미리 접촉 0.02, 한 번 보정 최대 0.2)은 '미터 단위, 10 cm 물체'용이다. 그래서 게임 단위로 줄인 값(0.002·0.01·0.05)부터 쟀다. 하위 스텝 4 에서는 더미 높이가 같았고, 기본값 쪽이 잠이 잘 들고 3~4배 쌌다(stage4). `jolt-fair` 는 기본 길이 허용치를 쓴다.
- **반복**: Rapier numSolverIterations 8 + 마찰 4 ↔ Jolt mNumVelocitySteps 10 · mNumPositionSteps 4.
- **밀도**: Jolt 기본 1000 → 1 로 반드시 넣는다. 안 넣으면 같은 충격량에 1/1000 만 움직인다.
- **볼록 반경**: CylinderShape 의 볼록 반경 = min(0.05, 반두께·0.5). 테두리를 둥글리는 정도이고, 반두께 전부로 해도 결과 차이가 작았다.
- **마찰·반발 결합**: Rapier 는 평균, Jolt 는 √(f1f2)·max(r1,r2) 다. `combine: 'average'` 가 게임과 같은 평균을 맞춘다(재질이 하나면 책상 값만 바꾸고, 아니면 ContactListenerJS 를 쓴다).
- **반발 문턱**: Rapier 는 '새 접촉 첫 스텝'에만 반발한다. Jolt 는 다가오는 속도가 mMinVelocityForRestitution 보다 클 때 반발한다(0.5 u/s 로 둠). 종이 탄성 튜닝 때 다시 볼 것.
- **각속도 상한**: Jolt 기본 47 rad/s → 1000. Rapier 는 상한이 없다.
- **CCD**: `ccd` ↔ `EMotionQuality_LinearCast`.
- **잠**: Rapier JS 0.12 는 문턱을 못 바꾼다(|v|<0.4·|ω|<0.5 를 2 s). Jolt 는 `mPointVelocitySleepThreshold`·`mTimeBeforeSleep`(기본 0.03·0.5 s). 0.4·2 s 로 맞춰도 쏜 뒤 결과는 거의 같았다.
- **감쇠**: Rapier v·1/(1+c·dt) ↔ Jolt v·(1−c·dt). 같은 값을 넣는다(차이 1e-5).

## 지금까지 잰 것 (2026-10-16, 이 컨테이너)

다른 작업과 4코어를 나눠 써서 ms 는 참고만 한다.

### 결정성 (`data/determinism*.txt`)

`hashcmp.mjs` 로 976스텝(가라앉힘 3 s + 샷 + 5 s)을 돌리고 60스텝마다 해시를 비교했다.

| 비교 | 결과 |
|---|---|
| Jolt CPD WASM(자체 빌드) vs x86_64 g++13 AVX2 vs aarch64 zig-clang NEON(qemu) | 7판(jolt-fair 3판 `determinism.txt` + 1x·다른 설정 4판 `determinism-extra.txt`) × 17 체크포인트 **모두 같음** |
| npm `jolt-physics` 1.1.0(CPD 꺼짐) vs 네이티브 CPD | 매 스텝 비교 시 25스텝까지 같고 **26스텝째 갈라짐**. 이 판 설정(벤치 입력)은 비트 단위로 맞게 옮겨졌다는 뜻이고, 갈라지는 원인은 CPD 차이(−x 와 0−x 의 부호 0 등) |
| Rapier 0.36 enhanced-determinism 네이티브 x86_64 vs aarch64(qemu) | 같은 3판 **모두 같음**. wasm32 는 `native/puff_sim` README(hashsweep) 에 이미 있음 |

정리하면 두 엔진 모두 '같은 빌드 설정이면 웹·x86·ARM 이 비트 단위로 같다'까지 확인했다(qemu 기준, 실기 미검증).
- Jolt 는 웹에서 **CPD 자체 빌드가 필요하다**. npm 배포본은 CPD 가 꺼져 있다.
- JoltPhysics.js 1.1.0 의 CMake 는 CPD 를 켜도 바인딩(glue.cpp)에 define 을 안 넘긴다. 그래서 런타임에 `Mismatching define JPH_CROSS_PLATFORM_DETERMINISTIC` 로 멈춘다. `native/joltjs-cpd-glue.patch` 로 고쳤다.
- Rapier 는 지금 웹 게임(JS 0.12)과 네이티브(0.36)의 버전이 달라서, 웹↔앱 PvP 를 하려면 0.36 을 wasm 으로 빌드해 웹에서도 써야 한다.

### 튜닝 (`data/summary.md`, `data/tune-*.txt`)

판은 20·30·45장 × 시드 1~3 이다. 합성 샷은 위 60% 장에 테두리 충격량을 주고, 입→테두리 광선이 가리면 ×0.35 다.

| 설정 | 두께 | 더미 높이/명목 | 쏜 뒤 판정 멈춤/느슨/상한 | 끝 속도 중앙 |
|---|---|---|---|---|
| rapier-v1 (erp 0.2, 1/120) | 0.11 | 0.37 (최소 0.31) | 5/3/1 | 0.035 |
| rapier-v1 | 0.055 | 0.25 (0.21) | 7/2/0 | 0.022 |
| rapier-thin (erp 0.8, 1/240) | 0.11 | 0.99 | 0/0/**9** | 1.21 |
| rapier-thin | 0.055 | 0.98 | 0/0/**9** | 1.28 |
| jolt-fair (1/480) | 0.11 | 0.99 (0.98) | 0/7/2 | 0.32 |
| jolt-fair | 0.055 | 0.98 (0.97) | 3/5/1 | 0.026 |
| jolt-1x (1/120) | 0.11 | 0.39 | 0/1/8 | 0.49 |

- '느슨'은 스텝 판정의 2.5초 뒤 느슨한 문턱(0.5 u/s)으로 통과했다는 뜻이다. 아직 기어가는 중이다.
- Rapier v1 이 쏜 뒤 잘 멈추는 데에는, 눌린 더미에 더해 큰 잠 문턱(0.4 u/s, 2 s)도 한몫한다.

## 실행

```bash
cd tools/enginecmp && npm install          # jolt-physics 만 (루트 package.json 은 안 건드림). Rapier 는 루트 node_modules
node smoke.mjs 30 0.055 1
nice node tune-jolt.mjs stage1             # 약 2분 (무거운 프로세스 1개)
nice node tune-jolt.mjs final              # 고른 프리셋을 stage2 격자로, 약 4분
node summarize.mjs data/tune-stage2.json.gz out/tune-final.json --only 'R v1|R thin|jolt'
JOLT_FLAVOUR=cpd node smoke.mjs            # CPD WASM 빌드로

# 네이티브 Jolt (x86_64, g++, CPD 켬) — 약 2분(-j2)
git clone --depth 1 --branch v5.6.0 https://github.com/jrouwe/JoltPhysics /tmp/jolt
cmake -S native/jolt-bench -B build/jolt-gcc-avx2 -G Ninja -DCMAKE_CXX_COMPILER=g++ -DJOLT_SRC=/tmp/jolt -DCMAKE_BUILD_TYPE=Distribution
ninja -C build/jolt-gcc-avx2 -j2 joltbench
# aarch64: native/make-zig-wrappers.sh 머리말 (zig 0.13 + qemu-aarch64-static, 약 3분 + 첫 libc++ 빌드)

# Rapier 네이티브 (오프라인, puff_sim 과 같은 target 디렉터리 공유 — 지우지 말 것)
CARGO_TARGET_DIR=../../native/puff_sim/target cargo build --release --offline --manifest-path native/rapier-bench/Cargo.toml
CARGO_TARGET_DIR=../../native/puff_sim/target CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=rust-lld \
  cargo build --release --offline --target aarch64-unknown-linux-musl --manifest-path native/rapier-bench/Cargo.toml

# 해시 대조 (JS 어댑터 + 네이티브들)
JOLT_FLAVOUR=cpd node hashcmp.mjs --n 30 --h 0.11 --seed 1 --cfg '{"preset":"jolt-fair"}' \
  --native build/jolt-gcc-avx2/joltbench,qemu-aarch64-static:build/jolt-zig-arm64/joltbench \
  --rnative ../../native/puff_sim/target/release/rapier_bench,qemu-aarch64-static:../../native/puff_sim/target/aarch64-unknown-linux-musl/release/rapier_bench

# CPD WASM 다시 빌드 (emsdk 6.0.2 ≈ 300 MB 내려받기)
bash native/build-jolt-cpd-wasm.sh
```

`hashcmp --rnative` 의 Rapier 솔버 값은 puff_sim 기본(게임 v1 짝: erp 0.26 스프링, 책상 erp 0.16·마찰 0.47, 반복 9)이다. 하위 스텝은 `--cfg` 프리셋을 따른다. 다르게 하려면 `--rcfg '{"erp":0.8}'` 를 쓴다.

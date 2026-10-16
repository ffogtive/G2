# enginecmp — Rapier ↔ Jolt 비교 틀 (엔진 독립 어댑터 + 네이티브 벤치)

## 🧭 핵심 가설

**가설 (비교 뒤, 2026-10-16 저녁)**: 얇은 딱지(0.055·0.04)는 Jolt(CPD 빌드, 하위 스텝 4 = 1/480)로 '서고 + 쏜 뒤 멈추고 + 기기마다 같은' 세 가지가 함께 된다. Rapier JS 0.12 는 훑은 13가지 설정 중 그런 점이 없다 → **Jolt 로 갈지 재윤님이 정한다**(아래 '비교 결과 A~D'). 판가름 근거는 A(가라앉음 %)와 B(5초 안 완전 멈춤 판 수).
- 게임 바람 이식 (확인됨): `adapters/wind.mjs` 는 sim.js 기본 숨 경로를 글자 그대로 옮겼다. Rapier v1 위에서 sim.js 와 **48/48 판 비트 동일**(두께 0.11 × 10·20·30·40장 × 시드 1~12, settle·판정·6 s 해시. `anchor` 24판으로 따로 한 번 더).
- 더미 서기 (확인됨): Jolt `J-b0.4-4x-v20` 은 세 두께 모두 명목의 0.979~0.995, 18/18 판이 2.5 s 안에 쉼·전부 잠. Rapier 는 `R-e0.8-2x`(erp 0.8, 1/240) 한 점에서만 선다. 이웃 설정(반복 16, 1/480, erp 0.4·1.0, PGS 2)은 45장이 쓰러지거나 터진다.
- 쏜 뒤 멈춤 (확인됨, 두께 0.055·0.04): Jolt 40~47/48 판이 5 s 안에 완전히 멈춘다. Rapier 에서 서는 유일한 설정은 0~3/48(나머지 5 s 상한, 5 s 속도 중앙 1.1~1.3 u/s). 지금 게임(Rapier v1)은 멈추지만 더미가 25~30% 로 눌려 뒤집힘이 0.8~1.3장뿐이다.
- 두께 0.11 에서는 Jolt 도 25~31/48 판만 완전히 멈춘다(나머지는 기울어 기댄 딱지가 제자리에서 흔들림, 3→6 s 이동 최대 0.08 u). 솔버 손잡이로는 안 고쳐진다(가설 수정: 둥근 테두리 탓 아님).
- 기기 간 비트 일치 (확인됨, qemu 기준·실기 미검증): Jolt CPD WASM = x86_64 = aarch64, Rapier 0.36 x86_64 = aarch64. **npm Jolt 와 CPD 빌드는 섞으면 안 된다**(같은 판에서 뒤집힘 6 vs 10).

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
| `adapters/wind.mjs` | 게임 바람(sim.js applyWind 기본 경로)·게임 더미 생성기·settle·stepJudge·judgeResult 의 엔진 독립 이식. `GameTable`·`standardShot` |
| `compare.mjs` | 비교 실행기: `anchor`(이식 ≡ sim.js) · `stack`(A) · `shot`(B) · `simshot`(B 기준점) · `det`(C) · `speed`(D) · `report`. 설정 이름표 `CONFIGS` |
| `cmpsum.mjs` | `data/cmp-*.json.gz` → `data/cmp-summary.md` 표 |
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

## 비교 결과 A~D (`compare.mjs`, 2026-10-16 저녁)

**가설**: 하위 스텝을 준 Jolt 는 얇은 딱지에서 '서기 + 쏜 뒤 멈추기'가 함께 되고, Rapier JS 0.12 는 둘 중 하나만 된다 → A 의 가라앉음 %와 B 의 5 s 안 완전 멈춤 판 수로 판가름 (확인됨, 두께 0.055·0.04).

조건: 두 엔진 같은 더미(sim.js `addPile('column')` 과 같은 난수·식, `wind.mjs makeGamePile`), 같은 게임 절차(settle → 표준 초록 숨 → stepJudge). Jolt 는 CPD WASM 빌드. 다른 작업 2개와 4코어를 나눠 써서 부하 6~10 → ms 는 참고만. 전체 표·분포는 `data/cmp-summary.md`, 원자료 `data/cmp-*.json.gz`, 로그 `out/*.log`(커밋 안 함).

### A. 쌓기·가라앉힘 (두께마다 장수 {1,5,10,20,30,45} × 시드 1~3 = 18판, 5 s)

훑은 설정: Rapier 13가지(erp 0.2·0.4·0.8·1.0 × 1/120·1/240·1/480 × 반복 4·8·16 × PGS 1·2), Jolt 17가지(baumgarte 0.2·0.4·0.8 × 하위 스텝 1·2·4·8 × 속도 10·20 × 위치 2·4·8 × 볼록 반경 × 잠 문턱). 줄인 표(전체는 `data/cmp-summary.md`):

| 설정 | 두께 | 높이/명목 (20장↑ 최소 · 평균) | 30장 한 장 몫 | 맨 아래 묻힘 최대 | 쉼(<0.02) 판 · 가장 늦은 쉼 | 떨림 남은 판 (최대 u/s) | 잠 | 무너짐 | ms/스텝 45장 |
|---|---|---|---|---|---|---|---|---|---|
| R-e0.2-1x (지금 게임 v1) | 0.11 | 0.307 · 0.368 | 0.0432 | 0.176 | 18/18 · 2.77 s | 0 | 333/333 | 0 | 1.26 |
| R-e0.2-1x | 0.055 | 0.208 · 0.251 | 0.0156 | 0.110 | 18/18 · 1.05 s | 0 | 333/333 | 0 | 1.72 |
| R-e0.2-1x | 0.04 | 0.165 · 0.202 | 0.0096 | 0.088 | 18/18 · 0.80 s | 0 | 333/333 | 0 | 2.02 |
| R-e0.8-2x (Rapier 1등 = thin) | 0.11 | 0.986 · 0.987 | 0.1086 | 0.002 | 18/18 · 2.53 s | 0 | 333/333 | 0 | 1.14 |
| R-e0.8-2x | 0.055 | 0.930 · 0.970 | 0.0536 | 0.002 | 18/18 · 4.11 s | 1 (0.87) | 332/333 | 1 | 1.24 |
| R-e0.8-2x | 0.04 | 0.960 · 0.965 | 0.0386 | 0.002 | 18/18 · 2.27 s | 0 | 333/333 | 0 | 1.03 |
| J-b0.4-4x (jolt-fair) | 0.11 | 0.983 · 0.991 | 0.1091 | 0.001 | 16/18 · >5 s | 2 (0.79) | 243/333 | 0 | 0.57 |
| J-b0.4-4x | 0.055 | 0.965 · 0.981 | 0.0541 | 0.001 | 17/18 · >5 s | 1 (0.24) | 288/333 | 0 | 0.43 |
| J-b0.4-4x | 0.04 | 0.957 · 0.974 | 0.0390 | 0.001 | 18/18 · 2.50 s | 0 | 333/333 | 0 | 0.30 |
| **J-b0.4-4x-v20 (Jolt 1등)** | 0.11 | 0.993 · 0.995 | 0.1095 | 0.000 | 18/18 · 2.46 s | 0 | 333/333 | 0 | 0.48 |
| J-b0.4-4x-v20 | 0.055 | 0.986 · 0.990 | 0.0545 | 0.000 | 18/18 · 2.23 s | 0 | 333/333 | 0 | 0.39 |
| J-b0.4-4x-v20 | 0.04 | 0.979 · 0.986 | 0.0395 | 0.000 | 18/18 · 2.23 s | 0 | 333/333 | 0 | 0.42 |

- Rapier 은 좋은 점이 섬 하나다. `R-e0.8-2x` 이웃이 모두 나빠진다: 반복 16(1/240) 45장 0.11 무너짐 5/18, 1/480 무너짐 3/18, erp 0.4 무너짐 3~6/18, PGS 2 무너짐 2/18, erp 1.0 은 터진다(18판 중 11~13판 무너짐·책상 밖). v1(erp 0.2)은 1장짜리 0.04 딱지도 명목의 0.64 로 눌리고, 45장이면 맨 아래 장이 책상에 0.088 u 묻힌다.
- Jolt 는 하위 스텝 4 이상이면 baumgarte 0.2~0.8 어디서나 선다(0.95~0.996). 1/120·1/240 이면 Jolt 도 눌린다(0.22~0.81). 속도 반복 10 → 20 이 45장 떨림을 없앴다. Rapier 식 잠 문턱(0.4 u/s·2 s)을 Jolt 에 주면 5 s 안에 한 장도 안 잔다(쓰지 말 것).

### B. 쏜 뒤 (장수 {10,20,30,40} × 시드 1~12 = 두께마다 48판, 게임 바람 그대로)

| 설정 | 두께 | 판정 멈춤/느슨/상한 | 판정 시각 중앙 | 5 s 안 <0.08 | 6 s 안 <0.02 (중앙) | 5 s 속도 중앙 · 최대 | 3→6 s 이동 중앙 · 최대 | 판정 뒤 결과 바뀜 | 뒤집힘 평균 | 원 밖 평균 |
|---|---|---|---|---|---|---|---|---|---|---|
| sim.js (진짜 게임) | 0.11 | — | 1.56 s | 38/48 | 39/48 (2.39 s) | 0.000 · 0.906 | 0.001 · 0.366 | 0/48 | 5.4 | 2.3 |
| R-e0.2-1x (이식, 위와 48/48 해시 같음) | 0.11 | 36/8/4 | 1.56 s | 38/48 | 39/48 (2.39 s) | 0.000 · 0.906 | 0.001 · 0.366 | 0/48 | 5.4 | 2.3 |
| R-e0.2-1x | 0.055 | 47/1/0 | 1.21 s | 46/48 | 47/48 (1.14 s) | 0.000 · 0.308 | 0.000 · 0.012 | 0/48 | 1.3 | 0.4 |
| R-e0.2-1x | 0.04 | 48/0/0 | 1.10 s | 48/48 | 48/48 (1.03 s) | 0.000 · 0.001 | 0.000 · 0.004 | 0/48 | 0.8 | 0.1 |
| R-e0.8-2x | 0.11 | 1/1/46 | 5.00 s | 2/48 | 2/48 | 0.996 · 4.828 | 0.335 · 2.526 | 2/48 | 2.9 | 4.4 |
| R-e0.8-2x | 0.055 | 0/0/48 | 5.00 s | 0/48 | 0/48 | 1.084 · 4.250 | 0.429 · 2.365 | 2/48 | 6.7 | 4.9 |
| R-e0.8-2x | 0.04 | 3/1/44 | 5.00 s | 3/48 | 3/48 | 1.251 · 2.904 | 0.402 · 1.960 | 2/48 | 7.1 | 4.4 |
| J-b0.4-4x | 0.11 | 17/26/5 | 2.71 s | 30/48 | 31/48 (2.32 s) | 0.000 · 0.690 | 0.003 · 0.050 | 0/48 | 4.2 | 3.2 |
| J-b0.4-4x | 0.055 | 41/7/0 | 1.50 s | 47/48 | 47/48 (1.57 s) | 0.000 · 0.319 | 0.000 · 0.127 | 0/48 | 9.7 | 1.9 |
| J-b0.4-4x | 0.04 | 36/12/0 | 1.41 s | 46/48 | 46/48 (1.32 s) | 0.000 · 0.380 | 0.000 · 0.032 | 0/48 | 11.7 | 1.0 |
| J-b0.4-4x-v20 | 0.11 | 20/20/8 | 2.71 s | 25/48 | 26/48 (1.96 s) | 0.000 · 0.679 | 0.004 · 0.081 | 0/48 | 4.1 | 3.3 |
| J-b0.4-4x-v20 | 0.055 | 38/9/1 | 1.66 s | 40/48 | 41/48 (1.51 s) | 0.000 · 0.623 | 0.000 · 0.160 | 0/48 | 9.7 | 1.8 |
| J-b0.4-4x-v20 | 0.04 | 38/10/0 | 1.33 s | 41/48 | 44/48 (1.13 s) | 0.000 · 0.469 | 0.000 · 0.056 | 0/48 | 11.4 | 0.9 |
| 반발 0.2: R-e0.8-2x | 0.055 | 1/0/47 | 5.00 s | 1/48 | 1/48 | 1.294 · 10.580 | 0.490 · 1.654 | 3/48 | 7.0 | 4.9 |
| 반발 0.2: J-b0.4-4x | 0.055 | 36/10/2 | 1.54 s | 42/48 | 45/48 (1.44 s) | 0.000 · 0.526 | 0.000 · 0.050 | 0/48 | 9.5 | 2.0 |
| 반발 0.2: J-b0.4-4x-v20 | 0.055 | 37/11/0 | 1.68 s | 41/48 | 42/48 (1.60 s) | 0.000 · 0.213 | 0.000 · 0.084 | 0/48 | 9.6 | 1.9 |

- 장수별 분포(평균 ± 표준편차): 0.11 에서 v1 20·30장은 7.3±4.9·7.3±4.7(0~15, '대박 아니면 꽝'), Jolt 는 4.3±0.9·3.8±1.5 로 고르다. 0.055 에서 Jolt 20·30장 10.6±2.3·10.9±2.3, v1 은 1.8±2.5·0.7±1.4. → 엔진을 바꾸면 숨 규칙·레벨 보정(`powercurve`·`calibrate`)을 다시 해야 한다.
- 0.11 에서 Jolt '느슨' 판의 움직임은 기울어 기댄 딱지(10~13°)나 작은 묶음이 테두리 위에서 흔들의자처럼 흔들리는 것이다(`diag.mjs`, ω ⊥ 법선). 볼록 반경 h/20·baumgarte 0.2·위치 반복 8·하위 스텝 8 어느 것도 5 s 안 완전 멈춤이 21~26/48 로, v20 의 25/48 보다 나아지지 않았다(`data/cmp-B011`, `cmp-B`). 0.055·0.04 에서는 드물다.
- Rapier 0.36(앱 네이티브 puff_sim)은 게임 바람으로는 안 쟀다(미검증). 합성 샷 hashcmp 45장(8.1 s)에서 erp 0.8·1/240 짝은 잠 1/45(0.11)·10/45(0.055), Jolt v20 은 45/45.

### C. 결정성

| 비교 | 결과 |
|---|---|
| 같은 입력 두 번, 같은 프로세스 새 월드 (R-e0.2-1x · R-e0.8-2x · J-b0.4-4x · J-b0.4-4x-v20 × {30장 0.055 시드 1, 40장 0.11 시드 2}, 바람 이식 샷 포함) | 8/8 settle·판정·끝 해시 같음 |
| 같은 것을 다른 프로세스로 한 번 더 | 8/8 같음 |
| Jolt npm(CPD 꺼짐) vs CPD, 같은 판 | 4/4 판정 해시 다름 · 1판은 결과도 다름(뒤집힘 10 vs 6). npm 끼리 두 번은 같음 |
| Jolt CPD WASM vs x86_64 g++ AVX2 vs aarch64 NEON(qemu), 새 판(v20 설정, 30장 0.055 시드 4, 976스텝 = 16 체크포인트 + 끝) | 모두 같음 `162874e8` (앞선 7판 포함 8판, `data/cmp-C-hashcmp-v20-h055-s4.txt`) |
| Jolt CPD WASM vs x86_64, 45장 0.11·0.055 | 같음 `252e249a` · `453476e0` |
| Rapier 0.36 x86_64 vs aarch64(qemu), 같은 새 판 | 같음 `7cfb2213`. wasm32 는 puff_sim README(hashsweep 30, 1,021 해시) |
| Rapier JS 0.12(웹 게임) vs Rapier 0.36(앱) | 버전이 달라 비교 대상 아님. 웹↔앱 PvP 를 Rapier 로 하려면 0.36 을 wasm 으로 웹에 넣어야 함 |

필요한 빌드: Jolt = `CROSS_PLATFORM_DETERMINISTIC=ON` (웹은 `vendor/` 자체 빌드 + `native/joltjs-cpd-glue.patch`, 앱은 같은 플래그로 iOS·Android 정적 라이브러리 — 아직 안 만듦). Rapier = `enhanced-determinism` + libm(앱은 이미 있음). 두 경우 모두 바람 식(지금 JS `Math.exp/pow/sin`)도 기기마다 같아야 한다 — 앱은 `detmath.dart` 로 하고 있음, 웹 쪽은 따로 확인 필요(미검증).

### D. 속도·크기 (45장, ms 는 1/120 게임 스텝당, 부하 6.0~6.4 · 3번 중 최소)

WASM 은 `compare.mjs speed`(어댑터·바람 JS 포함, `data/cmp-speed-*.json.gz`), 네이티브는 hashcmp 합성 샷 976스텝(`data/cmp-D-speed-native.txt`). Rapier 네이티브는 0.36 + puff_sim 솔버 짝이라 JS 0.12 와 같은 물리가 아니다(속도 참고만).

| 설정 | 두께 | WASM 가라앉힘 | WASM 샷 | 네이티브 x86_64 (hashcmp 976스텝) |
|---|---|---|---|---|
| R-e0.2-1x (JS 0.12) | 0.11 · 0.055 | 2.19 · 2.49 | 2.48 · 3.66 | 0.36 v1 짝 0.48 · 0.56 (JS 같은 판 2.12 · 2.12) |
| R-e0.8-2x (JS 0.12) | 0.11 · 0.055 | 1.45 · 1.61 | 1.53 · 1.56 | 0.36 erp 0.8·1/240 0.50 · 0.41 (JS 1.88 · 1.60) |
| J-b0.4-4x CPD | 0.11 · 0.055 | 0.64 · 0.62 | 0.70 · 0.74 | — |
| J-b0.4-4x-v20 CPD | 0.11 · 0.055 | 0.66 · 0.56 | 0.87 · 0.93 | 0.40 · 0.29 (WASM 같은 판 0.82 · 0.68) |
| J-b0.4-4x npm | 0.11 · 0.055 | 0.57 · 0.60 | 0.72 · 0.81 | — |
| J-b0.4-4x-v20 npm | 0.11 · 0.055 | 0.61 · 0.60 | 0.87 · 0.96 | — |

| 파일 | 원본 | gzip |
|---|---|---|
| Rapier JS 0.12 compat 한 파일(`rapier.es.js`, wasm 내장) | 2,050,249 B | 755,029 B |
| Rapier 0.12 wasm 따로(`rapier_wasm3d_bg.wasm`) + 바인딩(`rapier_wasm3d.js`) | 1,440,651 + 188,677 B | 519,756 + 19,946 B |
| Jolt npm wasm-compat 한 파일 | 3,222,495 B | 905,376 B |
| Jolt CPD wasm-compat 한 파일(`vendor/`) | 3,231,785 B | 906,606 B |
| Jolt wasm 따로(`jolt-physics.wasm.wasm`) + 바인딩(`jolt-physics.wasm.js`) | 2,021,569 + 964,712 B | 741,965 + 135,512 B |
| Rapier 0.36 + 게임 코드 wasm32-wasip1(`puff_sim.wasm`) | 2,214,588 B | 797,896 B |
| 앱 네이티브: libpuff_sim.so (Rapier 0.36, x86_64 release) / joltbench (Jolt, x86_64, 벤치 실행 파일) | 3,112,136 / 2,023,640 B | — |

### 권고와 남은 일

- **권고 (재윤님 결정 대기)**: 종이처럼 얇은 딱지(0.055)로 가면 물리 엔진은 Jolt(CPD), `J-b0.4-4x-v20`(하위 스텝 4 = 1/480, baumgarte 0.4, 속도 20·위치 4, Jolt 기본 길이 허용치, 볼록 반경 h/4)이 지금까지 가장 낫다. 두께를 0.11 로 둔다면 Rapier v1 이 쏜 뒤 멈춤은 더 낫다(38/48 vs 25~31/48) — 엔진을 바꿀 이유가 약하다.
- 바꾸면 할 일: ① 앱용 Jolt CPD 정적 라이브러리(iOS arm64·Android arm64) + Flutter dart:ffi C 다리(지금 puff_sim 은 Rust/Rapier) ② 웹 게임 sim.js 를 어댑터 위로 옮기고 숨 규칙·레벨 다시 보정 ③ 실기기(iPhone·Android) 해시 대조 ④ JoltPhysics.js CMake CPD 버그 업스트림 보고.
- 반발 0.2(조금 더 통통)는 Jolt 에서 멈춤을 거의 안 해친다(42~45/48). Rapier thin 은 반발과 상관없이 안 멈춘다.

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

# 비교 A~D (compare.mjs, 무거운 프로세스 1개씩)
nice node compare.mjs anchor 10,20,30,40 1-6               # 바람 이식 ≡ sim.js (약 30초)
nice node compare.mjs stack A R-e0.2-1x,R-e0.8-2x,J-b0.4-4x-v20     # A (설정당 5~30초)
nice node compare.mjs shot B R-e0.2-1x,R-e0.8-2x,J-b0.4-4x,J-b0.4-4x-v20   # B (설정당 20~70초)
nice node compare.mjs simshot B0                            # B 기준점 = 진짜 sim.js
nice node compare.mjs det --cfgs R-e0.2-1x,J-b0.4-4x-v20 --tag det-cpd-1    # C
nice node compare.mjs speed R-e0.2-1x,J-b0.4-4x-v20 --n 45 --reps 3         # D
node cmpsum.mjs A B B0 B011 Bpaper Bbounce                  # → data/cmp-summary.md

# CPD WASM 다시 빌드 (emsdk 6.0.2 ≈ 300 MB 내려받기)
bash native/build-jolt-cpd-wasm.sh
```

`hashcmp --rnative` 의 Rapier 솔버 값은 puff_sim 기본(게임 v1 짝: erp 0.26 스프링, 책상 erp 0.16·마찰 0.47, 반복 9)이다. 하위 스텝은 `--cfg` 프리셋을 따른다. 다르게 하려면 `--rcfg '{"erp":0.8}'` 를 쓴다.

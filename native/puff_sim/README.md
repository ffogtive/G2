# puff_sim — 딱지 물리 네이티브 포팅 (B 시제품 · PART R)

## 🧭 핵심 가설

**가설 (확인됨)**: 웹 물리의 손맛은 ① 바람 모델(sim.js `applyWind`)과 ② Rapier JS 0.12(= rapier 0.18 PGS)의 **아주 무른 접촉**(erp 0.2 → 20장 더미가 반 높이로 눌림)과
**무른 접촉에 묶인 약한 마찰**에서 나온다. 바람 모델은 그대로 옮기고, 엔진 차이(접촉 스프링·마찰·이완 반복)만 0.36 손잡이로 다시 맞추면
JS 측정 도구 곡선이 16시드 잡음 안에서 겹친다 → 네이티브로 '손맛'을 지킬 수 있다.

- 처음 가설(미검증 → **가설 수정**): "0.18 의 erp·cfm 을 0.36 contact_softness 로 수식 그대로 역산하면 같다" → 틀림.
  같은 erp 로는 큰 더미가 JS 보다 25% 더 눌리고(20장 꼭대기 0.72 vs 0.96), 같은 마찰 0.75 로는 돌풍에 딱지가 덜 날아갔다(1.2배 숨 원 밖 0.9장 vs 4.8장, 9줄 평균).
  원인: 0.18 은 마찰을 '무른 편향 단계'의 법선 충격량에만 묶어 풀어서 실효 마찰이 약했고(0.36 은 단단한 이완 단계에서도 마찰을 푼다),
  0.36 은 서브스텝 감쇠비를 나누지 않는다. → 더미 높이 프로필과 초반 속도 궤적을 JS 와 직접 대조해 손잡이를 다시 맞춤(아래 '엔진 매핑').

## 결론 (요약)

**네이티브로 손맛을 지킬 수 있다 — 단, 엔진 손잡이를 다시 맞추는 값(약 하루)이 든다.** (16시드, 측정 원본 `parity/data/`)

| 비교 (다섯 도구 336칸) | 잡음 안 칸 (\|z\|<2) | loss (평균 z², 1 ≈ 잡음뿐) | 헤드라인 22 |
|---|---|---|---|
| **JS vs JS** (시드 1–16 vs 17–32: 엔진이 같아도 이만큼 흔들림 = 바닥선) | 324/336 (96%) | **0.81** | 22/22 |
| Rust, sim.js 값 **글자 그대로** + 0.18→0.36 수식 매핑 (`PRESET=web`) | 257/336 (76%) | 3.90 | 17/22 — 돌풍 규칙이 깨짐(1.2배 숨: 뒤집힘 2.1·원 밖 0.9 vs JS 0.7·4.8 = '빨강이 덜 손해') |
| **Rust, 다시 맞춘 기본값** (시드 1–16, 튜닝에 쓴 시드) | 317/336 (94%) | **1.01** | 20/22 — 1.1배 숨 원 밖(1.4 vs 2.1), 20장 가운데 층 낮은 입 이득(×8.3 vs ×3.3, 둘 다 수평 바닥이 0.1·1.1 이라 배수가 큼) |
| **Rust, 다시 맞춘 기본값 — 새 시드 17–32** (튜닝에 안 쓴 시드) | 316/336 (94%) | **1.04** | 19/22 |

- 겹치는 것: 숨 곡선의 세 구간(약함 ≈0 · 초록 고원 · 돌풍 → 원 밖), 위에서 몇 장째가 최고인가(n=3~20 전부 같은 층 또는 잡음 안), 좌우 조준(가운데 ≥ 옆, 옆을 불면 반대쪽으로 밀림),
  1장 0.75 정점(63% vs 69%, 0.95 는 둘 다 25%), 2장 이상 0.95 까지 오름, 낮은 입이 가운데 층을 살림(n=14 ×1.63 vs ×1.49).
- 안 겹치는 것(체계적): ① **20장 더미에서 원 밖으로 떨어지는 장수가 1장쯤 적다**(초록·조준 0.5: 1.1 vs 2.6, 1.05~1.1배 숨도 같은 쪽).
  JS 에선 맨 위 3~4장이 반지름 3.2~4.0 에 '살짝 넘어' 떨어지는데 Rust 는 원 안쪽에 더 많이 남는다. ② **14~20장 가운데·아래 층이 덜 넘어간다**(20장 가운데: 낮은 입 1.0 vs 3.7, 수평 0.1 vs 1.1).
  ①과 ②는 이완 반복(stabIters) 한 손잡이로 맞바꿈 관계다(2 로 올리면 ②가 맞고 ①이 더 벌어짐) → 0.36 에는 0.18 의 '무른 접촉에 묶인 마찰'과 똑같은 손잡이가 없다.
- 성능: 같은 x86 코어에서 **Rust 스텝이 JS WASM 보다 4~5배 빠르다**(20장 170µs vs 750µs, 40장 450µs vs 2,200µs).
- 결정성: 같은 시드 → **x86_64 · aarch64(qemu) · wasm32 비트 동일**, release 두 번 따로 빌드해도 같은 해시(아래).
  → 웹 빌드도 이 Rust 물리를 WASM 으로 쓰면 웹·iOS·안드로이드가 같은 물리(크로스 PvP). 지금 Rapier JS 0.12 와 Rust 0.36 은 비트로는 절대 안 맞는다(엔진이 다름).


## 구조

```
native/puff_sim/
  Cargo.toml            rapier3d =0.36.0 (enhanced-determinism) + libm. crate-type = rlib · cdylib(.so) · staticlib(.a, iOS)
  src/table.rs          sim.js Table 포팅: addPile·settle·blow(기본 + 9차 입술 높이 mouthY)·applyWind·step(off)·runUntilSettled·judge·restack·해시
  src/rules.rs          rules.js resolveShot·sweetHiFor·physSweetFor
  src/rng.rs            mulberry32·gauss — JS 와 비트 단위로 같은 수열 → 같은 시드 = 같은 더미·같은 jitter
  src/tune.rs           TUNE (sim.js 이름 그대로 + 엔진 손잡이), "key=value" 덮어쓰기
  src/ffi.rs            C ABI (puff_new … puff_free), include/puff_sim.h — 앱용 malloc 없는 길(puff_blow_v·fire_v·resolve_v·info·settle_step…)
  src/lib.rs fire_turn  turn.js ShotRun.fire 순서(숨 해석 난수 줄기 → 판 난수 → 조준 → blow)의 Rust 기준
  src/bin/puff_parity.rs  JS 도구의 Rust 판(powercurve·fromtop·aimmap·stackpower·mouthmap) + bench + hash/hashsweep + trace/settleprof
                        + shots(앱 연결 대조 JSON → app/test/fixtures/sim_cli_shots.json)
  parity/jsref.mjs      JS 물리로 같은 다섯 도구를 돌려 '시드별' JSON (tools/*.mjs 는 평균만 찍어서 잡음 판정 불가)
  parity/compare.mjs    두 JSON → 칸별 z 점수(잡음 안?) + 헤드라인(손맛 모양) 판정
  parity/bench.mjs      JS WASM 스텝 시간 (Rust `puff_parity bench` 와 같은 시나리오)
  parity/data/          이번 측정 원본: JS·Rust 시드별 JSON(시드 1–16, 새 시드 17–32, PRESET=web), 벤치 (아래 표의 근거)
  tests/determinism.rs  같은 시드 → 같은 해시, C ABI 왕복, 황금 해시(아키텍처 간 계약)
  tests/app_abi.rs      앱용 C ABI 길 = 구조체 길 = Table 직접 (fire_v · blow_v · settle_step · resolve_v · info)
  tests/c/ffi_smoke.c   헤더 + .so 를 C 에서 직접 (dart:ffi 와 같은 경로)
  dart/                 path 패키지 puff_sim_ffi — dart:ffi 바인딩(의존성 0, malloc 없음: 고정 버퍼를 asTypedList 로). 앱(app/)이 path 의존성으로 씀
    lib/puff_sim_ffi.dart · bin/ffi_check.dart(리눅스 .so 로 확인)
  scripts/build-ios.sh  맥: staticlib(기기·시뮬레이터) → 임베디드 비트코드 벗기기 → lipo → dist/ios/link.xcconfig 로 Runner 링크 켜기
  scripts/build-android.sh  cargo-ndk → app/android/app/src/main/jniLibs
  ios/PuffSim.xcconfig  Runner 링크 설정(PUFF_SIM_LDFLAGS = SDK 별 -force_load, STRIP_STYLE=non-global) — link.xcconfig 가 켤 때만
```

## 빌드·실행 (리눅스, 이 컨테이너)

```bash
cd native/puff_sim
cargo test --release                                   # 결정성·FFI·황금 해시
cargo run --release --bin puff_parity -- all 16        # 다섯 도구 (JSON=rust.json 이면 시드별 저장)
node parity/jsref.mjs 16                               # 같은 다섯 도구를 JS 물리로 (JSON=js.json)
node parity/compare.mjs js.json rust.json [--md] [--cells]
cargo run --release --bin puff_parity -- bench 1,5,10,20,30,40 5 ; node parity/bench.mjs 1,5,10,20,30,40 5
cargo run --release --bin puff_parity -- hashsweep 30  # 아키텍처 간 대조용 한 줄 해시
cc -O2 -Iinclude tests/c/ffi_smoke.c -Ltarget/release -lpuff_sim -o target/ffi_smoke && LD_LIBRARY_PATH=target/release target/ffi_smoke
(cd dart && PATH=/opt/flutter-sdk/flutter/bin:$PATH dart run bin/ffi_check.dart ../target/release/libpuff_sim.so)   # dart:ffi → 리눅스 .so
target/release/puff_parity shots > ../../app/test/fixtures/sim_cli_shots.json   # 앱 연결 대조 고정본(물리·규칙을 바꾸면 다시)
```

TUNE 덮어쓰기: `TUNE="friction=0.5,lift=500" cargo run --release --bin puff_parity -- powercurve` (sim.js camelCase 이름 그대로 됨).

## 엔진 매핑 (Rapier JS 0.12 = rapier 0.18 → rapier3d 0.36)

'같은 erp 를 그대로 옮기면 같다'가 틀린 이유와, 실제로 쓴 값:

| 항목 | Rapier JS 0.12 (= rapier 0.18, PGS 작은 스텝) | 이 포팅 (rapier3d 0.36, soft-TGS) | 근거 |
|---|---|---|---|
| 서브스텝 | numSolverIterations 8 | **9** | parity 탐색 |
| 접촉 스프링 | erp 0.2, damping_ratio 1 (서브스텝마다 ÷8 → ζ 0.125) | contact_softness ← erp **0.26** 역산 = 13.4 Hz, ζ 1/9 | 0.36 은 ζ 를 서브스텝으로 안 나눔. 같은 erp(9.55 Hz)면 20장 꼭대기 0.72 (JS 0.96) |
| 책상 접촉 | 같은 erp | static_contact_softness ← erp **0.16** = 7.3 Hz | JS 더미 바닥이 책상에 0.06~0.08 파묻힘 |
| 마찰 계수 | 딱지 0.75 · 책상 0.9 | **0.42 · 0.47** | 0.18 은 마찰을 '무른 편향 단계'의 법선 충격량에만 묶어 풀어 실효 마찰이 약했다(블로우 4·8·15스텝 속도 궤적을 JS 와 대조) |
| 마찰 모델 | 접촉점마다 Coulomb | FrictionModel::Coulomb (0.36 기본은 Simplified) | 같은 모델 |
| 이완(편향 없는) 반복 | 서브스텝마다 법선만 1회 | num_internal_stabilization_iterations 1 | 2 면 깊은 층 ↑·원 밖 ↓ (위 결론 ②①) |
| 편향 보정 한도 · 선속도 상한 · 각속도 상한 | 없음 | 무한 · 무한 · allow_fast_rotation | 0.36 기본값(3.0 · 400 · 45°/서브스텝)은 돌풍을 죽인다 |
| 허용 오차 / 예측 거리 | 0.001 / 0.002 | 0.001 / 0.002 | 같게 (0.36 기본 0.005 / 0.02) |
| 접촉 재활용 · 자이로 힘 | 없음 | 끔 · 끔 | 같게 |
| 잠들기 | \|v\|<0.4 · \|ω\|<0.5 를 2초 | point-drift 0.45 를 2초 | 가장 가까운 짝 |
| 광선(차폐·틈) | 질의 파이프라인(지난 스텝 끝 자세) | 딱지 ≤ 40장 전수 검사(같은 답) | 0.36 BVH 잎은 '살찐 AABB' 라 빨리 움직인 딱지를 놓칠 수 있다 |
| 바람 모델 | sim.js applyWind | **같은 식**(f64 + libm). 바꾼 값은 돌풍 둘: blastPush 15→**18.2**, blastShove 3→**1.92** | 엔진이 달라 약해진 '원 밖 날림'을 맞춤 |
| 난수 | mulberry32 | 같은 수열(비트 동일) → **같은 시드 = JS 와 같은 더미·같은 jitter** | 단위 테스트 |

손잡이 찾는 법(재현): ① `settleprof` 로 장수별 가라앉은 높이를 JS 와 맞춤(erp·책상 erp) → ② `trace` 로 같은 시드 블로우의 스텝별 속도를 JS 와 대조(마찰) →
③ 다섯 도구 부분 집합(8시드, 한 번 10~30초)을 목적 함수로 무작위 탐색 2회(약 70번) → ④ 16시드 전체 + 튜닝에 안 쓴 새 시드로 확인.
목적 함수가 잡음 바닥(≈1)에 닿으면 멈춘다 — 그 아래는 시드 잡음을 맞추는 과적합.


## parity (16시드, JS = 이 커밋의 mockup/src/sim.js)

재현: `node parity/compare.mjs parity/data/js-seeds1-16.json parity/data/rust-seeds1-16.json --md --table` (JS = Rapier JS 0.12 WASM, Rust = 이 크레이트 기본값).
헤드라인 판정 기준은 compare.mjs 안에 있다(곡선 평균은 ±max(0.6, 15%), 최고 층은 '같거나 JS 에서도 잡음 안' 등). 같은 엔진끼리 시드만 바꿔도 aimmap 가운데 이득(0.84 ↔ 0.09)·
mouthmap 20장 이득(3.25 ↔ 1.69)은 크게 흔들린다(js-seeds17-32.json) — 그 칸들은 원래 잡음이 크다.

#### 칸별 일치 (|z| < 2 = 16시드 잡음 안)

| 도구 | 칸 | 잡음 안 | 비율 | 평균 차 RMS |
|---|---|---|---|---|
| powercurve | 180 | 165 | 92% | 0.50 |
| fromtop | 42 | 42 | 100% | 0.80 |
| aimmap | 18 | 18 | 100% | 0.49 |
| stackpower | 80 | 80 | 100% | 0.21 |
| mouthmap | 16 | 12 | 75% | 0.98 |

#### 헤드라인 (손맛을 정하는 모양)

| 항목 | JS (Rapier JS 0.12) | Rust (rapier3d 0.36) | 판정 | 메모 |
|---|---|---|---|---|
| powercurve 약함 0.6: 뒤집힘/원 밖 (9줄 평균) | 0.6 / 0.0 | 0.7 / 0.0 | 맞음 |  |
| powercurve 초록 0.9: 뒤집힘/원 밖 (9줄 평균) | 5.4 / 1.1 | 4.9 / 0.9 | 맞음 |  |
| powercurve 돌풍 1.1: 뒤집힘/원 밖 (9줄 평균) | 4.0 / 2.1 | 4.0 / 1.4 | 다름 |  |
| powercurve 돌풍 1.2: 뒤집힘/원 밖 (9줄 평균) | 0.7 / 4.8 | 0.9 / 4.2 | 맞음 |  |
| powercurve 돌풍 1.3: 뒤집힘/원 밖 (9줄 평균) | 0.0 / 6.7 | 0.0 / 7.2 | 맞음 |  |
| powercurve 1.2 ÷ 초록 (돌풍 손해) | 0.13 | 0.19 | 맞음 |  |
| fromtop n=3: 최고 층(장째) [값] | 2 [2.7] | 2 [2.7] | 맞음 |  |
| fromtop n=5: 최고 층(장째) [값] | 3 [4.1] | 3 [4.1] | 맞음 |  |
| fromtop n=8: 최고 층(장째) [값] | 3 [6.1] | 4 [6.4] | 맞음 | JS 에서 4장째 = 6.1 (z 0.0) |
| fromtop n=12: 최고 층(장째) [값] | 3 [6.9] | 3 [6.3] | 맞음 |  |
| fromtop n=16: 최고 층(장째) [값] | 2 [8.5] | 2 [7.0] | 맞음 |  |
| fromtop n=20: 최고 층(장째) [값] | 3 [6.5] | 3 [6.2] | 맞음 |  |
| aimmap h=0.95: 가운데 − 옆 평균 (장) · 옆 이동 −0.6/+0.6 | 0.06 · 0.73/-0.69 | 0.38 · 0.94/-0.83 | 맞음 |  |
| aimmap h=0.75: 가운데 − 옆 평균 (장) · 옆 이동 −0.6/+0.6 | 0.84 · 0.64/-0.56 | 0.84 · 0.73/-0.76 | 맞음 |  |
| aimmap h=0.5: 가운데 − 옆 평균 (장) · 옆 이동 −0.6/+0.6 | 1.09 · 0.41/-0.54 | 0.91 · 0.67/-0.74 | 맞음 |  |
| stackpower n=1 lat=0: 0.75 / 0.95 성공률 · 정점 | 69% / 25% · 0.75 | 63% / 25% · 0.75 | 맞음 |  |
| stackpower n=1 lat=0.6: 0.75 / 0.95 성공률 · 정점 | 63% / 25% · 0.75 | 63% / 19% · 0.75 | 맞음 |  |
| stackpower n=2,3,5,8: 0.95 ≥ 0.75 (계속 오름) | YYYY | YYYY | 맞음 |  |
| mouthmap n=14: 가운데 층 낮은 입 ÷ 수평 | 1.49 (8.0/5.4) | 1.63 (6.7/4.1) | 맞음 | 낮은 입이 이기는가 + 이득 배수가 2배 안 |
| mouthmap n=14: 수평 최고 층 | 3 [8.9] | 3 [7.8] | 맞음 |  |
| mouthmap n=20: 가운데 층 낮은 입 ÷ 수평 | 3.25 (3.7/1.1) | 8.25 (1.0/0.1) | 다름 | 낮은 입이 이기는가 + 이득 배수가 2배 안 |
| mouthmap n=20: 수평 최고 층 | 3 [6.4] | 3 [6.4] | 맞음 |  |

loss(mean z², cap 25) = 1.009

#### powercurve — 뒤집힌 장수 / 원 밖 장수 (JS→Rust, **굵게** = 잡음 밖 |z|≥2)

| n · 조준 | 0.50 | 0.60 | 0.70 | 0.90 | 1.05 | 1.10 | 1.20 | 1.30 |
|---|---|---|---|---|---|---|---|---|
| 8 · 0.95 | 0.9→0.6 / 0.0→0.0 | 1.6→1.6 / 0.0→0.0 | 3.6→3.5 / 0.4→0.3 | 4.8→4.3 / 1.0→1.0 | 4.5→4.3 / 1.2→1.1 | 3.9→4.3 / 1.3→1.0 | 1.1→1.3 / 3.9→3.6 | 0.0→0.0 / 5.4→5.5 |
| 8 · 0.75 | 0.5→0.3 / 0.0→0.0 | 1.4→1.5 / 0.0→0.0 | 4.1→4.0 / 0.1→0.2 | 5.6→5.1 / 0.8→1.1 | 5.1→5.1 / 0.9→0.9 | 4.6→4.4 / 1.0→0.8 | 0.9→1.2 / 3.7→3.7 | 0.0→0.0 / 5.7→5.6 |
| 8 · 0.5 | 0.0→0.0 / 0.0→0.0 | 0.6→0.5 / 0.0→0.0 | 3.2→3.1 / 0.0→0.0 | 6.3→6.3 / 0.1→0.3 | 5.5→5.9 / 0.4→0.4 | 5.0→5.0 / 0.5→0.4 | 0.9→1.1 / 3.8→3.5 | 0.0→0.0 / 5.8→6.0 |
| 12 · 0.95 | 0.3→0.3 / 0.0→0.0 | 1.0→1.0 / 0.0→0.1 | 3.7→3.6 / 0.6→0.2 | 4.9→4.5 / 1.1→1.3 | 5.1→4.6 / 1.6→1.4 | 4.1→4.1 / 2.2→1.6 | 0.6→1.2 / 5.4→4.4 | 0.0→0.0 / 6.8→6.9 |
| 12 · 0.75 | 0.1→0.2 / 0.0→0.0 | 0.4→0.4 / 0.0→0.0 | 2.8→3.5 / **0.5→0.0** | 7.0→6.3 / 0.6→0.4 | 6.6→5.5 / 0.8→0.8 | 5.1→4.9 / **1.9→0.9** | 0.4→0.9 / 5.3→4.6 | 0.0→0.0 / 7.3→7.8 |
| 12 · 0.5 | 0.0→0.0 / 0.0→0.0 | 0.0→0.0 / 0.0→0.0 | 0.8→0.5 / **0.3→0.0** | 5.9→5.2 / 0.2→0.1 | 3.9→3.8 / **0.8→0.3** | 2.9→3.3 / 1.1→0.7 | 0.3→0.4 / 4.1→3.2 | 0.0→0.0 / **6.6→8.4** |
| 20 · 0.95 | 0.1→0.1 / 0.1→0.0 | 0.6→0.9 / 0.1→0.0 | 2.6→2.9 / 0.8→0.4 | 5.1→4.6 / 1.7→1.5 | 3.4→3.6 / **3.3→2.3** | 3.4→3.2 / **3.8→2.6** | 0.6→0.7 / 6.3→4.9 | 0.0→0.0 / 7.5→7.5 |
| 20 · 0.75 | 0.0→0.0 / 0.1→0.0 | 0.0→0.1 / 0.1→0.0 | 0.6→1.6 / **1.4→0.2** | 6.3→6.3 / 1.7→1.1 | 5.0→5.4 / 2.4→1.8 | 4.9→4.8 / **3.4→2.3** | 0.9→1.0 / 6.0→5.5 | 0.1→0.0 / 7.9→8.3 |
| 20 · 0.5 | 0.0→0.0 / 0.0→0.0 | 0.0→0.0 / 0.1→0.0 | 0.3→0.0 / **1.3→0.3** | 2.7→2.0 / **2.6→1.1** | 2.1→1.3 / **3.1→1.8** | 2.3→1.8 / **3.6→2.2** | 0.4→0.6 / 4.9→4.3 | 0.1→0.0 / 7.4→8.4 |

#### fromtop — 위에서 k장째를 초록 숨(0.9)으로 (JS→Rust)

| n | 0.5장째 | 1장째 | 2장째 | 3장째 | 4장째 | 5장째 | 6장째 | 8장째 |
|---|---|---|---|---|---|---|---|---|
| 3 | 2.1→2.1 | 2.5→2.4 | 2.7→2.7 | 2.3→2.4 |  |  |  |  |
| 5 | 2.8→2.7 | 3.2→3.1 | 3.9→3.8 | 4.1→4.1 | 3.9→3.8 | 3.2→3.1 |  |  |
| 8 | 4.8→4.3 | 4.9→4.4 | 5.6→5.1 | 6.1→6.3 | 6.1→6.4 | 4.8→5.4 | 3.1→3.4 | 0.3→0.4 |
| 12 | 5.1→4.5 | 5.3→4.9 | 6.8→6.1 | 6.9→6.3 | 5.7→5.7 | 4.6→3.8 | 2.7→2.6 | 0.4→0.3 |
| 16 | 5.6→5.4 | 6.4→5.6 | 8.5→7.0 | 7.5→6.5 | 8.1→5.9 | 7.3→5.4 | 5.6→4.3 | 2.9→0.8 |
| 20 | 4.6→4.7 | 5.2→5.1 | 5.9→5.6 | 6.5→6.2 | 5.4→4.6 | 4.6→3.8 | 4.4→3.0 | 2.0→0.8 |

#### aimmap — 12장, 숨 0.9: 뒤집힘 / 원 밖 (JS→Rust)

| 높이 | lat −0.6 | lat 0 | lat +0.6 |
|---|---|---|---|
| 0.95 | 4.44→4.06 / 0.88→0.50 | 4.88→4.50 / 1.13→1.31 | 5.19→4.19 / 0.44→0.69 |
| 0.75 | 6.19→5.44 / 0.50→0.25 | 7.00→6.31 / 0.56→0.44 | 6.13→5.50 / 0.44→0.31 |
| 0.5 | 5.06→4.63 / 0.25→0.06 | 5.94→5.19 / 0.19→0.13 | 4.63→3.94 / 0.38→0.25 |

#### stackpower — 물리 세기별 뒤집힌 비율 % (JS→Rust)

| n · lat | 0.45 | 0.55 | 0.65 | 0.75 | 0.85 | 0.95 |
|---|---|---|---|---|---|---|
| 1 · 0 | 0→0 | 19→19 | 44→56 | 69→63 | 19→19 | 25→25 |
| 1 · 0.6 | 0→0 | 6→0 | 25→31 | 63→63 | 63→56 | 25→19 |
| 2 · 0 | 16→19 | 16→28 | 25→34 | 56→50 | 75→84 | 81→88 |
| 2 · 0.6 | 22→22 | 13→16 | 9→25 | 28→28 | 50→56 | 75→69 |
| 3 · 0 | 23→15 | 33→31 | 38→40 | 60→56 | 85→81 | 94→88 |
| 3 · 0.6 | 15→13 | 17→17 | 23→23 | 31→38 | 56→56 | 88→83 |
| 5 · 0 | 25→24 | 38→33 | 55→53 | 65→63 | 68→69 | 80→71 |
| 5 · 0.6 | 19→23 | 23→28 | 40→31 | 60→50 | 64→60 | 73→71 |
| 8 · 0 | 14→16 | 37→22 | 42→44 | 59→56 | 73→70 | 73→75 |
| 8 · 0.6 | 7→9 | 14→20 | 27→27 | 38→35 | 59→56 | 72→65 |

#### mouthmap — 숨 0.9, 두 방향: 낮은 입(0.15) / 수평(지금 입) 뒤집힌 장수 (JS→Rust)

| n · 층 | 낮은 입 0.15 | 수평 |
|---|---|---|
| 14 · top | 4.50→4.19 | 6.16→5.84 |
| 14 · 3 | **7.44→6.34** | 8.88→7.81 |
| 14 · mid | 8.00→6.66 | 5.38→4.09 |
| 14 · low3 | **1.47→0.31** | 0.44→0.22 |
| 20 · top | 3.41→3.22 | 5.28→5.16 |
| 20 · 3 | 5.47→5.59 | 6.41→6.44 |
| 20 · mid | **3.66→1.03** | **1.13→0.13** |
| 20 · low3 | 0.00→0.00 | 0.00→0.00 |

## 성능 (스텝 시간)

같은 컨테이너(x86_64, 다른 작업과 CPU 를 나눠 써서 최대값은 잡음), 단일 스레드, 두 번 잰 것(`parity/data/bench-*.txt`). shot = 초록 숨 3장째 + 480스텝 고정.

| 장수 | Rust native µs/step (1회 / 2회) | JS WASM µs/step (1회 / 2회) | 배수 | Rust 의 120Hz 예산(8,333µs) 몫 |
|---|---|---|---|---|
| 1 | 7.0 / 8.8 | 57.8 / 29.1 | 3~8× | 0.1% |
| 5 | 36.7 / 34.4 | 103.8 / 92.5 | 2.7× | 0.4% |
| 10 | 74.1 / 86.5 | 219.5 / 208.3 | 2.6× | 1% |
| 20 | 176.2 / 170.3 | 755.0 / 739.2 | **4.3×** | 2% |
| 30 | 328.2 / 284.5 | 1,307 / 1,210 | 4.1× | 3.6% |
| 40 | 449.1 / 468.7 | 2,176 / 2,282 | **4.8×** | 5.5% |

- 폰 코어가 이 서버 코어보다 2~3배 느려도 40장이 120Hz 한 프레임의 15% 안. 물리가 120Hz 를 막을 일은 없다(막는 건 iOS 웹뷰의 60Hz rAF 상한 — A 경로의 몫).
- dart:ffi 왕복(스텝 + 자세 버퍼 읽기)도 리눅스 Dart VM 에서 16장 한 프레임 240~340µs, 그중 버퍼 읽기 3~10µs(`dart/ffi_check.dart`).


## 결정성

모두 TUNE 기본값(위 '다시 맞춘 값'), 2026-10-13 이 컨테이너에서.

| 확인 | 방법 | 결과 |
|---|---|---|
| 같은 시드 → 같은 해시 (한 프로세스, 두 번) | `cargo test` same_seed_same_hashes (n 1·12·20·30 × 쌓기→settle→블로우→가져가기·다시 쌓기→책상 입 돌풍) | 같음 |
| C ABI 왕복 | `cargo test` ffi_roundtrip_deterministic, `tests/c/ffi_smoke.c`, `dart/bin/ffi_check.dart` | Rust·C·Dart 모두 `a6be48c3edfb264d` |
| 앱 경기 루프(Dart 숨 해석 → Rust) | `app/test/native_sim_ffi_test.dart` vs `puff_parity shots` (5판 11샷 × 화면 시계 4종) + 리눅스 데스크톱 실제 앱 | 해시·스텝·장수 모두 같음 (docs/app/native-spike.md) |
| 숨 해석 수학 | Dart 순수 fdlibm(`app/lib/native/detmath.dart`) vs `puff_math_v`(libm) 각 10만 개 | 0개 다름 (dart:math 는 log 6%·cos 3% 다름 → 쓰면 안 됨). V8 Math.log·cos 도 fdlibm 과 가끔 1~2ulp 다르다(gauss 2000개 중 34) |
| **아키텍처 3개** | `puff_parity hashsweep 30` (n 1·5·12·20·30 × 시드 30 × 체크포인트 ≈ 1,021 해시) | x86_64 = **aarch64**(aarch64-unknown-linux-musl, qemu-aarch64) = **wasm32**(wasm32-wasip1, node WASI): 모두 `ALL d46f38d59bafe885` |
| 황금 해시 테스트를 arm64 에서 | `cargo test --target aarch64-unknown-linux-musl` (러너 qemu) | 9/9 통과 (golden_cross_platform 포함) |
| **release 두 번 따로 빌드** | 빈 target 디렉터리 둘(`CARGO_TARGET_DIR`)에서 처음부터 → hashsweep + sha256 | 해시 같음, **산출물(.so·.a·바이너리) sha256 까지 같음** (재현 가능한 빌드) |
| debug vs release | 최적화 수준만 다른 빌드의 hashsweep 10 | 같음 |

왜 되는가: rapier `enhanced-determinism`(libm 강제·glam 스칼라 코어·IndexMap), 바람 모델의 초월함수도 전부 `libm` 크레이트(플랫폼 libm 안 씀),
Rust 는 곱셈·덧셈을 FMA 로 합치지 않음, 광선은 BVH 대신 딱지 순서대로 전수 검사, 스레드 안 씀.
PvP 에서 양쪽 엔진이 같은지는 `puff_version()`(TUNE 지문 포함)으로 확인. TUNE·바람 모델·rapier 판을 바꾸면 황금 해시가 바뀌는 게 정상(그때 갱신).


## FFI: plain dart:ffi (flutter_rust_bridge 안 씀)

- 매 프레임(120Hz) **동기** 호출 몇 개(step_judge, frame) + 핸들이 들고 있는 고정 버퍼(자세 f32 · 판 상태 f64 · 샷 결과 f64). 비동기·스트림·복잡한 타입이 없다.
  앱은 구조체 없는 함수만 쓴다(`puff_blow_v`·`puff_info`·`puff_settle_step`…) → Dart 쪽 malloc·package:ffi 가 필요 없다. 모든 lookup 은 `isLeaf: true`.
  `Pointer<Float>.asTypedList` 로 자세 버퍼를 복사 없이 읽는다. flutter_rust_bridge 는 코드 생성기·런타임(메시지 직렬화, 기본 비동기)·버전 고정을 더하는데 여기서 얻는 게 없다.
- 같은 C ABI 를 Swift·Kotlin·(필요하면) WASM 에서도 그대로 쓴다. 헤더는 `include/puff_sim.h` 하나(필요하면 `ffigen` 으로 Dart 바인딩 생성).
- 로딩: 안드로이드 `DynamicLibrary.open('libpuff_sim.so')`, iOS `DynamicLibrary.process()`(정적 링크), 리눅스 테스트 `DynamicLibrary.open('native/puff_sim/target/release/libpuff_sim.so')`.

## iOS (재윤님 맥에서) — 자세한 순서·확인·문제 해결은 `docs/app/native-spike.md`

1. `native/puff_sim/scripts/build-ios.sh [--device-only]` → `dist/ios/device/libpuff_sim.a`(아이폰) · `dist/ios/sim/libpuff_sim.a`(시뮬레이터 fat) + `dist/ios/link.xcconfig`
2. Xcode 화면에서 할 일 없음: `app/ios/Flutter/Debug.xcconfig`·`Release.xcconfig` 가 이미 `#include? ".../dist/ios/link.xcconfig"` 를 갖고 있어
   스크립트를 돌린 뒤에만 링크가 켜진다(`--off` 로 끔). 평소 빌드(웹뷰 게임)는 Rust 도구 없이 그대로.
3. 왜 `-force_load`: dart:ffi 는 실행 파일 안 심볼을 이름으로 찾는다(`DynamicLibrary.process()`) → .a 를 통째로 싣는다. Release 의 `STRIP_STYLE=all` 은 전역 심볼을 지우니 `non-global`.
4. 왜 비트코드 벗기기: rust-std 의 compiler_builtins 오브젝트에 `__LLVM,__bitcode`(Rust 의 LLVM 22)가 붙어 있어 더 낡은 LLVM 도구가 IR 로 읽다 넘어진다(리눅스 llvm-lipo 18 로 재현) →
   Rust 와 같은 LLVM 의 `llvm-objcopy`(rustup component llvm-tools)로 섹션만 지운다.
5. 리눅스에서 교차 컴파일 확인: `aarch64-apple-ios`·`aarch64-apple-ios-sim`·`x86_64-apple-ios` staticlib, `puff_*` 심볼 35/35, minos 13.0(기기)·14.0(시뮬), native-static-libs `-lSystem -lc -lm`.

## 남은 위험

- **체계적 차이 두 가지**(위 결론 ①②): 20장 더미의 '원 밖' 이 1장쯤 적고, 14장 이상 가운데·아래 층이 덜 넘어간다. 레벨 보정표(levels-cal.json)는 JS 물리 기준이라
  네이티브로 가면 **봇 보정을 Rust 로 다시 돌려야** 한다(같은 도구가 이미 Rust 에 있음: `puff_parity`, 봇은 아직 안 옮김 — botlib/levelbot/calibrate 포팅 필요).
- **두 엔진 유지비**: sim.js 의 바람 식을 바꿀 때마다 Rust 에도 같은 수정 + parity 재측정(JS 9분 + Rust 2분 + 비교). 웹을 Rust→WASM 으로 바꾸면 이 비용이 사라진다(엔진 하나).
- **크로스 PvP**: JS(Rapier 0.12)↔Rust(0.36)는 비트가 다르다. 웹·앱이 같은 판을 다시 계산해 맞추는 PvP(turn.js 해시)는 **양쪽이 같은 엔진**일 때만 된다.
- **iOS 실기 미검증**: 이 컨테이너엔 맥이 없다. arm64 결정성은 qemu(aarch64-linux-musl)로 확인 — iOS 의 arm64-apple-ios 는 같은 ISA·같은 Rust 코드지만 실기에서 황금 해시 테스트를 한 번 돌릴 것.
- 안 옮긴 것: 7차 jetPitch·8차 tableScoop(잠든 시제품), isLone(loneLift 0), protrude(0), turn.js 코덱(13B 자세)·BeatClock — 필요하면 다음.
- 0.36 은 2026-08 판이고 crates.io 에 0.36.1 이 있다. `=0.36.0` 으로 고정(엔진이 바뀌면 황금 해시·parity 가 바뀐다).


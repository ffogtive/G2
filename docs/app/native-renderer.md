# B 시제품 G: Flutter 네이티브 3D 장면 (flutter_scene)

## 🧭 핵심 가설

- **가설:** 웹뷰(three.js) 대신 Flutter GPU(Impeller) 위의 `flutter_scene`으로 딱지 장면을 그리면, iOS 웹뷰의 60Hz 상한 없이 ProMotion 120Hz로 돌릴 수 있다. 터치와 햅틱도 웹뷰보다 직접 다룰 수 있다. (부분 확인)
  - **확인됨:** 장면 그리기, 녹화 궤적 재생, 조준 광선, 판정 재계산은 **웹 WebGL2 백엔드**(헤드리스 Chromium)에서 끝까지 돈다. 렌더러는 물리와 독립이다. 웹 물리 궤적을 Dart가 1e-9 이내로 같게 재생하고, 끝 바이트는 `post`와 같다.
  - **미검증:** 아이폰 Metal에서 120Hz가 나오는지, Core Haptics, Swift 컴파일, Android. 이 컨테이너에는 맥과 GPU가 없다.
- **판가름(아이폰 Pro 실기기, profile 빌드, 벤치 켬):** 아래가 모두 맞으면 통과다. 못 미치면 같은 화면의 그림자, 배율, AA 손잡이로 어디서 시간이 드는지 잰다.
  - 화면이 `120Hz`라고 알려 준다.
  - FPS가 115 이상이다.
  - frame p95가 9ms 이하다.
  - jank가 틱의 1% 이하다.

## 무엇을 만들었나

| 파일 | 하는 일 |
|---|---|
| `app/lib/native/demo_scene.dart` | 장면을 만든다. 책상(나뭇결), 테두리, 분필 원, 교실 벽이 있다. 딱지 20장은 그림 앞면(클리어코트·무지개빛은 에픽 이상), 마분지 뒷면, 희귀도 옆띠로 그린다. 빛은 해(그림자), 역광, 하늘빛 환경광, PBR Neutral 톤매핑이다. |
| `app/lib/native/disc_mesh.dart` | 원판 하나를 세 조각(옆·윗면·아랫면)으로 만든다. 재질 3개라 three.js와 같은 구성이다. |
| `app/lib/native/disc_art.dart` | 그림을 `dart:ui` 캔버스로 절차 생성한다(외부 이미지 0). 앞면, 뒷면, 옆띠, 나뭇결, 분필, 칠판이다. |
| `app/lib/native/track.dart` | `turn.js`의 13B 자세 코덱과 `TrackPlayer`를 Dart로 옮겼다. PvP 전송 형식을 그대로 재생한다. |
| `app/lib/native/coords.dart` | 오른손(물리)을 왼손(flutter_scene)으로 바꾼다. 1인칭 카메라와 원기둥 조준 광선도 여기 있다. |
| `app/lib/native/rules.dart` | `rules.js`에서 입력에 필요한 숨 주머니(꽉·버팀·콜록)와 구간만 옮겼다. |
| `app/lib/native/fpv_overlay.dart` | 1인칭 볼과 입술이다. `main.js drawFPV`를 CustomPainter로 옮겼다. |
| `app/lib/native/rich_haptics.dart` + `ios/Runner/AppDelegate.swift` | 햅틱 패턴이다. iOS는 Core Haptics 채널 `puff/haptics`로 내고, 안 되면 `HapticFeedback`을 엮는다. |
| `app/lib/native/frame_stats.dart` | FPS와 프레임 시간 오버레이에 쓸 값을 모은다. 틱 간격, `FrameTiming` build·raster, jank를 센다. |
| `app/lib/native/demo_page.dart`, `demo_main.dart` | 데모 화면과 단독 진입점이다. |
| `app/assets/native/track_fixture.json` | 웹 물리 녹화 5개다(green·side·mid·blast·weak, 같은 20장 더미). `node app/tool/make_track_fixture.mjs`가 만든다. |
| `app/tool/web_check.mjs` | 웹 빌드를 헤드리스 Chromium에서 열고 누르기·당기기·놓기를 찍는다. 여기서 눈으로 확인하는 길이다. |

### 데모 흐름

1. 더미를 누른다. 광선을 원기둥에 쏴서 맞은 층과 좌우를 화면 아래 줄에 보인다. 손끝이 톡 한다.
2. 아래로 당긴다. 숨 주머니가 차면서 양 볼이 부푼다.
   - 꽉에 닿으면 '읍' 햅틱(톡 + 짧은 웅 + 되튐)이 난다.
   - 꽉에서 버티면 심장 박동처럼 톡톡 하고, 볼이 빨개지고, 김이 샌다.
   - 너무 오래 참으면 콜록 하고 취소된다.
3. 놓는다. 놓은 숨의 구간(약함·초록·돌풍)과 누른 높이·좌우로 녹화 하나를 골라 재생한다.
   - 30Hz 녹화를 화면 주사율로 보간한다.
   - 끝나면 자세로 다시 센 판정과 웹 판정을 나란히 보여 준다.
   - **물리가 아니라 녹화다.** Rust 물리(`native/puff_sim`)가 붙으면 같은 `applyPoses`로 꽂는다.
4. 오른쪽 위 버튼으로 바꿔 가며 잰다.
   - `그림자`: 켬·끔
   - `배율`: renderScale 1.0 → 0.75 → 0.5
   - `AA`: auto·none·msaa·fxaa·smaa
   - `벤치`: 녹화 5개를 쉬지 않고 돌린다. 측정할 때 쓴다.

## 아이폰에서 확인하기 (재윤님 맥)

Flutter GPU는 `ios/Runner/Info.plist`의 `FLTEnableFlutterGPU = true`로 켜 두었다. Android는 `AndroidManifest.xml`의 `io.flutter.embedding.android.EnableFlutterGPU` meta-data다. 그래서 따로 플래그가 필요 없다. Impeller는 3.47에서 기본이다.

```bash
cd G2 && git pull && cd app && flutter pub get
flutter devices
# 1) 데모만(웹뷰 없이) — FPS 잴 때는 이걸로. profile = 실제 속도 + FrameTiming
flutter run --profile -t lib/native/demo_main.dart -d <아이폰>
# 2) 같은 것을 dart-define 으로
flutter run --profile --dart-define=NATIVE_DEMO=true -d <아이폰>
# 3) 평소 앱(웹뷰 게임)에서: 왼쪽 위 노치 옆을 1.5초 길게 누르면 데모가 열림(웹 게임은 내려 두고, 닫으면 다시 염)
flutter run --release -d <아이폰>
```

- 첫 빌드는 `flutter_scene`의 빌드 훅이 셰이더를 컴파일해서 몇 분 걸린다(여기 웹 빌드는 첫 회 약 3분).
- **저전력 모드를 끈다.** 켜져 있으면 iOS가 60Hz로 묶는다.
- 측정은 이렇게 한다.
  1. `벤치`를 켜고 10초쯤 기다린다.
  2. 왼쪽 위 오버레이를 읽는다. 아래 판정 표를 본다.
  3. `그림자`, `배율`, `AA`를 하나씩 바꿀 때마다 수치가 새로 쌓인다. 바꿀 때 통계가 초기화된다.
- 오버레이 줄
  - `FPS a / bHz`: 화면 주사율 b에 대한 실제 a
  - `frame p50/p95/max`: vsync 사이 간격(ms)
  - `build`, `raster`: 엔진 UI·래스터 스레드 시간
  - `jank n/m`: 목표의 1.5배를 넘긴 틱 수
  - `부팅`: 셰이더 묶음, 그림 굽기, 텍스처 올리기, 첫 프레임까지 걸린 시간
  - `햅틱 Core Haptics (n/m)`: 네이티브 패턴이 난 횟수 / 대체 횟수

| 판정 | 기준 (아이폰 13 Pro 이상, 그림자 켬, 배율 1.0) |
|---|---|
| 통과 | `120Hz` 표시, FPS ≥ 115, frame p95 ≤ 9ms, jank ≤ 1% |
| 조건부 | 배율 0.75나 그림자 끔에서만 통과. 화질 손잡이를 기본값으로 정해야 한다 |
| 실패 | 배율 0.5·그림자 끔에서도 p95가 10ms를 넘는다. flutter_scene 경로를 버린다 |

- **터치 반응 비교(선택):** 다른 폰의 240fps 슬로모션으로 손가락과 화면을 함께 찍는다. 손이 닿은 프레임부터 볼이 움직인 프레임까지 센다. 웹뷰 게임(`flutter run --release`)과 이 데모를 같은 방법으로 잰다.
- **햅틱 느낌:** 누름, 꽉, 버팀, 콜록, 놓기(약·중·강)가 서로 구분되는지 손으로 확인한다. 오버레이 햅틱 줄이 `HapticFeedback`이면 Core Haptics 채널이 안 붙은 것이다.

## 여기서 확인한 것 / 못 한 것

| | 결과 |
|---|---|
| `flutter analyze` | 문제 0 |
| `flutter test` (26개) | 통과 |
| 궤적 재생 일치 (`test/native_track_test.dart`) | Dart `poseAt` = JS `TrackPlayer.poseAt`, 5샷 × 9시각 × 20장, 최대 차이 < 1e-9. 재생 끝 13B = `post` 바이트 동일. 조각 수신, 빈칸 거절 |
| 판정 재계산 | 끝 자세의 faceUp > 0.2 && 원 안 = 웹 `res.flipped`, 원 밖 = `res.outs` (5샷 모두) |
| 숨 규칙 일치 (`native_rules_test.dart`) | `sweetHiFor(0..40)`, `pouchPower`, `fullLatch`, `strainStep`, 상수가 `rules.js`와 같다 |
| 좌표·카메라·광선·메시 (`native_coords_test.dart`) | 왼손 변환은 거울 1회, 일반 회전도 확인했다. 1인칭 카메라 자리, 앞면 h=0.5 조준, 오른쪽은 lat>0, 윗면은 맨 위 층, 빗나가면 null이다. 감김 3조각은 flutter_scene 규칙과 같고, 윗면 UV는 거울 아님 |
| 웹 WebGL2 실제 그리기 (`app/tool/web_check.mjs`) | 장면이 뜬다. 위에서 1장째(윗면)를 누르고 초록 ×0.9로 놓으면 'green' 재생 후 "뒤집힘 9장 · 원 밖 0장 (웹 판정 9·0)", 'mid'는 2·4로 일치했다. 볼 오버레이와 오버레이 글도 확인했다. SwiftShader(CPU)라 FPS는 의미 없다(13~39) |
| iOS Metal, 120Hz, 실제 프레임 시간 | **못 함**(맥·GPU 없음) → 위 명령으로 |
| `AppDelegate.swift` Core Haptics | **컴파일 못 해 봄.** Flutter 3.47.5 헤더(`applicationRegistrar.messenger()`)와 CoreHaptics API로 맞췄다. 빌드가 깨지면 이 파일의 `PuffRichHaptics`와 채널 4줄만 지우면 된다(Dart 쪽이 HapticFeedback으로 대신한다) |
| Android Flutter GPU | **못 함.** Vulkan이 없는 구형 기기에서 되는지 모른다 |

## flutter_scene 성숙도 판단

- **좋은 점(써 보고 확인함)**
  - 필요한 것이 다 있었다. PBR(클리어코트·무지개빛), 하늘에서 굽는 환경광, 그림자 낸 해, PBR Neutral 톤매핑, MSAA·FXAA·SMAA, renderScale, `screenPointToRay`가 있다.
  - 장면 전체가 약 400줄이었다. 엔진 버그는 한 번도 만나지 않았다.
  - **웹 백엔드가 있어서** 맥 없이도 그려지는 것을 눈으로 확인할 수 있었다. 이건 큰 장점이다.
  - 패키지에 에이전트용 함정 목록(`skills/`)이 들어 있어서, 좌표나 변환을 잘못 쓸 함정을 미리 피했다.
- **위험**
  - **1.0 전이다.** 0.22 → 0.23 → 0.24가 7주 안에 나왔고, 마이너 판마다 깨지는 변경이 있다. 2주 규칙 때문에 0.23.0으로 고정했다.
  - **사실상 1인 관리자**(전 Flutter 엔진 팀원)라서 버스 팩터가 1이다.
  - Flutter GPU를 플래그로 켜야 하고, 실험 단계 API에 기대고 있다.
  - **왼손 좌표**다. 물리와 경계에서 바꿔야 한다(`coords.dart`가 하고, 시험으로 지킨다).
  - 앱 크기가 늘어난다. 웹 빌드 기준 셰이더 묶음과 기본 환경맵이 약 11MB였다. iOS Metal 묶음 크기는 미검증이다.
  - 첫 빌드 때 셰이더를 컴파일하는 시간이 든다.
  - 텍스처는 `dart:ui` 그림 → 읽어 오기 → CPU 밉맵 길이다. 웹(SwiftShader)에서는 그림 굽기에 79초가 걸렸다(GPU 읽기 정지). 실기기 값은 부팅 줄로 잰다.
- **판단:** 이 게임의 장면(책상 하나, 얇은 원판 ≤ 40장, 단순 재질)에는 **충분히 쓸 만하다(조건부)**.
  - 단, 아이폰 120Hz 측정을 통과해야 채택한다.
  - 렌더러는 지금처럼 `PuffScene.applyPoses(자세)` 한 겹 뒤에 둔다. 그래야 flutter_scene이 멈추거나 깨질 때 다른 렌더러로 바꿀 수 있다(Flutter GPU 직접, 네이티브 Metal 뷰 등).
  - 물리(Rust)와 판정은 렌더러와 섞지 않는다.

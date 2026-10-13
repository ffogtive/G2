# 앱 출시 계획 (iOS·Android)

> 작성 2026-10-13. 기준은 HEAD `c6b6e0b`와 작업 트리다. 작업 트리에는 PvP 작업 중이라 아직 커밋하지 않은 `main.js`·`turn.js`·`i18n.js`·`index.html` 변경이 있다.
> 근거는 네 보고서(래퍼·정책·백엔드·감사)와 비평이다. 이번에 저장소를 다시 확인한 결과도 더했다.
> 줄 번호는 오늘 작업 트리 기준이고, 심볼 이름을 함께 적었다.

## 🧭 핵심 가설

- **가설 수정 (확인됨, 저장소)**: 네 보고서와 비평은 모두 Capacitor를 전제로 했다.
  - 그런데 재윤님 지시('플로터로 만들어')에 따라 HEAD `c6b6e0b`에서 껍데기가 이미 **Flutter**로 바뀌었다.
  - 웹뷰는 그대로다. iOS는 같은 WKWebView, Android는 같은 시스템 WebView다. 그래서 결정론·웹 코드 문제·스토어 규정에 대한 결론은 그대로 쓴다.
  - → **Flutter + 웹뷰로 간다.** 달라지는 것은 플러그인 이름, 앱 크기, 플랫폼 뷰 합성 비용이다.
- **가설 (확인됨, 코드)**: 지금 Flutter 빌드는 첫 실행에서 검은 화면이 될 가능성이 높다.
  - `app/pubspec.yaml`에 `assets/www/` 선언이 없다.
  - 그래서 `rootBundle.load('assets/www/index.html')`(`main.dart:42`)가 `runApp` 전에 실패한다.
  - 테스트 빌드의 `AssetManifest.bin`에도 CupertinoIcons만 들어 있다.
  - → M0의 첫 번째 할 일이다.
  - **고침 (확인됨, 이 문서 직후 커밋):** `assets/www/`를 선언했고, `app/test/asset_test.dart`가 실제로 번들에서 읽어 지킨다. 같은 커밋에서 iOS 최소 버전을 16.4로 올리고 iPhone 전용으로 바꿨다. iOS 웹 프로세스가 죽으면 다시 로드하고, 앱이 돌아오면 로컬 서버가 살아 있는지 확인해 다시 연다. Android 평문 통신은 127.0.0.1만 허용하고 `appCategory=game`을 넣었다.
- **가설 (확인됨, 원문)**: 규정 쪽에서 출시를 실제로 막는 일은 셋이다.
  - ① 따먹기 (a)를 스토어 바이너리에서 뺀다.
  - ② 연령 게이트, 계정 삭제, 개인정보 문서를 갖춘다.
  - ③ 법인·판매자 정보를 정한다(EU 공개, Play 12명 × 14일).
- **가설 (미검증)**: 남은 큰 미지수는 실기기 측정 두 가지다.
  - 저가 Android에서 Flutter 플랫폼 뷰 안의 WebGL 프레임과 터치 지연.
  - iPhone(ARM64)에서의 E10 결정론.
  - → M0 게이트에서 판가름한다. 실패하면 같은 웹 빌드를 Capacitor 껍데기(`037b71d`)로 되돌리는 출구가 있다.

---

## 1. 추천 경로 한 줄 요약 + 이유

> **Flutter 껍데기(지금 HEAD)에 오프라인 웹 빌드를 그대로 싣는다. 앱이 할 일은 Dart 쪽 다리로 모은다. 서버는 Firebase(서울) + Cloud Run 시뮬로 한다.**

**이유**

1. **다시 쓰는 것이 없다.**
   - 웹 코드, 1만 판 보정, 튜닝·봇 도구를 그대로 쓴다.
   - Unity나 Godot로 다시 만들면 60~120인일에 재보정이 더 붙는다(추정, 래퍼 보고서).
2. **서버가 같은 코드를 돌린다.**
   - PvP 판정은 서버가 같은 `sim.js`로 다시 돌린다.
   - JSC(iOS 엔진 계열)와 V8의 같은 샷 380개가 비트 단위로 모두 같았다.
   - Math 함수 결과를 ±4 ULP 흔들어도 300/300이 같았다(확인됨, x86 기준).
3. **이미 있다.**
   - 재윤님이 고른 Flutter 껍데기가 HEAD에 있다.
   - Firebase는 공식 Flutter 플러그인이 있다.
   - 메뉴·상점 화면을 나중에 Flutter 네이티브로 옮길 길도 열려 있다.
4. **싸다.** 1만 DAU까지 월 $0~25다(추정, §5).
5. **출구가 있다.** 플랫폼 뷰가 실기기 게이트를 통과하지 못하면, 같은 `dist/puff.html`을 Capacitor 껍데기로 옮긴다. 1~2일 걸린다(추정). 한 번 만들어 둔 것이 `037b71d`에 있다.

**Capacitor와 비교한 비용 (정직하게)**

- Capacitor는 저장·뒤로·프로세스 복구·스플래시를 플러그인으로 바로 준다.
- Flutter는 이것들을 웹뷰 다리로 직접 써야 한다. 이 비용은 M0에 넣었다.
- 앱 크기도 Flutter 엔진만큼 커진다.

---

## 2. 앱 껍데기·런타임

### 2.1 추천안 (버전 고정)

| 항목 | 값 | 상태 |
|---|---|---|
| 껍데기 | Flutter 3.47.5, 앱 ID `com.ffogtive.puff` | HEAD (확인됨) |
| 웹뷰 | `webview_flutter` 4.14.1, `_wkwebview` 3.26.2, `_android` 4.14.1 | HEAD (확인됨) |
| 소리 세션 | `audio_session` 0.2.4, iOS `playback + mixWithOthers` | HEAD. GDD §8.4('무음 스위치 → playback')와 같다 |
| iOS 최소 | **16.4** (지금 15.0) | 바꿀 것. `roundRect`·`.at(-1)`·`navigator.audioSession` 때문 |
| 지원 기기 | **v1은 iPhone만** (지금 iPhone+iPad) | 바꿀 것. 지금 설정이면 iPad에서 가로 화면이 뜬다 |
| Android | minSdk **26** (Flutter 기본 24), compile/target **36** | target 36은 Flutter 3.47 기본값이다(확인됨, `FlutterExtension.kt:23·34`). Play의 [2026-08-31 요구](https://developer.android.com/google/play/requirements/target-sdk)를 맞춘다 |
| 게임 싣기 | 앱 안 로컬 서버 `127.0.0.1:47821` → 웹뷰 | HEAD. 유지하고 수명주기 처리를 보강한다. 대안은 `loadHtmlString` + https baseUrl로 서버를 없애는 것(미검증) |
| 물리 | Rapier compat **0.12.0** 바이트 그대로 | simV 해시를 고정하기 위해서다 |
| 게임 번들 | 오프라인 `dist/puff.html`만 넣는다. 아티팩트(CDN) 빌드는 넣지 않는다 | Apple 2.5.2 '자체 완결' 때문이다 |
| OTA | v1에는 없다. 물리·규칙 변경은 스토어 바이너리로 낸다 | 2.5.2와 PvP simV 때문이다 |

**더할 Dart 패키지**

- 버전은 넣을 때 2주 이상 지난 것으로 고정한다(pubspec 주석 원칙).
- M0: `shared_preferences`(저장), `permission_handler`(Android 마이크), `sentry_flutter` 또는 `firebase_crashlytics`(크래시), `share_plus`(공유).
- M1: `firebase_core`·`firebase_auth`·`cloud_firestore`·`cloud_functions`·`firebase_messaging`·`firebase_app_check`·`firebase_analytics`, `sign_in_with_apple`, `google_sign_in`, Game Center 연결.
- 판매를 시작할 때: `in_app_purchase` 또는 RevenueCat `purchases_flutter`.
- 뒤로(`PopScope`), 수명주기(`WidgetsBindingObserver`), 스플래시(네이티브 LaunchScreen + 웹 'ready' 신호까지 덮개)는 Flutter 기본 기능으로 한다.

### 2.2 숫자

| 항목 | 값 | 상태 |
|---|---|---|
| 게임 파일 | `dist/puff.html` 2,750,299 B. 앱 에셋 2,751,412 B | 확인됨 (오늘) |
| └ 구성 | Rapier(base64 WASM 포함) 75%, three 480KB, 게임 코드 167KB. gzip 약 916~926KB | 확인됨 (감사·래퍼 측정) |
| 부팅(홈 화면까지) | 데스크톱 Chromium 1.31초. WASM 초기화 35~114ms | 확인됨 (데스크톱·서버). 폰은 미검증 |
| JS 힙 | 홈 7.5MB → 매치 8.6MB | 확인됨. GPU·WASM 메모리는 미측정 |
| 물리 스텝 | 20장 1.11ms, 40장 2.51ms. 40장 settle 291ms | 확인됨 (Xeon 서버). 저가폰은 미검증 |
| 결정론 | JSC 대 V8 380/380 같음, ±4 ULP 교란 300/300 같음 | 확인됨 (x86). ARM64 iPhone은 미검증 |
| 서버 턴 판정 | 20장 평균 279ms(p90 388ms), 40장 약 1.0~1.3초 | 확인됨 (컨테이너). Cloud Run에서 다시 잰다 |
| iOS 웹뷰 프레임 | rAF 60Hz 상한, 저전력 모드 30fps | 보고만 있음 ([Apple 포럼 773222](https://developer.apple.com/forums/thread/773222), [WebKit 215745](https://bugs.webkit.org/show_bug.cgi?id=215745)) |
| 앱 다운로드 크기 | iOS 약 8~15MB, Android 약 6~10MB (Flutter 엔진 포함) | 미검증. [Flutter 문서](https://docs.flutter.dev/perf/app-size)의 예시는 1.17 기준 다운로드 5.4MB / 설치 13.7MB로 오래된 값이다. App Store Connect와 Play Console에서 잰다 |
| 고정비 | Apple $99/년, Google $25 1회 | 공식 페이지 미확인 |

### 2.3 위험

| # | 위험 | 상태 | 대응 |
|---|---|---|---|
| 1 | 게임 파일이 앱에 들어가지 않는다 → 첫 실행이 검은 화면 | **확인됨** (pubspec, AssetManifest) | `assets/www/`를 선언한다. 테스트에 에셋 로드 검사를 넣는다 |
| 2 | Android 플랫폼 뷰 합성 비용. 기본값은 TLHC로, WebView를 텍스처에 그린다. HC는 플랫폼 스레드에서 합성하는 비용이 있다 | 미검증 ([Flutter platform views](https://docs.flutter.dev/platform-integration/android/platform-views), [TLHC 설계 문서](https://flutter.googlesource.com/mirrors/flutter/+show/1e85c8f7cc632686bbb704245d9eec4ce895171f/docs/platforms/android/Texture-Layer-Hybrid-Composition.md), [HC 문서](https://flutter.googlesource.com/mirrors/flutter.git/+show/HEAD/docs/platforms/Hybrid-Composition.md)) | M0에서 같은 기기로 TLHC, `displayWithHybridComposition: true`, Chrome을 비교한다. 지면 Capacitor로 간다 |
| 3 | iOS 플랫폼 뷰의 터치 전달 지연. '꽉'·엄지 멈춤 타이밍에 닿는 문제다 | 미검증 | M0에서 pointerdown부터 화면 반응까지 지연을 Safari와 비교한다 |
| 4 | 저장 출처가 흔들린다 | **확인됨** (`main.dart:47`, Capacitor [storage 문서](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/guides/storage.md)) | 프로필을 Dart `shared_preferences`로 옮긴다(§3) |
| 5 | 웹 프로세스가 죽었을 때 처리가 없다 | **확인됨** (플러그인 소스, `main.dart`) | §3을 본다 |
| 6 | iOS가 백그라운드 앱의 듣기 소켓을 회수할 수 있다 → 다시 로드할 때 서버가 없다 | 미검증 ([TN2277](https://developer.apple.com/library/archive/technotes/tn2277/_index.html)) | resume 때 서버가 살아 있는지 보고 다시 바인드한다 |
| 7 | 오디오 세션 주인이 둘이다. 앱은 `playback`이고, 웹 getUserMedia는 `playAndRecord`로 바꾼다. 효과음이 수화부로 가거나 작아질 수 있다 | 미검증 ([WebKit 230902](https://bugs.webkit.org/show_bug.cgi?id=230902)) | 마이크 모드에서 실기기 음량을 잰다. 실패하면 네이티브 마이크 측정으로 바꾼다 |
| 8 | Lockdown Mode에서는 WASM이 막혀 부팅하지 못한다 | 보고 ([WebKit 273824](https://bugs.webkit.org/show_bug.cgi?id=273824)) | 감지해서 안내 문구만 띄운다 |
| 9 | ARM64 iPhone에서 결정론이 어긋날 수 있다 | 미검증 | E10 자가검사 화면. 실패하면 서버 결과를 기다리는 모드로 가고 fdlibm 포팅을 보험으로 쓴다 |

위험 4와 5의 세부:

- **4 저장**
  - 웹뷰 localStorage는 공간이 모자라면 OS가 회수할 수 있다.
  - 포트 47821이 막히면 서버가 임의 포트로 열린다. 그러면 출처가 바뀌어 그 실행에서는 진행이 안 보인다.
  - 프로필을 Dart로 옮기면 출처와 무관해진다.
- **5 웹 프로세스 죽음**
  - iOS: `onWebResourceError(webContentProcessTerminated)`로만 알려 온다(`webkit_webview_controller.dart:1156`). 지금은 듣지 않아서 빈 화면이 남는다.
  - Android: 플러그인이 `onRenderProcessGone`을 구현하지 않았다. 처리하지 않으면 앱 프로세스가 종료된다([Android 문서](https://developer.android.com/reference/android/webkit/WebViewClient#onRenderProcessGone(android.webkit.WebView,%20android.webkit.RenderProcessGoneDetail))).
  - 대응: iOS는 위 오류를 받으면 다시 로드하고, 턴 체크포인트에서 이어 한다. Android는 네이티브 처리를 더해야 한다(방법은 미검증).

---

## 3. 지금 코드에서 고칠 것

우선순위: **P0** = M0 내부 테스트 전, **P1** = M2 외부 테스트 전, **P2** = M3 소프트 런치 전.

| 파일:줄 | 문제 | 고침 | 우선 |
|---|---|---|---|
| `app/pubspec.yaml:66` (`flutter:` 절) | `assets/www/` 선언이 없어 게임이 번들에 들어가지 않는다 | `assets: [assets/www/]`를 더하고 에셋 로드 테스트를 넣는다 | **P0** |
| `app/ios/Runner.xcodeproj/project.pbxproj:363·490·542` | 배포 타깃이 iOS 15.0이다. 가드 없는 `roundRect`(`art.js:343·437`, `creatures.js:92`)와 `turn.js:405 .at(-1)` 때문에 iOS 15에서 크래시가 난다 | 16.4로 올린다. `roundRect` 폴리필 3줄을 보험으로 둔다 | **P0** |
| `mockup/src/main.js:1959` `down` / `:2003` `move` / `:2035` `up` | 두 번째 손가락이 닿으면 조준이 다시 시작되고, 아무 손가락이나 떼면 발사된다 | `if (aiming) return;`, `aiming.pid = ev.pointerId`를 넣는다. move·up·cancel에서 pid가 다르면 무시한다 | **P0** |
| `mockup/src/store.js:31-44`, `main.js:63` `Store.load()` (동기) | localStorage만 쓴다. OS 회수와 포트 출처 변경에 약하다 | Dart `shared_preferences`로 옮긴다. JS↔Dart 다리로 비동기 load/save, 몰아 쓰기, pause 때 flush. `bootInner` 안에서 await한다. 첫 실행 때 한 번 이주한다 | **P0** |
| `app/lib/main.dart:139-143` (`build`) | `PopScope`가 없어 Android 뒤로 버튼이 매치 중에도 앱을 종료한다 | `PopScope(canPop:false)` → JS `onBack` 스택: 모달 닫기 → 판 중이면 나가기 확인 → 홈 → 최소화 | **P0** |
| `app/lib/main.dart:125-130` `didChangeAppLifecycleState` | blur만 보낸다. 소리, 심장박동(`main.js:1314` `setInterval`), 마이크, 렌더가 계속 돈다 | JS에 pause/resume을 알린다. 웹은 `AudioContext.suspend`, `tension(false)`, `mic.pause`, `wait()` 게이트, 렌더 정지를 한다 | **P0** |
| `app/lib/main.dart:103-112` (컨트롤러 생성) | 웹 프로세스 죽음을 처리하지 않는다(§2.3 #5) | NavigationDelegate `onWebResourceError` → reload + 체크포인트. Android는 렌더 프로세스 처리를 더한다 | **P0** |
| `mockup/index.html:2-4` Google Fonts `<link>` | 오프라인이면 대체 글꼴이 캔버스 텍스처에 굳는다. EU 사용자 IP가 Google로 간다([뮌헨 판결](https://www.activemind.legal/guides/ruling-google-fonts/)) | woff2 3개를 직접 담는다. KS X 1001 서브셋이면 약 524KB다 | **P0** |
| `app/android/app/build.gradle.kts:35` | release 빌드를 debug 키로 서명한다 | 업로드 키를 쓰고 Play 앱 서명에 등록한다 | **P0** |
| `app/android/app/src/main/AndroidManifest.xml` | `RECORD_AUDIO`·`MODIFY_AUDIO_SETTINGS`가 없다. 전역 `usesCleartextTraffic="true"`이다. `appCategory`가 없다 | 마이크 권한과 런타임 요청을 더한다. `network_security_config`로 127.0.0.1만 평문을 허용한다. `android:appCategory="game"`(Android 16 태블릿 방향 예외, [문서](https://developer.android.com/about/versions/16/behavior-changes-16)) | **P0** (마이크를 넣으면) |
| `mockup/src/main.js:113` `let mode = 'keeps'` | AI 라이벌 테이블 기본값이 따먹기다 → 시뮬레이션 도박 | 스토어 빌드에서 (a) 경로를 컴파일 단계로 뺀다(`define: __TAKEHOME__=false`). 기본값은 `'fun'` | **P0** (스토어 빌드) |
| `mockup/src/i18n.js:5·6·32·36·43·49·76·78·80·83·87` | 금지어가 남아 있다: POT, FOR KEEPS, never bet, to bet, 판돈, 걸 딱지, 상대 판돈, 순이익 | GDD §11.7 대체어로 바꾼다. 스토어 문구에도 적용한다 | **P0** (스토어 빌드) |
| `tools/app-www.mjs:7` | 입력이 아티팩트(CDN) 빌드여도 막지 않는다 | `importmap`이나 `cdn.jsdelivr`가 있으면 실패하게 한다 | P1 |
| `mockup/src/main.js:3725` (`boot`, `document.fonts.load`) | 글자 없이 불러서 한글 조각이 오지 않을 수 있다. 타임아웃도 없다 | `load('40px "Jua"','딱지ABC')`를 타임아웃과 race한다 | P1 |
| `mockup/src/store.js:36-39` | 파싱에 실패하거나 `v≠1`이면 새 프로필로 덮어쓴다 | 백업 키를 두고 버전별로 이주한다 | P1 |
| `mockup/src/audio.js:14` `unlock()` | `'suspended'`만 resume한다. 통화 뒤 `'interrupted'`는 처리하지 않는다 | `state !== 'running'`이면 resume. 앱 resume 때도 부른다 | P1 |
| `mockup/src/mic.js:20` | AudioContext를 하나 더 만든다 | 효과음용 `sfx.ctx`를 함께 쓴다 | P1 |
| `app/lib/main.dart:106` `onPermissionRequest: grant()` | 모든 요청을 연령 확인 없이 허락한다 | 마이크 요청만, 연령 게이트 뒤에서 허락한다 | P1 |
| `mockup/src/main.js:2244` `maybeOfferMic` | 매치 중에 연령 확인 없이 마이크를 권한다(GDD §13.8 위반) | 연령 게이트 뒤로 옮긴다. 13세 미만(한국은 14세 미만)은 기본 끔 | P1 |
| `app/lib/main.dart:41-62` `GameServer` | 포트가 막히면 임의 포트로 열린다. 백그라운드 뒤에는 소켓이 회수될 수 있다 | 저장을 Dart로 옮기면 해가 없다. resume 때 다시 바인드한다 | P1 |
| `app/lib/main.dart:141` (SafeArea 없음) | Flutter 플랫폼 뷰 안의 Android WebView에 `env(safe-area-inset-*)`가 넘어오는지 모른다 | Dart `MediaQuery.padding`을 CSS 변수로 넣는다. CSS는 `max(env(), var())`로 쓴다 | P1 |
| `mockup/app/bridge.js:5-10` | ① 간격 제한이 없다. 연쇄 때 `main.js:1470 vibrate(12)`가 뒤집힐 때마다 울린다. ② Android도 가로챈다. 그래서 시스템 '터치 진동'이 꺼져 있으면 무음일 수 있다(미검증) | 40ms 간격 제한. Android는 웹 `navigator.vibrate`를 그대로 두거나 진동 플러그인을 쓴다 | P1 |
| `mockup/src/i18n.js:93` `navigator.language` | WKWebView에서는 앱의 현지화 선언을 따른다 | Dart 로케일을 URL `?lang=`으로 넘긴다. Info.plist `CFBundleLocalizations`에 en·ko를 넣는다 | P1 |
| `app/ios/Runner/Info.plist` | 마이크 문구가 한 줄에 두 언어다. `PrivacyInfo.xcprivacy`가 없다. iPad 4방향이다 | `ko/en.lproj InfoPlist.strings`를 만든다. 개인정보 매니페스트를 더한다(UserDefaults `CA92.1` 등). iPhone 전용으로 한다 | P1 |
| `app/ios/.../AppIcon.appiconset`, Android `mipmap-*` | 아이콘과 시작 화면이 Flutter 기본값이다 | 아트 패스에서 바꾼다 | P1 |
| `mockup/src/main.js:3641` `#tuneBtn`, `:3742 window.__puff`, `index.html #micBtn` | 개발용 기능이 노출된다(Apple 2.2 '베타 금지') | `define: __DEV__=false`로 뺀다 | P1 |
| `mockup/src/main.js:1349` `while (… n < 8)` | 8스텝 상한에 걸리면 남은 `acc`가 버려지지 않아 계속 따라잡는다 | 루프 뒤에 `if (n === 8) acc = 0` | P1 |
| `mockup/src/main.js:1668·2304·2406·2576` `table.settle()` | 동기 실행이다. 40장은 서버에서 291ms였고, 저가폰은 약 1초로 추정한다 | 연출 뒤에서 프레임마다 나눠 돌린다 | P2 |
| `mockup/src/main.js:619` `drawReceipt y0 = max(92, H*0.11)` | 위쪽 안전 영역을 무시한다. iPhone 15에서 약 19px 겹친다(계산값) | HUD 사각형의 bottom을 캐시해서 쓴다 | P2 |
| `mockup/src/main.js:1524` `sheetReady`, 오늘의 더미 `Date.now()` | 기기 시계를 쓴다. 시계를 바꾸면 반복할 수 있다 | 서버 시간을 쓴다(M1) | P2 |
| `mockup/src/main.js:2324` `endMatch` | 판돈 차감이 여기서만 일어난다. 중간에 나가면 잃지 않는다 | (a)를 빼면 대부분 사라진다. 남는 것은 원장·에스크로로 처리한다(M1) | P2 |
| (없음) `webglcontextlost` | 컨텍스트를 잃으면 복구하지 못한다 | 리스너를 달고 복구한다 | P2 |

**저장소 상태 메모**

- 추적되지 않는 `ios/`(2.7MB)는 Capacitor sync가 남긴 산출물이다. 지워도 되는지 확인이 필요하다.
- `net.js`·`pvp.js`는 PvP 작업 중이라 아직 추적되지 않는다.

---

## 4. 스토어·규제 체크리스트

### 4.1 이미 충족

- **공개 PvP (b) 뒤집어 모으기**: 거는 것(wager)이 없다. 그래서 Apple 정의상 시뮬레이션 도박이 아니고, '콘테스트'다([Apple 등급 정의](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)).
- **유료 랜덤이 없다.**
  - Apple 루트박스 정의에는 'for purchase'(구매)가 들어 있다. 그래서 무료 딱지판은 루트박스가 아니다(원문 확인).
  - 한국 확률 공개 의무(게임산업법 §33②)는 무상 아이템을 제외한다([디지털데일리](https://m.ddaily.co.kr/page/view/2024032209305179664)).
- **구슬은 비매품이다.** 그래서 3.1.1 재화 만료 규정, 일본 자금결제법, 한국 '간접 유상'이 해당하지 않는다.
- **소통은 프리셋 이모트뿐이다.** 1.2 UGC 요건과 PEGI '무제한 소통'에 대부분 해당하지 않는다.
- **랭크 아이템은 0개다.** 실력 콘테스트라는 성격과 P2W 논란 방어에 도움이 된다.
- **target/compile SDK 36**: Flutter 3.47 기본값이다. Play 2026-08-31 요구를 맞춘다(확인됨).
- **세로 고정**: Info.plist와 Manifest 모두 되어 있다. `ITSAppUsesNonExemptEncryption=false`도 들어 있다.
- **오프라인 단일 번들**: 앱 에셋은 `dist/puff.html`에서 만든다. CDN을 쓰지 않는다(2.5.2).
- **마이크 처리**: 기기 안에서만 한다(`mic.js`에 전송 코드가 없다). 그래서 Apple 기준 '수집'이 아니다([App privacy](https://developer.apple.com/app-store/app-privacy-details/)).
- **Mac이 있다**: 재윤님 맥에 Xcode와 개발자 계정이 있다(`docs/app/ios-local.md`). 빌드·서명과 Safari 웹 검사기를 쓸 수 있다.

### 4.2 바꿀 것

- **따먹기 (a)를 스토어 바이너리에서 컴파일 단계로 뺀다.** 친구방과 AI 테이블 모두다.
  - 근거: 2.3.1(a)는 숨긴 기능과 꺼 둔 기능을 금지한다([Guidelines](https://developer.apple.com/app-store/review/guidelines/), 2026-06-08 개정).
  - 등급은 앱 단위다. 호주는 드물게만 있어도 R18+, 한국은 빈번하면 RCN이 필요하다.
  - 텍사스 SB2420에서는 등급이 오르면 '중대 변경'이 되어 보호자 재동의가 필요하다([Apple 공지](https://developer.apple.com/news/?id=2ezb6jhj)).
- **연령 구간을 <13 / 13 / 14~15 / 16~17 / 18+로 나눈다.**
  - 이유: 한국 개인정보보호법의 기준선은 만 14세다. 그래서 GDD §13.8의 구간(<13 / 13~15 / 16+)으로는 가를 수 없다.
  - Declared Age Range API와 [Play Age Signals](https://developer.android.com/google/play/age-signals/overview)를 연동한다.
  - 모르면 아동 기본값으로 둔다.
  - COPPA 개정 규칙의 준수 의무가 2026-04-22부터다([Davis Polk](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect)).
- **계정 삭제**: 앱 안 경로와 웹 링크를 둘 다 둔다. 근거는 Apple 5.1.1(v)와 [Play 정책](https://support.google.com/googleplay/android-developer/answer/13327111)이다.
- **로그인**
  - 게스트 계정에 Game Center를 조용히 연결한다.
  - 'Sign in with Apple'과 Google 연결을 두 플랫폼 모두에서 준다(Apple 4.8).
  - Play Games Services는 주 계정·진행·인벤토리로 쓰지 않는다([PGS 문서, 2026-10-06](https://developer.android.com/games/pgs/signin)).
- **개인정보**
  - 처리방침을 한·영 두 벌로 쓴다.
  - Apple 개인정보 라벨, Google Data safety, `PrivacyInfo.xcprivacy`를 준비한다.
  - 국외 이전 항목을 처리방침에 공개한다(개인정보보호법 §28의8, [신·김](https://shinkim.com/kor/media/newsletter/2452)).
- **폰트를 앱에 담는다.** 오프라인 문제와 GDPR 문제가 함께 풀린다.
- **iPad**: v1은 iPhone 전용으로 낸다. `UIRequiresFullScreen`이 폐기 예정이라 iPad 가로를 막을 수 없게 된다([TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)).
- **광고**: v1은 광고 없이 낸다. 넣으면 Families 인증 SDK만 쓰고 도박 광고를 차단해야 한다. 또 보상형 광고로 **랜덤** 딱지판을 앞당기는 것이 '간접 유상'인지는 아무도 분석하지 않았다.
- **출석·시즌**
  - 출석은 빠져도 초기화하지 않는다.
  - 6주 한정 유료 상품과 절판 상품은 PEGI 12 하한이 될 수 있다(2차 출처, [Lewis Silkin](https://www.lewissilkin.com/insights/2026/03/18/pegi-announces-major-update-to-age-rating-criteria-what-games-businesses-need-to-102mn9y)).
- **판매자 정보**
  - EU에서 유료 판매를 하면 주소·전화·이메일이 제품 페이지에 공개된다([DSA, TechCrunch](https://techcrunch.com/2025/02/18/apple-purges-apps-without-contact-info-from-eu-app-store-as-dsa-deadline-hits)).
  - Apple 조직 계정은 D-U-N-S와 실제로 열리는 회사 웹사이트가 필요하다([Enroll](https://developer.apple.com/programs/enroll/)).
- **Play 개인 계정**은 테스터 12명이 14일 연속 참여한 비공개 테스트를 거쳐야 프로덕션이 열린다([Google 도움말](https://support.google.com/googleplay/android-developer/answer/14151465), 검색 요약으로 확인).
- **스토어 등록 정보**
  - 아이콘, iPhone 6.9" 스크린샷, Play 512 아이콘과 1024×500 그래픽을 한·영 두 벌로 만든다.
  - 지원 URL, 개인정보처리방침 URL, 약관이 필요하다.
  - 도전장 링크를 쓰려면 유니버설 링크·앱 링크 도메인이 필요하다.
- **고지**: 오픈소스 고지(three MIT, Rapier Apache-2.0, 폰트 OFL)를 넣는다. ElevenLabs 효과음을 쓰면 상업 라이선스를 확인한다.
- **출시 국가**: 중국 본토는 뺀다(판호 필요).

### 4.3 확인 필요

- **Apple '빈번한 콘테스트'로 13+가 되는지.** 랭크, 리그, 오늘의 더미 리더보드를 상시 운영하면 그럴 수 있다. → IARC와 Apple 설문을 미리 돌려 본다(E16).
- **텍사스 SB2420 본안.** 대법원은 2026-07-06에 집행정지를 풀어 달라는 신청만 기각했다. 제5순회 본안 판결은 미확인이다([WLF](https://www.wlf.org/case/computer-communications-industry-assn-v-paxton/)).
- **Play 조직 계정이 12명 규정에서 면제되는지.** Google 원문에는 명시가 없다.
- **한국 사업자 의무**: 사업자등록, 통신판매업 신고, 게임제작·배급업 등록, §12조의3 과몰입 예방 조치의 현행 범위, GCRB 이관. → 세무·법무로 확인한다.
- **브라질 ECA Digital**에서 무료 랜덤이 '루트박스'인지.
- **앱 이름 'PUFF!'와 상표**: KIPRIS·USPTO·EUIPO를 검색한다. 'puff'가 전자담배·대마를 연상시키는 점도 본다.
- **Apple 4.2(다시 포장한 웹사이트)**: 오프라인 게임이고 네이티브 햅틱이 있으며 브라우저 UI가 없어 위험은 낮다고 본다(미검증).
- **Apple 접근성 라벨**: 앞으로 필수가 된다고 예고됐다([Apple](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels)). 색에만 의존하지 않는 숨 판정 표시를 출시 전에 구현한다.
- **등록비 금액**: Apple·Google 공식 페이지로 확인한다.

---

## 5. 백엔드

### 5.1 추천 스택

**Firebase(서울 asia-northeast3) + Cloud Run '시뮬' 서비스**

- **Firestore**: 프로필(클라우드 저장), 매치, 턴 결과, 리더보드.
- **Cloud Run(Functions 2nd gen)**: callable `submitShot`이 `sim.js`·`rules.js`·`turn.js`와 Rapier 0.12.0 바이트를 고정한 번들을 돌린다. 1GiB, 최소 인스턴스 1.
- **FCM**: 푸시. **App Check**: App Attest·Play Integrity.

**클라이언트 배치**

- Firebase는 **Dart 쪽**(공식 Flutter 플러그인)이 맡는다. 네이티브 App Check·Game Center·FCM이 웹뷰 안 JS SDK로는 안 되기 때문이다(미검증).
- 게임 JS는 `net.js`에 `FlutterNet` 어댑터를 하나 더해 다리로 부른다.
- `net.js` 인터페이스(`db.doc/collection/onSnapshot`)는 이미 Firestore 모양이다(확인됨, 코드). 그래서 게임 코드는 바뀌지 않는다.

**Nakama가 아닌 이유**

- `@heroiclabs/nakama-js`는 2.8.0(2024-06-21) 이후 새 릴리스가 없다([npm](https://registry.npmjs.org/@heroiclabs/nakama-js)).
- Nakama 런타임(goja)은 WASM을 못 돌린다. 그래서 시뮬은 어차피 별도 서비스가 되고, 운영할 서버가 둘이 된다.
- Heroic Cloud는 시작부터 월 약 $600이다(검색 요약, 미검증). 자가 호스팅은 0.3~0.5 FTE의 운영 인력이 든다.

**출구 조건**

- 다음 중 하나가 생기면 Nakama 3.41(Heroic Cloud 서울)을 다시 평가한다.
  - 서버를 맡을 사람이 0.5 FTE 이상 생긴다.
  - P2 실시간 랭크·토너먼트가 필요해진다(약 1만 DAU).
  - Auth와 Firestore 비용 합이 월 $1k를 넘는다.
- 옮길 때는 Nakama 3.41의 '공급자 무관 인증'으로 Firebase uid를 그대로 이어 간다(설계상 가능, 미검증, [CHANGELOG](https://raw.githubusercontent.com/heroiclabs/nakama/master/CHANGELOG.md)).
- 실시간 방만 필요하면 Colyseus를 붙이는 쪽이 더 가볍다.

### 5.2 비용 (월, 추정)

| 스택 | 1k DAU | 10k DAU | 100k DAU |
|---|---|---|---|
| **Firebase + Cloud Run 시뮬** | **$0~10** | **$15~25** | **$185 + Auth**. Auth는 $0 ~ 약 $2.1k |
| Nakama 자가 호스팅(GCP 서울) | $150~170 | $150~200 | $900~1,000 |
| Nakama on Heroic Cloud | 약 $600 | $600~1,000 | $1.0~1.9k |
| Supabase Pro + Cloud Run | $25~35 | $55~100 | $1.5~1.6k |

- **가정**: DAU 1인당 서버 시뮬 2.2회(1회 0.4 vCPU-s), Firestore 읽기 15회·쓰기 12회. DAU/MAU는 0.2다.
- **단가**: 서울 공식 단가를 썼다([Firestore](https://cloud.google.com/firestore/pricing), [Cloud Run](https://cloud.google.com/run/pricing), [Identity Platform](https://cloud.google.com/identity-platform/pricing)).
- **가장 큰 변수는 Firebase Auth의 MAU 과금 여부다.** 콘솔에서만 확인할 수 있다. 확인 전까지는 미검증이다.

### 5.3 PvP 서버 판정

**흐름**

1. 클라이언트가 ShotPacket을 보낸다. 약 20B에 박동 trace ≤300B다.
2. 서버가 범위를 검사한다.
3. 서버가 `puffSeed = H(matchSeed‖turn‖seat‖serverSecret)`로 시드를 정한다. 커밋을 받은 뒤에 공개한다.
4. 서버가 `runShot`을 돌린다.
5. TurnResult(약 10~12KB)를 `matches/{id}/turns/{g}{tt}`에 쓴다. 클라이언트는 결과를 쓸 권한이 없다.
6. 상대에게 FCM으로 "네 차례"를 보낸다.

**제약과 원칙**

- **판 크기는 20장 이하다.**
  - 서버 판정이 20장 평균 279ms(p90 388ms), 40장은 약 1초였다.
  - 그래서 40장 판은 서버 결과를 기다리는 모드에서 쓸 수 없다.
- **simV 고정**: 매치 문서에 simV를 적는다. simV별로 Cloud Run 리비전 태그를 둔다. 그 버전의 매치가 0이 될 때까지 옛 리비전을 지우지 않는다.
- **쏜 사람 로컬 예측**: E10에서 iOS 3대와 Android 3대가 모두 300/300일 때만 켠다. 그 전에는 서버 결과를 기다리고, 바람 비행·슬로모 연출로 지연을 가린다.
- **테스트**: `tools/pvp-check.mjs`를 Firebase Emulator Suite에 붙인다.

### 5.4 계정·푸시·결제 검증

**계정**

1. 첫 실행에 Firebase 익명 계정을 만든다.
2. iOS는 Game Center를 조용히 연결한다.
3. 설정의 '기록 지키기'에서 Apple과 Google 연결을 제공한다.
4. 앱 안과 웹에서 같은 `deleteAccount` 함수를 부른다. Apple 연결이 있으면 토큰 취소도 한다(미검증).

- 클라우드 저장은 `rev`와 필드별 병합으로 한다. 레벨·별은 max, 딱지는 합집합으로 합친다. 트로피·랭크는 서버만 쓴다.

**푸시**

- FCM을 쓰고 APNs 키를 등록한다.
- Android 13 이상은 `POST_NOTIFICATIONS` 권한을 요청한다.
- 턴 알림(정보성)과 이벤트 알림(광고성)을 나눈다. 한국은 광고성 푸시에 사전 동의, 21시~8시 전송에 별도 동의가 필요하다(미검증 세부).

**결제**

- v1은 팔지 않는다.
- 판매를 시작하면 RevenueCat이나 `in_app_purchase`를 쓴다. 영수증은 Cloud Function에서 App Store Server API와 Play Developer API로 검증한다.
- 불변식 '유료 상품 → 구슬·딱지 증가 = 0'을 테스트로 고정한다.

**분석**

- Firebase Analytics를 쓰고 광고 ID 수집은 끈다. 13세 미만(한국은 14세 미만)은 최소 이벤트만 받는다.
- 분석은 '나중' 일이 아니다. 레벨 재보정(BLOCKERS B10, GDD §16.9)의 입력이다.

---

## 6. 단계별 계획

기간은 1인 기준 추정이다(미검증). 비평 지적대로 래퍼 보고서의 '10~15인일'에는 출시 실무가 빠져 있었다. 이번 일정은 그 몫을 넣어 다시 잡았다.

| 단계 | 내용 | 기간 | 게이트 |
|---|---|---|---|
| **M0 앱 껍데기 (내부 테스트)** | §3의 P0 전부. 크래시 리포트(웹 `onerror`를 다리로 전달). E10 자가검사 화면(서버가 만든 300샷 해시와 비교). 재윤님 맥에서 `flutter build ipa` → TestFlight 내부. Linux에서 AAB → Play 내부 테스트. **법인·D-U-N-S 신청을 병행한다**(발급에 몇 주 걸릴 수 있음, 미검증) | **2~3주** | 아래 M0 게이트 |
| **M1 백엔드·계정** | Firebase 프로젝트(서울, Auth 과금 먼저 확인). 게스트 + Game Center, Apple·Google 연결. 계정 삭제(앱+웹). 클라우드 저장. `FlutterNet`. `submitShot`(Cloud Run). 오늘의 더미 리더보드. FCM. App Check. 연령 게이트. 개인정보 문서 일체. 분석. 금지어 교체. 스토어 빌드 플래그로 (a) 제거 | **5~6주** | 아래 M1 게이트 |
| **M2 PvP 정식** | 비동기 친구 대국. 공개 (b)·친구방 (c). 도전장 링크(유니버설 링크·앱 링크와 웹 대체 페이지). 쏜 사람 로컬 예측(E10 통과 시). §3의 P1 전부. TestFlight 외부 테스트(베타 심사 포함). Play 비공개 테스트(개인 계정이면 12명 × 14일) | **3~4주** | 아래 M2 게이트 |
| **M3 소프트 런치** | 1~2개국(7번 질문 3). 스토어 등록 정보 한·영. 법인·판매자·세금 서류. §3의 P2 전부. **실시간 랭크는 빼고 연다**(약 1만 DAU 필요, '빈번한 콘테스트' 13+ 위험) | 준비 **2~3주** + 운영 **6~8주** | 아래 M3 게이트 |

- 소프트 런치 시작까지 약 **12~16주**다.
- GDD §18의 '소프트런치에 실시간 랭크 포함'과 다르다. 그 차이는 위 M3 칸의 근거 때문이다.

**M0 게이트**

- 비행기 모드에서 첫 실행이 홈 화면까지 가고, 중급 Android에서 2.5초 이하.
- 프레임 시간 p95가 iPhone 11급과 중급 Android에서 16.7ms 이하(20장 블로우 중).
- 저가 Android(Galaxy A1x급)에서 30fps를 유지하고, 같은 기기 Chrome과 차이가 10% 이하. GDD §16.7이 요구한 '래핑 대 네이티브 판정'이 이것이다. **실패하면** HC 모드로 다시 재고, 그래도 실패하면 Capacitor로 간다.
- 터치 반응 지연이 같은 기기 Safari·Chrome보다 1프레임 넘게 늦지 않다.
- 기능 확인 다섯 가지가 통과한다.
  - 통화 뒤에 소리가 돌아온다.
  - 홈 버튼을 누른 뒤에는 소리가 나지 않는다.
  - 두 손가락 조준에서 오발사가 없다.
  - Android 뒤로 버튼이 스택대로 동작한다.
  - 저장이 남는다: 앱을 다시 켜도, 포트 충돌을 모의해도 진행이 그대로다.
- 웹 프로세스를 강제로 종료해도 빈 화면 없이 복구된다.
- E10이 iOS 3대와 Android 3대 모두 300/300이다. 실패해도 출시는 막지 않고, 서버 결과를 기다리는 모드로 간다.
- 웹 프로세스 메모리가 400MB 이하다.

**M1 게이트**

- Emulator에서 `pvp-check` 3판의 턴별 해시가 100% 같다.
- 계정 삭제가 처음부터 끝까지 동작한다.
- 클라우드 저장 충돌 테스트를 통과한다.
- IARC·Apple 등급 설문 드라이런 결과를 재윤님이 받아들인다.

**M2 게이트**

- Cloud Run 서울에서 20장 서버 판정 p95가 450ms 이하다. 넘으면 연출로 가려지는지 사람이 확인한다.
- 서버와 클라이언트의 해시 불일치가 1% 이하다(E10 원격측정).
- 범위 밖 패킷을 100% 거절한다.
- 외부 테스터 50명 이상으로 2주 동안 크래시 없는 세션이 99.5% 이상이다.
- 비동기 대국 완주율이 50% 이상이고, 턴 응답 중앙값이 2시간 이하다(items-pvp P1b 게이트).

**M3 게이트** (GDD §18, 벤치마크 미검증)

- 첫 판 완주 80% 이상.
- 2판째 60% 이상.
- D1 30~35% 이상.
- D7 10% 이상.
- 7일 k 0.3 이상.

---

## 7. 재윤님이 정할 것 (4개)

1. **계정 주체**: Apple과 Google에 법인(ffogtive, D-U-N-S)으로 가입할까요, 개인으로 할까요? 지금 Apple 계정은 유료 프로그램($99)인가요?
   - 개인이면 본명이 판매자로 표시됩니다.
   - EU에서 팔면 주소와 전화번호가 공개됩니다.
   - Play는 12명 × 14일 테스트를 거쳐야 합니다.
   - 무료 계정이면 TestFlight를 쓸 수 없습니다.
2. **백엔드**: Firebase + Cloud Run(추천)으로 확정할까요? 서버를 상시 맡을 사람(0.5 FTE)이 있으면 Nakama도 다시 열립니다.
3. **결정 #33 보완**: 따먹기 (a)를 스토어 빌드에서 아예 빼고 내부 테스트 빌드에만 둘까요(추천)?
   - 지금 결정인 '친구방 + 지역 플래그 OFF'는 2.3.1(a)와 앱 단위 등급 때문에 그대로는 통과하지 못합니다.
   - 다른 길은 나중에 18+ 별도 앱으로 내는 것과, 같은 앱에서 등급을 올리는 것입니다. 등급을 올리면 호주 R18+, 한국 19+와 RCN, 텍사스 재동의가 따라옵니다.
4. **1차 출시 지역과 순서**: 한국 먼저 소프트 런치할까요, 글로벌 동시에 낼까요? EU를 넣을까요? Firestore 리전(서울)은 정하면 바꿀 수 없습니다.

**정하지 않으면 이 기본값으로 진행한다.** 바꾸려면 말씀해 주세요.

- 기기와 화면: v1은 iPhone 전용, 세로 고정.
- 최소 OS: iOS 16.4 이상, Android 8(API 26) 이상.
- 광고: 없음.
- 마이크 불기: 넣되, 기본 끔이고 연령 게이트 뒤에 둔다.
- 무음 스위치: HEAD·GDD §8.4대로 `playback`을 유지한다(무음이어도 '푸' 소리가 난다).
- 분석: Firebase Analytics.
- iOS 빌드: 재윤님 맥에서 수동으로 하고, 나중에 Codemagic이나 GitHub Actions macOS로 옮긴다.

---

## 부록 A. 비평 반영과 정정 기록

| 쟁점 | 반영 |
|---|---|
| 껍데기 | 비평은 HEAD `037b71d`(Capacitor)를 봤다. 지금 HEAD는 `c6b6e0b`(Flutter)다. 비평의 'Capacitor 8.5.2 → 8.5.3'과 'native.js'는 해당이 없어졌다. 다리는 `mockup/app/bridge.js`다 |
| Mac | Mac이 있다. 클라우드 macOS CI는 필수가 아니라 선택이다 |
| 결정론 | 래퍼 실측(380/380, ±4 ULP 300/300)을 우선한다. GDD §16.3의 '초월함수 교체'는 보험으로 내리고, 미리 재보정하지 않는다 |
| 백엔드 | 하나로 정한다: Firebase + Cloud Run. PGS는 주 계정으로 쓰지 않는다(백엔드 보고서가 맞다) |
| 연령 | <13 / 13 / 14~15 / 16~17 / 18+ (정책 보고서가 맞다) |
| 등급 | '(b)+(c) = 4+'는 낙관적이다. 콘테스트가 빈번하면 13+가 된다. 드라이런이 필수다 |
| 출시 실무 | 법인, EU DSA, 등록 정보, 분석, 접근성, 테스트 기기, Android 서명을 체크리스트와 M0~M3에 넣었다 |
| 서버 판정 비용 | PvP는 20장 이하로 한다. 40장은 서버 결과를 기다리는 모드에서 쓰지 않는다 |
| 줄 번호 | 오늘 작업 트리로 다시 쟀다: `mode='keeps'` 113행, `maybeOfferMic` 2244행, vibrate 862·1470·1878·1887·2158·3121행 |
| **비평 정정** | 비평은 'GDD §6.6이 ambient(무음 존중)와 맞는다'고 했다. 그런데 GDD §8.4 표는 `playback`을 명시한다. §6.6은 '무음이어도 화면만으로 쾌감'이라는 시각 요구라서 `playback`과 충돌하지 않는다. 그래서 HEAD 설정을 기본값으로 둔다 |
| **새로 찾음** | `pubspec.yaml`의 에셋 선언 누락(P0). 웹 프로세스 종료 미처리(iOS는 플러그인 이벤트만, Android는 미구현). 포트가 바뀌면 저장 출처가 바뀌는 문제. Android 마이크 권한 누락. release가 debug 키로 서명되는 문제. Android 햅틱이 시스템 설정에 의존할 가능성 |

## 부록 B. 주요 출처

- **Apple**
  - [App Review Guidelines (2026-06-08)](https://developer.apple.com/app-store/review/guidelines/)
  - [등급 정의](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/)
  - [Enroll](https://developer.apple.com/programs/enroll/)
  - [App privacy](https://developer.apple.com/app-store/app-privacy-details/)
  - [텍사스 공지](https://developer.apple.com/news/?id=2ezb6jhj)
  - [TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)
  - [TN2277](https://developer.apple.com/library/archive/technotes/tn2277/_index.html)
  - [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- **Android·Google**
  - [target SDK](https://developer.android.com/google/play/requirements/target-sdk)
  - [Android 16 동작 변경](https://developer.android.com/about/versions/16/behavior-changes-16)
  - [PGS sign-in](https://developer.android.com/games/pgs/signin)
  - [Age Signals](https://developer.android.com/google/play/age-signals/overview)
  - [12명 테스트](https://support.google.com/googleplay/android-developer/answer/14151465)
  - [계정 삭제](https://support.google.com/googleplay/android-developer/answer/13327111)
  - [WebViewClient.onRenderProcessGone](https://developer.android.com/reference/android/webkit/WebViewClient#onRenderProcessGone(android.webkit.WebView,%20android.webkit.RenderProcessGoneDetail))
- **Flutter**
  - [Android platform views](https://docs.flutter.dev/platform-integration/android/platform-views)
  - [TLHC 설계](https://flutter.googlesource.com/mirrors/flutter/+show/1e85c8f7cc632686bbb704245d9eec4ce895171f/docs/platforms/android/Texture-Layer-Hybrid-Composition.md)
  - [Hybrid Composition](https://flutter.googlesource.com/mirrors/flutter.git/+show/HEAD/docs/platforms/Hybrid-Composition.md)
  - [앱 크기](https://docs.flutter.dev/perf/app-size)
  - 로컬 SDK `/opt/flutter-sdk/flutter/packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt`
  - pub 캐시 `webview_flutter_wkwebview-3.26.2/lib/src/webkit_webview_controller.dart:1156`
- **웹 런타임**
  - [Capacitor storage 가이드](https://github.com/ionic-team/capacitor-docs/blob/main/docs/main/guides/storage.md)
  - [WebAssembly Nondeterminism](https://github.com/WebAssembly/design/blob/main/Nondeterminism.md)
  - [Rapier 결정론](https://rapier.rs/docs/user_guides/rust/determinism/)
  - [WebKit 230902](https://bugs.webkit.org/show_bug.cgi?id=230902)
  - [WebKit 273824](https://bugs.webkit.org/show_bug.cgi?id=273824)
  - [Apple 포럼 773222](https://developer.apple.com/forums/thread/773222)
- **법·규제**
  - [WLF(SB2420)](https://www.wlf.org/case/computer-communications-industry-assn-v-paxton/)
  - [Davis Polk(COPPA)](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect)
  - [TechCrunch(DSA)](https://techcrunch.com/2025/02/18/apple-purges-apps-without-contact-info-from-eu-app-store-as-dsa-deadline-hits)
  - [activemind(Google Fonts)](https://www.activemind.legal/guides/ruling-google-fonts/)
  - [디지털데일리(확률형)](https://m.ddaily.co.kr/page/view/2024032209305179664)
  - [신·김(국외 이전)](https://shinkim.com/kor/media/newsletter/2452)
  - [Lewis Silkin(PEGI)](https://www.lewissilkin.com/insights/2026/03/18/pegi-announces-major-update-to-age-rating-criteria-what-games-businesses-need-to-102mn9y)
- **백엔드**
  - [Firestore 가격](https://cloud.google.com/firestore/pricing)
  - [Cloud Run 가격](https://cloud.google.com/run/pricing)
  - [Identity Platform 가격](https://cloud.google.com/identity-platform/pricing)
  - [nakama-js npm](https://registry.npmjs.org/@heroiclabs/nakama-js)
  - [Nakama CHANGELOG](https://raw.githubusercontent.com/heroiclabs/nakama/master/CHANGELOG.md)
- **조사 한계**
  - docs.flutter.dev, support.google.com, law.go.kr, heroiclabs.com 원문은 이 환경에서 막혔다(DNS 또는 403).
  - 이 출처들은 검색 요약이나 GitHub 원문으로 대신 확인했다.

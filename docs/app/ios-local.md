# 아이폰에 PUFF! 설치하기 (Flutter, 재윤님 맥)

## 🧭 핵심 가설

- **앱 껍데기는 Flutter이고, 게임 본체는 지금 웹 빌드(three.js + Rapier) 한 파일을 앱 안 웹뷰로 연다.**
  - iOS에서는 Flutter 웹뷰도 Capacitor와 같은 WKWebView라서 성능 차이가 없다.
  - 물리·튜닝·PvP 동기는 웹 코드 그대로 간다.
  - 로그인·결제·푸시·햅틱 같은 앱 기능은 Flutter 플러그인이 맡는다.
  - 상태: 앱 코드 정적 분석과 테스트는 통과했고, 웹 에셋 부팅도 확인했다. 맥에서의 iOS 빌드는 아직 확인 못 했다.
- **판가름:** 첫 실행에 홈 화면이 뜨는가. 불 때 '푸' 소리와 햅틱이 나는가. 60fps 근처로 도는가.

## 구조

| 경로 | 무엇 |
|---|---|
| `app/` | Flutter 프로젝트(`puff`, 번들 ID `com.ffogtive.puff`, iOS·Android) |
| `app/lib/main.dart` | 세로 고정, 몰입 화면, 소리 세션, 앱 안 로컬 서버(127.0.0.1:47821), 웹뷰, 수명 주기 |
| `app/lib/haptics.dart` | 웹의 진동 호출 → 햅틱 세기(가벼움·보통·강함·패턴) |
| `mockup/app/bridge.js` | 앱 빌드에만 넣는 다리 코드. `navigator.vibrate` → Flutter 채널 `PuffHaptic` |
| `tools/app-www.mjs` | `dist/puff.html` + 다리 코드 → `app/assets/www/index.html`(git에는 안 올라감) |

## 준비물 (한 번만)

- 맥에 다음이 있어야 한다. Xcode(최신, 한 번 열어서 구성요소 설치), **Flutter**(`flutter --version`, 3.47 이상 권장), Node 20 이상, CocoaPods(`brew install cocoapods`, 플러그인에 필요할 때).
- Xcode → Settings → **Accounts**에 애플 개발자 계정으로 로그인한다.
- 아이폰을 USB로 연결하고 '이 컴퓨터를 신뢰'를 누른다. 설정 → 개인정보 보호 및 보안 → **개발자 모드**를 켠다.

## 설치 (Claude에게 맡기기)

맥에서 G2 폴더를 열고 Claude 데스크톱 앱이나 터미널의 `claude`에 이렇게 말한다.

> docs/app/ios-local.md 대로 내 아이폰에 설치해줘

## 설치 (직접 하기)

```bash
git clone https://github.com/ffogtive/G2.git && cd G2        # 이미 있으면: git pull
git checkout claude/ddakji-game-design-unrfmr
npm install
npm run app:www                  # 게임 빌드 → app/assets/www/index.html
cd app && flutter pub get
open ios/Runner.xcworkspace 2>/dev/null || open ios/Runner.xcodeproj
```

Xcode에서 다음을 한다.

1. **Runner** 타깃 → **Signing & Capabilities** → **Team**에서 개발자 팀을 고른다. 한 번만 하면 된다.
   - Bundle Identifier `com.ffogtive.puff`가 이미 쓰이고 있다면 `.dev`를 붙인다.
2. 터미널에서 실행한다.

```bash
flutter devices                    # 내 아이폰이 보이는지
flutter run --release -d <아이폰 이름이나 ID>
```

- `--release`로 해야 실제 속도가 나온다. 디버그 빌드는 느리고, 홈 화면에서 다시 열 수도 없다.
- 아이폰에 '신뢰할 수 없는 개발자'가 뜨면 설정 → 일반 → VPN 및 기기 관리에서 신뢰를 누른다.

## 업데이트할 때

`git pull` → `npm run app:www` → `cd app && flutter run --release -d <아이폰>`.

## 앱 버전에서 달라지는 것

- **진동:** iOS 웹에는 진동 기능이 없다. 그래서 다리 코드가 게임의 진동 호출을 Flutter로 보내 **탭틱 햅틱**으로 바꾼다.
- **소리:** 무음 스위치가 켜져 있어도 '푸' 소리가 난다. 다른 앱의 음악은 끊지 않는다(`audio_session`의 playback + mixWithOthers). 출시 전에 '무음 스위치 존중'으로 바꿀지 정한다.
- **화면:** 세로로 고정하고, 상태 표시줄을 숨긴다(몰입 화면). 노치는 게임 CSS가 safe-area로 피한다.
- **마이크:** 마이크 모드를 켜면 권한을 묻는다(Info.plist 문구). 앱 안 로컬 서버라서 보안 컨텍스트가 되어 웹 마이크가 동작한다.
- **저장:** 진행·튜닝 값은 웹뷰 localStorage(`127.0.0.1:47821` 출처)에 저장된다. 앱을 지우면 함께 지워진다. 정식 출시 때는 Flutter 쪽 저장소나 클라우드 저장으로 옮긴다.
- **앱이 뒤로 가면** 조준·들숨을 취소한다(게임에 blur를 보낸다).

## 다음 (정식 배포)

- **TestFlight:** `flutter build ipa` + App Store Connect 업로드. 클라우드 맥 CI(Codemagic이나 GitHub Actions macOS)로 자동화한다. `docs/design/app-release.md`(작성 중)를 따른다.
- 앱 아이콘과 시작 화면은 아직 Flutter 기본값이다. 아트 패스에서 바꾼다(`docs/TODO.md`).
- 메뉴·상점·앨범 같은 화면은 나중에 Flutter 네이티브로 옮길 수 있다. 게임 장면은 웹뷰에 그대로 둔다.

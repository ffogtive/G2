# 아이폰에 PUFF! 설치하기 (재윤님 맥)

## 🧭 핵심 가설

- **웹 목업을 Capacitor로 감싼 iOS 프로젝트(`ios/`)는 이미 레포에 있다.** 맥에서는 '받기 → 빌드 → 서명 팀 고르기 → 실행'만 하면 아이폰에 깔린다. (프로젝트 생성은 확인됨. 맥에서 실제 빌드는 미검증)
- **판가름:** 첫 실행에서 홈 화면이 뜨는가. 불 때 '푸' 소리와 햅틱이 나는가. 60fps 근처로 도는가.

## 준비물 (한 번만)

1. 맥에 **Xcode**(App Store, 최신)와 **Node 20 이상**(`node -v`)을 설치한다. Xcode는 한 번 열어서 추가 구성요소 설치까지 끝낸다.
2. Xcode → Settings → **Accounts**에 애플 개발자 계정으로 로그인한다.
3. 아이폰을 준비한다.
   - USB로 맥에 연결하고 '이 컴퓨터를 신뢰'를 누른다.
   - 설정 → 개인정보 보호 및 보안 → **개발자 모드**를 켜고 재시동한다.

## 설치 (Claude에게 맡기기)

맥에서 G2 폴더를 열고 Claude 데스크톱 앱이나 터미널의 `claude`에 이렇게 말한다.

> docs/app/ios-local.md 대로 내 아이폰에 설치해줘

## 설치 (직접 하기)

```bash
git clone https://github.com/ffogtive/G2.git && cd G2        # 이미 있으면: git pull
git checkout claude/ddakji-game-design-unrfmr
npm install
npm run app:ios          # 게임 빌드 → app/www → ios 프로젝트로 복사(cap sync)
npm run app:open         # Xcode 가 열림
```

Xcode에서 다음을 한다.

1. 왼쪽 **App** 프로젝트 → **App** 타깃 → **Signing & Capabilities**로 간다.
   - **Team**에서 개발자 팀을 고른다.
   - Bundle Identifier는 `com.ffogtive.puff`다. 이미 쓰이고 있다면 `com.ffogtive.puff.dev`처럼 바꾼다.
2. 위쪽 실행 대상에서 **내 아이폰**을 고르고 ▶(Run)을 누른다.
   - 첫 빌드는 Swift 패키지를 받느라 몇 분 걸린다.
3. 아이폰에서 '신뢰할 수 없는 개발자'가 뜨면 설정 → 일반 → VPN 및 기기 관리에서 신뢰를 누른다.

### 명령줄로만 하기 (Claude가 쓸 순서)

```bash
xcrun devicectl list devices                         # 내 아이폰 UDID 확인
TEAM=<팀 ID>   # Xcode Accounts 또는 developer.apple.com → Membership 의 Team ID
UDID=<아이폰 UDID>
npm run app:ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$UDID" -derivedDataPath ios/DerivedData \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=$TEAM build
xcrun devicectl device install app --device $UDID ios/DerivedData/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device $UDID com.ffogtive.puff
```

## 업데이트할 때

`git pull` → `npm run app:ios` → Xcode에서 ▶(또는 위 명령줄 순서).

## 앱 버전에서 달라지는 것

- **진동:** iOS 웹에는 진동 기능이 없다. 그래서 앱 빌드에만 넣는 `mockup/app/native.js`가 게임의 진동 호출을 **탭틱 햅틱**으로 바꾼다.
- **소리:** 무음 스위치가 켜져 있어도 '푸' 소리가 난다. 다른 앱의 음악은 끊지 않는다(`AppDelegate.swift`의 AVAudioSession `.playback` + `mixWithOthers`). 출시 전에 '무음 스위치 존중'으로 바꿀지 정한다.
- **화면:** 세로로 고정하고, 상태 표시줄을 숨기고, 화면 튕김(바운스)을 막았다.
- **마이크:** 마이크 모드를 켜면 권한을 묻는다(문구는 Info.plist).
- **오프라인:** 게임 전체가 앱 안에 들어 있다(약 2.7MB 한 파일). 글꼴만 온라인일 때 받아 오고, 오프라인이면 기본 글꼴로 보인다.
- **저장:** 진행·튜닝 값은 앱 안 localStorage에 저장된다. 앱을 지우면 함께 지워진다. 정식 출시 때는 클라우드 저장으로 바꾼다.

## 다음 (정식 배포)

- **TestFlight:** 클라우드 맥 빌드(GitHub Actions macOS 등)와 App Store Connect API 키로 만든다. 가족·지인 테스트에 쓴다. `docs/design/app-release.md`(작성 중)를 따른다.
- 앱 아이콘과 시작 화면은 아직 Capacitor 기본값이다. 아트 패스에서 바꾼다(`docs/TODO.md`).

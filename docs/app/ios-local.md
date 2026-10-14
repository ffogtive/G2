# 아이폰에 PUFF! 설치하기 (Flutter, 재윤님 맥)

## 🧭 핵심 가설

- **앱 껍데기는 Flutter이고, 게임 본체는 지금 웹 빌드(three.js + Rapier) 한 파일을 앱 안 웹뷰로 연다.**
  - iOS에서는 Flutter 웹뷰도 Capacitor와 같은 WKWebView라서 성능 차이가 없다.
  - 물리·튜닝·PvP 동기는 웹 코드 그대로 간다.
  - 로그인·결제·푸시·햅틱 같은 앱 기능은 Flutter 플러그인이 맡는다.
  - 상태: 앱 코드 정적 분석과 테스트는 통과했고, 웹 에셋 부팅도 확인했다. 맥에서의 iOS 빌드는 아직 확인 못 했다.
- **판가름:** 첫 실행에 홈 화면이 뜨는가. 불 때 '푸' 소리와 햅틱이 나는가. 60fps 근처로 도는가.

> **가장 쉬운 설치는 `docs/app/iphone-deploy.md` 맨 위 「맥에서 한 줄」**(`bash tools/mac/ios_run.sh`)이다. Flutter 3.47.5 자동 설치·서명 빌드·설치·실행·추적 파일 검사까지 한다.
> 아래 「직접 하기」는 앱 콘솔 로그를 직접 볼 때만. Xcode 화면에서 Team을 고르거나 맥에서 `npm run app:www`를 하면 추적 파일이 바뀌어 다음 `git pull`이 막힌다(그리고 Team ID 원문이 공개 파일에 들어간다).

## 구조

| 경로 | 무엇 |
|---|---|
| `app/` | Flutter 프로젝트(`puff`, 번들 ID `com.ffogtive.puff`, iOS·Android) |
| `app/lib/main.dart` | 세로 고정, 몰입 화면, 소리 세션, 앱 안 로컬 서버(127.0.0.1:47821), 웹뷰, 수명 주기 |
| `app/lib/haptics.dart` | 웹의 진동 호출 → 햅틱 세기(가벼움·보통·강함·패턴) |
| `mockup/app/bridge.js` | 앱 빌드에만 넣는 다리 코드. `navigator.vibrate` → Flutter 채널 `PuffHaptic` |
| `tools/app-www.mjs` | `dist/puff.html` + 다리 코드 → `app/assets/www/index.html`(git에는 안 올라감) |

## 준비물 (한 번만)

- `tools/mac/SIGNING.md` 1~5단계(Xcode 로그인, 아이폰 페어링·개발자 모드). G3에서 했으면 거의 끝나 있다.
- Flutter·Node·CocoaPods는 따로 깔지 않아도 된다. 한 줄 명령이 Flutter 3.47.5를 `~/.puff/flutter`에 받고, 게임 에셋은 node가 없으면 python3로 만든다. 플러그인은 Swift Package Manager(`app/pubspec.yaml`에서 켬)라 CocoaPods가 필요 없다.

## 설치 (Claude에게 맡기기)

맥에서 G2 폴더를 열고 Claude 데스크톱 앱이나 터미널의 `claude`에 이렇게 말한다.

> docs/app/iphone-deploy.md 「맥에서 한 줄」대로 `bash tools/mac/ios_run.sh` 로 내 아이폰에 설치해줘. Xcode 화면에서 Team을 고르거나 Bundle ID를 바꾸지 말고, 추적 파일을 커밋하지 마.

## 설치 (직접 하기 — 콘솔 로그를 보며 디버깅할 때만)

평소에는 한 줄 명령(`docs/app/iphone-deploy.md`)을 쓴다. 앱 콘솔을 직접 봐야 할 때만 아래처럼 한다. 한 줄 명령을 한 번 돌려 둔 `~/G2`에서 한다.

```bash
cd ~/G2
python3 tools/app-www.py               # 게임 한 파일 → app/assets/www/index.html (node 가 있으면 node tools/app-www.mjs 도 같은 바이트)
F=~/.puff/flutter/3.47.5/bin/flutter   # 한 줄 명령이 받아 둔 Flutter 3.47.5 (다른 버전 flutter 는 lock 이 달라짐)
cd app && $F pub get --enforce-lockfile
$F devices                             # 내 아이폰이 보이는지
$F run --release -d <아이폰 이름이나 ID>
```

- `--release`로 해야 실제 속도가 나온다. 디버그 빌드는 느리고, 홈 화면에서 다시 열 수도 없다.
- 팀은 `flutter run`이 키체인 인증서에서 고른다(여럿이면 한 번 묻고 Flutter 전역 설정에 기억 — 레포 밖).
- **하지 않는 것**(다음 `git pull`이 막히거나 공개 레포에 식별자가 들어간다):
  - Xcode 화면 Signing & Capabilities에서 Team 고르기 → `project.pbxproj`에 Team ID 원문이 들어간다. 이미 했으면 `git checkout -- app/ios/Runner.xcodeproj/project.pbxproj`(커밋 금지).
  - Bundle ID 바꾸기(`.dev` 붙이기 등) → 한 줄 설치가 '다른 Bundle ID'로 멈추고 진행 저장이 따로 논다.
  - `npm install`·`npm run app:www` → 추적 파일 `package-lock.json`·`dist/puff.html`이 바뀐다. `dist/puff.html`은 클라우드 세션이 빌드해 커밋한다.
- 아이폰에 '신뢰할 수 없는 개발자'가 뜨면 설정 → 일반 → VPN 및 기기 관리에서 신뢰를 누른다.

## 업데이트할 때

한 줄 명령(`docs/app/iphone-deploy.md` 맨 위)을 다시 붙인다. 받기·빌드·설치를 다 하고, 진행 저장은 남는다.

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

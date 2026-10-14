# SIGNING — 아이폰 개발 설치를 위한 1회 준비 (맥)

## 🧭 핵심 가설

**가설**: 아래 1~5단계를 한 번 끝내면 그다음부터는 `bash tools/mac/ios_run.sh` 한 줄로 PUFF!가 설치·실행된다. 재윤님은 유료 개발자 계정이 있고 G3에서 아이폰 페어링·신뢰를 이미 해 봤으므로, G2에서 새로 생기는 일은 **Flutter 첫 다운로드**와 **새 Bundle ID(`com.ffogtive.puff`)의 첫 서명**뿐이다. (미검증 — 맥·실기기에서 아직 안 돌려 봄. 메뉴 이름은 G3 SIGNING.md가 확인한 Xcode 27 공식 문서 기준)

> 이 저장소는 **공개(public)** 다. Team ID, 아이폰 UDID, Apple ID, 맥 주소는 **어떤 파일에도 쓰지 않는다.**
> `ios_run.sh`가 키체인과 `devicectl`에서 자동으로 찾는다. 바꿔야 할 때만 환경 변수나 저장소 밖 파일
> `~/.config/puff/iphone-deploy.env`(chmod 600)에 둔다. 화면 출력·`receipt.txt`·`errors-masked.txt`에서는 `AB******YZ`처럼 가린다.
> 다만 `.local/deploy-runs/…/build.log`·`devices.json`·`launch.json` 원문에는 그대로 있다 — 통째로 붙여 넣지 않는다.

| 무엇 | 값 | 어디서 정해지나 |
|---|---|---|
| Bundle ID | `com.ffogtive.puff` | `app/ios/Runner.xcodeproj/project.pbxproj` (고정. 바꾸지 말 것 — 바꾸면 새 앱으로 깔리고 진행 저장이 따로 논다) |
| Xcode 워크스페이스 / 스킴 / 제품 | `app/ios/Runner.xcworkspace` / `Runner` / `Runner.app` | Flutter 프로젝트(추적 파일) |
| 빌드 구성 | Release + 개발 서명(자동) | Flutter Debug는 디버거 없이 아이폰에서 다시 열 수 없다 |
| Team ID | 자동 감지 | 키체인 `Apple Development` 인증서의 **OU 필드** (괄호 안 값이 아님) |
| 아이폰 | 자동 감지 | `xcrun devicectl list devices`에서 페어링된 아이폰 1대 |
| Flutter | 3.47.5 고정, 없으면 자동 설치 | `~/.puff/flutter/3.47.5` (다른 버전 flutter는 PATH에 있어도 안 씀) |
| 덮어쓰기 | `PUFF_TEAM_ID`, `PUFF_DEVICE_ID`, `FLUTTER` | 환경 변수, 또는 `~/.config/puff/iphone-deploy.env`의 `TEAM_ID=` `IPHONE_ID=` `FLUTTER=` 줄(예: `FLUTTER=~/development/flutter` — SDK 폴더, `~`·`$HOME` 은 펼친다) |

## 1단계. Xcode 설치와 첫 실행

G3 때 이미 했으면 건너뛴다. `bash tools/mac/ios_run.sh --check`가 빠진 것을 알려 준다.

1. App Store에서 **Xcode 27.x**를 설치하고 한 번 연다. 추가 구성 요소 창이 뜨면 **iOS**를 골라 설치한다.
   - 나중에 추가하려면: **Xcode > Settings… (⌘,) > Components > iOS > Get**
2. 터미널에서(비밀번호는 맥 로그인 비밀번호, 직접 입력):
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   sudo xcodebuild -runFirstLaunch
   xcodebuild -version        # Xcode 27.x 확인
   ```
3. **Flutter는 미리 깔지 않아도 된다.** 첫 실행이 `~/.puff/flutter/3.47.5`에 받는다.
   - 받는 양: git 약 240 MB + Dart SDK 약 220 MB + iOS 엔진 약 300 MB ≈ **0.8 GB**, 디스크 약 2~3 GB.
   - 시간: 집 인터넷 기준 **5~15분**(한 번만). 그다음 실행부터는 빌드만 3~6분.
   - 받은 뒤 커밋 리비전(`6a19cca…`)이 3.47.5 태그와 다르면 쓰지 않고 멈춘다.
   - 이미 Flutter 3.47.5가 있으면(`~/flutter`, `~/development/flutter`, PATH, fvm) 그것을 쓴다. 다른 버전은 건드리지 않는다.
4. 선택 사항.
   - **node**: 없어도 된다. 없으면 같은 바이트를 내는 python3 경로로 게임 에셋을 만든다.
   - **Rust(rustup)**: 네이티브 데모용 물리만 켠다. 없으면 데모가 녹화 재생으로 돌고, 웹 게임은 똑같다. 켜려면 https://rustup.rs (처음 빌드 약 2분 더).
   - **CocoaPods**: 필요 없다. 플러그인은 Swift Package Manager로 묶는다.

## 2단계. Apple 계정 로그인 (Xcode)

1. **Xcode > Settings… > Apple Accounts > 왼쪽 아래 `+` > Apple Account > Continue** → Apple ID와 2단계 인증을 **직접** 입력한다.
2. 목록에 유료 팀(또는 `<이름> (Personal Team)`)이 보이면 끝이다.
   - 인증서와 프로비저닝 프로파일은 첫 빌드 때 `xcodebuild -allowProvisioningUpdates`가 만든다.
   - `com.ffogtive.puff` App ID도 이때 팀에 자동 등록된다(자동 서명).
3. 팀이 여럿이면 `ios_run.sh`가 이렇게 정한다.
   - 유료 팀이 하나뿐이면 그것(무료 Personal Team은 뺀다).
   - G3에서 골라 둔 팀(`~/.lane1/deploy.env`의 `LANE1_TEAM_ID`)이 목록에 있으면 그것(대화형이면 한 번 확인).
   - 아니면 `1) AB******45  <팀 이름> (유료)`처럼 가린 ID·팀 이름·유료/무료를 보여 주고 번호로 묻는다. 고른 값은 `~/.config/puff/iphone-deploy.env`에 기억한다.
   - 잘못 골랐으면(예: 무료 Personal Team) 그 파일의 `TEAM_ID=` 줄을 지우고 다시 실행한다. `--check`는 묻지도 저장하지도 않는다.

> Team ID 확인이 필요할 때: 키체인 접근(Keychain Access) > 로그인 > 내 인증서 > `Apple Development: …`
> 더블클릭 > **조직 단위(Organizational Unit)** 값이 Team ID다. 인증서 이름 괄호 안의 10자리는 개인 ID라서
> **Team ID가 아니다** ([Apple DTS, Developer Forums](https://developer.apple.com/forums/thread/802517)).

## 3단계. 아이폰 연결과 페어링

G3에서 쓰던 아이폰이면 이미 되어 있다.

1. 아이폰을 **케이블로** 맥에 연결하고 잠금을 푼다. **"이 컴퓨터를 신뢰하겠습니까?" > 신뢰** → 기기 암호.
2. Xcode에서 **Xcode > Open Developer Tool > Device Hub**(또는 실행 대상 메뉴 > Manage Devices…)를 연다. 아이폰을 고르고 **Pair**가 있으면 누른다.
3. 확인: `xcrun devicectl list devices`에 아이폰이 보이면 된다.
   - Xcode 27은 **iOS 17 이상** 기기만 개발 실행을 지원한다. 앱 최소 버전은 iOS 16.4다.

## 4단계. 개발자 모드 (아이폰)

1. 아이폰 **설정 > 개인정보 보호 및 보안 > (보안) 개발자 모드 > 켬** → 경고에서 **재시동**.
2. 재시동 뒤 뜨는 알림에서 **켜기** → 기기 암호.
   - 이 메뉴는 3단계 페어링을 시작한 뒤에만 보인다.
   - `ios_run.sh`는 개발자 모드가 꺼져 있으면 이 안내를 띄우고 멈춘다(종료 5).

## 5단계. 첫 실행과 "신뢰하지 않는 개발자"

맥 화면에 로그인된 **Terminal**에서(SSH 말고) 한 줄 명령을 붙인다 — `docs/app/iphone-deploy.md` 맨 위 「맥에서 한 줄」.

1. 빌드 중 **"codesign이(가) 키체인의 키 'Apple Development: …'에 접근하려고 합니다"** 창이 뜨면 맥 로그인 비밀번호를 입력하고 **항상 허용**. (비밀번호를 명령줄·파일에 넣지 않는다.)
2. 설치는 됐는데 실행이 `… not been explicitly trusted` 로 실패하면(이 개발자 인증서로 처음 깔 때) 아이폰에서:
   **설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > `Apple Development: <Apple ID>` > 신뢰 > 신뢰**
   → 그다음 `bash tools/mac/ios_run.sh --launch-only`
   - G3를 같은 계정으로 깔아 이미 신뢰했다면 이 단계는 안 나올 수 있다(미검증).
3. SSH로 들어와 실행했다가 `errSecInternalComponent`가 나면: 맥 화면의 로그인된 Terminal에서 같은 명령을 다시 실행한다(키체인이 GUI 세션에 묶여 있음).

## 만료와 다시 설치

- **유료 개발자 계정**: 개발 인증서·프로파일이 **1년** 간다. 그 안에는 홈 화면에서 계속 열린다. 1년 뒤나 프로파일이 바뀌면 한 줄 명령을 다시 돌린다(Xcode 자동 서명이 새로 받는다).
- **무료 Personal Team**: 프로비저닝 **7일 만료** → 7일 뒤 앱이 안 열리면 한 줄 명령을 다시 돌린다. 기기당 개발 앱 3개, 7일에 App ID 10개 한도.
- 다시 설치해도 **진행 저장은 남는다**(같은 Bundle ID로 덮어 설치, 앱을 지우지 않음).

## 하지 않는 것

- 기존 앱 삭제(데이터 초기화). `ios_run.sh`는 언제나 같은 Bundle ID로 덮어 설치한다.
- Team ID·UDID·Apple ID를 저장소 파일, 커밋, 이슈, 로그 붙여넣기에 남기기. 보낼 것은 `receipt.txt`와 `errors-masked.txt`(가림)뿐이다.
- Xcode 화면 **Signing & Capabilities에서 Team 고르기**·Bundle ID 바꾸기. 팀을 고르면 공개 추적 파일 `project.pbxproj`에 Team ID 원문이 들어간다(이미 했으면 `git checkout -- app/ios/Runner.xcodeproj/project.pbxproj`, 커밋 금지). 스크립트는 팀을 명령줄로 넘긴다.
- `security unlock-keychain -p <비밀번호>` 같은 강제 해제, 인증서·개인 키 내보내기.
- 맥에서 `npm run build`·`flutter pub get`(잠금 없이)·`flutter config` 바꾸기. 추적 파일이 바뀌면 다음 `git pull --ff-only`가 막힌다. 스크립트는 lock을 고정해(`--enforce-lockfile`) 돌리고, 끝에 추적 파일이 바뀌었는지 검사해 복구 명령을 찍는다.

# G2(PUFF!) 아이폰 개발 설치 — 서버 → 맥 → 아이폰

## 🧭 핵심 가설

- **클라우드 세션은 맥(VPN 사설 주소)에 닿지 못한다.** 직접 재 보니 `100.x:22` 연결이 시간 초과였다. (확인됨)
- **재윤님 개발 서버(`/home/ffogtive`)는 이미 맥으로 SSH가 된다.** 재윤님 가이드 0절의 '기존 SSH 서버' 경로다.
  - → 그 서버의 Claude 세션이 이 문서대로 받기 → 빌드 → 맥으로 보내기 → 서명 빌드 → 아이폰 설치·실행을 한다.
  - 판가름: 맥이 켜져 있고 로그인돼 있는가, Xcode 계정과 Team이 있는가, 아이폰이 `devicectl list devices`에 보이는가. (미검증, 첫 실행에서 확인)
- 원본 절차와 주의는 재윤님 가이드(SJYTodo `docs/claude-code-iphone-deployment.md`)를 따른다. 이 문서는 G2에 맞춘 값과 스크립트만 담는다.

## G2 설정표

기기 ID 같은 값은 레포에 넣지 않는다. 서버의 `~/.config/puff/iphone-deploy.env`에만 둔다.

| 항목 | 값 |
|---|---|
| SSH 별칭 | `apple-build-mac`(가이드 1절 `~/.ssh/config`) |
| 맥 배포 폴더 | `/Users/<USER>/Deploy/G2`. G2 전용이고, SJYTodo와 섞지 않는다 |
| 프로젝트 | Flutter `app/` → 맥에서 `ios/Runner.xcworkspace`, 스킴 `Runner` |
| 제품 | `Runner.app`, Release 구성(실제 속도, 홈 화면에서 다시 열 수 있음), 개발 서명(자동) |
| Bundle ID | `com.ffogtive.puff`. SJYTodo ID를 쓰지 않는다 |
| Team ID / 아이폰 ID | 가이드 9절 값(같은 개발 계정·같은 아이폰) |
| 브랜치 | `claude/ddakji-game-design-unrfmr` |
| 맥에 필요한 것 | Xcode(로그인, Team), **Flutter**, 아이폰 페어링과 개발자 모드 |

`~/.config/puff/iphone-deploy.env` 예시(서버, 권한 600):

```bash
APPLE_BUILD_SSH=apple-build-mac
MAC_DIR=/Users/<USER>/Deploy/G2
TEAM_ID=<가이드 9절 Team ID>
IPHONE_ID=<가이드 9절 iPhone ID>
BUNDLE_ID=com.ffogtive.puff
BRANCH=claude/ddakji-game-design-unrfmr
```

## 실행

```bash
# 서버의 G2 클론에서
bash tools/iphone/deploy-from-server.sh
```

1. 브랜치를 받는다(`--ff-only`).
2. `npm run app:www`로 게임 한 파일을 `app/assets/www`에 만든다. 서버에 Flutter가 있으면 `flutter analyze`와 `flutter test`도 돌린다.
3. `app/`과 맥 스크립트를 tar로 묶어 맥의 G2 전용 폴더로 보낸다.
4. 맥에서 `tools/iphone/mac-build-install.command`가 돈다.
   - `flutter build ios --config-only`를 한다.
   - `xcodebuild`로 기기용 Release를 자동 서명으로 빌드한다.
   - `codesign`과 Bundle ID를 확인한다.
   - `devicectl install`과 `launch`를 한다.
5. SSH 세션에서 서명이 `errSecInternalComponent`로 실패하면 맥 로그인 세션의 Terminal로 다시 실행한다(가이드 6절). 그리고 `exit-code` 파일을 기다린다.
6. 결과는 `docs/app/deploy-receipts/<시각>/`에 남는다(git에는 안 올라감). 빌드·설치·실행 성공을 따로 적는다.

## 밤사이 자동 설치 (재윤님이 자기 전에 한 번)

서버에서 G2 폴더를 열고 Claude 세션(데스크톱 앱이나 `claude`)에 아래를 그대로 붙인다.

> G2 아이폰 밤사이 설치를 맡아 줘. `docs/app/iphone-deploy.md`와 내 가이드(SJYTodo `docs/claude-code-iphone-deployment.md`)를 따라.
> `~/.config/puff/iphone-deploy.env`가 없으면 가이드 9절 값으로 만들어(권한 600).
> 맥 폴더는 `/Users/sjy/Deploy/G2`야.
> 브랜치 `claude/ddakji-game-design-unrfmr`에 커밋 메시지에 `[iphone-deploy]`가 들어간 새 커밋이 올라올 때까지 15분마다 `git fetch`로 확인해.
> 올라오면, 또는 한국 시각 07:30이 되면, `tools/iphone/deploy-from-server.sh`를 실행해.
> 실패하면 로그를 보고 고쳐서 다시 해. 맥 키체인 승인처럼 내가 직접 해야 하는 일이면 멈추고 남겨.
> 빌드·설치·실행 성공을 각각 기록해 줘.

- 클라우드 세션(G2 작업)은 아침 설치할 버전이 준비되면 커밋 메시지에 `[iphone-deploy]`를 붙여 푸시한다.
- 맥은 켜 두고 로그인 상태를 유지한다. 화면 잠금은 괜찮다(키체인은 로그인 세션에서 열려 있다).
- 아이폰은 맥과 같은 망에 두거나 USB로 연결해 둔다.

## 주의 (가이드에서 가져옴)

- SSH 개인키, Apple 비밀번호, 토큰은 출력하지 않고 대화로 요구하지도 않는다. 이미 설정된 키와 키체인을 쓴다.
- 기존 앱을 지우고 설치하지 않는다. 같은 Bundle ID로 덮어 설치하므로 진행 저장(localStorage)이 유지된다.
- `open` 성공은 빌드 성공이 아니다. `exit-code`, build.log, install.json, launch.json을 확인한다.
- 다른 앱과 폴더·DerivedData·잠금을 나눈다. 잠금은 자동으로 지우지 않는다.

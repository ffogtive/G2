# G2(PUFF!) 아이폰 개발 설치 — 맥에서 한 줄 / 서버 → 맥 → 아이폰

## 🧭 핵심 가설

- **(추천) 맥에서 직접: G3와 같은 `tools/mac/ios_run.sh` 한 줄이면 받기 → Flutter 준비 → 서명 빌드 → 설치 → 실행까지 끝난다.** 가짜 맥 시험(`bash tools/mac/selftest.sh`, 시나리오 52개·확인 193개, bash 3.2 포함)은 통과했고, 실제 맥·아이폰에서는 아직 안 돌려 봤다. (미검증)
  - 판가름: 첫 실행 끝의 `빌드 / 설치 / 실행 / 떠 있음` 네 줄이 모두 ok·yes인가. 그다음 화면·소리·햅틱은 재윤님이 확인한다.
- **클라우드 세션은 맥(VPN 사설 주소)에 닿지 못한다.** 직접 재 보니 `100.x:22` 연결이 시간 초과였다. (확인됨)
- **재윤님 개발 서버(`/home/ffogtive`)는 이미 맥으로 SSH가 된다.** 재윤님 가이드 0절의 '기존 SSH 서버' 경로다.
  - → 그 서버의 Claude 세션이 이 문서대로 받기 → 빌드 → 맥으로 보내기 → 서명 빌드 → 아이폰 설치·실행을 한다.
  - 판가름: 맥이 켜져 있고 로그인돼 있는가, Xcode 계정과 Team이 있는가, 아이폰이 `devicectl list devices`에 보이는가. (미검증, 첫 실행에서 확인)
- 원본 절차와 주의는 재윤님 가이드(SJYTodo `docs/claude-code-iphone-deployment.md`)를 따른다. 이 문서는 G2에 맞춘 값과 스크립트만 담는다.

## 맥에서 한 줄 (추천)

맥 화면에 로그인된 **Terminal**(SSH 말고)에 그대로 붙인다. 처음이면 홈 폴더에 `G2`를 받고, 이미 있으면 최신으로 갱신한 뒤 설치까지 한다.

```bash
cd ~ && { [ -d G2/.git ] || git clone https://github.com/ffogtive/G2.git; } && cd G2 && git fetch origin claude/ddakji-game-design-unrfmr && git checkout claude/ddakji-game-design-unrfmr && git pull --ff-only && bash tools/mac/ios_run.sh
```

**한 줄이 git 단계에서 멈추면**(스크립트가 돌기 전, 영어 git 오류: `would be overwritten by merge`, `have diverged`, `Not possible to fast-forward`) — git 이 권하는 `git merge --no-ff`·`git rebase` 는 하지 않는다(맥에 로컬 커밋이 생겨 다음부터 계속 막힌다).

```bash
# 맥에서 고친 것을 지켜야 하면: 치워 두고 한 줄 명령을 다시 붙인다(되살리기: cd ~/G2 && git stash pop)
cd ~/G2 && git stash -u
# 맥의 G2 를 원격과 똑같이 맞춰도 되면(맥에서 고친 것·로컬 커밋은 버려짐, .local/ 같은 무시 파일은 남음):
cd ~/G2 && git fetch origin claude/ddakji-game-design-unrfmr && git reset --hard origin/claude/ddakji-game-design-unrfmr
```

- **처음 한 번 준비**: `tools/mac/SIGNING.md`(Xcode 로그인, 아이폰 페어링·개발자 모드). G3에서 이미 했으면 거의 다 되어 있다.
  - 처음에는 Flutter 3.47.5를 `~/.puff/flutter`에 받는다. 약 0.8 GB, 5~15분이고 한 번만 받는다. 그다음부터는 빌드만 3~6분. 받는 동안 화면이 한동안 멈춰 보여도 도는 중이다(진행 보기 `tail -f` 경로를 찍어 준다).
  - 빠진 게 있는지만 보려면: `bash tools/mac/ios_run.sh --check` (빌드·설치·묻기·저장은 하지 않는다. 점검 기록만 `.local/deploy-runs/`에 남는다).
- **하는 일**: Xcode·아이폰·Team 확인 → 게임 한 파일(`dist/puff.html` + 앱 다리 코드) → (Rust가 있으면) 네이티브 데모 물리 → `flutter pub get --enforce-lockfile` + `flutter build ios --config-only` → `xcodebuild` Release 자동 서명 → `codesign`·Bundle ID 확인 → `devicectl` 설치(기존 앱·진행 저장 유지) → 실행 → 8초 뒤 떠 있는지 확인.
  - **팀이 여럿이면**: 유료 팀이 하나뿐이면 그것(무료 Personal Team은 뺌), G3(`~/.lane1/deploy.env`)에서 고른 팀이 있으면 그것, 아니면 `가린 ID + 팀 이름 + 유료/무료`를 보여 주고 번호로 묻는다. 고른 값은 `~/.config/puff/iphone-deploy.env`의 `TEAM_ID=`에 남는다. 잘못 골랐으면 그 줄을 지우고 다시.
  - **스스로 다시 해 보는 것**: 프로파일에 이 아이폰이 없으면 기기 지정 빌드로 등록하고 다시(빌드 단계든 설치 단계든), Rust를 링크한 빌드가 Xcode에서 실패하면 Rust 링크를 끄고 한 번 더(웹 게임은 Rust와 무관).
- **결과**: 끝에 `빌드 / 설치 / 실행 / 떠 있음`이 따로 찍힌다. 기능(화면·불기 소리·햅틱)은 재윤님 확인이다.
  - 기록: `.local/deploy-runs/<시각>-<pid>/`. 도움을 청할 때는 **`receipt.txt`와 `errors-masked.txt`만** 보낸다(식별자를 가렸다). 화면의 빨간 오류 줄도 가려서 찍는다.
  - 같은 폴더의 `build.log`·`devices.json`·`launch.json` 원문에는 Team ID·UDID·인증서 이름이 그대로 있다. 이 레포는 공개라서 통째로 붙여 넣지 않는다.
- **Xcode 화면에서 Team 을 고르지 않는다**: Signing & Capabilities에서 팀을 고르면 공개 추적 파일 `app/ios/Runner.xcodeproj/project.pbxproj`에 Team ID 원문이 들어가고 다음 `git pull`도 막힌다. 이미 했으면 `cd ~/G2 && git checkout -- app/ios/Runner.xcodeproj/project.pbxproj`(커밋 금지). 스크립트는 명령줄로 팀을 넘기므로 화면에서 고를 필요가 없다.
- **"신뢰하지 않는 개발자"로 실행만 실패하면**: 아이폰 설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > 신뢰 → `bash tools/mac/ios_run.sh --launch-only`.
- **만료**: 유료 개발자 계정이면 서명이 **1년** 간다(7일 아님). 무료 Personal Team이면 7일마다 같은 한 줄을 다시 돌린다. 다시 깔아도 진행 저장은 남는다.
- **다음 `git pull`이 막히지 않게**: 스크립트는 추적 파일을 바꾸지 않도록 돌린다(`pubspec.lock` 고정, SPM은 `app/pubspec.yaml`에서 켬, 결과물은 `.local/`). 끝에 바뀐 추적 파일이 있으면 경고와 함께 정확한 `git checkout -- …` 복구 명령을 찍는다.

| 옵션 | 뜻 |
|---|---|
| `--check` | 사전 점검만(Xcode, 기기, 개발자 모드, Team, Flutter, python3). 빌드·설치·묻기·저장 없음 |
| `--launch-only` | 설치된 앱만 다시 실행 |
| `--device <UDID·이름>` | 아이폰이 여러 대일 때 고르기 |
| `--no-rust` | 네이티브 데모용 Rust 물리 빼기(웹 게임과 무관). 없어도 Xcode 빌드가 실패하면 저절로 끄고 한 번 더 한다 |
| `--clean` | DerivedData·`app/build`를 지우고 새로 빌드(아이폰의 앱은 그대로) |
| `--yes` | 묻지 않기(자동 실행용) |

종료 코드: `0` 실행 뒤 떠 있음 · `2` 사용법 · `3` 환경(Xcode·Team·Flutter) · `4` 빌드 · `5` 기기 · `6` 설치 · `7` 실행 실패 또는 확인 불가 · `9` 다른 배포가 잠금 중(잠금은 자동으로 지우지 않는다) · `130` Ctrl-C로 중단.

아래는 맥에 직접 손대지 않고 **서버에서 SSH로** 설치하는 예전 경로다.

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
| 맥에 필요한 것 | Xcode(로그인, Team), **Flutter 3.47.x**(권장 3.47.5 — `pubspec.lock`이 `flutter >=3.47.0`·Dart ^3.13.4를 요구, 이 경로는 버전을 고정하지 않으니 맞춰 둘 것), 아이폰 페어링과 개발자 모드 |

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
> 맥 폴더는 서버 env 파일의 `MAC_DIR` 값이야.
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

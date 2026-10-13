# 코덱스 중간 리뷰 요청서 (2026-10-13 밤)

## 🧭 핵심 가설

- **기획은 재윤님 피드백 10차를 대부분 반영했다.** 다만 이것이 실제로 손맛과 인과로 이어졌는지는 실기기와 3D 스파이크로 아직 판가름 나지 않았다. (미검증)
- 이 리뷰의 목적은 다음 두 가지를 출하 전에 찾는 것이다.
  - **틀린 전제, 가짜 물리, 숨은 보정.**
  - **앱 출시를 막을 결함.**

## 맥락

- 게임: PUFF!(1990년대 '딱지 불어먹기'의 글로벌 모바일판). 재윤님은 기획자 겸 플레이테스터다.
- 피드백 기록: `docs/design/feedback-log.md`
- 원칙:
  - 가설 먼저(`CLAUDE.md`).
  - 플레이어 물리를 몰래 보정하지 않는다.
  - 센 선택에는 실제 대가가 있다(정답 하나로 쏠리지 않게).
  - 한 엄지, 전 연령.

## 리뷰 범위와 묻는 것

| 영역 | 파일 | 물어보고 싶은 것 |
|---|---|---|
| 기획: 피드백 반영 | `docs/design/feedback-log.md`, `v2-physics-gameplay.md` §1·§3, `items-pvp.md`, `round9-lips-goggles.md` | 피드백과 결정 사이에 빠지거나 왜곡된 것은? 서로 모순되는 결정은? |
| 물리 v2 사양 | `docs/design/v2-physics-gameplay.md` §2·§4·§7 | 힘마다 정직한가(가짜 이득, 이중 계산)? 숫자가 물리 범위 안인가? 합격 기준이 측정 가능한가? 3D 스파이크 계획에 빠진 위험은? |
| 게임 시스템 | 같은 문서 §6, `items-pvp.md` §1 | 지배 전략, pay-to-win, 숨 풍선(체력)이 벌이 되는 고리, 더미 곡선(L13 ≈ 30장)의 근거 |
| 웹 목업 (v1) | `mockup/src/main.js`, `sim.js`, `rules.js`, `cues.js`, `levels.js` | 버그, 상태 누수, 입력(두 손가락 등), 성능 |
| PvP 시제품 | `mockup/src/turn.js`, `net.js`, `pvp.js`, `tools/pvpsync.mjs`, `tools/pvp-check.mjs` | 동기 깨짐, 재접속·늦은 참가, 신뢰 경계(쏜 사람 권위), 아티팩트 room/db 사용 |
| Flutter 앱 | `app/lib/*.dart`, `app/ios/Runner/Info.plist`, `app/android/...`, `docs/design/app-release.md` §3 | WKWebView·로컬 서버·수명주기, 스토어 규정 위험, P0 목록 누락 |
| 네이티브 시제품 | `native/puff_sim/` (Rust rapier3d 0.36, C ABI), `app/lib/native/`, `docs/app/native-spike.md` | FFI 메모리 안전, 결정성 주장, JS와 같은지 비교한 방법이 타당한가 |
| 배포 | `tools/iphone/*`, `docs/app/iphone-deploy.md` | 맥·아이폰 설치 스크립트의 실패 모드와 보안(키를 다루는 방식) |

## 원하는 출력

- 심각도(차단 / 높음 / 중간 / 낮음)와 **파일:줄**을 적는다.
- 재현할 수 있는 시나리오(입력 → 잘못된 결과)를 적는다.
- 고침 제안은 최소한으로 한다.
- 기획 지적은 **어느 피드백(차수)과 어긋나는지** 적는다.

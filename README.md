# PUFF! — 딱지 불어먹기 (G2)

> 후~ 불고, 뒤집고, 가져가! · Blow. Flip. Keep.

1990년대 한국 문방구 '동그란 딱지 불어먹기'를 남녀노소·글로벌 아케이드로 옮기는 프로젝트.

## 바로 해보기

- **`dist/puff.html` 을 브라우저로 열기** (더블클릭). 인터넷 없이도 됨. 폰이면 파일을 폰으로 옮겨 Chrome/Safari 로 열기.
- 조작: **딱지 더미를 누르고 → 아래로 당겼다가 → 놓기 = 퍽!**
  - 누른 위치 = 바람이 맞을 높이/쪽 (맨 위 = 안정, 가운데 = 대박 아니면 꽝)
  - 당긴 길이 = 숨(파워). 볼이 빵빵해지고 게이지 초록 구간이 최적. 빨간 구간 = 너무 셈 → 조준이 흔들림
  - 좌우로 당기면 조준이 반대쪽으로 미세 이동 (새총식)
- 홈 화면 `Mic blow` 를 켜면 **누른 채로 마이크에 진짜 "후~"** 로 파워를 낸다 (로컬 파일 실행 시).

## 문서

- [리서치 리포트](docs/research/01-research-report.md)
- [게임 기획서 (GDD)](docs/design/GDD.md)
- [막힌 것 / 결정 필요 메모](docs/BLOCKERS.md)

## 개발

```bash
npm install
npm run build   # → dist/puff.html, dist/puff-artifact.html
```

소스 구조와 물리 튜닝 메모는 [CLAUDE.md](CLAUDE.md).

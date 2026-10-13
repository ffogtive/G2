코어 루프 실측 스크립트 (2026-10-12, mockup/src/sim.js TUNE #73 기준)
- single.mjs <정책> [시드수] [장수]     : 새 더미 단발 샷 분포 (실력 3요소 분해)
- endgame.mjs <남은장수>               : 막판 소더미 높이×파워 스윕
- matchsim.mjs / ms2.mjs <A> <B> <판수> <각자판돈> [턴상한] [alt|12] : 단판 매치(선공 이점, 후공 2연속 규칙)
- twoleg.mjs <A> <B> <판수> <라운드당장수> : 왕복 2라운드(선공 교대)
- hist.mjs <정책> <판수> <각자판돈>      : 매치 내 샷 결과 → 연출 등급 발생률
- cal.mjs <A> <B> <판수> <각자판돈>      : AI 사다리 보정 (A가 선공)
- adapt.mjs <A> <B> <판수> <장수> [single|twoleg] : 막판 적응형(master) vs 고정형(expert)
- timing.mjs                          : 샷 1회 헤드리스 사전계산 시간
정책: expert/mid(현 목업 AI)/novice/rookie/learner/hanjang/gambler/over/aimOnly/powerOnly/latBad/heightOnlyBad/master — 각 파일 상단 정의 참고.

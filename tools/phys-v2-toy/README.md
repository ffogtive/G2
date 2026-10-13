# 설계서 v2 재현 스크립트 (방향 감용 — 띠의 근거는 3D 스파이크)

`docs/design/v2-physics-gameplay.md` 부록 C의 계산·장난감이다. 정식 측정은 Rust `puff_v2`(3D 스파이크)가 맡는다.

| 파일 | 내용 |
|---|---|
| `curve2.mjs` | 더미 곡선 B(n) = 40 − 28·e^(−n/12)과 L1~60 표. `node curve2.mjs stats\|grid`. 대안 기준선은 `PLAT=46\|30` |
| `unidp.py`, `maxpuff_dp.py` | 통일 비용 장난감 DP: 한 판 안에서 정답이 바뀌는가(최대 퍽 → 푸어억 → 퍽). `python3 unidp.py <쓸기배수> <회복> <c_P>` |
| `est.py`, `table.py`, `pile.py`, `sweep3.py` | 리서치 계산: 숨·제트·문턱 표, 쌓임, 쓸기 |
| `v2toy.py`, `v2grid.py`, `v2under.py` | 2D 장난감(턱, 격자, 책상 밑). 참고용이고 띠의 출처가 아니다 |
| `eng.rs`, `eng2.rs` | 엔지니어링 리뷰의 G1(정직한 쌓임)·광선·스텝 비용 실측(rapier3d 0.36). `native/puff_sim`에 bin으로 붙여 돌린다 |

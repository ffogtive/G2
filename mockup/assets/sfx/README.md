# 효과음 샘플

- `puh-*.mp3`(또는 .ogg/.wav): 입으로 부는 '푸' 소리. 여러 개면 무작위로 하나를 쓴다.
- 파일이 있으면 `npm run build`가 데이터 URL로 넣는다(`window.__PUFF_SFX__`).
  - 게임은 `audio.js puff()`의 합성음 대신 이 샘플을 쓴다.
  - 숨 세기에 따라 재생 속도와 음량을 바꾼다.
  - 앞 무음은 불러올 때 자동으로 건너뛴다(`audio.js onsetOf`).
- 만들기(일레븐랩스 효과음 API): `ELEVENLABS_API_KEY`가 있어야 하고, `api.elevenlabs.io`가 네트워크 허용 목록에 있어야 한다.
  1. `node tools/sfx-elevenlabs.mjs gen 2` 를 실행한다.
     - 프롬프트 4종 × 2개 후보가 `candidates/`에 생긴다(git 제외).
     - 함께 `dist/sfx-pick.html`이 만들어진다. 아티팩트로 올려 폰에서 듣고 고른다.
  2. `node tools/sfx-elevenlabs.mjs pick a-1 c-2` 처럼 고른 번호를 넘기면 `puh-1.mp3`, `puh-2.mp3`로 복사된다. 그다음 `npm run build`.

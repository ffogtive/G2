# 효과음 샘플

- `puh-*.mp3`(또는 .ogg/.wav): 입으로 부는 '푸' 소리. 여러 개면 무작위로 하나를 쓴다.
- 파일이 있으면 `npm run build`가 데이터 URL로 넣는다(`window.__PUFF_SFX__`). 게임은 `audio.js puff()`의 합성음 대신 이 샘플을 쓰고, 숨 세기에 따라 재생 속도와 음량을 바꾼다.
- 만들기: `node tools/sfx-elevenlabs.mjs 4`. 일레븐랩스 효과음 API를 쓰며, `ELEVENLABS_API_KEY`가 있어야 하고 `api.elevenlabs.io`가 네트워크 허용 목록에 있어야 한다.

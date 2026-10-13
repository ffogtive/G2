// sfx-elevenlabs.mjs — 일레븐랩스 효과음 API 로 '푸'(입으로 부는 소리) 샘플을 만들어 mockup/assets/sfx/ 에 저장 (재윤님 6차)
// 준비: 환경에 ELEVENLABS_API_KEY, 네트워크 허용 도메인에 api.elevenlabs.io
// 사용: node tools/sfx-elevenlabs.mjs [개수=4]  → mockup/assets/sfx/puh-1.mp3 … → npm run build 가 자동으로 넣고, 게임은 합성음 대신 이 샘플을 쓴다
import { writeFileSync, mkdirSync } from 'node:fs';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY 가 없습니다 (환경 설정의 Network secrets 또는 환경 변수)'); process.exit(1); }
const N = +(process.argv[2] || 4);
const PROMPTS = [
  'A single short human mouth blow, "puh!" — lips pop then a quick breathy puff of air, close microphone, dry room, no voice, no music',
  'One quick strong blow of breath through pursed lips, like blowing out a candle, "phoo", close-mic, dry, no vocal tone',
  'Short playful cartoon puff of air from the mouth, "puh", soft lip pop and airy whoosh, no reverb, no music',
  'A child blowing hard on paper cards on a desk, single puff "puuh", breathy, close microphone, no voice',
];
mkdirSync('mockup/assets/sfx', { recursive: true });
for (let i = 0; i < N; i++) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: PROMPTS[i % PROMPTS.length], duration_seconds: 0.6, prompt_influence: 0.6 }),
  });
  if (!res.ok) { console.error(`#${i + 1} 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`mockup/assets/sfx/puh-${i + 1}.mp3`, buf);
  console.log(`puh-${i + 1}.mp3 ${(buf.length / 1024).toFixed(0)} KB`);
}
console.log('다음: 들어 보고 마음에 안 드는 파일은 지운 뒤 npm run build');

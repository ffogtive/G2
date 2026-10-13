// sfx-elevenlabs.mjs — 일레븐랩스 효과음 API 로 '푸'(입으로 부는 소리) 후보를 만들고, 들어 보고 고르는 페이지를 만든다 (재윤님 6·7차)
// 준비: 환경 변수 ELEVENLABS_API_KEY (또는 Network secrets), 허용 도메인 api.elevenlabs.io
//
// 1) 후보 만들기:  node tools/sfx-elevenlabs.mjs gen [프롬프트당 개수=2]
//      → mockup/assets/sfx/candidates/puh-<프롬프트>-<번호>.mp3 (빌드에는 안 들어감)
//      → dist/sfx-pick.html : 후보마다 재생 버튼 + 길이·앞 무음·저역 비율 (아티팩트로 올려 폰에서 듣고 고르기)
// 2) 고르기:      node tools/sfx-elevenlabs.mjs pick a-1 c-2 …
//      → mockup/assets/sfx/puh-1.mp3, puh-2.mp3 … (여러 개면 게임이 매번 무작위로 하나) → npm run build
import { writeFileSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'mockup/assets/sfx', CAND = `${DIR}/candidates`;
const PROMPTS = {
  a: 'A single short human mouth blow, "puh!" — lips pop then a quick breathy puff of air, close microphone, dry room, no voice, no music',
  b: 'One quick strong blow of breath through pursed lips, like blowing out a candle, "phoo", close-mic, dry, no vocal tone',
  c: 'Short playful cartoon puff of air from the mouth, "puh", soft lip pop and airy whoosh, no reverb, no music',
  d: 'A child blowing hard on paper cards on a desk, single puff "puuh", breathy, close microphone, no voice',
};
const [cmd = 'gen', ...rest] = process.argv.slice(2);

// ffmpeg 로 길이·앞 무음·200Hz 아래 비율 재기 (게임은 앞 무음을 알아서 건너뛴다: audio.js onsetOf)
function measure(file) {
  const pcm = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], { maxBuffer: 64 << 20 });
  const d = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4), sr = 22050;
  let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
  let on = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * 0.06) { on = i / sr; break; }
  const low = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-af', 'lowpass=f=200,lowpass=f=200', '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], { maxBuffer: 64 << 20 });
  const dl = new Float32Array(low.buffer, low.byteOffset, low.length / 4);
  let e = 0, el = 0; for (const v of d) e += v * v; for (const v of dl) el += v * v;
  return { dur: d.length / sr, onset: on, low: e ? el / e : 0, peak: pk };
}

if (cmd === 'gen') {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) { console.error('ELEVENLABS_API_KEY 가 없습니다 (환경 설정의 Network secrets 또는 환경 변수, 새 세션부터 적용)'); process.exit(1); }
  const per = +(rest[0] || 2);
  mkdirSync(CAND, { recursive: true });
  for (const [p, text] of Object.entries(PROMPTS)) for (let k = 1; k <= per; k++) {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, duration_seconds: 0.6, prompt_influence: 0.6 }),
    });
    if (!res.ok) { console.error(`${p}-${k} 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`${CAND}/puh-${p}-${k}.mp3`, buf);
    console.log(`${p}-${k}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

if (cmd === 'gen' || cmd === 'page') {
  const files = existsSync(CAND) ? readdirSync(CAND).filter((f) => /^puh-[a-z]-\d+\.mp3$/.test(f)).sort() : [];
  if (!files.length) { console.error('후보가 없습니다'); process.exit(1); }
  const rows = files.map((f) => {
    const id = f.slice(4, -4), m = measure(`${CAND}/${f}`);
    const url = 'data:audio/mpeg;base64,' + readFileSync(`${CAND}/${f}`).toString('base64');
    console.log(`${id}  길이 ${m.dur.toFixed(2)}s  앞 무음 ${(m.onset * 1000).toFixed(0)}ms  200Hz 아래 ${(m.low * 100).toFixed(0)}%`);
    return `<div class="row"><button data-src="${url}">▶ ${id}</button><span>${m.dur.toFixed(2)}초 · 앞 무음 ${(m.onset * 1000).toFixed(0)}ms · 저역 ${(m.low * 100).toFixed(0)}%</span><small>${PROMPTS[id[0]].replace(/"/g, '&quot;')}</small></div>`;
  }).join('\n');
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/sfx-pick.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>푸 소리 고르기</title>
<style>:root{--bg:#fff8ee;--fg:#2a1a12;--card:#fff;--line:#e8d9c4}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1d1612;--fg:#f6eadb;--card:#2a211b;--line:#4a3a2e}}:root[data-theme="dark"]{--bg:#1d1612;--fg:#f6eadb;--card:#2a211b;--line:#4a3a2e}
body{background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif;margin:0;padding:16px;max-width:640px}h1{font-size:20px}.row{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0;display:grid;gap:4px}
button{font:700 18px system-ui;padding:10px;border-radius:10px;border:2px solid var(--fg);background:#ffd34d;color:#2a1a12;text-align:left}small{opacity:.65}</style></head><body>
<h1>'푸' 소리 후보 — 눌러서 듣고, 마음에 드는 번호를 알려 주세요</h1><p>게임에서는 앞 무음을 자동으로 건너뛰고, 숨 세기에 따라 빠르기·크기만 바꿉니다. 여러 개를 고르면 매번 무작위로 하나가 나옵니다.</p>
${rows}
<script>let ac;document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{ac=ac||new AudioContext();const buf=await ac.decodeAudioData(await (await fetch(b.dataset.src)).arrayBuffer());const s=ac.createBufferSource();s.buffer=buf;s.connect(ac.destination);s.start();});</script></body></html>`);
  console.log('→ dist/sfx-pick.html (아티팩트로 올려 듣고 고르기) → node tools/sfx-elevenlabs.mjs pick <번호…>');
}

if (cmd === 'pick') {
  if (!rest.length) { console.error('고를 번호를 주세요 (예: a-1 c-2)'); process.exit(1); }
  for (const f of readdirSync(DIR)) if (/^puh-\d+\.(mp3|ogg|wav)$/.test(f)) rmSync(`${DIR}/${f}`);
  rest.forEach((id, i) => { copyFileSync(`${CAND}/puh-${id}.mp3`, `${DIR}/puh-${i + 1}.mp3`); console.log(`${id} → puh-${i + 1}.mp3`); });
  console.log('다음: npm run build');
}

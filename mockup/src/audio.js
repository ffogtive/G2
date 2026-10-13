// audio.js — 외부 음원 0개, WebAudio 합성 효과음
// 가설: "퍽!" 쾌감의 절반은 소리. 뒤집힐 때마다 음이 한 칸씩 올라가는 상승 차임(Peggle식)이 연쇄의 흥분을 만든다.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  get ok() {
    return this.ctx && !this.muted;
  }

  noise(dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(this.ctx.currentTime, Math.random() * 1.2, dur + 0.1);
    return s;
  }

  env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, glideTo) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.008, vol, dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // 들숨(차징) — 파워에 따라 음높이 상승. 반환된 핸들로 갱신/정지
  inhale() {
    if (!this.ok) return null;
    const t0 = this.ctx.currentTime;
    const src = this.noise(8);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.15);
    src.connect(bp).connect(g).connect(this.master);
    let held = false;
    return {
      set: (p) => {
        if (held) return;
        bp.frequency.setTargetAtTime(500 + p * 1400, this.ctx.currentTime, 0.05);
        g.gain.setTargetAtTime(0.03 + p * 0.09, this.ctx.currentTime, 0.05);
      },
      // 숨 주머니 꽉: 들숨 소리가 뚝 끊김 (더 안 들어감)
      hold: () => { held = true; g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.015); },
      resume: () => { held = false; },
      stop: () => {
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
        src.stop(this.ctx.currentTime + 0.2);
      },
    };
  }

  // 숨 주머니 꽉 — 둔탁한 '읍' (성공음이 아니라 막힘)
  cork() {
    if (!this.ok) return;
    this.tone(260, 0.07, 'sine', 0.22, 0, 140);
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.03);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.002, 0.12, 0.025);
    src.connect(lp).connect(g).connect(this.master);
  }

  // 참다가 입꼬리로 새는 김 'pff'
  leak() {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 2.5;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.005, 0.05, 0.075);
    src.connect(bp).connect(g).connect(this.master);
  }

  // 콜록 — 너무 오래 참음 (로우패스 노이즈 두 번)
  cough() {
    if (!this.ok) return;
    for (const w of [0, 0.18]) {
      const t0 = this.ctx.currentTime + w;
      const src = this.noise(0.14 + w); // noise() 는 지금 시작 → 두 번째 기침은 게인 엔벨로프로 늦춤
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001; // 기본 게인 1 → 늦춘 기침 전에 소리가 새지 않게
      this.env(g, t0, 0.01, 0.35, 0.12);
      src.connect(lp).connect(g).connect(this.master);
      this.tone(150, 0.1, 'triangle', 0.12, w, 90);
    }
  }

  // 푸! — 입으로 부는 소리 (재윤님 6차: "쐈을 때 탁이 아니라 입으로 '푸' 하는 소리")
  // 🧭 가설: 옛 소리는 노이즈 스윕 + 95Hz '쿵' + 180Hz 톤이라 '탁'으로 들렸다 → 저음 톤을 빼고
  //   ① 입술이 터지는 짧은 'ㅍ'(6ms 광대역 + 아주 약한 저역 팝) ② 'ㅜ' 입 모양 숨소리(포먼트 320·780Hz + 숨결 1.6kHz)
  //   ③ 세기에 따라 길이·거칠기 (약함 = 짧은 '프', 초록 = '푸우', 셈 = 거친 '푸화')
  // 일레븐랩스 등 실제 녹음 샘플이 빌드에 들어 있으면(window.__PUFF_SFX__.puh) 그걸 먼저 쓴다.
  puff(power = 1, ratio = 1) {
    if (!this.ok) return;
    if (this.playSample('puh', 0.85 + 0.25 * Math.min(1.2, power), 0.55 + 0.45 * Math.min(1, power), ratio)) return;
    renderPuh(this.ctx, this.master, this.ctx.currentTime, power, ratio, this.noiseBuf);
  }

  // 빌드에 넣은 샘플(데이터 URL) → AudioBuffer. 없거나 디코딩 실패면 false (합성으로)
  playSample(name, rate = 1, vol = 1, ratio = 1) {
    const list = this.samples?.[name];
    if (!list || !list.length) return false;
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (ratio > 1.05 ? 1.08 : ratio < 0.7 ? 1.12 : 1);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  }
  async loadSamples() {
    const src = (typeof window !== 'undefined' && window.__PUFF_SFX__) || null;
    if (!src || !this.ctx) return;
    this.samples = {};
    for (const [name, urls] of Object.entries(src)) {
      this.samples[name] = [];
      for (const u of urls) {
        try { const ab = await (await fetch(u)).arrayBuffer(); this.samples[name].push(await this.ctx.decodeAudioData(ab)); } catch (e) { /* 합성으로 */ }
      }
    }
  }


  // 딱지가 책상에 '탁' 떨어지는 소리
  clack(intensity = 1) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.08);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800 + Math.random() * 1600;
    hp.Q.value = 3;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.002, 0.15 + 0.25 * Math.min(1, intensity), 0.05);
    src.connect(hp).connect(g).connect(this.master);
  }

  // n번째 뒤집힘 — 음이 한 칸씩 올라감 (펜타토닉)
  flip(n) {
    const scale = [0, 2, 4, 7, 9];
    const step = scale[n % 5] + 12 * Math.floor(n / 5);
    const f = 523.25 * Math.pow(2, step / 12);
    this.tone(f, 0.22, 'triangle', 0.22);
    this.tone(f * 2, 0.12, 'sine', 0.08, 0.01);
  }

  coin(i = 0) {
    const f = 880 * Math.pow(2, Math.min(i, 14) / 24);
    this.tone(f, 0.08, 'square', 0.06);
    this.tone(f * 1.5, 0.12, 'sine', 0.1, 0.05);
  }

  pop() {
    this.tone(660, 0.07, 'sine', 0.15, 0, 990);
  }

  whoosh() {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.3);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.05, 0.12, 0.3);
    src.connect(bp).connect(g).connect(this.master);
  }

  fanfare(win = true) {
    const notes = win ? [523, 659, 784, 1047, 1319] : [523, 466, 415, 349];
    notes.forEach((f, i) => this.tone(f, win ? 0.28 : 0.35, 'triangle', 0.22, i * (win ? 0.11 : 0.16)));
    if (win) this.tone(1047, 0.6, 'sine', 0.12, 0.55);
  }

  big() {
    // 대박 연출: 드럼롤 비슷한 노이즈 + 상승 화음
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, i * 0.06));
  }
}

// '푸' 합성 (오프라인 렌더 검증용으로 컨텍스트를 받는다: tools/scratch/puhrender.mjs)
export function renderPuh(ctx, dest, t0, power = 1, ratio = 1, noiseBuf = null) {
  const p = Math.max(0.15, Math.min(1.25, power));
  const weak = ratio < 0.7, over = ratio > 1.05;
  const dur = (weak ? 0.14 : 0.26) + 0.3 * Math.min(1, p) + (over ? 0.12 : 0); // 숨 길이
  if (!noiseBuf) {
    const len = Math.ceil(ctx.sampleRate * 1.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const noise = (d) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t0, Math.random() * 1.2, d + 0.05); return s; };
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(dest);
  // ① 입술 터짐 'ㅍ': 아주 짧은 광대역 + 약한 저역 팝(입술이 떨어지는 '뽁')
  const b = noise(0.02);
  const bhp = ctx.createBiquadFilter(); bhp.type = 'highpass'; bhp.frequency.value = 500;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t0); bg.gain.exponentialRampToValueAtTime(0.35 + 0.25 * p, t0 + 0.002); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.014);
  b.connect(bhp).connect(bg).connect(out);
  const pop = ctx.createOscillator(); pop.type = 'sine';
  pop.frequency.setValueAtTime(140, t0); pop.frequency.exponentialRampToValueAtTime(70, t0 + 0.03);
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.0001, t0); pg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.003); pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  pop.connect(pg).connect(out); pop.start(t0); pop.stop(t0 + 0.06);
  // ② 'ㅜ' 숨소리: 숨 노이즈를 입 모양 포먼트로 (조금씩 내려가며 숨이 빠짐)
  const a = noise(dur + 0.1);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(over ? 5200 : 3200, t0); lp.frequency.exponentialRampToValueAtTime(over ? 2600 : 1500, t0 + dur);
  const env = ctx.createGain();
  const peak = (weak ? 0.35 : 0.6) + 0.35 * Math.min(1, p);
  env.gain.setValueAtTime(0.0001, t0 + 0.004);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.025);
  env.gain.setValueAtTime(peak * 0.85, t0 + 0.025 + dur * 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025 + dur);
  a.connect(lp).connect(env);
  const bands = [
    { f: 320, q: 4.5, g: 1.0 }, // F1 'ㅜ'
    { f: 780, q: 5, g: 0.7 }, // F2 'ㅜ'
    { f: 1700, q: 0.9, g: over ? 0.9 : 0.45 }, // 숨결(쉬익)
  ];
  if (over) bands.push({ f: 3600, q: 1.2, g: 0.5 }); // 센 숨: 거친 '화'
  for (const k of bands) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = k.q;
    bp.frequency.setValueAtTime(k.f * 1.06, t0); bp.frequency.exponentialRampToValueAtTime(k.f * 0.9, t0 + dur);
    const g = ctx.createGain(); g.gain.value = k.g * (k.f < 1000 ? 2.2 : 1); // 좁은 대역은 에너지가 작아 보정
    env.connect(bp).connect(g).connect(out);
  }
}

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
    return {
      set: (p) => {
        bp.frequency.setTargetAtTime(500 + p * 1400, this.ctx.currentTime, 0.05);
        g.gain.setTargetAtTime(0.03 + p * 0.09, this.ctx.currentTime, 0.05);
      },
      stop: () => {
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
        src.stop(this.ctx.currentTime + 0.2);
      },
    };
  }

  // 퍽! — 바람 노이즈 스윕 + 저음 쿵
  puff(power = 1) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.6);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1800, t0);
    bp.frequency.exponentialRampToValueAtTime(260, t0 + 0.35);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.012, 0.5 + 0.4 * power, 0.32 + 0.2 * power);
    src.connect(bp).connect(g).connect(this.master);
    this.tone(95, 0.18, 'sine', 0.5 * power, 0, 45);
    this.tone(180, 0.08, 'triangle', 0.18, 0, 90);
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

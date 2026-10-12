// mic.js — 마이크에 "후~" 부는 것을 감지 (옵션 입력)
// 가설: 부는 소리는 말소리보다 저역 에너지가 크고 넓은 대역의 잡음이다. RMS + 저역 비율로 구분하고,
//       최고 세기를 파워로 쓴다. (공개 아티팩트 뷰어는 마이크 권한을 막으므로 로컬 실행 전용)

export class Mic {
  constructor() {
    this.ready = false;
    this.level = 0; // 0..1 (실시간)
    this.peak = 0;
    this.lowRatio = 0;
    this.err = null;
  }

  async start() {
    if (this.ready) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      this.an.smoothingTimeConstant = 0.2;
      src.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
      this.freq = new Uint8Array(this.an.frequencyBinCount);
      this.ready = true;
      this.stream = stream;
      return true;
    } catch (e) {
      this.err = e && e.name ? e.name : String(e);
      return false;
    }
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.ready = false;
  }

  // 매 프레임 호출. 반환: {level, blowing}
  sample() {
    if (!this.ready) return { level: 0, blowing: false };
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    this.an.getByteFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.an.fftSize;
    let low = 0, all = 1;
    for (let i = 1; i < this.freq.length; i++) {
      all += this.freq[i];
      if (i * binHz < 600) low += this.freq[i];
    }
    this.lowRatio = low / all;
    // 바람 소리: 세고(rms) + 저역 비중이 큼. 말소리는 저역 비중이 상대적으로 낮다.
    const lv = Math.max(0, Math.min(1.25, (rms - 0.03) / 0.3));
    this.level = this.level * 0.5 + lv * 0.5;
    const blowing = rms > 0.06 && this.lowRatio > 0.18;
    return { level: this.level, blowing };
  }
}

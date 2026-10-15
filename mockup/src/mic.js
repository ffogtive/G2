// mic.js — 마이크에 "후~" 부는 것을 감지 (옵션 입력)
// 가설: 부는 소리는 말소리보다 저역 에너지가 크고 넓은 대역의 잡음이다. RMS + 저역 비율로 구분하고,
//       최고 세기를 파워로 쓴다. (공개 아티팩트 뷰어는 마이크 권한을 막으므로 로컬 실행 전용)
import { AppAudio } from './audio.js';

export class Mic {
  constructor() {
    this.ready = false;
    this.level = 0; // 0..1 (실시간)
    this.peak = 0;
    this.lowRatio = 0;
    this.err = null;
    this.starting = null;
  }

  // 권한 창이 떠 있는 동안 또 눌러도 녹음을 두 번 열지 않는다(먼저 연 것을 놓치면 stop() 으로 못 닫아 녹음 표시가 남음)
  start() {
    if (this.ready) return Promise.resolve(true);
    if (!this.starting) this.starting = this.open().finally(() => { this.starting = null; });
    return this.starting;
  }

  async open() {
    // 앱(iOS): 소리 세션을 'auto' 로 — 'playback' override 가 걸린 채면 WebKit 이 PlayAndRecord 로 못 바꾼다(AudioSessionIOS 'override set, NOT changing')
    // → 녹음이 안 될 수 있다(소스로 확인, 기기 미확인). 이미 'auto' 면 아무것도 안 바뀐다
    AppAudio.setMic(true);
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // await 뒤(활성화 밖)에 만들었다 → 생성 직후는 suspended. 깨워 둔다(웹 Safari 는 '녹음 중이면 허용'에 기댐 — 미검증).
      // suspended 로 남으면 분석기가 0 만 읽는다 → 상태는 ⚙ 마이크 줄(ctxState)에 보인다
      try { this.ctx.resume()?.catch?.(() => {}); } catch (e) { /* 옛 webkitAudioContext */ }
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
      stream?.getTracks().forEach((t) => t.stop()); // 받은 뒤에 실패했으면 녹음을 열어 두지 않는다
      AppAudio.setMic(false);
      return false;
    }
  }

  get ctxState() { return this.ctx ? this.ctx.state : null; }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = null;
    this.ctx = null;
    this.ready = false;
    AppAudio.setMic(false); // 앱: 터치 모드 세션('playback' = 무음 모드에서도 소리)으로 돌아감
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

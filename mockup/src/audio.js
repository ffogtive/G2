// audio.js — 외부 음원 0개, WebAudio 합성 효과음
// 가설: "퍽!" 쾌감의 절반은 소리. 뒤집힐 때마다 음이 한 칸씩 올라가는 상승 차임(Peggle식)이 연쇄의 흥분을 만든다.

const MASTER = 0.8;
// 앱(iOS)에서 마이크를 켜면 WebKit 이 PlayAndRecord + VideoChat 으로 바꾼다(WebKit MediaSessionManagerCocoa.mm — 확인됨).
// 그때 재생 레벨이 낮아진다는 보고가 많다(원인·폭은 미검증 — Apple 이 출력 처리를 어떻게 바꾸는지 문서로 못 찾음). mic.js 는 VPIO 를 안 쓴다(echoCancellation:false)
// → 마이크가 켜진 동안만 앞단을 키운다(앱만). 뒤의 압축기가 봉우리를 누른다 — 오프라인 렌더 실측(2026-10-14, 무음 0.5초 뒤·시드 3개):
//   가장 큰 '푸 셈 + 차임 5 + 탁 2' 최대 표본 0.80 → 0.97(−0.3dBFS, 안 깨짐), 체감 rms +1.7~2.9dB. 1.6 이상은 0.99 에 붙으니 올리지 말 것
const MIC_BOOST = 1.5;

// ── 앱(Flutter iOS 웹뷰) 소리 세션 ─────────────────────────
// iOS WebKit 은 <audio> 없이 Web Audio 만 쓰는 페이지를 Ambient 로 잡는다 → 무음 모드(동작 버튼·제어 센터)에서 효과음이 전부 꺼진다.
// 앱 쪽 AVAudioSession(main.dart)은 WebKit 이 자기 프로세스에서 정하는 세션에 닿지 않는다. 바꿀 수 있는 길은 웹의
// navigator.audioSession.type 뿐(WebKit Audio Session API, iOS 16.4+). 근거 = WebKit main 소스(기기 미확인):
//   'playback' → MediaPlayback(섞임 옵션 없음): 무음 스위치 무시. 대신 AudioContext 가 시작될 때(첫 터치) 세션이 켜져 다른 앱 음악이 멈춘다.
//              제어 센터·잠금 화면 '지금 재생'에도 잡힌다(제목이 없으면 주소 127.0.0.1 → 아래 nowPlaying 이 'PUFF!' 로)
//   'auto'     → Web Audio 만이면 Ambient(무음 스위치를 따르고 음악과 섞임), 마이크 녹음 중이면 PlayAndRecord(무음 무시)
// 웹 API 로는 '무음에서도 소리 + 음악과 섞임'을 함께 못 한다(playback+섞임이 없음) — 둘 다 원하면 효과음을 Flutter 쪽에서 내야 한다.
// 마이크를 켤 때는 'auto' 로 돌려놓는다: override 가 걸려 있으면 WebKit 이 PlayAndRecord 로 못 바꿔(AudioSessionIOS 'override set, NOT changing')
// 녹음이 시작되지 않는다(지금 '부는 소리 인식'이 되는 길 = 'auto'). 게임 소리를 꺼 두면 'auto'(쓸데없이 음악을 끊지 않게).
// 웹·아티팩트 빌드는 건드리지 않는다(window.__puffApp 은 앱 다리 코드가 만든다).
export const AppAudio = {
  silentPlay: true, // 무음 모드에서도 소리(앱 기본). false = 'auto'(무음 스위치를 따르고 다른 앱 음악과 섞임)
  micOn: false,
  err: null,
  sfx: null,
  np: false,
  get on() { return typeof window !== 'undefined' && !!window.__puffApp; },
  get supported() { return typeof navigator !== 'undefined' && !!navigator.audioSession; },
  type() { try { return navigator.audioSession ? String(navigator.audioSession.type) : null; } catch (e) { return null; } },
  want() { return this.micOn || !this.silentPlay || this.sfx?.muted ? 'auto' : 'playback'; },
  // WebKit 이 고를 범주(소스 기준 추정 — ⚙ 소리·진동 시험 표): playAndRecord(녹음 중, 무음 무시) · playback(무음 무시) · ambient(무음 모드면 꺼짐).
  // 마이크를 끈 순간 게임 소리가 나고 있었다면 그 소리가 그칠 때까지 PlayAndRecord 가 남는다(MediaSessionManagerCocoa) — 시험 단추로 끄면 조용하므로 바로 ambient
  expect() {
    if (!this.on || !this.supported) return null;
    if (this.micOn) return 'playAndRecord';
    return this.type() === 'playback' ? 'playback' : 'ambient';
  },
  apply() {
    if (!this.on || !this.supported) return false;
    this.nowPlaying();
    const w = this.want();
    try { if (navigator.audioSession.type !== w) navigator.audioSession.type = w; this.err = null; return true; } catch (e) { this.err = String((e && e.message) || e); return false; }
  },
  // 'playback' 이면 '지금 재생'에 잡힌다 → 제목(없으면 주소). 제목만 준다: 재생 상태·동작 처리기는 안 건드림(DOM MediaSession 세션을 켜지 않게)
  nowPlaying() {
    if (this.np) return;
    this.np = true;
    try { if (navigator.mediaSession && typeof MediaMetadata === 'function') navigator.mediaSession.metadata = new MediaMetadata({ title: 'PUFF!' }); } catch (e) { /* 없음 */ }
  },
  setSilentPlay(v) { this.silentPlay = !!v; this.apply(); },
  setMic(on) { this.micOn = !!on; this.apply(); this.sfx?.boost(); },
  get boosted() { return this.on && this.micOn; },
};

// ── 소리 깨우기: 사용자 활성화 사건 안에서만 만들고 깨운다 ─────────────
// HTML 'activation-triggering input event' = keydown(Esc 제외)·mousedown·pointerdown(마우스만)·pointerup(마우스 아님)·touchend.
// click 은 그 뒤라 활성화가 살아 있다. 터치의 pointerdown 은 활성화가 아니다 → 거기서 만들면 Safari 는 손을 뗄 때까지 suspended.
// WebKit 은 제스처가 필요할 때 '소스 start' 를 시작 계기로 쓴다 → 활성화 때 resume() + 1샘플 무음 소스(옛 iOS 잠금 풀기).
// 합성 사건(isTrusted=false — el.click()·?pvpbot)은 활성화가 아니다.
const ACT_EVENTS = new Set(['pointerup', 'touchend', 'click', 'keydown', 'mousedown', 'mouseup']);
export function activationType(ev) {
  if (!ev || typeof ev.type !== 'string' || ev.isTrusted === false) return null;
  if (ev.type === 'keydown') return ev.key === 'Escape' ? null : 'keydown';
  if (ACT_EVENTS.has(ev.type)) return ev.type;
  if (ev.type === 'pointerdown' && ev.pointerType === 'mouse') return 'pointerdown';
  return null;
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const SAME_TAP_MS = 600; // 톡 한 번 = pointerup·touchend·click 세 사건 → 시도 하나로 센다
const MAX_TRIES = 2; // 활성화 두 번에도 running 이 아니면 다음 활성화에서 닫고 새로 만든다
const MAX_RECREATE = 2; // running 이 되기 전까지 다시 만들기 최대 횟수(아무 컨텍스트도 못 켜는 환경에서 헛돌지 않게)
const STALL_MIN_S = 0.5; // 'running' 인데 시계가 멈춤(iOS 끊김 뒤) 판정: 벽시계 이만큼 이상 지났는데 currentTime 증가가 그 절반 미만
const LOG_CAP = 10;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.noiseBuf = null;
    this.log = []; // AudioContext 시도·상태 기록({s, res, pending, n}) → states(⚙ 소리·진동 시험이 그대로 보여 줌)
    this.cur = null; // 지금 결과를 기다리는 시도(만들기·깨우기)
    this.tries = 0; // running 이 아닌 채로 한 활성화 시도 수(만들기 포함)
    this.lastTry = -1e9;
    this.recreates = 0;
    this.lastEv = null;
    this.paused = false; // 앱 수명주기 pause() 로 우리가 멈춤
    this.blank = null;
    this.sessWatch = false;
    this.noApi = false; // Web Audio 자체가 없음(잠금 모드) — ⚙ 표가 '아직 안 만듦'과 가른다
    this.ref = null; // 'running' 시계 기준점 {ctx, ct, at}(멈춤 판정)
    this.stalled = false; // 마지막 판정이 '멈춤'이었나(같은 톡의 다음 사건도 깨우기만)
    AppAudio.sfx = this;
  }

  // 시도 기록: 'new@5.2s(click)→running@5.2s 14ms' · 'resume@6.1s(touchend)…'(대기 중) · 'resume@6.1s(touchend)✗NotAllowedError' · 'recreate@9.0s(click) suspended'
  //           뒤 시도와 함께 풀린 옛 시도 'new@0.0s(pointerup)→running@3.0s 3015ms(뒤 시도로 풀림)' · 'running' 인데 시계 멈춤 'stall@8.0s(click) +0.00s/2.10s'
  //           상태 바뀜 'running@5.3s' · 앱 소리 세션 'session:interrupted@7.0s' · Web Audio 없음 'noapi@1.0s(click)'
  get states() {
    return this.log.map((e) => `${e.s}${e.n > 1 ? `×${e.n}` : ''}${e.pending ? '…' : e.res || ''}`);
  }
  note(s, extra) {
    const e = { s, n: 1, t0: nowMs(), ...extra };
    this.log.push(e);
    if (this.log.length > LOG_CAP) this.log.shift();
    return e;
  }
  // resume() 결과를 시도 기록에 붙인다(해결 시각·걸린 ms / 거절 이름). 끝나지 않으면 '…' 로 남는다(WebKit: 시작 허가가 없으면 대기)
  // 같은 기록에 resume 이 여럿 붙으면(같은 톡의 다른 사건·×n) 먼저 끝난 것만 적고, 걸린 시간은 그 시도를 시작한 때부터.
  // WebKit 은 허락 안 된 resume 을 거절하지 않고 대기시킨다 → 뒤 시도가 running 을 만들면 옛 대기도 함께 풀린다.
  // 그래서 해결 시각을 절대초로 적고, 더 새 시도가 있거나(this.cur !== e) ×n 으로 합쳐졌으면 '(뒤 시도로 풀림)' — 느린 성공으로 읽지 않게
  settle(e, ctx, p) {
    if (!p || typeof p.then !== 'function') { if (e.pending) { e.pending = false; e.res = `→${ctx.state}`; } return; }
    p.then(() => {
      if (ctx === this.ctx && ctx.state === 'running') this.ran();
      if (!e.pending) return;
      e.pending = false;
      const t = nowMs();
      e.res = `→${ctx.state}@${sec(t)} ${Math.round(t - e.t0)}ms${this.cur !== e || e.n > 1 ? '(뒤 시도로 풀림)' : ''}`;
    }, (err) => {
      if (!e.pending) return;
      e.pending = false;
      e.res = `✗${(err && err.name) || err}`;
    });
  }
  ran() { this.tries = 0; this.recreates = 0; this.paused = false; }

  // 어디서 불러도 된다(옛 API). 만들기·다시 만들기·시도 세기는 진짜 활성화 사건(신뢰된 Event 객체) 안일 때만 한다:
  //  - 클릭·키·손 뗌 처리기 안 → kick(같은 사건이면 main.js 전역 리스너가 이미 했으므로 건너뜀)
  //  - 활성화 밖(터치 pointerdown·타이머·await 뒤·⚙ 시험의 650ms 뒤) → 만들지도 세지도 적지도 않는다. 멈춘 컨텍스트가 있으면 resume 만:
  //    앱 웹뷰(제스처 요구 꺼짐 — 전화·시리 뒤 첫 경기 누름에서 들숨이 멈춘 시계에 예약되지 않게) · 웹은 일시 활성화가 살아 있을 때.
  //    WebKit 이 시작을 허락하는 기준은 사건 처리 중 제스처 토큰이지 navigator.userActivation 이 아니다(미검증) → 여기서 새로 만들면 안 된다
  //  - from='lifecycle'(앱이 앞으로 돌아옴, Flutter → runJavaScript): 앱 웹뷰는 제스처 요구가 꺼져 있어 깨우기만 한다(만들지는 않음)
  unlock(from) {
    AppAudio.apply(); // 앱: 첫 소리 전에 세션 종류
    const ctx = this.ctx;
    if (from === 'lifecycle') {
      if (ctx && ctx.state !== 'closed' && (this.paused || ctx.state !== 'running')) { this.paused = false; this.resumeTry('lifecycle', false); }
      return;
    }
    const ev = typeof window !== 'undefined' ? window.event : null;
    if (activationType(ev)) return this.kick(ev);
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !this.paused
      && (AppAudio.on || (typeof navigator !== 'undefined' && navigator.userActivation?.isActive))) this.wakeOnly();
  }

  // 세지도 적지도 않고 resume 만(결과는 onstatechange 'running@…' 으로 기록에 남는다)
  wakeOnly() {
    try { this.ctx.resume()?.catch?.(() => {}); } catch (e) { /* 옛 webkitAudioContext */ }
  }

  // 활성화 사건 하나(main.js 가 window capture 로 pointerup·touchend·click·keydown 마다 부름).
  // 문자열(사건 이름만)이면 진짜 활성화가 아니다 → 만들기·다시 만들기·세기 없이 깨우기만
  kick(ev) {
    const real = !!ev && typeof ev === 'object';
    const type = real ? activationType(ev) : (typeof ev === 'string' ? ev : null);
    if (!type) return;
    if (real) { if (this.lastEv === ev) return; this.lastEv = ev; }
    AppAudio.apply();
    const t = nowMs();
    const ctx = this.ctx;
    if (!real) { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') this.wakeOnly(); return; }
    if (!ctx || ctx.state === 'closed') { this.create(type); this.silent(); return; }
    if (ctx.state === 'running') {
      // iOS 끊김 뒤 'running' 인데 currentTime 이 안 흐를 때가 있다(⚙ '멈춤') → 그때는 멈춘 것과 같게 세고, MAX_TRIES 뒤 다시 만든다
      const r = this.ref;
      if (!r || r.ctx !== ctx) { this.ref = { ctx, ct: ctx.currentTime, at: t }; this.stalled = false; if (!this.paused) this.ran(); return; }
      const dw = (t - r.at) / 1000;
      if (dw < STALL_MIN_S) { if (this.stalled) { this.wakeOnly(); this.silent(); } return; } // 같은 톡의 다음 사건 — 판정은 앞 사건 것
      const dct = ctx.currentTime - r.ct;
      this.ref = { ctx, ct: ctx.currentTime, at: t };
      if (dct >= dw * 0.5) { this.stalled = false; if (!this.paused) this.ran(); return; }
      this.stalled = true;
      if (t - this.lastTry >= SAME_TAP_MS) {
        if (this.tries >= MAX_TRIES && this.recreates < MAX_RECREATE) { this.recreate(type); this.silent(); return; }
        this.tries++;
        this.lastTry = t;
        this.note(`stall@${sec(t)}(${type}) +${dct.toFixed(2)}s/${dw.toFixed(2)}s`);
      }
      this.wakeOnly(); // running 이라 곧바로 풀린다 → ran() 을 부르는 settle 을 붙이지 않는다(시계가 흐르는지로 판정)
      this.silent();
      return;
    }
    // suspended · interrupted(전화·시리·알람·다른 앱 소리·백그라운드) — 같게 다룬다
    const sameTap = t - this.lastTry < SAME_TAP_MS;
    if (!sameTap && this.tries >= MAX_TRIES && this.recreates < MAX_RECREATE) this.recreate(type);
    else this.resumeTry(type, sameTap);
    this.silent();
  }

  // 같은 톡 안의 두 번째 사건(sameTap)은 세지도 적지도 않고 resume 만 다시 부른다(진짜 활성화가 어느 사건인지 엔진마다 다름)
  resumeTry(type, sameTap) {
    const ctx = this.ctx;
    if (!ctx) return;
    let e = this.cur;
    if (!sameTap) {
      this.tries++;
      this.lastTry = nowMs();
      const last = this.log[this.log.length - 1];
      if (last && last === this.cur && last.pending && last.kind === 'resume' && last.type === type) { last.n++; e = last; } // 같은 대기가 이어지면 ×n(풀리면 '(뒤 시도로 풀림)')
      else e = this.cur = this.note(`resume@${sec(this.lastTry)}(${type})`, { kind: 'resume', type, pending: true, t0: this.lastTry });
    }
    let p = null;
    try { p = ctx.resume(); } catch (err) { if (e && !sameTap) { e.pending = false; e.res = `✗${(err && err.name) || err}`; } return; }
    if (e && e.pending) this.settle(e, ctx, p);
    else p?.catch?.(() => {});
  }

  recreate(type) {
    const old = this.ctx;
    this.recreates++;
    this.note(`recreate@${sec(nowMs())}(${type}) ${old.state}`);
    try { old.onstatechange = null; old.close()?.catch?.(() => {}); } catch (e) { /* 이미 닫힘 */ }
    this.ctx = null;
    this.create(type);
  }

  create(type) {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    const t = nowMs();
    if (!AC) { // 잠금 모드(Lockdown Mode)면 WKWebView 에 Web Audio 자체가 없다 → 한 번만 적는다('-' = 한 번도 시도 안 함과 가르게)
      if (!this.noApi) { this.noApi = true; this.note(`noapi@${sec(t)}(${type})`); }
      return;
    }
    let ctx;
    try { ctx = new AC(); } catch (err) { this.note(`new@${sec(t)}(${type})✗${(err && err.name) || err}`); return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.boost();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 생성 직후 state 는 늘 suspended(스펙·WebKit: running 은 나중에 비동기) → 만든 순간 상태는 적지 않고, 바뀔 때마다 적는다
    let lastSt = null;
    ctx.onstatechange = () => {
      if (ctx !== this.ctx || ctx.state === lastSt) return; // 같은 상태가 두 번 오면(엔진마다) 한 번만
      lastSt = ctx.state;
      this.note(`${ctx.state}@${sec(nowMs())}`);
      if (ctx.state === 'running') { this.ran(); this.ref = { ctx, ct: ctx.currentTime, at: nowMs() }; this.stalled = false; } // 멈춤 판정은 running 이 된 때부터
    };
    this.tries = 1;
    this.lastTry = t;
    const e = this.cur = this.note(`new@${sec(t)}(${type})`, { kind: 'new', type, pending: true, t0: t });
    let p = null;
    try { p = ctx.resume(); } catch (err) { /* 옛 webkitAudioContext */ }
    this.settle(e, ctx, p);
    this.watchSession();
    if (!this.samples) this.loadSamples();
  }

  // 1샘플 무음 소스를 destination 에 바로 — WebKit 은 활성화 안의 소스 start 로 렌더링을 시작한다
  silent() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    try {
      if (!this.blank || this.blank.ctx !== ctx) this.blank = { ctx, buf: ctx.createBuffer(1, 1, ctx.sampleRate) };
      const s = ctx.createBufferSource();
      s.buffer = this.blank.buf;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* 다음 활성화에 다시 */ }
  }

  // 앱 수명주기(뒤로 감): 우리가 멈춘다. 돌아오면 unlock('lifecycle') 이 깨운다(WebKit 은 스크립트가 멈춘 컨텍스트를 스스로 안 깨움)
  pause() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    this.paused = true;
    try { ctx.suspend()?.catch?.(() => {}); } catch (e) { /* 소리 없음 */ }
  }

  // 앱(iOS)만: navigator.audioSession 상태(inactive·active·interrupted) 바뀜도 같은 기록에(읽기만 — 웹·아티팩트는 안 건드림)
  watchSession() {
    if (this.sessWatch || !AppAudio.on || !AppAudio.supported) return;
    this.sessWatch = true;
    try {
      const s = navigator.audioSession;
      if (typeof s.addEventListener === 'function') s.addEventListener('statechange', () => { this.note(`session:${s.state}@${sec(nowMs())}`); });
    } catch (e) { /* 없음 */ }
  }

  // ⚙ 표·시험용 한 장면: 상태와 오디오 시계(currentTime 이 실제로 흐르는지 = 진짜 렌더링 중인지)
  snap() {
    const ctx = this.ctx;
    return ctx ? { state: ctx.state, ct: ctx.currentTime, at: nowMs(), ctx } : null;
  }

  // 마이크 켜짐(앱)일 때만 앞단 키움
  boost() {
    if (!this.master) return;
    const v = MASTER * (AppAudio.boosted ? MIC_BOOST : 1);
    try { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); } catch (e) { this.master.gain.value = v; }
  }

  // ⚙ 소리·진동 시험: 게임 소리를 꺼 뒀어도 낸다. 삑 = 짧은 고음(1760Hz, 오실레이터 길), 푸 = 노이즈 소스 길.
  // 깨우지 않는다(unlock 안 부름): [시험] 클릭 때 전역 kick 이 이미 했다. 650ms 뒤 푸에서 다시 만들면 삑·푸가 다른 컨텍스트로 가서 판가름이 틀어진다
  testBeep() {
    if (!this.ctx) return false;
    const m = this.muted; this.muted = false;
    this.tone(1760, 0.16, 'sine', 0.22);
    this.muted = m;
    return true;
  }
  testPuff() {
    if (!this.ctx) return false;
    const m = this.muted; this.muted = false;
    this.puff(0.9, 0.9);
    this.muted = m;
    return true;
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
    const ctx = this.ctx; // 다시 만들기(recreate) 뒤에도 이 핸들은 자기 컨텍스트만 만진다 — 닫힌 컨텍스트면 조용히 무시
    const safe = (f) => { try { f(); } catch (e) { /* 닫힌 컨텍스트 */ } };
    return {
      set: (p) => {
        if (held) return;
        safe(() => {
          bp.frequency.setTargetAtTime(500 + p * 1400, ctx.currentTime, 0.05);
          g.gain.setTargetAtTime(0.03 + p * 0.09, ctx.currentTime, 0.05);
        });
      },
      // 숨 주머니 꽉: 들숨 소리가 뚝 끊김 (더 안 들어감)
      hold: () => { held = true; safe(() => g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.015)); },
      resume: () => { held = false; },
      stop: () => safe(() => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        src.stop(ctx.currentTime + 0.2);
      }),
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

  // 빌드에 넣은 샘플(데이터 URL) → AudioBuffer + 소리 시작점(생성 샘플·mp3 앞 무음 수십 ms 를 건너뜀). 없거나 디코딩 실패면 false (합성으로)
  playSample(name, rate = 1, vol = 1, ratio = 1) {
    const list = this.samples?.[name];
    if (!list || !list.length) return false;
    const { buf, off } = list[Math.floor(Math.random() * list.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (ratio > 1.05 ? 1.08 : ratio < 0.7 ? 1.12 : 1);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime, off); // 앞 무음을 건너뛰어 놓는 순간 바로 '푸'
    return true;
  }
  async loadSamples() {
    const src = (typeof window !== 'undefined' && window.__PUFF_SFX__) || null;
    if (!src || !this.ctx) return;
    this.samples = {};
    for (const [name, urls] of Object.entries(src)) {
      this.samples[name] = [];
      for (const u of urls) {
        try { const ab = await (await fetch(u)).arrayBuffer(); const buf = await this.ctx.decodeAudioData(ab); this.samples[name].push({ buf, off: onsetOf(buf) }); } catch (e) { /* 합성으로 */ }
      }
    }
  }


  // 실험 '공기 앞머리 연출'(06 §8.10 · BLOCKERS G12, feel.airFx)에서만: 바람이 더미에 닿는 '퍽'.
  // 입의 '푸'(숨 시작)와 다른 자리·다른 때(물리 도달 스텝) — 짧은 저역 숨 덩어리(높은 '탁' 성분 없음, 재윤님 6차 '탁이 아니라')
  airHit(power = 1) {
    if (!this.ok) return;
    const t0 = this.ctx.currentTime;
    const src = this.noise(0.12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, t0);
    lp.frequency.exponentialRampToValueAtTime(240, t0 + 0.1);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.004, 0.08 + 0.12 * Math.min(1.2, power), 0.09);
    src.connect(lp).connect(g).connect(this.master);
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

// 샘플의 소리 시작점(초): 최대 진폭의 6% 를 처음 넘는 곳에서 3ms 앞
export function onsetOf(buf) {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (!peak) return 0;
  const th = peak * 0.06;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) return Math.max(0, i / buf.sampleRate - 0.003);
  return 0;
}

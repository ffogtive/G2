// diag.js — ⚙(손맛 튜닝) 안 '소리·진동 시험'. 실기기에서 '푸'·진동이 안 올 때 어느 길에서 끊기는지 화면 캡처 한 장으로 가른다.
// 순서: ① 삑(1760Hz 짧은 고음, 오실레이터 길) → ② 푸(노이즈 소스 길) → ③ 진동
//   앱: ③-1 게임 길(navigator.vibrate → 다리 → Dart → Swift 뷰에 붙인 생성기) · ③-2 Flutter 엔진 길(HapticFeedback) · ③-3 Core Haptics, 0.7초 간격
//   웹: navigator.vibrate 한 번(없으면 '이 기기 미지원')
// 판가름(무음 모드를 켠 채로, 마이크는 반드시 끈 채로 먼저): '무음 모드에서도 소리' 끔(auto → Ambient)에서 삑이 안 들리고 켬(playback)에서 들리면
//   원인 A(무음 모드) 확정 + 고침 확인. 마이크를 켜면 WebKit 이 PlayAndRecord(무음 무시)라 이 비교가 안 된다 → 마이크 켬 동안 그 단추는 잠근다.
//   마이크 켬에서 삑이 작으면 VideoChat 재생 레벨 / 삑은 들리는데 푸만 안 들리면 노이즈 길 / 진동이 마이크 켬에서만 안 오면 녹음 중 햅틱 억제
// 앱 쪽 줄(세션·출력·음량·다른 소리)은 Flutter 프로세스 세션 값이다(웹뷰 소리는 WebKit 프로세스 세션) → 참고로만
//
// 🧭 가설 수정(BLOCKERS G4, 미검증): 게임 진동은 운반이 아니라 '재생'에서 사라진다. 1순위 = UIKit 생성기 길(③-1 과 옛 게임 진동)이 기기에서 조용히 무시됨,
//   2순위 = 같은 틱 소리·연속 요청에 눌림. → (1) '게임 진동 기록' 줄(판 안 진동마다 경로·응답 ms·±60 ms 안 소리) (2) ④ 게임처럼(단계마다 O/X)
//   (3) iOS 게임 진동 기본 길 = Core Haptics(다리 'g:auto', 실패하면 생성기 → 엔진) + '게임 진동 길' 단추(Core / 생성기 / 끔).
//   ④ 읽는 법: ④-c X · ④-d O → UIKit 길 무시(1순위 확정, Core 기본 길로 고쳐짐) · ④-a O · ④-b X → 소리와 겹칠 때 억제 ·
//   ④-a O · ④-c 일부만 → 연속 요청 버려짐 · 넷 다 X → 시스템 수준 억제(녹화·손쉬운 사용 진동 끔) → 재윤님께 물을 것(G4)
import { AppAudio } from './audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {HTMLElement} box   붙일 곳(튜닝 창 #tuneRows)
 * @param {{ sfx: import('./audio.js').Sfx, t: (k: string) => string, micOn: () => boolean, micCtx?: () => (string|null), toggleMic: () => Promise<void>, setSilentPlay: (v: boolean) => void }} deps
 */
export function mountSoundTest(box, deps) {
  const { sfx, t, micOn, micCtx, toggleMic, setSilentPlay } = deps;
  const app = typeof window !== 'undefined' ? window.__puffApp : null;
  const silentBtn = !!app && AppAudio.supported; // 세션을 바꿀 수 있을 때만(안드로이드 앱·웹엔 없음)
  const wrap = document.createElement('div');
  wrap.className = 'diag';
  wrap.innerHTML = `<div class="trow"><span>${esc(t('diagTitle'))}</span><button class="btn blue" type="button" id="diagGo">${esc(t('diagGo'))}</button></div>`
    + `<p class="diag-how">${esc(t(app ? 'diagHow' : 'diagHowWeb'))}</p>`
    + `<div class="diag-btns"><button type="button" id="diagMic"></button>${silentBtn ? '<button type="button" id="diagSilent"></button>' : ''}${app ? '<button type="button" id="diagRoute"></button><button type="button" id="diag4Go"></button>' : ''}</div>`
    + '<div class="diag-step" id="diagStep"></div><div id="diag4Big" class="diag-big" hidden></div><div id="diag4"></div><div id="diagOut"></div>';
  box.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  let res = null, busy = false;

  const yes = () => t('diagYes'), no = () => t('diagNo');
  const ackText = (a) => (a ? `${a.ok ? 'OK' : t('diagFail')} · ${a.path || '?'}${a.ms != null ? ` · ${a.ms}ms` : ''}${a.err ? ` · ${a.err}` : ''}` : t('diagNoAck'));
  const s1 = (ms) => `${(ms / 1000).toFixed(1)}s`;
  // 컨텍스트 없음: Web Audio 자체가 없으면(잠금 모드) '없음', 아니면 아직 안 만듦(만들기 실패는 기록 줄에 new✗)
  const noCtx = () => t(sfx.noApi ? 'diagNoCtx' : 'diagNotYet');
  const snapText = (s) => (s ? `${s.state} ${s.ct.toFixed(2)}s` : noCtx());
  // 두 장면 사이 오디오 시계가 흘렀나(currentTime 증가 ≥ 벽시계의 절반 = 진짜 렌더링 중). 'running' 표시만으로는 모른다
  const flow = (a, b) => {
    if (!a || !b || a.ctx !== b.ctx) return '';
    const dct = b.ct - a.ct, dw = (b.at - a.at) / 1000;
    if (dw < 0.2) return '';
    return `${dct >= dw * 0.5 ? t('diagFlow') : t('diagStall')} +${dct.toFixed(2)}s/${dw.toFixed(2)}s`;
  };
  let prevSnap = null, clock = '';
  const routeName = (r) => t(r === 'view' ? 'diagRouteView' : r === 'off' ? 'diagRouteOff' : 'diagRouteCore');
  // 이 진동 앞뒤 ±60 ms 안에 시작한 게임 소리(audio.js recent) — 가장 가까운 것
  const soundNear = (at) => {
    let best = null;
    for (const s of sfx.recent || []) { const d = s.at - at; if (Math.abs(d) <= 60 && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, name: s.name }; }
    return best ? `${t('diagSoundAt')} ${best.name} ${best.d >= 0 ? '+' : ''}${Math.round(best.d)}ms` : t('diagNoSound');
  };
  const gameLine = (g) => `${((g.at - performance.now()) / 1000).toFixed(1)}${t('diagSec')} · ${g.payload} · ${g.path ?? (g.ms == null ? t('diagNoAck') : '?')}${g.ms != null ? ` · ${g.ms}ms` : ''}${g.ok === false ? ` · ${t('diagFail')}` : ''} · ${soundNear(g.at)}`;
  function rows() {
    const ctx = sfx.ctx;
    const r = [];
    r.push([t('diagEnv'), `${app ? t('diagApp') : t('diagWeb')} · html.native ${document.documentElement.classList.contains('native') ? yes() : no()}`]);
    r.push(['AudioContext', `${ctx ? `${ctx.state} · ${ctx.sampleRate}Hz` : noCtx()} · ${t('diagSound')} ${sfx.muted ? t('diagOff') : t('diagOn')}`]);
    // 표는 0.5초마다 다시 그린다 → 이 줄의 '지금'이 표를 그린 시각(아래 기록의 @초와 같은 기준)
    r.push([t('diagClock'), `${ctx ? `ct ${ctx.currentTime.toFixed(2)}s${clock ? ` · ${clock}` : ''}` : '-'} · ${t('diagNow')} ${s1(performance.now())}`]);
    r.push([t('diagCtxLog'), sfx.states.join(' › ') || '-']);
    let sessState = '';
    try { const st = navigator.audioSession?.state; if (st) sessState = ` · state=${st}`; } catch (e) { /* 없음 */ }
    r.push(['audioSession', AppAudio.supported ? `${yes()} · type=${AppAudio.type()}${sessState}${app ? ` (${t('diagWant')} ${AppAudio.want()})` : ''}${AppAudio.err ? ` · ${AppAudio.err}` : ''}` : t('diagUnsupported')]);
    const ex = AppAudio.expect();
    if (ex) r.push([t('diagExpect'), t('diagEx_' + ex)]);
    // 마이크용 AudioContext(mic.js, 두 번째) 상태: suspended 면 분석기가 0 만 읽어 불기 인식이 안 된다
    const mc = micOn() && micCtx ? micCtx() : null;
    r.push([t('diagMic'), (micOn() ? t('diagMicOn') : t('diagMicOff')) + (mc ? ` · AudioContext ${mc}` : '') + (AppAudio.boosted ? ` · ${t('diagBoost')}` : '')]);
    // 시험 전 → 삑 뒤 → 푸 뒤: 상태와 오디오 시계. 끝까지 suspended·시계 멈춤이면 소리가 안 난 것(삑·푸는 시계가 흘러야 들린다).
    // 컨텍스트가 없어도(잠금 모드) 줄을 남긴다 = 소리를 못 냈다는 기록. s1·s2 는 찍기 전이면 '…'
    const sn = (k) => (k in res ? snapText(res[k]) : '…');
    if (res) r.push([t('diagBeepPuff'), `${sn('s0')} → ${sn('s1')} → ${sn('s2')}${'s2' in res ? ` (${flow(res.s0, res.s2) || '-'})` : ''}`]);
    if (app) {
      r.push([t('diagChannel'), `${app.channelName() || t('diagNone')} · ${t('diagSentAck')} ${app.sent} / ${app.acks}${app.drops ? ` · ${t('diagDrops')} ${app.drops}` : ''}${app.err ? ` · ${app.err}` : ''}`]);
      if (res) {
        r.push([t('diagVib1'), ackText(res.v1)]);
        r.push([t('diagVib2'), ackText(res.v2)]);
        r.push([t('diagVib3'), ackText(res.v3)]);
        const i = res.info;
        if (!i) r.push([t('diagAppSess'), t('diagNoAck')]);
        else if (i.category != null) {
          r.push([t('diagAppSess'), `${i.category} / ${i.mode}`]);
          r.push([t('diagRoute'), `${i.route || '-'} · ${t('diagVol')} ${Math.round((+i.volume || 0) * 100)}%`]);
          r.push([t('diagHapRec'), i.hapticsRec ? yes() : no()]);
          r.push([t('diagOther'), i.otherAudio ? yes() : no()]);
          r.push([t('diagHw'), `${t('diagHaptics')} ${i.supportsHaptics ? yes() : no()} · ${t('diagLowPower')} ${i.lowPower ? yes() : no()} · iOS ${i.ios}`]);
        } else r.push([t('diagAppSess'), `${i.platform || '?'}${i.diag ? ` · ${i.diag}` : ''}`]);
      }
    } else if (res) {
      r.push([t('diagVib'), res.webVib == null ? t('diagNoVib') : `navigator.vibrate → ${res.webVib}`]);
    }
    // 게임 진동 기록(앱 전용): 판 안 진동마다 '−3.2초 · 49 · core · 21ms · 소리 puff +3ms'(앞뒤 ±60 ms 안에 시작한 소리가 없으면 '소리 없음')
    if (app) {
      r.push([t('diagGameRoute'), routeName(app.route ? app.route() : 'core')]);
      const gl = (app.games || []).slice().reverse();
      if (!gl.length) r.push([t('diagGameLog'), t('diagGameNone')]);
      gl.forEach((g, i) => r.push([i ? '' : t('diagGameLog'), gameLine(g)]));
    } else r.push([t('diagGameLog'), t('diagAppOnly')]);
    if (res?.err) r.push(['error', res.err]);
    if (res) r.push([t('diagAt'), res.at]);
    return r;
  }
  function render() {
    $('#diagMic').textContent = `${t('diagMic')}: ${micOn() ? t('diagMicOn') : t('diagMicOff')}`;
    if (silentBtn) {
      const b = $('#diagSilent');
      b.disabled = micOn(); // 마이크 켬 = 늘 'auto'(PlayAndRecord) → 이 단추는 아무것도 안 바꾼다
      b.textContent = `${t('diagSilent')}: ${AppAudio.silentPlay ? t('diagOn') : t('diagOff')}${b.disabled ? ` (${t('diagMicLock')})` : ''}`;
    }
    if (app) {
      $('#diagRoute').textContent = `${t('diagGameRoute')}: ${routeName(app.route ? app.route() : 'core')}`;
      $('#diag4Go').textContent = t('diag4Go');
      $('#diag4Go').disabled = busy;
      render4();
    }
    const s = sfx.snap();
    if (s && prevSnap && s.ctx === prevSnap.ctx && (s.at - prevSnap.at) >= 400) { clock = flow(prevSnap, s); prevSnap = s; }
    else if (!s || !prevSnap || s.ctx !== prevSnap.ctx) { clock = ''; prevSnap = s; }
    const r = rows();
    $('#diagOut').innerHTML = `<table class="diag-tab"><tbody>${r.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    window.__puffDiagLast = { rows: r, res, done: !!res && !busy, four: four && four.map((x) => ({ k: x.k, path: x.path, ans: x.ans || null })), fourDone: !!four && !busy4 };
  }
  // ⚙ 를 연 그 순간에 굳은 표가 아니라 지금 상태를 보이게: 창이 열려 있는 동안 0.5초마다 다시 그린다(닫히면 건너뜀, 떼어지면 멈춤)
  const timer = setInterval(() => {
    if (!wrap.isConnected) { clearInterval(timer); return; }
    if (wrap.closest('[hidden]')) return;
    render();
  }, 500);
  const step = (s) => { $('#diagStep').textContent = s; };
  // 게임 길(navigator.vibrate)은 id 가 없다 → 응답 수가 늘 때까지 기다림
  async function ackAfter(n0, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (app.acks > n0) return { ...app.last, ms: Math.round(performance.now() - t0) };
      await wait(25);
    }
    return null;
  }
  async function timed(p) {
    const t0 = performance.now();
    const a = await p;
    return a ? { ...a, ms: Math.round(performance.now() - t0) } : null;
  }

  async function run() {
    if (busy) return;
    busy = true;
    $('#diagGo').disabled = true;
    res = { at: new Date().toLocaleTimeString(), s0: sfx.snap() }; // 시험 전(이 클릭에서 전역 kick 이 깨우기를 막 요청한 직후 — 결과는 비동기라 아직 반영 전)
    try { wrap.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* 스크롤 없음 */ } // 표가 한 화면에 들어오게(캡처 한 장)
    try {
      // 삑·푸는 소리만 낸다(깨우지 않음 — 650ms 뒤 푸에서 다시 만들면 삑·푸가 다른 컨텍스트로 간다). 깨우기는 이 클릭의 전역 kick 이 했다
      step(t('diagBeep')); res.beep = sfx.testBeep(); await wait(650); res.s1 = sfx.snap();
      step(t('diagPuff')); res.puff = sfx.testPuff(); await wait(1000); res.s2 = sfx.snap();
      if (app) {
        step(t('diagVib1')); const n0 = app.acks; navigator.vibrate(50); res.v1 = await ackAfter(n0, 1500); await wait(700);
        step(t('diagVib2')); res.v2 = await timed(app.request('d:engine:heavy')); await wait(700);
        step(t('diagVib3')); res.v3 = await timed(app.request('d:core:fireStrong'));
        res.info = (await app.request('i', 2500))?.info || null;
      } else {
        step(t('diagVib'));
        if (typeof navigator.vibrate === 'function') { try { res.webVib = String(navigator.vibrate(50)); } catch (e) { res.webVib = String((e && e.name) || e); } } else res.webVib = null;
      }
    } catch (e) {
      res.err = String((e && e.message) || e); // 시험 자체가 멈춘 곳도 표에 남긴다
    } finally {
      busy = false;
      $('#diagGo').disabled = false;
      step(t('diagDone'));
      render();
      try { $('#diagStep').scrollIntoView({ block: 'start' }); } catch (e) { /* 스크롤 없음 */ } // 끝 안내 + 표가 한 화면에(캡처 한 장)
    }
  }

  // ④ 게임처럼: 단계마다 큰 글씨 '④-a 지금!' → 1.5초 쉼. 줄마다 [O 느낌] [X 없음] — 캡처 한 장으로 판가름. 응답은 id 로 짝지어 길·ms
  let four = null, busy4 = false;
  const loud = (f) => { const m = sfx.muted; sfx.muted = false; try { f(); } catch (e) { /* 소리 없음 */ } finally { sfx.muted = m; } };
  const fireD = (spec, row) => { const t0 = performance.now(); const p = app.request('d:' + spec, 1500).then((a) => { row.acks.push(a ? `${a.path || '?'} ${Math.round(performance.now() - t0)}ms` : t('diagNoAck')); }); row.sent.push(spec); return p; };
  function render4() {
    const box = $('#diag4');
    if (!four) { if (box.innerHTML) box.innerHTML = ''; return; }
    const html = `<table class="diag-tab"><tbody>${four.map((x, i) => `<tr><td>${esc(t('diag4_' + x.k))}</td><td>${esc(x.sent.length ? `${x.route} → ${x.acks.join(' · ') || '…'}` : '…')}`
      + `<div class="diag-ox"><button type="button" data-i="${i}" data-a="O" class="${x.ans === 'O' ? 'on' : ''}">${esc(t('diagO'))}</button><button type="button" data-i="${i}" data-a="X" class="${x.ans === 'X' ? 'on' : ''}">${esc(t('diagX'))}</button></div></td></tr>`).join('')}</tbody></table>`;
    if (box._html === html) return;
    box._html = html;
    box.innerHTML = html;
    box.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => { const x = four[+b.dataset.i]; if (x) { x.ans = b.dataset.a; render(); } }));
  }
  async function run4() {
    if (busy || busy4 || !app) return;
    busy4 = true;
    four = ['a', 'b', 'c', 'd'].map((k) => ({ k, route: k === 'd' ? 'core' : 'native', sent: [], acks: [], ans: null }));
    render();
    const big = $('#diag4Big');
    const now = async (x) => { big.textContent = `${t('diag4_' + x.k).split(' ')[0]} ${t('diag4Now')}`; big.hidden = false; await wait(350); };
    try {
      const [a, b, c, d] = four;
      await now(a); fireD('native:heavy', a); await wait(900); big.hidden = true; await wait(1500);
      await now(b); loud(() => sfx.puff(0.9, 0.9)); fireD('native:heavy', b); await wait(900); big.hidden = true; await wait(1500);
      // ④-c 게임 순서 그대로(생성기 길): 꽉 '읍' + 중간 → 600 ms → '푸' + 강 → 150 ms → [뒤집힘 + 약] × 3, 120 ms 간격
      const seqRun = async (x, cue) => {
        await now(x);
        loud(() => sfx.cork()); fireD(cue.medium, x); await wait(600);
        loud(() => sfx.puff(0.9, 0.9)); fireD(cue.heavy, x); await wait(150);
        for (let i = 0; i < 3; i++) { loud(() => sfx.flip(i)); fireD(cue.light, x); await wait(120); }
        await wait(700); big.hidden = true;
      };
      await seqRun(c, { medium: 'native:medium', heavy: 'native:heavy', light: 'native:light' });
      await wait(1500);
      await seqRun(d, { medium: 'core:tapMedium', heavy: 'core:tapHeavy', light: 'core:tapLight' }); // ④-d 같은 소리·시각, Core Haptics 로
      await wait(800);
    } catch (e) {
      if (res) res.err = String((e && e.message) || e);
    } finally {
      busy4 = false; big.hidden = true;
      step(t('diag4Done'));
      render();
    }
  }
  if (app) {
    $('#diagRoute').addEventListener('click', () => { const r = app.route ? app.route() : 'core'; app.setRoute?.(r === 'core' ? 'view' : r === 'view' ? 'off' : 'core'); render(); });
    $('#diag4Go').addEventListener('click', run4);
  }
  $('#diagGo').addEventListener('click', run);
  $('#diagMic').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { await toggleMic(); } finally { busy = false; render(); }
  });
  if (silentBtn) $('#diagSilent').addEventListener('click', () => { if (busy || micOn()) return; setSilentPlay(!AppAudio.silentPlay); sfx.unlock(); render(); });
  render();
}

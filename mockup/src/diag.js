// diag.js — ⚙(손맛 튜닝) 안 '소리·진동 시험'. 실기기에서 '푸'·진동이 안 올 때 어느 길에서 끊기는지 화면 캡처 한 장으로 가른다.
// 순서: ① 삑(1760Hz 짧은 고음, 오실레이터 길) → ② 푸(노이즈 소스 길) → ③ 진동
//   앱: ③-1 게임 길(navigator.vibrate → 다리 → Dart → Swift 뷰에 붙인 생성기) · ③-2 Flutter 엔진 길(HapticFeedback) · ③-3 Core Haptics, 0.7초 간격
//   웹: navigator.vibrate 한 번(없으면 '이 기기 미지원')
// 판가름(무음 모드를 켠 채로, 마이크는 반드시 끈 채로 먼저): '무음 모드에서도 소리' 끔(auto → Ambient)에서 삑이 안 들리고 켬(playback)에서 들리면
//   원인 A(무음 모드) 확정 + 고침 확인. 마이크를 켜면 WebKit 이 PlayAndRecord(무음 무시)라 이 비교가 안 된다 → 마이크 켬 동안 그 단추는 잠근다.
//   마이크 켬에서 삑이 작으면 VideoChat 재생 레벨 / 삑은 들리는데 푸만 안 들리면 노이즈 길 / 진동이 마이크 켬에서만 안 오면 녹음 중 햅틱 억제
// 앱 쪽 줄(세션·출력·음량·다른 소리)은 Flutter 프로세스 세션 값이다(웹뷰 소리는 WebKit 프로세스 세션) → 참고로만
import { AppAudio } from './audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {HTMLElement} box   붙일 곳(튜닝 창 #tuneRows)
 * @param {{ sfx: import('./audio.js').Sfx, t: (k: string) => string, micOn: () => boolean, toggleMic: () => Promise<void>, setSilentPlay: (v: boolean) => void }} deps
 */
export function mountSoundTest(box, deps) {
  const { sfx, t, micOn, toggleMic, setSilentPlay } = deps;
  const app = typeof window !== 'undefined' ? window.__puffApp : null;
  const silentBtn = !!app && AppAudio.supported; // 세션을 바꿀 수 있을 때만(안드로이드 앱·웹엔 없음)
  const wrap = document.createElement('div');
  wrap.className = 'diag';
  wrap.innerHTML = `<div class="trow"><span>${esc(t('diagTitle'))}</span><button class="btn blue" type="button" id="diagGo">${esc(t('diagGo'))}</button></div>`
    + `<p class="diag-how">${esc(t(app ? 'diagHow' : 'diagHowWeb'))}</p>`
    + `<div class="diag-btns"><button type="button" id="diagMic"></button>${silentBtn ? '<button type="button" id="diagSilent"></button>' : ''}</div>`
    + '<div class="diag-step" id="diagStep"></div><div id="diagOut"></div>';
  box.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  let res = null, busy = false;

  const yes = () => t('diagYes'), no = () => t('diagNo');
  const ackText = (a) => (a ? `${a.ok ? 'OK' : t('diagFail')} · ${a.path || '?'}${a.ms != null ? ` · ${a.ms}ms` : ''}${a.err ? ` · ${a.err}` : ''}` : t('diagNoAck'));
  function rows() {
    const ctx = sfx.ctx;
    const r = [];
    r.push([t('diagEnv'), `${app ? t('diagApp') : t('diagWeb')} · html.native ${document.documentElement.classList.contains('native') ? yes() : no()}`]);
    r.push(['AudioContext', `${ctx ? `${ctx.state} · ${ctx.sampleRate}Hz` : t('diagNoCtx')} · ${t('diagSound')} ${sfx.muted ? t('diagOff') : t('diagOn')}`]);
    r.push([t('diagCtxLog'), sfx.states.join(' → ') || '-']);
    r.push(['audioSession', AppAudio.supported ? `${yes()} · type=${AppAudio.type()}${app ? ` (${t('diagWant')} ${AppAudio.want()})` : ''}${AppAudio.err ? ` · ${AppAudio.err}` : ''}` : t('diagUnsupported')]);
    const ex = AppAudio.expect();
    if (ex) r.push([t('diagExpect'), t('diagEx_' + ex)]);
    r.push([t('diagMic'), (micOn() ? t('diagMicOn') : t('diagMicOff')) + (AppAudio.boosted ? ` · ${t('diagBoost')}` : '')]);
    if (res) r.push([`${t('diagBeep')} · ${t('diagPuff')}`, `${res.beep ? t('diagPlayed') : t('diagNoCtx')} · ${res.puff ? t('diagPlayed') : t('diagNoCtx')}`]);
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
    const r = rows();
    $('#diagOut').innerHTML = `<table class="diag-tab"><tbody>${r.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    window.__puffDiagLast = { rows: r, res, done: !!res && !busy };
  }
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
    res = { at: new Date().toLocaleTimeString() };
    try { wrap.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* 스크롤 없음 */ } // 표가 한 화면에 들어오게(캡처 한 장)
    try {
      step(t('diagBeep')); res.beep = sfx.testBeep(); await wait(650);
      step(t('diagPuff')); res.puff = sfx.testPuff(); await wait(1000);
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

  $('#diagGo').addEventListener('click', run);
  $('#diagMic').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { await toggleMic(); } finally { busy = false; render(); }
  });
  if (silentBtn) $('#diagSilent').addEventListener('click', () => { if (busy || micOn()) return; setSilentPlay(!AppAudio.silentPlay); sfx.unlock(); render(); });
  render();
}

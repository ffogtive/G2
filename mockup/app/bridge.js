// bridge.js — 앱(Flutter) 빌드에만 들어가는 다리 코드. 웹·아티팩트 빌드에는 안 들어간다(tools/app-www.mjs 가 따로 넣음).
// iOS 웹뷰에는 navigator.vibrate 가 없다 → 게임의 진동 호출을 Flutter 채널(PuffHaptic)로 보내 앱 햅틱으로.
// window.__puffApp = 앱 표시 + 진동 길 진단: Dart(app/lib/haptics.dart)가 메시지를 받을 때마다 ack() 로 되돌려 준다 → ⚙ '소리·진동 시험'이 보여 준다.
// 게임(mockup/src/audio.js AppAudio)은 window.__puffApp 이 있을 때만 iOS 소리 세션(navigator.audioSession)을 바꾼다.
//
// 🧭 가설(미검증, BLOCKERS G4 '가설 수정'): 게임 진동 메시지는 Swift 까지 가고 응답도 돌아온다(확인됨: 응답 57 → 66). 사라지는 곳은 '재생'이다 —
//   UIKit 생성기 길이 기기에서 조용히 무시되거나(1순위), 같은 틱 소리·연속 요청에 눌린다(2순위). 응답 'OK'는 API 가 돌아왔다는 뜻일 뿐 몸에 느껴졌다는 증거가 아니다.
//   → 게임 진동마다 id 를 붙여 기록(app.games, ⚙ '게임 진동 기록' 줄: 경로·응답 ms·±60 ms 안 소리)하고, iOS 기본 길을 Core Haptics 로(Dart 가 실패하면 생성기 → 엔진).
// 게임 진동 메시지: 'g:<route>:<id>:<payload>'  route = auto(iOS Core Haptics 먼저) | view(옛 생성기 길), id = 'g' + 순번, payload = '49' 또는 'p:40,60,40'
//   (payload 에 ':' 가 있으므로 Dart 는 앞 세 칸만 자르고 나머지를 이어 붙인다)
// 진동 길 스위치: localStorage 'puff.hapRoute' = core(기본) | view | off(보내지 않고 기록만 'off') — ⚙ 소리·진동 시험의 '게임 진동 길' 단추
// 예열 'w:<id>': 판 화면에서 누를 때 마지막 예열이 20초 이상 지났으면 한 번(CHHapticEngine 자동 꺼짐 뒤 첫 진동이 늦지 않게). 게임 기록에는 안 넣는다
(function () {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const app = (window.__puffApp = { sent: 0, acks: 0, drops: 0, last: null, err: null, games: [] });
  // webview_flutter_wkwebview 는 window.PuffHaptic 을 문서 시작 스크립트로 만든다. 그 등록이 문서 시작보다 늦으면(경쟁) 비어 있다
  // → 메시지 핸들러(webkit.messageHandlers)로 직접 보낸다. 핸들러는 등록되는 즉시 열린 페이지에서도 보인다.
  const channel = () => window.PuffHaptic || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.PuffHaptic) || null;
  app.channelName = () => (window.PuffHaptic ? 'PuffHaptic' : channel() ? 'messageHandlers' : null);
  app.send = (msg) => {
    const c = channel();
    if (!c) { app.drops++; return false; }
    try { c.postMessage(msg); app.sent++; return true; } catch (e) { app.drops++; app.err = String((e && e.message) || e); return false; }
  };
  const ROUTES = ['core', 'view', 'off'];
  app.route = () => { try { const v = localStorage.getItem('puff.hapRoute'); return ROUTES.indexOf(v) >= 0 ? v : 'core'; } catch (e) { return 'core'; } };
  app.setRoute = (v) => { if (ROUTES.indexOf(v) < 0) v = 'core'; try { localStorage.setItem('puff.hapRoute', v); } catch (e) { /* 저장 안 됨 */ } return v; };
  const waits = new Map();
  app.ack = (a) => {
    app.acks++;
    app.last = a;
    const id = a && a.id != null ? String(a.id) : null;
    if (id && id.charAt(0) === 'g') { // 게임 진동 응답 → 기록 줄에 길·성공·응답 ms
      for (const g of app.games) if (g.id === id) { g.path = a.path != null ? a.path : null; g.ok = a.ok != null ? a.ok : null; g.ms = Math.round(now() - g.at); if (a.err) g.err = a.err; }
    }
    const w = id && waits.get(id);
    if (w) { waits.delete(id); w(a); }
  };
  let seq = 0, gseq = 0, wseq = 0;
  // 응답을 기다리는 진단 메시지: request('d:engine:heavy') → 'd:engine:heavy:<id>', request('i') → 'i:<id>'. 시간 안에 응답이 없으면 null
  app.request = (prefix, ms) => new Promise((res) => {
    const id = String(++seq);
    const tmr = setTimeout(() => { waits.delete(id); res(null); }, ms || 1500);
    waits.set(id, (a) => { clearTimeout(tmr); res(a); });
    if (!app.send(prefix + ':' + id)) { clearTimeout(tmr); waits.delete(id); res(null); }
  });
  const vibrate = (p) => {
    const payload = Array.isArray(p) ? 'p:' + p.join(',') : String(+p || 0);
    const route = app.route();
    const id = 'g' + ++gseq;
    const rec = { id, at: now(), payload, route, path: null, ms: null, ok: null };
    app.games.push(rec);
    if (app.games.length > 12) app.games.shift();
    if (route === 'off') { rec.path = 'off'; rec.ok = true; rec.ms = 0; return true; }
    if (!app.send('g:' + (route === 'view' ? 'view' : 'auto') + ':' + id + ':' + payload)) { rec.path = 'drop'; rec.ok = false; }
    return true;
  };
  try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch (e) { navigator.vibrate = vibrate; }
  let lastWarm = -1e9;
  window.addEventListener('pointerdown', () => {
    const hud = document.getElementById('hud');
    if (!hud || hud.hidden || app.route() === 'off') return;
    const t = now();
    if (t - lastWarm < 20000) return;
    lastWarm = t;
    app.send('w:w' + ++wseq);
  }, { capture: true, passive: true });
  document.documentElement.classList.add('native');
  // 길게 누르기 메뉴·글자 선택·화면 튕김 막기(게임 화면)
  const st = document.createElement('style');
  st.textContent = 'html.native, html.native body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; overscroll-behavior: none; }';
  (document.head || document.documentElement).appendChild(st);
})();

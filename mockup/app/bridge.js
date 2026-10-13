// bridge.js — 앱(Flutter) 빌드에만 들어가는 다리 코드. 웹·아티팩트 빌드에는 안 들어간다(tools/app-www.mjs 가 따로 넣음).
// iOS 웹뷰에는 navigator.vibrate 가 없다 → 게임의 진동 호출을 Flutter 채널(PuffHaptic)로 보내 탭틱 햅틱으로.
(function () {
  const send = (msg) => { try { window.PuffHaptic?.postMessage(msg); } catch (e) { /* 채널 없음 */ } };
  const vibrate = (p) => {
    if (Array.isArray(p)) send('p:' + p.join(','));
    else send(String(+p || 0));
    return true;
  };
  try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch (e) { navigator.vibrate = vibrate; }
  document.documentElement.classList.add('native');
  // 길게 누르기 메뉴·글자 선택·화면 튕김 막기(게임 화면)
  const st = document.createElement('style');
  st.textContent = 'html.native, html.native body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; overscroll-behavior: none; }';
  (document.head || document.documentElement).appendChild(st);
})();

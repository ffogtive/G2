// native.js — 앱(Capacitor) 빌드에만 들어가는 접착 코드. 웹·아티팩트 빌드에는 안 들어간다(tools/app-www.mjs 가 따로 묶어 넣음).
// iOS 웹뷰에는 navigator.vibrate 가 없다 → 게임 코드의 navigator.vibrate(ms|패턴)를 햅틱으로 바꿔 준다.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

if (Capacitor.isNativePlatform()) {
  const vibrate = (p) => {
    try {
      if (Array.isArray(p)) {
        if (p.length >= 3) Haptics.notification({ type: NotificationType.Warning }); // 콜록 같은 패턴
        else Haptics.impact({ style: ImpactStyle.Medium });
      } else {
        const ms = +p || 0;
        if (ms <= 0) return true;
        Haptics.impact({ style: ms <= 15 ? ImpactStyle.Light : ms <= 32 ? ImpactStyle.Medium : ImpactStyle.Heavy });
      }
    } catch (e) { /* 햅틱 없음 */ }
    return true;
  };
  try { Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true }); } catch (e) { navigator.vibrate = vibrate; }
  document.documentElement.classList.add('native');
  // 길게 누르기 메뉴·글자 선택·확대 막기(게임 화면)
  const st = document.createElement('style');
  st.textContent = 'html.native, html.native body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; overscroll-behavior: none; }';
  document.head.appendChild(st);
}

// 웹 게임의 진동 호출을 앱 햅틱으로. iOS 웹뷰에는 navigator.vibrate 가 없어서 다리 코드가 이 채널로 보낸다.
import 'package:flutter/services.dart';

enum HapticKind { none, light, medium, heavy, pattern }

/// 다리 코드가 보내는 문자열: 밀리초 숫자("25") 또는 패턴("p:40,60,40")
HapticKind parseHaptic(String msg) {
  if (msg.startsWith('p:')) return HapticKind.pattern;
  final ms = double.tryParse(msg) ?? 0;
  if (ms <= 0) return HapticKind.none;
  if (ms <= 15) return HapticKind.light;
  if (ms <= 32) return HapticKind.medium;
  return HapticKind.heavy;
}

Future<void> playHaptic(HapticKind k) async {
  switch (k) {
    case HapticKind.none:
      return;
    case HapticKind.light:
      return HapticFeedback.lightImpact();
    case HapticKind.medium:
      return HapticFeedback.mediumImpact();
    case HapticKind.heavy:
      return HapticFeedback.heavyImpact();
    case HapticKind.pattern: // 콜록 같은 패턴: 툭-툭
      await HapticFeedback.heavyImpact();
      await Future<void>.delayed(const Duration(milliseconds: 100));
      return HapticFeedback.mediumImpact();
  }
}

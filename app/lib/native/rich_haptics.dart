// 손끝 신호(햅틱) — 웹뷰에는 없는 네이티브 장점. iOS 는 Core Haptics 패턴(AppDelegate.swift 의 'puff/haptics' 채널),
// 없으면(구형 기기·Android·웹·채널 미등록) Flutter HapticFeedback 를 시간차로 엮은 대체 패턴.
//  press  더미를 누름(조준 잡힘)        : 가벼운 톡
//  full   숨 주머니 '꽉'(래치 순간)      : 굵은 톡 + 짧은 웅 + 되튐 = 코르크 '읍' (웹은 vibrate(25) 한 번)
//  strain 꽉에서 버티는 중(심장 박동)     : 약한 톡, 버팀이 찰수록 자주
//  cough  너무 오래 참아 콜록(취소)      : 웅-웅 두 번 (웹 [40,60,40])
//  fire   놓아서 '퍽'                   : 숨 세기 비례(약/중/강) + 바람 꼬리
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum HapticCue { press, full, strain, cough, fireWeak, fire, fireStrong, land }

class RichHaptics {
  RichHaptics._();
  static const MethodChannel _ch = MethodChannel('puff/haptics');
  static bool? _native; // null = 아직 모름
  static int fallbackCount = 0, nativeCount = 0; // 데모 화면 표시용(어느 길로 났나)

  static bool get nativeAvailable => _native ?? false;

  static Future<void> play(HapticCue cue) async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS && _native != false) {
      try {
        final ok = await _ch.invokeMethod<bool>('play', cue.name);
        _native = ok ?? false;
        if (_native!) {
          nativeCount++;
          return;
        }
      } on MissingPluginException {
        _native = false;
      } on PlatformException {
        _native = false;
      }
    }
    fallbackCount++;
    await _fallback(cue);
  }

  static Future<void> _gap(int ms) => Future<void>.delayed(Duration(milliseconds: ms));

  static Future<void> _fallback(HapticCue cue) async {
    switch (cue) {
      case HapticCue.press:
        return HapticFeedback.selectionClick();
      case HapticCue.full:
        await HapticFeedback.heavyImpact();
        await _gap(70);
        return HapticFeedback.lightImpact();
      case HapticCue.strain:
        return HapticFeedback.selectionClick();
      case HapticCue.cough:
        await HapticFeedback.heavyImpact();
        await _gap(100);
        return HapticFeedback.mediumImpact();
      case HapticCue.fireWeak:
        return HapticFeedback.lightImpact();
      case HapticCue.fire:
        await HapticFeedback.mediumImpact();
        await _gap(60);
        return HapticFeedback.selectionClick();
      case HapticCue.fireStrong:
        await HapticFeedback.heavyImpact();
        await _gap(50);
        return HapticFeedback.mediumImpact();
      case HapticCue.land:
        return HapticFeedback.lightImpact();
    }
  }
}

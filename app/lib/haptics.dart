// 웹 게임의 진동 호출을 앱 햅틱으로. iOS 웹뷰에는 navigator.vibrate 가 없어서 다리 코드(mockup/app/bridge.js)가 'PuffHaptic' 채널로 보낸다.
// 받은 메시지마다 웹에 응답(ACK)을 돌려준다 → ⚙ '소리·진동 시험'(mockup/src/diag.js)이 어느 길에서 끊기는지 보여 준다.
//
// iOS 길: Swift 'puff/haptics' 채널의 'impact' = 뷰에 붙인 UIImpactFeedbackGenerator(init(style:view:), iOS 17.5+) + prepare.
//   Flutter 엔진 HapticFeedback 은 부를 때마다 뷰 없는 생성기를 새로 만들어 prepare 없이 한 번 울리는데, 그 생성자(init(style:))는
//   iOS 27 에서 폐기됐다(Apple 개발자 문서 deprecatedAt iOS 27.0, 2026-10-14 확인). 기기에서 그 길이 조용히 무시되는지는 미검증
//   → 네이티브 길을 먼저 쓰고, 채널이 없거나 실패하면 엔진 길로.
// 안드로이드: 엔진 HapticFeedback 그대로.
import 'dart:convert';

import 'package:flutter/foundation.dart';
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

HapticKind _kindOf(String name) => switch (name) {
      'light' => HapticKind.light,
      'medium' => HapticKind.medium,
      'pattern' => HapticKind.pattern,
      'none' => HapticKind.none,
      _ => HapticKind.heavy,
    };

/// Swift AppDelegate 의 'puff/haptics' 채널(play = Core Haptics 패턴, impact = 생성기 톡, diag = 앱 소리 세션·기기 정보)
const MethodChannel kHapticChannel = MethodChannel('puff/haptics');

/// 'PuffHaptic' 메시지 → 햅틱 + 응답(ACK).
///  `25` · `p:40,60,40`        게임 진동(navigator.vibrate)
///  `d:길:세기또는신호:id`        진단: 길 = game(게임과 같은 길) · engine(Flutter HapticFeedback) · native(Swift 생성기) · core(Core Haptics 신호)
///  `i:id`                      진단 정보(앱 소리 세션·햅틱 하드웨어·저전력·iOS 판)
class HapticBridge {
  HapticBridge({MethodChannel channel = kHapticChannel, this.gap = const Duration(milliseconds: 100)}) : _ch = channel;
  final MethodChannel _ch;
  final Duration gap; // 패턴(콜록) 두 톡 사이
  int received = 0;
  bool? _native; // iOS 네이티브 'impact' 길이 되는가(null = 아직 모름)

  bool get _ios => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  Future<Map<String, Object?>> handle(String msg) async {
    received++;
    final ack = <String, Object?>{'n': received};
    try {
      if (msg.startsWith('i:')) {
        ack['id'] = msg.substring(2);
        ack['path'] = 'info';
        ack['info'] = await info();
      } else if (msg.startsWith('d:')) {
        final p = msg.split(':');
        ack['id'] = p.length > 3 ? p[3] : null;
        ack['path'] = await diag(p.length > 1 ? p[1] : 'game', p.length > 2 ? p[2] : 'heavy');
      } else {
        ack['path'] = await play(parseHaptic(msg));
      }
      ack['ok'] = ack['path'] != 'fail';
    } catch (e) {
      ack['ok'] = false;
      ack['err'] = '$e';
    }
    return ack;
  }

  /// 게임 진동. 반환 = 실제로 울린 길('view' 뷰에 붙인 생성기 · 'plain' 뷰 없는 생성기 · 'engine' Flutter · 'none')
  Future<String> play(HapticKind k) async {
    switch (k) {
      case HapticKind.none:
        return 'none';
      case HapticKind.pattern: // 콜록 같은 패턴: 툭-툭
        final a = await impact(HapticKind.heavy);
        await Future<void>.delayed(gap);
        await impact(HapticKind.medium);
        return a;
      default:
        return impact(k);
    }
  }

  Future<String> impact(HapticKind k) async {
    if (_ios && _native != false) {
      try {
        final r = await _ch.invokeMethod<String>('impact', <String, Object?>{'style': k.name, 'intensity': 1.0});
        if (r != null) {
          _native = true;
          return r;
        }
        _native = false;
      } on MissingPluginException {
        _native = false;
      } on PlatformException {
        _native = false;
      }
    }
    await engine(k);
    return 'engine';
  }

  /// Flutter 엔진 길(iOS: 뷰 없는 UIImpactFeedbackGenerator, 안드로이드: performHapticFeedback)
  static Future<void> engine(HapticKind k) async {
    switch (k) {
      case HapticKind.none:
        return;
      case HapticKind.light:
        return HapticFeedback.lightImpact();
      case HapticKind.medium:
        return HapticFeedback.mediumImpact();
      case HapticKind.heavy:
      case HapticKind.pattern:
        return HapticFeedback.heavyImpact();
    }
  }

  Future<String> diag(String path, String arg) async {
    switch (path) {
      case 'engine':
        await engine(_kindOf(arg));
        return 'engine';
      case 'core':
        final ok = await _ch.invokeMethod<bool>('play', arg) ?? false;
        return ok ? 'core' : 'fail';
      case 'native':
        return await _ch.invokeMethod<String>('impact', <String, Object?>{'style': arg, 'intensity': 1.0}) ?? 'fail';
      default:
        return play(_kindOf(arg));
    }
  }

  Future<Map<String, Object?>> info() async {
    final m = <String, Object?>{'platform': defaultTargetPlatform.name, 'received': received, 'nativeImpact': _native};
    try {
      final r = await _ch.invokeMapMethod<String, Object?>('diag');
      if (r != null) m.addAll(r);
    } on MissingPluginException {
      m['diag'] = 'no channel';
    } on PlatformException catch (e) {
      m['diag'] = e.code;
    }
    return m;
  }

  /// 웹으로 돌려줄 한 줄(runJavaScript). JSON 은 그대로 JS 식이다
  static String ackScript(Map<String, Object?> ack) => 'window.__puffApp && window.__puffApp.ack(${jsonEncode(ack)})';
}

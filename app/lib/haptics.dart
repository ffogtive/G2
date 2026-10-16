// 웹 게임의 진동 호출을 앱 햅틱으로. iOS 웹뷰에는 navigator.vibrate 가 없어서 다리 코드(mockup/app/bridge.js)가 'PuffHaptic' 채널로 보낸다.
// 받은 메시지마다 웹에 응답(ACK)을 돌려준다 → ⚙ '소리·진동 시험'(mockup/src/diag.js)이 어느 길에서 끊기는지 보여 준다.
//
// iOS 길: Swift 'puff/haptics' 채널의 'impact' = 뷰에 붙인 UIImpactFeedbackGenerator(init(style:view:), iOS 17.5+) + prepare.
//   Flutter 엔진 HapticFeedback 은 부를 때마다 뷰 없는 생성기를 새로 만들어 prepare 없이 한 번 울리는데, 그 생성자(init(style:))는
//   iOS 27 에서 폐기됐다(Apple 개발자 문서 deprecatedAt iOS 27.0, 2026-10-14 확인). 기기에서 그 길이 조용히 무시되는지는 미검증
//   → 네이티브 길을 먼저 쓰고, 채널이 없거나 실패하면 엔진 길로.
// 안드로이드: 엔진 HapticFeedback 그대로.
//
// 🧭 가설 수정(BLOCKERS G4, 미검증): 게임 진동은 Swift 까지 가고 응답도 돌아온다(확인됨). 사라지는 곳은 '재생' — 1순위 = UIKit 생성기 길이 기기에서
//   조용히 무시됨, 2순위 = 같은 틱 소리·연속 요청에 눌림. 그래서 iOS 게임 진동('g:auto')의 기본 길을 다른 OS 길인 Core Haptics('play' 신호
//   tapLight·tapMedium·tapHeavy·cough)로 먼저 보내고, false·예외면 생성기(impact, view) → 그것도 안 되면 엔진. 실패를 영구 기억하지 않는다
//   (엔진이 인터럽트로 멈춰도 Swift 가 다음 호출에서 다시 만든다). 'g:view' = 옛 생성기 길(⚙ '게임 진동 길' 스위치). 'w:' = 예열(warm).
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

/// 게임 진동의 Core Haptics 신호(Swift PuffRichHaptics.events): 세기 3단 톡 + 콜록 패턴
String coreCue(HapticKind k) => switch (k) {
      HapticKind.light => 'tapLight',
      HapticKind.medium => 'tapMedium',
      HapticKind.pattern => 'cough',
      _ => 'tapHeavy',
    };

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
///  `g:auto:g7:49` · `g:view:g8:p:40,60,40`  게임 진동(다리 navigator.vibrate). route auto = iOS Core Haptics 먼저, view = 옛 생성기 길. id 를 그대로 돌려준다
///  `w:w3`                      예열(Core Haptics 엔진 미리 켜기) → 응답 path 'warm'
///  `25` · `p:40,60,40`        옛 평문 게임 진동(route auto 로 받음)
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
      } else if (msg.startsWith('g:')) {
        // 'g:<route>:<id>:<payload>' — payload 에 ':' 가 있으므로(p:40,60,40) 앞 세 칸만 자르고 나머지를 이어 붙인다
        final p = msg.split(':');
        ack['id'] = p.length > 2 ? p[2] : null;
        ack['path'] = await game(p.length > 1 ? p[1] : 'auto', parseHaptic(p.length > 3 ? p.sublist(3).join(':') : ''));
      } else if (msg.startsWith('w:')) {
        ack['id'] = msg.substring(2);
        ack['path'] = 'warm';
        ack['ok'] = await warm();
        return ack;
      } else if (msg.startsWith('d:')) {
        final p = msg.split(':');
        ack['id'] = p.length > 3 ? p[3] : null;
        ack['path'] = await diag(p.length > 1 ? p[1] : 'game', p.length > 2 ? p[2] : 'heavy');
      } else {
        ack['path'] = await game('auto', parseHaptic(msg)); // 옛 평문('25' · 'p:…')
      }
      ack['ok'] = ack['path'] != 'fail';
    } catch (e) {
      ack['ok'] = false;
      ack['err'] = '$e';
    }
    return ack;
  }

  /// 게임 진동 길. 반환 = 실제로 울린 길('core' Core Haptics · 'view'·'plain' 생성기 · 'engine' Flutter · 'none')
  ///  iOS auto: Core Haptics 신호(play) → false·예외면 생성기(impact) → 엔진. iOS view: 생성기 → 엔진(옛 길). 안드로이드: 늘 엔진
  Future<String> game(String route, HapticKind k) async {
    if (k == HapticKind.none) return 'none';
    if (!_ios) {
      await engine(k);
      return 'engine';
    }
    if (route != 'view') {
      try {
        final ok = await _ch.invokeMethod<bool>('play', coreCue(k)) ?? false;
        if (ok) return 'core';
      } on MissingPluginException {
        // 채널 없음 → 생성기 → 엔진
      } on PlatformException {
        // Core Haptics 실패 → 생성기 → 엔진
      }
    }
    return play(k);
  }

  /// 예열: Core Haptics 엔진을 미리 켠다(자동 꺼짐 뒤 첫 진동이 늦지 않게). 채널이 없거나 실패면 false
  Future<bool> warm() async {
    if (!_ios) return false;
    try {
      return await _ch.invokeMethod<bool>('warm') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// 생성기 길(옛 게임 진동). 반환 = 실제로 울린 길('view' 뷰에 붙인 생성기 · 'plain' 뷰 없는 생성기 · 'engine' Flutter · 'none')
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

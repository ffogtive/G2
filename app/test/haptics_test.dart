// 진동 다리(lib/haptics.dart): 웹 메시지 → 네이티브/엔진 햅틱 + 웹으로 돌려줄 응답(ACK)
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puff/haptics.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late List<MethodCall> native, engine;

  setUp(() {
    native = [];
    engine = [];
    messenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
      if (c.method == 'HapticFeedback.vibrate') engine.add(c);
      return null;
    });
  });
  tearDown(() {
    messenger.setMockMethodCallHandler(SystemChannels.platform, null);
    messenger.setMockMethodCallHandler(kHapticChannel, null);
    debugDefaultTargetPlatformOverride = null;
  });

  void mockNative(Object? Function(MethodCall c) answer) {
    messenger.setMockMethodCallHandler(kHapticChannel, (c) async {
      native.add(c);
      return answer(c);
    });
  }

  test('iOS 게임 진동은 Swift 생성기 길(impact)로, 응답에 몇 번째·길·성공', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    mockNative((c) => c.method == 'impact' ? 'view' : null);
    final b = HapticBridge(gap: Duration.zero);
    final a = await b.handle('50');
    expect(native.single.method, 'impact');
    expect((native.single.arguments as Map)['style'], 'heavy');
    expect(engine, isEmpty);
    expect(a, {'n': 1, 'path': 'view', 'ok': true});
    final p = await b.handle('p:40,60,40');
    expect(native.skip(1).map((c) => (c.arguments as Map)['style']), ['heavy', 'medium']);
    expect(p['n'], 2);
  });

  test('iOS 네이티브 채널이 없으면 엔진 HapticFeedback 로, 다음부터는 바로 엔진', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final b = HapticBridge(gap: Duration.zero);
    expect((await b.handle('12'))['path'], 'engine');
    expect((await b.handle('25'))['path'], 'engine');
    expect(engine.map((c) => c.arguments), ['HapticFeedbackType.lightImpact', 'HapticFeedbackType.mediumImpact']);
  });

  test('안드로이드는 엔진 길만', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    mockNative((c) => 'view');
    final a = await HapticBridge().handle('25');
    expect(native, isEmpty);
    expect(a['path'], 'engine');
    expect(engine.single.arguments, 'HapticFeedbackType.mediumImpact');
  });

  test('진단 메시지: 길별로 울리고 id 를 돌려준다', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    var coreOk = true;
    mockNative((c) => switch (c.method) {
          'play' => coreOk,
          'impact' => 'view',
          'diag' => {'category': 'Playback', 'mode': 'Default', 'hapticsRec': true, 'supportsHaptics': true},
          _ => null,
        });
    final b = HapticBridge();
    final e = await b.handle('d:engine:heavy:7');
    expect(e, {'n': 1, 'id': '7', 'path': 'engine', 'ok': true});
    expect(engine.single.arguments, 'HapticFeedbackType.heavyImpact');
    final c = await b.handle('d:core:fireStrong:8');
    expect(native.last.method, 'play');
    expect(native.last.arguments, 'fireStrong');
    expect(c['path'], 'core');
    coreOk = false;
    final f = await b.handle('d:core:fireStrong:9');
    expect(f['ok'], false);
    expect(f['path'], 'fail');
    final i = await b.handle('i:10');
    expect(i['id'], '10');
    final info = i['info'] as Map<String, Object?>;
    expect(info['category'], 'Playback');
    expect(info['platform'], 'iOS');
    expect(info['received'], 4);
  });

  test('진단 정보: 채널이 없어도 응답은 간다', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final i = await HapticBridge().handle('i:3');
    expect(i['ok'], true);
    expect((i['info'] as Map)['diag'], 'no channel');
  });

  test('응답 스크립트 = 다리 코드의 window.__puffApp.ack(JSON)', () {
    final s = HapticBridge.ackScript({'n': 3, 'id': '5', 'path': 'view', 'ok': true, 'err': "a'b\"c</script>"});
    expect(s, startsWith('window.__puffApp && window.__puffApp.ack('));
    final body = s.substring('window.__puffApp && window.__puffApp.ack('.length, s.length - 1);
    expect(jsonDecode(body), {'n': 3, 'id': '5', 'path': 'view', 'ok': true, 'err': "a'b\"c</script>"});
  });
}

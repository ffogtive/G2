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

  test('iOS 게임 진동 g:auto 는 Core Haptics(play tapHeavy)로, 응답에 몇 번째·id·길·성공', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    mockNative((c) => c.method == 'play' ? true : c.method == 'impact' ? 'view' : null);
    final b = HapticBridge(gap: Duration.zero);
    final a = await b.handle('g:auto:g1:49');
    expect(native.single.method, 'play');
    expect(native.single.arguments, 'tapHeavy');
    expect(engine, isEmpty);
    expect(a, {'n': 1, 'id': 'g1', 'path': 'core', 'ok': true});
    final p = await b.handle('g:auto:g2:p:40,60,40'); // payload 의 ':' 는 이어 붙인다
    expect(native.last.arguments, 'cough');
    expect(p, {'n': 2, 'id': 'g2', 'path': 'core', 'ok': true});
    final l = await b.handle('g:auto:g3:12');
    expect(native.last.arguments, 'tapLight');
    expect(l['id'], 'g3');
  });

  test('Core Haptics 가 false·예외면 생성기(impact, view)로, 채널이 없으면 엔진으로 — 실패를 영구 기억하지 않음', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    Object? playAnswer = false;
    mockNative((c) {
      if (c.method == 'play') {
        final a = playAnswer;
        if (a is PlatformException) throw a;
        return a;
      }
      return c.method == 'impact' ? 'view' : null;
    });
    final b = HapticBridge(gap: Duration.zero);
    final f = await b.handle('g:auto:g1:25');
    expect(native.map((c) => c.method), ['play', 'impact']);
    expect(f, {'n': 1, 'id': 'g1', 'path': 'view', 'ok': true});
    playAnswer = PlatformException(code: 'engine');
    expect((await b.handle('g:auto:g2:49'))['path'], 'view');
    playAnswer = true; // 다음 호출에서 다시 Core 로(실패를 기억하지 않음)
    expect((await b.handle('g:auto:g3:49'))['path'], 'core');
    messenger.setMockMethodCallHandler(kHapticChannel, null); // 채널 없음 → 엔진
    final e = await HapticBridge(gap: Duration.zero).handle('g:auto:g4:12');
    expect(e['path'], 'engine');
    expect(engine.single.arguments, 'HapticFeedbackType.lightImpact');
  });

  test("g:view 는 옛 생성기 길(impact) · 옛 평문 '25'·'p:…' 도 받음(auto)", () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    mockNative((c) => c.method == 'play' ? true : c.method == 'impact' ? 'view' : null);
    final b = HapticBridge(gap: Duration.zero);
    final v = await b.handle('g:view:g5:25');
    expect(native.single.method, 'impact');
    expect((native.single.arguments as Map)['style'], 'medium');
    expect(v, {'n': 1, 'id': 'g5', 'path': 'view', 'ok': true});
    final o = await b.handle('25');
    expect(native.last.method, 'play');
    expect(native.last.arguments, 'tapMedium');
    expect(o, {'n': 2, 'path': 'core', 'ok': true});
    expect((await b.handle('p:40,60,40'))['path'], 'core');
    expect(native.last.arguments, 'cough');
  });

  test("예열 'w:' → Swift warm · 응답 path warm", () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    mockNative((c) => c.method == 'warm' ? true : null);
    final w = await HapticBridge().handle('w:w1');
    expect(native.single.method, 'warm');
    expect(w, {'n': 1, 'id': 'w1', 'path': 'warm', 'ok': true});
  });

  test('iOS 네이티브 채널이 없으면 엔진 HapticFeedback 로, 다음부터는 바로 엔진', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final b = HapticBridge(gap: Duration.zero);
    expect((await b.handle('g:auto:g1:12'))['path'], 'engine');
    expect((await b.handle('g:auto:g2:25'))['path'], 'engine');
    expect(engine.map((c) => c.arguments), ['HapticFeedbackType.lightImpact', 'HapticFeedbackType.mediumImpact']);
  });

  test('안드로이드는 엔진 길만(id 그대로)', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    mockNative((c) => c.method == 'play' ? true : 'view');
    final a = await HapticBridge().handle('g:auto:g9:25');
    expect(native, isEmpty);
    expect(a, {'n': 1, 'id': 'g9', 'path': 'engine', 'ok': true});
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

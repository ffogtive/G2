// B 시제품: lib/native/rules.dart 가 mockup/src/rules.js 와 같은 값인지(표본은 make_track_fixture.mjs 가 JS 로 계산)
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/coords.dart';
import 'package:puff/native/demo_page.dart' show pickShot;
import 'package:puff/native/rules.dart';

void main() {
  final r = (jsonDecode(File('test/fixtures/track_check.json').readAsStringSync()) as Map<String, dynamic>)['rules'] as Map<String, dynamic>;
  double d(Object? v) => (v as num).toDouble();

  test('상수', () {
    final c = r['consts'] as Map<String, dynamic>;
    expect(kPowerMax, d(c['POWER_MAX']));
    expect(kPouchFull, d(c['POUCH_FULL']));
    expect(kPouchDetent, d(c['POUCH_DETENT']));
    expect(kPouchGain, d(c['POUCH_GAIN']));
    expect(kStrainMs, d(c['STRAIN_MS']));
    expect(kLeakAt, d(c['LEAK_AT']));
    expect(kGreenLo, d(c['GREEN_LO']));
  });

  test('sweetHiFor(0..40)', () {
    final want = r['sweetHi'] as List;
    for (var n = 0; n < want.length; n++) {
      expect(sweetHiFor(n), d(want[n]), reason: 'n=$n');
    }
  });

  test('pouchPower · fullLatch · strainStep', () {
    for (final p in r['pouch'] as List) {
      expect(pouchPower(d(p[0])), d(p[1]), reason: 'u=${p[0]}');
    }
    for (final l in r['latch'] as List) {
      expect(fullLatch(d(l[0]), l[1] as bool), l[2] as bool, reason: '$l');
    }
    for (final s in r['strain'] as List) {
      expect(strainStep(d(s[0]), d(s[1]), d(s[2]), s[3] as bool), closeTo(d(s[4]), 1e-12), reason: '$s');
    }
  });

  test('숨 구간(20장 정답 0.95): 약함 < 0.741 ≤ 초록 ≤ 0.95 < 돌풍', () {
    expect(zoneOf(0.70, 20), BreathZone.weak);
    expect(zoneOf(0.80, 20), BreathZone.green);
    expect(zoneOf(0.95, 20), BreathZone.green);
    expect(zoneOf(0.96, 20), BreathZone.blast);
  });

  test('어느 녹화를 틀지: 초록이면 높이·좌우로 갈림', () {
    AimHit hit(double h, double lat) => AimHit(h, lat, lat, h, -1, onTop: false);
    expect(pickShot(BreathZone.weak, hit(0.8, 0), 0.96), 'weak');
    expect(pickShot(BreathZone.blast, hit(0.8, 0), 0.96), 'blast');
    expect(pickShot(BreathZone.green, hit(0.8, 0), 0.96), 'green');
    expect(pickShot(BreathZone.green, hit(0.8, 0.5), 0.96), 'side');
    expect(pickShot(BreathZone.green, hit(0.4, 0), 0.96), 'mid');
  });
}

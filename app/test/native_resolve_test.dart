// 숨 해석 Dart 포팅(lib/native/rules.dart resolveShot + detmath.dart)이 웹 게임(rules.js)과 같은가.
// 표본: app/tool/make_resolve_fixture.mjs → test/fixtures/resolve_js.json (V8 의 Math.log·cos 로 뽑은 값)
//
// 실측(2026-10-13): Dart detmath = Rust libm(fdlibm 계열)과는 비트 단위로 같다(native_sim_ffi_test.dart, 20만 개).
//   그런데 V8(node 22)의 Math.log·cos 는 fdlibm 과 마지막 비트가 가끔 다르다(gauss 2000개 중 34개, 1~2ulp).
//   → 숨이 넘치지 않는 샷(gauss 안 씀)은 웹과 비트 일치, 넘치는 샷의 흔들림만 1~2ulp 차이. 웹↔앱은 어차피 엔진이 달라
//     해시가 같을 수 없으니(Rapier JS 0.12 ≠ rapier 0.36) 문제 아님. 앱↔앱(PvP)은 Rust 와 비트 일치가 계약이다.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/detmath.dart';
import 'package:puff/native/rules.dart';

void main() {
  final fx = jsonDecode(File('test/fixtures/resolve_js.json').readAsStringSync()) as Map<String, dynamic>;
  double d(Object? v) => (v as num).toDouble();
  // 두 double 사이의 ulp 거리(같은 부호 가정)
  int ulps(double a, double b) {
    final bd = ByteData(16)
      ..setFloat64(0, a)
      ..setFloat64(8, b);
    return (bd.getInt64(0) - bd.getInt64(8)).abs();
  }

  test('mulberry32 = JS·Rust 수열 (Rust rng.rs 시험과 같은 표본)', () {
    final r = Mulberry32(12345);
    expect([for (var i = 0; i < 4; i++) r.next()], [0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203]);
    // 상태를 넘겨 이어 뽑기
    final a = Mulberry32(99), b = Mulberry32(99);
    a.next();
    final c = Mulberry32(a.state);
    b.next();
    expect(c.next(), b.next());
  });

  test('gauss 2000개 ≈ JS gauss (V8 Math.log·cos): 대부분 비트 일치, 나머지 ≤ 4ulp', () {
    final g = Mulberry32(7);
    final want = (fx['gauss7'] as List).map(d).toList();
    var diff = 0, worst = 0;
    for (final w in want) {
      final v = gauss(g);
      if (v != w) {
        diff++;
        worst = ulps(v, w) > worst ? ulps(v, w) : worst;
      }
    }
    // ignore: avoid_print
    print('gauss Dart(fdlibm) vs V8: 불일치 $diff/${want.length}, 최대 $worst ulp');
    expect(diff, lessThan(want.length * 0.05));
    expect(worst, lessThanOrEqualTo(4));
  });

  test('sweetHiFor · physSweetFor 0..40 = rules.js', () {
    final s = fx['sweet'] as List;
    for (var n = 0; n < s.length; n++) {
      expect(sweetHiFor(n), d(s[n][0]), reason: 'n=$n');
      expect(physSweetFor(n), d(s[n][1]), reason: 'n=$n');
    }
  });

  test('resolveShot 500샷 = rules.js: 넘치지 않는 숨은 비트 일치, 넘치는 숨은 흔들림만 ≤ 1e-14 · 난수 소비 같음', () {
    final cases = fx['cases'] as List;
    var over = 0, overExact = 0;
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i] as Map<String, dynamic>;
      final o = c['out'] as Map<String, dynamic>;
      final rng = Mulberry32(c['seed'] as int);
      final r = resolveShot(lat: d(c['lat']), h: d(c['h']), power: d(c['power']), n: c['n'] as int, top: d(c['top']), rng: rng);
      final why = 'case $i ${jsonEncode(c)}';
      expect(r.ratio, d(o['ratio']), reason: why);
      expect(r.power, d(o['power']), reason: why);
      expect(r.blast, d(o['blast']), reason: why);
      expect(r.over, o['over'], reason: why);
      if (r.over) {
        expect(r.lat, closeTo(d(o['lat']), 1e-14), reason: why);
        expect(r.h, closeTo(d(o['h']), 1e-14), reason: why);
        over++;
        if (r.lat == d(o['lat']) && r.h == d(o['h'])) overExact++;
      } else {
        expect(r.lat, d(o['lat']), reason: why);
        expect(r.h, d(o['h']), reason: why);
      }
      expect(rng.next(), d(c['next']), reason: '$why — 난수 소비 개수');
    }
    // ignore: avoid_print
    print('resolveShot vs rules.js: 넘치는 숨 $over 샷 중 흔들림까지 비트 일치 $overExact');
    expect(over, greaterThan(200));
  });

  test('조준 기하 = Rust aim_point (방향 −z, 옆 +x)', () {
    final (x, y, z) = aimPoint(cx: 0.1, cz: -0.2, lat: 0.6, h: 0.5);
    expect(x, closeTo(0.1 + 0.6, 1e-15));
    expect(y, 0.5);
    expect(z, closeTo(-0.2 + 0.8, 1e-15)); // 바람이 −z 로 가므로 표적은 더미 앞(+z) 곡면 위
    final (x2, _, z2) = aimPoint(cx: 0, cz: 0, lat: 0, h: 0.3, dirX: 2, dirZ: 0);
    expect(x2, -1.0);
    expect(z2, 0.0);
  });
}

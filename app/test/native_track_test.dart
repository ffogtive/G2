// B 시제품: Dart 궤적 재생기(lib/native/track.dart)가 웹 turn.js TrackPlayer 와 같은 자세를 내는지.
// 고정본: cd .. && node app/tool/make_track_fixture.mjs (assets/native/track_fixture.json + test/fixtures/track_check.json)
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/coords.dart';
import 'package:puff/native/track.dart';

void main() {
  final fx = TrackFixture.parse(File('assets/native/track_fixture.json').readAsStringSync());
  final check = jsonDecode(File('test/fixtures/track_check.json').readAsStringSync()) as Map<String, dynamic>;

  test('고정본: 20장 · 샷 5개 · 모두 같은 더미에서 출발', () {
    expect(fx.n, 20);
    expect(fx.cards.length, 20);
    expect(fx.shots.map((s) => s.name), ['green', 'side', 'mid', 'blast', 'weak']);
    expect(fx.shots.map((s) => s.pre).toSet().length, 1);
  });

  for (final c in check['checks'] as List) {
    final name = c['name'] as String;
    test('$name: poseAt 표본이 JS 와 같다(1e-9) + 재생 끝 바이트 = post', () {
      final shot = fx.shot(name);
      final pl = shot.player();
      expect(pl.received, shot.frames);
      var worst = 0.0;
      for (final s in c['check'] as List) {
        final tf = (s['tf'] as num).toDouble();
        final got = pl.poseAt(tf);
        final rows = s['poses'] as List;
        expect(got.length, rows.length);
        for (final r in rows) {
          final id = r[0] as int;
          final p = got[id]!;
          final want = [for (var k = 1; k < 8; k++) (r[k] as num).toDouble()];
          final have = [p.px, p.py, p.pz, p.qx, p.qy, p.qz, p.qw];
          for (var k = 0; k < 7; k++) {
            final d = (want[k] - have[k]).abs();
            if (d > worst) worst = d;
          }
        }
      }
      expect(worst, lessThan(1e-9), reason: '최대 차이 $worst');
      expect(pl.done, isTrue);
      expect(base64Encode(pl.endBytes()), shot.post);
    });
  }

  test('끝 자세로 다시 센 판정 = 웹 판정(뒤집힘·원 밖) — faceUp·inCircle 이 sim.js 와 같은 식', () {
    for (final shot in fx.shots) {
      final end = shot.player().poseAt(shot.frames.toDouble());
      final flipped = [for (final e in end.entries) if (e.value.faceUp > 0.2 && inCircle(e.value)) e.key]..sort();
      final outs = [for (final e in end.entries) if (!inCircle(e.value)) e.key]..sort();
      expect(flipped, shot.flipped, reason: shot.name);
      expect(outs, shot.outs, reason: shot.name);
    }
  });

  test('처음 더미: 20장 모두 뒷면이 위(그림 면 아래) · 꼭대기 ≈ 0.96', () {
    final rest = fx.shots.first.player().poseAt(0);
    expect(rest.length, 20);
    for (final p in rest.values) {
      expect(p.faceUp, lessThan(-0.99));
    }
    expect(columnTop(rest.values), closeTo(fx.shots.first.top, 0.002)); // 13B 양자화(1/1000) 안쪽
  });

  test('조각으로 나눠 받아도 같다(빈칸이면 거절)', () {
    final shot = fx.shot('green');
    final whole = base64Decode(shot.track);
    final pl = TrackPlayer.b64(shot.pre);
    // 프레임 경계에서 자르기: [개수][개수×13B]
    final cuts = <int>[0];
    var o = 0;
    while (o < whole.length) {
      o += 1 + whole[o] * kPoseBytes;
      cuts.add(o);
    }
    final half = cuts[cuts.length ~/ 2];
    expect(pl.push(whole.sublist(half), cuts.length ~/ 2), isFalse); // 앞 조각 없이 뒤 조각 → 거절
    expect(pl.push(whole.sublist(0, half)), isTrue);
    expect(pl.push(whole.sublist(half), cuts.length ~/ 2), isTrue);
    pl.poseAt(shot.frames.toDouble());
    expect(base64Encode(pl.endBytes()), shot.post);
  });
}

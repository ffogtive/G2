// 앱 ↔ Rust 물리 연결 시험 (리눅스·맥 호스트에서 dart:ffi 로 .so/.dylib 를 직접 연다).
//   먼저: (cd native/puff_sim && cargo build --release)   → target/release/libpuff_sim.so (+ puff_parity CLI)
//   없으면 이 파일의 시험은 건너뛴다(이유 표시). 다른 경로: PUFF_SIM_LIB=/path/libpuff_sim.so flutter test
//
// 확인하는 것
//  1. Dart 결정적 수학(detmath.dart log·cos·gauss) = Rust libm 비트 일치 (그리고 dart:math 는 몇 개나 어긋나는지 기록)
//  2. Dart resolveShot = Rust rules::resolve_shot 비트 일치 (무작위 2만 샷, 난수 소비까지)
//  3. 누르기→당기기→놓기 경로(LiveSim: Dart 숨 해석 → Rust blow → 화면 프레임마다 고정 스텝 → 판정 → 가져가기·다시 쌓기)가
//     Rust CLI(`puff_parity shots`, turn.js 순서)와 해시·스텝·장수까지 같음 — 화면 120Hz·60Hz·90Hz·떨리는 프레임 모두
//  4. 고정본(test/fixtures/sim_cli_shots.json)이 지금 CLI 출력과 같음(CLI 가 있으면)
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/detmath.dart';
import 'package:puff/native/live_sim.dart';
import 'package:puff/native/rules.dart';
import 'package:puff/native/sim_core.dart';
import 'package:puff_sim_ffi/puff_sim_ffi.dart' as ffi;

String? _findLib() {
  final env = Platform.environment['PUFF_SIM_LIB'];
  if (env != null && File(env).existsSync()) return env;
  for (final name in ['libpuff_sim.so', 'libpuff_sim.dylib']) {
    final p = '../native/puff_sim/target/release/$name';
    if (File(p).existsSync()) return File(p).absolute.path;
  }
  return null;
}

const _cli = '../native/puff_sim/target/release/puff_parity';

void main() {
  final libPath = _findLib();
  final skip = libPath == null ? 'Rust 라이브러리 없음 — (cd native/puff_sim && cargo build --release) 먼저' : null;
  final fx = jsonDecode(File('test/fixtures/sim_cli_shots.json').readAsStringSync()) as Map<String, dynamic>;
  double d(Object? v) => (v as num).toDouble();
  // 16진수 64비트를 Dart int 로: 위 8자리·아래 8자리로 나눠 부호 넘침 없이
  int h64(String s) => (int.parse(s.substring(0, 8), radix: 16) << 32) | int.parse(s.substring(8), radix: 16);

  group('Rust 물리 FFI', skip: skip, () {
    late ffi.PuffSimLib raw;
    late SimLibrary lib;
    setUpAll(() {
      raw = ffi.PuffSimLib.open(libPath);
      final (l, err) = openSimLibrary(libPath: libPath);
      expect(err, isNull);
      lib = l!;
    });

    test('엔진 버전 = CLI 고정본이 만들어진 엔진', () {
      expect(lib.version, fx['version']);
      expect(lib.version, startsWith('puff_sim '));
    });

    test('detmath log·cos = Rust libm 비트 일치 (20만 개) · dart:math 와의 차이 기록', () {
      final g = Mulberry32(424242);
      var badLog = 0, badCos = 0, platLog = 0, platCos = 0;
      const n = 100000;
      for (var i = 0; i < n; i++) {
        // gauss 가 쓰는 범위(u ∈ (0,1], 2πv ∈ (0, 2π)) + 넓은 범위 섞기
        final u = i % 5 == 0 ? math.pow(10, g.next() * 40 - 20).toDouble() : g.next() + 1e-300;
        final x = i % 5 == 0 ? (g.next() - 0.5) * 2000 : 2 * math.pi * g.next();
        if (detLog(u) != raw.mathV(0, u)) badLog++;
        if (detCos(x) != raw.mathV(1, x)) badCos++;
        if (math.log(u) != raw.mathV(0, u)) platLog++;
        if (math.cos(x) != raw.mathV(1, x)) platCos++;
      }
      // 특수값
      for (final v in [0.0, -0.0, 1.0, -1.0, double.infinity, double.minPositive, 4.9e-324, 1e-310, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi, 1e-9, 0.785398163, 2.356194490]) {
        final a = detLog(v), b = raw.mathV(0, v);
        expect(a.isNaN ? b.isNaN : a == b, isTrue, reason: 'log($v) $a vs $b');
        final c = detCos(v), e = raw.mathV(1, v);
        expect(c.isNaN ? e.isNaN : c == e, isTrue, reason: 'cos($v) $c vs $e');
      }
      // ignore: avoid_print
      print('detmath vs Rust libm: log 불일치 $badLog/$n · cos 불일치 $badCos/$n  |  dart:math(이 플랫폼 libm) vs Rust: log $platLog · cos $platCos');
      expect(badLog, 0);
      expect(badCos, 0);
    });

    test('Dart gauss = Rust gauss (같은 수열 2000개, Rust resolve 로 간접 확인)', () {
      // Rust 의 gauss 는 직접 안 열려 있다 → 숨이 넘치는 샷의 h 흔들림으로 대조(아래 resolveShot 시험이 2만 개로 넓게 본다)
      final t = raw.table(1);
      final rng = Mulberry32(7);
      for (var i = 0; i < 2000; i++) {
        final st = rng.state;
        final g1 = gauss(rng);
        gauss(rng);
        // ratio 2 (ex = 1), overShake 1 → h = clamp(1 + g·1.2, 0.03, 9): 대부분 안 잘림 → (h−1)/1.2 의 비트로 g 를 본다
        final r = t.resolve(n: 20, top: 9, lat: 0, h: 1, breath: 2 * sweetHiFor(20), rngState: st);
        final want = math.max(0.03, math.min(9.0, 1 + g1 * 1.0 * 1.2 * 1));
        expect(r[ffi.kResH], want, reason: 'i=$i');
        expect(r[ffi.kResRng].toInt(), rng.state);
      }
      t.dispose();
    });

    test('resolveShot Dart = Rust 비트 일치 (무작위 2만 샷, 절반은 넘치는 숨)', () {
      final t = raw.table(1);
      final g = Mulberry32(2026);
      for (var i = 0; i < 20000; i++) {
        final n = 1 + (g.next() * 40).floor();
        final top = 0.1 + g.next() * 3;
        final lat = g.next() * 1.8 - 0.9;
        final h = g.next() * top;
        final hi = sweetHiFor(n);
        final power = i.isOdd ? hi * (1 + g.next() * 0.6) : g.next() * hi;
        final seed = (g.next() * 4294967296).floor();
        final rng = Mulberry32(seed);
        final r = resolveShot(lat: lat, h: h, power: power, n: n, top: top, rng: rng);
        final w = t.resolve(n: n, top: top, lat: lat, h: h, breath: power, rngState: seed);
        final why = 'i=$i n=$n top=$top lat=$lat h=$h power=$power seed=$seed';
        expect([r.ratio, r.power, r.blast, r.lat, r.h], [w[ffi.kResRatio], w[ffi.kResPower], w[ffi.kResBlast], w[ffi.kResLat], w[ffi.kResH]], reason: why);
        expect(r.over ? 1.0 : 0.0, w[ffi.kResOver], reason: why);
        expect(rng.state, w[ffi.kResRng].toInt(), reason: why);
      }
      t.dispose();
    });

    // 화면 시계: 120Hz 고정 / 60Hz / 90Hz / 떨리는 120Hz(마이크로초 반올림 + 가끔 프레임 떨굼)
    final clocks = <String, double Function(int frame)>{
      '120Hz': (_) => 8333 / 1e6,
      '60Hz': (_) => 16667 / 1e6,
      '90Hz': (_) => 11111 / 1e6,
      '120Hz 떨림+떨굼': (f) => (f % 37 == 0 ? 16667 : (f.isEven ? 8333 : 8334)) / 1e6,
    };

    for (final clock in clocks.entries) {
      test('놓기 → Rust blow → 고정 스텝 → 판정 → 다시 쌓기 = Rust CLI (${clock.key})', () {
        for (final c in (fx['cases'] as List).cast<Map<String, dynamic>>()) {
          final seed = c['seed'] as int, n = c['n'] as int;
          final sim = LiveSim(lib, n: n, seed: seed);
          final tag = '[${clock.key}] seed $seed n $n';
          expect(sim.settleSteps, c['settle'], reason: '$tag 첫 가라앉힘 스텝');
          expect(sim.stateHash, h64(c['hash0'] as String), reason: '$tag 첫 더미');
          var frame = 0;
          for (final t in (c['turns'] as List).cast<Map<String, dynamic>>()) {
            final tt = '$tag turn ${sim.turn}';
            expect(sim.phase, LivePhase.ready, reason: tt);
            expect(sim.live, t['live'], reason: tt);
            final k = t['k'] as int;
            final h = sim.layerY(math.min(k, sim.live - 1));
            expect(h, d(t['h']), reason: '$tt 층 높이');
            final breath = d(t['ratio']) * sweetHiFor(sim.live);
            expect(breath, d(t['breath']), reason: tt);
            final shot = sim.fire(lat: d(t['lat']), h: h, breath: breath);
            expect(shot.puffSeed, t['puffSeed'], reason: tt);
            final res = t['res'] as Map<String, dynamic>;
            expect([shot.res.ratio, shot.res.power, shot.res.blast, shot.res.lat, shot.res.h, shot.res.over], [d(res['ratio']), d(res['power']), d(res['blast']), d(res['lat']), d(res['h']), res['over']], reason: '$tt 숨 해석');
            expect([shot.aimX, shot.aimY, shot.aimZ], (res['aim'] as List).map(d).toList(), reason: '$tt 조준점');
            expect(sim.core.rngState, t['rngAfterBlow'], reason: '$tt blow 뒤 난수 상태');
            LiveJudge? judged;
            sim.onJudged = (j) => judged = j;
            var maxPerFrame = 0;
            while (sim.phase == LivePhase.flying) {
              final s = sim.advance(clock.value(frame++));
              maxPerFrame = math.max(maxPerFrame, s);
              expect(sim.alpha, inInclusiveRange(0, 1));
              expect(frame, lessThan(5000));
            }
            expect(judged, isNotNull);
            final j = judged!;
            expect([j.steps, j.flipped, j.outs, j.hash], [t['steps'], t['flipped'], t['outs'], h64(t['hashJudge'] as String)], reason: '$tt 판정');
            if (clock.key == '120Hz') expect(maxPerFrame, 1, reason: '120Hz 화면 = 프레임당 정확히 1스텝');
            if (clock.key == '60Hz') expect(maxPerFrame, 2);
            final taken = sim.takeAndRestack();
            expect(taken, t['flipped']);
            if (sim.seed != seed) break; // 다 가져감 → LiveSim 은 새 판(seed + 1), CLI 는 빈 책상 — 대조는 여기까지
            while (sim.phase == LivePhase.settling) {
              sim.advance(clock.value(frame++));
              expect(frame, lessThan(8000));
            }
            expect(sim.settleSteps, t['settleSteps'], reason: '$tt 다시 쌓기 스텝');
            expect(sim.stateHash, h64(t['hashRest'] as String), reason: '$tt 다시 쌓은 더미');
          }
          sim.dispose();
        }
      });
    }

    test('리눅스 데스크톱 실제 앱(AOT profile · Impeller · 2FPS 소프트웨어 GL · 프레임당 8스텝 상한)의 벤치 2번째 샷 해시 재현', () {
      // demo_page.dart 벤치 순서 그대로: seed 1 · 20장 → (위에서 3장째, 0, ×0.9) → 가져가기(minLive 6)·다시 쌓기 → (3장째, +0.45, ×0.95)
      // 화면 시계가 전혀 달라도(실제 앱 ≈ 0.5초/프레임, 여기 = 정확한 120Hz) 스텝 수로만 정해지므로 같은 해시여야 한다.
      // 기댓값: docs/app/native-spike.md 의 리눅스 화면(판정 169스텝 · 뒤집힘 11 · 원 밖 2 · 해시 26ac3929b178c298)
      final sim = LiveSim(lib, n: 20, seed: 1);
      final shots = [(2, 0.0, 0.9), (2, 0.45, 0.95)];
      LiveJudge? j;
      final log = <String>[];
      for (final (k, lat, ratio) in shots) {
        if (sim.phase == LivePhase.judged) {
          sim.takeAndRestack(minLive: 6);
          while (sim.phase == LivePhase.settling) {
            sim.advance(1 / 120);
          }
        }
        sim.fire(lat: lat, h: sim.layerY(math.min(k, sim.live - 1)), breath: ratio * sweetHiFor(sim.live));
        while (sim.phase == LivePhase.flying) {
          sim.advance(1 / 120);
        }
        j = sim.judge;
        log.add('${sim.seed}-${sim.turn}: ${j!.flipped}/${j.outs} ${ffi.hex64(j.hash).substring(0, 8)} (${j.steps}스텝)');
      }
      // ignore: avoid_print
      print('데모 HUD \'판정\' 줄에 나와야 할 값: ${log.join('  ')}');
      expect([j!.steps, j.flipped, j.outs, ffi.hex64(j.hash)], [169, 11, 2, '26ac3929b178c298']);
      sim.dispose();
    });

    test('렌더 버퍼: 플래그(그림 위·원 안) = 판정, 가져간 딱지 = 제거 표시, 보간 비율', () {
      final sim = LiveSim(lib, n: 16, seed: 77);
      sim.fire(lat: 0, h: sim.layerY(2), breath: 0.9 * sweetHiFor(16));
      while (sim.phase == LivePhase.flying) {
        sim.advance(11111 / 1e6);
      }
      final j = sim.judge!;
      var up = 0;
      for (var i = 0; i < 16; i++) {
        final f = sim.cur[i * kFloatsPerDisc + 7].toInt();
        if (f & kFlagFaceUp != 0 && f & kFlagInCircle != 0) up++;
      }
      expect(up, j.flipped);
      expect(sim.alpha, 1.0, reason: '판정 순간은 마지막 자세 그대로');
      sim.takeAndRestack();
      var removed = 0;
      for (var i = 0; i < 16; i++) {
        if (sim.cur[i * kFloatsPerDisc + 7].toInt() & kFlagRemoved != 0) removed++;
      }
      expect(removed, j.flipped);
      expect(sim.prev, sim.cur, reason: '다시 쌓기는 순간 이동 → 보간 안 함');
      sim.dispose();
    });

    test('다 가져가면 새 판(seed + 1)을 화면에서 가라앉힌다', () {
      final sim = LiveSim(lib, n: 1, seed: 7);
      sim.fire(lat: 0, h: sim.layerY(0), breath: 0.9 * sweetHiFor(1));
      while (sim.phase == LivePhase.flying) {
        sim.advance(1 / 120);
      }
      expect(sim.judge!.flipped, 1); // CLI 고정본 seed 7 n 1 = 1장 뒤집힘
      sim.takeAndRestack();
      expect(sim.seed, 8);
      expect(sim.phase, LivePhase.settling);
      while (sim.phase == LivePhase.settling) {
        sim.advance(1 / 120);
      }
      expect(sim.live, 1);
      // 같은 seed 로 한 번에 가라앉힌 판과 같은 해시
      final ref = LiveSim(lib, n: 1, seed: 8);
      expect(sim.stateHash, ref.stateHash);
      ref.dispose();
      sim.dispose();
    });

    test('프레임 비용: 20장 판 한 샷(advance = 스텝 + 자세 읽기 + 복사) — 120Hz 예산 8.3ms 대비', () {
      final sim = LiveSim(lib, n: 20, seed: 3);
      final per = <int>[];
      for (var rep = 0; rep < 3; rep++) {
        sim.fire(lat: 0, h: sim.layerY(2), breath: 0.9 * sweetHiFor(sim.live));
        while (sim.phase == LivePhase.flying) {
          final sw = Stopwatch()..start();
          sim.advance(1 / 120);
          per.add(sw.elapsedMicroseconds);
        }
        sim.takeAndRestack();
        while (sim.phase == LivePhase.settling) {
          sim.advance(1 / 120);
        }
        if (sim.live < 2) break;
      }
      per.sort();
      final p50 = per[per.length ~/ 2], p95 = per[(per.length * 0.95).floor()], mx = per.last;
      // ignore: avoid_print
      print('LiveSim.advance (1스텝/프레임, 20장 이하, 디버그 JIT · x86 컨테이너): p50 $p50µs · p95 $p95µs · max $mxµs · ${per.length}프레임');
      expect(p50, lessThan(8333), reason: '120Hz 한 프레임 예산의 몇 % 인지는 실기기 HUD 로 다시 잰다');
    });
  });

  test('고정본 = 지금 Rust CLI 출력 (CLI 가 있으면)', skip: File(_cli).existsSync() ? null : 'puff_parity 없음 — cargo build --release', () {
    final r = Process.runSync(_cli, ['shots']);
    expect(r.exitCode, 0, reason: '${r.stderr}');
    final live = jsonDecode(r.stdout as String);
    expect(live, fx, reason: '고정본이 낡음 → native/puff_sim/target/release/puff_parity shots > test/fixtures/sim_cli_shots.json');
  });

  test('h64 파서 ↔ hex64', () {
    for (final s in ['a6be48c3edfb264d', '0000000000000001', 'ffffffffffffffff', '7fffffffffffffff']) {
      expect(ffi.hex64(h64(s)), s);
    }
  });
}

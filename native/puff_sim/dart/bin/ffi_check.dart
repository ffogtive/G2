// ffi_check.dart — 리눅스 .so 로 dart:ffi 바인딩 확인 (Flutter 없이 dart 만).
//   cd native/puff_sim && cargo build --release && (cd dart && dart run bin/ffi_check.dart ../target/release/libpuff_sim.so)
// 확인: 같은 시드 두 판 → 같은 해시·같은 결과, 프레임 버퍼 플래그 = 판정, 120Hz 한 프레임 비용.
import 'dart:io';
import 'package:puff_sim_ffi/puff_sim_ffi.dart';

void main(List<String> args) {
  final lib = PuffSimLib.open(args.isNotEmpty ? args[0] : '../target/release/libpuff_sim.so');
  stdout.writeln(lib.version);
  (int, int, int, int) round(int seed) {
    final t = lib.table(seed);
    t.addPile(16);
    t.settle();
    final ratio = t.shot(lat: 0, h: t.layerY(2), breath: 0.9 * lib.sweetHiFor(16), shakeSeed: 3);
    if ((ratio - 0.9).abs() > 1e-9) throw StateError('ratio $ratio');
    var steps = 0;
    final sw = Stopwatch()..start();
    var frameUs = 0;
    while (!t.stepJudge()) {
      final f0 = sw.elapsedMicroseconds;
      final f = t.frame(); // 렌더러가 매 프레임 읽는 것과 같음
      frameUs += sw.elapsedMicroseconds - f0;
      if (f.length != t.discCount * kPuffFloatsPerDisc) throw StateError('frame len');
      steps++;
    }
    final f = t.frame();
    var up = 0;
    for (var i = 0; i < t.discCount; i++) {
      final fl = f[i * kPuffFloatsPerDisc + 7].toInt();
      if (fl & kFlagFaceUp != 0 && fl & kFlagInCircle != 0) up++;
    }
    if (up != t.flipped) throw StateError('flags $up != flipped ${t.flipped}');
    final r = (t.stateHash, steps, t.flipped, (sw.elapsedMicroseconds / steps).round());
    stdout.writeln('seed $seed: hash ${hex64(t.stateHash)} steps $steps flipped ${t.flipped} outs ${t.outs} · '
        'step+frame ${r.$4}µs (frame 읽기 ${(frameUs / steps).toStringAsFixed(1)}µs)');
    t.dispose();
    return r;
  }

  final a = round(77), b = round(77);
  if (a.$1 != b.$1 || a.$2 != b.$2 || a.$3 != b.$3) {
    stderr.writeln('비결정!');
    exit(1);
  }
  stdout.writeln('ok: dart:ffi 같은 시드 → 같은 해시');
}

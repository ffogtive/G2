// Rust 물리(native/puff_sim) — dart:ffi. 바인딩은 path 패키지 puff_sim_ffi(native/puff_sim/dart) 하나를 앱·CLI 확인이 같이 쓴다.
// iOS: DynamicLibrary.process() (정적 링크 — native/puff_sim/ios/PuffSim.xcconfig, docs/app/native-spike.md)
// 안드로이드: libpuff_sim.so (jniLibs, native/puff_sim/scripts/build-android.sh) / 리눅스 테스트: target/release/libpuff_sim.so
import 'dart:typed_data';

import 'package:puff_sim_ffi/puff_sim_ffi.dart' as ffi;

import 'sim_core.dart';

(SimLibrary?, String?) openSimLibraryImpl(String? libPath) {
  try {
    final lib = ffi.PuffSimLib.open(libPath);
    return (_FfiLibrary(lib, lib.version), null);
  } catch (e) {
    // iOS 에서 정적 링크를 안 했으면(build-ios.sh 를 안 돌림) 'symbol not found' — 웹뷰 게임은 그대로, 데모만 녹화 재생
    return (null, 'Rust 물리 라이브러리를 못 엶: $e');
  }
}

class _FfiLibrary implements SimLibrary {
  _FfiLibrary(this.lib, this.version);
  final ffi.PuffSimLib lib;
  @override
  final String version;
  @override
  SimCore create(int seed) => _FfiCore(lib.table(seed));
}

class _FfiCore implements SimCore {
  _FfiCore(this.t);
  final ffi.PuffTable t;
  @override
  int get discCount => t.discCount;
  @override
  void addPile(int n) => t.addPile(n);
  @override
  int settle([int maxSteps = 600]) => t.settle(maxSteps);
  @override
  void settleBegin() => t.settleBegin();
  @override
  bool settleStep([int maxSteps = 600]) => t.settleStep(maxSteps);
  @override
  double layerY(int k) => t.layerY(k);
  @override
  Float64List info() => t.info();
  @override
  int get rngState => t.rngState;
  @override
  set rngState(int s) => t.rngState = s;
  @override
  void blow({required double aimX, required double aimY, required double aimZ, required double power, required double blast, double dirX = 0, double dirZ = -1, double? mouthY}) =>
      t.blow(aimX: aimX, aimY: aimY, aimZ: aimZ, power: power, blast: blast, dirX: dirX, dirZ: dirZ, mouthY: mouthY);
  @override
  bool stepJudge() => t.stepJudge();
  @override
  Float32List frame() => t.frame();
  @override
  int takeFlipped() => t.takeFlipped();
  @override
  void restack() => t.restack();
  @override
  int get stateHash => t.stateHash;
  @override
  void dispose() => t.dispose();
}

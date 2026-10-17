// 물리 한 판의 최소 인터페이스 — 렌더러·입력(live_sim.dart, demo_page.dart)은 이것만 본다.
// 구현: sim_core_ffi.dart(Rust native/puff_sim, dart:ffi) / sim_core_stub.dart(웹 빌드 · 라이브러리 없음 → 녹화 재생으로).
// dart:ffi 는 웹에서 컴파일이 안 되므로 조건부 import 로 고른다(웹 확인 빌드 app/tool/web_check.mjs 가 계속 돈다).
import 'dart:typed_data';

import 'sim_core_stub.dart' if (dart.library.ffi) 'sim_core_ffi.dart' as impl;

/// 자세 버퍼: 딱지마다 f32 8개 [px, py, pz, qx, qy, qz, qw, flags] (오른손, sim.js 와 같은 단위)
const int kFloatsPerDisc = 8;
const int kFlagRemoved = 1, kFlagOff = 2, kFlagFaceUp = 4, kFlagInCircle = 8, kFlagHeavy = 16, kFlagWind = 32;

/// info() 칸 (puff_info)
const int kInfoTop = 0, kInfoCx = 1, kInfoCz = 2, kInfoLive = 3, kInfoFlipped = 4, kInfoOuts = 5, kInfoPuff = 6, kInfoMaxSpeed = 7, kInfoJudgeN = 8, kInfoSteps = 9;

/// 한 판(책상 + 더미). UI isolate 에서만, 다 쓰면 dispose()
abstract class SimCore {
  int get discCount;
  void addPile(int n);
  int settle([int maxSteps = 600]);
  void settleBegin();
  bool settleStep([int maxSteps = 600]);
  double layerY(int k);
  Float64List info();
  int get rngState;
  set rngState(int s);
  void blow({required double aimX, required double aimY, required double aimZ, required double power, required double blast, double dirX = 0, double dirZ = -1, double? mouthY});
  bool stepJudge();
  Float32List frame();
  int takeFlipped();
  void restack();
  int get stateHash;
  void dispose();
}

/// 물리 라이브러리 (판을 만든다)
abstract class SimLibrary {
  String get version;
  SimCore create(int seed);
}

/// 라이브러리 열기. 실패하면 (null, 이유). libPath = 리눅스·맥 테스트용 경로(앱은 null → 플랫폼 기본)
(SimLibrary?, String?) openSimLibrary({String? libPath}) => impl.openSimLibraryImpl(libPath);

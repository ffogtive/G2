// puff_sim_ffi.dart — Rust 딱지 물리(native/puff_sim)의 dart:ffi 바인딩. 의존성 없음(dart:ffi 만, malloc 안 씀).
//
// 왜 plain dart:ffi(flutter_rust_bridge 아님): 프레임마다(120Hz) 동기 호출 몇 개 + 라이브러리가 들고 있는 고정 버퍼
//   (자세 f32 · 판 상태 f64 · 샷 결과 f64)를 복사 없이 읽는 것뿐이다. FRB 의 코드 생성·비동기 런타임·직렬화가 얻을 게 없고,
//   호출 하나가 0.1µs 대인 동기 leaf 호출이 120Hz 루프에 가장 맞다. 헤더 = native/puff_sim/include/puff_sim.h
//
// 로딩: iOS = DynamicLibrary.process() (정적 링크, native/puff_sim/ios/PuffSim.xcconfig) / 안드로이드 'libpuff_sim.so' (jniLibs)
//       / 리눅스·맥 데스크톱 테스트 = 경로 직접(target/release/libpuff_sim.so · .dylib).
// 좌표는 웹 sim.js 와 같은 오른손(딱지 반지름 1, +Y 위). flutter_scene(왼손)으로는 app/lib/native/coords.dart 가 바꾼다.
// 앱(app/)은 path 의존성으로 이 패키지를 쓴다: puff_sim_ffi: { path: ../native/puff_sim/dart }
import 'dart:ffi';
import 'dart:io' show Platform;
import 'dart:typed_data';

typedef _NewC = Pointer<Void> Function(Uint32);
typedef _NewD = Pointer<Void> Function(int);
typedef _VoidC = Void Function(Pointer<Void>);
typedef _VoidD = void Function(Pointer<Void>);
typedef _AddPileC = Uint32 Function(Pointer<Void>, Uint32, Double, Double, Double, Uint64);
typedef _AddPileD = int Function(Pointer<Void>, int, double, double, double, int);
typedef _U32U32C = Uint32 Function(Pointer<Void>, Uint32);
typedef _U32U32D = int Function(Pointer<Void>, int);
typedef _U32C = Uint32 Function(Pointer<Void>);
typedef _U32D = int Function(Pointer<Void>);
typedef _ShotC = Double Function(Pointer<Void>, Double, Double, Double, Double, Double, Double, Uint32, Uint32);
typedef _ShotD = double Function(Pointer<Void>, double, double, double, double, double, double, int, int);
typedef _FrameC = Pointer<Float> Function(Pointer<Void>);
typedef _FrameD = Pointer<Float> Function(Pointer<Void>);
typedef _F64C = Double Function(Pointer<Void>);
typedef _F64D = double Function(Pointer<Void>);
typedef _LayerC = Double Function(Pointer<Void>, Uint32);
typedef _LayerD = double Function(Pointer<Void>, int);
typedef _HashC = Uint64 Function(Pointer<Void>);
typedef _HashD = int Function(Pointer<Void>);
typedef _RestackC = Void Function(Pointer<Void>, Double, Double);
typedef _RestackD = void Function(Pointer<Void>, double, double);
typedef _SweetC = Double Function(Uint32);
typedef _SweetD = double Function(int);
typedef _RunC = Uint32 Function(Pointer<Void>, Double);
typedef _RunD = int Function(Pointer<Void>, double);
typedef _BlowVC = Uint32 Function(Pointer<Void>, Double, Double, Double, Double, Double, Double, Double, Double, Uint32);
typedef _BlowVD = int Function(Pointer<Void>, double, double, double, double, double, double, double, double, int);
typedef _FireVC = Pointer<Double> Function(Pointer<Void>, Double, Double, Double, Double, Double, Double, Uint32, Uint32);
typedef _FireVD = Pointer<Double> Function(Pointer<Void>, double, double, double, double, double, double, int, int);
typedef _ResolveVC = Pointer<Double> Function(Pointer<Void>, Uint32, Double, Double, Double, Double, Uint32);
typedef _ResolveVD = Pointer<Double> Function(Pointer<Void>, int, double, double, double, double, int);
typedef _InfoC = Pointer<Double> Function(Pointer<Void>);
typedef _InfoD = Pointer<Double> Function(Pointer<Void>);
typedef _SetU32C = Void Function(Pointer<Void>, Uint32);
typedef _SetU32D = void Function(Pointer<Void>, int);
typedef _MathC = Double Function(Uint32, Double);
typedef _MathD = double Function(int, double);
typedef _VerC = Pointer<Uint8> Function();
typedef _VerD = Pointer<Uint8> Function();

/// 딱지 한 장 = f32 8개: px py pz qx qy qz qw flags
const int kPuffFloatsPerDisc = 8;
const int kFlagRemoved = 1, kFlagOff = 2, kFlagFaceUp = 4, kFlagInCircle = 8, kFlagHeavy = 16, kFlagWind = 32;

/// puff_info 칸 (PUFF_INFO_LEN = 12)
const int kInfoLen = 12;
const int kInfoTop = 0, kInfoCx = 1, kInfoCz = 2, kInfoLive = 3, kInfoFlipped = 4, kInfoOuts = 5, kInfoPuff = 6, kInfoMaxSpeed = 7, kInfoJudgeN = 8, kInfoSteps = 9, kInfoTime = 10;

/// puff_fire_v / puff_resolve_v 칸 (PUFF_RES_LEN = 10)
const int kResLen = 10;
const int kResRatio = 0, kResPower = 1, kResBlast = 2, kResLat = 3, kResH = 4, kResOver = 5, kResAimX = 6, kResAimY = 7, kResAimZ = 8, kResRng = 9;

class PuffSimLib {
  PuffSimLib(DynamicLibrary lib)
      : _new = lib.lookupFunction<_NewC, _NewD>('puff_new', isLeaf: true),
        _free = lib.lookupFunction<_VoidC, _VoidD>('puff_free', isLeaf: true),
        _addPile = lib.lookupFunction<_AddPileC, _AddPileD>('puff_add_pile', isLeaf: true),
        _settle = lib.lookupFunction<_U32U32C, _U32U32D>('puff_settle', isLeaf: true),
        _shot = lib.lookupFunction<_ShotC, _ShotD>('puff_shot_v', isLeaf: true),
        _step = lib.lookupFunction<_U32U32C, _U32U32D>('puff_step', isLeaf: true),
        _stepJudge = lib.lookupFunction<_U32C, _U32D>('puff_step_judge', isLeaf: true),
        _runUntilSettled = lib.lookupFunction<_RunC, _RunD>('puff_run_until_settled', isLeaf: true),
        _discCount = lib.lookupFunction<_U32C, _U32D>('puff_disc_count', isLeaf: true),
        _frame = lib.lookupFunction<_FrameC, _FrameD>('puff_frame', isLeaf: true),
        _flipped = lib.lookupFunction<_U32C, _U32D>('puff_flipped_count', isLeaf: true),
        _outs = lib.lookupFunction<_U32C, _U32D>('puff_out_count', isLeaf: true),
        _takeFlipped = lib.lookupFunction<_U32C, _U32D>('puff_take_flipped', isLeaf: true),
        _restack = lib.lookupFunction<_RestackC, _RestackD>('puff_restack', isLeaf: true),
        _columnTop = lib.lookupFunction<_F64C, _F64D>('puff_column_top', isLeaf: true),
        _layerY = lib.lookupFunction<_LayerC, _LayerD>('puff_layer_y', isLeaf: true),
        _hash = lib.lookupFunction<_HashC, _HashD>('puff_state_hash', isLeaf: true),
        _blowV = lib.lookupFunction<_BlowVC, _BlowVD>('puff_blow_v', isLeaf: true),
        _fireV = lib.lookupFunction<_FireVC, _FireVD>('puff_fire_v', isLeaf: true),
        _resolveV = lib.lookupFunction<_ResolveVC, _ResolveVD>('puff_resolve_v', isLeaf: true),
        _rngState = lib.lookupFunction<_U32C, _U32D>('puff_rng_state', isLeaf: true),
        _setRngState = lib.lookupFunction<_SetU32C, _SetU32D>('puff_set_rng_state', isLeaf: true),
        _info = lib.lookupFunction<_InfoC, _InfoD>('puff_info', isLeaf: true),
        _settleBegin = lib.lookupFunction<_VoidC, _VoidD>('puff_settle_begin', isLeaf: true),
        _settleStep = lib.lookupFunction<_U32U32C, _U32U32D>('puff_settle_step', isLeaf: true),
        mathV = lib.lookupFunction<_MathC, _MathD>('puff_math_v', isLeaf: true),
        _version = lib.lookupFunction<_VerC, _VerD>('puff_version_cstr', isLeaf: true),
        sweetHiFor = lib.lookupFunction<_SweetC, _SweetD>('puff_sweet_hi_for', isLeaf: true);

  /// 플랫폼 기본 로딩 (리눅스·맥 데스크톱 테스트는 path 를 넘길 것)
  factory PuffSimLib.open([String? path]) {
    if (path != null) return PuffSimLib(DynamicLibrary.open(path));
    if (Platform.isIOS) return PuffSimLib(DynamicLibrary.process());
    if (Platform.isAndroid) return PuffSimLib(DynamicLibrary.open('libpuff_sim.so'));
    if (Platform.isMacOS) return PuffSimLib(DynamicLibrary.open('libpuff_sim.dylib'));
    return PuffSimLib(DynamicLibrary.open('libpuff_sim.so'));
  }

  final _NewD _new;
  final _VoidD _free;
  final _AddPileD _addPile;
  final _U32U32D _settle;
  final _ShotD _shot;
  final _U32U32D _step;
  final _U32D _stepJudge;
  final _RunD _runUntilSettled;
  final _U32D _discCount;
  final _FrameD _frame;
  final _U32D _flipped;
  final _U32D _outs;
  final _U32D _takeFlipped;
  final _RestackD _restack;
  final _F64D _columnTop;
  final _LayerD _layerY;
  final _HashD _hash;
  final _BlowVD _blowV;
  final _FireVD _fireV;
  final _ResolveVD _resolveV;
  final _U32D _rngState;
  final _SetU32D _setRngState;
  final _InfoD _info;
  final _VoidD _settleBegin;
  final _U32U32D _settleStep;
  final _VerD _version;
  final double Function(int) sweetHiFor;

  /// 검증용 순수 Rust libm: 0 log, 1 cos, 2 sin, 3 sqrt, 4 pow(x, 2)
  final double Function(int, double) mathV;

  /// 엔진·규칙 버전 (예: 'puff_sim 0.1.0 rapier3d 0.36.0 tune fa54…') — PvP 양쪽이 같은 엔진인지
  String get version {
    final p = _version();
    final b = <int>[];
    for (var i = 0; i < 256; i++) {
      final c = p[i];
      if (c == 0) break;
      b.add(c);
    }
    return String.fromCharCodes(b);
  }

  PuffTable table(int seed) => PuffTable._(this, _new(seed));
}

/// 한 판(책상 + 더미). 한 isolate(보통 UI)에서만 쓴다. 다 쓰면 dispose().
class PuffTable {
  PuffTable._(this._l, this._p);
  final PuffSimLib _l;
  Pointer<Void> _p;
  Float64List? _infoView, _resView;

  int addPile(int n, {double spread = 0.07, double atX = 0, double atZ = 0, int heavyMask = 0}) => _l._addPile(_p, n, spread, atX, atZ, heavyMask);
  int settle([int maxSteps = 600]) => _l._settle(_p, maxSteps);

  /// 게임 샷(숨 해석까지 Rust 가): breath = 손가락 숨(정답 = sweetHiFor(n)), h = 노릴 높이(절대 y). 반환: 숨 비율(1 초과 = 돌풍)
  double shot({required double lat, required double h, required double breath, double dirX = 0, double dirZ = -1, double? mouthY, int shakeSeed = 1}) =>
      _l._shot(_p, lat, h, breath, dirX, dirZ, mouthY ?? 0, mouthY == null ? 0 : 1, shakeSeed);

  /// 숨 해석을 밖(Dart)에서 했을 때: 물리 세기·돌풍·조준점(절대 좌표)만 넘긴다. dist 2.6 · pitch 0.1(게임 기본)
  void blow({required double aimX, required double aimY, required double aimZ, required double power, double blast = 0, double dirX = 0, double dirZ = -1, double? mouthY}) =>
      _l._blowV(_p, aimX, aimY, aimZ, dirX, dirZ, power, blast, mouthY ?? 0, mouthY == null ? 0 : 1);

  /// 한 턴 쏘기(turn.js 순서, 숨 해석까지 Rust). 반환: 결과 뷰(kRes* 칸) — 다음 fire/resolve 전까지 유효
  Float64List fire({required double lat, required double h, required double breath, required int puffSeed, double dirX = 0, double dirZ = -1, double? mouthY}) {
    final p = _l._fireV(_p, lat, h, breath, dirX, dirZ, mouthY ?? 0, mouthY == null ? 0 : 1, puffSeed);
    return _resView ??= p.asTypedList(kResLen);
  }

  /// 숨 해석만(물리 안 건드림) — Dart 포팅과 비트 대조하는 기준. 반환: 결과 뷰(kRes*)
  Float64List resolve({required int n, required double top, required double lat, required double h, required double breath, required int rngState}) {
    final p = _l._resolveV(_p, n, top, lat, h, breath, rngState);
    return _resView ??= p.asTypedList(kResLen);
  }

  /// 판 난수(mulberry32) 상태 — Dart resolveShot 이 쓴 줄기를 blow 의 jitter 로 이어 줄 때
  int get rngState => _l._rngState(_p);
  set rngState(int s) => _l._setRngState(_p, s);

  /// 판 상태(kInfo* 칸)를 새로 채운 뷰. 주소가 고정이라 뷰는 한 번만 만든다(할당 없음)
  Float64List info() {
    final p = _l._info(_p);
    return _infoView ??= p.asTypedList(kInfoLen);
  }

  /// n 스텝(1/120초씩). 반환: 바람이 아직 부는가
  bool step([int n = 1]) => _l._step(_p, n) != 0;

  /// 1스텝 + PvP 스텝 판정(멈춤 순간이면 true)
  bool stepJudge() => _l._stepJudge(_p) != 0;

  /// settle 을 프레임마다 나눠서: settleBegin() 뒤 스텝마다 settleStep() → true 면 끝 (settle() 과 같은 해시)
  void settleBegin() => _l._settleBegin(_p);
  bool settleStep([int maxSteps = 600]) => _l._settleStep(_p, maxSteps) != 0;

  int runUntilSettled([double maxSec = 6]) => _l._runUntilSettled(_p, maxSec);
  int get discCount => _l._discCount(_p);

  /// 이번 프레임 자세 — 라이브러리 버퍼를 복사 없이 본다(다음 frame() 호출 전까지 유효)
  Float32List frame() {
    final ptr = _l._frame(_p);
    return ptr.asTypedList(discCount * kPuffFloatsPerDisc);
  }

  int get flipped => _l._flipped(_p);
  int get outs => _l._outs(_p);
  int takeFlipped() => _l._takeFlipped(_p);
  void restack({double atX = 0, double atZ = 0}) => _l._restack(_p, atX, atZ);
  double get columnTop => _l._columnTop(_p);

  /// 위에서 k 번째(0 = 맨 위) 딱지 중심 높이 (공략 '위에서 3장째' = layerY(2)). 없으면 −1
  double layerY(int k) => _l._layerY(_p, k);

  /// 상태 해시(FNV-1a 64) — 같은 시드·같은 입력이면 iOS·안드로이드·리눅스·WASM 모두 같은 값
  int get stateHash => _l._hash(_p);

  bool get disposed => _p == nullptr;

  void dispose() {
    if (_p != nullptr) {
      _l._free(_p);
      _p = nullptr;
      _infoView = null;
      _resView = null;
    }
  }
}

/// 64비트 해시를 C·Rust 와 같은 16진수로 (Dart int 는 부호 있는 64비트)
String hex64(int v) => (v >>> 32).toRadixString(16).padLeft(8, '0') + (v & 0xffffffff).toRadixString(16).padLeft(8, '0');

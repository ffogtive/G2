// puff_sim_ffi.dart — Rust 딱지 물리(native/puff_sim)의 dart:ffi 바인딩. 의존성 없음(dart:ffi 만, malloc 안 씀).
//
// 왜 plain dart:ffi: 프레임마다(120Hz) 동기 호출 몇 개 + 라이브러리가 들고 있는 f32 자세 버퍼 하나를 복사 없이 읽는 것뿐이라
//   flutter_rust_bridge 의 코드 생성·비동기 런타임이 얻을 게 없다. 헤더 = native/puff_sim/include/puff_sim.h
//
// 로딩: 안드로이드 'libpuff_sim.so' / iOS DynamicLibrary.process() (PuffSim.xcframework 정적 링크) / 리눅스 테스트 = 경로 직접.
// 좌표는 웹 sim.js 와 같은 오른손(딱지 반지름 1, +Y 위). flutter_scene(왼손)으로는 app/lib/native/coords.dart 가 바꾼다.
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

/// 딱지 한 장 = f32 8개: px py pz qx qy qz qw flags
const int kPuffFloatsPerDisc = 8;
const int kFlagRemoved = 1, kFlagOff = 2, kFlagFaceUp = 4, kFlagInCircle = 8, kFlagHeavy = 16, kFlagWind = 32;

class PuffSimLib {
  PuffSimLib(DynamicLibrary lib)
      : _new = lib.lookupFunction<_NewC, _NewD>('puff_new'),
        _free = lib.lookupFunction<_VoidC, _VoidD>('puff_free'),
        _addPile = lib.lookupFunction<_AddPileC, _AddPileD>('puff_add_pile'),
        _settle = lib.lookupFunction<_U32U32C, _U32U32D>('puff_settle'),
        _shot = lib.lookupFunction<_ShotC, _ShotD>('puff_shot_v'),
        _step = lib.lookupFunction<_U32U32C, _U32U32D>('puff_step'),
        _stepJudge = lib.lookupFunction<_U32C, _U32D>('puff_step_judge'),
        _runUntilSettled = lib.lookupFunction<_RunC, _RunD>('puff_run_until_settled'),
        _discCount = lib.lookupFunction<_U32C, _U32D>('puff_disc_count'),
        _frame = lib.lookupFunction<_FrameC, _FrameD>('puff_frame'),
        _flipped = lib.lookupFunction<_U32C, _U32D>('puff_flipped_count'),
        _outs = lib.lookupFunction<_U32C, _U32D>('puff_out_count'),
        _takeFlipped = lib.lookupFunction<_U32C, _U32D>('puff_take_flipped'),
        _restack = lib.lookupFunction<_RestackC, _RestackD>('puff_restack'),
        _columnTop = lib.lookupFunction<_F64C, _F64D>('puff_column_top'),
        _layerY = lib.lookupFunction<_LayerC, _LayerD>('puff_layer_y'),
        _hash = lib.lookupFunction<_HashC, _HashD>('puff_state_hash'),
        sweetHiFor = lib.lookupFunction<_SweetC, _SweetD>('puff_sweet_hi_for');

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
  final double Function(int) sweetHiFor;

  PuffTable table(int seed) => PuffTable._(this, _new(seed));
}

/// 한 판(책상 + 더미). 한 isolate(보통 UI)에서만 쓴다. 다 쓰면 dispose().
class PuffTable {
  PuffTable._(this._l, this._p);
  final PuffSimLib _l;
  Pointer<Void> _p;

  int addPile(int n, {double spread = 0.07, double atX = 0, double atZ = 0, int heavyMask = 0}) => _l._addPile(_p, n, spread, atX, atZ, heavyMask);
  int settle([int maxSteps = 600]) => _l._settle(_p, maxSteps);

  /// 게임 샷: breath = 손가락 숨(정답 = sweetHiFor(n)), h = 노릴 높이(절대 y). 반환: 숨 비율(1 초과 = 돌풍)
  double shot({required double lat, required double h, required double breath, double dirX = 0, double dirZ = -1, double? mouthY, int shakeSeed = 1}) =>
      _l._shot(_p, lat, h, breath, dirX, dirZ, mouthY ?? 0, mouthY == null ? 0 : 1, shakeSeed);

  /// n 스텝(1/120초씩). 반환: 바람이 아직 부는가
  bool step([int n = 1]) => _l._step(_p, n) != 0;

  /// 1스텝 + PvP 스텝 판정(멈춤 순간이면 true)
  bool stepJudge() => _l._stepJudge(_p) != 0;
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

  /// 위에서 k 번째(0 = 맨 위) 딱지 중심 높이 (공략 '위에서 3장째' = layerY(2))
  double layerY(int k) => _l._layerY(_p, k);

  /// 상태 해시(FNV-1a 64) — 같은 시드·같은 입력이면 iOS·안드로이드·리눅스·WASM 모두 같은 값
  int get stateHash => _l._hash(_p);

  void dispose() {
    if (_p != nullptr) {
      _l._free(_p);
      _p = nullptr;
    }
  }
}

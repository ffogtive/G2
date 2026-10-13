// 결정적 수학 — 숨 해석(resolveShot)이 쓰는 난수·log·cos 를 '기기와 상관없이 같은 비트'로.
//
// 🧭 가설(확인됨, test/native_sim_ffi_test.dart): dart:math 의 log·cos 는 플랫폼 libm(iOS = Apple libm, 안드로이드 = bionic,
//   리눅스 = glibc)을 불러서 마지막 비트가 기기마다 다를 수 있다 → 숨이 넘친 샷의 조준 흔들림(gauss)이 1ulp 달라지면
//   물리 해시가 갈라져 PvP 가 깨진다. Rust 물리는 순수 Rust libm(FreeBSD msun = fdlibm 계열)을 쓰므로 같은 알고리즘을
//   Dart 로 옮기면(덧셈·곱셈 순서까지 그대로, Dart 는 FMA 축약을 안 함) Rust 와 비트 단위로 같고 기기와도 무관하다.
//   sqrt 는 IEEE 정확 반올림이라 어디서나 같다 → dart:math 그대로.
//
// 출처: libm 0.2.16 (rust-lang/libm) src/math/{log,cos,k_cos,k_sin,rem_pio2}.rs ← FreeBSD msun e_log.c · s_cos.c (Sun 1993, 자유 이용 허가문 유지)
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//   Developed at SunSoft, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice is preserved.
import 'dart:math' as math;
import 'dart:typed_data';

final ByteData _bits = ByteData(8);

int _hi(double x) {
  _bits.setFloat64(0, x, Endian.little);
  return _bits.getUint32(4, Endian.little);
}

int _lo(double x) {
  _bits.setFloat64(0, x, Endian.little);
  return _bits.getUint32(0, Endian.little);
}

double _fromWords(int hi, int lo) {
  _bits.setUint32(4, hi & 0xffffffff, Endian.little);
  _bits.setUint32(0, lo & 0xffffffff, Endian.little);
  return _bits.getFloat64(0, Endian.little);
}

/// 32비트 곱의 아래 32비트(JS Math.imul 의 부호 없는 판). 16비트로 쪼개 2^53 안에서만 계산 → 웹(dart2js)에서도 같다
int _imul(int a, int b) => ((a & 0xffff) * b + ((((a >>> 16) * b) & 0xffff) << 16)) & 0xffffffff;

/// sim.js·rules.js `mulberry32` / Rust `Mulberry32` 와 같은 수열 (같은 시드 → 같은 비트)
class Mulberry32 {
  Mulberry32(int seed) : _a = seed & 0xffffffff;
  int _a;

  /// 다음 수를 뽑기 전 내부 상태 — Rust 판 난수로 넘길 때(puff_set_rng_state)
  int get state => _a;

  double next() {
    _a = (_a + 0x6d2b79f5) & 0xffffffff;
    final a = _a;
    var t = _imul(a ^ (a >>> 15), 1 | a);
    t = ((t + _imul(t ^ (t >>> 7), 61 | t)) & 0xffffffff) ^ t;
    return ((t ^ (t >>> 14)) & 0xffffffff) / 4294967296.0;
  }
}

/// Box–Muller (sim.js gauss). u, v 가 0 이면 다시 뽑는다 — 소비 순서까지 JS·Rust 와 같게
double gauss(Mulberry32 rng) {
  var u = 0.0;
  while (u == 0) {
    u = rng.next();
  }
  var v = 0.0;
  while (v == 0) {
    v = rng.next();
  }
  return math.sqrt(-2 * detLog(u)) * detCos(2 * math.pi * v);
}

// ── log (FreeBSD e_log.c) ─────────────────────────────────────
const double _ln2Hi = 6.93147180369123816490e-01; // 3fe62e42 fee00000
const double _ln2Lo = 1.90821492927058770002e-10; // 3dea39ef 35793c76
const double _lg1 = 6.666666666666735130e-01;
const double _lg2 = 3.999999999940941908e-01;
const double _lg3 = 2.857142874366239149e-01;
const double _lg4 = 2.222219843214978396e-01;
const double _lg5 = 1.818357216161805012e-01;
const double _lg6 = 1.531383769920937332e-01;
const double _lg7 = 1.479819860511658591e-01;

/// 자연로그 — Rust libm::log 와 비트 단위로 같다
double detLog(double x) {
  var hx = _hi(x);
  var lo = _lo(x);
  var k = 0;
  if (hx < 0x00100000 || (hx >>> 31) != 0) {
    if ((hx & 0x7fffffff) == 0 && lo == 0) return -1 / (x * x); // log(±0) = −inf
    if ((hx >>> 31) != 0) return (x - x) / 0.0; // log(음수) = NaN
    // 비정규 수: 2^54 배로 올린다
    k -= 54;
    x *= 18014398509481984.0; // 0x1p54
    hx = _hi(x);
    lo = _lo(x);
  } else if (hx >= 0x7ff00000) {
    return x;
  } else if (hx == 0x3ff00000 && lo == 0) {
    return 0.0;
  }
  // x 를 [√2/2, √2] 로
  hx += 0x3ff00000 - 0x3fe6a09e;
  k += (hx >>> 20) - 0x3ff;
  hx = (hx & 0x000fffff) + 0x3fe6a09e;
  x = _fromWords(hx, lo);
  final f = x - 1.0;
  final hfsq = 0.5 * f * f;
  final s = f / (2.0 + f);
  final z = s * s;
  final w = z * z;
  final t1 = w * (_lg2 + w * (_lg4 + w * _lg6));
  final t2 = z * (_lg1 + w * (_lg3 + w * (_lg5 + w * _lg7)));
  final r = t2 + t1;
  final dk = k.toDouble();
  return s * (hfsq + r) + dk * _ln2Lo - hfsq + f + dk * _ln2Hi;
}

// ── cos (FreeBSD s_cos.c + k_cos.c + k_sin.c + e_rem_pio2.c) ─────────────
const double _c1 = 4.16666666666666019037e-02;
const double _c2 = -1.38888888888741095749e-03;
const double _c3 = 2.48015872894767294178e-05;
const double _c4 = -2.75573143513906633035e-07;
const double _c5 = 2.08757232129817482790e-09;
const double _c6 = -1.13596475577881948265e-11;

double _kCos(double x, double y) {
  final z = x * x;
  final w = z * z;
  final r = z * (_c1 + z * (_c2 + z * _c3)) + w * w * (_c4 + z * (_c5 + z * _c6));
  final hz = 0.5 * z;
  final w2 = 1.0 - hz;
  return w2 + (((1.0 - w2) - hz) + (z * r - x * y));
}

const double _s1 = -1.66666666666666324348e-01;
const double _s2 = 8.33333333332248946124e-03;
const double _s3 = -1.98412698298579493134e-04;
const double _s4 = 2.75573137070700676789e-06;
const double _s5 = -2.50507602534068634195e-08;
const double _s6 = 1.58969099521155010221e-10;

double _kSin(double x, double y, int iy) {
  final z = x * x;
  final w = z * z;
  final r = _s2 + z * (_s3 + z * _s4) + z * w * (_s5 + z * _s6);
  final v = z * x;
  if (iy == 0) return x + v * (_s1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * _s1);
}

const double _toInt = 1.5 / 2.2204460492503131e-16;
const double _invPio2 = 6.36619772367581382433e-01;
const double _pio2_1 = 1.57079632673412561417e+00;
const double _pio2_1t = 6.07710050650619224932e-11;
const double _pio2_2 = 6.07710050630396597660e-11;
const double _pio2_2t = 2.02226624879595063154e-21;
const double _pio2_3 = 2.02226624871116645580e-21;
const double _pio2_3t = 8.47842766036889956997e-32;

/// x − n·π/2 = y0 + y1. |x| < 2^20·π/2 까지(gauss 는 0 < x < 2π). 그 밖은 null(호출한 쪽이 처리)
(int, double, double)? _remPio2(double x) {
  final hi = _hi(x);
  final sign = hi >>> 31;
  final ix = hi & 0x7fffffff;

  (int, double, double) medium() {
    final tmp = x * _invPio2 + _toInt;
    final fN = tmp - _toInt;
    final n = fN.toInt();
    var r = x - fN * _pio2_1;
    var w = fN * _pio2_1t;
    var y0 = r - w;
    final ex = ix >>> 20;
    var ey = (_hi(y0) >>> 20) & 0x7ff;
    if (ex - ey > 16) {
      var t = r;
      w = fN * _pio2_2;
      r = t - w;
      w = fN * _pio2_2t - ((t - r) - w);
      y0 = r - w;
      ey = (_hi(y0) >>> 20) & 0x7ff;
      if (ex - ey > 49) {
        t = r;
        w = fN * _pio2_3;
        r = t - w;
        w = fN * _pio2_3t - ((t - r) - w);
        y0 = r - w;
      }
    }
    final y1 = (r - y0) - w;
    return (n, y0, y1);
  }

  (int, double, double) near(int k) {
    final kk = k.toDouble();
    if (sign == 0) {
      final z = x - kk * _pio2_1;
      final y0 = z - kk * _pio2_1t;
      return (k, y0, (z - y0) - kk * _pio2_1t);
    }
    final z = x + kk * _pio2_1;
    final y0 = z + kk * _pio2_1t;
    return (-k, y0, (z - y0) + kk * _pio2_1t);
  }

  if (ix <= 0x400f6a7a) {
    // |x| ~<= 5π/4
    if ((ix & 0xfffff) == 0x921fb) return medium(); // |x| ~= π/2 또는 π
    if (ix <= 0x4002d97c) {
      // |x| ~<= 3π/4 — Rust 는 k = 1 일 때 PIO2_1 을 곱하지 않고 그대로 쓴다(1.0 × 값 = 같은 비트)
      return near(1);
    }
    return near(2);
  }
  if (ix <= 0x401c463b) {
    // |x| ~<= 9π/4
    if (ix <= 0x4015fdbc) {
      if (ix == 0x4012d97c) return medium(); // |x| ~= 3π/2
      return near(3);
    }
    if (ix == 0x401921fb) return medium(); // |x| ~= 2π
    return near(4);
  }
  if (ix < 0x413921fb) return medium();
  return null;
}

/// 코사인 — Rust libm::cos 와 비트 단위로 같다 (|x| < 2^20·π/2; 그 밖은 dart:math 로 — 숨 규칙은 쓰지 않는 범위)
double detCos(double x) {
  final ix = _hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    // |x| ~< π/4
    if (ix < 0x3e46a09e && x.toInt() == 0) return 1.0;
    return _kCos(x, 0.0);
  }
  if (ix >= 0x7ff00000) return x - x; // inf·NaN
  final r = _remPio2(x);
  if (r == null) return math.cos(x);
  final (n, y0, y1) = r;
  switch (n & 3) {
    case 0:
      return _kCos(y0, y1);
    case 1:
      return -_kSin(y0, y1, 1);
    case 2:
      return -_kCos(y0, y1);
    default:
      return _kSin(y0, y1, 1);
  }
}

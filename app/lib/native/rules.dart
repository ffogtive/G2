// 숨 규칙 — mockup/src/rules.js 에서 네이티브 입력(누르고 → 당기고 → 놓기)과 숨 해석(resolveShot)을 옮김. 값은 rules.js 와 같아야 한다
// (test/native_rules_test.dart = rules.js 표본, test/native_resolve_test.dart = resolveShot JS 표본 비트 대조,
//  test/native_sim_ffi_test.dart = Rust rules::resolve_shot 비트 대조). 물리는 Rust(native/puff_sim)가 한다.
import 'dart:math' as math;

import 'detmath.dart';

const double kPowerMax = 1.25;
const double kPouchFull = 1.12; // 꽉 = 숨 주머니 끝(모든 판의 정답보다 위)
const double kPouchDetent = 0.08; // 꽉에서 손가락이 이만큼 더 가도 숨이 안 늘어남 = 손끝 멈춤
const double kPouchGain = 0.4; // 그 너머는 고무줄처럼 뻑뻑하게 → 벽 kPowerMax
const double kStrainMs = 1400; // 꽉에서 버틸 수 있는 시간. 넘으면 콜록 = 취소
const double kStrainRecoverMs = 900;
const double kLeakAt = 0.35; // 버팀이 이만큼 차면 입꼬리로 김이 샘(연출)
const double kGreenLo = 0.78; // 초록 = 정답의 0.78~1.0배
const double kPull = 0.42; // 당김 1 = 화면 짧은 변 × 0.42 (main.js TUNE_DEFAULTS.pull)
const double kDiscR = 1.0, kDiscH = 0.11, kCircleR = 3.2;

double _clamp(double v, double a, double b) => math.max(a, math.min(b, v));

/// 1장 ≈ 0.45, 20장 = 0.95, 40장 ≈ 1.12
double sweetHiFor(int n) => _clamp(0.45 + 0.5 * math.sqrt((math.max(1, n) - 1) / 19), 0.45, 1.12);
double sweetLoFor(int n) => sweetHiFor(n) * kGreenLo;

/// 당긴 거리(u, 1 = 화면 짧은 변 × kPull) → 숨. 꽉 아래는 1:1
double pouchPower(double u) {
  u = math.max(0, u);
  if (u <= kPouchFull) return u;
  if (u <= kPouchFull + kPouchDetent) return kPouchFull;
  return math.min(kPowerMax, kPouchFull + (u - kPouchFull - kPouchDetent) * kPouchGain);
}

/// 꽉 래치(꽉 근처에서 깜빡이지 않게 히스테리시스)
bool fullLatch(double p, bool was) => was ? p >= kPouchFull - 0.03 : p >= kPouchFull - 0.005;

/// 버팀 s(0..1): 꽉인 동안 차오르고(벽에 가까울수록 빨리), 꽉에서 내려오면 천천히 풀린다
double strainStep(double s, double p, double dtMs, bool full, [double strainMs = kStrainMs]) {
  if (full) {
    final k = _clamp((p - kPouchFull) / (kPowerMax - kPouchFull), 0, 1);
    return math.min(1, s + dtMs / (strainMs * (1 - 0.5 * k)));
  }
  return math.max(0, s - dtMs / kStrainRecoverMs);
}

enum BreathZone { weak, green, blast }

/// 숨 비율(정답 대비) → 구간. rules.js resolveShot 의 갈림(0.78 / 1.0)과 같다
BreathZone zoneOf(double power, int n) {
  final r = power / sweetHiFor(n);
  if (r < kGreenLo) return BreathZone.weak;
  if (r <= 1.0) return BreathZone.green;
  return BreathZone.blast;
}

// ── 숨 해석 (rules.js resolveShot) ─────────────────────────────
// 놓은 숨(정답 대비 비율) → 물리 세기·돌풍·조준 흔들림. 앱은 이걸 Dart 에서 풀고 Rust 에는 결과(세기·돌풍·조준점)만 넘긴다(live_sim.dart).
// 같은 비트가 나와야 기기끼리(PvP) 같은 물리가 된다 → 난수·log·cos 는 detmath.dart(순수 Dart fdlibm), 거듭제곱 2 는 x·x(Rust libm pow 와 같은 길).
const double kPhysSweet = 0.95;
const double kPhysSweetOne = 0.75; // 1장은 0.75 에서 뒤집힘 정점(stackpower)
const double kWeakZero = 0.45; // 이 비율 이하는 들썩도 거의 없음
const double kWeakFloor = 0.3; // 아주 약한 숨의 물리 세기
const double kWeakExp = 2.0;
const double kBlastSpan = 0.4; // 초록 끝에서 이만큼 더 세면 돌풍 최대

double physSweetFor(int n) => n <= 1 ? kPhysSweetOne : kPhysSweet;

/// 숨 해석 결과 (rules.js resolveShot 반환값)
class ResolvedShot {
  const ResolvedShot({required this.lat, required this.h, required this.power, required this.ratio, required this.blast, required this.over});
  final double lat, h; // 흔들린 뒤 조준(넘치지 않으면 그대로)
  final double power; // 물리 세기(blow power)
  final double ratio; // 정답 숨 대비 비율 (0.78~1.0 = 초록)
  final double blast; // 돌풍 0..1.4
  final bool over;

  BreathZone get zone => ratio < kGreenLo ? BreathZone.weak : (ratio <= 1.0 ? BreathZone.green : BreathZone.blast);
}

/// rules.js resolveShot(shot, n, top, rng, overShake). n = 살아 있는 장수, top = 꼭대기 y.
/// 난수 소비: 숨이 넘칠 때만 gauss 두 번(h 먼저, lat 다음) — JS 객체 리터럴 평가 순서와 같다
ResolvedShot resolveShot({required double lat, required double h, required double power, required int n, required double top, required Mulberry32 rng, double overShake = 1}) {
  final hi = sweetHiFor(n);
  final ratio = power / hi;
  final ps = physSweetFor(n);
  if (ratio < kGreenLo) {
    final t = _clamp((ratio - kWeakZero) / (kGreenLo - kWeakZero), 0, 1);
    final lift = kWeakExp == 2.0 ? t * t : math.pow(t, kWeakExp).toDouble(); // Rust libm pow(x, 2) = x·x
    return ResolvedShot(lat: lat, h: h, power: kWeakFloor + (ps - kWeakFloor) * lift, ratio: ratio, blast: 0, over: false);
  }
  if (ratio <= 1.0) return ResolvedShot(lat: lat, h: h, power: ps, ratio: ratio, blast: 0, over: false);
  final ex = ratio - 1.0;
  final k = overShake;
  final blast = _clamp(ex / kBlastSpan, 0, 1.4);
  final h2 = _clamp(h + gauss(rng) * ex * 1.2 * k, 0.03, top);
  final lat2 = _clamp(lat + gauss(rng) * ex * 1.0 * k, -0.95, 0.95);
  return ResolvedShot(lat: lat2, h: h2, power: ps, ratio: ratio, blast: blast, over: true);
}

/// 게임·봇·측정 도구 공통 조준 기하(main.js shotGeometry / Rust aim_point): 표적 = c − D·√(1−lat²) + side·lat, side = (−D.z, D.x).
/// D 는 단위 벡터로 맞춘다(Rust fire_turn 과 같은 계산 순서). 반환 (x, y, z) 오른손 좌표
(double, double, double) aimPoint({required double cx, required double cz, required double lat, required double h, double dirX = 0, double dirZ = -1}) {
  final dl = math.sqrt(dirX * dirX + dirZ * dirZ);
  final dx = dl > 0 ? dirX / dl : 0.0, dz = dl > 0 ? dirZ / dl : -1.0;
  final back = math.sqrt(1.0 - lat * lat);
  final sx = -dz, sz = dx;
  return (cx - dx * back + sx * lat, h, cz - dz * back + sz * lat);
}

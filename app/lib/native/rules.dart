// 숨 규칙 일부 — mockup/src/rules.js 에서 네이티브 입력(누르고 → 당기고 → 놓기)에 필요한 것만 옮김. 값은 rules.js 와 같아야 한다
// (test/native_rules_test.dart 가 rules.js 와 같은 값을 확인). 판정(resolveShot)·물리는 여기 없다 — 데모는 녹화 궤적을 재생한다.
import 'dart:math' as math;

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

// 좌표 변환 · 1인칭 카메라 · 원기둥 조준 광선 — 렌더러 독립(순수 수학). test/native_coords_test.dart 가 지킨다.
//
// 물리(웹 Rapier · Rust rapier3d)와 three.js 는 오른손 좌표(+Y 위, 카메라가 −Z 를 봄)인데 flutter_scene 은 왼손 좌표
// (보기 행렬 right = up × forward → +Z 를 보면 +X 가 오른쪽). 그대로 꽂으면 장면이 거울처럼 뒤집힌다(좌우 조준·그림이 반대).
// → 화면에 그릴 때만 z 를 뒤집는다: p' = (x, y, −z), q' = (−qx, −qy, qz, qw)  (거울 M=diag(1,1,−1), R' = M·R·M)
// 물리·판정·조준 계산은 전부 오른손(웹과 같은 숫자)으로 하고, 경계에서 한 번만 바꾼다.
import 'dart:math' as math;

import 'package:vector_math/vector_math.dart' as vm;

import 'rules.dart';
import 'track.dart';

vm.Vector3 posToScene(double x, double y, double z) => vm.Vector3(x, y, -z);
vm.Quaternion quatToScene(double qx, double qy, double qz, double qw) => vm.Quaternion(-qx, -qy, qz, qw);

/// 자세(오른손) → 장면 노드 변환 행렬(왼손)
vm.Matrix4 poseMatrix(Pose p) =>
    vm.Matrix4.compose(posToScene(p.px, p.py, p.pz), quatToScene(p.qx, p.qy, p.qz, p.qw), vm.Vector3.all(1));

/// 1인칭(main.js frame 의 fpvOn 분기): 입 높이에서 더미를 바라본다. top = 더미 꼭대기(오른손 y)
/// 세로: 눈 (0, top·0.7+1.0, 5.2), 시선 (0, top·0.5, 0), 세로 화각 50° / 가로: 눈 (0, top·0.7+0.9, 4.6), 화각 36°
class FpvView {
  FpvView(this.eye, this.target, this.fovDeg);
  factory FpvView.of(double top, {required bool portrait}) => FpvView(
    posToScene(0, top * 0.7 + (portrait ? 1.0 : 0.9), portrait ? 5.2 : 4.6),
    posToScene(0, top * 0.5, 0),
    portrait ? 50 : 36,
  );
  final vm.Vector3 eye, target; // 장면(왼손) 좌표
  final double fovDeg;
}

/// 누른 곳 = 바람이 닿는 곳 (main.js pointerAim). h = 높이, lat = 좌우(+ = 화면 오른쪽, 바람 −z 기준 side = (1, 0)),
/// hit = 맞은 점(오른손). 광선을 실제 원기둥(반지름 R, 높이 0~top)에 쏴서 맞은 점을 그대로 쓴다.
class AimHit {
  AimHit(this.h, this.lat, this.hx, this.hy, this.hz, {required this.onTop});
  final double h, lat, hx, hy, hz;
  final bool onTop; // 옆면 위로 넘쳐 윗면을 누름 → 맨 위 층
}

/// 광선(장면 왼손 좌표, 예: Camera.screenPointToRay) → 더미 원기둥 조준. 더미를 안 맞히면 null
AimHit? aimFromSceneRay(vm.Vector3 originScene, vm.Vector3 dirScene, {required double top, double cx = 0, double cz = 0}) {
  // 오른손으로 되돌린다(z 뒤집기는 자기 역함수)
  final ox0 = originScene.x, oy = originScene.y, oz0 = -originScene.z;
  final vx = dirScene.x, vy = dirScene.y, vz = -dirScene.z;
  final ox = ox0 - cx, oz = oz0 - cz;
  final qa = vx * vx + vz * vz, qb = 2 * (ox * vx + oz * vz), qc = ox * ox + oz * oz - kDiscR * kDiscR;
  final disc = qb * qb - 4 * qa * qc;
  if (qa <= 1e-6 || disc < 0) return null;
  final t = (-qb - math.sqrt(disc)) / (2 * qa);
  if (t <= 0) return null;
  final y = oy + t * vy;
  double hx, hy, hz;
  var onTop = false;
  if (y <= top) {
    if (y < -0.05) return null; // 책상 아래(원기둥 연장선)
    hx = ox0 + t * vx;
    hy = math.max(0.03, y);
    hz = oz0 + t * vz;
  } else if (vy < 0) {
    final tt = (top - oy) / vy; // 옆면 위로 넘치면 윗면을 누른 것 → 맨 위 층
    hx = ox0 + tt * vx;
    hz = oz0 + tt * vz;
    if (math.pow(hx - cx, 2) + math.pow(hz - cz, 2) > kDiscR * kDiscR) return null; // 윗면 밖(더미 뒤쪽 허공)
    hy = top - 0.02;
    onTop = true;
  } else {
    return null;
  }
  final lat = (hx - cx).clamp(-0.9 * kDiscR, 0.9 * kDiscR).toDouble();
  final h = hy.clamp(0.03, math.max(0.05, top - 0.02)).toDouble();
  return AimHit(h, lat, hx, hy, hz, onTop: onTop);
}

/// 더미 꼭대기(오른손 y) = 가장 높은 딱지 중심 + H/2 (sim.js columnTop)
double columnTop(Iterable<Pose> poses) {
  var top = 0.0;
  for (final p in poses) {
    top = math.max(top, p.py + kDiscH / 2);
  }
  return top;
}

/// 분필 원 안인가 (sim.js inCircle — off 판정은 없음)
bool inCircle(Pose p) => math.sqrt(p.px * p.px + p.pz * p.pz) <= kCircleR;

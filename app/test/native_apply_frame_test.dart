// PuffScene.applyFrame: Rust 자세 버퍼(오른손, 딱지마다 f32 8개) → 노드 행렬(왼손). 할당 없이 그 자리에서 고치는 120Hz 경로가
// coords.dart poseMatrix(녹화 재생 경로)와 같은 행렬을 내는지 · 가져간 딱지를 숨기는지 · 보간이 맞는지.
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_scene/scene.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/coords.dart';
import 'package:puff/native/demo_scene.dart';
import 'package:puff/native/track.dart';

// PuffScene() 는 GPU 문맥이 있어야 만들어져서(테스트 VM 엔 Impeller 없음) 같은 함수(applyFrameTo)를 노드 목록에 직접 쓴다
class _S {
  _S(int n) : discs = [for (var i = 0; i < n; i++) Node(name: 'disc$i')];
  final List<Node> discs;
  void applyFrame(Float32List prev, Float32List cur, double alpha) => applyFrameTo(discs, prev, cur, alpha);
}

void main() {
  Float32List buf(List<List<double>> discs) => Float32List.fromList([for (final d in discs) ...d]);
  // 축 둘레 각도 → 사원수(오른손)
  List<double> q(double ax, double ay, double az, double ang) {
    final s = math.sin(ang / 2);
    return [ax * s, ay * s, az * s, math.cos(ang / 2)];
  }

  void expectMat(Node n, Pose p) {
    final want = poseMatrix(p).storage, got = n.localTransform.storage;
    for (var i = 0; i < 16; i++) {
      expect(got[i], closeTo(want[i], 1e-6), reason: 'm[$i]');
    }
  }

  test('alpha 1 = poseMatrix 와 같은 행렬 · 가져간 딱지(flags 1)는 숨김', () {
    final ps = _S(3);
    final r1 = q(1, 0, 0, math.pi), r2 = q(0, 0.6, 0.8, 0.7);
    final cur = buf([
      [0.1, 0.055, -0.2, ...r1, 4 + 8],
      [1.5, 0.3, 2.5, ...r2, 2],
      [0, -10, 0, 0, 0, 0, 1, 1],
    ]);
    ps.applyFrame(cur, cur, 1);
    expectMat(ps.discs[0], Pose(0.1, 0.055, -0.2, r1[0], r1[1], r1[2], r1[3]));
    expectMat(ps.discs[1], Pose(1.5, 0.3, 2.5, r2[0], r2[1], r2[2], r2[3]));
    expect(ps.discs[2].visible, isFalse);
    expect(ps.discs[0].visible, isTrue);
    // 좌우 거울: 물리 +z(부는 사람 쪽) → 장면 −z
    expect(ps.discs[1].localTransform.getTranslation().z, closeTo(-2.5, 1e-6));
  });

  test('보간: 위치는 직선, 회전은 짧은 쪽 nlerp(부호 뒤집힌 사원수도 같은 자세)', () {
    final ps = _S(1);
    final a = q(0, 1, 0, 0.2), b = q(0, 1, 0, 0.6);
    final prev = buf([
      [0, 0, 0, ...a, 0],
    ]);
    // b 를 −b 로 줘도(같은 회전) 반대쪽으로 돌지 않아야 한다
    final cur = buf([
      [1, 2, -3, -b[0], -b[1], -b[2], -b[3], 0],
    ]);
    ps.applyFrame(prev, cur, 0.5);
    final m = q(0, 1, 0, 0.4);
    expectMat(ps.discs[0], Pose(0.5, 1, -1.5, m[0], m[1], m[2], m[3]));
  });

  test('같은 노드 행렬을 그 자리에서 고친다(프레임마다 새 행렬 없음)', () {
    final ps = _S(1);
    final m0 = ps.discs[0].localTransform;
    final cur = buf([
      [0.3, 0.1, 0.2, 0, 0, 0, 1, 0],
    ]);
    ps.applyFrame(cur, cur, 1);
    expect(identical(ps.discs[0].localTransform, m0), isTrue);
    expect(m0.getTranslation().x, closeTo(0.3, 1e-6));
  });
}

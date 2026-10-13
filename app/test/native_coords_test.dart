// B 시제품: 오른손(물리) → 왼손(flutter_scene) 변환, 1인칭 카메라, 원기둥 조준 광선, 원판 메시 감김·UV, FPS 통계.
// GPU 없이 도는 순수 수학만(flutter_scene 장면 자체는 GPU 가 있어야 해서 웹 확인 app/tool/web_check.mjs 로 본다)
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/coords.dart';
import 'package:puff/native/disc_mesh.dart';
import 'package:puff/native/frame_stats.dart';
import 'package:puff/native/track.dart';
import 'package:vector_math/vector_math.dart' as vm;

vm.Vector3 _apply(vm.Matrix4 m, vm.Vector3 v) => m.transformed3(v);

void main() {
  group('좌표 변환', () {
    test('위치: z 만 뒤집힘, 사원수: 같은 회전의 거울(장면은 Matrix4.compose 로 꽂는다)', () {
      expect(posToScene(1, 2, 3), vm.Vector3(1, 2, -3));
      // 오른손 Y축 +30°: (1,0,0) → (cos, 0, −sin). 왼손 장면에서는 같은 점의 거울 (cos, 0, +sin) 이어야 한다
      final a = math.pi / 6;
      final m = poseMatrix(Pose(0, 0, 0, 0, math.sin(a / 2), 0, math.cos(a / 2)));
      final lh = _apply(m, vm.Vector3(1, 0, 0));
      expect(lh.x, closeTo(math.cos(a), 1e-6));
      expect(lh.y, closeTo(0, 1e-6));
      expect(lh.z, closeTo(math.sin(a), 1e-6));
      // 일반 회전도: 왼손 결과 = 오른손 결과의 z 뒤집기
      final q = vm.Quaternion(0.3, -0.5, 0.2, 0.7)..normalize();
      final rh = vm.Matrix4.compose(vm.Vector3.zero(), q, vm.Vector3.all(1));
      final lm = poseMatrix(Pose(0, 0, 0, q.x, q.y, q.z, q.w));
      for (final v in [vm.Vector3(1, 0, 0), vm.Vector3(0, 1, 0), vm.Vector3(0.2, -0.4, 0.9)]) {
        final r = _apply(rh, v), l = _apply(lm, vm.Vector3(v.x, v.y, -v.z));
        expect(l.x, closeTo(r.x, 1e-5));
        expect(l.y, closeTo(r.y, 1e-5));
        expect(l.z, closeTo(-r.z, 1e-5));
      }
    });

    test('뒷면이 위(X축 180°)인 딱지: 로컬 +Y(그림 면)가 아래를 본다', () {
      const p = Pose(0.1, 0.5, -0.2, 1, 0, 0, 0); // 오른손 X축 180°
      expect(p.faceUp, closeTo(-1, 1e-12));
      final m = poseMatrix(p);
      final up = _apply(m, vm.Vector3(0, 1, 0)) - _apply(m, vm.Vector3.zero());
      expect(up.y, closeTo(-1, 1e-6));
      final c = _apply(m, vm.Vector3.zero());
      expect(c.x, closeTo(0.1, 1e-6));
      expect(c.z, closeTo(0.2, 1e-6)); // z 뒤집힘
    });
  });

  group('1인칭 카메라 · 조준 광선', () {
    final cam = FpvView.of(0.96, portrait: true);
    test('웹 main.js 와 같은 자리(z 만 뒤집힘)', () {
      expect(cam.eye.y, closeTo(0.96 * 0.7 + 1.0, 1e-6));
      expect(cam.eye.z, closeTo(-5.2, 1e-6));
      expect(cam.target.y, closeTo(0.48, 1e-6));
      expect(cam.fovDeg, 50);
    });

    vm.Vector3 dirTo(double x, double y, double zRh) => (posToScene(x, y, zRh) - cam.eye).normalized();

    test('앞면(부는 사람 쪽 곡면) 높이 0.5 를 겨눔 → h 0.5 · lat 0', () {
      final hit = aimFromSceneRay(cam.eye, dirTo(0, 0.5, 1.0), top: 0.96)!;
      expect(hit.h, closeTo(0.5, 1e-6));
      expect(hit.lat, closeTo(0, 1e-6));
      expect(hit.hz, greaterThan(0.9)); // 맞은 점은 부는 사람 쪽(오른손 +z) 앞면
      expect(hit.onTop, isFalse);
    });

    test('화면 오른쪽(+x)을 겨눔 → lat > 0 (sim 의 side = +x 와 같은 부호)', () {
      final hit = aimFromSceneRay(cam.eye, dirTo(0.6, 0.5, 0.8), top: 0.96)!;
      expect(hit.lat, greaterThan(0.4));
    });

    test('윗면을 누르면 맨 위 층, 더미 밖이면 null', () {
      final top = aimFromSceneRay(cam.eye, dirTo(0, 0.96, -0.3), top: 0.96)!;
      expect(top.onTop, isTrue);
      expect(top.h, closeTo(0.94, 1e-9));
      expect(aimFromSceneRay(cam.eye, dirTo(2.5, 0.5, 0), top: 0.96), isNull);
      expect(aimFromSceneRay(cam.eye, dirTo(0, 3, 0), top: 0.96), isNull);
    });
  });

  group('원판 메시', () {
    // flutter_scene buildDiscArrays 와 같은 규칙: 삼각형 (a, b, c) 의 (b−a)×(c−a) 가 바깥 법선과 반대 방향(같은 식으로 계산한 기준과 비교)
    double windingSign(DiscArrays a, int tri) {
      vm.Vector3 p(int i) => vm.Vector3(a.positions[3 * i], a.positions[3 * i + 1], a.positions[3 * i + 2]);
      vm.Vector3 n(int i) => vm.Vector3(a.normals[3 * i], a.normals[3 * i + 1], a.normals[3 * i + 2]);
      final i0 = a.indices[3 * tri], i1 = a.indices[3 * tri + 1], i2 = a.indices[3 * tri + 2];
      final cr = (p(i1) - p(i0)).cross(p(i2) - p(i0));
      return cr.dot(n(i0) + n(i1) + n(i2)).sign;
    }

    // 기준: flutter_scene DiscGeometry(+Y) 의 감김 [0, s+2, s+1] 을 그대로 재현
    final ref = capArrays(r: 1, y: 0, up: true, segments: 8);
    final refSign = windingSign(ref, 0);

    test('윗면·아랫면·옆면 모두 같은 감김 규칙(앞면 = 바깥)', () {
      final top = capArrays(r: 1, y: 0.055, up: true), bot = capArrays(r: 1, y: -0.055, up: false), side = sideArrays(r: 1, h: 0.11);
      for (final a in [top, bot, side]) {
        for (var t = 0; t < a.indices.length ~/ 3; t++) {
          expect(windingSign(a, t), refSign);
        }
      }
    });

    test('윗면 UV: +x → 그림 오른쪽(u=1), +z(카메라에서 먼 쪽 = 화면 위) → 그림 위(v=0)', () {
      final a = capArrays(r: 1, y: 0, up: true, segments: 4); // 정점 1 = 각 0(+x), 2 = 90°(+z)
      expect(a.uvs[2], closeTo(1, 1e-6));
      expect(a.uvs[5], closeTo(0, 1e-6));
    });
  });

  group('FPS 통계', () {
    test('120Hz 틱 · 놓친 프레임 · 백분위', () {
      final s = FrameStats()..refreshHz = 120;
      for (var i = 0; i < 100; i++) {
        s.addTick(1 / 120);
      }
      s.addTick(3 / 120); // 2프레임 놓침
      s.addTick(0); // 첫 틱(0)은 버림
      expect(s.ticks, 101);
      expect(s.janks, 1);
      expect(s.interval.p50, closeTo(8.33, 0.01));
      expect(s.interval.max, closeTo(25, 0.01));
      expect(s.fps, closeTo(1000 / ((100 * 1000 / 120 + 25) / 101), 1e-6));
    });
  });
}

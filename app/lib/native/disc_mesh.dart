// 딱지 원판 메시: 옆면 · 윗면(그림, 로컬 +Y) · 아랫면(뒷면, 로컬 −Y) 세 조각 — three.js CylinderGeometry 의 재질 3개([side, top, bottom])와 같은 구성.
// 감김(winding)은 flutter_scene 기본 도형(buildDiscArrays/buildCylinderArrays)과 같은 규칙을 따른다(앞면 = 바깥).
// UV 는 왼손 장면에서 위에서 내려다볼 때 그림이 거울로 뒤집히지 않게 잡았다(coords.dart 참고).
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_scene/scene.dart';

/// 순수 배열(시험용으로 GPU 없이 확인 가능)
typedef DiscArrays = ({Float32List positions, Float32List normals, Float32List uvs, List<int> indices});

DiscArrays capArrays({required double r, required double y, required bool up, int segments = 48}) {
  final pos = <double>[0, y, 0], nrm = <double>[0, up ? 1 : -1, 0], uv = <double>[0.5, 0.5];
  for (var s = 0; s <= segments; s++) {
    final a = 2 * math.pi * s / segments, cs = math.cos(a), sn = math.sin(a);
    pos.addAll([r * cs, y, r * sn]);
    nrm.addAll([0, up ? 1 : -1, 0]);
    // 윗면: 위에서 볼 때(카메라 −z 쪽, 화면 오른쪽 = +x, 화면 위 = +z) 그림 u→+x, v(아래)→−z
    // 아랫면: 뒤집혀(X축 180°) 위를 볼 때 같은 방향이 되도록 v 부호 반대
    uv.addAll([0.5 + 0.5 * cs, up ? 0.5 - 0.5 * sn : 0.5 + 0.5 * sn]);
  }
  final idx = <int>[];
  for (var s = 0; s < segments; s++) {
    // buildDiscArrays: [0, s+2, s+1] 이 +Y 를 본다 → −Y 는 반대 감김
    up ? idx.addAll([0, s + 2, s + 1]) : idx.addAll([0, s + 1, s + 2]);
  }
  return (positions: Float32List.fromList(pos), normals: Float32List.fromList(nrm), uvs: Float32List.fromList(uv), indices: idx);
}

DiscArrays sideArrays({required double r, required double h, int segments = 48, double uRepeat = 6}) {
  final pos = <double>[], nrm = <double>[], uv = <double>[];
  for (var row = 0; row <= 1; row++) {
    final y = row == 0 ? h / 2 : -h / 2;
    for (var s = 0; s <= segments; s++) {
      final a = 2 * math.pi * s / segments, cs = math.cos(a), sn = math.sin(a);
      pos.addAll([r * cs, y, r * sn]);
      nrm.addAll([cs, 0, sn]);
      uv.addAll([s / segments * uRepeat, row.toDouble()]);
    }
  }
  final cols = segments + 1, idx = <int>[];
  for (var s = 0; s < segments; s++) {
    final a = s, b = s + 1, c = s + cols, d = c + 1; // buildCylinderArrays 와 같은 감김
    idx.addAll([a, b, c, b, d, c]);
  }
  return (positions: Float32List.fromList(pos), normals: Float32List.fromList(nrm), uvs: Float32List.fromList(uv), indices: idx);
}

MeshGeometry geometryOf(DiscArrays a) =>
    MeshGeometry.fromArrays(positions: a.positions, normals: a.normals, texCoords: a.uvs, indices: a.indices);

/// 모든 딱지가 함께 쓰는 도형 세 개(재질만 딱지마다 다름)
class DiscGeometries {
  DiscGeometries({double r = 1.0, double h = 0.11, int segments = 48})
    : side = geometryOf(sideArrays(r: r, h: h, segments: segments)),
      top = geometryOf(capArrays(r: r, y: h / 2, up: true, segments: segments)),
      bottom = geometryOf(capArrays(r: r, y: -h / 2, up: false, segments: segments));
  final MeshGeometry side, top, bottom;
}

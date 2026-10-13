// 네이티브 3D 장면(flutter_scene, Flutter GPU/Impeller) — 웹 main.js buildScene 의 생김새를 옮김:
// 책상(나뭇결) + 두툼한 테두리 + 분필 원 + 교실 벽 + 딱지 20장(그림 앞면 · 마분지 뒷면 · 희귀도 옆띠) + 해/역광/하늘빛.
// 물리는 없다: applyPoses(자세) 로 바깥(녹화 궤적, 나중엔 Rust 물리)이 매 프레임 딱지를 꽂는다.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter_scene/scene.dart';
import 'package:vector_math/vector_math.dart' as vm;

import 'coords.dart';
import 'disc_art.dart';
import 'disc_mesh.dart';
import 'rules.dart';
import 'track.dart';

vm.Vector3 linRgb(int hex, [double k = 1]) {
  double l(int c) {
    final s = c / 255;
    return s <= 0.04045 ? s / 12.92 : math.pow((s + 0.055) / 1.055, 2.4).toDouble();
  }

  return vm.Vector3(l((hex >> 16) & 255), l((hex >> 8) & 255), l(hex & 255)) * k;
}

/// 화질 손잡이(실기기 120Hz 판정용으로 화면에서 바꿔 가며 잰다)
class Quality {
  bool shadows = true;
  double renderScale = 1.0;
  AntiAliasingMode aa = AntiAliasingMode.auto;
  String get label => '그림자 ${shadows ? '켬' : '끔'} · 배율 ${renderScale.toStringAsFixed(2)} · AA ${aa.name}';
}

class PuffScene {
  final Scene scene = Scene();
  final List<Node> discs = []; // pid 순
  late final DirectionalLight sun;
  final quality = Quality();
  int drawNodes = 0;
  final artSw = Stopwatch(), texSw = Stopwatch(); // 부팅 시간 쪼개기: dart:ui 로 그림 굽기 / Texture2D(밉맵 포함) 올리기

  Future<Texture2D> _tex(Future<ui.Image> Function() make) async {
    artSw.start();
    final img = await make();
    artSw.stop();
    texSw.start();
    final t = await Texture2D.fromImage(img);
    texSw.stop();
    img.dispose();
    return t;
  }

  /// Scene.initializeStaticResources() 가 끝난 뒤 부른다(도형·재질이 셰이더 묶음을 만짐)
  Future<void> build(TrackFixture fx) async {
    // 톤매핑: 웹 NeutralToneMapping = Khronos PBR Neutral
    scene.toneMapping = ToneMappingMode.pbrNeutral;
    scene.exposure = 1.0;
    // 하늘빛(웹 HemisphereLight 0xfff3dc / 0x7a5434) → 그라데이션 하늘을 굽은 환경광으로
    scene.environment = EnvironmentMap.fromSky(GradientSkySource(
      zenithColor: linRgb(0xfff3dc, 0.9),
      horizonColor: linRgb(0xf2dcb8, 0.75),
      groundColor: linRgb(0x7a5434, 0.6),
      sunColor: vm.Vector3.zero(),
    ));
    scene.environmentIntensity = 1.0;
    // 배경 하늘(웹 skyTexture: #5fc8ff → #bfe9ff → #ffe7b8)
    scene.skybox = Skybox(GradientSkySource(
      zenithColor: linRgb(0x5fc8ff),
      horizonColor: linRgb(0xbfe9ff),
      groundColor: linRgb(0xffe7b8),
      sunColor: vm.Vector3.zero(),
    ));
    // 해: 웹 (5, 11, 6) 에서 원점으로 → 왼손 (5, 11, −6)
    sun = DirectionalLight(
      direction: vm.Vector3(-5, -11, 6).normalized(),
      color: linRgb(0xffe6c0),
      intensity: 3.2,
      castsShadow: true,
      shadowCascadeCount: 1,
      shadowMaxDistance: 22,
      shadowMapResolution: 2048,
      shadowSoftness: 0.05,
    );
    scene.directionalLight = sun;
    // 역광(웹 rim 0x9fd8ff 0.7, (−6, 5, −8) → 왼손 (−6, 5, 8))
    scene.add(Node(name: 'rim')..addComponent(DirectionalLightComponent.aimed(
      DirectionalLight(color: linRgb(0x9fd8ff), intensity: 0.9),
      vm.Vector3(6, -5, -8).normalized(),
    )));

    // 책상 22×1×16 + 테두리 띠
    final wood = await _tex(woodImage);
    scene.add(Node(
      name: 'desk',
      localTransform: vm.Matrix4.translation(vm.Vector3(0, -0.5, 0)),
      mesh: Mesh(CuboidGeometry(vm.Vector3(22, 1, 16)), PhysicallyBasedMaterial(baseColorTexture: wood)
        ..metallicFactor = 0
        ..roughnessFactor = 0.65),
    ));
    scene.add(Node(
      name: 'trim',
      localTransform: vm.Matrix4.translation(vm.Vector3(0, -1.0, 0)),
      mesh: Mesh(CuboidGeometry(vm.Vector3(22.6, 0.5, 16.6)), PhysicallyBasedMaterial()
        ..baseColorFactor = vm.Vector4(0.26, 0.10, 0.03, 1)
        ..metallicFactor = 0
        ..roughnessFactor = 0.6),
    ));
    // 분필 원(r = 3.2): 투명 판 위에 분필 선
    final chalk = await _tex(() => chalkImage(circleR: kCircleR));
    final chalkSize = 2 * (kCircleR + 0.5);
    scene.add(Node(
      name: 'chalk',
      localTransform: vm.Matrix4.translation(vm.Vector3(0, 0.004, 0)),
      mesh: Mesh(PlaneGeometry(width: chalkSize, depth: chalkSize), UnlitMaterial(colorTexture: chalk)..alphaMode = AlphaMode.blend),
    )..castsShadows = false);
    // 교실 벽(웹: 36×13.5 판, (0, 3.4, −11.5) → 왼손 z = +11.5, 카메라(−z 쪽)를 보게 세움)
    final wall = await _tex(backdropImage);
    scene.add(Node(
      name: 'backdrop',
      localTransform: vm.Matrix4.compose(vm.Vector3(0, 3.4, 11.5), vm.Quaternion.axisAngle(vm.Vector3(1, 0, 0), -math.pi / 2), vm.Vector3.all(1)),
      mesh: Mesh(PlaneGeometry(width: 36, depth: 13.5), UnlitMaterial(colorTexture: wall)),
    )..castsShadows = false);

    // 딱지: 도형 셋 공유, 재질은 카드마다
    final geo = DiscGeometries(r: kDiscR, h: kDiscH);
    final back = await _tex(backImage);
    final backMat = PhysicallyBasedMaterial(baseColorTexture: back)
      ..metallicFactor = 0
      ..roughnessFactor = 0.7;
    final faceCache = <String, PhysicallyBasedMaterial>{};
    final edgeCache = <String, PhysicallyBasedMaterial>{};
    for (var pid = 0; pid < fx.n; pid++) {
      final card = fx.cards[pid];
      final fancy = card.rarity == 'epic' || card.rarity == 'legendary';
      final face = faceCache[card.id] ??= PhysicallyBasedMaterial(baseColorTexture: await _tex(() => faceImage(card)))
        ..metallicFactor = fancy ? 0.1 : 0
        ..roughnessFactor = fancy ? 0.35 : 0.5
        ..clearcoat = fancy ? 0.6 : 0
        ..clearcoatRoughness = 0.25
        ..iridescence = fancy ? 0.9 : 0
        ..iridescenceIor = 1.6;
      final rar = kRarity[card.rarity] ?? kRarity['common']!;
      final edge = edgeCache[card.rarity] ??= PhysicallyBasedMaterial(baseColorTexture: await _tex(() => edgeImage(rar.side)))
        ..metallicFactor = card.rarity == 'legendary' ? 0.5 : 0
        ..roughnessFactor = card.rarity == 'legendary' ? 0.3 : 0.8;
      final node = Node(
        name: 'disc$pid',
        mesh: Mesh.primitives(primitives: [MeshPrimitive(geo.side, edge), MeshPrimitive(geo.top, face), MeshPrimitive(geo.bottom, backMat)]),
      );
      discs.add(node);
      scene.add(node);
    }
    drawNodes = scene.root.children.length;
    applyQuality();
  }

  void applyQuality() {
    sun.castsShadow = quality.shadows;
    scene.renderScale = quality.renderScale;
    scene.antiAliasingMode = quality.aa;
  }

  /// pid → 자세(오른손). 원 밖으로 날아가 책상 아래로 떨어진 건 그냥 그 자리(웹은 판정 뒤 치움)
  void applyPoses(Map<int, Pose> poses) {
    for (final e in poses.entries) {
      if (e.key < 0 || e.key >= discs.length) continue;
      discs[e.key].localTransform = poseMatrix(e.value);
    }
  }
}

/// 장면 준비(셰이더 묶음 · 텍스처 굽기)에 걸린 시간 등 — 데모 화면 진단 줄
class SceneBootInfo {
  SceneBootInfo(this.staticMs, this.buildMs, this.artMs, this.texMs);
  final int staticMs, buildMs, artMs, texMs;
  @override
  String toString() => '부팅: 셰이더 ${staticMs}ms · 장면 ${buildMs}ms (그림 $artMs · 텍스처 $texMs)';
}

Future<SceneBootInfo> bootScene(PuffScene ps, TrackFixture fx) async {
  final sw = Stopwatch()..start();
  await Scene.initializeStaticResources();
  final a = sw.elapsedMilliseconds;
  await ps.build(fx);
  return SceneBootInfo(a, sw.elapsedMilliseconds - a, ps.artSw.elapsedMilliseconds, ps.texSw.elapsedMilliseconds);
}

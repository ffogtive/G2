// B 시제품 데모 화면: 네이티브 3D 장면 + 네이티브 입력(누르고 → 당기고 → 놓기) + 볼 오버레이 + 햅틱 + FPS 오버레이.
//
// 🧭 가설: Flutter GPU(Impeller) 위 flutter_scene 이면 웹뷰(iOS rAF 60Hz 상한) 없이 ProMotion 120Hz 로 딱지 20장 장면을 그릴 수 있고,
//   터치→화면 반응도 웹뷰보다 짧다. 판가름: 아이폰 Pro 실기기 profile 빌드에서 FPS 오버레이가 120 근처 · frame p95 ≤ 8.3ms ·
//   jank 거의 0 (그림자 켬, 배율 1.0). 못 미치면 그림자/배율/AA 손잡이로 어디서 깎이는지 같은 화면에서 잰다.
//
// 물리는 아직 없다: 놓은 숨(약함/초록/돌풍)과 누른 곳(높이·좌우)에 맞는 '웹 물리 녹화'(assets/native/track_fixture.json)를 고른다.
// 렌더러가 물리와 독립이라는 증명이 목적이고, Rust 물리(native/puff_sim)가 붙으면 같은 applyPoses 로 꽂는다.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_scene/scene.dart';
import 'package:vector_math/vector_math.dart' as vm;

import 'coords.dart';
import 'demo_scene.dart';
import 'fpv_overlay.dart';
import 'frame_stats.dart';
import 'rich_haptics.dart';
import 'rules.dart';
import 'track.dart';

const kFixtureAsset = 'assets/native/track_fixture.json';

/// 놓은 숨과 누른 곳 → 어느 녹화를 틀지(초록이면 높이·좌우로 갈림). 물리가 붙으면 이 함수는 사라진다
String pickShot(BreathZone zone, AimHit hit, double top) {
  switch (zone) {
    case BreathZone.weak:
      return 'weak';
    case BreathZone.blast:
      return 'blast';
    case BreathZone.green:
      if (hit.h < top * 0.7) return 'mid';
      if (hit.lat.abs() > 0.3) return 'side';
      return 'green';
  }
}

class _Aim {
  _Aim(this.pointer, this.sy, this.hit);
  final int pointer;
  final double sy;
  final AimHit hit;
  double power = 0, strain = 0, lastBeat = 0;
  bool full = false;
}

class NativeDemoPage extends StatefulWidget {
  const NativeDemoPage({super.key});
  @override
  State<NativeDemoPage> createState() => _NativeDemoPageState();
}

class _NativeDemoPageState extends State<NativeDemoPage> {
  final ps = PuffScene();
  final breath = BreathState();
  final stats = FrameStats();
  final hud = ValueNotifier<String>('');
  final status = ValueNotifier<String>('장면 준비 중…');
  final cam = PerspectiveCamera(fovRadiansY: 50 * vm.degrees2Radians, position: vm.Vector3(0, 2, -5.2), target: vm.Vector3.zero(), fovNear: 0.1, fovFar: 200);
  TrackFixture? fx;
  bool ready = false;
  String? error;
  SceneBootInfo? boot;

  Map<int, Pose> rest = {};
  double top = 1, pcx = 0, pcz = 0;
  Size viewSize = Size.zero;
  double clock = 0, lastHud = 0;

  _Aim? aim;
  TrackPlayer? player;
  RecordedShot? playing;
  double playT0 = 0;
  double? endAt;
  bool bench = false;
  int benchIdx = 0;
  double? coughAt;
  final bootSw = Stopwatch()..start();
  int? firstFrameMs; // 화면을 연 뒤 첫 장면 틱까지(셰이더 묶음 · 텍스처 · 파이프라인 준비 포함)

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    _boot();
  }

  Future<void> _boot() async {
    try {
      final f = TrackFixture.parse(await rootBundle.loadString(kFixtureAsset));
      fx = f;
      boot = await bootScene(ps, f);
      rest = f.shots.first.player().poseAt(0);
      top = columnTop(rest.values);
      pcx = rest.values.map((p) => p.px).reduce((a, b) => a + b) / rest.length;
      pcz = rest.values.map((p) => p.pz).reduce((a, b) => a + b) / rest.length;
      ps.applyPoses(rest);
      status.value = '더미를 누르고 아래로 당겼다 놓기 (녹화 재생 · 물리 아님)';
      if (mounted) setState(() => ready = true);
    } catch (e, st) {
      debugPrint('native demo boot failed: $e\n$st');
      if (mounted) setState(() => error = '$e');
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    stats.refreshHz = View.of(context).display.refreshRate;
  }

  @override
  void dispose() {
    SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    hud.dispose();
    status.dispose();
    breath.dispose();
    super.dispose();
  }

  void _onTimings(List<FrameTiming> ts) => stats.addTimings(ts);

  bool get portrait => viewSize.width / math.max(1, viewSize.height) < 0.85;

  void _onTick(Duration elapsed, double dt) {
    clock = elapsed.inMicroseconds / 1e6;
    firstFrameMs ??= bootSw.elapsedMilliseconds;
    stats.addTick(dt);
    final v = FpvView.of(top, portrait: portrait);
    cam
      ..position = v.eye
      ..target = v.target
      ..fovRadiansY = v.fovDeg * vm.degrees2Radians;
    _stepAim(dt);
    _stepPlayback();
    if (breath.mode == PuffMode.blow && clock - breath.modeT0 > 0.5) breath.set(PuffMode.idle, clock);
    if (coughAt != null && clock - coughAt! > 0.7) {
      coughAt = null;
      breath.set(PuffMode.idle, clock);
    }
    breath.tick(clock);
    if (clock - lastHud > 0.25) {
      lastHud = clock;
      hud.value = '${stats.summary()}\n${ps.quality.label}\n'
          '햅틱 ${RichHaptics.nativeAvailable ? 'Core Haptics' : 'HapticFeedback'} (${RichHaptics.nativeCount}/${RichHaptics.fallbackCount})'
          '${boot != null ? '\n$boot · 첫 프레임 ${firstFrameMs}ms' : ''}';
    }
  }

  void _stepAim(double dt) {
    final a = aim;
    if (a == null) return;
    a.strain = strainStep(a.strain, a.power, dt * 1000, a.full);
    breath.strain = a.strain;
    if (a.full) {
      // 버티는 동안 심장 박동처럼 톡톡, 버팀이 찰수록 빨라짐
      final period = 0.42 - 0.27 * a.strain;
      if (clock - a.lastBeat > period) {
        a.lastBeat = clock;
        RichHaptics.play(HapticCue.strain);
      }
    }
    if (a.strain >= 1) _cough();
  }

  void _stepPlayback() {
    final pl = player, shot = playing;
    if (pl == null || shot == null) return;
    final tf = (clock - playT0) * kTrackHz;
    final poses = pl.poseAt(tf);
    ps.applyPoses(poses);
    if (endAt == null && tf >= shot.frames) {
      endAt = clock;
      final flipped = poses.values.where((p) => p.faceUp > 0.2 && inCircle(p)).length;
      final outs = poses.values.where((p) => !inCircle(p)).length;
      status.value = '"${shot.name}" 끝: 뒤집힘 $flipped장 · 원 밖 $outs장 (웹 판정 ${shot.flipped.length}·${shot.outs.length})';
      RichHaptics.play(HapticCue.land);
    }
    if (endAt != null && clock - endAt! > (bench ? 0.5 : 1.8)) _restack();
  }

  void _restack() {
    player = null;
    playing = null;
    endAt = null;
    ps.applyPoses(rest);
    if (bench) {
      final shots = fx!.shots;
      _play(shots[benchIdx++ % shots.length], '벤치');
    } else {
      status.value = '다시 쌓음 — 더미를 누르고 당기기';
    }
  }

  void _play(RecordedShot shot, String why) {
    player = shot.player();
    playing = shot;
    playT0 = clock;
    endAt = null;
    status.value = '$why → 녹화 "${shot.name}" 재생 (웹 물리 30Hz, 화면에서 보간)';
  }

  // ── 입력: Listener 로 날 포인터를 바로 받는다(제스처 경쟁 대기 없음) ──
  void _down(PointerDownEvent e) {
    if (!ready || aim != null || player != null || coughAt != null) return;
    final ray = cam.screenPointToRay(e.localPosition, viewSize);
    final hit = aimFromSceneRay(ray.origin, ray.direction, top: top, cx: pcx, cz: pcz);
    if (hit == null) {
      status.value = '더미(딱지 기둥)를 눌러야 해요';
      return;
    }
    aim = _Aim(e.pointer, e.localPosition.dy, hit);
    breath
      ..power = 0
      ..full = false
      ..strain = 0
      ..set(PuffMode.charge, clock);
    final layer = ((top - hit.h) / (kDiscH + 0.004)).floor() + 1;
    status.value = '조준: 위에서 $layer장째 · 좌우 ${hit.lat >= 0 ? '+' : ''}${hit.lat.toStringAsFixed(2)}${hit.onTop ? ' (윗면)' : ''} — 아래로 당기기';
    RichHaptics.play(HapticCue.press);
  }

  void _move(PointerMoveEvent e) {
    final a = aim;
    if (a == null || e.pointer != a.pointer) return;
    final minDim = math.min(viewSize.width, viewSize.height);
    a.power = pouchPower((e.localPosition.dy - a.sy) / (minDim * kPull));
    final was = a.full;
    a.full = fullLatch(a.power, was);
    if (a.full && !was) {
      RichHaptics.play(HapticCue.full); // 꽉: 코르크 '읍'
      a.lastBeat = clock;
    }
    breath
      ..power = a.power
      ..full = a.full;
  }

  void _up(PointerUpEvent e) {
    final a = aim;
    if (a == null || e.pointer != a.pointer) return;
    aim = null;
    if (a.power < 0.06) {
      breath.set(PuffMode.idle, clock);
      status.value = '취소(거의 안 당김)';
      return;
    }
    final zone = zoneOf(a.power, fx!.n);
    final ratio = a.power / sweetHiFor(fx!.n);
    RichHaptics.play(switch (zone) {
      BreathZone.weak => HapticCue.fireWeak,
      BreathZone.green => HapticCue.fire,
      BreathZone.blast => HapticCue.fireStrong,
    });
    breath.set(PuffMode.blow, clock);
    final label = switch (zone) {
      BreathZone.weak => '약한 숨',
      BreathZone.green => '초록 숨',
      BreathZone.blast => '돌풍',
    };
    _play(fx!.shot(pickShot(zone, a.hit, top)), '$label ×${ratio.toStringAsFixed(2)}');
  }

  void _cancel(PointerCancelEvent e) {
    if (aim?.pointer != e.pointer) return;
    aim = null;
    breath.set(PuffMode.idle, clock);
  }

  void _cough() {
    aim = null;
    coughAt = clock;
    breath.set(PuffMode.cough, clock);
    status.value = '콜록! 꽉에서 너무 오래 참음 — 취소(숨·차례 안 씀)';
    RichHaptics.play(HapticCue.cough);
  }

  void _toggle(void Function(Quality q) f) {
    f(ps.quality);
    ps.applyQuality();
    stats.reset();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return Scaffold(
      backgroundColor: const Color(0xFF2A1A12),
      body: LayoutBuilder(builder: (context, c) {
        viewSize = c.biggest;
        return Stack(children: [
          Positioned.fill(
            child: Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: _down,
              onPointerMove: _move,
              onPointerUp: _up,
              onPointerCancel: _cancel,
              child: ready
                  ? SceneView(ps.scene, camera: cam, onTick: _onTick)
                  : Center(child: Text(error ?? '장면 준비 중…', style: const TextStyle(color: Colors.white70))),
            ),
          ),
          Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: FpvPainter(breath)))),
          Positioned(
            left: 8,
            top: pad.top + 8,
            child: IgnorePointer(
              child: ValueListenableBuilder<String>(
                valueListenable: hud,
                builder: (_, s, _) => _Box(Text(s, style: _mono)),
              ),
            ),
          ),
          Positioned(
            right: 8,
            top: pad.top + 8,
            child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              _Btn('닫기', () => Navigator.of(context).maybePop()),
              _Btn('그림자', () => _toggle((q) => q.shadows = !q.shadows)),
              _Btn('배율', () => _toggle((q) => q.renderScale = q.renderScale > 0.9 ? 0.75 : q.renderScale > 0.6 ? 0.5 : 1.0)),
              _Btn('AA', () => _toggle((q) => q.aa = AntiAliasingMode.values[(q.aa.index + 1) % AntiAliasingMode.values.length])),
              _Btn(bench ? '벤치 끔' : '벤치', () {
                setState(() => bench = !bench);
                stats.reset();
                if (bench && player == null && aim == null) _restack();
              }),
            ]),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: pad.bottom + 96,
            child: IgnorePointer(
              child: ValueListenableBuilder<String>(
                valueListenable: status,
                builder: (_, s, _) => Center(child: _Box(Text(s, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 13)))),
              ),
            ),
          ),
        ]);
      }),
    );
  }
}

const _mono = TextStyle(color: Color(0xFFB9FFB0), fontSize: 11, fontFamily: 'monospace', height: 1.3);

class _Box extends StatelessWidget {
  const _Box(this.child);
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(color: const Color(0xA0000000), borderRadius: BorderRadius.circular(6)),
    child: child,
  );
}

class _Btn extends StatelessWidget {
  const _Btn(this.label, this.onTap);
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: GestureDetector(
      onTap: onTap,
      child: _Box(Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600))),
    ),
  );
}

/// 단독 실행용 앱(데모 진입점 · --dart-define=NATIVE_DEMO=true · 웹 확인)
class NativeDemoApp extends StatelessWidget {
  const NativeDemoApp({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(
    title: 'PUFF! native',
    debugShowCheckedModeBanner: false,
    home: NativeDemoPage(),
  );
}

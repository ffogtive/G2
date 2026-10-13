// B 시제품 데모 화면: 네이티브 3D 장면 + 네이티브 입력(누르고 → 당기고 → 놓기) + 실제 물리(Rust) + 볼 오버레이 + 햅틱 + FPS 오버레이.
//
// 🧭 가설: Flutter GPU(Impeller) 위 flutter_scene + Rust rapier(dart:ffi, 동기 호출)면 웹뷰(iOS rAF 60Hz 상한) 없이
//   ProMotion 120Hz 로 '진짜 물리' 딱지 판을 돌릴 수 있다 — 물리 1스텝(20장 ≈0.2ms)이 프레임 예산 8.3ms 의 몇 % 라서.
//   판가름: 아이폰 Pro profile 빌드에서 FPS 오버레이 120 근처 · frame p95 ≤ 9ms · jank 거의 0 (그림자 켬, 배율 1.0)
//   + 물리 줄의 advance p95 가 1ms 안쪽. 못 미치면 그림자/배율/AA 손잡이로 어디서 깎이는지 같은 화면에서 잰다.
//
// 물리: Rust native/puff_sim 이 있으면(iOS 정적 링크 · 안드로이드 jniLibs) 놓은 숨을 Dart 로 해석(rules.dart resolveShot)해
//   Rust 에 바람을 넣고 화면 프레임마다 고정 1/120초 스텝 → 자세 버퍼 → applyFrame (live_sim.dart). 판정·가져가기·다시 쌓기까지.
//   없으면(웹 확인 빌드, build-ios.sh 를 안 돌린 iOS) 예전처럼 '웹 물리 녹화'(assets/native/track_fixture.json)를 고른다.
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
import 'live_sim.dart';
import 'rich_haptics.dart';
import 'rules.dart';
import 'sim_core.dart';
import 'track.dart';

const kFixtureAsset = 'assets/native/track_fixture.json';

/// 손 안 대고 재기: --dart-define=NATIVE_BENCH=true 면 벤치(정해진 샷을 돌아가며 쏨)로 시작 — 실기기 120Hz 측정·리눅스 확인용
const kAutoBench = bool.fromEnvironment('NATIVE_BENCH');

/// 벤치(실물리): 정해진 샷을 돌아가며 쏜다 — (위에서 k장째, 좌우, 숨 비율). 초록·옆·가운데·돌풍·약함
const _benchShots = <(int, double, double)>[(2, 0.0, 0.9), (2, 0.45, 0.95), (-1, 0.0, 0.85), (2, 0.0, 1.2), (0, 0.0, 0.55)];

/// (녹화 재생 모드) 놓은 숨과 누른 곳 → 어느 녹화를 틀지(초록이면 높이·좌우로 갈림)
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

  // 실물리(Rust). simLib 이 없으면 녹화 재생
  SimLibrary? simLib;
  String? simErr;
  LiveSim? live;
  bool useLive = true;
  double? judgedAt;
  final judgeLog = <String>[]; // 최근 판정(시드-턴: 뒤집힘/원 밖 해시) — 기기 간 결정성을 눈으로 대조(docs/app/native-spike.md)
  double camTop = 1; // 카메라가 따라가는 꼭대기(더미가 줄면 부드럽게 내려옴)

  bool get liveMode => useLive && live != null;

  _Aim? aim;
  TrackPlayer? player;
  RecordedShot? playing;
  double playT0 = 0;
  double? endAt;
  bool bench = kAutoBench;
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
      final (lib, err) = openSimLibrary();
      simLib = lib;
      simErr = err;
      if (lib != null) {
        final l = live = LiveSim(lib, n: f.n, seed: 1);
        l.onJudged = _onJudged;
        l.onSettled = _onSettled;
      } else {
        debugPrint('native demo: $err');
      }
      _showRest();
      camTop = top;
      if (mounted) setState(() => ready = true);
      if (bench && !liveMode) _restack(); // 녹화 모드 벤치는 재생 순환으로 시작(실물리 벤치는 틱에서 쏜다)
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

  /// 지금 모드의 쉬는 더미를 그리고 조준 기준(꼭대기·중심)을 맞춘다
  void _showRest() {
    final l = live;
    if (liveMode && l != null) {
      top = l.top;
      pcx = l.cx;
      pcz = l.cz;
      ps.applyFrame(l.prev, l.cur, l.alpha);
      status.value = '더미를 누르고 아래로 당겼다 놓기 — Rust 물리(실시간) · ${l.live}장';
    } else {
      top = columnTop(rest.values);
      pcx = rest.values.map((p) => p.px).reduce((a, b) => a + b) / rest.length;
      pcz = rest.values.map((p) => p.pz).reduce((a, b) => a + b) / rest.length;
      ps.applyPoses(rest);
      status.value = '더미를 누르고 아래로 당겼다 놓기 (녹화 재생 · 물리 아님)${simErr != null ? '\n$simErr' : ''}';
    }
  }

  @override
  void dispose() {
    live?.dispose();
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
    camTop += (top - camTop) * math.min(1.0, dt * 4); // 더미가 줄면 카메라가 부드럽게 따라 내려옴
    final v = FpvView.of(camTop, portrait: portrait);
    cam
      ..position = v.eye
      ..target = v.target
      ..fovRadiansY = v.fovDeg * vm.degrees2Radians;
    _stepAim(dt);
    if (liveMode) {
      _stepLive(dt);
    } else {
      _stepPlayback();
    }
    if (breath.mode == PuffMode.blow && clock - breath.modeT0 > 0.5) breath.set(PuffMode.idle, clock);
    if (coughAt != null && clock - coughAt! > 0.7) {
      coughAt = null;
      breath.set(PuffMode.idle, clock);
    }
    breath.tick(clock);
    if (clock - lastHud > 0.25) {
      lastHud = clock;
      hud.value = '${stats.summary()}\n${_physLine()}\n${ps.quality.label}\n'
          '햅틱 ${RichHaptics.nativeAvailable ? 'Core Haptics' : 'HapticFeedback'} (${RichHaptics.nativeCount}/${RichHaptics.fallbackCount})'
          '${boot != null ? '\n$boot · 첫 프레임 ${firstFrameMs}ms' : ''}';
    }
  }

  String _physLine() {
    final l = live;
    if (l == null) return '물리: 녹화 재생 (Rust 없음)';
    if (!useLive) return '물리: 녹화 재생 (Rust 꺼둠)';
    final j = l.judge;
    return '물리 Rust ${simLib!.version.split(' ').take(4).join(' ')}\n'
        'step ${l.stepsLastFrame}/frame · advance p50 ${l.costPercentile(0.5)} p95 ${l.costPercentile(0.95)} µs\n'
        'seed ${l.seed} 턴 ${l.turn} · ${l.live}장 · ${l.phase.name}${j != null ? ' · 해시 ${_hex(j.hash)}' : ''}'
        '${judgeLog.isEmpty ? '' : '\n판정 ${judgeLog.join('  ')}'}';
  }

  static String _hex(int v) => (v >>> 32).toRadixString(16).padLeft(8, '0') + (v & 0xffffffff).toRadixString(16).padLeft(8, '0');

  // ── 실물리 ──
  void _stepLive(double dt) {
    final l = live!;
    final was = l.phase;
    l.advance(dt);
    if (was == LivePhase.flying || was == LivePhase.settling) ps.applyFrame(l.prev, l.cur, l.alpha);
    if (l.phase == LivePhase.judged && judgedAt != null && clock - judgedAt! > (bench ? 0.6 : 1.8)) {
      judgedAt = null;
      final j = l.judge!;
      final oldSeed = l.seed;
      final taken = l.takeAndRestack(minLive: bench ? 6 : 1);
      ps.applyFrame(l.prev, l.cur, 1);
      status.value = l.seed != oldSeed ? '$taken장 가져감 — 다 땄다! 새 판(seed ${l.seed}) 쌓는 중' : '$taken장 가져감 (원 밖 ${j.outs}장은 다시 더미로) — 다시 쌓는 중';
    }
    if (bench && l.phase == LivePhase.ready && aim == null) _benchFire();
  }

  void _onJudged(LiveJudge j) {
    judgedAt = clock;
    final l = live!;
    judgeLog.add('${l.seed}-${l.turn}: ${j.flipped}/${j.outs} ${_hex(j.hash).substring(0, 8)}');
    if (judgeLog.length > 3) judgeLog.removeAt(0);
    breath.set(PuffMode.idle, clock);
    status.value = '판정(${j.steps}스텝 = ${(j.steps / 120).toStringAsFixed(2)}초): 뒤집힘 ${j.flipped}장 · 원 밖 ${j.outs}장 · 해시 ${_hex(j.hash)}';
    RichHaptics.play(HapticCue.land);
    // 딴 장수만큼 톡톡(동전 세듯) — 웹 vibrate 로는 못 내는 짧은 연타
    for (var i = 0; i < math.min(j.flipped, 8); i++) {
      Future<void>.delayed(Duration(milliseconds: 260 + 70 * i), () => RichHaptics.play(HapticCue.strain));
    }
  }

  void _onSettled() {
    final l = live!;
    top = l.top;
    pcx = l.cx;
    pcz = l.cz;
    if (!bench) status.value = '다시 쌓음 (${l.settleSteps}스텝) — ${l.live}장 · 더미를 누르고 당기기';
  }

  void _benchFire() {
    final l = live!;
    final (k, lat, ratio) = _benchShots[benchIdx++ % _benchShots.length];
    final layer = k < 0 ? (l.live - 1) ~/ 2 : math.min(k, l.live - 1);
    final s = l.fire(lat: lat, h: l.layerY(layer), breath: ratio * sweetHiFor(l.live));
    status.value = '벤치 → 위에서 ${layer + 1}장째 · 좌우 $lat · 숨 ×${s.res.ratio.toStringAsFixed(2)}';
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
    if (liveMode && live!.phase != LivePhase.ready) return; // 날아가는 중·다시 쌓는 중
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
    if (liveMode) {
      _fireLive(a);
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

  /// 놓기(실물리): Dart 숨 해석 → Rust blow. 같은 판·같은 입력이면 어느 기기·어느 주사율에서도 같은 결과(해시)
  void _fireLive(_Aim a) {
    final l = live!;
    final s = l.fire(lat: a.hit.lat, h: a.hit.h, breath: a.power);
    final zone = s.res.zone;
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
    status.value = '$label ×${s.res.ratio.toStringAsFixed(2)} (${s.live}장 정답 ${sweetHiFor(s.live).toStringAsFixed(2)}) → Rust 물리 · 세기 ${s.res.power.toStringAsFixed(2)}'
        '${s.res.blast > 0 ? ' 돌풍 ${s.res.blast.toStringAsFixed(2)}' : ''}';
  }

  void _toggleLive() {
    if (aim != null || player != null) return;
    final l = live;
    if (l == null) return;
    if (l.phase == LivePhase.flying || l.phase == LivePhase.settling) return;
    setState(() => useLive = !useLive);
    _showRest();
    stats.reset();
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
              if (live != null) _Btn(useLive ? '물리: Rust' : '물리: 녹화', _toggleLive),
              _Btn('그림자', () => _toggle((q) => q.shadows = !q.shadows)),
              _Btn('배율', () => _toggle((q) => q.renderScale = q.renderScale > 0.9 ? 0.75 : q.renderScale > 0.6 ? 0.5 : 1.0)),
              _Btn('AA', () => _toggle((q) => q.aa = AntiAliasingMode.values[(q.aa.index + 1) % AntiAliasingMode.values.length])),
              _Btn(bench ? '벤치 끔' : '벤치', () {
                setState(() => bench = !bench);
                stats.reset();
                if (bench && !liveMode && player == null && aim == null) _restack();
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

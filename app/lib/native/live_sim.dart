// 실제 물리로 한 판 굴리기 — 누르고·당기고·놓기 → Dart 숨 해석(resolveShot) → Rust blow → 화면 프레임마다 고정 1/120초 스텝
// → 자세 버퍼(보간) → 스텝 판정 → 뒤집힌 장수·원 밖 → 가져가기·다시 쌓기(화면에서 가라앉힘).
// 렌더러 독립(순수 Dart + SimCore) → test/native_sim_ffi_test.dart 가 리눅스 .so 로 Rust CLI 와 비트 대조한다.
//
// 🧭 가설(확인됨, 같은 테스트): 물리는 '화면 시간'이 아니라 '스텝 수'로만 정해진다(고정 dt + 스텝 판정 + 고정 호출 순서).
//   그래서 화면이 120Hz(프로모션)·90Hz·60Hz·프레임 떨굼 어느 쪽이어도 같은 판·같은 입력 → 같은 해시(PvP 의 바탕)이고,
//   화면 주사율은 '몇 스텝을 이번 프레임에 몰아 돌리나'와 보간 비율만 바꾼다.
//
// 시간 → 스텝: 밀린 시간이 0.25ms 를 넘으면 한 스텝 먼저 돌리고(앞서 시뮬) prev→cur 를 1 + acc/dt 로 되돌려 보간한다.
//   120Hz 화면 = 프레임당 정확히 1스텝·보간 없음(지연 0), 60Hz = 2스텝, 90Hz = 1·1·2 … + 보간. 한 프레임 최대 8스텝(그 너머는 버림 = 잠깐 슬로모션, 결과 불변).
import 'dart:math' as math;
import 'dart:typed_data';

import 'detmath.dart';
import 'rules.dart';
import 'sim_core.dart';

enum LivePhase { settling, ready, flying, judged }

/// 놓은 한 숨: 입력 + Dart 숨 해석 + 조준점(Rust 로 넘긴 값)
class LiveShot {
  LiveShot({required this.turn, required this.puffSeed, required this.live, required this.breath, required this.inLat, required this.inH, required this.res, required this.aimX, required this.aimY, required this.aimZ});
  final int turn, puffSeed, live;
  final double breath, inLat, inH;
  final ResolvedShot res;
  final double aimX, aimY, aimZ;
}

/// 스텝 판정 순간의 결과
class LiveJudge {
  LiveJudge({required this.flipped, required this.outs, required this.steps, required this.hash, required this.live});
  final int flipped, outs, steps, live;
  final int hash; // 상태 해시(FNV-1a 64) — PvP 양쪽 대조값
}

class LiveSim {
  LiveSim(this.lib, {this.n = 20, int seed = 1, this.maxStepsPerFrame = 8, bool liveSettle = false}) {
    reset(seed: seed, liveSettle: liveSettle);
  }

  /// 물리 1스텝(Rust Tune.dt = sim.js dt)
  static const double dt = 1 / 120;

  /// vsync 타임스탬프 떨림(마이크로초 반올림 등)을 흡수: 밀린 시간이 이보다 작으면 이번 프레임엔 안 돌린다
  static const double snap = 0.00025;

  final SimLibrary lib;
  final int n;
  final int maxStepsPerFrame;
  SimCore? _core;
  SimCore get core => _core!;

  int seed = 1;
  int turn = 0; // 이 판에서 쏜 횟수 (puffSeed = seed·1000 + turn, Rust CLI `puff_parity shots` 와 같은 규칙)
  LivePhase phase = LivePhase.ready;

  /// 직전 스텝·지금 스텝 자세(복사본, 딱지마다 f32 8개). 화면 = prev→cur 를 alpha 로 보간
  Float32List prev = Float32List(0), cur = Float32List(0);
  double alpha = 1;
  double _acc = 0;

  double top = 0, cx = 0, cz = 0;
  int live = 0;
  int settleSteps = 0; // 마지막 가라앉힘에 든 스텝
  LiveShot? shot;
  LiveJudge? judge;

  void Function(LiveJudge j)? onJudged;
  void Function()? onSettled;

  // 비용 계측(HUD): 이번 프레임 스텝 수 · advance 한 번 걸린 µs(스텝 + 자세 읽기 + 복사)
  int stepsLastFrame = 0, totalSteps = 0, lastAdvanceUs = 0;
  final Int32List _costRing = Int32List(240);
  int _costN = 0;
  final Stopwatch _sw = Stopwatch();

  /// 새 판: seed 로 더미 n 장 쌓기. liveSettle 이면 화면에서 가라앉히고(프레임마다 스텝), 아니면 그 자리에서 다 가라앉힌다(부팅)
  void reset({required int seed, bool liveSettle = false}) {
    _core?.dispose();
    this.seed = seed;
    turn = 0;
    shot = null;
    judge = null;
    final c = _core = lib.create(seed);
    c.addPile(n);
    settleSteps = 0;
    if (liveSettle) {
      c.settleBegin();
      phase = LivePhase.settling;
    } else {
      final s0 = c.info()[kInfoSteps];
      c.settle(600);
      settleSteps = (c.info()[kInfoSteps] - s0).toInt();
      phase = LivePhase.ready;
    }
    _acc = 0;
    _syncFrame();
    _readInfo();
  }

  void _syncFrame() {
    final f = core.frame();
    if (cur.length != f.length) {
      cur = Float32List(f.length);
      prev = Float32List(f.length);
    }
    cur.setAll(0, f);
    prev.setAll(0, cur);
    alpha = 1;
  }

  void _readInfo() {
    final i = core.info();
    top = i[kInfoTop];
    cx = i[kInfoCx];
    cz = i[kInfoCz];
    live = i[kInfoLive].toInt();
  }

  /// 위에서 k 번째(0 = 맨 위) 딱지 중심 높이
  double layerY(int k) => core.layerY(k);

  /// 놓기: Dart 숨 해석 → (해석에 쓴 난수 줄기를 Rust 판 난수로) → 조준 기하 → Rust blow.
  /// turn.js ShotRun.fire 와 같은 순서·같은 난수 소비. lat = 좌우(−0.95..0.95), h = 노릴 높이(절대 y), breath = 손가락 숨
  LiveShot fire({required double lat, required double h, required double breath, int? puffSeed, double? mouthY}) {
    if (phase != LivePhase.ready) throw StateError('LiveSim.fire: 지금은 $phase');
    _readInfo();
    final ps = (puffSeed ?? seed * 1000 + turn) & 0xffffffff;
    final rng = Mulberry32(ps);
    final r = resolveShot(lat: lat, h: h, power: breath, n: live, top: top, rng: rng);
    core.rngState = rng.state; // blow 의 jitter·텀블이 같은 줄기를 이어 쓴다
    final latC = math.max(-0.95, math.min(0.95, r.lat));
    final (ax, ay, az) = aimPoint(cx: cx, cz: cz, lat: latC, h: r.h);
    core.blow(aimX: ax, aimY: ay, aimZ: az, power: r.power, blast: r.blast, mouthY: mouthY);
    final s = shot = LiveShot(turn: turn, puffSeed: ps, live: live, breath: breath, inLat: lat, inH: h, res: r, aimX: ax, aimY: ay, aimZ: az);
    judge = null;
    turn++;
    phase = LivePhase.flying;
    _acc = 0;
    return s;
  }

  /// 화면 프레임마다(SceneView onTick 의 dt): 밀린 시간만큼 고정 스텝을 돌리고 보간 비율을 정한다. 반환: 이번에 돈 스텝 수
  int advance(double frameDt) {
    _sw
      ..reset()
      ..start();
    var k = 0;
    if (phase == LivePhase.flying || phase == LivePhase.settling) {
      _acc += math.min(0.1, math.max(0.0, frameDt));
      while (_acc > snap && k < maxStepsPerFrame) {
        prev.setAll(0, cur);
        final done = phase == LivePhase.flying ? core.stepJudge() : core.settleStep(600);
        cur.setAll(0, core.frame());
        _acc -= dt;
        k++;
        if (phase == LivePhase.settling) settleSteps++;
        if (done) {
          _finish();
          break;
        }
      }
      if (k >= maxStepsPerFrame && _acc > snap) _acc = 0; // 너무 밀렸다: 버린다(슬로모션) — 결과는 스텝 수로만 정해져 그대로
      alpha = (phase == LivePhase.flying || phase == LivePhase.settling) ? math.max(0.0, math.min(1.0, 1 + _acc / dt)) : 1.0;
    } else {
      alpha = 1;
    }
    stepsLastFrame = k;
    totalSteps += k;
    lastAdvanceUs = _sw.elapsedMicroseconds;
    if (k > 0) _costRing[_costN++ % _costRing.length] = lastAdvanceUs;
    return k;
  }

  void _finish() {
    _acc = 0;
    if (phase == LivePhase.flying) {
      final i = core.info();
      final j = judge = LiveJudge(flipped: i[kInfoFlipped].toInt(), outs: i[kInfoOuts].toInt(), steps: i[kInfoJudgeN].toInt(), hash: core.stateHash, live: i[kInfoLive].toInt());
      phase = LivePhase.judged;
      onJudged?.call(j);
    } else {
      phase = LivePhase.ready;
      _readInfo();
      onSettled?.call();
    }
  }

  /// 판정 뒤: 뒤집힌 딱지를 가져가고(제거) 남은 걸 다시 쌓아 화면에서 가라앉힌다. 남은 게 minLive 미만이면 새 판(seed + 1).
  /// 반환: 가져간 장수
  int takeAndRestack({int minLive = 1}) {
    if (phase != LivePhase.judged) throw StateError('LiveSim.takeAndRestack: 지금은 $phase');
    final taken = core.takeFlipped();
    _readInfo();
    if (live < minLive) {
      reset(seed: seed + 1, liveSettle: true);
      return taken;
    }
    core.restack();
    core.settleBegin();
    settleSteps = 0;
    phase = LivePhase.settling;
    _acc = 0;
    _syncFrame(); // 다시 쌓기는 순간 이동 → 보간하지 않게 prev = cur
    return taken;
  }

  int get stateHash => core.stateHash;

  /// advance 비용(µs) 분위수 — 스텝을 돈 프레임만
  int costPercentile(double p) {
    final m = math.min(_costN, _costRing.length);
    if (m == 0) return 0;
    final s = Int32List.fromList(_costRing.sublist(0, m))..sort();
    return s[math.min(m - 1, (p * m).floor())];
  }

  void dispose() {
    _core?.dispose();
    _core = null;
  }
}

// FPS · 프레임 시간 측정 — 120Hz(ProMotion) 목표를 실기기에서 판정하기 위한 데이터.
//  - 틱 간격: SceneView onTick 의 deltaSeconds(= vsync 사이 간격). 120Hz 면 8.3ms, 60Hz 상한(웹뷰 rAF)이면 16.7ms
//  - 엔진 시간: SchedulerBinding.addTimingsCallback 의 FrameTiming(UI build · raster). profile/release 에서만 정확
//  - 놓친 프레임: 간격이 목표의 1.5배를 넘은 횟수
import 'dart:math' as math;
import 'dart:ui' show FrameTiming;

class Pct {
  const Pct(this.p50, this.p95, this.max, this.n);
  final double p50, p95, max;
  final int n;
  static const empty = Pct(0, 0, 0, 0);
}

Pct percentiles(Iterable<double> xs) {
  final s = xs.toList()..sort();
  if (s.isEmpty) return Pct.empty;
  double at(double q) => s[math.min(s.length - 1, (q * (s.length - 1)).round())];
  return Pct(at(0.5), at(0.95), s.last, s.length);
}

class FrameStats {
  FrameStats({this.window = 240});
  final int window; // 최근 N 개(120Hz 에서 2초)
  final List<double> _dtMs = [], _buildMs = [], _rasterMs = [];
  double refreshHz = 60; // 화면이 알려 준 주사율(View.display.refreshRate)
  int janks = 0, ticks = 0;

  void _push(List<double> l, double v) {
    l.add(v);
    if (l.length > window) l.removeAt(0);
  }

  double get targetMs => 1000 / refreshHz;

  void addTick(double dtSeconds) {
    if (dtSeconds <= 0 || dtSeconds > 0.5) return; // 첫 틱·백그라운드 복귀는 버림
    final ms = dtSeconds * 1000;
    ticks++;
    if (ms > targetMs * 1.5) janks++;
    _push(_dtMs, ms);
  }

  void addTimings(List<FrameTiming> ts) {
    for (final t in ts) {
      _push(_buildMs, t.buildDuration.inMicroseconds / 1000);
      _push(_rasterMs, t.rasterDuration.inMicroseconds / 1000);
    }
  }

  void reset() {
    _dtMs.clear();
    _buildMs.clear();
    _rasterMs.clear();
    janks = 0;
    ticks = 0;
  }

  Pct get interval => percentiles(_dtMs);
  Pct get build => percentiles(_buildMs);
  Pct get raster => percentiles(_rasterMs);

  /// 최근 창의 평균 FPS(간격 평균의 역수)
  double get fps {
    if (_dtMs.isEmpty) return 0;
    final avg = _dtMs.reduce((a, b) => a + b) / _dtMs.length;
    return 1000 / avg;
  }

  String summary() {
    final i = interval, b = build, r = raster;
    String f(double v) => v.toStringAsFixed(1);
    return 'FPS ${fps.toStringAsFixed(0)} / ${refreshHz.toStringAsFixed(0)}Hz   jank $janks/$ticks\n'
        'frame  p50 ${f(i.p50)}  p95 ${f(i.p95)}  max ${f(i.max)} ms\n'
        'build  p50 ${f(b.p50)}  p95 ${f(b.p95)} ms\n'
        'raster p50 ${f(r.p50)}  p95 ${f(r.p95)} ms';
  }
}

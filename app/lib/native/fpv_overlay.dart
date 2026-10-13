// 1인칭 볼·입술 — main.js drawFPV 를 Flutter CustomPainter 로 옮김(웹은 2D 캔버스를 매 프레임 다시 그림).
// 숨을 당길수록 양 볼이 화면 아래 구석에서 부풀어 들어오고, 꽉이면 살짝 눌리고 떨림, 버티면 빨개지고 입꼬리로 김이 샌다.
// 다시 그리기는 BreathState(Listenable)가 바뀔 때만 — 위젯 트리를 매 프레임 다시 짓지 않는다(120Hz 예산).
import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'rules.dart';

enum PuffMode { idle, charge, blow, cough }

class BreathState extends ChangeNotifier {
  PuffMode mode = PuffMode.idle;
  double power = 0; // 당긴 숨(주머니)
  double fillAtBlow = 0;
  bool full = false;
  double strain = 0;
  double modeT0 = 0; // 이 모드가 시작된 시각(초, 장면 시계)
  double now = 0;

  void set(PuffMode m, double t) {
    if (m != mode) {
      if (m == PuffMode.blow) fillAtBlow = (power / kPouchFull).clamp(0, 1.12).toDouble();
      mode = m;
      modeT0 = t;
    }
  }

  void tick(double t) {
    now = t;
    notifyListeners();
  }
}

double _c(double v, double a, double b) => math.max(a, math.min(b, v));
Color _mix(List<int> a, List<int> b, double k, [double alpha = 1]) {
  k = _c(k, 0, 1);
  return Color.fromRGBO(
    (a[0] + (b[0] - a[0]) * k).round(),
    (a[1] + (b[1] - a[1]) * k).round(),
    (a[2] + (b[2] - a[2]) * k).round(),
    alpha,
  );
}

class FpvPainter extends CustomPainter {
  FpvPainter(this.s) : super(repaint: s);
  final BreathState s;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final tm = math.max(0.0, s.now - s.modeT0);
    final mode = s.mode;
    var fill = mode == PuffMode.charge ? _c(s.power / kPouchFull, 0, 1.12) : 0.0;
    if (mode == PuffMode.blow) fill = s.fillAtBlow * math.max(0, 1 - tm / 0.22); // 불면 볼이 푹 꺼짐
    if (mode == PuffMode.cough) fill = 0.3 * math.max(0, 1 - tm / 0.3);
    final strain = mode == PuffMode.charge ? s.strain : 0.0;
    final full = mode == PuffMode.charge && s.full;
    final v = 0.18 + 0.82 * math.min(1, fill);
    final shake = (full ? 1.5 : 0) + strain * 4 + (mode == PuffMode.cough ? 9 * math.max(0, 1 - tm / 0.5) : 0);
    final ms = s.now * 1000;
    canvas.save();
    canvas.translate(math.sin(ms * 0.07) * shake, math.cos(ms * 0.09) * shake * 0.6);
    // 아래 그늘
    final vy0 = h * (0.78 - 0.08 * v);
    canvas.drawRect(
      Rect.fromLTWH(-20, vy0, w + 40, h - vy0 + 20),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [const Color(0x003C1E14), Color.fromRGBO(60, 30, 20, 0.18 + 0.2 * v)],
        ).createShader(Rect.fromLTWH(0, vy0, w, h - vy0)),
    );
    // 버틸수록 볼이 빨개짐(웹 mixRGB)
    final sk = _mix(const [255, 208, 156], const [255, 120, 100], strain);
    final skd = _mix(const [238, 166, 120], const [220, 80, 70], strain);
    final skLight = _mix(const [255, 233, 181], const [255, 145, 125], strain);
    for (final sg in [-1.0, 1.0]) {
      final squash = full ? 0.9 : 1.0;
      final cx = w / 2 + sg * w * (0.66 - 0.12 * v), cy = h * (1.07 - 0.1 * v);
      final rx = w * (0.28 + 0.12 * v) * (full ? 1.04 : 1), ry = h * (0.14 + 0.08 * v) * squash;
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(sg * -0.18);
      final oval = Rect.fromCenter(center: Offset.zero, width: rx * 2, height: ry * 2);
      canvas.drawOval(
        oval,
        Paint()
          ..shader = RadialGradient(
            center: Alignment(-sg * 0.25, -0.45),
            radius: 0.75,
            colors: [skLight, sk, skd.withValues(alpha: 0.95), skd.withValues(alpha: 0)],
            stops: const [0.0, 0.7, 0.92, 1.0],
          ).createShader(oval),
      );
      // 홍조 + 윤기
      canvas.drawOval(
        Rect.fromCenter(center: Offset(-sg * rx * 0.2, -ry * 0.25), width: rx * 0.7, height: ry * 0.6),
        Paint()..color = Color.fromRGBO(255, 110, 120, _c(0.18 + 0.25 * v + 0.3 * strain, 0, 1)),
      );
      if (v > 0.45) {
        canvas.drawOval(
          Rect.fromCenter(center: Offset(-sg * rx * 0.38, -ry * 0.62), width: rx * 0.32, height: ry * 0.16),
          Paint()..color = Color.fromRGBO(255, 255, 255, 0.35 * (v - 0.45) / 0.55),
        );
      }
      canvas.restore();
    }
    // 윗입술
    final double open = mode == PuffMode.blow ? math.min(1.0, tm / 0.05) * math.max(0.0, 1 - tm / 0.5) : 0.0;
    final pk = math.min(1.0, fill);
    final lw = w * (0.2 - 0.07 * pk + 0.03 * open), lh = h * (0.03 + 0.018 * pk);
    final lx = w / 2, ly = h + 2 - lh * (0.9 + 0.5 * pk);
    final lip = Path()
      ..moveTo(lx - lw, h + 4)
      ..quadraticBezierTo(lx - lw * 0.95, ly + lh * 0.2, lx - lw * 0.5, ly)
      ..quadraticBezierTo(lx - lw * 0.18, ly - lh * 0.18, lx, ly + lh * 0.08)
      ..quadraticBezierTo(lx + lw * 0.18, ly - lh * 0.18, lx + lw * 0.5, ly)
      ..quadraticBezierTo(lx + lw * 0.95, ly + lh * 0.2, lx + lw, h + 4)
      ..close();
    canvas.drawPath(
      lip,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFF08A94), Color(0xFFD4566A), Color(0xFFA8304A)],
          stops: [0, 0.45, 1],
        ).createShader(Rect.fromLTRB(lx - lw, ly - lh, lx + lw, h)),
    );
    canvas.drawPath(
      lip,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = const Color.fromRGBO(120, 30, 40, 0.45),
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(lx - lw * 0.45, ly + lh * 0.35), width: lw * 0.32, height: lh * 0.36),
      Paint()..color = const Color.fromRGBO(255, 255, 255, 0.45),
    );
    final crease = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = Color.fromRGBO(120, 20, 35, 0.25 + 0.35 * pk);
    for (final sg in [-1.0, 1.0]) {
      for (var q = 1; q <= 2; q++) {
        canvas.drawLine(Offset(lx + sg * lw * (0.2 + q * 0.15), ly + lh * 0.6), Offset(lx + sg * lw * (0.12 + q * 0.12), h), crease);
      }
    }
    if (open > 0) {
      canvas.drawOval(
        Rect.fromCenter(center: Offset(lx, ly - 6), width: lw * 0.56 * open, height: 20 * open),
        Paint()..color = Color.fromRGBO(255, 255, 255, 0.6 * open),
      );
    }
    // 참다가 새는 김
    if (strain > kLeakAt) {
      final ph = (ms * 0.0025) % 1;
      canvas.drawCircle(Offset(lx + lw * 0.7 + ph * 30, ly - 6 - ph * 26), 6 + ph * 8, Paint()..color = Color.fromRGBO(255, 255, 255, 0.7 * (1 - ph)));
    }
    // 콜록 구름
    if (mode == PuffMode.cough) {
      for (var i = 0; i < 4; i++) {
        final k = _c(tm * 2 - i * 0.12, 0, 1);
        canvas.drawCircle(Offset(lx + (i - 1.5) * 40 * k, ly - 10 - 80 * k), 14 + 20 * k, Paint()..color = Color.fromRGBO(210, 205, 200, 0.8 * (1 - k)));
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(FpvPainter old) => old.s != s;
}

// 딱지·책상 텍스처를 dart:ui 캔버스로 절차 생성 (외부 이미지 0) — mockup/src/art.js 를 단순화해 옮김.
// 그림은 시안 수준(몸통·배·눈·입 + 희귀도 햇살·테두리). 최종 아트는 3D/AI 로 바뀔 예정이라 여기는 '그림이 붙는가'만 증명.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'track.dart';

class Rarity {
  const Rarity(this.side, this.ring0, this.ring1, this.ray0, this.ray1);
  final ui.Color side, ring0, ring1, ray0, ray1;
}

// art.js RARITY 와 같은 색
const Map<String, Rarity> kRarity = {
  'common': Rarity(ui.Color(0xFFDDE6EE), ui.Color(0xFFFFFFFF), ui.Color(0xFFE9EEF3), ui.Color(0xFFFFE9A8), ui.Color(0xFFFFD76A)),
  'rare': Rarity(ui.Color(0xFF2F7FD6), ui.Color(0xFF8FD3FF), ui.Color(0xFF2F7FD6), ui.Color(0xFFC9ECFF), ui.Color(0xFF7CC7FF)),
  'epic': Rarity(ui.Color(0xFF8A3AD6), ui.Color(0xFFE6A6FF), ui.Color(0xFF8A3AD6), ui.Color(0xFFF2D2FF), ui.Color(0xFFCF8CFF)),
  'legendary': Rarity(ui.Color(0xFFFFB800), ui.Color(0xFFFFE066), ui.Color(0xFFE08A00), ui.Color(0xFFFFF3B0), ui.Color(0xFFFFC93C)),
};

const ui.Color kInk = ui.Color(0xFF2A1A12);

ui.Color hexColor(String hex) => ui.Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));

Future<ui.Image> _paint(int w, int h, void Function(ui.Canvas c) draw) {
  final rec = ui.PictureRecorder();
  final c = ui.Canvas(rec, ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()));
  draw(c);
  return rec.endRecording().toImage(w, h);
}

ui.Paint _fill(ui.Color c) => ui.Paint()..color = c;
ui.Paint _stroke(ui.Color c, double w) => ui.Paint()
  ..color = c
  ..style = ui.PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = ui.StrokeCap.round;

/// 앞면(그림 면, 원판 로컬 +Y). 단위 원(-0.5..0.5)에 그린 뒤 size 로 늘림
Future<ui.Image> faceImage(CardInfo card, {int size = 256}) => _paint(size, size, (c) {
  final r = kRarity[card.rarity] ?? kRarity['common']!;
  c.translate(size / 2, size / 2);
  c.scale(size.toDouble(), size.toDouble());
  c.drawRect(const ui.Rect.fromLTRB(-0.5, -0.5, 0.5, 0.5), _fill(r.ray0));
  // 햇살
  final rays = ui.Path();
  for (var i = 0; i < 24; i += 2) {
    final a0 = i / 24 * math.pi * 2, a1 = (i + 1) / 24 * math.pi * 2;
    rays
      ..moveTo(0, 0)
      ..lineTo(math.cos(a0) * 0.75, math.sin(a0) * 0.75)
      ..lineTo(math.cos(a1) * 0.75, math.sin(a1) * 0.75)
      ..close();
  }
  c.drawPath(rays, _fill(r.ray1));
  // 몸통 + 배
  final body = hexColor(card.body), belly = hexColor(card.belly);
  c.drawCircle(const ui.Offset(0, 0.02), 0.27, _fill(body));
  c.drawCircle(const ui.Offset(0, 0.02), 0.27, _stroke(kInk, 0.022));
  c.drawOval(ui.Rect.fromCenter(center: const ui.Offset(0, 0.12), width: 0.3, height: 0.2), _fill(belly));
  // 눈 · 볼 · 입
  for (final sx in [-1.0, 1.0]) {
    c.drawCircle(ui.Offset(0.09 * sx, -0.04), 0.05, _fill(const ui.Color(0xFFFFFFFF)));
    c.drawCircle(ui.Offset(0.09 * sx, -0.04), 0.05, _stroke(kInk, 0.014));
    c.drawCircle(ui.Offset(0.1 * sx, -0.035), 0.026, _fill(kInk));
    c.drawCircle(ui.Offset(0.092 * sx, -0.048), 0.009, _fill(const ui.Color(0xFFFFFFFF)));
    c.drawOval(ui.Rect.fromCenter(center: ui.Offset(0.17 * sx, 0.04), width: 0.07, height: 0.04), _fill(const ui.Color(0x66FF6E78)));
  }
  final mouth = ui.Path()
    ..moveTo(-0.06, 0.05)
    ..quadraticBezierTo(0, 0.12, 0.06, 0.05);
  c.drawPath(mouth, _stroke(kInk, 0.02));
  // 이름 띠 대신 비대칭 표식(별) — 거울로 뒤집혀 그려지면 바로 보이게(왼손 좌표 변환 확인용)
  _star(c, const ui.Offset(0.2, -0.27), 0.06, 0.025, const ui.Color(0xFFD7263D));
  // 희귀도 테두리 링
  c.drawCircle(ui.Offset.zero, 0.47, _stroke(r.ring1, 0.06));
  c.drawCircle(ui.Offset.zero, 0.47, _stroke(r.ring0, 0.03));
  c.drawCircle(ui.Offset.zero, 0.5, _stroke(kInk, 0.012));
});

void _star(ui.Canvas c, ui.Offset o, double ro, double ri, ui.Color col) {
  final p = ui.Path();
  for (var i = 0; i < 10; i++) {
    final rr = i.isOdd ? ri : ro, a = -math.pi / 2 + i / 10 * math.pi * 2;
    final pt = ui.Offset(o.dx + math.cos(a) * rr, o.dy + math.sin(a) * rr);
    i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
  }
  p.close();
  c.drawPath(p, _fill(col));
}

/// 뒷면(마분지 + 동심원 + 빨간 별) — art.js drawBack
Future<ui.Image> backImage({int size = 256}) => _paint(size, size, (c) {
  c.translate(size / 2, size / 2);
  c.scale(size.toDouble(), size.toDouble());
  c.drawRect(
    const ui.Rect.fromLTRB(-0.5, -0.5, 0.5, 0.5),
    ui.Paint()
      ..shader = ui.Gradient.radial(const ui.Offset(-0.1, -0.1), 0.6, const [ui.Color(0xFFC48A4C), ui.Color(0xFF9B6634)]),
  );
  final rng = math.Random(7);
  for (var i = 0; i < 700; i++) {
    final x = rng.nextDouble() - 0.5, y = rng.nextDouble() - 0.5;
    c.drawRect(ui.Rect.fromLTWH(x, y, 0.012, 0.003), _fill(rng.nextBool() ? const ui.Color(0x12784E1E) : const ui.Color(0x14FFFFFF)));
  }
  c.drawCircle(ui.Offset.zero, 0.47, _stroke(kInk, 0.03));
  c.drawCircle(ui.Offset.zero, 0.42, _stroke(const ui.Color(0xFF2F5BD3), 0.02));
  c.drawCircle(ui.Offset.zero, 0.38, _stroke(const ui.Color(0xFF2F5BD3), 0.008));
  _star(c, const ui.Offset(0, -0.03), 0.3, 0.12, const ui.Color(0xFFE23B2E));
});

/// 옆면(종이 단면 + 가운데 희귀도 띠) — art.js drawEdge. 둘레를 따라 반복
Future<ui.Image> edgeImage(ui.Color stripe) => _paint(128, 32, (c) {
  c.drawRect(const ui.Rect.fromLTWH(0, 0, 128, 32), _fill(const ui.Color(0xFFE2C793)));
  for (var i = 0; i < 6; i++) {
    c.drawRect(ui.Rect.fromLTWH(0, i / 6 * 32, 128, 32 / 12), _fill(i.isOdd ? const ui.Color(0x408C6432) : const ui.Color(0x33FFFFFF)));
  }
  c.drawRect(const ui.Rect.fromLTWH(0, 32 * 0.3, 128, 32 * 0.4), _fill(stripe));
  c.drawRect(const ui.Rect.fromLTWH(0, 32 * 0.3, 128, 32 * 0.06), _fill(const ui.Color(0x59FFFFFF)));
});

/// 책상 나뭇결 (main.js woodTexture)
Future<ui.Image> woodImage({int size = 1024}) => _paint(size, size, (c) {
  final s = size.toDouble();
  c.drawRect(
    ui.Rect.fromLTWH(0, 0, s, s),
    ui.Paint()
      ..shader = ui.Gradient.linear(ui.Offset.zero, ui.Offset(s, 0), const [ui.Color(0xFFC98B4F), ui.Color(0xFFD89A5A), ui.Color(0xFFC4844A)], const [0, 0.5, 1]),
  );
  final rng = math.Random(3);
  for (var i = 0; i < 140; i++) {
    final y = rng.nextDouble() * s;
    final p = ui.Path()..moveTo(0, y);
    for (var x = 0.0; x <= s; x += s / 16) {
      p.lineTo(x, y + math.sin(x * 0.01 + i) * 6 * s / 1024 + (rng.nextDouble() - 0.5) * 3);
    }
    final a = 0.06 + rng.nextDouble() * 0.1;
    c.drawPath(p, _stroke(ui.Color.fromARGB((a * 255).round(), 90 + rng.nextInt(40), 50 + rng.nextInt(20), 20), (1 + rng.nextDouble() * 4) * s / 1024));
  }
  for (final y in [0.25, 0.5, 0.75]) {
    c.drawRect(ui.Rect.fromLTWH(0, y * s - 2, s, 4), _fill(const ui.Color(0x593C1E0A)));
  }
});

/// 분필 원(손으로 두 번 그은 선) — 투명 바탕. 판(지름 2(R+0.5))에 붙인다
Future<ui.Image> chalkImage({int size = 512, double circleR = 3.2}) => _paint(size, size, (c) {
  final h = size / 2;
  c.translate(h, h);
  final rr = h * (circleR / (circleR + 0.5));
  final rng = math.Random(77);
  for (var pass = 0; pass < 2; pass++) {
    final p = ui.Path();
    for (var i = 0; i <= 120; i++) {
      final a = i / 120 * math.pi * 2 + pass * 0.3;
      final r = rr + math.sin(a * 3 + pass) * 3 + (rng.nextDouble() - 0.5) * 2.5;
      i == 0 ? p.moveTo(math.cos(a) * r, math.sin(a) * r) : p.lineTo(math.cos(a) * r, math.sin(a) * r);
    }
    c.drawPath(p, _stroke(ui.Color.fromARGB(pass == 1 ? 140 : 205, 255, 255, 250), pass == 1 ? 7 : 10));
  }
  for (var i = 0; i < 260; i++) {
    final a = rng.nextDouble() * math.pi * 2, r = rr + (rng.nextDouble() - 0.5) * 30;
    c.drawRect(ui.Rect.fromLTWH(math.cos(a) * r, math.sin(a) * r, 2, 2), _fill(const ui.Color(0x59FFFFFA)));
  }
});

/// 교실 벽 + 칠판 (main.js classroomBackdrop 단순화 — 글자는 빼고 그림만)
Future<ui.Image> backdropImage() => _paint(1024, 384, (c) {
  c.drawRect(
    const ui.Rect.fromLTWH(0, 0, 1024, 384),
    ui.Paint()..shader = ui.Gradient.linear(ui.Offset.zero, const ui.Offset(0, 384), const [ui.Color(0xFFF6E7C4), ui.Color(0xFFE9CF9C)]),
  );
  c.drawRect(const ui.Rect.fromLTWH(0, 300, 1024, 84), _fill(const ui.Color(0xFFB07A46)));
  for (var x = 0.0; x < 1024; x += 64) {
    c.drawRect(ui.Rect.fromLTWH(x, 300, 2, 84), _fill(const ui.Color(0x1F000000)));
  }
  for (final x0 in [30.0, 834.0]) {
    c.drawRect(ui.Rect.fromLTWH(x0 - 6, 44, 172, 192), _fill(const ui.Color(0xFFFFFFFF)));
    c.drawRect(
      ui.Rect.fromLTWH(x0, 50, 160, 180),
      ui.Paint()..shader = ui.Gradient.linear(const ui.Offset(0, 50), const ui.Offset(0, 230), const [ui.Color(0xFF5FC8FF), ui.Color(0xFFC8EFFF)]),
    );
    c.drawRect(ui.Rect.fromLTWH(x0 + 78, 50, 4, 180), _fill(const ui.Color(0xFFFFFFFF)));
    c.drawRect(ui.Rect.fromLTWH(x0, 138, 160, 4), _fill(const ui.Color(0xFFFFFFFF)));
  }
  c.drawRect(const ui.Rect.fromLTWH(250, 35, 524, 235), _fill(const ui.Color(0xFF8A5A2F)));
  c.drawRect(
    const ui.Rect.fromLTWH(260, 45, 504, 215),
    ui.Paint()..shader = ui.Gradient.linear(const ui.Offset(0, 45), const ui.Offset(0, 260), const [ui.Color(0xFF2F6B4F), ui.Color(0xFF245640)]),
  );
  // 분필 낙서: 딱지 두 개 + 화살표
  final chalk = _stroke(const ui.Color(0xC0FFFFFF), 3);
  for (final cx in [380.0, 640.0]) {
    c.drawCircle(ui.Offset(cx, 150), 40, chalk);
    c.drawCircle(ui.Offset(cx, 150), 28, chalk);
  }
  c.drawLine(const ui.Offset(440, 150), const ui.Offset(580, 150), chalk);
  c.drawLine(const ui.Offset(560, 136), const ui.Offset(580, 150), chalk);
  c.drawLine(const ui.Offset(560, 164), const ui.Offset(580, 150), chalk);
  c.drawRect(const ui.Rect.fromLTWH(250, 270, 524, 11), _fill(const ui.Color(0xFFC9A77A)));
});

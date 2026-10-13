// B 시제품: 1인칭 볼·입술 오버레이(CustomPainter)가 모든 숨 상태에서 예외 없이 그려지는지 — GPU 없이 도는 부분만
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:puff/native/fpv_overlay.dart';
import 'package:puff/native/rules.dart';

void main() {
  testWidgets('대기·당김(꽉·버팀)·불기·콜록', (tester) async {
    final s = BreathState();
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: SizedBox(width: 390, height: 844, child: CustomPaint(painter: FpvPainter(s))),
    ));
    final steps = <void Function()>[
      () => s.set(PuffMode.idle, 0),
      () => s
        ..set(PuffMode.charge, 0.1)
        ..power = 0.5,
      () => s
        ..power = kPouchFull
        ..full = true
        ..strain = 0.6, // 꽉에서 버팀 → 빨개지고 김이 샘
      () => s.set(PuffMode.blow, 0.4),
      () => s.set(PuffMode.cough, 0.6),
    ];
    var t = 0.0;
    for (final step in steps) {
      step();
      for (var i = 0; i < 3; i++) {
        t += 1 / 120;
        s.tick(t);
        await tester.pump(const Duration(milliseconds: 8));
      }
    }
    expect(tester.takeException(), isNull);
    expect(s.fillAtBlow, closeTo(1.0, 1e-9)); // 꽉에서 불면 볼이 가득 찬 데서 꺼진다
  });
}

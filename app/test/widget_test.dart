import 'package:flutter_test/flutter_test.dart';
import 'package:puff/haptics.dart';

void main() {
  test('진동 밀리초 → 햅틱 세기', () {
    expect(parseHaptic('0'), HapticKind.none);
    expect(parseHaptic('12'), HapticKind.light);
    expect(parseHaptic('25'), HapticKind.medium);
    expect(parseHaptic('50'), HapticKind.heavy);
    expect(parseHaptic('p:40,60,40'), HapticKind.pattern);
    expect(parseHaptic('garbage'), HapticKind.none);
  });
}

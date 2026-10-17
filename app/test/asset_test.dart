// 게임 한 파일이 앱 번들에 들어가는지(빠지면 첫 실행이 검은 화면). 먼저: cd .. && npm run app:www
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('assets/www/index.html 이 번들에 있고 게임 + 다리 코드가 들어 있다', () async {
    final html = await rootBundle.loadString('assets/www/index.html');
    expect(html.length, greaterThan(1000000)); // 게임(Rapier WASM 포함) ≈ 2.7MB
    expect(html.contains('PuffHaptic'), isTrue); // 앱 다리 코드
    expect(html.contains('<canvas'), isTrue);
  });
}

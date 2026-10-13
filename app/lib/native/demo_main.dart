// B 시제품 데모 단독 진입점: 웹뷰 게임 없이 네이티브 3D 장면만 띄운다.
//   아이폰:  flutter run --profile -t lib/native/demo_main.dart -d <기기>
//   웹 확인: flutter build web -t lib/native/demo_main.dart (app/tool/web_check.sh — flutter_scene 의 WebGL2 백엔드)
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'demo_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const NativeDemoApp());
}

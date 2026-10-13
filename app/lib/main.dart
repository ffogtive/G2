// PUFF! 앱 껍데기(Flutter). 게임 본체는 웹 빌드 한 파일(three.js + Rapier)을 웹뷰로 연다.
// - 물리·튜닝·PvP 동기는 웹 코드 그대로(같은 sim.js). 앱 쪽은 화면·소리 세션·햅틱·수명 주기를 맡는다.
// - 게임은 앱 안 로컬 서버(127.0.0.1:47821)로 연다: file:// 은 보안 컨텍스트가 아니라 마이크(getUserMedia)가 안 되고,
//   포트를 고정해야 저장소(localStorage) 출처가 실행마다 같다.
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'haptics.dart';

const kGamePort = 47821;
const kBg = Color(0xFF2A1A12);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  // 무음 스위치가 켜져 있어도 '푸' 소리(게임 핵심 피드백), 다른 앱 음악은 끊지 않음
  final session = await AudioSession.instance;
  await session.configure(const AudioSessionConfiguration(
    avAudioSessionCategory: AVAudioSessionCategory.playback,
    avAudioSessionCategoryOptions: AVAudioSessionCategoryOptions.mixWithOthers,
    avAudioSessionMode: AVAudioSessionMode.defaultMode,
    androidAudioAttributes: AndroidAudioAttributes(usage: AndroidAudioUsage.game, contentType: AndroidAudioContentType.sonification),
    androidWillPauseWhenDucked: false,
  ));
  final url = await GameServer.start();
  runApp(PuffApp(url: url));
}

/// 게임 한 파일(assets/www/index.html)을 루프백으로만 내보내는 아주 작은 HTTP 서버
class GameServer {
  static HttpServer? _server;

  static Future<Uri> start() async {
    final html = (await rootBundle.load('assets/www/index.html')).buffer.asUint8List();
    HttpServer server;
    try {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, kGamePort);
    } on SocketException {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0); // 포트가 막혔으면 아무 포트(이번 실행만 저장소가 따로)
    }
    _server = server;
    server.listen((req) {
      final res = req.response;
      if (req.uri.path == '/' || req.uri.path == '/index.html') {
        res.headers.contentType = ContentType.html;
        res.headers.set('Cache-Control', 'no-store');
        res.add(html);
      } else {
        res.statusCode = HttpStatus.notFound;
      }
      res.close();
    });
    return Uri.parse('http://127.0.0.1:${server.port}/');
  }

  static Future<void> stop() async => _server?.close(force: true);
}

class PuffApp extends StatelessWidget {
  const PuffApp({super.key, required this.url});
  final Uri url;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PUFF!',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(scaffoldBackgroundColor: kBg),
      home: GamePage(url: url),
    );
  }
}

class GamePage extends StatefulWidget {
  const GamePage({super.key, required this.url});
  final Uri url;

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  late final WebViewController _web;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final PlatformWebViewControllerCreationParams params = WebViewPlatform.instance is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: true,
            mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
          )
        : const PlatformWebViewControllerCreationParams();
    _web = WebViewController.fromPlatformCreationParams(
      params,
      // 마이크 모드(선택): 게임이 getUserMedia 를 부르면 허락(iOS 는 Info.plist 문구로 시스템 권한을 한 번 더 묻는다)
      onPermissionRequest: (request) => request.grant(),
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBg)
      // 웹 쪽 navigator.vibrate(ms|패턴) → 다리 코드(mockup/app/bridge.js)가 여기로 보냄
      ..addJavaScriptChannel('PuffHaptic', onMessageReceived: (m) => playHaptic(parseHaptic(m.message)))
      ..loadRequest(widget.url);
    final platform = _web.platform;
    if (platform is WebKitWebViewController) {
      platform.setInspectable(kDebugMode);
      platform.setAllowsBackForwardNavigationGestures(false);
    }
    if (platform is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(kDebugMode);
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // 앱이 뒤로 가면 게임에 '창 벗어남'을 알려 조준·들숨을 취소(게임은 blur·visibilitychange 를 듣는다)
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _web.runJavaScript("window.dispatchEvent(new Event('blur'))");
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    GameServer.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // SafeArea 를 쓰지 않는다: 게임 CSS 가 env(safe-area-inset-*) 로 노치·홈 막대를 직접 피한다(viewport-fit=cover)
    return Scaffold(backgroundColor: kBg, body: WebViewWidget(controller: _web));
  }
}

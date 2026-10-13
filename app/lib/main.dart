// PUFF! 앱 껍데기(Flutter). 게임 본체는 웹 빌드 한 파일(three.js + Rapier)을 웹뷰로 연다.
// - 물리·튜닝·PvP 동기는 웹 코드 그대로(같은 sim.js). 앱 쪽은 화면·소리 세션·햅틱·수명 주기를 맡는다.
// - 게임은 앱 안 로컬 서버(127.0.0.1:47821)로 연다: file:// 은 보안 컨텍스트가 아니라 마이크(getUserMedia)가 안 되고,
//   포트를 고정해야 저장소(localStorage) 출처가 실행마다 같다.
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'haptics.dart';
import 'native/demo_page.dart';

const kGamePort = 47821;
const kBg = Color(0xFF2A1A12);
// B 시제품(네이티브 3D 장면 데모, lib/native/) 숨은 입구: --dart-define=NATIVE_DEMO=true 면 웹뷰 게임 대신 데모만 띄운다.
// 평소 빌드에서는 왼쪽 위 노치 옆(안전 영역, 게임 UI 가 없는 곳)을 1.5초 길게 누르면 열린다. 기본은 언제나 웹뷰 게임.
const kNativeDemo = bool.fromEnvironment('NATIVE_DEMO');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  if (kNativeDemo) {
    runApp(const NativeDemoApp());
    return;
  }
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

  /// 서버가 살아 있는지 보고, 죽었으면 같은 포트로 다시 연다(저장소 출처 유지)
  static Future<Uri> ensure() async {
    final s = _server;
    if (s != null) {
      try {
        final c = await HttpClient().getUrl(Uri.parse('http://127.0.0.1:${s.port}/'));
        final r = await c.close();
        await r.drain<void>();
        if (r.statusCode == 200) return Uri.parse('http://127.0.0.1:${s.port}/');
      } catch (_) {/* 죽음 → 아래에서 다시 */}
      await s.close(force: true);
    }
    return start();
  }
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
      // iOS 웹 콘텐츠 프로세스가 죽으면(메모리 압박) 빈 화면이 남는다 → 다시 연다
      ..setNavigationDelegate(NavigationDelegate(
        onWebResourceError: (e) {
          if (e.errorType == WebResourceErrorType.webContentProcessTerminated) _reload();
        },
      ))
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

  // 숨은 입구 → 네이티브 데모. 웹 게임을 먼저 내려(빈 페이지) WebGL·rAF 가 GPU 를 같이 쓰지 않게 한다(FPS 측정 오염 방지).
  // 돌아오면 게임을 다시 연다(진행 중이던 판은 버림 — 디버그 입구라서)
  Future<void> _openNativeDemo() async {
    HapticFeedback.mediumImpact();
    await _web.loadHtmlString('<html><body style="background:#2a1a12"></body></html>');
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NativeDemoPage()));
    if (mounted) await _reload();
  }

  Future<void> _reload() async {
    final url = await GameServer.ensure(); // 백그라운드에서 듣기 소켓이 회수됐을 수 있다 → 다시 연다
    await _web.loadRequest(url);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) GameServer.ensure();
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
    final topInset = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: kBg,
      body: Stack(children: [
        Positioned.fill(child: WebViewWidget(controller: _web)),
        // 노치 옆 안전 영역(게임 CSS 가 비워 두는 곳)만 — 안전 영역이 없는 기기는 --dart-define=NATIVE_DEMO=true 로
        if (topInset >= 20)
          Positioned(
            left: 0,
            top: 0,
            width: 88,
            height: topInset,
            child: RawGestureDetector(
              behavior: HitTestBehavior.opaque,
              gestures: {
                LongPressGestureRecognizer: GestureRecognizerFactoryWithHandlers<LongPressGestureRecognizer>(
                  () => LongPressGestureRecognizer(duration: const Duration(milliseconds: 1500)),
                  (r) => r.onLongPress = _openNativeDemo,
                ),
              },
            ),
          ),
      ]),
    );
  }
}

import AVFoundation
import CoreHaptics
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let richHaptics = PuffRichHaptics()
  private let impactHaptics = PuffImpact()
  private var hapticsChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    PuffDiag.allowHapticsWhileRecording()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // 'puff/haptics' 채널(lib/haptics.dart · lib/native/rich_haptics.dart). 없거나 실패하면 Dart 쪽이 Flutter HapticFeedback 로 대신한다
    //  play   Core Haptics 패턴(신호 이름)          → Bool   (게임 진동 기본 길: tapLight·tapMedium·tapHeavy·cough — lib/haptics.dart game())
    //  warm   Core Haptics 엔진 미리 켜기(예열)       → Bool
    //  impact 생성기 톡 {style, intensity}           → "view"(뷰에 붙인 생성기) | "plain"(뷰 없는 생성기)
    //  diag   앱 소리 세션·햅틱 하드웨어·저전력·iOS 판 → [String: Any] (⚙ 소리·진동 시험)
    let channel = FlutterMethodChannel(name: "puff/haptics", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    let haptics = richHaptics
    let impact = impactHaptics
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "impact": result(impact.play(call.arguments))
      case "warm": result(haptics.warm())
      case "diag": result(PuffDiag.info())
      default: haptics.handle(call, result: result)
      }
    }
    hapticsChannel = channel
  }
}

/// 웹 진동(navigator.vibrate → 다리 → Dart)을 손끝 톡으로. Flutter 엔진 HapticFeedback 은 부를 때마다 뷰 없는 생성기(init(style:))를
/// 새로 만들어 prepare 없이 한 번 울리는데, 그 생성자는 iOS 27 에서 폐기됐다(대체 = init(style:view:), iOS 17.5+ — Apple 개발자 문서
/// UIImpactFeedbackGenerator init(style:) deprecatedAt iOS 27.0, 2026-10-14 확인). 폐기된 생성자가 기기에서 조용히 무시되는지는 미검증.
/// 여기서는 스타일별 생성기를 게임 화면 뷰에 붙여 붙잡아 두고, 울린 뒤 바로 prepare 해서 다음 톡의 지연을 줄인다.
final class PuffImpact {
  private var gens: [Int: (UIImpactFeedbackGenerator, String)] = [:]
  private weak var hostView: UIView?

  func play(_ arguments: Any?) -> String {
    PuffDiag.allowHapticsWhileRecording()  // 앱 세션 설정이 나중에 바뀌었어도 다시 켠다(값이 이미 켜져 있으면 아무것도 안 함)
    let args = arguments as? [String: Any]
    let name = args?["style"] as? String ?? "heavy"
    let intensity = CGFloat(args?["intensity"] as? Double ?? 1.0)
    let style: UIImpactFeedbackGenerator.FeedbackStyle
    switch name {
    case "light": style = .light
    case "medium": style = .medium
    case "soft": style = .soft
    case "rigid": style = .rigid
    default: style = .heavy
    }
    let view = PuffImpact.findHostView()
    if view !== hostView {
      gens.removeAll()
      hostView = view
    }
    let entry: (UIImpactFeedbackGenerator, String)
    if let e = gens[style.rawValue] {
      entry = e
    } else {
      entry = PuffImpact.make(style, view)
      gens[style.rawValue] = entry
    }
    entry.0.impactOccurred(intensity: max(0, min(1, intensity)))
    entry.0.prepare()
    return entry.1
  }

  private static func make(_ style: UIImpactFeedbackGenerator.FeedbackStyle, _ view: UIView?) -> (UIImpactFeedbackGenerator, String) {
    if #available(iOS 17.5, *), let view = view {
      return (UIImpactFeedbackGenerator(style: style, view: view), "view")
    }
    return (UIImpactFeedbackGenerator(style: style), "plain")
  }

  static func findHostView() -> UIView? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    return (windows.first(where: { $0.isKeyWindow }) ?? windows.first)?.rootViewController?.view
  }
}

/// ⚙ 소리·진동 시험이 보여 줄 앱 쪽 정보(참고용). 모두 이 앱(Flutter) 프로세스 세션 값이다 — 웹뷰 소리·마이크 녹음은 WebKit 프로세스가
/// 자기 세션(category·옵션)을 따로 정한다. 그래서 출력 경로는 범주에 따라 다를 수 있고(예: 에어팟 = 앱은 A2DP, WebKit 녹음 중은 HFP),
/// '다른 소리 재생 중'에는 방금 낸 게임 웹 소리가 들어갈 수 있다(미검증).
enum PuffDiag {
  /// iOS 는 녹음 중 햅틱·시스템 소리를 기본으로 막는다(allowHapticsAndSystemSoundsDuringRecording 기본 false). 마이크 불기 중 진동이 오게 켠다.
  /// 녹음은 WebKit 프로세스 세션에서 일어나서 이 앱 세션 값이 거기에 먹는지는 기기 확인 필요(마이크 켬/끔 진동 비교)
  static func allowHapticsWhileRecording() {
    let s = AVAudioSession.sharedInstance()
    if s.allowHapticsAndSystemSoundsDuringRecording { return }
    try? s.setAllowHapticsAndSystemSoundsDuringRecording(true)
  }

  static func info() -> [String: Any] {
    allowHapticsWhileRecording()
    let s = AVAudioSession.sharedInstance()
    let route = s.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
    return [
      "category": s.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: ""),
      "mode": s.mode.rawValue.replacingOccurrences(of: "AVAudioSessionMode", with: ""),
      "hapticsRec": s.allowHapticsAndSystemSoundsDuringRecording,
      "route": route,
      "volume": Double(s.outputVolume),
      "otherAudio": s.isOtherAudioPlaying,
      "supportsHaptics": CHHapticEngine.capabilitiesForHardware().supportsHaptics,
      "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
      "ios": UIDevice.current.systemVersion,
    ]
  }
}

/// 딱지 손끝 신호: 톡(transient)과 웅(continuous)을 시간차로 엮은 Core Haptics 패턴.
/// UIImpactFeedbackGenerator(= Flutter HapticFeedback)는 세기 3단계 톡 한 번뿐이라 '꽉(코르크 읍)'·'콜록'·'퍽+바람 꼬리'를 못 낸다.
/// 엔진 수명(게임 진동 기본 길이라 첫 톡이 늦지 않게): 한 번 만든 엔진은 버리지 않는다. 자동 꺼짐(idleTimeout)·인터럽트·앱 멈춤·서버 재시작(reset)
/// 뒤에는 표시만 해 두고 다음 호출(진동 또는 판에서 누를 때의 예열 'w:')에서 start() 만 다시 한다. 엔진이 망가졌을 때(engineDestroyed·systemError)만 새로 만든다.
/// stoppedHandler·resetHandler 는 엔진 내부 큐에서 불린다 → 상태 쓰기는 메인 큐로 넘긴다(채널 처리기 handle·warm 은 메인 스레드).
final class PuffRichHaptics {
  private var engine: CHHapticEngine?
  private var needsStart = false
  private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "play", let cue = call.arguments as? String else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard supported else {
      result(false)
      return
    }
    do {
      let engine = try ensureEngine()
      let pattern = try CHHapticPattern(events: events(for: cue), parameters: [])
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
      result(true)
    } catch {
      needsStart = true  // 엔진은 두고 다음 호출에서 start() 다시(만들기부터 다시 하면 첫 톡이 늦다)
      result(false)
    }
  }

  /// 예열: 엔진을 켜 둔다(자동 꺼짐 뒤 첫 진동 지연 방지). 이미 켜져 있으면 아무것도 안 한다. 하드웨어가 없거나 실패면 false — 다음 호출에서 다시
  func warm() -> Bool {
    guard supported else { return false }
    do {
      _ = try ensureEngine()
      return true
    } catch {
      needsStart = true
      return false
    }
  }

  private func ensureEngine() throws -> CHHapticEngine {
    if let engine = engine {
      if needsStart {
        try engine.start()
        needsStart = false
      }
      return engine
    }
    let engine = try CHHapticEngine()
    engine.playsHapticsOnly = true
    engine.isAutoShutdownEnabled = true
    engine.stoppedHandler = { [weak self] reason in
      DispatchQueue.main.async {
        guard let self = self else { return }
        switch reason {
        case .engineDestroyed, .systemError:
          self.engine = nil  // 망가짐 → 다음 호출에서 새로 만든다
          self.needsStart = false
        default:
          self.needsStart = true  // idleTimeout·audioSessionInterrupt·applicationSuspended 등: 같은 엔진을 다음 호출에서 start()
        }
      }
    }
    engine.resetHandler = { [weak self] in
      DispatchQueue.main.async { self?.needsStart = true }  // 햅틱 서버가 다시 떴다 → 같은 엔진을 다시 start()
    }
    try engine.start()
    self.engine = engine
    needsStart = false
    return engine
  }

  private func tap(_ t: TimeInterval, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: t)
  }

  private func hum(_ t: TimeInterval, _ duration: TimeInterval, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: t,
      duration: duration)
  }

  private func events(for cue: String) -> [CHHapticEvent] {
    switch cue {
    case "press": return [tap(0, 0.45, 0.85)]
    case "full": return [tap(0, 1.0, 0.9), hum(0.012, 0.07, 0.55, 0.15), tap(0.09, 0.55, 0.5)]  // 코르크 '읍'
    case "strain": return [tap(0, 0.32, 0.15)]  // 심장 박동
    case "cough": return [hum(0, 0.11, 0.9, 0.35), hum(0.19, 0.13, 1.0, 0.3)]
    case "fireWeak": return [tap(0, 0.4, 0.4), hum(0.01, 0.12, 0.25, 0.1)]
    case "fire": return [tap(0, 0.85, 0.6), hum(0.01, 0.22, 0.5, 0.1)]
    case "fireStrong": return [tap(0, 1.0, 0.8), hum(0.01, 0.32, 0.8, 0.2), tap(0.2, 0.5, 0.3)]
    case "land": return [tap(0, 0.35, 0.6), tap(0.07, 0.25, 0.6)]
    // 게임 진동 기본 길(navigator.vibrate ms → 다리 'g:auto' → Dart game()): 약 ≤15 ms · 중 ≤32 ms · 강. UIKit 생성기 길이 기기에서 무시되는지 가르는 ④-d 도 이 신호
    case "tapLight": return [tap(0, 0.6, 0.5)]
    case "tapMedium": return [tap(0, 0.85, 0.6)]
    case "tapHeavy": return [tap(0, 1.0, 0.75), hum(0.005, 0.05, 0.6, 0.3)]
    default: return [tap(0, 0.5, 0.5)]
    }
  }
}

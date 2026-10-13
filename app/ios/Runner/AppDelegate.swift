import CoreHaptics
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private let richHaptics = PuffRichHaptics()
  private var hapticsChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // B 시제품: 'puff/haptics' 채널 → Core Haptics 패턴(lib/native/rich_haptics.dart). 없거나 실패하면 Dart 쪽이 HapticFeedback 로 대신한다
    let channel = FlutterMethodChannel(name: "puff/haptics", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    let haptics = richHaptics
    channel.setMethodCallHandler { call, result in
      haptics.handle(call, result: result)
    }
    hapticsChannel = channel
  }
}

/// 딱지 손끝 신호: 톡(transient)과 웅(continuous)을 시간차로 엮은 Core Haptics 패턴.
/// UIImpactFeedbackGenerator(= Flutter HapticFeedback)는 세기 3단계 톡 한 번뿐이라 '꽉(코르크 읍)'·'콜록'·'퍽+바람 꼬리'를 못 낸다.
final class PuffRichHaptics {
  private var engine: CHHapticEngine?
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
      self.engine = nil
      result(false)
    }
  }

  private func ensureEngine() throws -> CHHapticEngine {
    if let engine = engine { return engine }
    let engine = try CHHapticEngine()
    engine.playsHapticsOnly = true
    engine.isAutoShutdownEnabled = true
    engine.stoppedHandler = { [weak self] _ in self?.engine = nil }
    engine.resetHandler = { [weak self] in self?.engine = nil }
    try engine.start()
    self.engine = engine
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
    default: return [tap(0, 0.5, 0.5)]
    }
  }
}

import ActivityKit
import ExpoModulesCore

// ⚠️ Must stay byte-for-byte identical to the copy in
// targets/widget/Attributes.swift — ActivityKit matches the app's activity to
// the widget extension's UI by the type name and the Codable shape of
// ContentState.
struct AnchorSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// "focus" | "break"
    var phase: String
    var round: Int
    /// Wall-clock end of the current phase; drives the native countdown.
    var endDate: Date
    /// Paused (or finished) — render the frozen remainingSecs instead of ticking.
    var paused: Bool
    var remainingSecs: Int
  }

  var sessionName: String
  var isPomo: Bool
  var maxRounds: Int
}

struct LiveActivityContent: Record {
  @Field var phase: String = "focus"
  @Field var round: Int = 1
  @Field var endDateMs: Double = 0
  @Field var paused: Bool = false
  @Field var remainingSecs: Int = 0
}

struct LiveActivityStart: Record {
  @Field var sessionName: String = "Untitled"
  @Field var isPomo: Bool = false
  @Field var maxRounds: Int = 1
  @Field var phase: String = "focus"
  @Field var round: Int = 1
  @Field var endDateMs: Double = 0
  @Field var paused: Bool = false
  @Field var remainingSecs: Int = 0
}

public class AnchorLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnchorLiveActivity")

    AsyncFunction("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startActivity") { (opts: LiveActivityStart, promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(false)
        return
      }
      Task {
        // A killed process can leave a stale activity behind — clear them all
        // so the new session is the only one on the Lock Screen.
        for activity in Activity<AnchorSessionAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
          promise.resolve(false)
          return
        }
        let attributes = AnchorSessionAttributes(
          sessionName: opts.sessionName,
          isPomo: opts.isPomo,
          maxRounds: opts.maxRounds
        )
        let state = Self.contentState(
          phase: opts.phase, round: opts.round, endDateMs: opts.endDateMs,
          paused: opts.paused, remainingSecs: opts.remainingSecs
        )
        do {
          _ = try Activity.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: nil)
          )
          promise.resolve(true)
        } catch {
          promise.reject("ERR_LIVE_ACTIVITY_START", error.localizedDescription)
        }
      }
    }

    AsyncFunction("updateActivity") { (opts: LiveActivityContent, promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      Task {
        let state = Self.contentState(
          phase: opts.phase, round: opts.round, endDateMs: opts.endDateMs,
          paused: opts.paused, remainingSecs: opts.remainingSecs
        )
        for activity in Activity<AnchorSessionAttributes>.activities {
          await activity.update(ActivityContent(state: state, staleDate: nil))
        }
        promise.resolve(nil)
      }
    }

    AsyncFunction("endActivity") { (promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      Task {
        for activity in Activity<AnchorSessionAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        promise.resolve(nil)
      }
    }
  }

  @available(iOS 16.2, *)
  private static func contentState(
    phase: String, round: Int, endDateMs: Double, paused: Bool, remainingSecs: Int
  ) -> AnchorSessionAttributes.ContentState {
    AnchorSessionAttributes.ContentState(
      phase: phase,
      round: round,
      endDate: Date(timeIntervalSince1970: endDateMs / 1000),
      paused: paused,
      remainingSecs: remainingSecs
    )
  }
}

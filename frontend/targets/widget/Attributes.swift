import ActivityKit
import Foundation

// ⚠️ Must stay byte-for-byte identical to the copy in
// modules/anchor-live-activity/ios/AnchorLiveActivityModule.swift —
// ActivityKit matches the app's activity to this extension's UI by the
// type name and the Codable shape of ContentState.
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

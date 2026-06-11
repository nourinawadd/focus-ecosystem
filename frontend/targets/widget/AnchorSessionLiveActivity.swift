import ActivityKit
import SwiftUI
import WidgetKit

// Brand palette (mirrors frontend/constants/theme.ts)
private let anchorLime   = Color(red: 0xC6 / 255, green: 0xF1 / 255, blue: 0x35 / 255)
private let anchorAmber  = Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255)
private let anchorDarkBg = Color(red: 0x0E / 255, green: 0x0E / 255, blue: 0x0E / 255)
private let anchorMuted  = Color(red: 0x88 / 255, green: 0x88 / 255, blue: 0x88 / 255)

private extension AnchorSessionAttributes.ContentState {
  // The pause button is disabled at 0 remaining, so paused+0 can only mean the
  // timer ran out — the app sends that as paused with remainingSecs = 0.
  var isComplete: Bool { paused && remainingSecs <= 0 }
  var isBreak: Bool { phase == "break" }

  var accent: Color {
    if isComplete { return anchorLime }
    if paused { return anchorMuted }
    return isBreak ? anchorAmber : anchorLime
  }

  var label: String {
    if isComplete { return "Complete" }
    if paused { return "Paused" }
    return isBreak ? "Break" : "Focus"
  }

  var symbolName: String {
    if isComplete { return "checkmark.circle.fill" }
    if paused { return "pause.circle.fill" }
    return isBreak ? "cup.and.saucer.fill" : "timer"
  }

  /// Range for Text(timerInterval:)/ProgressView(timerInterval:) — must be
  /// valid even if the deadline already passed when the update lands.
  var timerRange: ClosedRange<Date> {
    let now = Date()
    return min(now, endDate)...max(endDate, now)
  }

  var frozenText: String {
    let secs = max(0, remainingSecs)
    return String(format: "%02d:%02d", secs / 60, secs % 60)
  }
}

/// Ticks natively via Text(timerInterval:) while running; frozen mm:ss while
/// paused or complete. No pushes or JS wakeups needed.
private struct CountdownText: View {
  let state: AnchorSessionAttributes.ContentState

  var body: some View {
    if state.paused {
      Text(state.frozenText)
    } else {
      Text(timerInterval: state.timerRange, countsDown: true, showsHours: false)
    }
  }
}

private struct PhaseBadge: View {
  let state: AnchorSessionAttributes.ContentState

  var body: some View {
    HStack(spacing: 5) {
      Circle()
        .fill(state.accent)
        .frame(width: 7, height: 7)
      Text(state.label)
        .font(.caption.weight(.semibold))
        .foregroundStyle(state.accent)
    }
  }
}

private struct RoundDots: View {
  let attributes: AnchorSessionAttributes
  let state: AnchorSessionAttributes.ContentState

  var body: some View {
    HStack(spacing: 5) {
      ForEach(0..<attributes.maxRounds, id: \.self) { i in
        Circle()
          .fill(
            i < state.round - 1 || state.isComplete
              ? anchorMuted
              : i == state.round - 1 ? state.accent : Color.white.opacity(0.18)
          )
          .frame(width: i == state.round - 1 && !state.isComplete ? 8 : 6,
                 height: i == state.round - 1 && !state.isComplete ? 8 : 6)
      }
      Text("Round \(state.round)/\(attributes.maxRounds)")
        .font(.caption2)
        .foregroundStyle(anchorMuted)
        .padding(.leading, 2)
    }
  }
}

// ─── Lock Screen / banner card ────────────────────────────────────────────────

private struct LockScreenCard: View {
  let context: ActivityViewContext<AnchorSessionAttributes>

  var body: some View {
    let state = context.state
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(context.attributes.sessionName)
            .font(.headline)
            .foregroundStyle(.white)
            .lineLimit(1)
          PhaseBadge(state: state)
        }
        Spacer()
        CountdownText(state: state)
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(.white)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 124)
      }

      if state.isComplete {
        Text("Great work — open Anchor to see your results.")
          .font(.caption)
          .foregroundStyle(anchorMuted)
      } else if context.attributes.isPomo {
        RoundDots(attributes: context.attributes, state: state)
      } else if !state.paused {
        ProgressView(timerInterval: state.timerRange, countsDown: false)
          .progressViewStyle(.linear)
          .tint(state.accent)
          .labelsHidden()
      }
    }
    .padding(16)
    .activityBackgroundTint(anchorDarkBg.opacity(0.92))
    .activitySystemActionForegroundColor(.white)
  }
}

// ─── Widget configuration ─────────────────────────────────────────────────────

struct AnchorSessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AnchorSessionAttributes.self) { context in
      LockScreenCard(context: context)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 4) {
            PhaseBadge(state: state)
            Text(context.attributes.sessionName)
              .font(.caption)
              .foregroundStyle(anchorMuted)
              .lineLimit(1)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          CountdownText(state: state)
            .font(.system(size: 28, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(.white)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 96)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if state.isComplete {
            Text("Session complete 🎯")
              .font(.caption)
              .foregroundStyle(anchorLime)
          } else if context.attributes.isPomo {
            RoundDots(attributes: context.attributes, state: state)
          } else if !state.paused {
            ProgressView(timerInterval: state.timerRange, countsDown: false)
              .progressViewStyle(.linear)
              .tint(state.accent)
              .labelsHidden()
          }
        }
      } compactLeading: {
        Image(systemName: state.symbolName)
          .foregroundStyle(state.accent)
      } compactTrailing: {
        CountdownText(state: state)
          .monospacedDigit()
          .foregroundStyle(state.accent)
          .frame(maxWidth: 46)
          .multilineTextAlignment(.trailing)
      } minimal: {
        Image(systemName: state.symbolName)
          .foregroundStyle(state.accent)
      }
      .keylineTint(anchorLime)
    }
  }
}

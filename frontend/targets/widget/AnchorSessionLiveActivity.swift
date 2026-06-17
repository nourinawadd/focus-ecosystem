import ActivityKit
import SwiftUI
import WidgetKit

// Brand palette (mirrors frontend/constants/theme.ts — Dust Grey retired)
private let anchorIndigo    = Color(red: 0x31 / 255, green: 0x38 / 255, blue: 0x52 / 255) // Twilight Indigo
private let anchorGraphite  = Color(red: 0x2F / 255, green: 0x2F / 255, blue: 0x2F / 255) // Graphite
private let anchorSlate     = Color(red: 0xC3 / 255, green: 0xCA / 255, blue: 0xD4 / 255) // Pale Slate
private let anchorPorcelain = Color(red: 0xF6 / 255, green: 0xF7 / 255, blue: 0xF1 / 255) // Porcelain

private extension AnchorSessionAttributes.ContentState {
  // The pause button is disabled at 0 remaining, so paused+0 can only mean the
  // timer ran out — the app sends that as paused with remainingSecs = 0.
  var isComplete: Bool { paused && remainingSecs <= 0 }
  var isBreak: Bool { phase == "break" }

  /// Brand accent for the phase. The palette is monochrome now, so phases are
  /// told apart by symbol + label; paused/complete just soften to slate.
  var accent: Color {
    if isComplete { return anchorIndigo }
    if paused { return anchorSlate }
    return anchorIndigo
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

/// Phase pill. `tint` is passed per-surface so it stays legible on both the
/// light Lock Screen card and the black Dynamic Island.
private struct PhaseBadge: View {
  let state: AnchorSessionAttributes.ContentState
  var tint: Color

  var body: some View {
    HStack(spacing: 5) {
      Circle()
        .fill(tint)
        .frame(width: 7, height: 7)
      Text(state.label)
        .font(.caption.weight(.semibold))
        .foregroundStyle(tint)
    }
  }
}

/// Pomodoro round dots. `tint` marks done/active rounds, `dim` is for upcoming
/// rounds and the caption — both supplied per-surface for contrast.
private struct RoundDots: View {
  let attributes: AnchorSessionAttributes
  let state: AnchorSessionAttributes.ContentState
  var tint: Color
  var dim: Color

  var body: some View {
    HStack(spacing: 5) {
      ForEach(0..<attributes.maxRounds, id: \.self) { i in
        let isActive = i == state.round - 1 && !state.isComplete
        Circle()
          .fill(
            i < state.round - 1 || state.isComplete
              ? tint
              : isActive ? tint : dim.opacity(0.4)
          )
          .frame(width: isActive ? 8 : 6, height: isActive ? 8 : 6)
      }
      Text("Round \(state.round)/\(attributes.maxRounds)")
        .font(.caption2)
        .foregroundStyle(dim)
        .padding(.leading, 2)
    }
  }
}

// ─── Lock Screen / banner card (light Porcelain, indigo time) ─────────────────

private struct LockScreenCard: View {
  let context: ActivityViewContext<AnchorSessionAttributes>

  var body: some View {
    let state = context.state
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(context.attributes.sessionName)
            .font(.headline)
            .foregroundStyle(anchorIndigo)
            .lineLimit(1)
          PhaseBadge(state: state, tint: anchorIndigo)
        }
        Spacer()
        CountdownText(state: state)
          .font(.system(size: 34, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(anchorIndigo)
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 124)
      }

      if state.isComplete {
        Text("Great work — open Anchor to see your results.")
          .font(.caption)
          .foregroundStyle(anchorGraphite)
      } else if context.attributes.isPomo {
        RoundDots(attributes: context.attributes, state: state, tint: anchorIndigo, dim: anchorGraphite)
      } else if !state.paused {
        ProgressView(timerInterval: state.timerRange, countsDown: false)
          .progressViewStyle(.linear)
          .tint(anchorIndigo)
          .labelsHidden()
      }
    }
    .padding(16)
    .activityBackgroundTint(anchorPorcelain)
    .activitySystemActionForegroundColor(anchorIndigo)
  }
}

// ─── Widget configuration ─────────────────────────────────────────────────────
// Note: the Dynamic Island is rendered on the device's black hardware pill and
// its background can't be themed — so its text uses Pale Slate (the light brand
// tint) for legibility, with an Indigo keyline for the brand glow.

struct AnchorSessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AnchorSessionAttributes.self) { context in
      LockScreenCard(context: context)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 4) {
            PhaseBadge(state: state, tint: anchorSlate)
            Text(context.attributes.sessionName)
              .font(.caption)
              .foregroundStyle(anchorSlate)
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
              .foregroundStyle(anchorSlate)
          } else if context.attributes.isPomo {
            RoundDots(attributes: context.attributes, state: state, tint: anchorSlate, dim: .white.opacity(0.6))
          } else if !state.paused {
            ProgressView(timerInterval: state.timerRange, countsDown: false)
              .progressViewStyle(.linear)
              .tint(anchorSlate)
              .labelsHidden()
          }
        }
      } compactLeading: {
        Image(systemName: state.symbolName)
          .foregroundStyle(anchorSlate)
      } compactTrailing: {
        CountdownText(state: state)
          .monospacedDigit()
          .foregroundStyle(anchorSlate)
          .frame(maxWidth: 46)
          .multilineTextAlignment(.trailing)
      } minimal: {
        Image(systemName: state.symbolName)
          .foregroundStyle(anchorSlate)
      }
      .keylineTint(anchorIndigo)
    }
  }
}

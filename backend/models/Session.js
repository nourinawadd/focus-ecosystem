import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  type: {
    type: String,
    enum: ["STUDY", "WORK", "CUSTOM"]
  },

  status: {
    type: String,
    enum: ["PENDING", "ACTIVE", "COMPLETED", "ABANDONED"],
    default: "PENDING"
  },

  nfcRequired: { type: Boolean, default: false },

  timerMode: {
    type: String,
    enum: ["COUNTDOWN", "POMODORO", "STOPWATCH"]
  },

  timerConfig: {
    plannedDuration: Number,
    pomodoroWork: Number,
    pomodoroBreak: Number,
    pomodoroRounds: Number
  },

  timerState: {
    actualDuration: Number,
    pomodoroRoundsCompleted: Number,
    breaks: Number,
    isPaused: Boolean,
    lastResumedAt: Date
  },

  blockedApps: [String],

  startedAt: Date,
  endedAt: Date
}, { timestamps: true });

export default mongoose.model("Session", sessionSchema);
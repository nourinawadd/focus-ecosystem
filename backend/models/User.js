import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: String,
  settings: {
    defaultSessionType: {
      type: String,
      enum: ["STUDY", "WORK", "CUSTOM"],
      default: "STUDY"
    },
    defaultTimerMode: {
      type: String,
      enum: ["COUNTDOWN", "POMODORO", "STOPWATCH"],
      default: "COUNTDOWN"
    },
    defaultDuration: { type: Number, default: 45 },
    pomodoroWork: { type: Number, default: 25 },
    pomodoroBreak: { type: Number, default: 5 }
  }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
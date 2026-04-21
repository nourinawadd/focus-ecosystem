import mongoose from "mongoose";

const statisticSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  date: { type: Date, required: true },

  totalFocusMinutes: Number,
  sessionsCompleted: Number,
  sessionsAbandoned: Number,

  currentStreak: Number,
  longestStreak: Number,

  mostProductiveHour: Number,
  topBlockedApp: String,

  dailyFocusScore: Number,
  weeklyFocusScore: Number
}, { timestamps: true });

statisticSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("Statistic", statisticSchema);
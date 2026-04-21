import mongoose from "mongoose";

const focusLogSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  event: {
    type: String,
    enum: [
      "SESSION_STARTED",
      "SESSION_ENDED",
      "APP_BLOCKED",
      "BREAK_STARTED",
      "BREAK_ENDED",
      "NFC_VERIFIED",
      "NFC_REJECTED"
    ]
  },

  timestamp: { type: Date, default: Date.now },

  metadata: {
    appName: String,
    packageName: String,
    reason: String
  }
});

focusLogSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("FocusLog", focusLogSchema);
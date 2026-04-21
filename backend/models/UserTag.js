import mongoose from "mongoose";

const userTagSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tagId: { type: mongoose.Schema.Types.ObjectId, ref: "NFCTag", required: true },
  label: String,
  registeredAt: { type: Date, default: Date.now }
});

export default mongoose.model("UserTag", userTagSchema);
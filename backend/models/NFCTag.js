import mongoose from "mongoose";

const nfctagSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }
}, { timestamps: true });

export default mongoose.model("NFCTag", nfctagSchema);
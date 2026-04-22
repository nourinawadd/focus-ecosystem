const mongoose = require('mongoose');
const NFCTagSchema = new mongoose.Schema({
  uid: {
    type:     String,
    required: true,
    unique:   true,   // a physical tag can only exist once globally
    uppercase: true,
    trim:      true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },  // schema only specifies createdAt
});

NFCTagSchema.index({ uid: 1 }, { unique: true });

module.exports = mongoose.model('NFCTag', NFCTagSchema);
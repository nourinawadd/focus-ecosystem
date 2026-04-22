const mongoose = require('mongoose');
const UserTagSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  tagId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'NFCTag',
    required: true,
  },
  label:        { type: String, default: 'My Tag', trim: true },
  registeredAt: { type: Date,   default: Date.now },
});
UserTagSchema.index({ userId: 1, tagId: 1 }, { unique: true });

module.exports = mongoose.model('UserTag', UserTagSchema);
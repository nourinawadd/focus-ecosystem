import mongoose from 'mongoose';
const EVENTS = [
  'SESSION_STARTED',
  'SESSION_ENDED',
  'APP_BLOCKED',      
  'BREAK_STARTED',
  'BREAK_ENDED',
  'NFC_VERIFIED',    
  'NFC_REJECTED',   
];

const FocusLogSchema = new mongoose.Schema({
  sessionId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Session',
    required: true,
    index:    true,
  },
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  event: {
    type:     String,
    enum:     EVENTS,
    required: true,
  },
  timestamp: { type: Date, default: Date.now },
  metadata: {
    appName:     { type: String, default: null },
    packageName: { type: String, default: null },
    reason:      { type: String, default: null },
  },
}, {
});

FocusLogSchema.index({ sessionId: 1, timestamp: 1 });
FocusLogSchema.index({ userId: 1, event: 1, timestamp: -1 });

export default mongoose.model('FocusLog', FocusLogSchema);
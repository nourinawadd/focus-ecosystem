import mongoose from 'mongoose';
import { toUserDate } from '../utils/datetime.js';

const TimerConfigSchema = new mongoose.Schema({
  plannedDuration:   { type: Number, required: true },  
  pomodoroWork:      { type: Number, default: 25  },    
  pomodoroBreak:     { type: Number, default: 5   },    
  pomodoroRounds:    { type: Number, default: 4   },
}, { _id: false });

const TimerStateSchema = new mongoose.Schema({
  actualDuration:          { type: Number, default: 0 },  
  pomodoroRoundsCompleted: { type: Number, default: 0 },
  breaks:                  { type: Number, default: 0 },
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  // categoryId references the user's custom category (stored in User.categories)
  categoryId: {
    type: String,
    required: true,
  },
  
  // Custom name given to this session by the user
  customName: {
    type: String,
    default: 'Untitled',
  },
  status: {
    type:    String,
    enum:    ['PENDING', 'ACTIVE', 'COMPLETED', 'ABANDONED'],
    default: 'PENDING',
  },
  timerMode: {
    type:    String,
    enum:    ['COUNTDOWN', 'POMODORO', 'STOPWATCH'],
    default: 'COUNTDOWN',
  },
  timerConfig: { type: TimerConfigSchema, required: true },
  timerState:  { type: TimerStateSchema,  default: () => ({}) },
  blockedApps: { type: [String], default: [] },
  focusScore: { type: Number, default: null, min: 0, max: 100 },
  dateStr: { type: String, required: true, index: true },
  startedAt: { type: Date, default: null },
  endedAt:   { type: Date, default: null },
}, {
  timestamps: true,  
});

SessionSchema.index({ userId: 1, dateStr: -1 });
SessionSchema.index({ userId: 1, status: 1, dateStr: 1 });

// `tz` is the user's IANA timezone (req.user.settings.timezone), so the
// displayed start/end times match the local clock the session was run on —
// the same zone used by the analytics "best hour" and date-range queries.
SessionSchema.statics.toFrontendRecord = function (doc, tz = 'UTC') {
  const start = doc.startedAt
    ? (() => { const p = toUserDate(doc.startedAt, tz); return `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`; })()
    : '';
  const end = doc.endedAt
    ? (() => { const p = toUserDate(doc.endedAt, tz); return `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`; })()
    : '';

  return {
    id:         doc._id.toString(),
    title:      doc.customName || 'Untitled',
    categoryId: doc.categoryId,
    duration:   doc.timerState?.actualDuration || doc.timerConfig?.plannedDuration || 0,
    startTime:  start,
    endTime:    end,
    focusScore: doc.focusScore,
    completed:  doc.status === 'COMPLETED',
    dateStr:    doc.dateStr,

    // Lifecycle fields — let the client detect a session orphaned by an app
    // kill (still ACTIVE, no end) and either finalize or resume it on launch.
    status:          doc.status,
    timerMode:       doc.timerMode,
    startedAtISO:    doc.startedAt ? doc.startedAt.toISOString() : null,
    plannedDuration: doc.timerConfig?.plannedDuration ?? null,
    pomodoroWork:    doc.timerConfig?.pomodoroWork    ?? null,
    pomodoroBreak:   doc.timerConfig?.pomodoroBreak   ?? null,
    blockedApps:     doc.blockedApps ?? [],
  };
};

export default mongoose.model('Session', SessionSchema);
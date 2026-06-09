import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs'; 

const NotifySchema = new mongoose.Schema({
  dailyNudge:      { type: Boolean, default: true },
  inSessionAlerts: { type: Boolean, default: true },
  dailySummary:    { type: Boolean, default: true },
  streakAlert:     { type: Boolean, default: true },
  goalNudge:       { type: Boolean, default: true },
  goalAchieved:    { type: Boolean, default: true },
}, { _id: false });

const SettingsSchema = new mongoose.Schema({
  defaultSessionType: {
    type:    String,
    enum:    ['STUDY', 'WORK', 'CUSTOM'],
    default: 'STUDY',
  },
  defaultTimerMode: {
    type:    String,
    enum:    ['COUNTDOWN', 'POMODORO', 'STOPWATCH'],
    default: 'COUNTDOWN',
  },
  defaultDuration: { type: Number, default: 45 },
  pomodoroWork:    { type: Number, default: 25 },
  pomodoroBreak:   { type: Number, default: 5  },
  dailyGoalMinutes:  { type: Number, default: 120 },
  weeklyGoalMinutes: { type: Number, default: 600 },

  notificationsEnabled: { type: Boolean, default: true },
  reminderHour:         { type: Number, default: 20 },
  notify:               { type: NotifySchema, default: () => ({}) },

  // IANA timezone (e.g. "Europe/Istanbul"). Drives all server-side
  // hour-of-day / "today" calculations. Defaults to UTC.
  timezone: { type: String, default: 'UTC' },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Optional: social-only accounts (Google/Apple) never set a password. A user
  // with no passwordHash simply cannot authenticate via /login (see guard below).
  passwordHash: { type: String },
  // Optional: Apple only returns a name on the first authorization and the user
  // may decline it, so a name is not guaranteed. Routes supply a fallback.
  name:         { type: String, trim: true },

  // Linked third-party identities. `sub` claim from a verified provider ID token.
  // Sparse + unique: at most one account per provider identity, but accounts
  // without the field (e.g. password-only users) don't collide on null.
  googleId:     { type: String, index: { unique: true, sparse: true } },
  appleId:      { type: String, index: { unique: true, sparse: true } },

  settings:     { type: SettingsSchema, default: () => ({}) },
  pushTokens:   { type: [String], default: [] },
  notifyState: {
    type: new mongoose.Schema({
      summaryDateStr: { type: String, default: '' },
      streakDateStr:  { type: String, default: '' },
      goalDateStr:    { type: String, default: '' },
    }, { _id: false }),
    default: () => ({}),
  },
}, {
  timestamps: true,
});

UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  // A social account may clear/lack a password; only hash a real value.
  if (!this.passwordHash) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

UserSchema.methods.comparePassword = function (candidate) {
  // Social-only users have no hash — never authenticate them via password.
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', UserSchema);
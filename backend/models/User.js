import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs'; 

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
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name:         { type: String, required: true, trim: true },
  settings:     { type: SettingsSchema, default: () => ({}) },
}, {
  timestamps: true,
});

UserSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', UserSchema);
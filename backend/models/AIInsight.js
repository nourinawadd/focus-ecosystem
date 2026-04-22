import mongoose from 'mongoose';

const AIInsightSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
  },

  bestProductiveHour: { type: Number, default: null, min: 0, max: 23 },
  optimalDuration:    { type: Number, default: null },
  suggestedSchedule:  [{
    dayOfWeek:       { type: Number, min: 0, max: 6 },
    recommendedTime: { type: String },
    duration:        { type: Number },
    confidence:      { type: Number, min: 0, max: 1 },
    _id: false,
  }],

  distractionRisk: {
    score:   { type: Number, min: 0, max: 100, default: 0 },
    level:   { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
    factors: { type: [String], default: [] },
    _id: false,
  },

  insightText: { type: String, default: null },

  modelVersion: { type: String,  default: '1.0' },
  trainingSize: { type: Number,  default: 0 },
  generatedAt:  { type: Date,    default: Date.now },
}, {
  timestamps: true,
});

export default mongoose.model('AIInsight', AIInsightSchema);
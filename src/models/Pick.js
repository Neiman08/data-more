import mongoose from 'mongoose';

const pickSchema = new mongoose.Schema({
  date: String,
  sport: String,
  event: String,
  homeTeam: String,
  awayTeam: String,
  market: String, // ML, RL, HIT, HR
  gamePk: String,
  fixtureId: String,

  playerName: String,
  team: String,

  pick: String,
  odds: Number,
  line: mongoose.Schema.Types.Mixed,
  stake: {
    type: Number,
    default: 1
  },

  result: {
    type: String,
    enum: ['pending', 'win', 'loss', 'push'],
    default: 'pending'
  },
  finalScore: String,
  profit: Number,
  source: String,

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

pickSchema.index({ date: 1, sport: 1 });
pickSchema.index({ date: 1, gamePk: 1, market: 1, pick: 1 });
pickSchema.index({ date: 1, fixtureId: 1, market: 1, pick: 1 });

export default mongoose.model('Pick', pickSchema);

import mongoose from 'mongoose';

const playerPropSchema = new mongoose.Schema({
  playerName: String,
  team: String,
  hitChance: Number,
  hrChance: Number,
  personId: String
}, { _id: false });

const GameAnalysisSchema = new mongoose.Schema({
  date: { type: String, required: true },
  gamePk: { type: String, required: true },
  lineupConfirmed: { type: Boolean, default: false },

  moneyline: Object,
  runLine: Object,
  teamTotals: Object,
  playerProps: [playerPropSchema],

  lockedAt: { type: Date, default: Date.now }
});

GameAnalysisSchema.index({ date: 1, gamePk: 1 }, { unique: true });

export default mongoose.model('GameAnalysis', GameAnalysisSchema);
import mongoose from 'mongoose';

const pickSchema = new mongoose.Schema({
  date: String,
  market: String, // ML, RL, HIT, HR
  gamePk: String,

  playerName: String,
  team: String,

  pick: String,

  result: {
    type: String,
    default: 'pending' // pending | win | loss
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Pick', pickSchema);
const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now
  },
  user: {
    type: String,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  sent: {
    type: Number,
    required: true
  },
  failed: {
    type: Number,
    required: true
  },
  delayMinutes: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('History', historySchema);

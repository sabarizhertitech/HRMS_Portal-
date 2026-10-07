const mongoose = require('mongoose');

const UserOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },

  otpHash: {   // ✅ store hashed OTP instead of plain text
    type: String,
    required: true
  },

  expiryTime: {
    type: Date,
    required: true
  },

  attempts: {   // ✅ brute-force protection
    type: Number,
    default: 0
  },

  lastSentAt: {  // ✅ rate limit support
    type: Date,
    default: Date.now
  },

  requestCount: {
  type: Number,
  default: 0
},

requestDate: {
  type: String
},
  createdAt: {
    type: Date,
    default: Date.now,
    // expires: 600  auto delete after 10 min
    expires: 86400
  }
});

module.exports = mongoose.model('UserOTP', UserOTPSchema);
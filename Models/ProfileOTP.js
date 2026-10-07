const mongoose = require("mongoose");

const profileOTPSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  otp: {
    type: String,
    required: true,
  },

  type: {
    type: String,
    enum: ["profile_update", "password_change"],
    default: "profile_update",
  },

  expiresAt: {
    type: Date,
    required: true,
  },

  attempts: {
    type: Number,
    default: 0,
  },

  // 🔹 OTP request counter (daily limit)
  requestCount: {
    type: Number,
    default: 0,
  },

  // 🔹 Date of request tracking
  requestDate: {
    type: String,
  },

  createdAt: {
    type: Date,
    default: Date.now,
    // expires :300 //for 5 min
    expires: 86400 // auto delete after 24 hours
  }

});

module.exports = mongoose.model("ProfileOTP", profileOTPSchema);
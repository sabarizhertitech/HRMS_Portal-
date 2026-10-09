const mongoose = require("mongoose");

const EmployeeSchema = new mongoose.Schema(
  {
    empId: {
      type: String,
      unique: true,
      sparse: true,
    },

    username: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    department: {
      type: String,
      required: true,
      trim: true,
    },

    designation: {
      type: String,
      required: true,
      trim: true,
    },

    dateJoined: {
      type: Date,
      required: true,
    },

    dateRelieved: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["full_time", "part_time", "relieved"],
      default: "full_time",
    },

    employmentStatus: {
      type: String,
      enum: ["active", "relieved"],
      default: "active",
    },

    probationPeriod: {
      type: String,
      enum: ["yes", "no"],
    },

    isProbation: {
      type: Boolean,
    },

    probationPeriodMonths: {
      type: Number,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "male",
    },

    photo: {
      type: String,
      default: "avatar.png"
    },

    role: {
      type: String,
      enum: ["admin", "employee"],
      required: true,
    },

    isHr: {
      type: Boolean,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    passwordHistory: {
      type: [String],
      default: [],
    },

    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },

    passwordExpiresAt: {
      type: Date,
    },

    isFirstLogin: {
      type: Boolean,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
    },

    workingStatus: {
      type: Boolean,
      default: true,
    },

    isProfileCompleted: {
      type: Boolean,
      default: false,
    },

    profileApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", null],
      default: null,
    },

    profileCompletedAt: {
      type: Date,
      default: null,
    },

    firstLoginAt: {
      type: Date,
      default: null,
    },

    lastProfileUpdateAt: {
      type: Date,
      default: null,
    },

    fcmTokens: {
      type: [String],
      default: []
    },

  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Employee || mongoose.model("Employee", EmployeeSchema);

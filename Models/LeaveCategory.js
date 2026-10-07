const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  probationOthersLeaveCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  permanentOthersLeaveCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  tiers: [
    {
      employeeType: {
        type: String,
        default: "All", // "Probationary Employee", "Permanent Employee", "All"
      },
      fromYear: {
        type: Number,
        default: 0,
      },
      fromMonth: {
        type: Number,
        default: 0,
      },
      toYear: {
        type: Number,
        default: 0,
      },
      toMonth: {
        type: Number,
        default: 0,
      },
      minDuration: {
        type: Number,
        default: 0,
      },
      maxDuration: {
        type: Number,
        default: null,
      },
      durationUnit: {
        type: String,
        enum: ["months", "years"],
        default: "months",
      },
      eligibleMonths: {
        type: Number,
        default: 0,
      },
      maxEligibleMonths: {
        type: Number,
        default: null,
      },
      leaveCount: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
    },
  ],
});

const LeaveCategorySchema = new mongoose.Schema(
  {
    financialYear: {
      type: String,
      required: true,
      unique: true, 
      trim: true,
    },
    categories: [CategorySchema],
    status: {
      type: String,
      enum: ["pending", "submitted", "approved", "rejected"],
      default: "pending",
    },
    isReviewed: {
      type: Boolean,
      default: false,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
    submittedDate: {
      type: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
    approvedDate: {
      type: Date,
    },
    adminRemarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LeaveCategory", LeaveCategorySchema);

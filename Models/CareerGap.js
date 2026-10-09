const mongoose = require("mongoose");

const careerGapSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    empIdString: {
      type: String,
      default: "",
    },
    educationStage: {
      type: String,
      default: "10th to 12th Standard",
      required: true,
    },
    passedOutYear10: {
      type: String,
      required: true,
    },
    expectedYear12: {
      type: String,
      required: true,
    },
    actualYear12: {
      type: String,
      required: true,
    },
    gapDuration: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CareerGap || mongoose.model("CareerGap", careerGapSchema);

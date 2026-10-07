const mongoose = require("mongoose");

const dailyWorkUpdateSchema = new mongoose.Schema(
  {
    category: {
      type: String,
    },
    project: {
      type: String,
    },
    workType: {
      type: String,
      trim: true,
      default: "",
    },
    title: {
      type: String, // phaseTitle
    },
    description: {
      type: String, // phaseDescription
      trim: true,
    },
    status: {
      type: String, // phaseStatus
      enum: ["pending", "inprocess", "hold", "completed"],
      default: "inprocess",
    },
    updateDate: {
      type: Date,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: false,
    },
  },
  {
    timestamps: true
  }
);

dailyWorkUpdateSchema.index({ userId: 1, updateDate: -1 });
dailyWorkUpdateSchema.index({ referenceId: 1 });
dailyWorkUpdateSchema.index({ category: 1, project: 1 });

module.exports = mongoose.model("DailyWorkUpdate", dailyWorkUpdateSchema);

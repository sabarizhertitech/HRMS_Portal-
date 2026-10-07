const mongoose = require("mongoose");

const standaloneWorkUpdateSchema = new mongoose.Schema(
  {
    taskTitle: {
      type: String,
      required: true,
      trim: true
    },

    project: {
      type: String,
      default: ""
    },
    category: {
      type: String,
      default: ""
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    phase: {
      type: String,
      default: "",
      trim: true,
    },
    phaseStatus: {
      type: String,
      enum: ["pending", "inprocess", "hold", "completed"],
      default: "inprocess",
    },
    note: {
      type: String,
    },
    updateDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StandaloneWorkUpdate", standaloneWorkUpdateSchema);

const mongoose = require("mongoose");

const changeItemSchema = new mongoose.Schema(
  {
    fieldName: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed, default: "" },
    to: { type: mongoose.Schema.Types.Mixed, default: "" },
  },
  { _id: false }
);

const logSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      index: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    changes: {
      type: [changeItemSchema],
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast audit querying
logSchema.index({ category: 1, createdAt: -1 });
logSchema.index({ referenceId: 1, createdAt: -1 });

module.exports = mongoose.model("Log", logSchema);



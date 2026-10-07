const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "on-hold"],
      default: "pending",
    },
    completedDate: {
      type: Date,
      default: null,
    },
    createdDate: {
      type: Date,
      default: Date.now,
    },
  },

);

todoSchema.index({ employeeId: 1, date: 1 });
todoSchema.index({ date: 1 });
todoSchema.index({ status: 1 });

module.exports = mongoose.model("Todo", todoSchema);
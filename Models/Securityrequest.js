// models/SecurityRequest.js
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["CREATED", "APPROVED", "REJECTED", "EDITED"],
      required: true,
    },
    by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    remark: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const securityRequestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    requestType: {
      type: String,
      enum: ["CODE", "GIT", "SERVER", "AWS", "MONGODB", "OTHER"],
      required: [true, "Request type is required"],
    },
    // Holds conditional fields: repo, branch, commitId, serverName, etc.
    requestData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    makerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Maker is required"],
    },
    checkerId: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    }],
    approvers: [{
      employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
      },
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
      },
      actionDate: {
        type: Date,
      },
      remark: {
        type: String,
        default: "",
      },
    }],
    ccId: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    }],
    ticketId: {
     type: String,
    required: true,
    unique: true,
    index: true,
    },
    status: {
      type: String,
      enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED"],
      default: "PENDING_APPROVAL",
    },
    logs: {
      type: [logSchema],
      default: [],
    },
    files: [
      {
        key: { type: String, required: true },
        originalName: { type: String, required: true },
      }
    ],
  },
  {
    timestamps: true,
  }
);

// ─── Index for auto-expiry job performance ────────────────────────────────
securityRequestSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model("SecurityRequest", securityRequestSchema);
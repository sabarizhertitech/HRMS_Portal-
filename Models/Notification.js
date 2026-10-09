const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "EDIT_REQUEST",
        "EDIT_APPROVED",
        "EDIT_REJECTED",

        "PROFILE_UPDATED",
        "PROFILE_COMPLETION_REQUEST",
        "PROFILE_APPROVED",
        "PROFILE_REJECTED",

        "SECURITY_REQUEST",
        "SECURITY_APPROVED",
        "SECURITY_REJECTED",

        "LEAVE_REQUEST",
        "LEAVE_APPROVED",
        "LEAVE_REJECTED",

        "WFH_REQUEST",
        "WFH_APPROVED",
        "WFH_REJECTED",

        "PERMISSION_REQUEST",
        "PERMISSION_APPROVED",
        "PERMISSION_REJECTED",
        "PERMISSION_INFORMED",
        "SYSTEM_REMINDER",
        "HR_APPROVAL_REQUEST",
        "HR_APPROVAL_APPROVED",
        "HR_APPROVAL_REJECTED",
        "TASK_DUE",
        "INSTAGRAM_MESSAGE",
        "INSTAGRAM_COMMENT"
      ],
      required: true
    },

    fromEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee"
    },
    toEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee"
    },
    toAdmin: {
      type: Boolean,
      default: false
    },
    fromAdmin: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    metadata: {
      empIdString: String,
      empName: String,
      department: String,
      designation: String,
      approvedBy: String,
      rejectedBy: String,
      reason: String,
      rejectionRemark: String,
      rejectedFields: [String],
      approvedUntil: Date,
      ticketId: String,
      requestType: String,
      targetModule: String,
      url: String
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: Date
  },
  { timestamps: true }
);

// Auto-delete notifications after 7 days (604800 seconds).
// MongoDB TTL index runs a background job every ~60 seconds to remove expired documents.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model("Notification", notificationSchema);
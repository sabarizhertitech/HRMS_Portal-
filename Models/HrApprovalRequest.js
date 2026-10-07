const mongoose = require("mongoose");

const HrApprovalRequestSchema = new mongoose.Schema(
  {
    hrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    hrName: {
      type: String,
      required: true,
    },
    actionType: {
      type: String,
      enum: [
        "ADD_HOLIDAY",
        "EDIT_HOLIDAY",
        "DELETE_HOLIDAY",
        "CREATE_LEAVE_CATEGORY",
        "UPDATE_LEAVE_CATEGORY",
        "DELETE_LEAVE_CATEGORY",
        "GENERATE_SALARY_SLIP",
        "EDIT_EMPLOYEE",
        "UPDATE_SALARY",
        "UPDATE_BANK",
        "DELETE_EMPLOYEE",
        "DELETE_DOCUMENT",
      ],
      required: true,
    },
    targetModule: {
      type: String,
      enum: ["HOLIDAY", "LEAVE_CATEGORY", "SALARY_SLIP", "EMPLOYEE"],
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    adminNote: {
      type: String,
      default: "",
    },
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
    actionAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HrApprovalRequest", HrApprovalRequestSchema);

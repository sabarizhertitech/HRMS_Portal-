const mongoose = require("mongoose");

const LeaveRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    employeeName: {
      type: String,
      required: true,
    },

    designation: {
      type: String,
      default: "",
    },

    requestType: {
      type: String,
      enum: ["leave", "wfh"],
      required: true,
    },

    leaveType: {
      type: String,
      default: null,
    },

    otherLeaveType: String,

    dayType: {
      type: String,
      enum: [
        "Half Day",
        "1 Day",
        "2 Days",
        "More than 3 Days",
      ],
      required: true,
    },

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    startTime: String,
    endTime: String,

    noOfDays: {
      type: Number,
      required: true,
    },

    reasonType: {
      type: String,
      required: true,
    },

    otherReason: String,

    detailedReason: String,

    remark: {
      type: String,
      default: "",
    },

    leaveDates: [
      {
        type: String,
      },
    ],

    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Cancelled",
      ],
      default: "Pending",
    },
    
    isNotified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

LeaveRequestSchema.index({
  employeeId: 1,
  status: 1,
});

LeaveRequestSchema.index({
  fromDate: 1,
  toDate: 1,
});

LeaveRequestSchema.index({
  status: 1,
});

module.exports = mongoose.model(
  "LeaveRequest",
  LeaveRequestSchema
);
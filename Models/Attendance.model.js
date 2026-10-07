const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },

    date: {
      type: String,
      required: true,
      index: true,
    },

    checkInTime: Date,
    checkOutTime: Date,

    // Session 1
    checkIn1: Date,
    checkOut1: Date,

    // Session 2
    checkIn2: Date,
    checkOut2: Date,

    lateEntryReason: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    status: {
      type: String,
      default: "Absent",
    },

    leaveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveRequest",
    },

    remarks: String,

    autoCheckout: Boolean,

    checkInIPAddress: {
      type: String,
    },

    checkInIPReason: {
      type: String,
      trim: true,
    },

    checkOutIPAddress: {
      type: String,
    },

    checkOutIPReason: {
      type: String,
      trim: true,
    },
  },

);

AttendanceSchema.index({
  employeeId: 1,
  date: 1,
});

module.exports = mongoose.model(
  "Attendance",
  AttendanceSchema
);
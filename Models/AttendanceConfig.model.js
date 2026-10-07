const mongoose = require("mongoose");

const attendanceConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "DEFAULT_CONFIG",
      unique: true,
    },
    dailyReportTime: {
      type: String,
      default: "20:01", // 24-hour format "HH:mm" (e.g. "20:01" is 08:01 PM)
    },
    isDailyReportEnabled: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendanceConfig", attendanceConfigSchema);

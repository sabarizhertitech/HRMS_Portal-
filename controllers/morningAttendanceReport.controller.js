const { generateMorningAttendanceReport } = require("../Services/morningAttendanceReport.service");
const apiLogger = require("../utils/apiLogger");

/**
 * Controller to fetch the read-only morning attendance report snapshot.
 */
const morningAttendanceReportController = {
  async getMorningAttendanceReport(req, res) {
    try {
      const { date } = req.query;

      const report = await generateMorningAttendanceReport({ date });

      return res.status(200).json(report);
    } catch (err) {
      console.error("❌ getMorningAttendanceReport error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to generate morning attendance report",
        error: err.message,
      });
    }
  },
};

module.exports = apiLogger(
  morningAttendanceReportController,
  "morningAttendanceReport.controller.js"
);

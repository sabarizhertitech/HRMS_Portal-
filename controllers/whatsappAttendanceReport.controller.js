const { generateMorningAttendanceReport } = require("../Services/morningAttendanceReport.service");
const { buildMorningAttendanceMessage } = require("../Services/morningAttendanceMessage.service");
const sendWhatsAppMessage = require("../Whatsapp/utils/sendWhatsApp");
const apiLogger = require("../utils/apiLogger");

/**
 * Controller to send the morning attendance report via WhatsApp.
 */
const whatsappAttendanceReportController = {
  async sendMorningAttendanceReport(req, res) {
    try {
      const { date, recipients, phone } = req.body || {};

      // 1. Generate Report
      const report = await generateMorningAttendanceReport({ date });

      // 2. Build Message
      const messageData = buildMorningAttendanceMessage(report);

      // Determine recipient list
      let recipientList = [];
      if (Array.isArray(recipients) && recipients.length > 0) {
        recipientList = recipients;
      } else if (phone) {
        recipientList = [phone];
      } else if (process.env.ADMIN_WHATSAPP_PHONE || process.env.WHATSAPP_REPORT_RECIPIENTS) {
        const envRecipients = (process.env.ADMIN_WHATSAPP_PHONE || process.env.WHATSAPP_REPORT_RECIPIENTS)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        recipientList = envRecipients;
      }

      if (recipientList.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No recipient phone number provided or configured.",
        });
      }

      const sendResults = [];
      for (const targetPhone of recipientList) {
        try {
          const result = await sendWhatsAppMessage(targetPhone, messageData.formattedDetails);
          sendResults.push({ phone: targetPhone, success: true, result });
        } catch (error) {
          sendResults.push({
            phone: targetPhone,
            success: false,
            error: error.response?.data || error.message,
          });
        }
      }

      const successCount = sendResults.filter((r) => r.success).length;

      return res.status(200).json({
        success: successCount > 0,
        message: `Morning attendance report sent to ${successCount}/${recipientList.length} recipient(s).`,
        report,
        messageData,
        sendResults,
      });
    } catch (err) {
      console.error("❌ sendMorningAttendanceReport error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to send morning attendance report",
        error: err.message,
      });
    }
  },
};

module.exports = apiLogger(
  whatsappAttendanceReportController,
  "whatsappAttendanceReport.controller.js"
);

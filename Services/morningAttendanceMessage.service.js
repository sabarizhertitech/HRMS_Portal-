const moment = require("moment-timezone");

/**
 * Builds formatted text and template parameters from the morning attendance report.
 * 
 * @param {Object} report - Output from generateMorningAttendanceReport()
 * @returns {Object} Formatted message payload for WhatsApp
 */
function buildMorningAttendanceMessage(report) {
  if (!report || !report.summary) {
    throw new Error("Invalid attendance report provided to message builder");
  }

  const { summary, employees, date, generatedAt } = report;

  const formattedDate = moment.tz(date, "YYYY-MM-DD", "Asia/Kolkata").format("DD MMM YYYY");
  const formattedTime = moment(generatedAt).tz("Asia/Kolkata").format("hh:mm A");

  // Helper to format employee list
  const formatEmpList = (list, extraFn = null) => {
    if (!list || list.length === 0) return "None";
    return list
      .map((e) => {
        const extra = extraFn ? extraFn(e) : "";
        return `• ${e.name} (${e.empId})${extra}`;
      })
      .join("\n");
  };

  const presentListText = formatEmpList(employees?.present);
  const lateListText = formatEmpList(employees?.late, (e) => {
    const reason = e.lateEntryReason ? ` - Reason: ${e.lateEntryReason}` : "";
    return reason;
  });
  const permissionListText = formatEmpList(employees?.morningPermission, (e) => {
    return e.reason ? ` - ${e.reason}` : "";
  });
  const fullDayLeaveListText = formatEmpList(employees?.fullDayLeave, (e) => {
    return ` - ${e.leaveType || "Leave"}${e.reason ? `: ${e.reason}` : ""}`;
  });
  const halfDayLeaveListText = formatEmpList(employees?.halfDayLeave, (e) => {
    return ` - Half Day${e.reason ? `: ${e.reason}` : ""}`;
  });
  const notCheckedInListText = formatEmpList(employees?.notCheckedIn);

  // Formatted details summary block
  const formattedDetails = [
    `📊 *MORNING ATTENDANCE REPORT*`,
    `📅 *Date:* ${formattedDate} | ⏰ *Time:* ${formattedTime}`,
    ``,
    `👥 *Total Employees:* ${summary.totalEmployees}`,
    `✅ *Present:* ${summary.present}`,
    `⏰ *Late:* ${summary.late}`,
    `🕒 *Morning Permission:* ${summary.morningPermission}`,
    `🏖 *Full-Day Leave:* ${summary.fullDayLeave}`,
    `🌓 *Half-Day Leave:* ${summary.halfDayLeave}`,
    `❌ *Not Checked In:* ${summary.notCheckedIn}`,
    ``,
    summary.late > 0 ? `*Late Employees:*\n${lateListText}\n` : "",
    summary.morningPermission > 0 ? `*Morning Permissions:*\n${permissionListText}\n` : "",
    summary.fullDayLeave > 0 || summary.halfDayLeave > 0
      ? `*Leaves:*\n${summary.fullDayLeave > 0 ? fullDayLeaveListText : ""}\n${summary.halfDayLeave > 0 ? halfDayLeaveListText : ""}\n`
      : "",
    summary.notCheckedIn > 0 ? `*Not Checked In:*\n${notCheckedInListText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const formatEmpSummary = (list) => {
    if (!list || list.length === 0) return "None";
    return list.map((e) => `${e.name} (${e.empId})`).join(", ");
  };

  const detailsParts = [
    `Total: ${summary.totalEmployees}`,
    `Present: ${summary.present}`,
    `Late: ${summary.late}`,
    `Permission: ${summary.morningPermission}`,
    `Full Leave: ${summary.fullDayLeave}`,
    `Half Leave: ${summary.halfDayLeave}`,
    `Not Checked In: ${summary.notCheckedIn}`,
  ];

  if (summary.late > 0) {
    detailsParts.push(`Late: [${formatEmpSummary(employees?.late)}]`);
  }
  if (summary.morningPermission > 0) {
    detailsParts.push(`Permission: [${formatEmpSummary(employees?.morningPermission)}]`);
  }
  if (summary.fullDayLeave > 0 || summary.halfDayLeave > 0) {
    const leaveNames = [...(employees?.fullDayLeave || []), ...(employees?.halfDayLeave || [])];
    detailsParts.push(`Leaves: [${formatEmpSummary(leaveNames)}]`);
  }
  if (summary.notCheckedIn > 0) {
    detailsParts.push(`Not Checked In: [${formatEmpSummary(employees?.notCheckedIn)}]`);
  }

  // Single-line string with zero newlines to comply with Meta WhatsApp Cloud API rules
  const singleLineDetails = detailsParts
    .join(" | ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Template body parameters for Meta WhatsApp Cloud API
  const templateParameters = [
    {
      type: "text",
      text: String(formattedDate),
    },
    {
      type: "text",
      text: String(formattedTime),
    },
    {
      type: "text",
      text: String(singleLineDetails),
    },
  ];

  return {
    date: formattedDate,
    rawDate: date,
    reportTime: formattedTime,
    summary,
    formattedDetails,
    templateParameters,
    employeeBreakdowns: {
      presentList: presentListText,
      lateList: lateListText,
      permissionList: permissionListText,
      fullDayLeaveList: fullDayLeaveListText,
      halfDayLeaveList: halfDayLeaveListText,
      notCheckedInList: notCheckedInListText,
    },
  };
}

module.exports = {
  buildMorningAttendanceMessage,
};

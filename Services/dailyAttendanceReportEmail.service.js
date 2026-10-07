const moment = require("moment-timezone");
const Employee = require("../Models/Employee");
const Attendance = require("../Models/Attendance.model");
const LeaveRequest = require("../Models/LeaveRequest");
const PermissionRequest = require("../Models/PermissionRequest");
const transporter = require("../utilities/emailTransporter");

/**
 * Format minutes into hours and minutes string (e.g. 7h 45m)
 */
const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

/**
 * Generates and sends the daily 5:40 PM attendance report to administrators.
 * 
 * @param {Object} [options]
 * @param {string} [options.date] - Optional date 'YYYY-MM-DD' (defaults to today in IST)
 * @returns {Promise<Object>} Status of the email dispatch
 */
async function sendDailyAttendanceReportEmail({ date } = {}) {
  try {
    const targetMoment = date
      ? moment.tz(date, "YYYY-MM-DD", "Asia/Kolkata")
      : moment().tz("Asia/Kolkata");

    const dateStr = targetMoment.format("YYYY-MM-DD");
    const displayDate = targetMoment.format("DD MMM YYYY (dddd)");
    const currentTimeStr = moment().tz("Asia/Kolkata").format("hh:mm A");
    const startOfDay = targetMoment.clone().startOf("day").toDate();
    const endOfDay = targetMoment.clone().endOf("day").toDate();
    const nowIst = moment().tz("Asia/Kolkata").toDate();

    // 1. Fetch active employees (excluding admins)
    const employees = await Employee.find({
      employmentStatus: "active",
      role: { $ne: "admin" },
      workingStatus: { $ne: false },
      isDeleted: { $ne: true },
    })
      .select("_id empId name department dateJoined createdAt")
      .sort({ empId: 1, name: 1 })
      .lean();

    // Filter employees who joined on or before target date
    const relevantEmployees = employees.filter((emp) => {
      const joining = emp.dateJoined || emp.createdAt;
      if (!joining) return true;
      const joiningMoment = moment(joining).tz("Asia/Kolkata").startOf("day");
      return joiningMoment.isSameOrBefore(targetMoment, "day");
    });

    if (relevantEmployees.length === 0) {
      console.log(`[DailyAttendanceReport] No relevant employees found for ${dateStr}.`);
      return { success: false, message: "No active employees found" };
    }

    const employeeIds = relevantEmployees.map((e) => e._id);

    // 2. Fetch Attendance, Leaves, and Permissions in parallel
    const [attendances, leaveRequests, permissions] = await Promise.all([
      Attendance.find({
        employeeId: { $in: employeeIds },
        date: dateStr,
      }).lean(),

      LeaveRequest.find({
        employeeId: { $in: employeeIds },
        status: "Approved",
        requestType: { $ne: "wfh" },
        $or: [
          { leaveDates: dateStr },
          { fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay } },
        ],
      }).lean(),

      PermissionRequest.find({
        employeeId: { $in: employeeIds },
        status: { $in: ["INFORMED", "APPROVED"] },
        from: { $gte: startOfDay, $lte: endOfDay },
      }).lean(),
    ]);

    // Build Maps for fast lookup
    const attendanceMap = new Map();
    attendances.forEach((att) => {
      if (att.employeeId) attendanceMap.set(att.employeeId.toString(), att);
    });

    const leaveMap = new Map();
    leaveRequests.forEach((l) => {
      const eid = l.employeeId?.toString();
      if (!eid) return;

      let coversDate = false;
      if (Array.isArray(l.leaveDates) && l.leaveDates.length > 0) {
        coversDate = l.leaveDates.includes(dateStr);
      } else {
        const from = moment(l.fromDate).tz("Asia/Kolkata").startOf("day");
        const to = moment(l.toDate || l.fromDate).tz("Asia/Kolkata").startOf("day");
        coversDate = targetMoment.isSameOrAfter(from, "day") && targetMoment.isSameOrBefore(to, "day");
      }

      if (coversDate) {
        leaveMap.set(eid, l);
      }
    });

    const permissionMap = new Map();
    permissions.forEach((p) => {
      const eid = p.employeeId?.toString();
      if (!eid) return;
      if (!permissionMap.has(eid)) permissionMap.set(eid, []);
      permissionMap.get(eid).push(p);
    });

    // 3. Process Each Employee Data
    const reportList = [];
    let presentCount = 0;
    let lateCount = 0;
    let permissionCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    for (const emp of relevantEmployees) {
      const eid = emp._id.toString();
      const att = attendanceMap.get(eid);
      const leave = leaveMap.get(eid);
      const empPerms = permissionMap.get(eid) || [];

      // Check-in & Check-out extraction
      const rawCheckIn = att?.checkIn1 || att?.checkInTime || null;
      const rawCheckOut = att?.checkOut2 || att?.checkOut1 || att?.checkOutTime || null;

      const hasCheckIn = Boolean(rawCheckIn);
      const hasCheckOut = Boolean(rawCheckOut);

      const checkInStr = hasCheckIn
        ? moment(rawCheckIn).tz("Asia/Kolkata").format("hh:mm A")
        : "-";
      const checkOutStr = hasCheckOut
        ? moment(rawCheckOut).tz("Asia/Kolkata").format("hh:mm A")
        : hasCheckIn
        ? "In Office (Not Checked Out)"
        : "-";

      // Working duration calculation
      let workingMinutes = 0;
      let isWorkingActive = false;

      if (hasCheckIn && hasCheckOut) {
        if (att.checkIn1 && att.checkOut1 && att.checkIn2 && att.checkOut2) {
          const s1 = Math.max(0, new Date(att.checkOut1) - new Date(att.checkIn1));
          const s2 = Math.max(0, new Date(att.checkOut2) - new Date(att.checkIn2));
          workingMinutes = Math.floor((s1 + s2) / 60000);
        } else {
          workingMinutes = Math.floor(Math.max(0, new Date(rawCheckOut) - new Date(rawCheckIn)) / 60000);
        }
      } else if (hasCheckIn && !hasCheckOut) {
        // Still checked in: calculate elapsed time up to current time
        const elapsedMs = Math.max(0, nowIst - new Date(rawCheckIn));
        workingMinutes = Math.floor(elapsedMs / 60000);
        isWorkingActive = true;
      }

      let workingHoursStr = "-";
      if (hasCheckIn) {
        workingHoursStr = formatDuration(workingMinutes) + (isWorkingActive ? " (Active)" : "");
      }

      // Determine Status & Remarks
      let status = "Absent";
      let statusType = "absent"; // present | late | permission | leave | absent
      let remarks = "";

      const isFullDayLeave = Boolean(
        leave && leave.dayType !== "Half Day" && leave.noOfDays !== 0.5
      );
      const isHalfDayLeave = Boolean(
        leave && (leave.dayType === "Half Day" || leave.noOfDays === 0.5)
      );

      // Check for morning or any approved permission
      const hasPermission = empPerms.length > 0;
      const permDetails = hasPermission
        ? empPerms.map((p) => {
            const fStr = moment(p.from).tz("Asia/Kolkata").format("hh:mm A");
            const tStr = moment(p.to).tz("Asia/Kolkata").format("hh:mm A");
            return `${p.permissionType || "Permission"} (${fStr} - ${tStr})${p.reason ? ": " + p.reason : ""}`;
          }).join("; ")
        : "";

      if (isFullDayLeave) {
        status = `Leave (${leave.leaveType || "Full Day"})`;
        statusType = "leave";
        remarks = leave.detailedReason || leave.reasonType || leave.otherReason || "Full Day Leave";
        leaveCount++;
      } else if (isHalfDayLeave && !hasCheckIn) {
        status = `Half Day Leave`;
        statusType = "leave";
        remarks = `Half Day (${leave.startTime || ""} - ${leave.endTime || ""}) ${leave.reasonType || ""}`;
        leaveCount++;
      } else if (hasCheckIn) {
        // Checked in
        const checkInMoment = moment(rawCheckIn).tz("Asia/Kolkata");
        const isLate =
          !hasPermission &&
          (checkInMoment.hour() > 10 ||
            (checkInMoment.hour() === 10 && checkInMoment.minute() > 0) ||
            (att.remarks || "").toLowerCase().includes("late") ||
            Boolean(att.lateEntryReason));

        if (hasPermission) {
          status = "Present (Permission)";
          statusType = "permission";
          remarks = permDetails;
          permissionCount++;
        } else if (isLate) {
          status = "Late Entry";
          statusType = "late";
          remarks = att.lateEntryReason || att.remarks || "Checked in after 10:00 AM";
          lateCount++;
        } else if (isHalfDayLeave) {
          status = "Present (Half Day Leave)";
          statusType = "present";
          remarks = `Half Day Leave: ${leave.reasonType || ""}`;
          presentCount++;
        } else {
          status = "Present";
          statusType = "present";
          remarks = att.remarks || "On time";
          presentCount++;
        }
      } else if (hasPermission) {
        status = "Permission (Not Checked In)";
        statusType = "permission";
        remarks = permDetails;
        permissionCount++;
      } else {
        status = "Absent";
        statusType = "absent";
        remarks = "No check-in recorded";
        absentCount++;
      }

      reportList.push({
        empId: emp.empId || "-",
        name: emp.name,
        department: emp.department || "-",
        checkIn: checkInStr,
        checkOut: checkOutStr,
        workingHours: workingHoursStr,
        status,
        statusType,
        remarks,
      });
    }

    // 4. Fetch Admin Emails
    const admins = await Employee.find({
      role: "admin",
      employmentStatus: "active",
      status: { $ne: "relieved" },
      isDeleted: { $ne: true },
    })
      .select("email")
      .lean();

    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    const recipientEmails =
      adminEmails.length > 0
        ? adminEmails
        : [process.env.ADMIN_EMAIL || process.env.EMAIL_USER].filter(Boolean);

    if (recipientEmails.length === 0) {
      console.warn("[DailyAttendanceReport] No admin recipient emails found.");
      return { success: false, message: "No admin email configured" };
    }

    // 5. Generate Styled HTML Email Content
    const statusBadges = {
      present: "background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;",
      late: "background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a;",
      permission: "background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;",
      leave: "background-color: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff;",
      absent: "background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;",
    };

    const tableRows = reportList
      .map((item, index) => {
        const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
        const badgeStyle = statusBadges[item.statusType] || statusBadges.absent;

        return `
          <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 10px; font-size: 13px; font-weight: 600; color: #1e293b; text-align: center; white-space: nowrap;">${item.empId}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 500; min-width: 140px;">
              <div style="font-weight: 600; color: #0f172a;">${item.name}</div>
              <div style="font-size: 11px; color: #64748b; line-height: 1.3; margin-top: 2px;">${item.department}</div>
            </td>
            <td style="padding: 10px 10px; font-size: 12px; text-align: center; white-space: nowrap;">
              <span style="display: inline-block; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; ${badgeStyle}">
                ${item.status}
              </span>
            </td>
            <td style="padding: 10px 10px; font-size: 13px; color: #334155; text-align: center; font-weight: 500; white-space: nowrap;">${item.checkIn}</td>
            <td style="padding: 10px 10px; font-size: 13px; color: #334155; text-align: center; font-weight: 500; white-space: nowrap;">${item.checkOut}</td>
            <td style="padding: 10px 10px; font-size: 13px; color: #0f172a; text-align: center; font-weight: 600; white-space: nowrap;">${item.workingHours}</td>
            <td style="padding: 10px 12px; font-size: 12px; color: #475569; min-width: 130px; line-height: 1.4;">${item.remarks || "-"}</td>
          </tr>
        `;
      })
      .join("");

    const totalCount = relevantEmployees.length;

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <title>Daily Attendance Report</title>
        <style type="text/css">
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; }
          @media only screen and (max-width: 680px) {
            .email-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              border-radius: 0 !important;
              border-left: none !important;
              border-right: none !important;
            }
            .header-container {
              padding: 20px 16px !important;
            }
            .content-section {
              padding: 16px 12px !important;
            }
            .metrics-grid-td {
              display: block !important;
              width: 100% !important;
              padding: 0 !important;
            }
            .metric-box {
              width: 47% !important;
              margin: 4px 1.5% !important;
              display: inline-block !important;
              box-sizing: border-box !important;
              vertical-align: top !important;
            }
            .table-responsive-wrapper {
              width: 100% !important;
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              display: block !important;
            }
            .responsive-table {
              min-width: 640px !important;
              width: 100% !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <div class="email-container" style="max-width: 900px; margin: 25px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <div class="header-container" style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 25px 30px; color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td>
                  <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Daily Attendance Summary Report</h1>
                  <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Date: <strong>${displayDate}</strong></p>
                </td>
                <td style="text-align: right; vertical-align: middle;">
                  <span style="background-color: rgba(255,255,255,0.2); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">
                    HR Portal Report
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Summary Metric Cards -->
          <div class="content-section" style="padding: 20px 30px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <table class="metrics-table" style="width: 100%; border-collapse: separate; border-spacing: 8px 0;">
              <tr>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total</div>
                  <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">${totalCount}</div>
                </td>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #bbf7d0; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #15803d; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Present</div>
                  <div style="font-size: 20px; font-weight: 700; color: #16a34a; margin-top: 4px;">${presentCount}</div>
                </td>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #fde68a; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #b45309; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Late</div>
                  <div style="font-size: 20px; font-weight: 700; color: #d97706; margin-top: 4px;">${lateCount}</div>
                </td>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #bae6fd; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #0369a1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Permission</div>
                  <div style="font-size: 20px; font-weight: 700; color: #0284c7; margin-top: 4px;">${permissionCount}</div>
                </td>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #e9d5ff; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #7e22ce; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Leave</div>
                  <div style="font-size: 20px; font-weight: 700; color: #9333ea; margin-top: 4px;">${leaveCount}</div>
                </td>
                <td class="metric-box" style="background: #ffffff; padding: 12px 10px; border-radius: 8px; border: 1px solid #fecaca; text-align: center; width: 16.6%;">
                  <div style="font-size: 11px; color: #b91c1c; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Absent</div>
                  <div style="font-size: 20px; font-weight: 700; color: #dc2626; margin-top: 4px;">${absentCount}</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Employee Attendance Table -->
          <div class="content-section" style="padding: 24px 30px;">
            <h3 style="margin: 0 0 14px 0; font-size: 15px; color: #334155; font-weight: 600;">Employee Breakdown</h3>
            <div class="table-responsive-wrapper" style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; -webkit-overflow-scrolling: touch;">
              <table class="responsive-table" style="width: 100%; min-width: 640px; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 10px 10px; font-size: 12px; color: #475569; font-weight: 700; text-align: center; white-space: nowrap;">Emp ID</th>
                    <th style="padding: 10px 12px; font-size: 12px; color: #475569; font-weight: 700;">Employee</th>
                    <th style="padding: 10px 10px; font-size: 12px; color: #475569; font-weight: 700; text-align: center; white-space: nowrap;">Status</th>
                    <th style="padding: 10px 10px; font-size: 12px; color: #475569; font-weight: 700; text-align: center; white-space: nowrap;">Check In</th>
                    <th style="padding: 10px 10px; font-size: 12px; color: #475569; font-weight: 700; text-align: center; white-space: nowrap;">Check Out</th>
                    <th style="padding: 10px 10px; font-size: 12px; color: #475569; font-weight: 700; text-align: center; white-space: nowrap;">Working Hours</th>
                    <th style="padding: 10px 12px; font-size: 12px; color: #475569; font-weight: 700;">Remarks / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
            <p style="margin: 0;">This is an automated evening attendance report generated by the HR Portal system.</p>
            <p style="margin: 4px 0 0 0;">&copy; ${new Date().getFullYear()} Ertitech Solutions Pvt Ltd. All rights reserved.</p>
          </div>

        </div>
      </body>
      </html>
    `;

    // 6. Send Mail via Nodemailer Transporter
    const mailOptions = {
      from: `"HR Portal" <${process.env.EMAIL_USER}>`,
      to: recipientEmails.join(", "),
      subject: `📊 Daily Attendance Report - ${displayDate}`,
      html: emailHtml,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[DailyAttendanceReport] 5:40 PM attendance report email sent successfully to ${recipientEmails.join(", ")}.`);

    return {
      success: true,
      recipientCount: recipientEmails.length,
      employeesCount: totalCount,
    };
  } catch (err) {
    console.error("[DailyAttendanceReport] Error sending 5:40 PM attendance report email:", err);
    throw err;
  }
}

module.exports = {
  sendDailyAttendanceReportEmail,
};

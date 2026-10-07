const Attendance = require("../Models/Attendance.model");
const Holiday = require("../Models/Holiday.model");
const LeaveRequest = require("../Models/LeaveRequest");
const PermissionRequest = require("../Models/PermissionRequest");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const getCachedSignedUrl = require("../utilities/s3CachedUrl");
const Employee = require("../Models/Employee");
const OFFICE_IP = process.env.OFFICE_IP;
const apiLogger = require('../utils/apiLogger');
const { createLog } = require("../utilities/logService");

/* ═══════════════════════════════════════════════
   SECURITY HELPERS
═══════════════════════════════════════════════ */
const getISTDate = () =>
  moment().tz("Asia/Kolkata").format("YYYY-MM-DD");

const normalizeObjectId = (id) =>
  mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id;

const formatTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatWorkingHours = (minutes) => {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
};

const getComputedWorkingMinutes = (att) => {
  if (!att) return 0;
  let totalMs = 0;
  if ((att.checkIn1 || att.checkInTime) && (att.checkOut1 || att.checkOutTime)) {
    totalMs += new Date(att.checkOut1 || att.checkOutTime) - new Date(att.checkIn1 || att.checkInTime);
  }
  if (att.checkIn2 && att.checkOut2) {
    totalMs += new Date(att.checkOut2) - new Date(att.checkIn2);
  }
  if (totalMs > 0) {
    return Math.floor(totalMs / 60000);
  }
  return att.workingMinutes || 0;
};

const buildISTDateWithTime = (baseDate, timeMoment) =>
  moment(baseDate)
    .tz("Asia/Kolkata")
    .hour(timeMoment.hour())
    .minute(timeMoment.minute())
    .second(timeMoment.second())
    .millisecond(timeMoment.millisecond())
    .toDate();

// ===== IP VALIDATION START =====
const getClientIP = (req) => {
  let ip = (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  );
  if (typeof ip === "string") {
    ip = ip.replace(/^::ffff:/, "").trim();
  }
  return ip;
};
// ===== IP VALIDATION END =====

const getDeviceInfo = (req) => {
  return {
    userAgent: req.headers["user-agent"] || "unknown",
    ip: getClientIP(req),
  };
};

const isWithinAllowedHours = () => {
  const now = moment().tz("Asia/Kolkata");
  const hour = now.hour();
  return hour >= 7 && hour < 23;
};

const isWithinBackdateWindow = (date) => {
  const now = moment().tz("Asia/Kolkata").startOf("day");
  const target = moment(date).tz("Asia/Kolkata").startOf("day");
  const diffDays = now.diff(target, "days");
  return diffDays >= 0 && diffDays <= 3;
};

/* ═══════════════════════════════════════════════
   TODAY ATTENDANCE
═══════════════════════════════════════════════ */

exports.getTodayAttendance = async (req, res) => {
  try {
    const employeeId = normalizeObjectId(req.user?._id);
    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const attendance = await Attendance.findOne({
      employeeId,
      date: getISTDate(),
    });

    // ✅ Always fetch from DB (source of truth)
    const employee = await Employee.findById(employeeId)
      .select("dateJoined")
      .lean();

    const todayStart = moment().tz("Asia/Kolkata").startOf("day").toDate();
    const todayEnd = moment().tz("Asia/Kolkata").endOf("day").toDate();

    const checkInPermission = await PermissionRequest.findOne({
      employeeId,
      status: { $in: ["INFORMED", "APPROVED"] },
      from: { $gte: todayStart, $lte: todayEnd },
    }).sort({ createdAt: -1 });

    const halfDayLeave = await LeaveRequest.findOne({
      employeeId,
      status: "Approved",
      requestType: "leave",
      dayType: "Half Day",
      fromDate: { $gte: todayStart, $lte: todayEnd },
    }).select("dayType startTime endTime status").lean();

    if (halfDayLeave && halfDayLeave.startTime && attendance) {
      const [leaveHour, leaveMin] = halfDayLeave.startTime.split(":").map(Number);
      const leaveStartDateTime = moment().tz("Asia/Kolkata").hour(leaveHour).minute(leaveMin).second(0).millisecond(0).toDate();
      const now = moment().tz("Asia/Kolkata").toDate();

      if (now >= leaveStartDateTime) {
        const open1 = attendance.checkIn1 && !attendance.checkOut1;
        const open2 = attendance.checkIn2 && !attendance.checkOut2;
        const openNormal = attendance.checkInTime && !attendance.checkOutTime;

        if (open1 || open2 || openNormal) {
          if (open1) attendance.checkOut1 = leaveStartDateTime;
          if (open2) attendance.checkOut2 = leaveStartDateTime;
          if (openNormal) attendance.checkOutTime = leaveStartDateTime;

          attendance.workingMinutes = getComputedWorkingMinutes(attendance);
          attendance.status = "Half Day Leave";
          attendance.remarks = "Half Day Leave";
          await attendance.save();
        }
      }
    }

    res.json({
      success: true,
      data: attendance || null,
      hasValidCheckInPermission: !!checkInPermission,
      permissionType: checkInPermission?.permissionType || null,
      halfDayLeave: halfDayLeave || null,
      user: {
        joiningDate: employee?.dateJoined || null,
      },
    });
  } catch (err) {
    console.error("getTodayAttendance error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════
   CHECK-IN
═══════════════════════════════════════════════ */

exports.checkIn = async (req, res) => {
  const { lateReason, ipReason, } = req.body;
  try {
    const employeeId = normalizeObjectId(req.user._id);
    // ===== IP VALIDATION START =====
    const currentIP = getClientIP(req);
    const configuredOfficeIP = (process.env.OFFICE_IP || OFFICE_IP || "").trim();
    const isOfficeIP = configuredOfficeIP
      ? (currentIP === configuredOfficeIP || currentIP.includes(configuredOfficeIP) || configuredOfficeIP.includes(currentIP))
      : true;
    // ===== IP VALIDATION END =====

    const empIdString =
      req.user?.empIdString || req.user?.empId || req.user?.employeeId || null;
    const employeeName = req.user?.name;

    if (!employeeId || !empIdString) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }

    if (!isWithinAllowedHours()) {
      return res.status(400).json({
        success: false,
        message: "Check-in not allowed outside office hours",
      });
    }

    const date = getISTDate();

    const todayStart = moment()
      .tz("Asia/Kolkata")
      .startOf("day")
      .toDate();

    const todayEnd = moment()
      .tz("Asia/Kolkata")
      .endOf("day")
      .toDate();

    let attendance = await Attendance.findOne({ employeeId, date });

    // ─── Auto-checkout open attendances from previous days ───
    const openAttendances = await Attendance.find({
      employeeId,
      date: { $lt: getISTDate() },
      $or: [
        { checkIn1: { $ne: null }, checkOut1: null },
        { checkIn2: { $ne: null }, checkOut2: null },
        { checkInTime: { $ne: null }, checkOutTime: null }
      ]
    });

    for (const att of openAttendances) {
      const todayStart = moment(att.date).tz("Asia/Kolkata").startOf("day").toDate();
      const todayEnd = moment(att.date).tz("Asia/Kolkata").endOf("day").toDate();
      const halfDayLeave = await LeaveRequest.findOne({
        employeeId,
        status: "Approved",
        requestType: "leave",
        dayType: "Half Day",
        fromDate: { $gte: todayStart, $lte: todayEnd },
      });

      let checkoutTime;
      let isHalfDay = false;
      if (halfDayLeave && halfDayLeave.startTime) {
        const [leaveHour, leaveMin] = halfDayLeave.startTime.split(":").map(Number);
        checkoutTime = moment(att.date).tz("Asia/Kolkata").hour(leaveHour).minute(leaveMin).second(0).millisecond(0).toDate();
        isHalfDay = true;
      } else {
        checkoutTime = moment(att.date)
          .tz("Asia/Kolkata")
          .hour(20)
          .minute(0)
          .second(0)
          .toDate();
      }

      if (att.checkIn1 && !att.checkOut1) {
        att.checkOut1 = checkoutTime;
        att.workingMinutes = Math.ceil((checkoutTime - att.checkIn1) / 60000);
        att.remarks = isHalfDay ? "Half Day Leave" : "Auto check out";
        if (isHalfDay) att.status = "Half Day Leave";
        att.autoCheckout = true;
        await att.save();
      } else if (att.checkIn2 && !att.checkOut2) {
        att.checkOut2 = checkoutTime;
        let totalMinutes = 0;
        if (att.checkIn1 && att.checkOut1) {
          totalMinutes += Math.ceil((att.checkOut1 - att.checkIn1) / 60000);
        }
        totalMinutes += Math.ceil((checkoutTime - att.checkIn2) / 60000);
        att.workingMinutes = totalMinutes;
        att.remarks = isHalfDay ? "Half Day Leave" : "Auto check out";
        if (isHalfDay) att.status = "Half Day Leave";
        att.autoCheckout = true;
        await att.save();
      } else if (att.checkInTime && !att.checkOutTime) {
        att.checkOutTime = checkoutTime;
        att.workingMinutes = Math.ceil((checkoutTime - att.checkInTime) / 60000);
        att.remarks = isHalfDay ? "Half Day Leave" : "Auto check out";
        if (isHalfDay) att.status = "Half Day Leave";
        att.autoCheckout = true;
        await att.save();
      }
    }

    if (!attendance) {
      attendance = new Attendance({
        employeeId,
        empIdString,
        employeeName,
        date,
      });
    }

    // ===== IP VALIDATION START =====
    if (!isOfficeIP) {
      if (!ipReason || !ipReason.trim()) {
        return res.status(400).json({
          success: false,
          requireIPReason: true,
          message: "You are checking in from a different network. Please enter the reason.",
        });
      }
      attendance.checkInIPAddress = currentIP;
      attendance.checkInIPReason = ipReason.trim();
    }
    // ===== IP VALIDATION END =====

    // ─── Fetch today's permission (INFORMED or APPROVED MORNING) ───
    const todayPermission = await PermissionRequest.findOne({
      employeeId,
      status: { $in: ["INFORMED", "APPROVED"] },
      from: { $gte: todayStart, $lte: todayEnd },
    });

    const hasMorningPermission =
      todayPermission?.permissionType === "MORNING";

    const hasEveningPermission =
      todayPermission?.permissionType === "EVENING";

    // ─── MORNING / EVENING permission: block re-check-in (checkIn2) ───
    if (
      attendance.checkIn1 &&
      attendance.checkOut1 &&
      !attendance.checkIn2
    ) {
      if (hasMorningPermission || hasEveningPermission) {
        return res.status(400).json({
          success: false,
          message: "Re-check-in is not allowed for MORNING or EVENING permission",
        });
      }
    }

    const now = moment().tz("Asia/Kolkata");

    const nowDate = buildISTDateWithTime(date, now);
    const isNormalCheckIn = !todayPermission;

    if (isNormalCheckIn) {
      if (!attendance.checkInTime) {
        attendance.checkInTime = nowDate;
      } else {
        return res.status(400).json({ success: false, message: "Already checked in" });
      }
    } else {
      if (!attendance.checkIn1 && !attendance.checkInTime) {
        attendance.checkIn1 = nowDate;
      } else if (
        (attendance.checkIn1 && attendance.checkOut1 && !attendance.checkIn2) ||
        (attendance.checkInTime && attendance.checkOutTime && !attendance.checkIn2)
      ) {
        attendance.checkIn2 = nowDate;
      } else {
        return res.status(400).json({ success: false, message: "Already checked in" });
      }
    }

    attendance.status = "Present";

    const isFirstCheckIn = isNormalCheckIn ? true : !attendance.checkIn2;

    // ─── Late-entry logic ───
    if (hasMorningPermission) {
      attendance.remarks = todayPermission.status === "APPROVED" ? "Approved Permission" : "Informed Permission";
      attendance.lateEntryReason = undefined;
      attendance.lateEntryCount = undefined;
    } else if (todayPermission && !hasMorningPermission) {
      attendance.remarks = todayPermission.status === "APPROVED" ? "Approved Permission" : "Informed Permission";
    } else if (
      isFirstCheckIn &&
      (
        now.hour() > 10 ||
        (now.hour() === 10 && now.minute() > 0)
      )
    ) {
      attendance.remarks = "Late Entry";
      attendance.lateEntryReason = lateReason;
      attendance.lateEntryCount = undefined;
    } else {
      attendance.remarks = "Checked in";
      attendance.lateEntryReason = undefined;
      attendance.lateEntryCount = undefined;
    }

    attendance.workingMinutes = undefined;

    await attendance.save();

    const lateNote = attendance.remarks === "Late Entry" && lateReason ? ` (Late: ${lateReason})` : "";
    const sessionNote = attendance.checkIn2 ? " (Session 2)" : "";
    createLog({
      category: "attendance",
      referenceId: attendance._id,
      description: `${employeeName} (${empIdString}) checked in${sessionNote}${lateNote}`,
    });

    res.json({ success: true, data: attendance });
  } catch (err) {
    console.error("checkIn error:", err);
    res.status(500).json({ success: false, message: "Check-in failed" });
  }
};

/* ═══════════════════════════════════════════════
   CHECK-OUT
═══════════════════════════════════════════════ */

exports.checkOut = async (req, res) => {
  const { ipReason } = req.body;
  try {
    const employeeId = normalizeObjectId(req.user._id);

    // ===== IP VALIDATION START =====
    const currentIP = getClientIP(req);
    const configuredOfficeIP = (process.env.OFFICE_IP || OFFICE_IP || "").trim();
    const isOfficeIP = configuredOfficeIP
      ? (currentIP === configuredOfficeIP || currentIP.includes(configuredOfficeIP) || configuredOfficeIP.includes(currentIP))
      : true;
    // ===== IP VALIDATION END =====

    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // ===== IP REASON REQUIREMENT CHECK =====
    if (!isOfficeIP) {
      if (!ipReason || !ipReason.trim()) {
        return res.status(400).json({
          success: false,
          requireIPReason: true,
          message: "You are checking out from a different network. Please enter the reason.",
        });
      }
    }
    // ===== IP REASON REQUIREMENT END =====

    const date = getISTDate();
    const attendance = await Attendance.findOne({ employeeId, date });

    if (!attendance || !(attendance.checkIn1 || attendance.checkInTime)) {
      return res.status(400).json({
        success: false,
        message: "You must check-in first",
      });
    }

    if (!isOfficeIP) {
      attendance.checkOutIPAddress = currentIP;
      attendance.checkOutIPReason = ipReason.trim();
    }

    const nowDate = buildISTDateWithTime(date, moment().tz("Asia/Kolkata"));

    // ✅ HALF DAY LEAVE CHECKOUT LOGIC
    const todayStart = moment(date).tz("Asia/Kolkata").startOf("day").toDate();
    const todayEnd = moment(date).tz("Asia/Kolkata").endOf("day").toDate();
    const halfDayLeave = await LeaveRequest.findOne({
      employeeId,
      status: "Approved",
      requestType: "leave",
      dayType: "Half Day",
      fromDate: { $gte: todayStart, $lte: todayEnd },
    });

    if (halfDayLeave && halfDayLeave.startTime) {
      const [leaveHour, leaveMin] = halfDayLeave.startTime.split(":").map(Number);
      const leaveStartDateTime = moment(date).tz("Asia/Kolkata").hour(leaveHour).minute(leaveMin).second(0).toDate();

      const activeCheckIn = attendance.checkIn1 || attendance.checkInTime;
      if (activeCheckIn && new Date(activeCheckIn) < leaveStartDateTime && nowDate >= leaveStartDateTime) {
        if (attendance.checkIn1 && !attendance.checkOut1) {
          attendance.checkOut1 = leaveStartDateTime;
        } else if (attendance.checkIn2 && !attendance.checkOut2) {
          attendance.checkOut2 = leaveStartDateTime;
        } else if (attendance.checkInTime && !attendance.checkOutTime) {
          attendance.checkOutTime = leaveStartDateTime;
        } else {
          return res.status(400).json({ success: false, message: "No active session found" });
        }

        attendance.workingMinutes = getComputedWorkingMinutes(attendance);
        attendance.status = "Half Day Leave";
        attendance.remarks = "Half Day Leave";
        await attendance.save();

        createLog({
          category: "attendance",
          referenceId: attendance._id,
          description: `${attendance.employeeName || req.user?.name} (${attendance.empIdString || req.user?.empId}) checked out (Half Day Leave)`,
        });

        return res.json({ success: true, data: attendance });
      }
    }

    if (attendance.checkIn1 || attendance.checkIn2) {
      if (attendance.checkIn1 && !attendance.checkOut1) {
        attendance.checkOut1 = nowDate;
      } else if (attendance.checkIn2 && !attendance.checkOut2) {
        attendance.checkOut2 = nowDate;
      } else {
        return res.status(400).json({ success: false, message: "No active session found" });
      }
    } else if (attendance.checkInTime && !attendance.checkOutTime) {
      attendance.checkOutTime = nowDate;
    } else {
      return res.status(400).json({ success: false, message: "No active session found" });
    }

    // Minimum 5-minute working time check
    const activeCheckIn = attendance.checkOut2
      ? attendance.checkIn2
      : (attendance.checkIn1 || attendance.checkInTime);

    const diff = Date.now() - new Date(activeCheckIn).getTime();
    if (diff < 5 * 60 * 1000) {
      // Rollback the checkout we just set before returning error
      if (attendance.checkOut2 && attendance.checkIn2) {
        attendance.checkOut2 = undefined;
      } else if (attendance.checkInTime) {
        attendance.checkOutTime = undefined;
      } else {
        attendance.checkOut1 = undefined;
      }
      return res.status(400).json({
        success: false,
        message: "Minimum working 5 minutes required before checkout",
      });
    }

    if (!isWithinAllowedHours()) {
      return res.status(400).json({
        success: false,
        message: "Check-out not allowed outside office hours",
      });
    }

    let totalMinutes = 0;
    if (attendance.checkInTime && attendance.checkOutTime) {
      totalMinutes += Math.ceil((attendance.checkOutTime - attendance.checkInTime) / 60000);
    }
    if (attendance.checkIn1 && attendance.checkOut1) {
      totalMinutes += Math.ceil((attendance.checkOut1 - attendance.checkIn1) / 60000);
    }
    if (attendance.checkIn2 && attendance.checkOut2) {
      totalMinutes += Math.ceil((attendance.checkOut2 - attendance.checkIn2) / 60000);
    }

    attendance.status = "Present";
    const currentRemark = (attendance.remarks || "").trim().toLowerCase();
    if (
      !currentRemark ||
      currentRemark.includes("check") ||
      currentRemark.includes("checked")
    ) {
      attendance.remarks = "Checked out";
    }

    await attendance.save();

    const sessionNote = attendance.checkOut2 ? " (Session 2)" : (attendance.checkIn2 ? " (Session 1)" : "");
    createLog({
      category: "attendance",
      referenceId: attendance._id,
      description: `${attendance.employeeName || req.user?.name} (${attendance.empIdString || req.user?.empId}) checked out${sessionNote}`,
    });

    res.json({ success: true, data: attendance });
  } catch (err) {
    console.error("checkOut error:", err);
    res.status(500).json({ success: false, message: "Check-out failed" });
  }
};

/* ═══════════════════════════════════════════════
   MONTHLY ATTENDANCE + CALENDAR
   ✅ ISSUE 3 FIXED: Removed redundant DB call if JWT has dateJoined
═══════════════════════════════════════════════ */

exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    const employeeId = normalizeObjectId(req.user?._id);

    if (!month || !year || !employeeId) {
      return res.status(400).json({
        success: false,
        message: "Month, year and authentication required",
      });
    }

    const monthMap = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };

    const monthNum = isNaN(month) ? monthMap[month] : Number(month);

    if (!monthNum) {
      return res.status(400).json({ success: false, message: "Invalid month" });
    }

    const monthStr = String(monthNum).padStart(2, "0");

    const start = moment
      .tz(`${year}-${monthStr}-01`, "YYYY-MM-DD", "Asia/Kolkata")
      .startOf("month");
    const end = start.clone().endOf("month");

    const today = moment().tz("Asia/Kolkata").startOf("day");
    const todayStr = today.format("YYYY-MM-DD");

    // ✅ FIX ISSUE 3: Use req.user.dateJoined if available (avoid DB call)
    let joiningDay;

    if (req.user?.dateJoined) {
      joiningDay = moment(req.user.dateJoined).tz("Asia/Kolkata").startOf("day");
    } else {
      const emp = await Employee.findById(employeeId).select("dateJoined").lean();
      joiningDay = emp?.dateJoined
        ? moment(emp.dateJoined).tz("Asia/Kolkata").startOf("day")
        : null;
    }

    const holidays = await Holiday.find({
      date: {
        $gte: start.format("YYYY-MM-DD"),
        $lte: end.format("YYYY-MM-DD"),
      },
    }).lean();

    const holidaySet = new Set(holidays.map((h) => h.date));

    const isWeekOffDay = (dayNum, weekday) => {
      if (weekday === 0) return true;
      if (
        weekday === 6 &&
        (Math.ceil(dayNum / 7) === 2 || Math.ceil(dayNum / 7) === 4)
      )
        return true;
      return false;
    };

    const isBeforeJoining = (dateObj) => {
      if (!joiningDay) return false;
      return dateObj.isBefore(joiningDay, "day");
    };

    let workingDays = 0;
    let completedWorkingDays = 0;
    for (let d = 1; d <= end.date(); d++) {
      const dateObj = start.clone().date(d);
      const weekday = dateObj.day();

      if (isWeekOffDay(d, weekday)) continue;
      if (holidaySet.has(dateObj.format("YYYY-MM-DD"))) continue;
      if (isBeforeJoining(dateObj)) continue;

      workingDays++;
      if (!dateObj.isAfter(today, "day")) completedWorkingDays++;
    }

    const attendances = await Attendance.find({
      employeeId,
      date: {
        $gte: start.format("YYYY-MM-DD"),
        $lte: end.format("YYYY-MM-DD"),
      },
    }).lean();

    const requests = await LeaveRequest.find({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      status: "Approved",
      fromDate: { $lte: end.toDate() },
      toDate: { $gte: start.toDate() },
    }).lean();

    const leaveMap = new Map();
    const wfhSet = new Set();

    requests.forEach((req) => {
      let current = moment(req.fromDate).tz("Asia/Kolkata").startOf("day");
      const endDate = moment(req.toDate).tz("Asia/Kolkata").startOf("day");

      while (current.isSameOrBefore(endDate)) {
        const dateStr = current.format("YYYY-MM-DD");

        if (req.requestType === "leave") {
          leaveMap.set(dateStr, {
            dayType: req.dayType,
            startTime: req.startTime,
            endTime: req.endTime,
            status: req.status
          });
        }

        if (req.requestType === "wfh") {
          wfhSet.add(dateStr);
        }

        current.add(1, "day");
      }
    });

    const attMap = new Map(attendances.map((a) => [a.date, a]));

    const currentHour = moment().tz("Asia/Kolkata").hour();
    if (currentHour >= 20) {
      for (const att of attendances) {
        if (moment(att.date).tz("Asia/Kolkata").isBefore(today, "day")) {
          const open1 = att.checkIn1 && !att.checkOut1;
          const open2 = att.checkIn2 && !att.checkOut2;
          const openNormal = att.checkInTime && !att.checkOutTime;

          if (open1 || open2 || openNormal) {
            const forcedCheckout = moment(att.date)
              .tz("Asia/Kolkata")
              .hour(20).minute(0).second(0).millisecond(0).toDate();

            if (open1) att.checkOut1 = forcedCheckout;
            if (open2) att.checkOut2 = forcedCheckout;
            if (openNormal) att.checkOutTime = forcedCheckout;

            let minutes = 0;
            if (att.checkIn1 && att.checkOut1) {
              minutes += Math.ceil((new Date(att.checkOut1) - new Date(att.checkIn1)) / 60000);
            }
            if (att.checkIn2 && att.checkOut2) {
              minutes += Math.ceil((new Date(att.checkOut2) - new Date(att.checkIn2)) / 60000);
            }
            if (att.checkInTime && att.checkOutTime) {
              minutes += Math.ceil((new Date(att.checkOutTime) - new Date(att.checkInTime)) / 60000);
            }

            await Attendance.updateOne(
              { _id: att._id },
              {
                $set: {
                  checkOut1: att.checkOut1,
                  checkOut2: att.checkOut2,
                  checkOutTime: att.checkOutTime,
                  workingMinutes: minutes,
                  status: "Present",
                  remarks: "Auto check out",
                  autoCheckout: true,
                },
              }
            );

            att.checkOutTime = att.checkOutTime;
            att.workingMinutes = minutes;
            att.status = "Present";
            att.remarks = "Auto check out";
            att.autoCheckout = true;
          }
        }
      }
    }

    const records = [];
    const calendar = [];

    let presentDays = 0;
    let leavesTaken = 0;
    let absentDays = 0;
    let permissionCount = 0;

    const firstDayOfWeek = start.day();
    const prevEnd = start.clone().subtract(1, "day");

    for (let i = 0; i < firstDayOfWeek; i++) {
      calendar.push({
        day: prevEnd.date() - (firstDayOfWeek - 1 - i),
        month: "prev",
        status: null,
        isActive: false,
      });
    }

    for (let d = 1; d <= end.date(); d++) {
      const dateObj = start.clone().date(d);
      const dateStr = dateObj.format("YYYY-MM-DD");
      const dayStr = dateObj.format("DD MMM");
      const weekday = dateObj.day();

      const isFuture = dateObj.isAfter(today, "day");
      const isToday = dateObj.isSame(today, "day");
      const isWeekOff = isWeekOffDay(d, weekday);
      const isHoliday = holidaySet.has(dateStr);
      const isWorkingDay = !isWeekOff && !isHoliday;

      const att = attMap.get(dateStr);
      const beforeJoining = isBeforeJoining(dateObj) && !att;

      let status = "—";
      let remarks = "—";
      let login = "—";
      let logout = "—";
      let workingHours = "—";
      let calStatus = null;

      if (isHoliday) {
        calStatus = "holiday";
      } else if (isWeekOff) {
        calStatus = "week";
      } else if (beforeJoining) {
        calStatus = null;
      } else if (isFuture) {
        calStatus = null;
      } else if (isToday && isWorkingDay) {
        if (wfhSet.has(dateStr)) {
          if (att && ((att.checkIn1 || att.checkInTime) || ["Present", "Half Day"].includes(att.status))) {
            status = "Present";
            login = formatTime(att.checkIn1 || att.checkInTime);
            let finalCheckOut = null;
            if ((att.checkIn2 && !att.checkOut2) || (att.checkIn1 && !att.checkOut1 && !att.checkIn2)) {
              finalCheckOut = null;
            } else {
              finalCheckOut = att.checkOutTime || att.checkOut2 || att.checkOut1;
            }
            logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
            if (finalCheckOut === null) {
              workingHours = "—";
            } else {
              const minutes = getComputedWorkingMinutes(att);
              workingHours = formatWorkingHours(minutes);
            }
            if (att?.remarks?.toLowerCase().includes("late")) {
              remarks = "Late Entry - WFH";
            } else {
              remarks = "WFH";
            }
            presentDays++;
          } else {
            status = "WFH";
            remarks = "WFH";
            login = "—";
            logout = "—";
            workingHours = "—";
          }
          calStatus = "present";
        } else if (leaveMap.has(dateStr)) {
          const leaveInfo = leaveMap.get(dateStr);
          if (leaveInfo.dayType === "Half Day") {
            leavesTaken += 0.5;
            if (att && (att.checkIn1 || att.checkInTime)) {
              let finalCheckOut = null;
              if (att.checkOutTime || att.checkOut2 || att.checkOut1) {
                finalCheckOut = att.checkOutTime || att.checkOut2 || att.checkOut1;
              } else if (leaveInfo.startTime) {
                const [leaveHour, leaveMin] = leaveInfo.startTime.split(":").map(Number);
                const leaveStartDateTime = moment().tz("Asia/Kolkata").hour(leaveHour).minute(leaveMin).second(0).millisecond(0).toDate();
                const now = moment().tz("Asia/Kolkata").toDate();
                if (now >= leaveStartDateTime) {
                  finalCheckOut = leaveStartDateTime;
                }
              }

              status = "Half Day Leave";
              login = formatTime(att.checkIn1 || att.checkInTime);
              logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
              if (finalCheckOut === null) {
                workingHours = "—";
              } else {
                let minutes = 0;
                const checkInVal = att.checkIn1 || att.checkInTime;
                if (checkInVal && finalCheckOut) {
                  minutes = Math.max(0, Math.floor((new Date(finalCheckOut) - new Date(checkInVal)) / 60000));
                } else {
                  minutes = getComputedWorkingMinutes(att);
                }
                workingHours = formatWorkingHours(minutes);
              }
              remarks = att.remarks || "Half Day Leave";
              presentDays += 0.5;
              calStatus = "present";
            } else {
              status = "Half Day Leave";
              remarks = "Half Day Leave";
              login = "—";
              logout = "—";
              workingHours = "—";
              calStatus = "approved";
            }
          } else {
            status = "Leave";
            remarks = "Leave Approved";
            leavesTaken++;
            calStatus = "approved";
          }
        } else if (att && (["Present", "Half Day", "Half Day Leave"].includes(att.status) || (att.checkIn1 || att.checkInTime))) {
          status = "Present";
          login = formatTime(att.checkIn1 || att.checkInTime);
          let finalCheckOut = null;
          if ((att.checkIn2 && !att.checkOut2) || (att.checkIn1 && !att.checkOut1 && !att.checkIn2)) {
            finalCheckOut = null;
          } else {
            finalCheckOut = att.checkOut2 || att.checkOut1 || att.checkOutTime;
          }
          logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
          if (finalCheckOut === null) {
            workingHours = "—";
          } else {
            const minutes = getComputedWorkingMinutes(att);
            workingHours = formatWorkingHours(minutes);
          }
          remarks = att.remarks || "—";
          presentDays++;
          calStatus = "present";
        } else if (isWorkingDay && !isBeforeJoining(dateObj)) {
          const currentHour = moment().tz("Asia/Kolkata").hour();
          if (currentHour >= 11 || (att && att.status === "Absent")) {
            status = "Absent";
            remarks = "Absent";
            absentDays++;
            calStatus = "absent";
          } else {
            status = "—";
            remarks = "—";
            calStatus = null;
          }
        }
      } else {
        if (wfhSet.has(dateStr)) {
          if (att && ((att.checkIn1 || att.checkInTime) || ["Present", "Half Day"].includes(att.status))) {
            status = "Present";
            login = formatTime(att.checkIn1 || att.checkInTime);
            let finalCheckOut = null;
            if ((att.checkIn2 && !att.checkOut2) || (att.checkIn1 && !att.checkOut1 && !att.checkIn2)) {
              finalCheckOut = null;
            } else {
              finalCheckOut = att.checkOut2 || att.checkOut1 || att.checkOutTime;
            }
            logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
            if (finalCheckOut === null) {
              workingHours = "—";
            } else {
              const minutes = getComputedWorkingMinutes(att);
              workingHours = formatWorkingHours(minutes);
            }
            if (att?.remarks?.toLowerCase().includes("late")) {
              remarks = "Late Entry - WFH";
            } else {
              remarks = "WFH";
            }
            presentDays++;
          } else {
            status = "WFH";
            remarks = "WFH";
            login = "—";
            logout = "—";
            workingHours = "—";
          }
          calStatus = "present";
        } else if (leaveMap.has(dateStr)) {
          const leaveInfo = leaveMap.get(dateStr);
          if (leaveInfo.dayType === "Half Day") {
            leavesTaken += 0.5;
            if (att && (att.checkIn1 || att.checkInTime)) {
              status = "Half Day Leave";
              login = formatTime(att.checkIn1 || att.checkInTime);
              let finalCheckOut = null;
              if ((att.checkIn2 && !att.checkOut2) || (att.checkIn1 && !att.checkOut1 && !att.checkIn2)) {
                finalCheckOut = null;
              } else {
                finalCheckOut = att.checkOut2 || att.checkOut1 || att.checkOutTime;
              }
              logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
              if (finalCheckOut === null) {
                workingHours = "—";
              } else {
                const minutes = getComputedWorkingMinutes(att);
                workingHours = formatWorkingHours(minutes);
              }
              remarks = att.remarks || "Half Day Leave";
              presentDays += 0.5;
              calStatus = "present";
            } else {
              status = "Half Day Leave";
              remarks = "Half Day Leave";
              login = "—";
              logout = "—";
              workingHours = "—";
              calStatus = "approved";
            }
          } else {
            status = "Leave";
            remarks = "Leave Approved";
            leavesTaken++;
            calStatus = "approved";
          }
        } else if (att && (["Present", "Half Day", "Half Day Leave"].includes(att.status) || (att.checkIn1 || att.checkInTime))) {
          status = "Present";
          login = formatTime(att.checkIn1 || att.checkInTime);
          let finalCheckOut = null;
          if ((att.checkIn2 && !att.checkOut2) || (att.checkIn1 && !att.checkOut1 && !att.checkIn2)) {
            finalCheckOut = null;
          } else {
            finalCheckOut = att.checkOut2 || att.checkOut1 || att.checkOutTime;
          }
          logout = finalCheckOut ? formatTime(finalCheckOut) : "—";
          if (finalCheckOut === null) {
            workingHours = "—";
          } else {
            const minutes = getComputedWorkingMinutes(att);
            workingHours = formatWorkingHours(minutes);
          }
          remarks = att.remarks || "—";
          presentDays++;
          calStatus = "present";
        } else if (isWorkingDay && !isBeforeJoining(dateObj)) {
          status = "Absent";
          remarks = "Absent";
          absentDays++;
          calStatus = "absent";
        }
      }

      if (!isFuture && !isWeekOff && !isHoliday && !beforeJoining) {
        records.push({
          date: dayStr,
          login,
          logout,
          status,
          workingHours,
          remarks,
          lateReason: att?.lateEntryReason || att?.lateReason || null,
          checkInIPReason: att?.checkInIPReason || null,
          checkOutIPReason: att?.checkOutIPReason || null,
          reason: att?.lateEntryReason || att?.lateReason || att?.checkInIPReason || att?.checkOutIPReason || (att?.remarks && att.remarks !== "—" ? att.remarks : null),
        });
      }

      calendar.push({
        day: d,
        month: "current",
        status: beforeJoining ? "before-joining" : calStatus,
        isActive: dateStr === todayStr,
        isSunday: weekday === 0,
        isSecondSaturday: weekday === 6 && Math.ceil(d / 7) === 2,
        isFourthSaturday: weekday === 6 && Math.ceil(d / 7) === 4,
      });
    }

    let nextDay = 1;
    while (calendar.length < 42) {
      calendar.push({
        day: nextDay++,
        month: "next",
        status: null,
        isActive: false,
      });
    }

    const attendancePercent =
      completedWorkingDays > 0
        ? ((presentDays / completedWorkingDays) * 100).toFixed(2) + "%"
        : "0%";

    res.json({
      success: true,
      data: {
        workingDays,
        completedWorkingDays,
        presentDays,
        absentDays,
        leaves: leavesTaken,
        permissions: permissionCount,
        attendancePercentage: attendancePercent,
        attendanceRecords: records,
        calendarDays: calendar,
      },
    });
  } catch (err) {
    console.error("getMonthlyAttendance error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch monthly data" });
  }
};

exports.getEmployeeAttendanceOverview = async (req, res) => {
  try {
    const employeeId = normalizeObjectId(req.user?._id);

    if (!employeeId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let { year, fromMonth, toMonth } = req.query;

    fromMonth = Number(fromMonth);
    toMonth = Number(toMonth);

    if (isNaN(fromMonth) || fromMonth < 0 || fromMonth > 11) fromMonth = 0;
    if (isNaN(toMonth) || toMonth < 0 || toMonth > 11) toMonth = 11;

    if (!year) {
      return res.status(400).json({ success: false, message: "year is required" });
    }

    const y = Number(year);

    if (isNaN(y) || y < 2000 || y > 2100) {
      return res.status(400).json({ success: false, message: "Invalid year" });
    }

    const employee = await Employee.findById(employeeId)
      .select("name designation photo dateJoined")
      .lean();

    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const joiningDate = moment(employee.dateJoined)
      .tz("Asia/Kolkata")
      .startOf("day");

    const startDate = moment.tz({ year: y, month: fromMonth, day: 1 }, "Asia/Kolkata");
    const today = moment().tz("Asia/Kolkata").startOf("day");

    // ✅ If fromMonth > toMonth (e.g. Apr to Mar), endDate is in NEXT year
    const endDate = (fromMonth > toMonth)
      ? moment.tz({ year: y + 1, month: toMonth, day: 1 }, "Asia/Kolkata").endOf("month")
      : moment.tz({ year: y, month: toMonth, day: 1 }, "Asia/Kolkata").endOf("month");

    // ✅ Update effectiveStart to use startDate
    const effectiveStart = moment.max(startDate, joiningDate);

    const holidays = await Holiday.find({
      date: {
        $gte: effectiveStart.format("YYYY-MM-DD"),
        $lte: endDate.format("YYYY-MM-DD"),
      },
    }).lean();
    const holidaySet = new Set(holidays.map((h) => h.date));

    // ✅ FIX ISSUE 2: Leave query also uses effectiveStart
    const leaveRequests = await LeaveRequest.find({
      employeeId,
      status: "Approved",
      fromDate: { $lte: endDate.toDate() },
      toDate: { $gte: effectiveStart.toDate() },
    }).lean();

    const leaveMap = new Map();
    const wfhSet = new Set();

    leaveRequests.forEach((l) => {
      const isWFH = l.requestType === "wfh";
      if (isWFH) {
        if (Array.isArray(l.leaveDates) && l.leaveDates.length > 0) {
          l.leaveDates.forEach((d) => wfhSet.add(d));
        } else {
          let current = moment.tz(l.fromDate, "Asia/Kolkata").startOf("day");
          const end = moment.tz(l.toDate || l.fromDate, "Asia/Kolkata").startOf("day");
          while (!current.isAfter(end, "day")) {
            wfhSet.add(current.format("YYYY-MM-DD"));
            current.add(1, "day");
          }
        }
      } else {
        const leaveInfo = {
          dayType: l.dayType,
          noOfDays: l.noOfDays,
          startTime: l.startTime,
          endTime: l.endTime,
          status: l.status,
        };
        if (Array.isArray(l.leaveDates) && l.leaveDates.length > 0) {
          l.leaveDates.forEach((d) => leaveMap.set(d, leaveInfo));
        } else {
          let current = moment.tz(l.fromDate, "Asia/Kolkata").startOf("day");
          const end = moment.tz(l.toDate || l.fromDate, "Asia/Kolkata").startOf("day");
          while (!current.isAfter(end, "day")) {
            leaveMap.set(current.format("YYYY-MM-DD"), leaveInfo);
            current.add(1, "day");
          }
        }
      }
    });

    // ✅ FIX ISSUE 1: Attendance query uses effectiveStart
    const attendances = await Attendance.find({
      employeeId,
      date: {
        $gte: effectiveStart.format("YYYY-MM-DD"),
        $lte: endDate.format("YYYY-MM-DD"),
      },
    }).lean();

    const attMap = new Map(attendances.map((a) => [a.date, a]));

    let workingDays = 0;
    let completedWorkingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let permissionCount = 0;
    let absentDays = 0;

    const calendarByMonth = {};
    let cursor = startDate.clone();

    while (!cursor.isAfter(endDate, "day")) {
      const dateStr = cursor.format("YYYY-MM-DD");
      const day = cursor.date();
      const month = cursor.month();

      let isInRange;

      if (fromMonth <= toMonth) {
        isInRange = month >= fromMonth && month <= toMonth;
      } else {
        isInRange = month >= fromMonth || month <= toMonth;
      }

      if (!isInRange) {
        cursor.add(1, "day");
        continue;
      }

      const weekday = cursor.day();

      const isSunday = weekday === 0;
      const isSecondSaturday = weekday === 6 && Math.ceil(day / 7) === 2;
      const isFourthSaturday = weekday === 6 && Math.ceil(day / 7) === 4;
      const isHoliday = holidaySet.has(dateStr);
      const isBeforeJoining = cursor.isBefore(joiningDate, "day");

      const isWorkingDay =
        !isHoliday &&
        !isSunday &&
        !isSecondSaturday &&
        !isFourthSaturday &&
        !isBeforeJoining;

      const isFuture = cursor.isAfter(today, "day");

      if (isWorkingDay) {
        workingDays++;

        if (!isFuture) {
          completedWorkingDays++;

          const attRecord = attMap.get(dateStr);
          const attStatus = attRecord?.status?.toLowerCase();
          const hasCheckIn = attRecord && (attRecord.checkIn1 || attRecord.checkInTime);

          if (leaveMap.has(dateStr)) {
            const leaveInfo = leaveMap.get(dateStr);
            if (leaveInfo.dayType === "Half Day" || leaveInfo.noOfDays === 0.5) {
              leaveDays += 0.5;
              if (hasCheckIn || ["present", "half day"].includes(attStatus)) {
                presentDays += 0.5;
              } else {
                absentDays += 0.5;
              }
            } else {
              leaveDays += 1;
            }
          } else if (attStatus === "leave" || attStatus === "approved") {
            leaveDays += 1;
          } else if (attStatus === "half day leave" || attStatus === "half day") {
            leaveDays += 0.5;
            if (hasCheckIn) {
              presentDays += 0.5;
            } else {
              absentDays += 0.5;
            }
          } else if (
            wfhSet.has(dateStr) ||
            attStatus === "present" ||
            hasCheckIn
          ) {
            presentDays += 1;
          } else {
            absentDays += 1;
          }
        }
      }

      let status = null;

      if (isHoliday) {
        status = "holiday";
      } else if (isSunday || isSecondSaturday || isFourthSaturday) {
        status = "weekend";
      } else if (!isBeforeJoining) {
        if (isFuture) {
          status = null;
        } else if (leaveMap.has(dateStr)) {
          const leaveInfo = leaveMap.get(dateStr);
          if (leaveInfo.dayType === "Half Day" || leaveInfo.noOfDays === 0.5) {
            status = "half-day-leave";
          } else {
            status = "leave";
          }
        } else if (wfhSet.has(dateStr)) {
          status = "wfh";
        } else if (
          ["half day leave", "half day"].includes(attMap.get(dateStr)?.status?.toLowerCase())
        ) {
          status = "half-day-leave";
        } else if (
          ["present"].includes(attMap.get(dateStr)?.status?.toLowerCase()) ||
          (attMap.get(dateStr)?.checkIn1 || attMap.get(dateStr)?.checkInTime)
        ) {
          status = "present";
        } else if (["leave", "approved"].includes(attMap.get(dateStr)?.status?.toLowerCase())) {
          status = "leave";
        } else {
          status = "absent";
        }
      }

      if (!calendarByMonth[month]) calendarByMonth[month] = [];
      calendarByMonth[month].push({
        day,
        date: dateStr,
        status,
        isToday: cursor.isSame(today, "day"),
      });

      cursor.add(1, "day");
    }

    let avatarUrl = "/avatar.png";
    if (employee.photo && employee.photo !== "avatar.png") {
      avatarUrl = await getCachedSignedUrl(employee.photo);
    }

    return res.json({
      success: true,
      data: {
        employee: {
          name: employee.name,
          designation: employee.designation || "-",
          avatar: avatarUrl,
          joiningDate: employee.dateJoined,
        },
        summary: {
          workingDays,
          daysPresent: presentDays,
          leavesTaken: leaveDays,
          absentDays,
          totalLeave: leaveDays + absentDays,
          permissions: permissionCount,
          attendancePercentage:
            completedWorkingDays > 0
              ? Math.round((presentDays / completedWorkingDays) * 100) + "%"
              : "0%",
        },
        calendar: calendarByMonth,
      },
    });

  } catch (err) {
    console.error("❌ getEmployeeAttendanceOverview error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch attendance overview" });
  }
};

/* ═══════════════════════════════════════════════
   AUTO CHECKOUT (CRON JOB)
═══════════════════════════════════════════════ */

exports.autoCheckoutUnclosedAttendances = async () => {
  const startOfToday = getISTDate();

  const openAttendances = await Attendance.find({
    date: { $lte: startOfToday },
  });

  let successCount = 0;
  let failCount = 0;

  for (const att of openAttendances) {
    const open1 = att.checkIn1 && !att.checkOut1;
    const open2 = att.checkIn2 && !att.checkOut2;
    const openNormal = att.checkInTime && !att.checkOutTime;

    if (!open1 && !open2 && !openNormal) {
      continue;
    }

    try {
      const todayStart = moment(att.date).tz("Asia/Kolkata").startOf("day").toDate();
      const todayEnd = moment(att.date).tz("Asia/Kolkata").endOf("day").toDate();
      const halfDayLeave = await LeaveRequest.findOne({
        employeeId: att.employeeId,
        status: "Approved",
        requestType: "leave",
        dayType: "Half Day",
        fromDate: { $gte: todayStart, $lte: todayEnd },
      });

      let checkoutTime;
      let isHalfDay = false;
      if (halfDayLeave && halfDayLeave.startTime) {
        const [leaveHour, leaveMin] = halfDayLeave.startTime.split(":").map(Number);
        checkoutTime = moment(att.date).tz("Asia/Kolkata").hour(leaveHour).minute(leaveMin).second(0).millisecond(0).toDate();
        isHalfDay = true;
      } else {
        checkoutTime = moment(att.date)
          .tz("Asia/Kolkata")
          .hour(20).minute(0).second(0).millisecond(0).toDate();
      }

      if (open1) att.checkOut1 = checkoutTime;
      if (open2) att.checkOut2 = checkoutTime;
      if (openNormal) att.checkOutTime = checkoutTime;

      let totalMinutes = 0;
      if (att.checkIn1 && att.checkOut1) {
        totalMinutes += Math.ceil((new Date(att.checkOut1) - new Date(att.checkIn1)) / 60000);
      }
      if (att.checkIn2 && att.checkOut2) {
        totalMinutes += Math.ceil((new Date(att.checkOut2) - new Date(att.checkIn2)) / 60000);
      }
      if (att.checkInTime && att.checkOutTime) {
        totalMinutes += Math.ceil((new Date(att.checkOutTime) - new Date(att.checkInTime)) / 60000);
      }

      att.workingMinutes = totalMinutes;
      att.status = isHalfDay ? "Half Day Leave" : "Present";
      att.remarks = isHalfDay ? "Half Day Leave" : "Auto check out";
      att.autoCheckout = true;

      await att.save();
      successCount++;
    } catch (err) {
      failCount++;
      console.error(
        `autoCheckout failed for attendance ${att._id} (${att.empIdString}):`,
        err
      );
    }
  }

  if (failCount > 0) {
    console.warn(
      `autoCheckoutUnclosedAttendances: ${successCount} succeeded, ${failCount} failed`
    );
  }

  return successCount;
};

/* ═══════════════════════════════════════════════
   HOLIDAY MANAGEMENT
═══════════════════════════════════════════════ */

exports.addHoliday = async (req, res) => {
  try {
    const { date, name } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid YYYY-MM-DD date required" });
    }

    const existing = await Holiday.findOne({ date });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Holiday already exists" });
    }

    const holiday = new Holiday({ date, name: name || "Government Holiday" });
    await holiday.save();

    res.json({ success: true, data: holiday });
  } catch (err) {
    console.error("addHoliday error:", err);
    res.status(500).json({ success: false, message: "Failed to add holiday" });
  }
};

exports.addBulkHolidays = async (req, res) => {
  try {
    const holidays = req.body;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid holiday list" });
    }

    for (const h of holidays) {
      if (!h.date || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
        return res.status(400).json({
          success: false,
          message: `Invalid date format: ${h.date}`,
        });
      }
    }

    try {
      const result = await Holiday.insertMany(holidays, { ordered: false });
      res.json({
        success: true,
        insertedCount: result.length,
        message: `${result.length} holidays processed (duplicates may be skipped)`,
      });
    } catch (bulkErr) {
      if (
        bulkErr.code === 11000 ||
        bulkErr.name === "BulkWriteError" ||
        bulkErr.name === "MongoBulkWriteError"
      ) {
        const inserted = bulkErr.result?.nInserted ?? 0;
        return res.status(207).json({
          success: true,
          insertedCount: inserted,
          message: `${inserted} holidays inserted, some duplicates were skipped`,
        });
      }
      throw bulkErr;
    }
  } catch (err) {
    console.error("addBulkHolidays error:", err);
    res.status(500).json({ success: false, message: "Bulk insert failed" });
  }
};

exports.getHolidays = async (req, res) => {
  try {
    const { year, fromMonth, toMonth } = req.query;
    const query = year ? { date: { $regex: `^${year}-` } } : {};

    const holidays = await Holiday.find(query).sort({ date: 1 }).lean();
    res.json({ success: true, data: holidays });
  } catch (err) {
    console.error("getHolidays error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch holidays" });
  }
};

/* ═══════════════════════════════════════════════
   PERMISSION REQUEST (SECURED)
═══════════════════════════════════════════════ */

exports.submitInformPermission = async (req, res) => {
  try {
    const { from, to, reason, type, informedVia, permissionType } = req.body;
    const employeeId = normalizeObjectId(req.user._id);

    if (!from || !to || !reason) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    // Validate permissionType if provided
    const VALID_PERMISSION_TYPES = ["MORNING", "AFTERNOON", "EVENING"];
    if (permissionType && !VALID_PERMISSION_TYPES.includes(permissionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid permissionType. Must be MORNING, AFTERNOON, or EVENING",
      });
    }

    const permission = await PermissionRequest.create({
      employeeId,
      from: new Date(from),
      to: new Date(to),
      reason,
      status: "INFORMED",
      type: type || "CHECK_OUT",
      ...(permissionType && { permissionType }),
    });

    createLog({
      category: "permission",
      referenceId: permission._id,
      description: `${req.user?.name || "Employee"} submitted inform permission (${permissionType || type || "CHECK_OUT"}). Reason: ${reason}`,
    });

    return res.json({
      success: true,
      message: "Inform permission saved",
      data: permission,
    });
  } catch (error) {
    console.error("submitInformPermission", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.submitPermissionRequest = async (req, res) => {
  try {
    const employeeId = normalizeObjectId(req.user._id);

    const empIdString =
      req.user?.empIdString || req.user?.empId || req.user?.employeeId || null;

    const { fromDate, toDate, reason, type } = req.body;

    // 1. Mandatory Fields & Type Validation
    if (!fromDate || !toDate || !reason || !type) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!["CHECK_IN", "CHECK_OUT"].includes(type)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid permission type" });
    }

    // 2. Input Sanitization
    const sanitizedReason = String(reason)
      .replace(/<[^>]*>/g, "")
      .trim()
      .substring(0, 500);

    if (!sanitizedReason) {
      return res
        .status(400)
        .json({ success: false, message: "Valid reason text required" });
    }

    // 3. Timezone Normalization (Asia/Kolkata)
    const from = moment.tz(fromDate, "Asia/Kolkata");
    const to = moment.tz(toDate, "Asia/Kolkata");
    const now = moment().tz("Asia/Kolkata");

    if (!from.isValid() || !to.isValid()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid date/time format provided" });
    }

    // 4. Fundamental Constraints (Same Day, Office Hours, Range)
    if (to.isSameOrBefore(from)) {
      return res
        .status(400)
        .json({ success: false, message: "End time must be later than start time" });
    }

    if (!from.isSame(to, "day")) {
      return res.status(400).json({
        success: false,
        message: "Permission range must be restricted to a single day",
      });
    }

    const permissionMinutes = to.diff(from, "minutes");

    if (permissionMinutes > 120) {
      return res.status(400).json({
        success: false,
        message: "Maximum permission allowed is 2 hours",
      });
    }

    if (from.hour() < 7 || to.hour() >= 23) {
      return res.status(400).json({
        success: false,
        message: "Permission must be within office hours (7 AM – 11 PM)",
      });
    }

    // 5. Context-Aware Future/Past Validation
    const date = from.format("YYYY-MM-DD");
    const isToday = from.isSame(now, "day");

    if (!isWithinBackdateWindow(from.toDate())) {
      return res.status(400).json({
        success: false,
        message: "Permission can only be submitted for current date or last 3 days",
      });
    }

    if (type === "CHECK_IN") {
      const bufferNow = now.clone().add(15, "minutes");
      if (from.isAfter(bufferNow)) {
        return res.status(400).json({
          success: false,
          message: "Late-arrival (CHECK_IN) permission cannot be requested for a future time slot",
        });
      }
    } else {
      if (!isToday && from.isAfter(now)) {
        return res.status(400).json({
          success: false,
          message: "Proactive early-departure permissions are restricted to the current date only",
        });
      }
    }

    // 6. Attendance State Sync
    const attendance = await Attendance.findOne({ employeeId, date });

    if (type === "CHECK_OUT") {
      if (!attendance || !attendance.checkInTime) {
        return res.status(400).json({
          success: false,
          message: "Cannot request early-exit permission: No active check-in found for this day",
        });
      }
      // Check for an active session using checkIn1/checkOut1 or checkIn2/checkOut2
      const hasActiveSession =
        (attendance.checkIn1 && !attendance.checkOut1) ||
        (attendance.checkIn2 && !attendance.checkOut2);

      if (!hasActiveSession) {
        return res.status(400).json({
          success: false,
          message: "No active session found",
        });
      }
    }

    // 7. Overlap / Collision Detection
    const overlap = await PermissionRequest.findOne({
      employeeId,
      status: { $in: ["PENDING", "APPROVED"] },
      from: { $lt: to.toDate() },
      to: { $gt: from.toDate() },
    });

    if (overlap) {
      return res.status(400).json({
        success: false,
        message: "This time slot overlaps with an existing pending/approved permission request",
      });
    }

    // 8. Quota Management
    const todayStart = from.clone().startOf("day").toDate();
    const todayEnd = from.clone().endOf("day").toDate();

    const existingCount = await PermissionRequest.countDocuments({
      employeeId,
      from: { $gte: todayStart, $lte: todayEnd },
      status: { $in: ["PENDING", "APPROVED"] },
    });

    if (existingCount >= 2) {
      return res.status(400).json({
        success: false,
        message: "Maximum quota reached (2 permissions allowed per day)",
      });
    }

    // 9. Persist Request
    const permission = await PermissionRequest.create({
      employeeId,
      empIdString,
      employeeName: req.user?.name,
      from: from.toDate(),
      to: to.toDate(),
      reason: sanitizedReason,
      type,
      status: "PENDING",
      submittedIP: getClientIP(req),
    });

    createLog({
      category: "permission",
      referenceId: permission._id,
      description: `${req.user?.name || "Employee"} (${empIdString || "EMP"}) requested permission for ${date} (${from.format("hh:mm A")} - ${to.format("hh:mm A")}). Reason: ${sanitizedReason}`,
    });

    return res.json({
      success: true,
      message: "Permission request submitted for approval",
    });
  } catch (err) {
    console.error("submitPermissionRequest error:", err);
    res
      .status(500)
      .json({ success: false, message: "Internal server error while processing permission request" });
  }
};

exports.getgovHolidays = async (req, res) => {
  try {
    const { year, fromMonth, toMonth } = req.query;
    const query = year ? { date: { $regex: `^${year}-` } } : {};

    const holidays = await Holiday.find(query).sort({ date: 1 }).lean();

    res.json({
      success: true,
      count: holidays.length,
      data: holidays,
    });
  } catch (err) {
    console.error("getHolidays error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch holidays" });
  }
};

exports.updateGovHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date } = req.body;

    if (!name || !date) {
      return res.status(400).json({
        success: false,
        message: "Name and date are required",
      });
    }

    const updated = await Holiday.findByIdAndUpdate(
      id,
      { name, date },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found",
      });
    }

    res.json({
      success: true,
      message: "Holiday updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updateGovHoliday error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update holiday" });
  }
};

module.exports = apiLogger(module.exports, 'attendance.controller.js');
const moment = require("moment-timezone");
const Employee = require("../Models/Employee");
const Attendance = require("../Models/Attendance.model");
const LeaveRequest = require("../Models/LeaveRequest");
const PermissionRequest = require("../Models/PermissionRequest");

/**
 * Generates a real-time, read-only snapshot of the morning attendance situation.
 * 
 * Business Rules & Priorities:
 * 1. FULL-DAY LEAVE: Approved full-day leave
 * 2. HALF-DAY LEAVE: Approved morning half-day leave, or half-day leave not checked in
 * 3. MORNING PERMISSION: Approved or informed morning permission, not checked in yet
 * 4. CHECKED IN:
 *    - LATE if check-in time is after 10:00 AM IST (and no morning permission) or marked Late
 *    - PRESENT otherwise
 * 5. NOT CHECKED IN: Active employees with no check-in and no approved leave/permission
 * 
 * @param {Object} options - Optional parameters
 * @param {string} options.date - Target date string 'YYYY-MM-DD' (defaults to current date in IST)
 * @returns {Promise<Object>} Formatted morning attendance report
 */
async function generateMorningAttendanceReport({ date } = {}) {
  const targetMoment = date
    ? moment.tz(date, "YYYY-MM-DD", "Asia/Kolkata")
    : moment().tz("Asia/Kolkata");

  const dateStr = targetMoment.format("YYYY-MM-DD");
  const startOfDay = targetMoment.clone().startOf("day").toDate();
  const endOfDay = targetMoment.clone().endOf("day").toDate();
  const generatedAt = moment().tz("Asia/Kolkata").format();

  // 1. Fetch all active employees (excluding admins)
  const employees = await Employee.find({
    employmentStatus: "active",
    role: { $ne: "admin" },
    workingStatus: { $ne: false },
    isDeleted: { $ne: true },
  })
    .select("_id empId name dateJoined createdAt")
    .sort({ empId: 1, name: 1 })
    .lean();

  // Filter employees who joined on or before the target date
  const relevantEmployees = employees.filter((emp) => {
    const joining = emp.dateJoined || emp.createdAt;
    if (!joining) return true;
    const joiningMoment = moment(joining).tz("Asia/Kolkata").startOf("day");
    return joiningMoment.isSameOrBefore(targetMoment, "day");
  });

  if (relevantEmployees.length === 0) {
    return {
      date: dateStr,
      generatedAt,
      summary: {
        totalEmployees: 0,
        present: 0,
        late: 0,
        morningPermission: 0,
        fullDayLeave: 0,
        halfDayLeave: 0,
        notCheckedIn: 0,
      },
      employees: {
        present: [],
        late: [],
        morningPermission: [],
        fullDayLeave: [],
        halfDayLeave: [],
        notCheckedIn: [],
      },
    };
  }

  const employeeIds = relevantEmployees.map((e) => e._id);

  // 2. Fetch attendance, leaves, and permissions in parallel (Bulk query - 0 N+1 queries)
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

  // 3. Build fast lookup Maps
  const attendanceMap = new Map();
  attendances.forEach((att) => {
    if (att.employeeId) {
      attendanceMap.set(att.employeeId.toString(), att);
    }
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

  const permissionListMap = new Map();
  permissions.forEach((p) => {
    const eid = p.employeeId?.toString();
    if (!eid) return;
    if (!permissionListMap.has(eid)) {
      permissionListMap.set(eid, []);
    }
    permissionListMap.get(eid).push(p);
  });

  // 4. Containers for classification
  const present = [];
  const late = [];
  const morningPermission = [];
  const fullDayLeave = [];
  const halfDayLeave = [];
  const notCheckedIn = [];

  const classifiedSet = new Set();

  // 5. Classify each active employee exactly once
  for (const emp of relevantEmployees) {
    const eid = emp._id.toString();
    const att = attendanceMap.get(eid);
    const leave = leaveMap.get(eid);
    const empPermissions = permissionListMap.get(eid) || [];

    const hasCheckIn = Boolean(att && (att.checkInTime || att.checkIn1));
    const checkInTime = att?.checkIn1 || att?.checkInTime || null;

    // Check for applicable morning permission
    const morningPerm = empPermissions.find((p) => {
      if (p.permissionType === "MORNING" || p.type === "CHECK_IN") return true;
      if (p.from) {
        const fromHour = moment(p.from).tz("Asia/Kolkata").hour();
        return fromHour < 12;
      }
      return false;
    });

    const isFullDayLeave = Boolean(
      leave && leave.dayType !== "Half Day" && leave.noOfDays !== 0.5
    );

    const isHalfDayLeave = Boolean(
      leave && (leave.dayType === "Half Day" || leave.noOfDays === 0.5)
    );

    // ── PRIORITY 1: FULL-DAY APPROVED LEAVE ──
    if (isFullDayLeave) {
      fullDayLeave.push({
        empId: emp.empId || "-",
        name: emp.name,
        leaveType: leave.leaveType || "Full Day Leave",
        dayType: leave.dayType || "1 Day",
        reason: leave.detailedReason || leave.reasonType || leave.otherReason || "",
      });
      classifiedSet.add(eid);
      continue;
    }

    // ── PRIORITY 2: HALF-DAY APPROVED LEAVE ──
    if (isHalfDayLeave) {
      let isMorningHalfDay = true;
      if (leave.startTime) {
        const [h] = leave.startTime.split(":").map(Number);
        if (h >= 13) {
          isMorningHalfDay = false; // Afternoon half-day leave
        }
      }

      // If morning half-day leave or employee has not checked in, place in halfDayLeave
      if (isMorningHalfDay || !hasCheckIn) {
        halfDayLeave.push({
          empId: emp.empId || "-",
          name: emp.name,
          leaveType: leave.leaveType || "Half Day Leave",
          dayType: "Half Day",
          startTime: leave.startTime || "",
          endTime: leave.endTime || "",
          reason: leave.detailedReason || leave.reasonType || "",
        });
        classifiedSet.add(eid);
        continue;
      }
    }

    // ── PRIORITY 3: MORNING PERMISSION (Not checked in yet) ──
    if (morningPerm && !hasCheckIn) {
      morningPermission.push({
        empId: emp.empId || "-",
        name: emp.name,
        permissionType: morningPerm.permissionType || "MORNING",
        from: morningPerm.from,
        to: morningPerm.to,
        reason: morningPerm.reason || "",
        status: morningPerm.status || "APPROVED",
      });
      classifiedSet.add(eid);
      continue;
    }

    // ── PRIORITY 4: CHECKED IN (LATE vs PRESENT) ──
    if (hasCheckIn) {
      let isLate = false;
      const remarks = (att.remarks || "").toLowerCase();
      const checkInMoment = moment(checkInTime).tz("Asia/Kolkata");

      if (morningPerm) {
        // Morning permission excuses late check-in
        isLate = false;
      } else if (
        remarks.includes("late") ||
        (att.lateEntryReason && att.lateEntryReason.trim().length > 0) ||
        att.lateEntryCount > 0 ||
        checkInMoment.hour() > 10 ||
        (checkInMoment.hour() === 10 && checkInMoment.minute() > 0)
      ) {
        isLate = true;
      }

      if (isLate) {
        late.push({
          empId: emp.empId || "-",
          name: emp.name,
          checkInTime: checkInTime,
          lateEntryReason: att.lateEntryReason || "",
          remarks: att.remarks || "Late Entry",
        });
      } else {
        present.push({
          empId: emp.empId || "-",
          name: emp.name,
          checkInTime: checkInTime,
          remarks: att.remarks || "Present",
        });
      }
      classifiedSet.add(eid);
      continue;
    }

    // ── PRIORITY 5: NOT CHECKED IN ──
    notCheckedIn.push({
      empId: emp.empId || "-",
      name: emp.name,
    });
    classifiedSet.add(eid);
  }

  // 6. Count validation
  const totalEmployees = relevantEmployees.length;
  const categorizedCount =
    present.length +
    late.length +
    morningPermission.length +
    fullDayLeave.length +
    halfDayLeave.length +
    notCheckedIn.length;

  if (categorizedCount !== totalEmployees || classifiedSet.size !== totalEmployees) {
    console.error(
      `[MorningAttendanceReport] Discrepancy: total=${totalEmployees}, categorized=${categorizedCount}, unique=${classifiedSet.size}`
    );
    throw new Error(
      `Attendance report classification mismatch: total ${totalEmployees} vs categorized ${categorizedCount}`
    );
  }

  return {
    date: dateStr,
    generatedAt,
    summary: {
      totalEmployees,
      present: present.length,
      late: late.length,
      morningPermission: morningPermission.length,
      fullDayLeave: fullDayLeave.length,
      halfDayLeave: halfDayLeave.length,
      notCheckedIn: notCheckedIn.length,
    },
    employees: {
      present,
      late,
      morningPermission,
      fullDayLeave,
      halfDayLeave,
      notCheckedIn,
    },
  };
}

module.exports = {
  generateMorningAttendanceReport,
};

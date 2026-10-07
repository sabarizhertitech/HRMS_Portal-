const moment = require("moment-timezone");
const Attendance = require("../Models/Attendance.model");
const Holiday = require("../Models/Holiday.model");
const mongoose = require("mongoose");
const LeaveRequest = require("../Models/LeaveRequest");

async function calculateMonthlyAttendance({ employeeId, year, month }) {
  try {
    const m = Number(month);
    const y = Number(year);

    if (!employeeId || !y || !m || m < 1 || m > 12) {
      console.error("❌ Invalid input:", { employeeId, year, month });
      return emptyResponse();
    }

    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    const monthStr = String(m).padStart(2, "0");

    const start = moment.tz(`${y}-${monthStr}-01`, "Asia/Kolkata").startOf("month");
    const end = start.clone().endOf("month");
    const today = moment().tz("Asia/Kolkata").startOf("day");

    // ✅ Holidays
    const holidays = await Holiday.find({
      date: { $regex: `^${y}-${monthStr}-` },
    }).lean();

    const holidaySet = new Set(holidays.map((h) => h.date));

    // ✅ Attendance (SOURCE OF TRUTH)
    const attendances = await Attendance.find({
      employeeId: empObjectId,
      date: {
        $gte: start.format("YYYY-MM-DD"),
        $lte: end.format("YYYY-MM-DD"),
      },
    }).lean();

    const attMap = new Map(attendances.map((a) => [a.date, a]));

    // ✅ LEAVE FROM ATTENDANCE
    // const leaveDatesSet = new Set();

    // attendances.forEach((a) => {
    //   if (a.status === "Leave" || a.status === "Approved Leave") {
    //     leaveDatesSet.add(a.date);
    //   }
    // });


const leaveRequests = await LeaveRequest.find({
  employeeId: empObjectId,
  status: "Approved",
  fromDate: { $lte: end.toDate() },
  toDate: { $gte: start.toDate() },
}).lean();

const leaveMap = new Map();

leaveRequests.forEach((l) => {
  let current = moment(l.fromDate);
  const endDate = moment(l.toDate || l.fromDate);
  const isHalfDay = l.dayType === "Half Day" || l.noOfDays === 0.5;

  while (!current.isAfter(endDate, "day")) {
    leaveMap.set(current.format("YYYY-MM-DD"), { isHalfDay });
    current.add(1, "day");
  }
});

    let workingDays = 0;
    let completedWorkingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let permissionCount = 0;

    const numDays = end.date();

    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${y}-${monthStr}-${String(d).padStart(2, "0")}`;
      const date = moment.tz(dateStr, "Asia/Kolkata");

      const weekday = date.day();

      const isSunday = weekday === 0;
      const isSecondSaturday = weekday === 6 && Math.ceil(d / 7) === 2;
      const isFourthSaturday = weekday === 6 && Math.ceil(d / 7) === 4;
      const isHoliday = holidaySet.has(dateStr);
      const isFuture = date.isAfter(today, "day");

      const isWorkingDay =
        !isHoliday &&
        !isSunday &&
        !isSecondSaturday &&
        !isFourthSaturday;

      if (!isWorkingDay) continue;

      workingDays++;

      if (!isFuture) {
        completedWorkingDays++;

        const att = attMap.get(dateStr);
        const hasCheckIn = att && (att.checkInTime || att.checkIn1);

        // ✅ FINAL CORRECT PRIORITY
        if (leaveMap.has(dateStr)) {
          const { isHalfDay } = leaveMap.get(dateStr);
          if (isHalfDay) {
            leaveDays += 0.5;
            if (hasCheckIn) {
              presentDays += 0.5;
            } else {
              absentDays += 0.5;
            }
          } else {
            leaveDays += 1;
          }
        } else if (hasCheckIn) {
          presentDays++;

          if (att?.permission?.minutes > 0) {
            permissionCount++;
          }
        } else {
          absentDays++;
        }
      }
    }

    return {
      workingDays,
      presentDays,
      leaveDays,
      absentDays,
      permissions: permissionCount,
      completedWorkingDays,
    };

  } catch (err) {
    console.error("❌ calculateMonthlyAttendance error:", err);
    return emptyResponse();
  }
}

function emptyResponse() {
  return {
    workingDays: 0,
    presentDays: 0,
    leaveDays: 0,
    absentDays: 0,
    permissions: 0,
    completedWorkingDays: 0,
  };
}

module.exports = { calculateMonthlyAttendance };
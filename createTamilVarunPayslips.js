// createTamilVarunPayslips.js
require("dotenv").config();

const mongoose = require("mongoose");
const moment = require("moment-timezone");

const Employee = require("./Models/Employee");
const EmployeeDetails = require("./Models/EmployeeDetails");
const Attendance = require("./Models/Attendance.model");
const Holiday = require("./Models/Holiday.model");
const SalarySlip = require("./Models/SalarySlip");
const LeaveRequest = require("./Models/LeaveRequest");

const { uploadToS3 } = require("./utilities/s3Upload");
const getCachedSignedUrl = require("./utilities/s3CachedUrl");
const generatePayslipPdf = require("./utilities/generatePayslipPdf");
const payslipTemplate = require("./utilities/payslipTemplate");
const { decrypt } = require("./utilities/secureEncryption");
const numberToWords = require("./utilities/numberToWords");
const { MONGODB_URI } = require("./utilities/config");

const TZ = "Asia/Kolkata";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Target Employees Configuration
const TARGET_EMPLOYEES = [
  {
    id: "69ca753674465d0615335697",
    nameLabel: "Tamil",
    esiAmount: 150, // Fixed ESI for Tamil
  },
  {
    id: "69cbc0ef6e1ef87db28d2bba",
    nameLabel: "Varun",
    esiAmount: 113, // Fixed ESI for Varun
  }
];

// Target Period: April 2026 to August 2026
const TARGET_YEAR = 2026;
const TARGET_MONTHS = [4, 5, 6, 7, 8]; // 4: April, 5: May, 6: June, 7: July, 8: August

/* =========================================================
   HELPERS
========================================================= */

const getMonthRange = (month, year) => {
  const m = String(month).padStart(2, "0");
  const start = moment.tz(`${year}-${m}-01`, "YYYY-MM-DD", TZ).startOf("month");
  const end = start.clone().endOf("month");
  return { start, end };
};

const getLatestApplicableSalary = (salaryHistory = [], month, year) => {
  if (!salaryHistory.length) return null;
  const sorted = [...salaryHistory].sort((a, b) => new Date(b.fromDate) - new Date(a.fromDate));
  const m = String(month).padStart(2, "0");
  const startOfMonth = moment.tz(`${year}-${m}-01`, "YYYY-MM-DD", TZ).startOf("month").toDate();
  const endOfMonth = moment.tz(`${year}-${m}-01`, "YYYY-MM-DD", TZ).endOf("month").toDate();

  const applicable = sorted.find((row) => {
    const from = row.fromDate ? new Date(row.fromDate) : null;
    const to = row.toDate ? new Date(row.toDate) : null;
    if (!from) return false;
    if (from > endOfMonth) return false;
    if (to && to < startOfMonth) return false;
    return true;
  });

  return applicable || null;
};

const getLatestApplicableBank = (bankHistory = [], month, year) => {
  if (!bankHistory.length) return null;
  const sorted = [...bankHistory].sort((a, b) => new Date(b.fromDate) - new Date(a.fromDate));
  const m = String(month).padStart(2, "0");
  const startOfMonth = moment.tz(`${year}-${m}-01`, "YYYY-MM-DD", TZ).startOf("month").toDate();
  const endOfMonth = moment.tz(`${year}-${m}-01`, "YYYY-MM-DD", TZ).endOf("month").toDate();

  const applicable = sorted.find((row) => {
    const from = row.fromDate ? new Date(row.fromDate) : null;
    const to = row.toDate ? new Date(row.toDate) : null;
    if (!from) return false;
    if (from > endOfMonth) return false;
    if (to && to < startOfMonth) return false;
    return true;
  });

  return applicable || null;
};

const getAbsentCount = async (employeeId, actualStart, actualEnd) => {
  try {
    const startStr = moment(actualStart).format("YYYY-MM-DD");
    const endStr = moment(actualEnd).format("YYYY-MM-DD");
    const startDate = moment(actualStart).startOf("day").toDate();
    const endDate = moment(actualEnd).endOf("day").toDate();

    const m = moment(actualStart).month() + 1;
    const y = moment(actualStart).year();
    const monthStr = String(m).padStart(2, "0");

    const holidays = await Holiday.find({
      date: { $regex: `^${y}-${monthStr}-` }
    }).lean();
    const holidaySet = new Set(holidays.map((h) => h.date));

    const attendanceRecords = await Attendance.find({
      employeeId,
      date: { $gte: startStr, $lte: endStr }
    }).lean();
    const attMap = new Map(attendanceRecords.map((a) => [a.date, a]));

    const approvedLeaves = await LeaveRequest.find({
      employeeId,
      requestType: { $ne: "wfh" },
      status: { $regex: /^approved$/i },
      fromDate: { $lte: endDate },
      toDate: { $gte: startDate }
    }).lean();

    const leaveMap = new Map();
    approvedLeaves.forEach((l) => {
      let current = moment(l.fromDate);
      const lEnd = moment(l.toDate || l.fromDate);
      const isHalfDay = l.dayType === "Half Day" || l.noOfDays === 0.5;
      while (!current.isAfter(lEnd, "day")) {
        const dStr = current.format("YYYY-MM-DD");
        if (dStr >= startStr && dStr <= endStr) {
          leaveMap.set(dStr, { isHalfDay });
        }
        current.add(1, "day");
      }
    });

    let absentCount = 0;
    let curr = moment(actualStart).startOf("day");
    const last = moment(actualEnd).startOf("day");

    while (!curr.isAfter(last, "day")) {
      const dateStr = curr.format("YYYY-MM-DD");
      const d = curr.date();
      const weekday = curr.day();

      const isSunday = weekday === 0;
      const isSecondSaturday = weekday === 6 && Math.ceil(d / 7) === 2;
      const isFourthSaturday = weekday === 6 && Math.ceil(d / 7) === 4;
      const isHoliday = holidaySet.has(dateStr);

      const isWorkingDay = !isHoliday && !isSunday && !isSecondSaturday && !isFourthSaturday;

      if (isWorkingDay) {
        const att = attMap.get(dateStr);
        const hasCheckIn = att && (att.checkInTime || att.checkIn1 || /^(present)/i.test(att.status || ""));
        const isAttHalfDay = att && /^(half day)/i.test(att.status || "");

        if (leaveMap.has(dateStr)) {
          const { isHalfDay } = leaveMap.get(dateStr);
          if (isHalfDay) {
            absentCount += hasCheckIn ? 0.5 : 1;
          } else {
            absentCount += 1;
          }
        } else if (isAttHalfDay) {
          absentCount += hasCheckIn ? 0.5 : 1;
        } else if (!hasCheckIn || (att && /^(leave|on leave|approved leave|unpaid leave|lop|absent)/i.test(att.status || ""))) {
          absentCount += 1;
        }
      }

      curr.add(1, "day");
    }

    return absentCount;
  } catch (err) {
    console.error("getAbsentCount error:", err);
    return 0;
  }
};

const calculateProfessionalTax = (salary) => {
  const s = Number(salary || 0);
  if (s <= 3500) return 0;
  if (s <= 5000) return 22.5;
  if (s <= 7500) return 52.5;
  if (s <= 10000) return 115;
  if (s <= 12500) return 171;
  return 208;
};

/* =========================================================
   MAIN GENERATION FUNCTION
========================================================= */

async function createSalarySlips() {
  console.log("==================================================================");
  console.log("🚀 Starting Salary Slip Creation for Tamil & Varun (Apr-Aug 2026)");
  console.log("==================================================================");

  try {
    await mongoose.connect(MONGODB_URI, { maxPoolSize: 10 });
    console.log("✅ MongoDB Connected successfully");

    for (const target of TARGET_EMPLOYEES) {
      console.log(`\n--------------------------------------------------`);
      console.log(`👤 Processing Employee: ${target.nameLabel} (ID: ${target.id})`);
      console.log(`--------------------------------------------------`);

      const employee = await Employee.findById(target.id).lean();
      if (!employee) {
        console.error(`❌ Employee not found with ID: ${target.id}`);
        continue;
      }

      const details = await EmployeeDetails.findOne({ empId: employee._id }).lean();
      if (!details) {
        console.error(`❌ Employee details not found for ID: ${target.id}`);
        continue;
      }

      const empCode = employee.empId || details?.empIdString || target.id;
      console.log(`📋 Found: ${employee.name || details.name} (Code: ${empCode})`);

      for (const m of TARGET_MONTHS) {
        const monthName = monthNames[m - 1];
        console.log(`\n⏳ Generating Payslip for ${monthName} ${TARGET_YEAR}...`);

        const { start, end } = getMonthRange(m, TARGET_YEAR);
        const monthStart = start.toDate();
        const monthEnd = end.toDate();

        const doj = employee.dateJoined ? new Date(employee.dateJoined) : null;
        const relievedDate = employee.dateRelieved ? new Date(employee.dateRelieved) : null;

        const actualStart = doj && doj > monthStart ? doj : monthStart;
        const actualEnd = relievedDate && relievedDate < monthEnd ? relievedDate : monthEnd;

        const payPeriod = `${moment(actualStart).tz(TZ).format("DD.MM.YYYY")} to ${moment(actualEnd).tz(TZ).format("DD.MM.YYYY")}`;
        const workingDays = Math.floor((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
        const absentCount = await getAbsentCount(employee._id, actualStart, actualEnd);
        const presentDays = Math.max(0, workingDays - absentCount);

        const salaryRow = getLatestApplicableSalary(details.salaryHistory || [], m, TARGET_YEAR);
        if (!salaryRow) {
          console.error(`  ❌ No salary configured for ${monthName} ${TARGET_YEAR}. Skipping...`);
          continue;
        }

        const bankRow = getLatestApplicableBank(details.bankHistory || [], m, TARGET_YEAR);

        // Earnings calculation
        const basicSalary = Number(Number(salaryRow.basicSalary || 0).toFixed(2));
        const allowances = (salaryRow.allowances || []).map((a) => ({
          label: (a.label || a.name || "Allowance").trim(),
          amount: Number(Number(a.value ?? a.amount ?? 0).toFixed(2)),
        }));

        const earnings = [
          { label: "Basic Salary", amount: basicSalary },
          ...allowances
        ];

        const totalEarnings = Math.max(
          0,
          Number(earnings.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2))
        );

        // Deductions: ONLY PT + ESI (NO EPF/PF)
        const ptAmount = calculateProfessionalTax(totalEarnings); // ₹208
        const esiAmount = Number(target.esiAmount.toFixed(2));     // Tamil: ₹150, Varun: ₹113

        const deductions = [
          { label: "Professional Tax", amount: ptAmount },
          { label: "ESI", amount: esiAmount }
        ];

        const totalDeductions = Math.max(
          0,
          Number(deductions.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2))
        );

        const netPay = Math.max(0, Number((totalEarnings - totalDeductions).toFixed(2)));

        // Decrypt Bank Details
        let bankAccount = bankRow?.accountNumber || "-";
        try {
          if (bankAccount && bankAccount !== "-") {
            bankAccount = decrypt(bankAccount) || bankAccount;
          }
        } catch (e) {}

        // Decrypt PAN
        let panNumber = details.panNo || "-";
        try {
          if (panNumber && panNumber !== "-") {
            panNumber = decrypt(panNumber) || panNumber;
          }
        } catch (e) {}

        const payload = {
          empId: employee._id,
          month: m,
          year: TARGET_YEAR,
          monthName,
          employeeName: employee.name || details?.name || "-",
          empCode,
          designation: employee.designation || details?.designation || "-",
          department: employee.department || details?.department || "-",
          doj: employee.dateJoined || details?.dateJoined || null,
          bankName: bankRow?.bankName || "-",
          branchName: bankRow?.branch || "-",
          accountNumber: bankAccount,
          ifscCode: bankRow?.ifscCode || "-",
          accountHolder: bankRow?.accountHolder || employee.name || "-",
          panNo: panNumber,
          payPeriod,
          workingDays,
          presentDays,
          earnings,
          deductions,
          totalEarnings,
          totalDeductions,
          netPay,
          amountInWords: numberToWords(netPay || 0),
          generatedAt: new Date(),
          isLocked: true,
        };

        // Render HTML & Generate PDF
        const html = payslipTemplate(payload);
        const pdfBuffer = await generatePayslipPdf(html);

        // Upload to S3
        const s3Key = `SalarySlip/${empCode}/${TARGET_YEAR}/${m}.pdf`;
        await uploadToS3(pdfBuffer, s3Key, "application/pdf");
        const pdfUrl = await getCachedSignedUrl(s3Key);

        // Save or update in MongoDB
        const existingSlip = await SalarySlip.findOne({
          empId: employee._id,
          year: TARGET_YEAR,
          month: m,
        });

        let savedSlip;
        if (existingSlip) {
          savedSlip = await SalarySlip.findByIdAndUpdate(
            existingSlip._id,
            { ...payload, pdfUrl },
            { new: true }
          );
          console.log(`  🔄 Updated Slip ID: ${savedSlip._id}`);
        } else {
          savedSlip = await SalarySlip.create({
            ...payload,
            pdfUrl,
          });
          console.log(`  ✅ Created Slip ID: ${savedSlip._id}`);
        }

        console.log(`     Total Earnings : ₹${totalEarnings}`);
        console.log(`     Deductions     : PT ₹${ptAmount} + ESI ₹${esiAmount} = Total ₹${totalDeductions} (PF: ₹0)`);
        console.log(`     Net Pay        : ₹${netPay}`);
        console.log(`     PDF Key        : ${s3Key}`);
      }
    }

    console.log("\n==================================================================");
    console.log("🎉 All Salary Slips for Tamil & Varun (Apr-Aug 2026) Created Successfully!");
    console.log("==================================================================");
  } catch (error) {
    console.error("❌ Fatal Creation Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected. Done.");
    process.exit(0);
  }
}

if (require.main === module) {
  createSalarySlips();
}

module.exports = createSalarySlips;

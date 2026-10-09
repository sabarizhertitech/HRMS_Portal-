// deleteTamilVarunPayslips.js
require("dotenv").config();

const mongoose = require("mongoose");
const Employee = require("./Models/Employee");
const EmployeeDetails = require("./Models/EmployeeDetails");
const SalarySlip = require("./Models/SalarySlip");
const deleteFromS3 = require("./utilities/s3Delete");
const { MONGODB_URI } = require("./utilities/config");

// Target Employees Configuration
const TARGET_EMPLOYEES = [
  {
    id: "69ca753674465d0615335697",
    nameLabel: "Tamil",
  },
  {
    id: "69cbc0ef6e1ef87db28d2bba",
    nameLabel: "Varun",
  }
];

// Target Period: April 2026 to August 2026
const TARGET_YEAR = 2026;
const TARGET_MONTHS = [4, 5, 6, 7, 8]; // 4: April, 5: May, 6: June, 7: July, 8: August

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function deleteSalarySlips() {
  console.log("==================================================================");
  console.log("🗑️ Starting Salary Slip Deletion for Tamil & Varun (Apr-Aug 2026)");
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
      const empCode = employee.empId || details?.empIdString || target.id;
      console.log(`📋 Found: ${employee.name || details?.name} (Code: ${empCode})`);

      // Find all existing slips for April to August 2026
      const existingSlips = await SalarySlip.find({
        empId: employee._id,
        year: TARGET_YEAR,
        month: { $in: TARGET_MONTHS },
      });

      console.log(`🔍 Found ${existingSlips.length} existing salary slip(s) in DB for months ${TARGET_MONTHS.join(", ")} of ${TARGET_YEAR}.`);

      // Delete from S3 and MongoDB
      for (const slip of existingSlips) {
        const mName = monthNames[slip.month - 1] || slip.month;
        const s3Key = `SalarySlip/${empCode}/${slip.year}/${slip.month}.pdf`;

        // 1. Delete from S3 and Redis cache
        try {
          await deleteFromS3(s3Key);
          console.log(`  🗑️ Deleted S3 PDF & cache: ${s3Key}`);
        } catch (err) {
          console.warn(`  ⚠️ S3 deletion warning for ${s3Key}: ${err.message}`);
        }

        // 2. Delete record from MongoDB
        await SalarySlip.findByIdAndDelete(slip._id);
        console.log(`  🗑️ Deleted MongoDB record for ${mName} ${slip.year} (ID: ${slip._id})`);
      }

      // Also ensure any orphan S3 files for these target months are cleared
      for (const m of TARGET_MONTHS) {
        const directKey = `SalarySlip/${empCode}/${TARGET_YEAR}/${m}.pdf`;
        try {
          await deleteFromS3(directKey);
        } catch (err) {
          // Ignore if already deleted
        }
      }

      console.log(`✅ Completed deletion for ${target.nameLabel}.`);
    }

    console.log("\n==================================================================");
    console.log("🎉 Deletion completed for Tamil & Varun (April 2026 to August 2026)!");
    console.log("==================================================================");
  } catch (error) {
    console.error("❌ Fatal Deletion Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected. Done.");
    process.exit(0);
  }
}

if (require.main === module) {
  deleteSalarySlips();
}

module.exports = deleteSalarySlips;

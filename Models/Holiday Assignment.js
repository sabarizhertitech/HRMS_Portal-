
const mongoose = require("mongoose");

const holidayEntrySchema = new mongoose.Schema({
  date: { type: Number, required: true },
  name: { type: String, required: true }
});

const assignmentMonthSchema = new mongoose.Schema({
  month: { type: Number, required: true, min: 1, max: 12 },
  governmentHolidays: [holidayEntrySchema],
  specialDays: [holidayEntrySchema]
});

const holidayAssignmentSchema = new mongoose.Schema(
  {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      // ref intentionally omitted — controller uses explicit model: param in populate
      required: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      // ref intentionally omitted — controller uses explicit model: param in populate
      required: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId
      // ref intentionally omitted
    },
    year: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "submitted", "approved", "rejected"],
      default: "pending"
    },
    months: [assignmentMonthSchema],
    adminRemarks: {
      type: String,
      default: ""
    },
    assignedDate: {
      type: Date,
      default: Date.now
    },
    submittedDate: {
      type: Date
    },
    reviewedDate: {
      type: Date
    },
    summary: {
      totalGovHolidays: { type: Number, default: 0 },
      totalSpecialDays: { type: Number, default: 0 },
      monthsCompleted: { type: Number, default: 0 }
    },
    isDismissed: {
      type: Boolean,
      default: false
    },
    dismissedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee"
      }
    ]
  },
  { timestamps: true }
);

// One assignment per employee per year
holidayAssignmentSchema.index(
  { assignedTo: 1, year: 1 },
  { unique: true }
);

// Auto-compute summary before save
holidayAssignmentSchema.pre("save", function (next) {
  let totalGov = 0;
  let totalSpecial = 0;
  let monthsWithData = 0;

  this.months.forEach(m => {
    const govCount  = (m.governmentHolidays || []).length;
    const specCount = (m.specialDays || []).length;
    totalGov     += govCount;
    totalSpecial += specCount;
    if (govCount + specCount > 0) monthsWithData++;
  });

  this.summary = {
    totalGovHolidays: totalGov,
    totalSpecialDays: totalSpecial,
    monthsCompleted: monthsWithData
  };

  next();
});

module.exports = mongoose.model("holidayAssignment", holidayAssignmentSchema);
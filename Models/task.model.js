const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    taskTitle: { type: String, required: true },
    taskDetails: { type: String, required: true },

    priority: {
      type: String,
      enum: ["Low", "Mid", "High"],
      default: "Mid",
    },

    startDate: { type: Date },
    dueDate: { type: Date },   // deadline
    endDate: { type: Date },   // actual completion date
    dueReminderSent: { type: Boolean, default: false },

    category: { type: String, default: "" },
    project: { type: String, default: "" },
    workType: { type: String, default: "" },
    pages: [{ type: String }],

    status: { type: String, default: "Assigned" },
    assignedStatus: { type: String, default: "Allocated" },
    rejectionReason: { type: String, default: "" },

    assignedMembers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
      default: undefined
    },

    memberStatuses: {
      type: [
        {
          employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
          assignedStatus: { type: String, default: "Allocated" },
          status: { type: String, default: "Assigned" },
          rejectionReason: { type: String, default: "" },
          startDate: { type: Date },
          endDate: { type: Date },
          updatedAt: { type: Date, default: Date.now },
        }
      ],
      default: undefined
    },

    documents: { type: [String], default: undefined },

    /* ─────────────────────────────────────────
       PHASES – Structured array of phase objects
    ───────────────────────────────────────── */
    phases: {
      type: [
        {
          phaseTitle: { type: String, default: "" },
          phaseDescription: { type: String, default: "" },
          phaseStatus: { type: String, default: "pending" },
          updateDate: { type: Date, default: Date.now },
          employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        }
      ],
      default: undefined
    },


    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    createdDate: {
      type: Date,
      default: Date.now,
    },
  }
);

module.exports = mongoose.model("Task", taskSchema);
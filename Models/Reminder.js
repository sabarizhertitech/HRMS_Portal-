const mongoose = require("mongoose");

const ReminderSchema = new mongoose.Schema(
  {
    // Creator of reminder
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },



    // Title
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    // Description
    details: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // Category
    category: {
      type: String,
      enum: ["Submission", "Meeting", "Work", "Other"],
      required: true,
    },

    customCategory: {
      type: String,
      trim: true,
    },

    // Actual event date (submission / meeting date)
    date: {
      type: Date,
      required: true,
      index: true,
    },

    eventTime: {
       type: String, // HH:mm
       required: true,
    },


    participants: {
      type: [
        {
          employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
          },
        },
      ],
      default: [],
    },

    notifications: {
      type: [
        {
          notifyAt: {
            type: Date,
            required: true,
            index: true,
          },
          isSent: {
            type: Boolean,
            default: false,
            index: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Reminder", ReminderSchema);

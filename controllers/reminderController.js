const Reminder = require("../Models/Reminder");
const Employee = require("../Models/Employee");
const moment = require("moment-timezone");
const generateSignedUrl = require("../utilities/s3SignedUrl");
const getCachedSignedUrl = require("../utilities/s3CachedUrl");

const reminderController = {
  async createReminder(req, res) {
    try {
      const employeeId = req.user?._id;
      const empId = req.user?.empId;
      const creatorEmail = req.user?.email;

      if (!employeeId || !empId || !creatorEmail) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        title,
        details,
        category,
        customCategory,
        eventDate,           // YYYY-MM-DD
        eventTime,           // e.g. "14:30" or "2:30 PM"
        notifications = [],
        participantIds = [],
      } = req.body;

      /* ---------------- VALIDATION ---------------- */
      if (!title || !category || !eventDate || !eventTime) {
        return res.status(400).json({
          success: false,
          message: "Title, category, eventDate and eventTime are required",
        });
      }

      if (category === "Other" && !customCategory) {
        return res.status(400).json({
          success: false,
          message: "Custom category is required for 'Other'",
        });
      }

      if (!Array.isArray(notifications) || notifications.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one notification is required",
        });
      }

      /* ---------------- NORMALIZE eventTime to "hh:mm A" ---------------- */
      let normalizedEventTime;
      try {
        // Try common formats people send from frontend
        const parsed = moment.tz(
          `${eventDate} ${eventTime}`,
          [
            "YYYY-MM-DD HH:mm",        // 2025-02-20 14:30
            "YYYY-MM-DD h:mm A",       // 2025-02-20 2:30 PM
            "YYYY-MM-DD hh:mm A",      // 2025-02-20 02:30 PM
            "YYYY-MM-DD h:mm",         // 2025-02-20 14:30 (no AM/PM)
            "YYYY-MM-DD hh:mm",        // 2025-02-20 02:30
          ],
          "Asia/Kolkata"
        );

        if (!parsed.isValid()) {
          throw new Error("Invalid event time");
        }

        normalizedEventTime = parsed.format("hh:mm A"); // → "02:30 PM"
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid eventTime format. Use HH:mm or h:mm A (e.g. 14:30 or 2:30 PM)",
        });
      }

      /* ---------------- PARSE NOTIFICATIONS ---------------- */
      const parsedNotifications = notifications.map((n) => {
        const notifyAt = moment.tz(
          `${n.date} ${n.time}`,
          "YYYY-MM-DD HH:mm",
          "Asia/Kolkata"
        );

        if (!notifyAt.isValid()) {
          throw new Error("Invalid notification time");
        }

        // Optional: you can still reject past notifications if desired
        // if (notifyAt.isSameOrBefore(moment())) {
        //   throw new Error("Notification time must be in the future");
        // }

        return {
          notifyAt: notifyAt.toDate(),
          isSent: false,
        };
      });

      /* ---------------- FETCH PARTICIPANTS ---------------- */
      let participants = [];

      if (participantIds.length > 0) {
        participants = participantIds.map((id) => ({
          employeeId: id,
        }));
      }

      /* ---------------- CREATE REMINDER ---------------- */
      const reminderDoc = await Reminder.create({
        employeeId,
        title,
        details,
        category,
        customCategory: category === "Other" ? customCategory : null,
        date: moment.utc(eventDate, "YYYY-MM-DD").toDate(),
        eventTime: normalizedEventTime,   // ← now always "hh:mm A"
        participants,
        notifications: parsedNotifications,
      });

      return res.status(201).json({
        success: true,
        message: `Reminder created successfully with ${notifications.length} notifications.`,
        data: reminderDoc,
      });
    } catch (error) {
      console.error("Create Reminder Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Server error",
      });
    }
  },

  /**
   * GET REMINDERS FOR CALENDAR
   * GET /users/get-reminders?month=MM&year=YYYY
   */
  async getReminders(req, res) {
    try {
      const userId = req.user?._id;
      const { month, year } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required",
        });
      }

      const paddedMonth = String(month).padStart(2, "0");

      const startDate = moment
        .utc(`${year}-${paddedMonth}-01`, "YYYY-MM-DD")
        .startOf("month")
        .toDate();

      const endDate = moment
        .utc(`${year}-${paddedMonth}-01`, "YYYY-MM-DD")
        .endOf("month")
        .toDate();

      const query = {
        date: { $gte: startDate, $lte: endDate },
        $or: [
          { employeeId: userId },               // creator
          { "participants.employeeId": userId }, // participant
        ],
      };

const reminders = await Reminder.find(query)
  .populate({
    path: "participants.employeeId",
    select: "name email designation photo",
  })
  .sort({ date: 1 })
  .lean();

const mapped = await Promise.all(
  reminders.map(async (r) => {
    const participants = await Promise.all(
      (r.participants || []).map(async (p) => {
        const emp = p.employeeId || {};

        let avatar = "/avatar.png";

        if (p.avatar) avatar = p.avatar;
        else if (emp.photo) avatar = await getCachedSignedUrl(emp.photo);

        return {
          avatar,
        };
      })
    );

    return {
      ...r,
      participants,
      time: r.eventTime || "--:--",
    };
  })
);

      return res.json({
        success: true,
        data: mapped,
      });
    } catch (error) {
      console.error("Get Reminders Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  /**
   * GET SINGLE REMINDER
   * GET /users/reminders/:id
   */
  async getReminderById(req, res) {
    try {
      const userId = req.user?._id;
      const reminderId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const reminderData = await Reminder.findOne({
        _id: reminderId,
        $or: [
          { employeeId: userId },
          { "participants.employeeId": userId },
        ],
      })
        .populate({
  path: "participants.employeeId",
  select: "name email designation photo",
})
        .lean();

      if (!reminderData) {
        return res.status(404).json({
          success: false,
          message: "Reminder not found",
        });
      }
// 🔥 normalize participants properly
const participants = await Promise.all(
  (reminderData.participants || []).map(async (p) => {
    const emp = p.employeeId || {};

    let avatar = "/avatar.png";

    // if avatar already stored
    if (p.avatar) {
      avatar = p.avatar;
    }
    // else generate from employee photo
    else if (emp.photo) {
      avatar = await getCachedSignedUrl(emp.photo);
    }

    return {
      name: emp.name || p.name || "-",
      email: emp.email || p.email || "-",
      designation: emp.designation || p.designation || "-",
      avatar,
    };
  })
);

return res.json({
  success: true,
  data: {
    _id: reminderData._id,
    title: reminderData.title,
    details: reminderData.details,
    category: reminderData.category,
    date: reminderData.date,
    time: reminderData.eventTime || "--:--",
    participants, // only clean participants
  },
});
    } catch (error) {
      console.error("Get Reminder By ID Error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  async searchEmployees(req, res) {
  try {
    const { query } = req.query;

    if (!query) {
  const employees = await Employee.find({ workingStatus: true })
    .limit(10)
    .select("_id name designation photo")
    .lean();

  const result = await Promise.all(
    employees.map(async (emp) => ({
      ...emp,
      avatar: emp.photo
        ? await getCachedSignedUrl(emp.photo)
        : "/avatar.png"
    }))
  );

  return res.json({ success: true, data: result });
}

    const employees = await Employee.find({
      workingStatus: true,
      name: { $regex: query, $options: "i" }
    })
      .limit(10)
      .select("_id name designation photo")
      .lean();

    const result = await Promise.all(
      employees.map(async (emp) => {
        let avatar = "/avatar.png";

        if (emp.photo) {
          avatar = await getCachedSignedUrl(emp.photo);
        }

        return {
          ...emp,
          avatar
        };
      })
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Search employee error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
},

/**
 * DELETE REMINDER
 * DELETE /users/reminders/:id
 */
async deleteReminder(req, res) {
  try {
    const userId = req.user?._id;
    const reminderId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const reminder = await Reminder.findOne({
      _id: reminderId,
      employeeId: userId, // only creator can delete
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: "Reminder not found or no permission",
      });
    }

    await Reminder.deleteOne({ _id: reminderId });

    return res.json({
      success: true,
      message: "Reminder deleted successfully",
    });
  } catch (error) {
    console.error("Delete Reminder Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
},
};

module.exports = reminderController;
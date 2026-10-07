const Employee = require("../Models/Employee");
const Notification = require("../Models/Notification");

exports.saveFcmToken = async (req, res) => {
  const { token } = req.body;
  const userId = req.user._id;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token is required",
    });
  }

  console.log("[FCM SAVE TOKEN REQUEST] body token length:", token.length, "starts with:", token.substring(0, 10), "userId:", userId);

  // Prevent saving a JWT token as an FCM token (common testing mistake)
  if (token.startsWith("ey") && token.split(".").length === 3) {
    console.warn(`[FCM] Rejected saving JWT token as FCM token for user: ${userId}`);
    return res.status(400).json({
      success: false,
      message: "Invalid FCM token: You are sending your JWT auth token instead of an FCM registration token.",
    });
  }

  try {
    // IMPORTANT:
    // Remove this token from every other employee.
    await Employee.updateMany(
      {
        _id: { $ne: userId },
        fcmTokens: token,
      },
      {
        $pull: {
          fcmTokens: token,
        },
      }
    );

    // Save the token only for the currently logged-in employee.
    await Employee.findByIdAndUpdate(
      userId,
      {
        $addToSet: {
          fcmTokens: token,
        },
      },
      {
        new: true,
      }
    );

    console.log(
      `[FCM] Token assigned to employee: ${userId}`
    );

    res.status(200).json({
      success: true,
      message: "FCM token saved successfully",
    });
  } catch (error) {
    console.error("Error saving FCM token:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ REMOVE FCM TOKEN (On logout)
exports.removeFcmToken = async (req, res) => {
  const { token } = req.body;
  const userId = req.user?._id;

  try {
    if (token) {
      // Remove this token anywhere in the DB so it is unlinked from every user
      await Employee.updateMany(
        { fcmTokens: token },
        {
          $pull: {
            fcmTokens: token,
          },
        }
      );
    } else if (userId) {
      await Employee.findByIdAndUpdate(userId, {
        $set: { fcmTokens: [] },
      });
    }

    console.log(`[FCM] Token removed successfully for user: ${userId || "unknown"}`);

    return res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    console.error("Error removing FCM token:", error);
    return res.status(500).json({
      success: false,
      message: "Server error removing FCM token",
    });
  }
};

// ✅ PURGE / RESET ALL STALE FCM TOKENS (Admin maintenance)
exports.cleanupAllTokens = async (req, res) => {
  try {
    const result = await Employee.updateMany(
      {},
      {
        $set: { fcmTokens: [] },
      }
    );

    console.log(`[FCM] Cleared FCM tokens for ${result.modifiedCount} employees.`);

    return res.status(200).json({
      success: true,
      message: `Cleared FCM tokens for ${result.modifiedCount} employee records.`,
    });
  } catch (error) {
    console.error("Error clearing stale FCM tokens:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during token cleanup",
    });
  }
};




// ✅ FETCH NOTIFICATIONS
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    // Only fetch notifications from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const query = {
      $or: [{ toEmployee: userId }],
      createdAt: { $gte: sevenDaysAgo },
    };

    if (userRole === "admin") {
      query.$or.push({ toAdmin: true });
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    // Count only unread from last 7 days — prevents all-time accumulation
    const unreadCount = await Notification.countDocuments({
      ...query,
      read: false,
    });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
    });

  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ✅ MARK AS READ (Auto-Delete from DB)
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const query = { _id: id };
    if (userRole === "admin") {
      query.$or = [{ toEmployee: userId }, { toAdmin: true }];
    } else {
      query.toEmployee = userId;
    }

    await Notification.deleteOne(query);

    res.status(200).json({ success: true, message: "Notification deleted automatically after seen" });
  } catch (error) {
    console.error("Error marking notification as read (deleting):", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ MARK ALL AS READ (Auto-Delete from DB)
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    const query = {};
    if (userRole === "admin") {
      query.$or = [{ toEmployee: userId }, { toAdmin: true }];
    } else {
      query.toEmployee = userId;
    }

    await Notification.deleteMany(query);

    res.status(200).json({ success: true, message: "All notifications deleted automatically" });
  } catch (error) {
    console.error("Error marking all as read (deleting):", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const { getMessaging } = require("../utilities/firebaseAdmin");

exports.testFcmNotification = async (req, res) => {
  try {
    const { token, title, body } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const message = {
      token,
      notification: {
        title: title || "FCM Test",
        body: body || "Test notification from HR Portal",
      },
      data: {
        test: "true",
        timestamp: String(Date.now()),
      },
      webpush: {
        notification: {
          title: title || "FCM Test",
          body: body || "Test notification from HR Portal",
          icon: "/HR portal logo.png",
          badge: "/HR portal logo.png",
          requireInteraction: true,
        },
      },
    };

    const response = await getMessaging().send(message);

    console.log("[FCM TEST] Sent:", response);

    return res.status(200).json({
      success: true,
      message: "FCM notification sent",
      messageId: response,
    });
  } catch (error) {
    console.error("[FCM TEST] Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
};


const apiLogger = require('../utils/apiLogger');
module.exports = apiLogger(module.exports, 'NotificationController.js');

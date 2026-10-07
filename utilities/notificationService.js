const { getMessaging } = require("./firebaseAdmin");
const Employee = require("../Models/Employee");

/**
 * @param {Array|String} userIds 
 * @param {String} title 
 * @param {String} body 
 * @param {Object} data 
 */
exports.sendPushNotification = async (userIds, title, body, data = {}) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];

  try {
    const timestamp = new Date().toISOString();
    console.log(`[PushService] [${timestamp}] Starting push to ${ids.length} user(s): "${title}"`);

    const employees = await Employee.find({ _id: { $in: ids } }).select("fcmTokens name");
    const tokens = [...new Set(employees.flatMap(emp => emp.fcmTokens || []))]; // Unique tokens only

    if (tokens.length === 0) {
      console.warn(`[PushService] [${timestamp}] No FCM tokens found for user(s): ${ids.join(", ")}`);
      return { success: 0, failure: 0 };
    }

    console.log(`[PushService] [${timestamp}] Found ${tokens.length} unique token(s) across ${employees.length} employee(s)`);

    const stringifiedData = Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = String(value);
      return acc;
    }, {});

    const baseMessage = {
      notification: { title, body },
      data: {
        ...stringifiedData,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "hr_portal_notifications",
          sound: "default",
          priority: "high",
          clickAction: "OPEN_APP",
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          title,
          body,
          icon: "/HR portal logo.png",
          badge: "/HR portal logo.png",
          tag: stringifiedData.ticketId || "hr-portal-notification",
          requireInteraction: true,
        },
        fcm_options: { link: "/" },
      },
    };

    const CHUNK_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;
    const tokensToRemove = [];

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const message = { ...baseMessage, tokens: chunk };

      console.log(`[PushService] [${timestamp}] Sending chunk of ${chunk.length} tokens...`);
      const messaging = getMessaging();
      const response = typeof messaging.sendEachForMulticast === 'function'
        ? await messaging.sendEachForMulticast(message)
        : await messaging.sendMulticast(message);
      
      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      console.log(`[PushService] [${timestamp}] Chunk result: ${response.successCount} success, ${response.failureCount} failure`);

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            console.warn(`[PushService] [${timestamp}] Token failure: ${errorCode}`);
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/mismatched-credential'
            ) {
              tokensToRemove.push(chunk[idx]);
            }
          }
        });
      }
    }

    if (tokensToRemove.length > 0) {
      console.log(`[PushService] [${timestamp}] Removing ${tokensToRemove.length} invalid tokens from DB`);
      await Employee.updateMany(
        { fcmTokens: { $in: tokensToRemove } },
        { $pull: { fcmTokens: { $in: tokensToRemove } } }
      );
    }

    if (totalSuccess > 0) {
      console.log(`[NOTIFICATION SUCCESS] [${timestamp}] Successfully sent "${title}" to ${totalSuccess} devices.`);
    }
    if (totalFailure > 0) {
      console.error(`[NOTIFICATION FAILED] [${timestamp}] Failed to send "${title}" to ${totalFailure} devices.`);
    }

    return { success: totalSuccess, failure: totalFailure };

  } catch (error) {
    console.error("[PushService] Push notification failed (non-fatal):", error.message);
    return { success: 0, failure: 0 };
  }
};


exports.notifyAdmins = async (title, body, data = {}) => {
  try {
    const admins = await Employee.find({ role: "admin" }).select("_id");
    const adminIds = admins.map(a => a._id);
    return await exports.sendPushNotification(adminIds, title, body, data);
  } catch (error) {
    console.error("[PushService] Error notifying admins:", error);
  }
};
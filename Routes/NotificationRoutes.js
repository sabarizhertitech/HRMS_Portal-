const express = require("express");
const router = express.Router();
const {
  saveFcmToken,
  removeFcmToken,
  cleanupAllTokens,
  getNotifications,
  markAsRead,
  markAllAsRead,
  testFcmNotification
} = require("../controllers/NotificationController");
const { authMiddleware, adminMiddleware } = require("../middleware/portalAuth");

router.post("/save-token", authMiddleware, saveFcmToken);
router.post("/remove-token", authMiddleware, removeFcmToken);
router.post("/cleanup-all-tokens", adminMiddleware, cleanupAllTokens);
router.get("/", authMiddleware, getNotifications);
router.put("/:id/read", authMiddleware, markAsRead);
router.put("/read-all", authMiddleware, markAllAsRead);
router.post(
  "/test-fcm",
  authMiddleware,
  testFcmNotification
);

module.exports = router;

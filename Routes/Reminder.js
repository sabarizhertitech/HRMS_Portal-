const express = require("express");
const portalAuth = require("../middleware/portalAuth");
const reminderController = require("../controllers/reminderController")
const sanitizeRequestData = require("../middleware/sanitizeRequestData");
const ReminderRoutes = express.Router();
ReminderRoutes.use(sanitizeRequestData)


/*================== REMINDER =================*/
ReminderRoutes.post("/reminders", portalAuth.authMiddleware, reminderController.createReminder);
ReminderRoutes.get("/get-reminders", portalAuth.authMiddleware, reminderController.getReminders);
ReminderRoutes.get("/reminders/:id",portalAuth.authMiddleware,reminderController.getReminderById);
ReminderRoutes.get("/search-employees",portalAuth.authMiddleware,reminderController.searchEmployees);
ReminderRoutes.delete("/reminders/:id", portalAuth.authMiddleware,reminderController.deleteReminder);


module.exports = ReminderRoutes;
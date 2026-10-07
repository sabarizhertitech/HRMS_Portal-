const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/holidayAssignmentController");
const { authMiddleware } = require("../middleware/portalAuth");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");

router.use(sanitizeRequestData);

router.post("/assign", authMiddleware, ctrl.assignCalendar);
router.get("/all", authMiddleware, ctrl.getAllAssignments);
router.put("/approve/:id", authMiddleware, ctrl.updateCalendarAssignment);
router.get("/preview-master/:year", authMiddleware, ctrl.previewMasterData);
router.post("/review/:id", authMiddleware, ctrl.reviewAssignment);
router.post("/reassign/:id", authMiddleware, ctrl.reassignCalendar);
router.delete("/delete/:id", authMiddleware, ctrl.deleteAssignment);
router.get("/my", authMiddleware, ctrl.getMyAssignments);
router.post("/save-month", authMiddleware, ctrl.saveMonth);
router.post("/submit", authMiddleware, ctrl.submitAssignment);
router.get("/today-special", authMiddleware, ctrl.getTodaySpecialDays);
router.get("/month-special", authMiddleware, ctrl.getMonthSpecialDays);
router.get("/detail/:id", authMiddleware, ctrl.getAssignmentDetail);
router.get("/unassigned-year-alert", authMiddleware, ctrl.getUnassignedYearAlert);
router.get("/hr-pending-alert", authMiddleware, ctrl.getHRPendingAlert);
router.post("/send-reminder", authMiddleware, ctrl.sendHRReminder);
router.post("/init-draft", authMiddleware, ctrl.initDraft);
router.put("/:id/dismiss", authMiddleware, ctrl.dismissAssignmentNotification);
router.get("/approved/:employeeId/:year", authMiddleware, ctrl.getApprovedCalendar);

// ✅ Static routes BEFORE dynamic /:year (order matters)
router.get("/gov-holidays/years/available", authMiddleware, ctrl.getAvailableYears);
router.post("/gov-holidays", authMiddleware, ctrl.createGovernmentHoliday); // ✅ NEW POST route
router.post("/special-days", authMiddleware, ctrl.createSpecialDay); // ✅ NEW POST route
router.get("/gov-holidays/:year", authMiddleware, ctrl.getGovernmentHolidays);
router.put("/gov-holidays/:year", authMiddleware, ctrl.updateGovernmentHolidays); // ✅ NEW update route
router.get("/special-days/:year", authMiddleware, ctrl.getSpecialDays); // ✅ NEW
router.delete(
  "/gov-holiday/:id",
  authMiddleware,
  ctrl.deleteGovernmentHoliday
);
module.exports = router;
// routes/holidayRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/holidayController");
const { authMiddleware } = require("../middleware/portalAuth");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");

router.use(sanitizeRequestData);
// Get full year data
router.get("/get-yearly/:year",  authMiddleware,ctrl.getYearlyHolidays);

// Save full year (all 12 months at once)
router.post("/save-yearly", authMiddleware, ctrl.saveYearlyHolidays);

// ✅ NEW: Save single month (month-wise save)
router.post("/save-month",  authMiddleware,ctrl.saveMonthHolidays);

// Add single holiday/special day
router.post("/add-single",  authMiddleware,ctrl.addSingleHoliday);

// Remove single holiday/special day
router.post("/remove-single",  authMiddleware,ctrl.removeSingleHoliday);

// Clear month data
router.post("/clear-month", authMiddleware, ctrl.clearMonth);


module.exports = router;
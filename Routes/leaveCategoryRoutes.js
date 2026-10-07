const express = require("express");
const router = express.Router();
const leaveCategoryController = require("../controllers/leaveCategoryController");
const portalAuth = require("../middleware/portalAuth");

router.get("/unassigned-year-alert", portalAuth.adminMiddleware, leaveCategoryController.getUnassignedYearAlert);
router.get("/hr-pending-alert", portalAuth.authMiddleware, leaveCategoryController.getHRPendingAlert);
router.post("/send-reminder", portalAuth.adminMiddleware, leaveCategoryController.sendHRReminder);
router.post("/submit", portalAuth.authMiddleware, leaveCategoryController.submitToAdmin);
router.put("/approve", portalAuth.adminMiddleware, leaveCategoryController.approveYear);
router.post("/reject", portalAuth.adminMiddleware, leaveCategoryController.rejectYear);
router.post("/init-draft", portalAuth.authMiddleware, leaveCategoryController.initDraft);

router.get("/", portalAuth.authMiddleware, leaveCategoryController.getAllCategories);
router.get("/status", portalAuth.adminMiddleware, leaveCategoryController.getReviewStatus);
router.post("/", portalAuth.adminMiddleware, leaveCategoryController.createCategory);
router.put("/confirm", portalAuth.adminMiddleware, leaveCategoryController.confirmReviewStatus);
router.put("/:id", portalAuth.adminMiddleware, leaveCategoryController.updateCategory);
router.delete("/:id", portalAuth.adminMiddleware, leaveCategoryController.deleteCategory);

module.exports = router;

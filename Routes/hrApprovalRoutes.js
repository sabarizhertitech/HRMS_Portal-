const express = require("express");
const router = express.Router();
const hrApprovalController = require("../controllers/hrApprovalController");
const manageEmployeeController = require("../controllers/ManageEmployee.controller");
const { authMiddleware } = require("../middleware/portalAuth");

// HR Submissions & Approval Routes
router.post("/submit", authMiddleware, hrApprovalController.submitHrAction);
router.get("/requests", authMiddleware, hrApprovalController.getApprovalRequests);
router.get("/my-requests", authMiddleware, hrApprovalController.getMyRequests);
router.post("/approve/:id", authMiddleware, hrApprovalController.approveRequest);
router.post("/update-approve/:id", authMiddleware, hrApprovalController.updateAndApproveRequest);
router.post("/reject/:id", authMiddleware, hrApprovalController.rejectRequest);
router.put("/request/:id", authMiddleware, hrApprovalController.updatePendingRequest);
router.delete("/request/:id", authMiddleware, hrApprovalController.deletePendingRequest);
router.get("/logs", authMiddleware, hrApprovalController.getApprovalLogs);

// Single HR Assignment (Admin Only)
router.put("/assign-hr", authMiddleware, manageEmployeeController.setSingleHrRole);

module.exports = router;

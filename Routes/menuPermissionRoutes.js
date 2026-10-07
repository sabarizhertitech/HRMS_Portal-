const express = require("express");
const MenuPermissionController = require("../controllers/MenuPermissionController");
const portalAuth = require("../middleware/portalAuth");
const sanitizeRequestData = require("../middleware/sanitizeRequestData");

const router = express.Router();
router.use(sanitizeRequestData);

// Admin-only endpoints to manage permissions
router.get("/all", portalAuth.adminMiddleware, MenuPermissionController.getAllPermissions);
router.post("/save", portalAuth.adminMiddleware, MenuPermissionController.savePermission);
router.put("/update/:empId", portalAuth.adminMiddleware, MenuPermissionController.updatePermission);
router.delete("/delete/:empId", portalAuth.adminMiddleware, MenuPermissionController.deletePermission);

// Endpoint for any logged-in user to fetch all configured approver names
router.get("/approvers", portalAuth.authMiddleware, MenuPermissionController.getApprovers);

// Endpoint for any logged-in user to fetch their own (or targeted) permissions
router.get("/:empId", portalAuth.authMiddleware, MenuPermissionController.getPermission);

module.exports = router;

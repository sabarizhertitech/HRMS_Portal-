const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const SecurityWorkflow = require("../controllers/Securitycontroller");
const authMiddleware = require("../middleware/portalAuth"); // FIXED PATH

// FIXED USAGE
router.use(authMiddleware.authMiddleware);

router.post("/request", upload.array("files"), SecurityWorkflow.createRequest);
router.get("/requests", SecurityWorkflow.getRequests);
router.get("/pending-for-me", SecurityWorkflow.getPendingForMe);
router.get("/request/:id", SecurityWorkflow.getRequestById);
router.put("/request/:id", upload.array("files"), SecurityWorkflow.updateRequest);
router.post("/approve/:id", SecurityWorkflow.approveRequest);
router.post("/reject/:id", SecurityWorkflow.rejectRequest);

module.exports = router;
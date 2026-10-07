// routes/supportRoutes.js

const express = require("express");
const router = express.Router();

const SupportController = require("../controllers/SupportController");
const auth = require("../middleware/auth");

// All routes require x-api-key header
router.use(auth);


// GET /api/support/stats
router.get("/stats", SupportController.getStats);


router.get("/conversations", SupportController.getQueue);
router.get("/ticket-details/:id", SupportController.getQueueById);
router.put("/update-status/:id", SupportController.updateStatus);

// POST /api/support/send-reply/:id   → Send WhatsApp reply to customer
router.post("/send-reply/:id", SupportController.replyToCustomer);

module.exports = router;

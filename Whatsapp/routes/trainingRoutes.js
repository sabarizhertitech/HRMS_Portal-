// Whatsapp/routes/trainingRoutes.js
// API routes for the AI Training Review Dashboard

const express = require("express");
const router = express.Router();

const TrainingController = require("../controllers/TrainingController");
const auth = require("../middleware/auth");

// All training routes require x-api-key auth
router.use(auth);

// Dashboard stats overview
router.get("/stats", TrainingController.getStats);

// Q&A entry CRUD
router.get("/entries", TrainingController.getEntries);
router.post("/entries", TrainingController.createEntry);
router.put("/entries/:id", TrainingController.updateEntry);
router.delete("/entries/:id", TrainingController.deleteEntry);

// Review actions
router.put("/entries/:id/approve", TrainingController.approveEntry);
router.put("/entries/:id/quality", TrainingController.setQuality);

// Export raw conversations as seed data
router.post("/export-conversations", TrainingController.exportConversations);
router.get("/export-conversations", TrainingController.exportConversations);
router.post("/save-from-ticket/:ticketId", TrainingController.saveFromTicket);

module.exports = router;

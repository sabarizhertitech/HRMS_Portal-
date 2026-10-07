const express = require("express");
const router = express.Router();

const SupportTicketController = require("../controllers/SupportTicketController");
const auth = require("../middleware/auth");

// Secure all endpoints with API key validation
router.use(auth);

// Ticket endpoints
router.get("/", SupportTicketController.getTickets);
router.post("/", SupportTicketController.createTicket);
router.get("/:id", SupportTicketController.getTicketById);
router.patch("/:id/assign", SupportTicketController.assignTicket);
router.post("/:id/messages", SupportTicketController.sendReply);
router.patch("/:id/close", SupportTicketController.closeTicket);

module.exports = router;

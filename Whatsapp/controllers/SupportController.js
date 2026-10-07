// controllers/SupportController.js

const SupportTicket = require("../models/SupportTicket");
const SupportQueue = require("../models/SupportQueue");
const Conversation = require("../models/Conversation");
const Customer = require("../models/Customer");
const WhatsAppService = require("../services/WhatsAppService");

class SupportController {

    // ============================
    // GET /api/support/queue
    // List all support queries (filter by ?status=OPEN/ASSIGNED/CLOSED)
    // ============================
    async getQueue(req, res) {
        try {
            const { status } = req.query;
            const filter = {};

            if (status) {
                const validStatuses = ["OPEN", "ASSIGNED", "CLOSED"];
                const upperStatus = status.toUpperCase();
                if (!validStatuses.includes(upperStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid status. Use: OPEN, ASSIGNED, or CLOSED."
                    });
                }

                if (upperStatus === "OPEN") {
                    filter.status = { $in: ["OPEN", "PENDING", "IN_PROGRESS"] };
                } else if (upperStatus === "ASSIGNED") {
                    filter.status = "IN_PROGRESS";
                } else if (upperStatus === "CLOSED") {
                    filter.status = "CLOSED";
                }
            }

            const tickets = await SupportTicket.find(filter).sort({ updatedAt: -1 }).lean();

            const queue = await Promise.all(
                tickets.map(async (t) => {
                    const customer = await Customer.findOne({ customerId: t.customerId });
                    return {
                        _id: t._id,
                        phone: customer ? customer.mobileNumber : "",
                        customerName: customer ? customer.customerName : "Valued Customer",
                        serviceType: t.subject || "Support",
                        customerMessage: t.customerQuery,
                        status: t.status === "IN_PROGRESS" ? "ASSIGNED" : t.status,
                        assignedAgent: t.assignedTo,
                        createdAt: t.createdAt,
                        updatedAt: t.updatedAt
                    };
                })
            );

            return res.status(200).json({
                success: true,
                count: queue.length,
                queue
            });
        } catch (error) {
            console.error("Support Queue Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch support queue."
            });
        }
    }

    // ============================
    // GET /api/support/queue/:id
    // Get a single support ticket with full message + reply history
    // ============================
    async getQueueById(req, res) {
        try {
            const { id } = req.params;
            const ticket = await SupportTicket.findById(id).lean();

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Support ticket not found."
                });
            }

            const customer = await Customer.findOne({ customerId: ticket.customerId });
            const queueDoc = await SupportQueue.findOne({ ticketReference: ticket._id }).lean();

            const formattedTicket = {
                _id: ticket._id,
                phone: customer ? customer.mobileNumber : "",
                customerName: customer ? customer.customerName : "Valued Customer",
                serviceType: ticket.subject,
                customerMessage: ticket.customerQuery,
                status: ticket.status === "IN_PROGRESS" ? "ASSIGNED" : ticket.status,
                assignedAgent: ticket.assignedTo,
                messages: queueDoc ? queueDoc.messages.map(m => ({
                    sender: m.senderType === "SUPPORT" ? "support" : "user",
                    text: m.message,
                    whatsappMessageId: m.whatsappMessageId,
                    status: m.status,
                    sentAt: m.timestamp
                })) : [],
                createdAt: ticket.createdAt,
                updatedAt: ticket.updatedAt
            };

            return res.status(200).json({
                success: true,
                ticket: formattedTicket
            });
        } catch (error) {
            console.error("Get Ticket Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch ticket."
            });
        }
    }

    // ============================
    // POST /api/support/reply/:id
    // Support team replies to customer — sends WhatsApp message
    // ============================
    async replyToCustomer(req, res) {
        try {
            const { id } = req.params;
            const { message } = req.body;

            if (!message || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Reply message is required."
                });
            }

            const ticket = await SupportTicket.findById(id);

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Support ticket not found."
                });
            }

            if (ticket.status === "CLOSED") {
                return res.status(400).json({
                    success: false,
                    message: "Cannot reply to a CLOSED ticket. Reopen it first."
                });
            }

            const customer = await Customer.findOne({ customerId: ticket.customerId });
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer profile not found for this ticket."
                });
            }

            // Send WhatsApp message to customer via the bot's number
            const sendResult = await WhatsAppService.sendTextMessage(customer.mobileNumber, message.trim());
            const whatsappMessageId = sendResult?.messages?.[0]?.id || `msg-sent-${Date.now()}`;

            // Save reply in SupportQueue messages array (Permanent in MongoDB)
            await SupportQueue.updateOne(
                { ticketReference: ticket._id },
                {
                    $push: {
                        messages: {
                            senderType: "SUPPORT",
                            senderId: ticket.assignedTo || "Support Agent",
                            message: message.trim(),
                            whatsappMessageId,
                            status: "sent",
                            timestamp: new Date()
                        }
                    }
                }
            );

            // Save reply in Redis (2-Hour TTL)
            const RedisChatService = require("../services/RedisChatService");
            await RedisChatService.saveMessage(customer.mobileNumber, {
                sender: "support",
                text: message.trim(),
                whatsappMessageId,
                status: "sent",
                timestamp: new Date()
            });

            // Auto-update status: OPEN → ASSIGNED after first reply
            if (ticket.status === "OPEN" || ticket.status === "PENDING") {
                ticket.status = "IN_PROGRESS";
                ticket.aiStatus = "SUPPORT_ACTIVE";
                await ticket.save();

                await SupportQueue.updateOne(
                    { ticketReference: ticket._id },
                    { conversationState: "SUPPORT_ACTIVE" }
                );

                await Conversation.findByIdAndUpdate(ticket.conversationId, {
                    aiStatus: "SUPPORT_ACTIVE"
                });
            }

            const updatedTicket = await SupportTicket.findById(id).lean();
            const formattedTicket = {
                _id: updatedTicket._id,
                phone: customer.mobileNumber,
                customerName: customer.customerName,
                serviceType: updatedTicket.subject,
                customerMessage: updatedTicket.customerQuery,
                status: updatedTicket.status === "IN_PROGRESS" ? "ASSIGNED" : updatedTicket.status,
                assignedAgent: updatedTicket.assignedTo,
                createdAt: updatedTicket.createdAt,
                updatedAt: updatedTicket.updatedAt
            };

            return res.status(200).json({
                success: true,
                message: `✅ Reply sent to ${customer.mobileNumber} successfully via WhatsApp.`,
                ticket: formattedTicket
            });
        } catch (error) {
            console.error("Reply Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to send reply. Please check WhatsApp API credentials."
            });
        }
    }

    // ============================
    // PUT /api/support/queue/:id/status
    // Update ticket status: OPEN → ASSIGNED → CLOSED
    // ============================
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const validStatuses = ["OPEN", "ASSIGNED", "CLOSED"];

            if (!status || !validStatuses.includes(status.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    message: `Status must be one of: ${validStatuses.join(", ")}`
                });
            }

            const ticket = await SupportTicket.findById(id);

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Support ticket not found."
                });
            }

            const upperStatus = status.toUpperCase();

            if (upperStatus === "CLOSED") {
                ticket.status = "CLOSED";
                ticket.aiStatus = "AI_ACTIVE";
                ticket.closedAt = new Date();
                ticket.closedBy = "Support Agent";

                await SupportQueue.updateOne(
                    { ticketReference: ticket._id },
                    { conversationState: "CLOSED" }
                );

                await Conversation.findByIdAndUpdate(ticket.conversationId, {
                    isEscalated: false,
                    aiStatus: "AI_ACTIVE",
                    currentFlow: null,
                    currentStep: null
                });
            } else if (upperStatus === "ASSIGNED") {
                ticket.status = "IN_PROGRESS";
                ticket.aiStatus = "SUPPORT_ACTIVE";
                ticket.assignedAt = new Date();
                ticket.assignedTo = "Support Agent";

                await SupportQueue.updateOne(
                    { ticketReference: ticket._id },
                    { conversationState: "SUPPORT_ACTIVE" }
                );

                await Conversation.findByIdAndUpdate(ticket.conversationId, {
                    isEscalated: true,
                    aiStatus: "SUPPORT_ACTIVE"
                });
            } else {
                ticket.status = "OPEN";
                ticket.aiStatus = "SUPPORT_PENDING";
                ticket.assignedTo = null;
                ticket.assignedAt = null;

                await SupportQueue.updateOne(
                    { ticketReference: ticket._id },
                    { conversationState: "SUPPORT_PENDING" }
                );

                await Conversation.findByIdAndUpdate(ticket.conversationId, {
                    isEscalated: true,
                    aiStatus: "SUPPORT_PENDING"
                });
            }

            await ticket.save();

            const customer = await Customer.findOne({ customerId: ticket.customerId });
            const formattedTicket = {
                _id: ticket._id,
                phone: customer ? customer.mobileNumber : "",
                customerName: customer ? customer.customerName : "Valued Customer",
                serviceType: ticket.subject,
                customerMessage: ticket.customerQuery,
                status: ticket.status === "IN_PROGRESS" ? "ASSIGNED" : ticket.status,
                assignedAgent: ticket.assignedTo,
                createdAt: ticket.createdAt,
                updatedAt: ticket.updatedAt
            };

            return res.status(200).json({
                success: true,
                message: `Ticket status updated to ${upperStatus}.`,
                ticket: formattedTicket
            });
        } catch (error) {
            console.error("Update Status Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to update ticket status."
            });
        }
    }

    // ============================
    // GET /api/support/stats
    // Count of OPEN / ASSIGNED / CLOSED tickets
    // ============================
    async getStats(req, res) {
        try {
            const [openCount, pendingCount, inProgressCount, closedCount, totalCount] = await Promise.all([
                SupportTicket.countDocuments({ status: "OPEN" }),
                SupportTicket.countDocuments({ status: "PENDING" }),
                SupportTicket.countDocuments({ status: "IN_PROGRESS" }),
                SupportTicket.countDocuments({ status: "CLOSED" }),
                SupportTicket.countDocuments()
            ]);

            return res.status(200).json({
                success: true,
                stats: {
                    total: totalCount,
                    open: openCount + pendingCount,
                    assigned: inProgressCount,
                    closed: closedCount
                }
            });
        } catch (error) {
            console.error("Stats Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch stats."
            });
        }
    }
}

module.exports = new SupportController();

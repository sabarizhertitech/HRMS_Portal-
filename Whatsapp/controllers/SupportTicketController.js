const SupportTicket = require("../models/SupportTicket");
const SupportQueue = require("../models/SupportQueue");
const Conversation = require("../models/Conversation");
const Customer = require("../models/Customer");
const WhatsAppService = require("../services/WhatsAppService");

class SupportTicketController {

    // ============================
    // GET /api/support-tickets
    // List all support tickets with customer details dynamically populated
    // ============================
    async getTickets(req, res) {
        try {
            const { status } = req.query;
            const filter = {};
            if (status) {
                const upper = status.toUpperCase();
                if (upper === "OPEN") {
                    filter.status = { $in: ["OPEN", "PENDING", "IN_PROGRESS"] };
                } else {
                    filter.status = upper;
                }
            }

            const tickets = await SupportTicket.find(filter).sort({ updatedAt: -1 }).lean();

            // Populate customerName & customerPhone dynamically from Customer collection
            const populatedTickets = await Promise.all(
                tickets.map(async (t) => {
                    const customer = await Customer.findOne({ customerId: t.customerId });
                    return {
                        ...t,
                        customerName: customer ? customer.customerName : "Valued Customer",
                        customerPhone: customer ? customer.mobileNumber : ""
                    };
                })
            );

            return res.status(200).json({
                success: true,
                tickets: populatedTickets
            });
        } catch (error) {
            console.error("Get Tickets Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch support tickets."
            });
        }
    }

    // ============================
    // GET /api/support-tickets/:id
    // Fetch a single support ticket with details, customer data, and support queue messages
    // ============================
    async getTicketById(req, res) {
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
            const queue = await SupportQueue.findOne({ ticketReference: ticket._id }).lean();
            const conversation = await Conversation.findById(ticket.conversationId);
            const RedisChatService = require("../services/RedisChatService");

            // Construct expected unified conversation format for the frontend
            let formattedMessages = [];
            if (queue && queue.messages && queue.messages.length > 0) {
                formattedMessages = queue.messages.map(m => ({
                    sender: m.senderType === "SUPPORT" ? "support" : m.senderType === "AI" ? "bot" : "user",
                    text: m.message,
                    whatsappMessageId: m.whatsappMessageId,
                    status: m.status,
                    timestamp: m.timestamp
                }));
            } else if (customer && customer.mobileNumber) {
                // Fallback to active 2-hour Redis cache if SupportQueue has no messages yet
                const redisMessages = await RedisChatService.getMessages(customer.mobileNumber);
                formattedMessages = redisMessages.length > 0 ? redisMessages : (conversation ? conversation.messages : []);
            }

            return res.status(200).json({
                success: true,
                ticket: {
                    ...ticket,
                    customerName: customer ? customer.customerName : "Valued Customer",
                    customerPhone: customer ? customer.mobileNumber : ""
                },
                conversation: {
                    ...(conversation ? conversation.toObject() : {}),
                    messages: formattedMessages
                }
            });
        } catch (error) {
            console.error("Get Ticket Details Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch ticket details."
            });
        }
    }

    // ============================
    // POST /api/support-tickets
    // Create a support ticket manually (dashboard/fallback)
    // ============================
    async createTicket(req, res) {
        try {
            const { customerId, customerPhone, customerName, conversationId, subject, customerQuery } = req.body;

            if (!conversationId || !customerQuery) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required ticket parameters."
                });
            }

            // Look up or create Customer to avoid duplicate records
            let customerObj = null;
            if (customerId) {
                customerObj = await Customer.findOne({ customerId });
            }
            if (!customerObj && customerPhone) {
                const last10 = customerPhone.replace(/\D/g, "").slice(-10);
                customerObj = await Customer.findOne({ mobileNumber: { $regex: last10 + "$" } });
            }
            if (!customerObj) {
                customerObj = await Customer.create({
                    customerId: customerId || `CUST-${customerPhone || Date.now()}`,
                    customerName: customerName || "Valued Customer",
                    mobileNumber: customerPhone || "0000000000"
                });
            }

            const ticketId = `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            const ticket = await SupportTicket.create({
                ticketId,
                customerId: customerObj.customerId,
                conversationId,
                subject: subject || "Manual Support Ticket",
                customerQuery,
                status: "OPEN",
                aiStatus: "SUPPORT_PENDING"
            });

            // Create corresponding SupportQueue document for the ticket conversation
            await SupportQueue.create({
                ticketId,
                ticketReference: ticket._id,
                conversationId,
                conversationState: "SUPPORT_PENDING",
                messages: [{
                    senderType: "CUSTOMER",
                    message: customerQuery,
                    timestamp: new Date()
                }]
            });

            // Sync with conversation
            await Conversation.findByIdAndUpdate(conversationId, {
                aiStatus: "SUPPORT_PENDING",
                isEscalated: true
            });

            return res.status(201).json({
                success: true,
                message: "Support ticket created successfully.",
                ticket: {
                    ...ticket.toObject(),
                    customerName: customerObj.customerName,
                    customerPhone: customerObj.mobileNumber
                }
            });
        } catch (error) {
            console.error("Create Ticket Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to create support ticket."
            });
        }
    }

    // ============================
    // PATCH /api/support-tickets/:id/assign
    // Assign ticket to an agent (status -> IN_PROGRESS, aiStatus -> SUPPORT_ACTIVE)
    // ============================
    async assignTicket(req, res) {
        try {
            const { id } = req.params;
            const { agentId } = req.body;

            if (!agentId) {
                return res.status(400).json({
                    success: false,
                    message: "Agent ID is required to assign the ticket."
                });
            }

            // Atomic update to prevent race conditions
            const ticket = await SupportTicket.findOneAndUpdate(
                { _id: id, assignedTo: null },
                {
                    assignedTo: agentId,
                    assignedAt: new Date(),
                    status: "IN_PROGRESS",
                    aiStatus: "SUPPORT_ACTIVE"
                },
                { new: true }
            );

            if (!ticket) {
                const existing = await SupportTicket.findById(id);
                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "Support ticket not found."
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: `Ticket is already assigned to ${existing.assignedTo}.`
                });
            }

            // Update SupportQueue conversation state to SUPPORT_ACTIVE
            await SupportQueue.updateOne(
                { ticketReference: ticket._id },
                { conversationState: "SUPPORT_ACTIVE" }
            );

            // Sync the conversation to SUPPORT_ACTIVE state
            await Conversation.findByIdAndUpdate(ticket.conversationId, {
                aiStatus: "SUPPORT_ACTIVE",
                isEscalated: true
            });

            const customer = await Customer.findOne({ customerId: ticket.customerId });

            return res.status(200).json({
                success: true,
                message: `Ticket successfully assigned to ${agentId}.`,
                ticket: {
                    ...ticket.toObject(),
                    customerName: customer ? customer.customerName : "Valued Customer",
                    customerPhone: customer ? customer.mobileNumber : ""
                }
            });
        } catch (error) {
            console.error("Assign Ticket Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to assign support ticket."
            });
        }
    }

    // ============================
    // POST /api/support-tickets/:id/messages
    // Support agent replies to customer via WhatsApp (logged in SupportQueue)
    // ============================
    async sendReply(req, res) {
        try {
            const { id } = req.params;
            const { message, agentId } = req.body;

            if (!message || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Reply message content is required."
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
                    message: "Cannot reply to a closed ticket. Please reopen it first."
                });
            }

            // Get phone number from Customer schema
            const customer = await Customer.findOne({ customerId: ticket.customerId });
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer profile not found for this ticket."
                });
            }

            // Send WhatsApp message to the customer
            const sendResult = await WhatsAppService.sendTextMessage(customer.mobileNumber, message.trim());
            const whatsappMessageId = sendResult?.messages?.[0]?.id || `msg-sent-${Date.now()}`;

            // Auto-assign and set status to IN_PROGRESS on reply if currently OPEN/PENDING
            if (ticket.status === "OPEN" || ticket.status === "PENDING") {
                ticket.status = "IN_PROGRESS";
                ticket.aiStatus = "SUPPORT_ACTIVE";
                ticket.assignedTo = agentId || "Support Agent";
                ticket.assignedAt = new Date();
                await ticket.save();

                await SupportQueue.updateOne(
                    { ticketReference: ticket._id },
                    { conversationState: "SUPPORT_ACTIVE" }
                );

                await Conversation.findByIdAndUpdate(ticket.conversationId, {
                    aiStatus: "SUPPORT_ACTIVE",
                    isEscalated: true
                });
            }

            // Append response to the SupportQueue communications list (Permanent in MongoDB)
            await SupportQueue.updateOne(
                { ticketReference: ticket._id },
                {
                    $push: {
                        messages: {
                            senderType: "SUPPORT",
                            senderId: agentId || "Support Agent",
                            message: message.trim(),
                            whatsappMessageId,
                            status: "sent",
                            timestamp: new Date()
                        }
                    }
                }
            );

            // Save reply to Redis (2-Hour TTL) for active session memory
            const RedisChatService = require("../services/RedisChatService");
            await RedisChatService.saveMessage(customer.mobileNumber, {
                sender: "support",
                text: message.trim(),
                whatsappMessageId,
                status: "sent",
                timestamp: new Date()
            });

            return res.status(200).json({
                success: true,
                message: "Reply sent successfully.",
                ticket: {
                    ...ticket.toObject(),
                    customerName: customer.customerName,
                    customerPhone: customer.mobileNumber
                }
            });
        } catch (error) {
            console.error("Send Reply Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to send support reply via WhatsApp."
            });
        }
    }

    // ============================
    // PATCH /api/support-tickets/:id/close
    // Close the support ticket, set state to CLOSED in queue, reactivate AI
    // ============================
    async closeTicket(req, res) {
        try {
            const { id } = req.params;
            const { agentId } = req.body;

            const ticket = await SupportTicket.findByIdAndUpdate(
                id,
                {
                    status: "CLOSED",
                    aiStatus: "AI_ACTIVE",
                    closedAt: new Date(),
                    closedBy: agentId || "Support Agent"
                },
                { new: true }
            );

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Support ticket not found."
                });
            }

            // Close conversation state in SupportQueue
            await SupportQueue.updateOne(
                { ticketReference: ticket._id },
                { conversationState: "CLOSED" }
            );

            // Reactivate AI on conversation
            await Conversation.findByIdAndUpdate(ticket.conversationId, {
                aiStatus: "AI_ACTIVE",
                isEscalated: false,
                currentFlow: null,
                currentStep: null
            });

            const customer = await Customer.findOne({ customerId: ticket.customerId });

            return res.status(200).json({
                success: true,
                message: "Support ticket closed and AI chatbot reactivated successfully.",
                ticket: {
                    ...ticket.toObject(),
                    customerName: customer ? customer.customerName : "Valued Customer",
                    customerPhone: customer ? customer.mobileNumber : ""
                }
            });
        } catch (error) {
            console.error("Close Ticket Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to close support ticket."
            });
        }
    }
}

module.exports = new SupportTicketController();

const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const SupportTicketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        customerId: {
            type: String,
            required: true,
            index: true
        },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true
        },
        subject: {
            type: String,
            default: "Support Request"
        },
        customerQuery: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["OPEN", "PENDING", "IN_PROGRESS", "CLOSED"],
            default: "OPEN"
        },
        priority: {
            type: String,
            enum: ["LOW", "NORMAL", "HIGH"],
            default: "NORMAL"
        },
        assignedTo: {
            type: String
        },
        assignedAt: {
            type: Date
        },
        aiStatus: {
            type: String,
            enum: ["AI_ACTIVE", "SUPPORT_PENDING", "SUPPORT_ACTIVE", "CLOSED"],
            default: "SUPPORT_PENDING"
        },
        closedAt: {
            type: Date
        },
        closedBy: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("SupportTicket", SupportTicketSchema);

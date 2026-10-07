const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const SupportMessageSchema = new mongoose.Schema(
    {
        senderType: {
            type: String,
            enum: ["CUSTOMER", "AI", "SUPPORT"],
            required: true
        },
        senderId: {
            type: String
        },
        message: {
            type: String,
            required: true
        },
        messageType: {
            type: String,
            default: "text"
        },
        whatsappMessageId: {
            type: String
        },
        status: {
            type: String,
            enum: ["sent", "delivered", "read", "failed"],
            default: "sent"
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const SupportQueueSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            required: true,
            index: true
        },
        ticketReference: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupportTicket",
            required: true,
            index: true
        },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true
        },
        conversationState: {
            type: String,
            enum: ["SUPPORT_PENDING", "SUPPORT_ACTIVE", "CLOSED"],
            default: "SUPPORT_PENDING"
        },
        messages: [SupportMessageSchema]
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("SupportQueue", SupportQueueSchema);

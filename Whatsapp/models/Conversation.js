const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const MessageSchema = new mongoose.Schema(
    {
        sender: {
            type: String,
            enum: ["user", "bot", "support"],
            required: true
        },
        text: {
            type: String,
            required: true
        },
        intent: {
            type: String,
            default: "UNKNOWN"
        },
        aiConfidence: {
            type: Number,
            default: 1.0
        },
        aiAction: {
            type: String,
            default: null
        },
        whatsappMessageId: {
            type: String,
            default: null
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

const ConversationSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true,
            index: true
        },
        userId: {
            type: String,
            default: null
        },
        lastMessage: {
            type: String
        },
        lastIntent: {
            type: String
        },
        status: {
            type: String,
            enum: ["ACTIVE", "CLOSED"],
            default: "ACTIVE"
        },
        currentFlow: {
            type: String,
            default: null
        },
        currentStep: {
            type: String,
            default: null
        },
        isEscalated: {
            type: Boolean,
            default: false
            
        },
        aiStatus: {
            type: String,
            enum: ["AI_ACTIVE", "SUPPORT_PENDING", "SUPPORT_ACTIVE", "CLOSED"],
            default: "AI_ACTIVE"
        },
        assignedAgent: {
            type: String,
            default: null
        },
        messages: [MessageSchema]
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model(
    "Conversation",
    ConversationSchema
);
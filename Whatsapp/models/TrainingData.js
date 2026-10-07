// Whatsapp/models/TrainingData.js
// Knowledge Base — stores approved Q&A pairs used to train/guide the AI

const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const TrainingDataSchema = new mongoose.Schema(
    {
        // The customer question / input phrase
        question: {
            type: String,
            required: true,
            trim: true
        },

        // The ideal/correct answer the AI should give
        answer: {
            type: String,
            required: true,
            trim: true
        },

        // Which intent category this Q&A belongs to
        intent: {
            type: String,
            enum: [
                "GREETING",
                "PAYIN",
                "CONNECTED_BANKING",
                "MERCHANT_DASHBOARD",
                "KYC",
                "TRANSACTION_SUPPORT",
                "API_INTEGRATION",
                "PRICING",
                "SUPPORT",
                "GOODBYE",
                "UNKNOWN",
                "GENERAL"
            ],
            default: "GENERAL"
        },

        // Keywords to help with text search matching
        keywords: {
            type: [String],
            default: []
        },

        // Whether this entry is approved for use in live AI responses
        approved: {
            type: Boolean,
            default: false
        },

        // Quality flag set by support team
        quality: {
            type: String,
            enum: ["good", "bad", "pending"],
            default: "pending"
        },

        // Who created this entry: 'support_agent' | 'auto_export' | 'admin'
        source: {
            type: String,
            default: "support_agent"
        },

        // How many times this answer was actually served to a customer
        usageCount: {
            type: Number,
            default: 0
        },

        // Notes from the reviewer
        reviewNotes: {
            type: String,
            default: ""
        },

        // Agent ID who approved/reviewed this
        reviewedBy: {
            type: String,
            default: null
        },

        reviewedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Text index for fast similarity search
TrainingDataSchema.index(
    { question: "text", keywords: "text", answer: "text" },
    { weights: { question: 10, keywords: 5, answer: 1 } }
);

module.exports = chatbotDB.model("TrainingData", TrainingDataSchema);

const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const AnalyticsSchema = new mongoose.Schema(
    {
        totalConversations: {
            type: Number,
            default: 0
        },
        totalMessages: {
            type: Number,
            default: 0
        },
        aiResolvedConversations: {
            type: Number,
            default: 0
        },
        humanEscalations: {
            type: Number,
            default: 0
        },
        averageResponseTime: {
            type: Number,
            default: 0
        },
        mostAskedQuestions: [
            {
                type: String
            }
        ],
        mostCommonIntents: [
            {
                type: String
            }
        ],
        failedAIResponses: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("Analytics", AnalyticsSchema);

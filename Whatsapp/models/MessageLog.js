const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const MessageLogSchema = new mongoose.Schema(
    {
        whatsappMessageId: {
            type: String,
            required: true,
            unique: true
        },
        messageType: {
            type: String,
            enum: ["Text", "Image", "Document", "Audio"],
            required: true
        },
        messageStatus: {
            type: String,
            enum: ["Sent", "Delivered", "Read", "Failed"],
            required: true
        },
        mediaReference: {
            type: String,
            default: null
        },
        sender: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("MessageLog", MessageLogSchema);

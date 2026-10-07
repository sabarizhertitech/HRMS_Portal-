const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const TransactionSchema = new mongoose.Schema(
    {
        transactionId: {
            type: String,
            required: true,
            unique: true
        },
        customerId: {
            type: String,
            required: true
        },
        transactionType: {
            type: String,
            enum: ["Payin", "Payout", "BBPS", "UPI", "Refund"],
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        transactionStatus: {
            type: String,
            enum: ["SUCCESS", "PENDING", "FAILED"],
            required: true
        },
        transactionDate: {
            type: Date,
            default: Date.now
        },
        referenceId: {
            type: String
        },
        paymentMethod: {
            type: String
        },
        merchantName: {
            type: String
        },
        failureReason: {
            type: String,
            default: null
        },
        refundStatus: {
            type: String,
            enum: ["NA", "PENDING", "REFUNDED", "FAILED"],
            default: "NA"
        },
        settlementStatus: {
            type: String,
            enum: ["NA", "PENDING", "SETTLED"],
            default: "NA"
        }
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("Transaction", TransactionSchema);

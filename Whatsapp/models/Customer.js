const mongoose = require("mongoose");
const { chatbotDB } = require("../../utils/dbConnections");

const CustomerSchema = new mongoose.Schema(
    {
        customerName: {
            type: String,
            required: true
        },
        mobileNumber: {
            type: String,
            required: true
        },
        customerId: {
            type: String,
            required: true,
            unique: true
        },
        category: {
            type: String,
            default: "Customer"
        }
    },
    {
        timestamps: true
    }
);

module.exports = chatbotDB.model("Customer", CustomerSchema);

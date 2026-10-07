// utils/constants.js

module.exports = {
    INTENTS: {
        GREETING: "GREETING",
        THANKS: "THANKS",
        GOODBYE: "GOODBYE",
        PAYIN: "PAYIN",
        CONNECTED_BANKING: "CONNECTED_BANKING",
        MERCHANT_DASHBOARD: "MERCHANT_DASHBOARD",
        API_INTEGRATION: "API_INTEGRATION",
        KYC: "KYC",
        TRANSACTION_SUPPORT: "TRANSACTION_SUPPORT",
        PRICING: "PRICING",
        SUPPORT: "SUPPORT",
        UNKNOWN: "UNKNOWN"
    },
    CONVERSATION_STATUS: {
        ACTIVE: "ACTIVE",
        CLOSED: "CLOSED"
    },
    TRANSACTION_STATUS: {
        SUCCESS: "SUCCESS",
        PENDING: "PENDING",
        FAILED: "FAILED"
    },
    SUPPORT_STATUS: {
        OPEN: "OPEN",
        IN_PROGRESS: "IN_PROGRESS",
        RESOLVED: "RESOLVED",
        CLOSED: "CLOSED"
    },
    PRIORITIES: {
        LOW: "LOW",
        MEDIUM: "MEDIUM",
        HIGH: "HIGH",
        CRITICAL: "CRITICAL"
    }
};

// services/IntentService.js
// Updated: keyword-based detection (fast path) + AI classification fallback for UNKNOWN

const AIService = require("./AIService");

class IntentService {

    detectIntent(message, currentFlow) {

        try {

            const text = message?.trim()?.toLowerCase();

            if (!text) {
                return "UNKNOWN";
            }

            // Exit flow if user wants to go back to main menu
            if (text === "menu" || text === "back") {
                return "GREETING";
            }

            // Force TRANSACTION_SUPPORT if a Transaction ID or Reference UTR is present
            if (/\btxn[a-z0-9]+\b/i.test(text) || /\bref-[a-z]+-\d+\b/i.test(text)) {
                return "TRANSACTION_SUPPORT";
            }

            // If user enters a numeric option and we have an active flow, preserve that intent flow
            if (/^[1-9]$/.test(text) && currentFlow) {
                return currentFlow;
            }

            // Helper function to match full words/phrases using word boundaries (\b)
            const hasKeyword = (keywords) => {
                return keywords.some(keyword => {
                    // Escape special characters for regex safety
                    const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, "i");
                    return regex.test(text);
                });
            };

            // Number shortcuts from the main menu (when no current flow is active)
            if (!currentFlow) {
                if (text === "1") return "PAYIN";
                if (text === "2") return "CONNECTED_BANKING";
                if (text === "3") return "MERCHANT_DASHBOARD";
                if (text === "4") return "API_INTEGRATION";
                if (text === "5") return "KYC";
                if (text === "6") return "TRANSACTION_SUPPORT";
                if (text === "7") return "PRICING";
                if (text === "8") return "SUPPORT";
            }

            // ============================
            // Greeting
            // ============================

            const greetingKeywords = [
                "hi",
                "hai",
                "hii",
                "hello",
                "hey",
                "heyy",
                "good morning",
                "good afternoon",
                "good evening",
                "vanakkam",
                "namaste",
                "start",
                "help me"
            ];

            if (hasKeyword(greetingKeywords)) {
                return "GREETING";
            }

            // ============================
            // Thanks
            // ============================

            const thanksKeywords = [
                "thanks",
                "thank you",
                "thx"
            ];

            if (hasKeyword(thanksKeywords)) {
                return "THANKS";
            }

            // ============================
            // Goodbye
            // ============================

            const goodbyeKeywords = [
                "bye",
                "goodbye",
                "see you",
                "take care"
            ];

            if (hasKeyword(goodbyeKeywords)) {
                return "GOODBYE";
            }

            // ============================
            // Support
            // FIX: Removed broad "help" keyword — caused false positives
            // ============================

            const supportKeywords = [
                "support",
                "supprot",
                "suport",
                "support team",
                "supprot team",
                "suport team",
                "customer care",
                "agent",
                "executive",
                "talk to support",
                "contact support",
                "connect support",
                "human agent",
                "talk to human"
            ];

            if (hasKeyword(supportKeywords)) {
                return "SUPPORT";
            }

            // ============================
            // Transaction Support
            // FIX: Removed broad "status", "failed payment", "pending payment"
            // Use specific phrases only
            // ============================

            const transactionKeywords = [
                "transaction",
                "utr",
                "transaction status",
                "failed payout",
                "pending payout",
                "transaction id",
                "check transaction"
            ];

            if (hasKeyword(transactionKeywords)) {
                return "TRANSACTION_SUPPORT";
            }

            // ============================
            // PayIn
            // ============================

            const payInKeywords = [
                "payin",
                "pay in",
                "qr",
                "static qr",
                "dynamic qr",
                "collection",
                "settlement",
                "download qr",
                "failed payment",
                "payment status"
            ];

            if (hasKeyword(payInKeywords)) {
                return "PAYIN";
            }

            // ============================
            // Connected Banking
            // ============================

            const connectedBankingKeywords = [
                "connected banking",
                "balance",
                "account verification",
                "beneficiary",
                "beneficiary status",
                "neft",
                "rtgs",
                "upi payout"
            ];

            if (hasKeyword(connectedBankingKeywords)) {
                return "CONNECTED_BANKING";
            }

            // ============================
            // Merchant Dashboard
            // ============================

            const dashboardKeywords = [
                "dashboard",
                "merchant dashboard",
                "collection report",
                "settlement report",
                "transaction report",
                "download report"
            ];

            if (hasKeyword(dashboardKeywords)) {
                return "MERCHANT_DASHBOARD";
            }

            // ============================
            // API Integration
            // FIX: Removed "integration" — too broad, caused false positives
            // ============================

            const apiKeywords = [
                "api",
                "documentation",
                "api key",
                "sdk",
                "webhook",
                "sandbox",
                "api integration",
                "api status",
                "api documentation"
            ];

            if (hasKeyword(apiKeywords)) {
                return "API_INTEGRATION";
            }

            // ============================
            // KYC
            // ============================

            const kycKeywords = [
                "kyc",
                "aadhaar",
                "aadhar",
                "pan",
                "gst",
                "cin",
                "verification",
                "identity verification"
            ];

            if (hasKeyword(kycKeywords)) {
                return "KYC";
            }

            // ============================
            // Pricing
            // FIX: Removed "api" — conflicts with API_INTEGRATION
            // Use specific pricing phrases only
            // ============================

            const pricingKeywords = [
                "price",
                "pricing",
                "charges",
                "charge",
                "cost",
                "fees",
                "commission",
                "api pricing",
                "kyc pricing",
                "qr pricing"
            ];

            if (hasKeyword(pricingKeywords)) {
                return "PRICING";
            }

            // ============================
            // Unknown — keyword matching failed
            // AI fallback classification will be attempted in detectIntentWithAI()
            // ============================

            return "UNKNOWN";

        } catch (error) {
            return "UNKNOWN";
        }

    }

    /**
     * AI-powered intent classification using Groq (fast small model).
     * Call this AFTER detectIntent() returns UNKNOWN for better accuracy.
     *
     * @param {string} message - Customer's raw message text
     * @returns {Promise<string>} Intent string
     */
    async detectIntentWithAI(message) {
        try {
            return await AIService.classifyIntent(message);
        } catch (error) {
            console.error("[IntentService] detectIntentWithAI error:", error.message);
            return "UNKNOWN";
        }
    }

}

module.exports = new IntentService();
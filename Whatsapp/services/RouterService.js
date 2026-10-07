// services/RouterService.js
// Routes queries to AIService (with KnowledgeBase RAG + TrainingData) or specific service handlers

const AIService = require("./AIService");
const QuickReplyService = require("./QuickReplyService");
const PayInService = require("./PayInService");
const ConnectedBankingService = require("./ConnectedBankingService");
const MerchantDashboardService = require("./MerchantDashboardService");
const APIIntegrationService = require("./APIIntegrationService");
const KYCService = require("./KYCService");
const TransactionService = require("./TransactionService");
const PricingService = require("./PricingService");
const SupportService = require("./SupportService");

class RouterService {

    async route(intent, message, phone, currentFlow = null) {
        try {
            const text = message?.trim()?.toLowerCase() || "";
            const isSingleOption = /^[1-9]$/.test(text) || text === "menu";

            // If user typed a single number option (menu navigation), use specific service menu handlers
            if (isSingleOption) {
                // If user selected this category from the MAIN MENU (currentFlow was not this category),
                // pass "menu" so the service shows its category sub-menu options!
                const isSelectingCategoryFromMainMenu = !currentFlow || currentFlow !== intent;
                const serviceInput = isSelectingCategoryFromMainMenu ? "menu" : message;

                switch (intent) {
                    case "PAYIN":
                        return await PayInService.payIn(serviceInput, phone);
                    case "CONNECTED_BANKING":
                        return await ConnectedBankingService.connectedBanking(serviceInput, phone);
                    case "MERCHANT_DASHBOARD":
                        return await MerchantDashboardService.merchantDashboard(serviceInput, phone);
                    case "API_INTEGRATION":
                        return await APIIntegrationService.apiIntegration(serviceInput);
                    case "KYC":
                        return await KYCService.kyc(serviceInput);
                    case "TRANSACTION_SUPPORT":
                        return await TransactionService.transaction(serviceInput, phone);
                    case "PRICING":
                        return await PricingService.pricing(serviceInput);
                    case "SUPPORT":
                        return await SupportService.customerSupport(serviceInput, phone);
                }
            }

            // 1. Check direct Quick-Reply container (0 AI Tokens spent for greetings, thanks, farewells, contact info)
            const quickReply = QuickReplyService.getQuickReply(message, intent);
            if (quickReply) {
                return quickReply;
            }

            // 2. For all natural queries/questions (e.g. "my KYC verification failed", "how to generate QR", etc.)
            // Route to AIService so it uses the Knowledge Base & TrainingData (RAG) to return the exact trained answers!
            return await AIService.generateReply(message, phone, intent);

        } catch (error) {
            console.error("RouterService error:", error.message);
            return "Sorry, something went wrong. Please try again later.";
        }
    }

}

module.exports = new RouterService();
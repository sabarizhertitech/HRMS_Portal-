// services/AIService.js
// Enhanced with: conversation memory (Redis history) + Knowledge Base RAG injection

const groq = require("../config/groq");
const systemPrompt = require("../prompts/systemPrompt");
const RedisChatService = require("./RedisChatService");
const KnowledgeBaseService = require("./KnowledgeBaseService");

class AIService {

    /**
     * Generate a reply from Groq AI with full conversation memory and KB context.
     *
     * @param {string} userMessage - The current message from the customer
     * @param {string} phone       - Customer phone number (used to load Redis history)
     * @param {string} intent      - Detected intent (used to scope KB search)
     * @returns {Promise<string>} AI-generated reply
     */
    async generateReply(userMessage, phone = null, intent = "UNKNOWN") {
        // Use the available Groq model
        const modelName = process.env.GROQ_MODEL || "groq/compound-mini";

        try {
            // =============================
            // 1. Parallel Context Gathering (Redis History + Knowledge Base Match)
            // =============================
            const [history, kbMatch] = await Promise.all([
                phone ? RedisChatService.getMessages(phone).catch(() => []) : Promise.resolve([]),
                KnowledgeBaseService.findSimilarAnswer(userMessage, intent).catch(() => null)
            ]);

            // Take last 8 messages for context (optimal balance of memory and token speed)
            const historyMessages = (history || []).slice(-8).map(msg => ({
                role: msg.sender === "user" ? "user" : "assistant",
                content: msg.text
            }));

            let enrichedSystemPrompt = systemPrompt;
            if (kbMatch) {
                const contextBlock = KnowledgeBaseService.buildContextBlock(kbMatch);
                enrichedSystemPrompt = systemPrompt + "\n" + contextBlock;
                // Non-blocking usage record
                KnowledgeBaseService.recordUsage(kbMatch._id).catch(() => {});
            }

            // =============================
            // 2. Call Groq with optimized token limits
            // =============================
            const response = await groq.chat.completions.create({
                model: modelName,
                messages: [
                    { role: "system", content: enrichedSystemPrompt },
                    ...historyMessages,
                    { role: "user", content: userMessage }
                ],
                temperature: 0.2,
                max_completion_tokens: 300,
            });

            if (
                !response ||
                !response.choices ||
                !Array.isArray(response.choices) ||
                response.choices.length === 0
            ) {
                return "Sorry, I'm unable to process your request right now. Please try again later.";
            }

            const firstChoice = response.choices[0];

            if (
                !firstChoice.message ||
                !firstChoice.message.content ||
                !firstChoice.message.content.trim()
            ) {
                return "Sorry, I'm unable to process your request right now. Please try again later.";
            }

            let replyText = firstChoice.message.content.trim();
            // Remove any http/https links
            replyText = replyText.replace(/https?:\/\/[^\s)]+/gi, "").replace(/\s{2,}/g, " ").trim();

            return replyText;

        } catch (error) {
            console.error("[AIService] generateReply error:", error.message);
            return "Sorry, I'm unable to process your request right now. Please try again later.";
        }
    }

    /**
     * Lightweight AI-powered intent classification using a fast small model.
     * Used as a fallback when keyword-based detection returns UNKNOWN.
     *
     * @param {string} message - Customer's raw message
     * @returns {Promise<string>} One of the valid intent strings
     */
    async classifyIntent(message) {
        const VALID_INTENTS = [
            "GREETING", "PAYIN", "CONNECTED_BANKING", "MERCHANT_DASHBOARD",
            "KYC", "TRANSACTION_SUPPORT", "API_INTEGRATION", "PRICING",
            "SUPPORT", "GOODBYE", "THANKS", "UNKNOWN"
        ];

        try {
            const response = await groq.chat.completions.create({
                model: "groq/compound-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an intent classifier for ErtiPay customer support.
Classify the customer message into EXACTLY ONE of these intents:
GREETING, PAYIN, CONNECTED_BANKING, MERCHANT_DASHBOARD, KYC, TRANSACTION_SUPPORT, API_INTEGRATION, PRICING, SUPPORT, GOODBYE, THANKS, UNKNOWN

Reply with ONLY the intent word. No explanation. No punctuation.`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0,
                max_completion_tokens: 10,
            });

            const raw = response.choices?.[0]?.message?.content?.trim().toUpperCase();
            return VALID_INTENTS.includes(raw) ? raw : "UNKNOWN";

        } catch (error) {
            console.error("[AIService] classifyIntent error:", error.message);
            return "UNKNOWN";
        }
    }
}

module.exports = new AIService();
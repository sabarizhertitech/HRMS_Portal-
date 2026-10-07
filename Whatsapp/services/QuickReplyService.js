// services/QuickReplyService.js
// Handles common conversational messages (greetings, thanks, bye, bot identity, contact info)
// directly with zero AI token consumption.

class QuickReplyService {

    /**
     * Checks if the message matches standard quick patterns.
     * @param {string} rawMessage - User message
     * @param {string} intent - Detected intent
     * @returns {string|null} - Predefined response or null if AI should handle it
     */
    getQuickReply(rawMessage, intent = "UNKNOWN") {
        if (!rawMessage || typeof rawMessage !== "string") return null;

        const text = rawMessage.trim().toLowerCase().replace(/[^\w\s]/gi, "");
        const words = text.split(/\s+/).filter(Boolean);

        // ==========================================
        // 1. Greetings (Exact or simple phrase matches)
        // ==========================================
        const greetingWords = new Set([
            "hi", "hai", "hello", "hey", "helo", "hy", "hii", "hiii",
            "gm", "ga", "ge", "gn", "start", "menu", "help", "options"
        ]);

        const greetingPhrases = [
            "good morning", "good afternoon", "good evening", "good day",
            "namaste", "vanakkam", "howdy", "whats up", "what's up", "wassup"
        ];

        const isGreetingMatch =
            (words.length === 1 && greetingWords.has(words[0])) ||
            (words.length <= 3 && greetingPhrases.some(phrase => text === phrase || text.startsWith(phrase))) ||
            intent === "GREETING";

        // Exclude if it's a long sentence with specific questions (e.g. "hi, how can i integrate UPI api?")
        if (isGreetingMatch && words.length <= 4) {
            return (
                `👋 *Welcome to Eritpay Support!* 🚀\n\n` +
                `I am your virtual assistant. How can I help you today?\n\n` +
                `Please select an option or type your question:\n` +
                `1️⃣ *PayIn & QR Payments*\n` +
                `2️⃣ *Connected Banking*\n` +
                `3️⃣ *Merchant Dashboard*\n` +
                `4️⃣ *API Integration*\n` +
                `5️⃣ *KYC Verification*\n` +
                `6️⃣ *Transaction Status*\n` +
                `7️⃣ *Pricing & Charges*\n` +
                `8️⃣ *Talk to Human Support*`
            );
        }

        // ==========================================
        // 2. Gratitude / Thanks
        // ==========================================
        const thanksWords = new Set([
            "thanks", "thankyou", "thx", "tq", "ty"
        ]);

        const thanksPhrases = [
            "thank you", "thank u", "many thanks", "thanks a lot",
            "thank you so much", "thanks for help", "appreciate it"
        ];

        const isThanksMatch =
            (words.length === 1 && thanksWords.has(words[0])) ||
            thanksPhrases.some(phrase => text === phrase || text.startsWith(phrase));

        if (isThanksMatch && words.length <= 5) {
            return (
                `You're very welcome! 😊\n\n` +
                `Feel free to reach out anytime if you need more help with *Eritpay* services.`
            );
        }

        // ==========================================
        // 3. Closings / Farewells
        // ==========================================
        const byeWords = new Set([
            "bye", "goodbye", "cya", "tata", "exit", "quit"
        ]);

        const byePhrases = [
            "see you", "see you later", "have a nice day", "have a good day", "take care"
        ];

        const isByeMatch =
            (words.length === 1 && byeWords.has(words[0])) ||
            byePhrases.some(phrase => text === phrase || text.startsWith(phrase)) ||
            intent === "GOODBYE";

        if (isByeMatch && words.length <= 5) {
            return (
                `Goodbye! Have a great day ahead! 👋✨\n\n` +
                `Type *Hi* anytime you want to chat with us again.`
            );
        }

        // ==========================================
        // 4. Bot Identity / How Are You
        // ==========================================
        if (
            text === "who are you" ||
            text === "what are you" ||
            text === "are you a bot" ||
            text === "are you bot" ||
            text === "are you ai" ||
            text === "what is your name"
        ) {
            return (
                `🤖 I am the *Eritpay Virtual Assistant*!\n\n` +
                `I can assist you with payment collections, connected banking, merchant dashboards, API integrations, and KYC verification.\n\n` +
                `How can I assist you right now?`
            );
        }

        if (
            text === "how are you" ||
            text === "how r u" ||
            text === "how are you doing"
        ) {
            return (
                `I'm doing great and ready to assist you! 🚀\n\n` +
                `How can I help with your Eritpay account or services today?`
            );
        }

        // ==========================================
        // 5. Contact Details / Office Info
        // ==========================================
        if (
            text === "contact" ||
            text === "contact details" ||
            text === "contact us" ||
            text === "support email" ||
            text === "email" ||
            text === "helpline" ||
            text === "customer care"
        ) {
            return (
                `📞 *Eritpay Contact & Support:*\n\n` +
                `📧 *Email:* hello@ertitech.com\n` +
                `⏰ *Operating Hours:* Monday – Friday, 10:00 AM – 6:00 PM IST\n\n` +
                `You can also reply *8* or type *Support* to talk directly to a human representative.`
            );
        }

        // ==========================================
        // 6. Simple Acknowledgments
        // ==========================================
        const ackWords = new Set(["ok", "okay", "k", "got it", "understood", "noted", "fine", "alright", "sure"]);
        if (words.length <= 2 && ackWords.has(text)) {
            return `Got it! Let me know if you need help with anything else. 👍`;
        }

        // No quick reply match -> proceed to AI model
        return null;
    }
}

module.exports = new QuickReplyService();

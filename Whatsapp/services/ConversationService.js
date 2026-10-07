const AIService = require("./AIService");
const IntentService = require("./IntentService");
const RouterService = require("./RouterService");
const RedisChatService = require("./RedisChatService");

const Conversation = require("../models/Conversation");
const SupportTicket = require("../models/SupportTicket");
const SupportQueue = require("../models/SupportQueue");
const Customer = require("../models/Customer");

class ConversationService {

    async processMessage(message) {
        try {
            const phone = message?.from;
            const text = message?.text?.body?.trim();

            if (!text) {
                return "I can only process text messages right now.";
            }

            // Normalize input for fast yes/no/support matching
            const lowerText = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

            // ============================
            // 1. Parallel Initial Data Fetching
            // ============================
            const [existingConversation, existingCustomer] = await Promise.all([
                Conversation.findOne({ phone }).lean(),
                Customer.findOne({ mobileNumber: phone }).lean()
            ]);

            let conversation = existingConversation;
            if (!conversation) {
                conversation = await Conversation.create({
                    phone,
                    messages: [],
                    currentFlow: null,
                    currentStep: null,
                    isEscalated: false,
                    aiStatus: "AI_ACTIVE",
                    userId: `CUST-${phone}`
                });
            }

            let customer = existingCustomer;
            if (!customer) {
                const customerName = message?.profileName || "Valued Customer";
                const customerId = `CUST-${phone}`;
                customer = await Customer.create({ customerName, mobileNumber: phone, customerId });
            }

            // ============================
            // 2. Fast-Path Intent Detection
            // ============================
            const intent = IntentService.detectIntent(text, conversation?.currentFlow);
            console.log(`   ├─ Intent:  ${intent} (CurrentFlow: ${conversation?.currentFlow || "None"}, Step: ${conversation?.currentStep || "None"})`);

            // ============================
            // 3. Parallel Check for Active Support Ticket & Save User Message
            // ============================
            const [activeSupportTicket] = await Promise.all([
                SupportTicket.findOne({
                    customerId: customer.customerId,
                    status: { $in: ["OPEN", "PENDING", "IN_PROGRESS"] }
                }).sort({ createdAt: -1 }).lean(),
                RedisChatService.saveMessage(phone, {
                    sender: "user",
                    text,
                    intent,
                    timestamp: new Date()
                })
            ]);

            // If human support is actively handling, bot stays silent
            const isSupportActive = activeSupportTicket && (
                activeSupportTicket.status === "IN_PROGRESS" ||
                activeSupportTicket.aiStatus === "SUPPORT_ACTIVE"
            );

            if (isSupportActive) {
                console.log(`   └─ Decision: Support is actively handling -> Bot staying silent`);
                SupportQueue.updateOne(
                    { ticketReference: activeSupportTicket._id, conversationState: { $ne: "CLOSED" } },
                    { $push: { messages: { senderType: "CUSTOMER", message: text, timestamp: new Date() } } }
                ).catch(() => {});

                Conversation.updateOne({ phone }, { $set: { lastMessage: text } }).catch(() => {});
                return null;
            }

            // ============================
            // 4. Handle "YES" -> Support Escalation & "NO" -> Continue AI
            // ============================
            const isExplicitYes = /^(yes|y|yeah|yep|sure|ok connect|connect support|support team|human agent)$/i.test(lowerText);
            const isExplicitNo = /^(no|n|nope|not now|continue)$/i.test(lowerText);

            if (isExplicitYes && (conversation?.currentStep === "AWAITING_SUPPORT_CHOICE" || intent === "SUPPORT")) {
                const ticketId = `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                // Create Support Ticket in MongoDB
                const newTicket = await SupportTicket.create({
                    ticketId,
                    customerId: customer.customerId || `CUST-${phone}`,
                    conversationId: conversation._id,
                    subject: `Support request from ${customer.customerName || "Valued Customer"}`,
                    customerQuery: conversation?.lastMessage || text,
                    status: "OPEN",
                    aiStatus: "SUPPORT_PENDING"
                });

                // Create Support Queue item in MongoDB
                SupportQueue.create({
                    ticketId,
                    ticketReference: newTicket._id,
                    conversationId: conversation._id,
                    conversationState: "SUPPORT_PENDING",
                    messages: [{ senderType: "CUSTOMER", message: conversation?.lastMessage || text, timestamp: new Date() }]
                }).catch(() => {});

                // Update Conversation state in MongoDB
                Conversation.updateOne({ phone }, {
                    $set: { isEscalated: true, aiStatus: "SUPPORT_PENDING", currentStep: null, lastMessage: text, lastIntent: "SUPPORT" }
                }).catch(() => {});

                const ticketMsg =
                    `✅ Your request has been sent to our *Support Team*!\n\n` +
                    `A support representative will connect with you shortly.\n` +
                    `📧 Email: hello@ertitech.com\n\n` +
                    `⏰ Hours: Mon–Fri, 10 AM–6 PM IST`;

                RedisChatService.saveMessage(phone, { sender: "bot", text: ticketMsg, intent: "SUPPORT", timestamp: new Date() }).catch(() => {});
                return ticketMsg;
            }

            if (isExplicitNo && conversation?.currentStep === "AWAITING_SUPPORT_CHOICE") {
                Conversation.updateOne({ phone }, { $set: { currentStep: null, currentFlow: null, lastMessage: text } }).catch(() => {});

                const aiContinueMsg =
                    `Sure! I'm here to help.\n\n` +
                    `How can I assist you today? You can ask me about:\n` +
                    `1️⃣ PayIn & QR Payments\n` +
                    `2️⃣ Connected Banking\n` +
                    `3️⃣ Merchant Dashboard\n` +
                    `4️⃣ API Integration\n` +
                    `5️⃣ KYC Verification\n` +
                    `6️⃣ Transaction Status\n` +
                    `7️⃣ Pricing`;

                RedisChatService.saveMessage(phone, { sender: "bot", text: aiContinueMsg, intent: "GREETING", timestamp: new Date() }).catch(() => {});
                return aiContinueMsg;
            }

            // ============================
            // 5. Update Flow State & Handle Explicit SUPPORT Intent
            // ============================
            const menuFlows = ["PAYIN", "CONNECTED_BANKING", "MERCHANT_DASHBOARD", "KYC", "TRANSACTION_SUPPORT", "API_INTEGRATION", "PRICING"];
            let newFlow = conversation.currentFlow;
            let newStep = null; // Clear awaiting step when receiving a normal message

            if (menuFlows.includes(intent)) {
                newFlow = intent;
            } else if (["GREETING", "GOODBYE"].includes(intent)) {
                newFlow = null;
                newStep = null;
            }

            if (intent === "SUPPORT") {
                Conversation.updateOne({ phone }, {
                    $set: { currentStep: "AWAITING_SUPPORT_CHOICE", currentFlow: null, lastMessage: text, lastIntent: intent }
                }).catch(() => {});

                const choiceMessage =
                    `I understand you need assistance! 🙋\n\n` +
                    `Would you like to connect with our Support Team?\n\n` +
                    `Reply *Yes* to connect with support or *No* to continue chatting!`;

                RedisChatService.saveMessage(phone, { sender: "bot", text: choiceMessage, intent: "SUPPORT", timestamp: new Date() }).catch(() => {});
                return choiceMessage;
            }

            // ============================
            // 6. Direct Routing (Single AI Pass with Knowledge Base)
            // ============================
            const reply = await RouterService.route(intent, text, phone, conversation?.currentFlow);

            // Append clean Yes/No Support Option ONLY to natural AI / troubleshooting replies, NOT menu lists
            const isSingleMenuNumber = /^[1-9]$/.test(lowerText) || lowerText === "menu";
            const infoIntents = ["PAYIN", "CONNECTED_BANKING", "MERCHANT_DASHBOARD", "KYC", "TRANSACTION_SUPPORT", "API_INTEGRATION", "PRICING", "UNKNOWN", "GENERAL"];
            let finalReply = reply;

            if (
                !isSingleMenuNumber &&
                infoIntents.includes(intent) &&
                reply &&
                !reply.includes("Support Team") &&
                !reply.includes("Please choose an option")
            ) {
                finalReply = reply + `\n\n━━━━━━━━━━━━━━━━━━━━\n🙋 *Need to connect with our Support Team?*\nReply *Yes* to connect with support or *No* to continue chatting!`;
                newStep = "AWAITING_SUPPORT_CHOICE";
            } else if (
                finalReply &&
                (finalReply.includes("Need to connect with our Support Team") ||
                 finalReply.includes("Need our Support Team to assist"))
            ) {
                newStep = "AWAITING_SUPPORT_CHOICE";
            }

            // Background async save of conversation state & Redis
            Promise.all([
                RedisChatService.saveMessage(phone, { sender: "bot", text: finalReply, intent, timestamp: new Date() }),
                Conversation.updateOne({ phone }, { $set: { lastMessage: text, lastIntent: intent, currentFlow: newFlow, currentStep: newStep } })
            ]).catch(err => console.error("Async state update error:", err.message));

            return finalReply;

        } catch (error) {
            console.error("ConversationService Error:", error.message);
            return "Sorry, something went wrong. Please try again later.";
        }
    }
}

module.exports = new ConversationService();
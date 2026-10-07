const ConversationService = require("../services/ConversationService");
const WhatsAppService = require("../services/WhatsAppService");
const MessageLog = require("../models/MessageLog");
const Conversation = require("../models/Conversation");
const Customer = require("../models/Customer");

class WhatsAppController {

    async verifyWebhook(req, res) {
        try {
            const mode = req.query["hub.mode"];
            const token = req.query["hub.verify_token"];
            const challenge = req.query["hub.challenge"];

            if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
                return res.status(200).send(challenge);
            }

            return res.sendStatus(403);

        } catch (error) {
            return res.sendStatus(500);
        }
    }

    async receiveMessage(req, res) {
        try {
            const entry = req.body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const message = value?.messages?.[0];

            // ── Status Update (delivered / read / failed) ──
            const statusObj = value?.statuses?.[0];
            if (statusObj) {
                const msgId = statusObj.id;
                const newStatus = statusObj.status;
                const recipient = statusObj.recipient_id;

                
                try {
                    const capitalizedStatus = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);

                    await MessageLog.updateOne(
                        { whatsappMessageId: msgId },
                        { messageStatus: capitalizedStatus }
                    );

                    const Conversation = require("../models/Conversation");
                    await Conversation.updateOne(
                        { "messages.whatsappMessageId": msgId },
                        { $set: { "messages.$.status": newStatus } }
                    );

                    const SupportQueue = require("../models/SupportQueue");
                    await SupportQueue.updateOne(
                        { "messages.whatsappMessageId": msgId },
                        { $set: { "messages.$.status": newStatus } }
                    );
                } catch (statusErr) {
                    // silently handle status update error
                }

                return res.sendStatus(200);
            }

            // ── No message in payload ──
            if (!message) {
                return res.sendStatus(200);
            }

            // ── Extract contact name ──
            const contact = value?.contacts?.[0];
            if (contact?.profile?.name) {
                message.profileName = contact.profile.name;
            }

            const customerPhone = message.from;
            let messageText = message.text?.body;
            const messageType = message.type;

            // Support Meta interactive button taps and list menu selections
            if (messageType === "interactive") {
                messageText =
                    message.interactive?.button_reply?.title ||
                    message.interactive?.button_reply?.id ||
                    message.interactive?.list_reply?.title ||
                    message.interactive?.list_reply?.id ||
                    "";
            }

            const timestampIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            console.log(`\n======================================================`);
            console.log(`📩 [WHATSAPP INCOMING MESSAGE] [${timestampIST}]`);
            console.log(`   ├─ From:    ${customerPhone} (${message.profileName || "Unknown"})`);
            console.log(`   ├─ Type:    ${messageType}`);
            console.log(`   ├─ Msg ID:  ${message.id}`);
            console.log(`   ├─ Content: "${messageText || ""}"`);

            if ((messageType !== "text" && messageType !== "interactive") || !messageText) {
                console.log(`   └─ Action:  Ignored (non-text/non-interactive message)`);
                console.log(`======================================================\n`);
                return res.sendStatus(200);
            }

            // Normalise message object text body so downstream services receive string
            message.text = { body: messageText };

            // ── Log incoming message to DB asynchronously (non-blocking) ──
            const typeMap = { text: "Text", image: "Image", document: "Document", audio: "Audio" };
            const type = typeMap[messageType] || "Text";
            MessageLog.create({
                whatsappMessageId: message.id || `msg-recv-${Date.now()}`,
                messageType: type,
                messageStatus: "Read",
                sender: customerPhone,
                timestamp: new Date()
            }).catch(() => {});

            // ── Process through AI ──
            const aiReply = await ConversationService.processMessage(message);

            // ── Evaluate reply ──
            if (aiReply && aiReply.trim() !== "") {
                console.log(`   ├─ AI Reply: "${aiReply.replace(/\n/g, ' ')}"`);
                console.log(`   └─ Action:   Sending reply to ${customerPhone}`);
                console.log(`======================================================\n`);
                try {
                    await WhatsAppService.sendTextMessage(customerPhone, aiReply);
                } catch (sendErr) {
                    console.error("Failed to send AI reply:", sendErr.message);
                }
            } else {
                console.log(`   └─ Action:   Bot is silent (handled by support)`);
                console.log(`======================================================\n`);
            }

            return res.status(200).json({
                success: true,
                reply: aiReply || "Bot is silent (user is escalated to support)"
            });

        } catch (error) {
            console.error("Receive Message Error:", error.message);
            return res.sendStatus(500);
        }
    }

    // ============================
    // GET /api/whatsapp/logs
    // Query active 2-hour in-memory Redis messages & permanent MongoDB Support records
    // ============================
    async getLogs(req, res) {
        try {
            const { phone, startDate, endDate, sender, limit = 200 } = req.query;
            const RedisChatService = require("../services/RedisChatService");
            const SupportQueue = require("../models/SupportQueue");

            const results = [];
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;

            // 1. Fetch from Redis (Active 2-Hour In-Memory Chats)
            if (phone) {
                const redisMsgs = await RedisChatService.getMessages(phone);
                for (const msg of redisMsgs) {
                    const msgTime = new Date(msg.timestamp);
                    if (start && msgTime < start) continue;
                    if (end && msgTime > end) continue;
                    if (sender && msg.sender.toLowerCase() !== sender.toLowerCase()) continue;

                    results.push({
                        phone,
                        source: "REDIS_IN_MEMORY (2hr TTL)",
                        sender: msg.sender,
                        text: msg.text,
                        intent: msg.intent || "UNKNOWN",
                        status: msg.status || "sent",
                        timestamp: msg.timestamp,
                        timestampIST: new Date(msg.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                    });
                }
            } else {
                const activeChats = await RedisChatService.getAllActiveChats();
                for (const chat of activeChats) {
                    for (const msg of chat.messages) {
                        const msgTime = new Date(msg.timestamp);
                        if (start && msgTime < start) continue;
                        if (end && msgTime > end) continue;
                        if (sender && msg.sender.toLowerCase() !== sender.toLowerCase()) continue;

                        results.push({
                            phone: chat.phone,
                            source: "REDIS_IN_MEMORY (2hr TTL)",
                            ttlRemainingSeconds: chat.ttlRemainingSeconds,
                            sender: msg.sender,
                            text: msg.text,
                            intent: msg.intent || "UNKNOWN",
                            status: msg.status || "sent",
                            timestamp: msg.timestamp,
                            timestampIST: new Date(msg.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                        });
                    }
                }
            }

            // 2. Fetch from MongoDB SupportQueue (Permanent Support Audit Records)
            const supportQueues = await SupportQueue.find({}).lean();
            for (const sq of supportQueues) {
                const customer = await Customer.findOne({ customerId: sq.ticketId?.split("-")[1] }).lean();
                for (const m of sq.messages || []) {
                    const msgTime = new Date(m.timestamp);
                    if (start && msgTime < start) continue;
                    if (end && msgTime > end) continue;

                    const senderType = m.senderType === "SUPPORT" ? "support" : "user";
                    if (sender && senderType !== sender.toLowerCase()) continue;

                    results.push({
                        phone: customer ? customer.mobileNumber : sq.ticketId,
                        source: "MONGODB_SUPPORT_AUDIT (Permanent)",
                        ticketId: sq.ticketId,
                        sender: senderType,
                        text: m.message,
                        intent: "SUPPORT",
                        status: m.status || "sent",
                        timestamp: m.timestamp,
                        timestampIST: new Date(m.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                    });
                }
            }

            // Deduplicate by text + timestamp if both Redis and SupportQueue captured it
            const seen = new Set();
            const uniqueResults = [];
            for (const r of results) {
                const key = `${r.phone}_${r.text}_${new Date(r.timestamp).getTime()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueResults.push(r);
                }
            }

            // Sort newest first
            uniqueResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return res.status(200).json({
                success: true,
                count: uniqueResults.length,
                messages: uniqueResults.slice(0, parseInt(limit))
            });
        } catch (error) {
            console.error("Get Logs Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch message logs."
            });
        }
    }

}

module.exports = new WhatsAppController();
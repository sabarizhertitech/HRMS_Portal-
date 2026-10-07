// services/WhatsAppService.js

const axios = require("axios");
const MessageLog = require("../models/MessageLog");

class WhatsAppService {
    async sendTextMessage(to, message) {
        try {
            const timestampIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            console.log(`\n======================================================`);
            console.log(`📤 [WHATSAPP SENDING MESSAGE] [${timestampIST}]`);
            console.log(`   ├─ Recipient: ${to}`);
            console.log(`   ├─ Content:   "${message.replace(/\n/g, ' ')}"`);

            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
            const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
            const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

            if (!phoneNumberId || !token) {
                throw new Error("WHATSAPP_PHONE_NUMBER_ID (or PHONE_NUMBER_ID) and WHATSAPP_TOKEN are required in .env");
            }

            const response = await axios.post(
                `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to,
                    type: "text",
                    text: {
                        preview_url: false,
                        body: message,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            const msgId = response.data?.messages?.[0]?.id || `msg-sent-${Date.now()}`;
            console.log(`   ├─ Status:    ✅ Successfully Sent to Meta`);
            console.log(`   └─ MessageId: ${msgId}`);
            console.log(`======================================================\n`);

            // Log outgoing message to MessageLog DB
            try {
                await MessageLog.create({
                    whatsappMessageId: msgId,
                    messageType: "Text",
                    messageStatus: "Sent",
                    sender: to,
                    timestamp: new Date()
                });
            } catch (err) {
                // duplicate or log error
            }

            return response.data;
        } catch (error) {
            console.error(`❌ [WHATSAPP SEND ERROR] To: ${to} ->`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Send Quick Reply Buttons (Up to 3 buttons)
     * @param {string} to - Recipient phone
     * @param {string} bodyText - Message body text
     * @param {Array<{id: string, title: string}>} buttons - Array of buttons
     */
    async sendButtonMessage(to, bodyText, buttons = []) {
        try {
            const formattedButtons = buttons.slice(0, 3).map(btn => ({
                type: "reply",
                reply: {
                    id: btn.id || btn.title,
                    title: btn.title.slice(0, 20) // Meta max 20 chars
                }
            }));

            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
            const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
            const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

            const response = await axios.post(
                `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: bodyText },
                        action: { buttons: formattedButtons }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            return response.data;
        } catch (error) {
            console.error(`❌ [WHATSAPP BUTTON ERROR] Fallback to text ->`, error.response?.data || error.message);
            // Graceful fallback to text if button API fails
            return this.sendTextMessage(to, bodyText);
        }
    }
}

module.exports = new WhatsAppService();